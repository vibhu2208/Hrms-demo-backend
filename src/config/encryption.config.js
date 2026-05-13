const crypto = require('crypto');

const encryptionConfig = {
  algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
  key: process.env.ENCRYPTION_KEY ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex') : null,
  ivLength: 16,
  authTagLength: 16,
  saltLength: 64
};

if (!encryptionConfig.key) {
  console.warn('⚠️  WARNING: ENCRYPTION_KEY not set in environment variables');
  console.warn('⚠️  Salary encryption will not work properly');
  console.warn('⚠️  Generate a key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

module.exports = encryptionConfig;
