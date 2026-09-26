'use strict';

const { Writable } = require('stream');

class StreamSplitter extends Writable {
  constructor({ destinationSink, dlqSink }, options = {}) {
    super({ ...options, objectMode: true });

    if (!destinationSink || typeof destinationSink.write !== 'function') {
      throw new TypeError('destinationSink must be a Writable stream');
    }

    if (!dlqSink || typeof dlqSink.write !== 'function') {
      throw new TypeError('dlqSink must be a Writable stream');
    }

    this._destination = destinationSink;
    this._dlq = dlqSink;

    this._destination.once('error', (err) => this.destroy(err));
    this._dlq.once('error', (err) => this.destroy(err));
  }

  _write(chunk, _encoding, callback) {
    const { isValid, data, errors } = chunk;

    const sink = isValid
      ? this._destination
      : this._dlq;

    const payload = isValid
      ? data
      : { data, errors };

    const drained = sink.write(payload);

    if (!drained) {
      sink.once('drain', callback);
    } else {
      callback();
    }
  }

  _final(callback) {
    let pending = 2;

    const done = (err) => {
      if (err) return callback(err);

      pending -= 1;

      if (pending === 0) {
        callback();
      }
    };

    if (typeof this._destination.end === 'function') {
      this._destination.end(done);
    } else {
      done();
    }

    if (typeof this._dlq.end === 'function') {
      this._dlq.end(done);
    } else {
      done();
    }
  }
}

module.exports = StreamSplitter;