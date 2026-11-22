const { cloudinaryUrl } = require('../config');

let cloudinary = null;

function getCloudinary() {
  if (cloudinary) return cloudinary;
  if (!cloudinaryUrl) return null;
  cloudinary = require('cloudinary').v2;
  cloudinary.config({ secure: true });
  return cloudinary;
}

function isCloudinaryConfigured() {
  return Boolean(cloudinaryUrl);
}

module.exports = { getCloudinary, isCloudinaryConfigured };
