const crypto = require('crypto');
const encryptionConfig = require('../config/encryption.config');

/**
 * Encryption Service for sensitive data
 * Uses AES-256-GCM for authenticated encryption
 */
class EncryptionService {
  constructor() {
    this.algorithm = encryptionConfig.algorithm;
    this.key = encryptionConfig.key;
    this.ivLength = encryptionConfig.ivLength;
    this.authTagLength = encryptionConfig.authTagLength;
  }

  /**
   * Encrypt a field value
   * @param {String|Number} plaintext - Value to encrypt
   * @param {String} fieldName - Name of field (for additional context)
   * @returns {String} Encrypted value in format: iv:authTag:encrypted
   */
  encryptField(plaintext, fieldName = '') {
    if (!this.key) {
      throw new Error('Encryption key not configured. Set ENCRYPTION_KEY in environment variables.');
    }

    if (plaintext === null || plaintext === undefined || plaintext === '') {
      return null;
    }

    try {
      // Convert to string if number
      const plaintextStr = String(plaintext);

      // Generate random IV
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

      // Encrypt
      let encrypted = cipher.update(plaintextStr, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const authTag = cipher.getAuthTag();

      // Return format: iv:authTag:encrypted
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      console.error(`Encryption error for field ${fieldName}:`, error.message);
      throw new Error(`Failed to encrypt ${fieldName}`);
    }
  }

  /**
   * Decrypt a field value
   * @param {String} ciphertext - Encrypted value in format: iv:authTag:encrypted
   * @param {String} fieldName - Name of field (for additional context)
   * @returns {String} Decrypted value
   */
  decryptField(ciphertext, fieldName = '') {
    if (!this.key) {
      throw new Error('Encryption key not configured. Set ENCRYPTION_KEY in environment variables.');
    }

    if (!ciphertext || ciphertext === null || ciphertext === '') {
      return null;
    }

    // If value is not encrypted (backward compatibility)
    if (!ciphertext.includes(':')) {
      return ciphertext;
    }

    try {
      // Parse encrypted format: iv:authTag:encrypted
      const parts = ciphertext.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error(`Decryption error for field ${fieldName}:`, error.message);
      throw new Error(`Failed to decrypt ${fieldName}`);
    }
  }

  /**
   * Encrypt salary object
   * @param {Object} salary - Salary object with basic, hra, allowances, etc.
   * @returns {Object} Encrypted salary object
   */
  encryptSalary(salary) {
    if (!salary) return null;

    return {
      basic: this.encryptField(salary.basic, 'basic'),
      hra: this.encryptField(salary.hra, 'hra'),
      allowances: this.encryptField(salary.allowances, 'allowances'),
      deductions: this.encryptField(salary.deductions, 'deductions'),
      total: this.encryptField(salary.total, 'total')
    };
  }

  /**
   * Decrypt salary object
   * @param {Object} encryptedSalary - Encrypted salary object
   * @returns {Object} Decrypted salary object with numeric values
   */
  decryptSalary(encryptedSalary) {
    if (!encryptedSalary) return null;

    return {
      basic: parseFloat(this.decryptField(encryptedSalary.basic, 'basic')) || 0,
      hra: parseFloat(this.decryptField(encryptedSalary.hra, 'hra')) || 0,
      allowances: parseFloat(this.decryptField(encryptedSalary.allowances, 'allowances')) || 0,
      deductions: parseFloat(this.decryptField(encryptedSalary.deductions, 'deductions')) || 0,
      total: parseFloat(this.decryptField(encryptedSalary.total, 'total')) || 0
    };
  }

  /**
   * Mask salary for display (show only to authorized users)
   * @param {Number} amount - Salary amount
   * @returns {String} Masked amount (e.g., "₹ *****")
   */
  maskSalary(amount) {
    if (!amount) return '₹ *****';
    return '₹ *****';
  }

  /**
   * Check if user is authorized to view salary
   * @param {Object} user - User object
   * @param {String} employeeId - Employee whose salary is being accessed
   * @returns {Boolean}
   */
  isAuthorizedToViewSalary(user, employeeId) {
    // SuperAdmin can view all
    if (user.role === 'superadmin') return true;

    // Company Admin can view all in their company
    if (user.role === 'company_admin') return true;

    // HR can view all salaries
    if (user.role === 'hr') return true;

    // Users can view their own salary
    if (user.employeeId && user.employeeId.toString() === employeeId.toString()) {
      return true;
    }

    return false;
  }

  /**
   * Rotate encryption key (for key rotation policy)
   * This would decrypt with old key and re-encrypt with new key
   * @param {String} newKey - New encryption key (hex string)
   */
  async rotateEncryptionKey(newKey) {
    // This is a placeholder for key rotation implementation
    // In production, this would:
    // 1. Decrypt all encrypted fields with old key
    // 2. Re-encrypt with new key
    // 3. Update key in configuration
    throw new Error('Key rotation not yet implemented');
  }

  /**
   * Generate a new encryption key
   * @returns {String} Hex-encoded encryption key
   */
  static generateKey() {
    return crypto.randomBytes(32).toString('hex');
  }
}

module.exports = new EncryptionService();
