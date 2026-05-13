const crypto = require('crypto');

/**
 * Password Generator Utility
 * Generates secure random passwords for employee accounts
 * Follows security best practices with configurable complexity
 */

/**
 * Generate a secure random password
 * @param {number} length - Length of the password (default: 12)
 * @param {Object} options - Password generation options
 * @param {boolean} options.includeUppercase - Include uppercase letters (default: true)
 * @param {boolean} options.includeLowercase - Include lowercase letters (default: true)
 * @param {boolean} options.includeNumbers - Include numbers (default: true)
 * @param {boolean} options.includeSymbols - Include special symbols (default: true)
 * @returns {string} Generated password
 */
const generatePassword = (length = 12, options = {}) => {
  // Default options
  const {
    includeUppercase = true,
    includeLowercase = true,
    includeNumbers = true,
    includeSymbols = true
  } = options;

  // Validate length
  if (length < 8) {
    throw new Error('Password length must be at least 8 characters');
  }

  if (length > 128) {
    throw new Error('Password length cannot exceed 128 characters');
  }

  // Character sets
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  // Using symbols that are generally safe and don't cause issues in URLs or systems
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  // Build character pool based on options
  let charPool = '';
  const requiredChars = [];

  if (includeUppercase) {
    charPool += uppercase;
    requiredChars.push(uppercase[crypto.randomInt(0, uppercase.length)]);
  }

  if (includeLowercase) {
    charPool += lowercase;
    requiredChars.push(lowercase[crypto.randomInt(0, lowercase.length)]);
  }

  if (includeNumbers) {
    charPool += numbers;
    requiredChars.push(numbers[crypto.randomInt(0, numbers.length)]);
  }

  if (includeSymbols) {
    charPool += symbols;
    requiredChars.push(symbols[crypto.randomInt(0, symbols.length)]);
  }

  // Ensure at least one character set is selected
  if (charPool.length === 0) {
    throw new Error('At least one character set must be enabled');
  }

  // Generate random password
  let password = '';
  const remainingLength = length - requiredChars.length;

  // Add random characters from the pool
  for (let i = 0; i < remainingLength; i++) {
    const randomIndex = crypto.randomInt(0, charPool.length);
    password += charPool[randomIndex];
  }

  // Add required characters to ensure complexity
  password += requiredChars.join('');

  // Shuffle the password to randomize position of required characters
  password = shuffleString(password);

  return password;
};

/**
 * Generate a memorable password (easier to type but still secure)
 * Format: Word-Word-Number-Symbol (e.g., Blue-Tiger-42#)
 * @returns {string} Generated memorable password
 */
const generateMemorablePassword = () => {
  const words = [
    'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel',
    'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa',
    'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey',
    'Xray', 'Yankee', 'Zulu', 'Blue', 'Red', 'Green', 'Yellow', 'Purple',
    'Orange', 'Silver', 'Gold', 'Tiger', 'Lion', 'Eagle', 'Hawk', 'Wolf'
  ];

  const word1 = words[crypto.randomInt(0, words.length)];
  const word2 = words[crypto.randomInt(0, words.length)];
  const number = crypto.randomInt(10, 99);
  const symbols = '!@#$%^&*';
  const symbol = symbols[crypto.randomInt(0, symbols.length)];

  return `${word1}-${word2}-${number}${symbol}`;
};

/**
 * Generate employee ID in format: EMP + YEAR + 4-digit sequential number
 * @param {number} count - Current employee count
 * @returns {string} Generated employee ID
 */
const generateEmployeeId = (count) => {
  const year = new Date().getFullYear();
  const sequence = String(count + 1).padStart(4, '0');
  return `EMP${year}${sequence}`;
};

/**
 * Shuffle a string randomly
 * @param {string} str - String to shuffle
 * @returns {string} Shuffled string
 */
const shuffleString = (str) => {
  const arr = str.split('');
  
  // Fisher-Yates shuffle algorithm
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  
  return arr.join('');
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with score and feedback
 */
const validatePasswordStrength = (password) => {
  const result = {
    isValid: false,
    score: 0,
    feedback: []
  };

  // Check length
  if (password.length < 8) {
    result.feedback.push('Password must be at least 8 characters long');
    return result;
  }

  if (password.length >= 12) {
    result.score += 2;
  } else if (password.length >= 8) {
    result.score += 1;
  }

  // Check for uppercase
  if (/[A-Z]/.test(password)) {
    result.score += 1;
  } else {
    result.feedback.push('Add uppercase letters');
  }

  // Check for lowercase
  if (/[a-z]/.test(password)) {
    result.score += 1;
  } else {
    result.feedback.push('Add lowercase letters');
  }

  // Check for numbers
  if (/[0-9]/.test(password)) {
    result.score += 1;
  } else {
    result.feedback.push('Add numbers');
  }

  // Check for symbols
  if (/[^A-Za-z0-9]/.test(password)) {
    result.score += 1;
  } else {
    result.feedback.push('Add special characters');
  }

  // Check for common patterns
  const commonPatterns = ['123', 'abc', 'password', 'qwerty', '111', '000'];
  const lowerPassword = password.toLowerCase();
  
  for (const pattern of commonPatterns) {
    if (lowerPassword.includes(pattern)) {
      result.score -= 1;
      result.feedback.push('Avoid common patterns');
      break;
    }
  }

  // Determine if valid (score >= 4 is considered strong)
  result.isValid = result.score >= 4;

  if (result.isValid) {
    result.feedback = ['Password is strong'];
  }

  return result;
};

/**
 * Generate a random password (alias for generatePassword with default settings)
 * @returns {string} Generated password
 */
const generateRandomPassword = () => {
  return generatePassword(12, {
    includeUppercase: true,
    includeLowercase: true,
    includeNumbers: true,
    includeSymbols: true
  });
};

module.exports = {
  generatePassword,
  generateMemorablePassword,
  generateEmployeeId,
  validatePasswordStrength,
  generateRandomPassword
};
