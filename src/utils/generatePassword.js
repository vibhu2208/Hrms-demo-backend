/**
 * Password Generator Utility
 * Generates secure random passwords for new users
 */

/**
 * Generate a random password
 * @param {number} length - Length of the password (default: 10)
 * @param {Object} options - Password generation options
 * @returns {string} Generated password
 */
const generateRandomPassword = (length = 10, options = {}) => {
  const {
    includeUppercase = true,
    includeLowercase = true,
    includeNumbers = true,
    includeSpecialChars = false,
    excludeSimilar = true // Exclude similar characters like 0, O, l, 1, I
  } = options;

  let charset = '';
  let password = '';

  // Define character sets
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excluded I, O
  const lowercase = 'abcdefghijkmnopqrstuvwxyz'; // Excluded l
  const numbers = '23456789'; // Excluded 0, 1
  const specialChars = '!@#$%^&*';

  const uppercaseAll = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercaseAll = 'abcdefghijklmnopqrstuvwxyz';
  const numbersAll = '0123456789';

  // Build charset based on options
  if (includeUppercase) {
    charset += excludeSimilar ? uppercase : uppercaseAll;
  }
  if (includeLowercase) {
    charset += excludeSimilar ? lowercase : lowercaseAll;
  }
  if (includeNumbers) {
    charset += excludeSimilar ? numbers : numbersAll;
  }
  if (includeSpecialChars) {
    charset += specialChars;
  }

  if (charset.length === 0) {
    throw new Error('At least one character type must be included');
  }

  // Generate password
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }

  // Ensure password has at least one character from each selected type
  let hasUppercase = !includeUppercase;
  let hasLowercase = !includeLowercase;
  let hasNumber = !includeNumbers;
  let hasSpecial = !includeSpecialChars;

  for (let char of password) {
    if (includeUppercase && /[A-Z]/.test(char)) hasUppercase = true;
    if (includeLowercase && /[a-z]/.test(char)) hasLowercase = true;
    if (includeNumbers && /[0-9]/.test(char)) hasNumber = true;
    if (includeSpecialChars && /[!@#$%^&*]/.test(char)) hasSpecial = true;
  }

  // If any required type is missing, regenerate
  if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
    return generateRandomPassword(length, options);
  }

  return password;
};

/**
 * Generate a secure password for company admin
 * @returns {string} Generated password (8-10 characters, alphanumeric)
 */
const generateAdminPassword = () => {
  const length = Math.floor(Math.random() * 3) + 8; // Random length between 8-10
  return generateRandomPassword(length, {
    includeUppercase: true,
    includeLowercase: true,
    includeNumbers: true,
    includeSpecialChars: false,
    excludeSimilar: true
  });
};

/**
 * Generate a temporary employee password
 * @returns {string} Generated password
 */
const generateEmployeePassword = () => {
  return generateRandomPassword(8, {
    includeUppercase: true,
    includeLowercase: true,
    includeNumbers: true,
    includeSpecialChars: false,
    excludeSimilar: true
  });
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with strength score
 */
const validatePasswordStrength = (password) => {
  let score = 0;
  const feedback = [];

  if (!password || password.length === 0) {
    return {
      isValid: false,
      score: 0,
      strength: 'invalid',
      feedback: ['Password is required']
    };
  }

  // Length check
  if (password.length >= 8) score += 1;
  else feedback.push('Password should be at least 8 characters');

  if (password.length >= 12) score += 1;

  // Character type checks
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Include lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Include uppercase letters');

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push('Include numbers');

  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 1;

  // Determine strength
  let strength = 'weak';
  if (score >= 5) strength = 'strong';
  else if (score >= 3) strength = 'medium';

  return {
    isValid: score >= 3,
    score,
    strength,
    feedback: feedback.length > 0 ? feedback : ['Password is strong']
  };
};

module.exports = {
  generateRandomPassword,
  generateAdminPassword,
  generateEmployeePassword,
  validatePasswordStrength
};
