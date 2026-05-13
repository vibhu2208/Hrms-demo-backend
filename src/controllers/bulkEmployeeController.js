const Employee = require('../models/Employee');
const Department = require('../models/Department');
const { getTenantModel } = require('../middlewares/tenantMiddleware');
const { EMPLOYMENT_TYPES, isValidEmploymentType } = require('../utils/employmentTypeConstants');

// Helper function to validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Helper function to validate phone format
const isValidPhone = (phone) => {
  const phoneRegex = /^[0-9]{10,15}$/;
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
};

// Helper function to validate date format
const isValidDate = (dateString) => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

// Helper function to find department by name or ID (tenant-aware)
const findDepartment = async (departmentValue, tenantConnection) => {
  if (!departmentValue) return null;
  
  const DepartmentModel = getTenantModel(tenantConnection, 'Department', Department.schema);
  
  // Try to find by ID first
  let department = await DepartmentModel.findById(departmentValue).catch(() => null);
  
  // If not found, try to find by name (case-insensitive)
  if (!department) {
    department = await DepartmentModel.findOne({ 
      name: { $regex: new RegExp(`^${departmentValue}$`, 'i') } 
    });
  }
  
  // Also try to find by code (case-insensitive)
  if (!department) {
    department = await DepartmentModel.findOne({ 
      code: { $regex: new RegExp(`^${departmentValue}$`, 'i') } 
    });
  }
  
  return department;
};

// Validate a single employee record
// Field name mapping for CSV headers
const employeeFieldMapping = {
  'first name': 'firstName',
  'firstname': 'firstName',
  'first_name': 'firstName',
  'last name': 'lastName',
  'lastname': 'lastName',
  'last_name': 'lastName',
  'email address': 'email',
  'email id': 'email',
  'phone number': 'phone',
  'phone no': 'phone',
  'mobile': 'phone',
  'mobile number': 'phone',
  'department name': 'department',
  'department': 'department',
  'job title': 'designation',
  'designation': 'designation',
  'position': 'designation',
  'joining date': 'joiningDate',
  'join date': 'joiningDate',
  'start date': 'joiningDate',
  'date of birth': 'dateOfBirth',
  'dob': 'dateOfBirth',
  'gender': 'gender',
  'blood group': 'bloodGroup',
  'marital status': 'maritalStatus',
  'employment type': 'employmentType',
  'status': 'status',
  'employee code': 'employeeCode',
  'employee id': 'employeeCode',
  'salary': 'salary',
  'basic salary': 'salary',
  'address': 'address',
  'emergency contact name': 'emergencyContactName',
  'emergency contact phone': 'emergencyContactPhone',
  'emergency contact relation': 'emergencyContactRelation',
  'pan number': 'panNumber',
  'aadhar number': 'aadharNumber',
  'bank name': 'bankName',
  'account number': 'accountNumber',
  'ifsc code': 'ifscCode'
};

