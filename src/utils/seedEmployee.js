/**
 * Seed Single Employee Script
 * Creates one employee with user account
 * 
 * Run: node src/utils/seedEmployee.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Department = require('../models/Department');

const seedEmployee = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const email = 'krishnaupadhyay207@gmail.com';
    const plainPassword = 'Krishna@2025'; // Temporary password

    // Check if employee already exists
    console.log('🔍 Checking if employee exists...');
    const existingEmployee = await Employee.findOne({ email });
    
    if (existingEmployee) {
      console.log(`⚠️  Employee with email ${email} already exists!`);
      console.log(`   Employee Code: ${existingEmployee.employeeCode}`);
      console.log(`   Name: ${existingEmployee.firstName} ${existingEmployee.lastName}\n`);
      
      // Check if user account exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        console.log('ℹ️  User account already exists');
        console.log(`   Email: ${email}`);
        console.log(`   Role: ${existingUser.role}`);
        console.log('\n💡 If you forgot the password, you need to reset it through the app\n');
      }
      
      process.exit(0);
    }

    // Get or create a department
    let department = await Department.findOne();
    if (!department) {
      console.log('📁 Creating default department...');
      department = await Department.create({
        name: 'Engineering',
        description: 'Engineering Department',
        headOfDepartment: null
      });
      console.log('✅ Department created\n');
    }

    // Generate Employee Code
    const lastEmployee = await Employee.findOne().sort({ employeeCode: -1 });
    let employeeCode = 'EMP00001';
    
    if (lastEmployee && lastEmployee.employeeCode) {
      const lastNumber = parseInt(lastEmployee.employeeCode.replace('EMP', ''));
      const newNumber = lastNumber + 1;
      employeeCode = `EMP${String(newNumber).padStart(5, '0')}`;
    }

    console.log('📝 Creating employee...');
    console.log(`   Generated Employee Code: ${employeeCode}\n`);

    // Create Employee
    const employeeData = {
      employeeCode,
      firstName: 'Krishna',
      lastName: 'Upadhyay',
      email: email,
      phone: '9876543210',
      dateOfBirth: new Date('2003-10-16'),
      gender: 'male',
      address: {
        street: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400001',
        country: 'India'
      },
      department: department._id,
      designation: 'Software Engineer',
      joiningDate: new Date(),
      employmentType: 'full-time',
      reportingManager: null,
      salary: {
        basic: 50000,
        hra: 20000,
        allowances: 10000,
        deductions: 5000,
        total: 75000
      },
      bankDetails: {
        accountNumber: '1234567890',
        bankName: 'HDFC Bank',
        ifscCode: 'HDFC0001234',
        branch: 'Mumbai Main'
      },
      education: [
        {
          degree: 'Bachelor of Technology',
          specialization: 'Computer Science',
          institution: 'Mumbai University',
          passingYear: 2024,
          percentage: 85
        }
      ],
      experience: {
        years: 1,
        months: 0
      },
      skills: ['JavaScript', 'React', 'Node.js', 'MongoDB', 'Express'],
      status: 'active',
      isActive: true
    };

    const employee = await Employee.create(employeeData);
    console.log('✅ Employee created successfully!\n');

    // Create User Account
    console.log('👤 Creating user account...');
    
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    
    const userData = {
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      password: hashedPassword,
      role: 'employee',
      employee: employee._id,
      isActive: true,
      isFirstLogin: true,
      mustChangePassword: true
    };

    const user = await User.create(userData);
    console.log('✅ User account created successfully!\n');

    // Display credentials
    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 EMPLOYEE ACCOUNT CREATED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('📊 Employee Details:');
    console.log(`   Employee Code: ${employee.employeeCode}`);
    console.log(`   Name: ${employee.firstName} ${employee.lastName}`);
    console.log(`   Email: ${employee.email}`);
    console.log(`   Phone: ${employee.phone}`);
    console.log(`   Designation: ${employee.designation}`);
    console.log(`   Department: ${department.name}`);
    console.log(`   Joining Date: ${employee.joiningDate.toLocaleDateString()}`);
    console.log(`   Salary: ₹${employee.salary.total.toLocaleString()}/month\n`);

    console.log('🔐 Login Credentials:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${plainPassword}`);
    console.log(`   Role: ${user.role}`);
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('⚠️  IMPORTANT NOTES:');
    console.log('   1. This is a TEMPORARY password');
    console.log('   2. You will be asked to change it on first login');
    console.log('   3. Keep these credentials secure');
    console.log('   4. Do not share the password\n');

    console.log('🚀 Next Steps:');
    console.log('   1. Go to: http://localhost:5173/login');
    console.log('   2. Login with the credentials above');
    console.log('   3. Change your password when prompted');
    console.log('   4. Start using the HRMS application!\n');

    console.log('✅ Seeding completed!\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding employee:', error.message);
    process.exit(1);
  }
};

// Run the script
seedEmployee();
