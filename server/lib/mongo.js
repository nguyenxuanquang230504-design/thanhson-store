const mongoose = require('mongoose');

let connectionPromise = null;

async function connectMongo(uri) {
  if (!uri) return false;
  if (mongoose.connection.readyState === 1) return true;
  if (connectionPromise) {
    await connectionPromise;
    return mongoose.connection.readyState === 1;
  }
  connectionPromise = mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await connectionPromise;
    return true;
  } finally {
    connectionPromise = null;
  }
}

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectMongo, isMongoConnected };
