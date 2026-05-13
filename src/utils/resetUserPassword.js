/**
 * Reset User Password
 * Deletes and recreates user with correct password
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Employee = require('../models/Employee');

const resetPassword = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const email = 'krishnaupadhyay207@gmail.com';
    const newPassword = 'Krishna@2025';

    // Find employee
    console.log('🔍 Finding employee...');
    const employee = await Employee.findOne({ email });
    
    if (!employee) {
      console.log('❌ Employee not found!');
      process.exit(1);
    }

    console.log(`✅ Employee found: ${employee.firstName} ${employee.lastName}\n`);

    // Delete existing user
    console.log('🗑️  Deleting existing user...');
    await User.deleteOne({ email });
    console.log('✅ User deleted\n');

    // Create new user with correct password
    console.log('👤 Creating new user account...');
    
    console.log('🔐 Password setup:');
    console.log(`   Plain password: ${newPassword}`);
    console.log(`   (Will be hashed automatically by User model)\n`);
    
    const userData = {
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      password: newPassword, // Pass plain password - model will hash it
      role: 'employee',
      isActive: true,
      isFirstLogin: true,
      mustChangePassword: true
    };

    const user = await User.create(userData);
    console.log('✅ User account created successfully!\n');

    // Verify password
    console.log('🔐 Verifying password...');
    const savedUser = await User.findOne({ email }).select('+password'); // Include password field
    const isMatch = await bcrypt.compare(newPassword, savedUser.password);
    
    if (isMatch) {
      console.log('✅ Password verification SUCCESSFUL!\n');
    } else {
      console.log('❌ Password verification FAILED!\n');
      process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 USER ACCOUNT RESET SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('🔐 Login Credentials:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${newPassword}`);
    console.log(`   Role: ${user.role}`);
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('🚀 Try logging in now at: http://localhost:5173/login\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
};

resetPassword();
