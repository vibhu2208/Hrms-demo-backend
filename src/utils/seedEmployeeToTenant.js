/**
 * Seed Employees to Tenant Database
 * Creates multiple employees in a specific tenant's database
 * 
 * Run: node src/utils/seedEmployeeToTenant.js <TENANT_ID> [count]
 * Example: node src/utils/seedEmployeeToTenant.js 691481b858eace79baa1c698 10
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Get arguments
const tenantId = process.argv[2];
const count = parseInt(process.argv[3]) || 5;

if (!tenantId) {
  console.log('❌ Please provide a tenant ID as argument');
  console.log('Usage: node seedEmployeeToTenant.js <TENANT_ID> [count]');
  console.log('Example: node seedEmployeeToTenant.js 691481b858eace79baa1c698 10');
  process.exit(1);
}

// Sample data
const firstNames = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Anjali', 'Rohan', 'Kavya', 'Arjun', 'Meera', 'Karan', 'Pooja', 'Siddharth', 'Neha', 'Aditya', 'Riya', 'Varun', 'Divya', 'Nikhil', 'Shreya'];
const lastNames = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Reddy', 'Gupta', 'Verma', 'Mehta', 'Joshi', 'Nair', 'Rao', 'Desai', 'Iyer', 'Malhotra', 'Chopra', 'Kapoor', 'Agarwal', 'Bose', 'Sinha', 'Pillai'];
const designations = ['Software Engineer', 'Senior Developer', 'Full Stack Developer', 'Backend Developer', 'Frontend Developer', 'DevOps Engineer', 'QA Engineer', 'Data Analyst', 'System Engineer', 'Technical Lead', 'Product Manager', 'Business Analyst', 'HR Manager', 'Finance Manager', 'Operations Manager'];
const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Noida'];
const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance', 'Operations', 'Product', 'Design'];

const skills = [
  ['JavaScript', 'React', 'Node.js', 'MongoDB', 'Express'],
  ['Python', 'Django', 'PostgreSQL', 'REST API', 'Docker'],
  ['Java', 'Spring Boot', 'MySQL', 'Microservices', 'AWS'],
  ['Angular', 'TypeScript', 'RxJS', 'NgRx', 'Material UI'],
  ['Vue.js', 'Nuxt.js', 'Vuex', 'Firebase', 'GraphQL'],
  ['Communication', 'Leadership', 'Project Management', 'Team Building'],
  ['Sales', 'Negotiation', 'Client Management', 'CRM'],
  ['Marketing', 'Digital Marketing', 'SEO', 'Content Strategy'],
  ['Accounting', 'Financial Analysis', 'Budgeting', 'Compliance'],
  ['Operations', 'Process Improvement', 'Supply Chain', 'Logistics']
];

// Helper functions
const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)];
const getRandomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomSkills = () => getRandomElement(skills);

// Generate employees
const generateEmployees = (tenantId, count = 5) => {
  const employees = [];
  const timestamp = Date.now();

  for (let i = 0; i < count; i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[i % lastNames.length];
    // Add timestamp to email to ensure uniqueness across multiple runs
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${timestamp}${i}@company.com`;
    const phone = `+91${getRandomNumber(7000000000, 9999999999)}`;
    const experienceYears = getRandomNumber(1, 15);
    const experienceMonths = getRandomNumber(0, 11);

    const employee = {
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth: new Date(1990 + getRandomNumber(0, 30), getRandomNumber(0, 11), getRandomNumber(1, 28)),
      gender: getRandomElement(['male', 'female']),
      address: {
        street: `${getRandomNumber(1, 999)} Main Street`,
        city: getRandomElement(cities),
        state: 'State',
        zipCode: String(getRandomNumber(100000, 999999)),
        country: 'India'
      },
      department: getRandomElement(departments),
      designation: getRandomElement(designations),
      joiningDate: new Date(Date.now() - getRandomNumber(30, 1825) * 24 * 60 * 60 * 1000),
      employmentType: getRandomElement(['full-time', 'part-time', 'contract']),
      reportingManager: null,
      salary: {
        basic: getRandomNumber(30000, 100000),
        hra: getRandomNumber(10000, 40000),
        allowances: getRandomNumber(5000, 20000),
        deductions: getRandomNumber(2000, 10000),
        total: getRandomNumber(50000, 150000)
      },
      bankDetails: {
        accountNumber: String(getRandomNumber(1000000000, 9999999999)),
        bankName: getRandomElement(['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Kotak Bank']),
        ifscCode: `BANK${String(getRandomNumber(1000, 9999))}`,
        branch: getRandomElement(cities)
      },
      education: [
        {
          degree: getRandomElement(['B.Tech', 'B.E', 'B.Sc', 'MBA', 'MCA']),
          specialization: getRandomElement(['Computer Science', 'Information Technology', 'Electronics', 'Mechanical', 'Business Administration']),
          institution: 'University',
          passingYear: 2024 - experienceYears,
          percentage: getRandomNumber(70, 95)
        }
      ],
      experience: {
        years: experienceYears,
        months: experienceMonths
      },
      skills: getRandomSkills(),
      status: 'active',
      isActive: true
    };

    employees.push(employee);
  }

  return employees;
};

const seedEmployeesToTenant = async () => {
  let tenantConnection = null;

  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Create tenant connection
    console.log(`🔗 Creating tenant connection for: hrms_tenant_${tenantId}`);
    const baseUri = process.env.MONGODB_URI.split('/').slice(0, -1).join('/');
    const tenantUri = `${baseUri}/hrms_tenant_${tenantId}`;

    tenantConnection = await mongoose.createConnection(tenantUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to tenant database\n');

    // Define Employee schema for tenant
    const employeeSchema = new mongoose.Schema({
      employeeCode: { type: String, unique: true },
      firstName: String,
      lastName: String,
      email: { type: String, unique: true },
      phone: String,
      dateOfBirth: Date,
      gender: String,
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
      },
      department: String,
      designation: String,
      joiningDate: Date,
      employmentType: String,
      reportingManager: mongoose.Schema.Types.ObjectId,
      salary: {
        basic: Number,
        hra: Number,
        allowances: Number,
        deductions: Number,
        total: Number
      },
      bankDetails: {
        accountNumber: String,
        bankName: String,
        ifscCode: String,
        branch: String
      },
      education: [{
        degree: String,
        specialization: String,
        institution: String,
        passingYear: Number,
        percentage: Number
      }],
      experience: {
        years: Number,
        months: Number
      },
      skills: [String],
      status: String,
      isActive: Boolean,
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    });

    const TenantEmployee = tenantConnection.model('Employee', employeeSchema);

    // Generate employees
    console.log(`📝 Generating ${count} employees...\n`);
    const employeesData = generateEmployees(tenantId, count);

    // Get last employee code - find the highest valid employee code
    let nextNumber = 1;
    try {
      const allEmployees = await TenantEmployee.find()
        .select('employeeCode')
        .sort({ createdAt: -1 })
        .limit(100); // Check last 100 employees
      
      let maxNumber = 0;
      for (const emp of allEmployees) {
        if (emp.employeeCode) {
          const codeMatch = emp.employeeCode.match(/\d+/);
          if (codeMatch) {
            const num = parseInt(codeMatch[0]);
            if (!isNaN(num) && num > maxNumber) {
              maxNumber = num;
            }
          }
        }
      }
      
      if (maxNumber > 0) {
        nextNumber = maxNumber + 1;
      }
      
      console.log(`📊 Found ${allEmployees.length} existing employees`);
      console.log(`📊 Highest valid employee code number: ${maxNumber}`);
      console.log(`📊 Next employee code will start from: EMP${String(nextNumber).padStart(5, '0')}\n`);
    } catch (error) {
      console.log(`⚠️  Could not retrieve existing employee codes, starting from EMP00001\n`);
    }

    // Create employees
    const createdEmployees = [];
    for (let i = 0; i < employeesData.length; i++) {
      const employeeData = employeesData[i];
      const employeeCode = `EMP${String(nextNumber + i).padStart(5, '0')}`;
      employeeData.employeeCode = employeeCode;

      const employee = await TenantEmployee.create(employeeData);
      createdEmployees.push(employee);

      console.log(`✅ Employee ${i + 1}/${count} created:`);
      console.log(`   Code: ${employeeCode}`);
      console.log(`   Name: ${employee.firstName} ${employee.lastName}`);
      console.log(`   Email: ${employee.email}`);
      console.log(`   Designation: ${employee.designation}\n`);
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 EMPLOYEES SEEDED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📊 Summary:');
    console.log(`   Tenant ID: ${tenantId}`);
    console.log(`   Database: hrms_tenant_${tenantId}`);
    console.log(`   Employees Created: ${createdEmployees.length}`);
    console.log(`   Employee Code Range: EMP${String(nextNumber).padStart(5, '0')} - EMP${String(nextNumber + count - 1).padStart(5, '0')}\n`);

    console.log('✅ Seeding completed!\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding employees:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (tenantConnection) {
      await tenantConnection.close();
    }
  }
};

// Run the script
seedEmployeesToTenant();
