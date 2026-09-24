const mongoose = require('mongoose');

let isConnected = false;

/**
 * Connect to MongoDB instance with robust pooling and timeout options.
 * @param {string} [uri] - Optional MongoDB connection URI. Defaults to process.env.MONGO_URI.
 * @param {object} [options] - Additional mongoose connection options.
 * @returns {Promise<mongoose.Connection>}
 */
async function connectDB(uri = process.env.MONGO_URI || 'mongodb://localhost:27017/streamweaver', options = {}) {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const defaultOptions = {
    maxPoolSize: 50,
    minPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    ...options
  };

  try {
    const conn = await mongoose.connect(uri, defaultOptions);
    isConnected = true;
    console.log(`[StreamWeaver DB] MongoDB connected: ${conn.connection.host || 'local'}/${conn.connection.name}`);
    return conn.connection;
  } catch (error) {
    console.error(`[StreamWeaver DB] Connection error: ${error.message}`);
    throw error;
  }
}

/**
 * Disconnect from MongoDB gracefully.
 */
async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[StreamWeaver DB] MongoDB connection closed');
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  mongoose
};