const validateEmployeeRecord = async (record, rowIndex, tenantConnection) => {
  const errors = [];
  const warnings = [];

  // Normalize field names from CSV headers
  const normalizedRecord = {};
  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = employeeFieldMapping[key.toLowerCase()] || key;
    normalizedRecord[normalizedKey] = value;
  }

  // Required fields validation
  if (!normalizedRecord.firstName || normalizedRecord.firstName.trim() === '') {
    errors.push(`First name is required (found: "${record.firstName || 'empty'}")`);
  }
  if (!normalizedRecord.lastName || normalizedRecord.lastName.trim() === '') {
    errors.push(`Last name is required (found: "${record.lastName || 'empty'}")`);
  }
  if (!normalizedRecord.email || normalizedRecord.email.trim() === '') {
    errors.push(`Email is required (found: "${record.email || 'empty'}")`);
  } else if (!isValidEmail(normalizedRecord.email)) {
    errors.push('Invalid email format');
  }
  if (!normalizedRecord.phone || normalizedRecord.phone.trim() === '') {
    errors.push(`Phone is required (found: "${record.phone || 'empty'}")`);
  } else if (!isValidPhone(normalizedRecord.phone)) {
    errors.push('Invalid phone format (should be 10-15 digits)');
  }
  if (!normalizedRecord.department || normalizedRecord.department.trim() === '') {
    errors.push(`Department is required (found: "${record.department || 'empty'}")`);
  }
  if (!normalizedRecord.designation || normalizedRecord.designation.trim() === '') {
    errors.push(`Designation is required (found: "${record.designation || 'empty'}")`);
  }
  if (!normalizedRecord.joiningDate || normalizedRecord.joiningDate.trim() === '') {
    errors.push(`Joining date is required (found: "${record.joiningDate || 'empty'}")`);
  } else if (!isValidDate(normalizedRecord.joiningDate)) {
    errors.push('Invalid joining date format');
  }

  // Optional field validations
  if (normalizedRecord.dateOfBirth && !isValidDate(normalizedRecord.dateOfBirth)) {
    warnings.push('Invalid date of birth format, will be skipped');
  }

  // Validate gender enum
  if (normalizedRecord.gender && !['male', 'female', 'other', ''].includes(normalizedRecord.gender.toLowerCase())) {
    warnings.push('Invalid gender value, will be set to empty');
  }

  // Validate blood group enum
  const validBloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''];
  if (normalizedRecord.bloodGroup && !validBloodGroups.includes(normalizedRecord.bloodGroup)) {
    warnings.push('Invalid blood group, will be skipped');
  }

  // Validate marital status enum
  const validMaritalStatus = ['single', 'married', 'divorced', 'widowed', ''];
  if (normalizedRecord.maritalStatus && !validMaritalStatus.includes(normalizedRecord.maritalStatus.toLowerCase())) {
    warnings.push('Invalid marital status, will be set to empty');
  }

  // Validate employment type enum
  if (normalizedRecord.employmentType && !isValidEmploymentType(normalizedRecord.employmentType.toLowerCase())) {
    warnings.push('Invalid employment type, will be set to full-time');
  }

  // Validate status enum
  const validStatuses = ['active', 'inactive', 'terminated', 'on-leave'];
  if (normalizedRecord.status && !validStatuses.includes(normalizedRecord.status.toLowerCase())) {
    warnings.push('Invalid status, will be set to active');
  }

  // Check for duplicate email using tenant-aware model
  if (normalizedRecord.email) {
    const EmployeeModel = getTenantModel(tenantConnection, 'Employee', Employee.schema);
    const existingEmployee = await EmployeeModel.findOne({ email: normalizedRecord.email.toLowerCase() });
    if (existingEmployee) {
      errors.push(`Email already exists for employee: ${existingEmployee.firstName} ${existingEmployee.lastName}`);
    }
  }

  // Check for duplicate employee code if provided using tenant-aware model
  if (normalizedRecord.employeeCode) {
    const EmployeeModel = getTenantModel(tenantConnection, 'Employee', Employee.schema);
    const existingCode = await EmployeeModel.findOne({ employeeCode: normalizedRecord.employeeCode });
    if (existingCode) {
      errors.push(`Employee code already exists: ${normalizedRecord.employeeCode}`);
    }
  }

  // Validate department exists using tenant-aware model
  if (normalizedRecord.department) {
    const department = await findDepartment(normalizedRecord.department, tenantConnection);
    if (!department) {
      errors.push(`Department not found: ${normalizedRecord.department}`);
    }
  }

  return {
    rowIndex,
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

// Transform CSV/Excel record to employee schema format
const transformRecord = async (record, tenantConnection) => {
  // Normalize field names from CSV headers
  const normalizedRecord = {};
  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = employeeFieldMapping[key.toLowerCase()] || key;
    normalizedRecord[normalizedKey] = value;
  }

  const department = await findDepartment(normalizedRecord.department, tenantConnection);
  
  const employee = {
    firstName: normalizedRecord.firstName?.trim(),
    lastName: normalizedRecord.lastName?.trim(),
    email: normalizedRecord.email?.trim().toLowerCase(),
    phone: normalizedRecord.phone?.trim(),
    department: department?._id,
    designation: normalizedRecord.designation?.trim(),
    joiningDate: new Date(normalizedRecord.joiningDate),
    employmentType: normalizedRecord.employmentType?.toLowerCase() || 'full-time',
    status: normalizedRecord.status?.toLowerCase() || 'active',
  };

  // Optional employee code
  if (normalizedRecord.employeeCode && normalizedRecord.employeeCode.trim()) {
    employee.employeeCode = normalizedRecord.employeeCode.trim();
  }

  // Optional fields
  if (normalizedRecord.dateOfBirth && isValidDate(normalizedRecord.dateOfBirth)) {
    employee.dateOfBirth = new Date(normalizedRecord.dateOfBirth);
  }
  if (normalizedRecord.gender) {
    employee.gender = normalizedRecord.gender.toLowerCase();
  }
  if (normalizedRecord.bloodGroup) {
    employee.bloodGroup = normalizedRecord.bloodGroup;
  }
  if (normalizedRecord.maritalStatus) {
    employee.maritalStatus = normalizedRecord.maritalStatus.toLowerCase();
  }
  if (normalizedRecord.alternatePhone) {
    employee.alternatePhone = normalizedRecord.alternatePhone.trim();
  }

  // Address
  employee.address = {
    street: normalizedRecord.street || '',
    city: normalizedRecord.city || '',
    state: normalizedRecord.state || '',
    zipCode: normalizedRecord.zipCode || '',
    country: normalizedRecord.country || ''
  };

  // Salary
  employee.salary = {
    basic: parseFloat(normalizedRecord.basicSalary) || 0,
    hra: parseFloat(normalizedRecord.hra) || 0,
    allowances: parseFloat(normalizedRecord.allowances) || 0,
    deductions: parseFloat(normalizedRecord.deductions) || 0,
    total: (parseFloat(normalizedRecord.basicSalary) || 0) +
           (parseFloat(normalizedRecord.hra) || 0) +
           (parseFloat(normalizedRecord.allowances) || 0) -
           (parseFloat(normalizedRecord.deductions) || 0)
  };

  // Bank Details
  employee.bankDetails = {
    accountNumber: normalizedRecord.accountNumber || '',
    bankName: normalizedRecord.bankName || '',
    ifscCode: normalizedRecord.ifscCode || '',
    accountHolderName: normalizedRecord.accountHolderName || '',
    branch: normalizedRecord.branch || ''
  };

  // Emergency Contact
  employee.emergencyContact = {
    name: normalizedRecord.emergencyContactName || '',
    relationship: normalizedRecord.emergencyContactRelation || '',
    phone: normalizedRecord.emergencyContactPhone || ''
  };

  return employee;
};

