const mongoose = require('mongoose');

async function connectMongo(uri) {
  if (!uri) return false;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  return true;
}

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectMongo, isMongoConnected };
