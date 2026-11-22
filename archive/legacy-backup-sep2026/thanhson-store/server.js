const app = require('./server/app');
const { port } = require('./server/config');

app.listen(port, () => {
  console.log(`🚀 Thanh Sơn Fashion running at http://localhost:${port}`);
});