// @desc    Validate bulk employee data
// @route   POST /api/employees/bulk/validate
// @access  Private (Admin, HR)
exports.validateBulkEmployees = async (req, res) => {
  try {
    const { employees } = req.body;

    if (!employees || !Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No employee data provided'
      });
    }

    const validationResults = [];
    let validCount = 0;
    let invalidCount = 0;

    for (let i = 0; i < employees.length; i++) {
      const validation = await validateEmployeeRecord(employees[i], i + 1, req.tenant.connection);
      validationResults.push({
        row: i + 1,
        data: employees[i],
        ...validation
      });

      if (validation.isValid) {
        validCount++;
      } else {
        invalidCount++;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        total: employees.length,
        valid: validCount,
        invalid: invalidCount,
        results: validationResults
      }
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Bulk create employees
// @route   POST /api/employees/bulk/create
// @access  Private (Admin, HR)
exports.bulkCreateEmployees = async (req, res) => {
  try {
    const { employees } = req.body;

    if (!employees || !Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No employee data provided'
      });
    }

    // Validate all records first
    const validationResults = [];
    const validRecords = [];
    let skippedCount = 0;

    for (let i = 0; i < employees.length; i++) {
      const validation = await validateEmployeeRecord(employees[i], i + 1, req.tenant.connection);
      
      if (validation.isValid) {
        validRecords.push(employees[i]);
      } else {
        skippedCount++;
        validationResults.push({
          row: i + 1,
          data: employees[i],
          errors: validation.errors
        });
      }
    }

    // Transform and create valid records using tenant-aware model
    const createdEmployees = [];
    const errors = [];
    const EmployeeModel = getTenantModel(req.tenant.connection, 'Employee', Employee.schema);

    for (let i = 0; i < validRecords.length; i++) {
      try {
        const transformedData = await transformRecord(validRecords[i], req.tenant.connection);
        const employee = await EmployeeModel.create(transformedData);
        createdEmployees.push(employee);
      } catch (error) {
        errors.push({
          row: i + 1,
          data: validRecords[i],
          error: error.message
        });
        skippedCount++;
      }
    }

    res.status(201).json({
      success: true,
      message: `${createdEmployees.length} employees added successfully${skippedCount > 0 ? `, ${skippedCount} skipped due to validation errors` : ''}`,
      data: {
        created: createdEmployees.length,
        skipped: skippedCount,
        total: employees.length,
        employees: createdEmployees,
        errors: validationResults.concat(errors)
      }
    });
  } catch (error) {
    console.error('Bulk create error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get sample CSV template
// @route   GET /api/employees/bulk/template
// @access  Private
exports.getTemplate = async (req, res) => {
  try {
    const sampleData = [
      {
        employeeCode: 'EMP00001',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '1234567890',
        dateOfBirth: '1990-01-15',
        gender: 'male',
        bloodGroup: 'O+',
        maritalStatus: 'married',
        alternatePhone: '9876543210',
        street: '123 Main Street',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA',
        department: 'Engineering',
        designation: 'Software Engineer',
        joiningDate: '2024-01-01',
        employmentType: 'full-time',
        status: 'active',
        basicSalary: '50000',
        hra: '10000',
        allowances: '5000',
        deductions: '2000',
        accountNumber: '1234567890',
        bankName: 'ABC Bank',
        ifscCode: 'ABCD0123456',
        accountHolderName: 'John Doe',
        branch: 'Main Branch',
        emergencyContactName: 'Jane Doe',
        emergencyContactRelationship: 'Spouse',
        emergencyContactPhone: '1112223333'
      }
    ];

    res.status(200).json({
      success: true,
      data: sampleData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = exports;
