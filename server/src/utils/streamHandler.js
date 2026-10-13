'use strict';

const fs = require('fs');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const path = require('path');
const uploadConfig = require('../config/upload.config');

const progressStore = new Map();

function initProgress(uploadId, { originalName, mimeType, contentLength, diskPath }) {
  progressStore.set(uploadId, {
    uploadId,
    status: 'pending',
    originalName: originalName || 'unknown',
    mimeType: mimeType || 'application/octet-stream',
    bytesReceived: 0,
    contentLength: contentLength > 0 ? contentLength : null,
    percentComplete: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    diskPath: diskPath || null,
    errorMessage: null,
  });
}

function updateProgress(uploadId, patch) {
  const entry = progressStore.get(uploadId);
  if (!entry) return;
  Object.assign(entry, patch);
}

function finalizeProgress(uploadId, status, errorMessage) {
  updateProgress(uploadId, {
    status,
    finishedAt: new Date().toISOString(),
    errorMessage: errorMessage || null,
  });
}

function buildProgressTransform({ uploadId, contentLength, intervalBytes }) {
  const interval = intervalBytes ?? uploadConfig.progressIntervalBytes;
  let bytesReceived = 0;
  let lastReportedBucket = -1;

  const transform = new Transform({
    readableHighWaterMark: uploadConfig.busboy.highWaterMark,
    writableHighWaterMark: uploadConfig.busboy.highWaterMark,

    transform(chunk, _encoding, callback) {
      bytesReceived += chunk.length;

      const bucket = Math.floor(bytesReceived / interval);

      if (bucket > lastReportedBucket) {
        lastReportedBucket = bucket;

        const percentComplete =
          contentLength > 0
            ? parseFloat(((bytesReceived / contentLength) * 100).toFixed(1))
            : null;

        updateProgress(uploadId, { status: 'streaming', bytesReceived, percentComplete });

        transform.emit('progress', {
          uploadId,
          bytesReceived,
          contentLength: contentLength > 0 ? contentLength : null,
          percentComplete,
        });

        console.log(
          `[Upload] PROGRESS id=${uploadId} ` +
          `${(bytesReceived / 1024 / 1024).toFixed(1)} MB` +
          (percentComplete !== null ? ` (${percentComplete}%)` : '')
        );
      }

      this.push(chunk);
      callback();
    },

    flush(callback) {
      updateProgress(uploadId, { bytesReceived });
      callback();
    },
  });

  return transform;
}

async function pipeFileToDisk({ fileStream, destPath, uploadId, contentLength }) {
  const dir = path.dirname(destPath);
  await fs.promises.mkdir(dir, { recursive: true });

  const progressTransform = buildProgressTransform({ uploadId, contentLength });

  const writeStream = fs.createWriteStream(destPath, {
    highWaterMark: uploadConfig.writeStream.highWaterMark,
    flags: uploadConfig.writeStream.flags,
  });

  updateProgress(uploadId, { status: 'streaming', diskPath: destPath });

  try {
    await pipeline(fileStream, progressTransform, writeStream);

    const { bytesReceived } = progressStore.get(uploadId) ?? { bytesReceived: 0 };

    console.log(`[Upload] DONE id=${uploadId} bytes=${bytesReceived} path="${destPath}"`);

    return { bytesReceived };
  } catch (err) {
    console.error(`[Upload] PIPELINE ERROR id=${uploadId}: ${err.message}`);
    throw err;
  }
}

module.exports = {
  progressStore,
  initProgress,
  updateProgress,
  finalizeProgress,
  buildProgressTransform,
  pipeFileToDisk,
};
