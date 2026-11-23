const app = require('./server/app');
const config = require('./server/config');
const { connectMongo } = require('./server/lib/mongo');
const purchaseService = require('./server/services/purchase-service');

async function start() {
  if (config.mongoDbUri) {
    try {
      await connectMongo(config.mongoDbUri);
      console.log('MongoDB connected.');
      const expireOrders = () => purchaseService.expirePendingMongoOrders()
        .catch(error => console.error('Pending order expiry check failed:', error.message));
      await expireOrders();
      const expiryTimer = setInterval(expireOrders, 60 * 1000);
      expiryTimer.unref();
    } catch (error) {
      console.error(`MongoDB connection failed (${error.name || 'connection error'}).`);
      if (config.nodeEnv === 'production') process.exit(1);
    }
  } else if (config.nodeEnv === 'production') {
    throw new Error('MONGODB_URI is required in production');
  }

  app.listen(config.port, () => {
    console.log(`Thanh Sơn Fashion running at http://localhost:${config.port}`);
  });
}

if (require.main === module) {
  start().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = app;
