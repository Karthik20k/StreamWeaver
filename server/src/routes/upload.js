'use strict';

const express = require('express');
const busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uploadConfig = require('../config/upload.config');
const { cleanupFile, ensureUploadDir } = require('../utils/cleanup');
const {
  progressStore,
  initProgress,
  finalizeProgress,
  pipeFileToDisk,
} = require('../utils/streamHandler');

const router = express.Router();

ensureUploadDir(uploadConfig.uploadDir).catch((err) => {
  console.error('[Startup] Could not create upload directory:', err.message);
  process.exit(1);
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateFileType(filename, mimeType) {
  const ext = path.extname(filename).toLowerCase();

  if (!uploadConfig.allowedExtensions.includes(ext)) {
    return (
      `File extension "${ext}" is not allowed. ` +
      `Accepted: ${uploadConfig.allowedExtensions.join(', ')}`
    );
  }

  if (!uploadConfig.allowedMimeTypes.includes(mimeType)) {
    return (
      `MIME type "${mimeType}" is not allowed. ` +
      `Accepted: ${uploadConfig.allowedMimeTypes.join(', ')}`
    );
  }

  return null;
}

function onceSender(res) {
  let sent = false;

  return {
    sendOnce(status, body) {
      if (sent) return;
      sent = true;
      res.status(status).json(body);
    },
    sent() {
      return sent;
    },
  };
}

router.post('/stream', (req, res) => {
  const contentLength = parseInt(
    req.headers['content-length'] || '0',
    10
  );

  const uploadId = crypto.randomUUID();
  const { sendOnce, sent } = onceSender(res);

  let bb;

  try {
    bb = busboy({
      headers: req.headers,
      highWaterMark: uploadConfig.busboy.highWaterMark,
      limits: uploadConfig.busboy.limits,
    });
  } catch (err) {
    return sendOnce(400, {
      error: 'Invalid multipart request',
      detail: err.message,
    });
  }

  let originalName = 'unknown';
  let mimeType = 'application/octet-stream';
  let diskFilePath = null;
  let fileReceived = false;

  let pipelineResolve;
  let pipelineReject;

  const pipelinePromise = new Promise((resolve, reject) => {
    pipelineResolve = resolve;
    pipelineReject = reject;
  });

  bb.on('file', (fieldname, fileStream, info) => {
    fileReceived = true;

    originalName = path
      .basename(info.filename || 'upload')
      .replace(/\\/g, '/');

    mimeType = info.mimeType || 'application/octet-stream';

    const typeError = validateFileType(originalName, mimeType);

    if (typeError) {
      fileStream.resume();

      pipelineReject(
        Object.assign(new Error(typeError), {
          code: 'INVALID_TYPE',
        })
      );

      return;
    }

    const ext =
      path
        .extname(originalName)
        .replace(/[^.a-zA-Z0-9]/g, '') || '';

    diskFilePath = path.join(
      uploadConfig.uploadDir,
      `${uploadId}${ext}`
    );

    console.log(
      `[Upload] START id=${uploadId} ` +
        `file="${originalName}" ` +
        `mime=${mimeType} ` +
        `dest="${diskFilePath}" ` +
        `contentLength=${contentLength || 'unknown'}`
    );

    initProgress(uploadId, {
      originalName,
      mimeType,
      contentLength,
      diskPath: diskFilePath,
    });

    fileStream.on('limit', () => {
      console.warn(
        `[Upload] FILE SIZE LIMIT EXCEEDED id=${uploadId}`
      );

      fileStream.resume();

      pipelineReject(
        Object.assign(
          new Error('File size limit exceeded'),
          {
            code: 'LIMIT_FILE_SIZE',
          }
        )
      );
    });

    pipeFileToDisk({
      fileStream,
      destPath: diskFilePath,
      uploadId,
      contentLength,
    })
      .then((result) => {
        pipelineResolve(result);
      })
      .catch((err) => {
        pipelineReject(err);
      });
  });

  bb.on('filesLimit', () => {
    pipelineReject(
      Object.assign(
        new Error('Only one file is allowed per upload'),
        {
          code: 'LIMIT_FILE_COUNT',
        }
      )
    );
  });

  bb.on('error', async (err) => {
    console.error(
      `[Upload] BUSBOY ERROR id=${uploadId}: ${err.message}`
    );

    finalizeProgress(
      uploadId,
      'error',
      err.message
    );

    await cleanupFile(diskFilePath);

    sendOnce(500, {
      error: 'Multipart parsing error',
      uploadId,
      detail: err.message,
    });
  });

  bb.on('finish', async () => {
    if (!fileReceived) {
      return sendOnce(400, {
        error: 'No file field found in multipart request',
        uploadId,
      });
    }

    try {
      const { bytesReceived } =
        await pipelinePromise;

      finalizeProgress(uploadId, 'done');

      sendOnce(200, {
        success: true,
        uploadId,
        originalName,
        mimeType,
        bytesReceived,
        contentLength:
          contentLength > 0
            ? contentLength
            : null,
        diskPath: diskFilePath,
        message:
          'File streamed to disk successfully',
      });
    } catch (err) {
      finalizeProgress(
        uploadId,
        'error',
        err.message
      );

      await cleanupFile(diskFilePath);

      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendOnce(413, {
          error:
            'File exceeds maximum allowed size (10 GB)',
          uploadId,
          detail: err.message,
        });
      }

      if (err.code === 'LIMIT_FILE_COUNT') {
        return sendOnce(400, {
          error:
            'Only one file is allowed per upload',
          uploadId,
        });
      }

      if (err.code === 'INVALID_TYPE') {
        return sendOnce(415, {
          error: 'Unsupported file type',
          uploadId,
          detail: err.message,
        });
      }

      sendOnce(500, {
        error: 'Stream pipeline failed',
        uploadId,
        detail: err.message,
      });
    }
  });

  async function handleDisconnect(reason) {
    if (sent()) return;

    const result = await Promise.race([
      pipelinePromise
        .then(() => 'done')
        .catch(() => 'error'),

      new Promise((resolve) => {
        setTimeout(
          () => resolve('timeout'),
          150
        );
      }),
    ]);

    if (result === 'done') return;

    console.warn(
      `[Upload] ${reason} id=${uploadId} ` +
        `(pipelineState=${result})`
    );

    finalizeProgress(
      uploadId,
      'error',
      `Client disconnected: ${reason}`
    );

    await cleanupFile(diskFilePath);
  }

  req.on('aborted', () => {
    handleDisconnect('CLIENT_ABORTED');
  });

  req.on('close', () => {
    handleDisconnect('CONNECTION_CLOSED');
  });

  req.pipe(bb);
});

router.get('/progress/:uploadId', (req, res) => {
  const { uploadId } = req.params;

  if (!UUID_RE.test(uploadId)) {
    return res.status(400).json({
      error: 'Invalid uploadId format',
    });
  }

  const entry = progressStore.get(uploadId);

  if (!entry) {
    return res.status(404).json({
      error:
        'Upload not found — it may have never started',
      uploadId,
    });
  }

  return res.json(entry);
});

router.get('/status/:uploadId', (req, res) => {
  const { uploadId } = req.params;

  if (!UUID_RE.test(uploadId)) {
    return res.status(400).json({
      error: 'Invalid uploadId format',
    });
  }

  const entry = progressStore.get(uploadId);

  if (entry && entry.status !== 'done') {
    return res.json({
      uploadId,
      exists: false,
      ready: false,
      status: entry.status,
      bytesReceived: entry.bytesReceived,
      message: 'Upload still in progress',
    });
  }

  let files;

  try {
    files = fs
      .readdirSync(uploadConfig.uploadDir)
      .filter((file) => file.startsWith(uploadId));
  } catch {
    files = [];
  }

  if (files.length === 0) {
    return res.status(404).json({
      error: 'Upload not found',
      uploadId,
    });
  }

  const filePath = path.join(
    uploadConfig.uploadDir,
    files[0]
  );

  const stat = fs.statSync(filePath);

  return res.json({
    uploadId,
    exists: true,
    ready: true,
    diskPath: filePath,
    diskBytes: stat.size,
    lastModified: stat.mtime,
  });
});

module.exports = router;