'use strict';

const { Writable } = require('stream');

class BatchSink extends Writable {
  constructor(
    {
      label = 'BatchSink',
      batchSize = 1000,
      flushIntervalMs = 500,
      onFlush,
    } = {},
    options = {}
  ) {
    super({
      ...options,
      objectMode: true,
    });

    this._label = label;
    this._batchSize = batchSize;
    this._flushIntervalMs = flushIntervalMs;
    this._onFlush =
      typeof onFlush === 'function'
        ? onFlush
        : this._defaultFlush.bind(this);

    this._buffer = [];
    this._flushing = false;
    this._stats = {
      totalFlushed: 0,
      batchCount: 0,
    };

    this._timer = setInterval(() => {
      if (this._buffer.length > 0) {
        this._flushBuffer().catch((err) => {
          this.destroy(err);
        });
      }
    }, this._flushIntervalMs);

    this._timer.unref();
  }

  _write(chunk, _encoding, callback) {
    this._buffer.push(chunk);

    if (this._buffer.length >= this._batchSize) {
      this._flushBuffer()
        .then(() => callback())
        .catch((err) => callback(err));
    } else {
      callback();
    }
  }

  async _flushBuffer() {
    if (
      this._buffer.length === 0 ||
      this._flushing
    ) {
      return;
    }

    this._flushing = true;

    const batch = this._buffer.splice(
      0,
      this._batchSize
    );

    try {
      await this._onFlush(
        batch,
        this._label
      );

      this._stats.totalFlushed += batch.length;
      this._stats.batchCount += 1;

      console.log(
        `[${this._label}] Flushed batch #${this._stats.batchCount} — ` +
        `${batch.length} rows (total: ${this._stats.totalFlushed})`
      );
    } finally {
      this._flushing = false;
    }
  }

  _defaultFlush() {
    return Promise.resolve();
  }

  _final(callback) {
    clearInterval(this._timer);

    this._flushBuffer()
      .then(() => {
        console.log(
          `[${this._label}] Final flush done — ` +
          `total rows: ${this._stats.totalFlushed}, ` +
          `batches: ${this._stats.batchCount}`
        );

        callback();
      })
      .catch((err) => {
        callback(err);
      });
  }

  getStats() {
    return {
      ...this._stats,
      bufferLength: this._buffer.length,
    };
  }
}

module.exports = BatchSink;