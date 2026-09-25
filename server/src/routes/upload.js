const express = require('express');
const busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');

const router = express.Router();

const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'temp');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

router.post('/stream', (req, res) => {
  const contentLength = parseInt(
    req.headers['content-length'] || '0',
    10
  );

  let bb;

  try {
    bb = busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: 10 * 1024 * 1024 * 1024
      }
    });
  } catch (err) {
    return res.status(400).json({
      error: 'Invalid multipart request',
      detail: err.message
    });
  }

  const uploadId = crypto.randomUUID();

  let originalName = 'unknown';
  let mimeType = 'application/octet-stream';
  let bytesReceived = 0;
  let diskFilePath = null;
  let responded = false;

  function sendOnce(status, body) {
    if (responded) return;

    responded = true;
    res.status(status).json(body);
  }

  let pipelineResolve;
  let pipelineReject;

  const pipelinePromise = new Promise((resolve, reject) => {
    pipelineResolve = resolve;
    pipelineReject = reject;
  });

  bb.on('file', (fieldname, fileStream, info) => {
    originalName = info.filename || 'upload';
    mimeType = info.mimeType || 'application/octet-stream';

    const ext =
      path
        .extname(path.basename(originalName))
        .replace(/[^.a-zA-Z0-9]/g, '') || '';

    diskFilePath = path.join(
      UPLOAD_DIR,
      `${uploadId}${ext}`
    );

    console.log(
      `[Upload] START id=${uploadId} file="${originalName}" mime=${mimeType} dest="${diskFilePath}"`
    );

    const progressTransform = new Transform({
      transform(chunk, encoding, callback) {
        bytesReceived += chunk.length;

        if (bytesReceived % (5 * 1024 * 1024) < chunk.length) {
          const percentage =
            contentLength > 0
              ? ((bytesReceived / contentLength) * 100).toFixed(1)
              : '?';

          console.log(
            `[Upload] PROGRESS id=${uploadId} ${bytesReceived}B (${percentage}%)`
          );
        }

        this.push(chunk);
        callback();
      }
    });

    const writeStream = fs.createWriteStream(diskFilePath);

    pipeline(
      fileStream,
      progressTransform,
      writeStream
    )
      .then(() => {
        console.log(
          `[Upload] DONE id=${uploadId} bytes=${bytesReceived} path="${diskFilePath}"`
        );

        pipelineResolve({ success: true });
      })
      .catch((err) => {
        console.error(
          `[Upload] PIPELINE ERROR id=${uploadId}:`,
          err.message
        );

        pipelineReject(err);
      });

    fileStream.on('limit', () => {
      console.warn(
        `[Upload] FILE SIZE LIMIT EXCEEDED id=${uploadId}`
      );

      fileStream.resume();

      pipelineReject(
        Object.assign(
          new Error('File size limit exceeded'),
          { code: 'LIMIT_FILE_SIZE' }
        )
      );
    });
  });

  bb.on('finish', async () => {
    if (diskFilePath === null) {
      return sendOnce(400, {
        error: 'No file field found in multipart request',
        uploadId
      });
    }

    try {
      await pipelinePromise;

      sendOnce(200, {
        success: true,
        uploadId,
        originalName,
        mimeType,
        bytesReceived,
        contentLength: contentLength || null,
        path: diskFilePath,
        message: 'File streamed to disk successfully'
      });
    } catch (err) {
      safeUnlink(diskFilePath);

      if (err.code === 'LIMIT_FILE_SIZE') {
        sendOnce(413, {
          error: 'File exceeds maximum allowed size (10 GB)',
          uploadId
        });
      } else {
        sendOnce(500, {
          error: 'Stream pipeline failed',
          uploadId,
          detail: err.message
        });
      }
    }
  });

  bb.on('error', (err) => {
    console.error(
      `[Upload] BUSBOY ERROR id=${uploadId}:`,
      err.message
    );

    safeUnlink(diskFilePath);

    sendOnce(500, {
      error: 'Multipart parsing error',
      uploadId,
      detail: err.message
    });
  });

  async function handleDisconnect(reason) {
    const raceResult = await Promise.race([
      pipelinePromise
        .then(() => 'done')
        .catch(() => 'error'),

      new Promise((resolve) => {
        setTimeout(() => resolve('timeout'), 100);
      })
    ]);

    if (raceResult === 'done') {
      return;
    }

    console.warn(
      `[Upload] ${reason} id=${uploadId} raceResult=${raceResult}`
    );

    safeUnlink(diskFilePath);
  }

  req.on('aborted', () => {
    handleDisconnect('ABORTED by client');
  });

  req.on('close', () => {
    if (!responded) {
      handleDisconnect('CONNECTION CLOSED prematurely');
    }
  });

  req.pipe(bb);
});

router.get('/status/:uploadId', (req, res) => {
  const { uploadId } = req.params;

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!UUID_RE.test(uploadId)) {
    return res.status(400).json({
      error: 'Invalid uploadId format'
    });
  }

  const files = fs
    .readdirSync(UPLOAD_DIR)
    .filter((file) => file.startsWith(uploadId));

  if (files.length === 0) {
    return res.status(404).json({
      error: 'Upload not found',
      uploadId
    });
  }

  const filePath = path.join(UPLOAD_DIR, files[0]);
  const stat = fs.statSync(filePath);

  return res.json({
    uploadId,
    exists: true,
    diskPath: filePath,
    diskBytes: stat.size,
    lastModified: stat.mtime
  });
});

function safeUnlink(filePath) {
  if (!filePath) return;

  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error(
        `[Cleanup] Failed to remove "${filePath}":`,
        err.message
      );
    } else if (!err) {
      console.log(
        `[Cleanup] Removed partial file: "${filePath}"`
      );
    }
  });
}

module.exports = router;