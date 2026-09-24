const fs = require('fs');
const path = require('path');

async function cleanupFile(filePath) {
  if (!filePath) return false;

  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    await fs.promises.unlink(filePath);
    console.log(`[Cleanup] Removed partial file: ${path.basename(filePath)}`);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false;
    }

    console.error(
      `[Cleanup] Failed to remove ${path.basename(filePath)}: ${err.message}`
    );

    return false;
  }
}

async function ensureUploadDir(dirPath) {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
    console.log(`[Setup] Upload directory ready: ${dirPath}`);
  } catch (err) {
    console.error(
      `[Setup] Failed to create upload directory: ${err.message}`
    );
    throw err;
  }
}

module.exports = {
  cleanupFile,
  ensureUploadDir
};