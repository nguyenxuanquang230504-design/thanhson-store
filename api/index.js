const app = require('../server/app');

module.exports = (req, res) => {
  if (req.headers['x-matched-path']) {
    const originalPath = req.headers['x-matched-path'];
    const queryIdx = req.url.indexOf('?');
    const query = queryIdx !== -1 ? req.url.slice(queryIdx) : '';
    req.url = originalPath + query;
  }
  return app(req, res);
};
