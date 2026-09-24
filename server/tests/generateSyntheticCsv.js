const fs = require('node:fs');
const path = require('node:path');

/**
 * Streaming synthetic CSV generator.
 * Capable of generating multi-gigabyte CSV files with constant memory footprint
 * and periodic malformed rows to validate error isolation.
 *
 * @param {object} options
 * @param {string} options.outputPath - Destination file path
 * @param {number} [options.targetBytes] - Target file size in bytes (e.g., 1024*1024*1024 for 1GB)
 * @param {number} [options.targetRows] - Target row count (alternative to targetBytes)
 * @param {number} [options.malformedInterval=500] - Frequency of injected malformed rows (every N rows)
 * @param {function} [options.onProgress] - Periodic progress callback
 * @returns {Promise<{ filePath: string, totalRows: number, malformedRows: number, totalBytes: number }>}
 */
async function generateSyntheticCsv(options = {}) {
  const {
    outputPath = path.join(__dirname, 'synthetic_test.csv'),
    targetBytes = 50 * 1024 * 1024, // Default 50MB for quick runs, can be 1024 * 1024 * 1024 (1GB+)
    targetRows = null,
    malformedInterval = 500,
    onProgress = null
  } = options;

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const writeStream = fs.createWriteStream(outputPath, { highWaterMark: 128 * 1024 });

  const headers = ['id', 'customerId', 'customerName', 'email', 'category', 'amount', 'currency', 'status', 'timestamp'];
  const headerLine = headers.join(',') + '\n';
  writeStream.write(headerLine);

  let totalBytes = Buffer.byteLength(headerLine);
  let rowCount = 0;
  let malformedCount = 0;

  const categories = ['Electronics', 'HomeGoods', 'Books', 'Automotive', 'Apparel', 'Grocery'];
  const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'JPY'];
  const statuses = ['COMPLETED', 'PENDING', 'PROCESSING', 'SETTLED'];

  console.log(`[CSV Generator] Starting synthetic generation to: ${outputPath}`);
  if (targetRows) {
    console.log(`[CSV Generator] Target row count: ${targetRows.toLocaleString()} rows`);
  } else {
    console.log(`[CSV Generator] Target size: ${(targetBytes / (1024 * 1024)).toFixed(1)} MB`);
  }

  let isComplete = false;

  return new Promise((resolve, reject) => {
    writeStream.on('error', reject);

    function writeChunk() {
      let canContinue = true;

      while (canContinue && !isComplete) {
        rowCount++;

        let line;
        // Inject deliberate malformed rows for error isolation testing
        if (malformedInterval > 0 && rowCount % malformedInterval === 0) {
          malformedCount++;
          if (malformedCount % 2 === 0) {
            // Error 1: Extra columns (mismatched column count)
            line = `ERR_${rowCount},CUST_${rowCount},Jane Doe,jane_${rowCount}@malformed.test,Electronics,999.99,USD,ERROR_STATUS,2026-09-24T12:00:00Z,UNEXPECTED_COLUMN_1,UNEXPECTED_COLUMN_2\n`;
          } else {
            // Error 2: Missing columns (mismatched column count)
            line = `ERR_${rowCount},CUST_${rowCount},Missing Columns Row,missing@malformed.test\n`;
          }
        } else {
          // Valid row
          const category = categories[rowCount % categories.length];
          const currency = currencies[rowCount % currencies.length];
          const status = statuses[rowCount % statuses.length];
          const amount = (10 + (rowCount % 1000) * 1.75).toFixed(2);
          line = `TX_${rowCount},CUST_${rowCount % 10000},User_${rowCount},user_${rowCount}@streamweaver.test,${category},${amount},${currency},${status},2026-09-24T10:00:00Z\n`;
        }

        const lineBytes = Buffer.byteLength(line);
        totalBytes += lineBytes;
        canContinue = writeStream.write(line);

        if (targetRows && rowCount >= targetRows) {
          isComplete = true;
        } else if (!targetRows && totalBytes >= targetBytes) {
          isComplete = true;
        }

        if (rowCount % 100000 === 0 && onProgress) {
          onProgress({
            rowCount,
            totalBytes,
            totalMB: +(totalBytes / (1024 * 1024)).toFixed(2)
          });
        }
      }

      if (isComplete) {
        writeStream.end(() => {
          console.log(`[CSV Generator] Complete! Generated ${rowCount.toLocaleString()} rows (${(totalBytes / (1024 * 1024)).toFixed(2)} MB), Injected Malformed: ${malformedCount}`);
          resolve({
            filePath: outputPath,
            totalRows: rowCount,
            malformedRows: malformedCount,
            totalBytes
          });
        });
      } else {
        // Handle stream drain backpressure
        writeStream.once('drain', writeChunk);
      }
    }

    writeChunk();
  });
}

// Allow standalone execution from CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const sizeArg = args[0] ? parseFloat(args[0]) : 50; // MB
  const targetBytes = Math.round(sizeArg * 1024 * 1024);
  const targetFile = path.join(__dirname, `synthetic_${sizeArg}MB.csv`);

  generateSyntheticCsv({
    outputPath: targetFile,
    targetBytes,
    onProgress: (p) => {
      console.log(`[Progress] ${p.rowCount.toLocaleString()} rows written (${p.totalMB} MB)`);
    }
  }).catch(err => {
    console.error('Generation failed:', err);
    process.exit(1);
  });
}

module.exports = {
  generateSyntheticCsv
};
