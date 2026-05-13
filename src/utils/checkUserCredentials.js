/**
 * Check User Credentials
 * Verifies user exists and tests password
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const checkCredentials = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const email = 'krishnaupadhyay207@gmail.com';
    const testPassword = 'Krishna@2025';

    console.log('🔍 Finding user...');
    const user = await User.findOne({ email });

    if (!user) {
      console.log('❌ User not found!');
      process.exit(1);
    }

    console.log('✅ User found!\n');
    console.log('📊 User Details:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Active: ${user.isActive}`);
    console.log(`   First Login: ${user.isFirstLogin}`);
    console.log(`   Must Change Password: ${user.mustChangePassword}\n`);

    console.log('🔐 Testing password...');
    const isMatch = await bcrypt.compare(testPassword, user.password);
    
    if (isMatch) {
      console.log('✅ Password is CORRECT!\n');
      console.log('═══════════════════════════════════════════════════════');
      console.log('🔐 VALID CREDENTIALS:');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${testPassword}`);
      console.log('═══════════════════════════════════════════════════════\n');
    } else {
      console.log('❌ Password is INCORRECT!\n');
      console.log('💡 The password in the database does not match.');
      console.log('   Try resetting the password or creating a new user.\n');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

checkCredentials();
