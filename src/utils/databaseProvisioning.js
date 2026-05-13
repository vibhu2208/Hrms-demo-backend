const mongoose = require('mongoose');

/**
 * Database Provisioning Utility
 * Handles creation and management of tenant-specific databases
 */

/**
 * Create a new tenant database
 * @param {string} databaseName - Name of the database to create (e.g., hrms_techthrive)
 * @returns {Promise<Object>} Connection object and status
 */
const createTenantDatabase = async (databaseName) => {
  try {
    console.log(`🔧 Creating tenant database: ${databaseName}`);
    
    // Get base MongoDB URI without database name
    const baseUri = process.env.MONGODB_URI.split('/').slice(0, -1).join('/');
    const tenantUri = `${baseUri}/${databaseName}`;
    
    // Create connection to the new database
    const tenantConnection = await mongoose.createConnection(tenantUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`✅ Tenant database created: ${databaseName}`);
    
    // Initialize collections by creating a test document
    // This ensures the database is actually created in MongoDB
    const testCollection = tenantConnection.collection('_init');
    await testCollection.insertOne({ 
      initialized: true, 
      createdAt: new Date() 
    });
    
    // Delete the test document
    await testCollection.deleteOne({ initialized: true });
    
    return {
      success: true,
      connection: tenantConnection,
      databaseName,
      uri: tenantUri
    };
  } catch (error) {
    console.error(`❌ Error creating tenant database ${databaseName}:`, error);
    throw new Error(`Failed to create tenant database: ${error.message}`);
  }
};

/**
 * Get connection to a tenant database
 * @param {string} databaseName - Name of the database
 * @returns {Promise<Connection>} Mongoose connection object
 */
const getTenantConnection = async (databaseName) => {
  try {
    const baseUri = process.env.MONGODB_URI.split('/').slice(0, -1).join('/');
    const tenantUri = `${baseUri}/${databaseName}`;
    
    const connection = await mongoose.createConnection(tenantUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    return connection;
  } catch (error) {
    console.error(`❌ Error connecting to tenant database ${databaseName}:`, error);
    throw new Error(`Failed to connect to tenant database: ${error.message}`);
  }
};

/**
 * Create admin user in tenant database
 * @param {Connection} tenantConnection - Mongoose connection to tenant database
 * @param {Object} adminData - Admin user data
 * @returns {Promise<Object>} Created admin user
 */
const createTenantAdminUser = async (tenantConnection, adminData) => {
  try {
    const bcrypt = require('bcryptjs');
    
    // Define User schema for tenant database
    const userSchema = new mongoose.Schema({
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
      },
      password: {
        type: String,
        required: true
      },
      role: {
        type: String,
        enum: ['admin', 'hr', 'employee'],
        default: 'admin'
      },
      isActive: {
        type: Boolean,
        default: true
      },
      isFirstLogin: {
        type: Boolean,
        default: true
      },
      mustChangePassword: {
        type: Boolean,
        default: true
      },
      lastLogin: Date,
      passwordChangedAt: Date,
      themePreference: {
        type: String,
        default: 'dark'
      }
    }, {
      timestamps: true
    });
    
    // Hash password before saving
    userSchema.pre('save', async function(next) {
      if (!this.isModified('password')) return next();
      this.password = await bcrypt.hash(this.password, 10);
      next();
    });
    
    // Method to compare password
    userSchema.methods.comparePassword = async function(candidatePassword) {
      return await bcrypt.compare(candidatePassword, this.password);
    };
    
    // Create User model for this tenant
    const TenantUser = tenantConnection.model('User', userSchema);
    
    // Create admin user
    const adminUser = await TenantUser.create({
      email: adminData.email,
      password: adminData.password,
      role: 'admin',
      isActive: true,
      isFirstLogin: true,
      mustChangePassword: true
    });
    
    console.log(`✅ Admin user created in tenant database: ${adminData.email}`);
    
    return {
      success: true,
      userId: adminUser._id,
      email: adminUser.email,
      role: adminUser.role
    };
  } catch (error) {
    console.error('❌ Error creating tenant admin user:', error);
    throw new Error(`Failed to create tenant admin user: ${error.message}`);
  }
};

/**
 * Initialize tenant database with default data
 * @param {Connection} tenantConnection - Mongoose connection to tenant database
 * @param {Object} companyData - Company information
 * @returns {Promise<Object>} Initialization result
 */
const initializeTenantDatabase = async (tenantConnection, companyData) => {
  try {
    console.log(`🔧 Initializing tenant database with default data...`);
    
    // Create default departments
    const departmentSchema = new mongoose.Schema({
      name: { type: String, required: true },
      code: { type: String, required: true },
      description: String,
      isActive: { type: Boolean, default: true }
    }, { timestamps: true });
    
    const Department = tenantConnection.model('Department', departmentSchema);
    
    const defaultDepartments = [
      { name: 'Human Resources', code: 'HR', description: 'Human Resources Department' },
      { name: 'Information Technology', code: 'IT', description: 'IT Department' },
      { name: 'Finance', code: 'FIN', description: 'Finance Department' },
      { name: 'Operations', code: 'OPS', description: 'Operations Department' }
    ];
    
    await Department.insertMany(defaultDepartments);
    
    // Create default designations
    const designationSchema = new mongoose.Schema({
      title: { type: String, required: true },
      level: String,
      description: String,
      isActive: { type: Boolean, default: true }
    }, { timestamps: true });
    
    const Designation = tenantConnection.model('Designation', designationSchema);
    
    const defaultDesignations = [
      { title: 'Manager', level: 'Senior', description: 'Department Manager' },
      { title: 'Team Lead', level: 'Mid', description: 'Team Lead' },
      { title: 'Senior Executive', level: 'Senior', description: 'Senior Executive' },
      { title: 'Executive', level: 'Junior', description: 'Executive' }
    ];
    
    await Designation.insertMany(defaultDesignations);
    
    console.log(`✅ Tenant database initialized with default data`);
    
    return {
      success: true,
      departmentsCreated: defaultDepartments.length,
      designationsCreated: defaultDesignations.length
    };
  } catch (error) {
    console.error('❌ Error initializing tenant database:', error);
    // Don't throw error - initialization is optional
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Delete tenant database (use with caution)
 * @param {string} databaseName - Name of the database to delete
 * @returns {Promise<Object>} Deletion result
 */
const deleteTenantDatabase = async (databaseName) => {
  try {
    console.log(`🗑️ Deleting tenant database: ${databaseName}`);
    
    const connection = await getTenantConnection(databaseName);
    await connection.dropDatabase();
    await connection.close();
    
    console.log(`✅ Tenant database deleted: ${databaseName}`);
    
    return {
      success: true,
      databaseName
    };
  } catch (error) {
    console.error(`❌ Error deleting tenant database ${databaseName}:`, error);
    throw new Error(`Failed to delete tenant database: ${error.message}`);
  }
};

/**
 * Check if tenant database exists
 * @param {string} databaseName - Name of the database
 * @returns {Promise<boolean>} True if database exists
 */
const tenantDatabaseExists = async (databaseName) => {
  try {
    const connection = await getTenantConnection(databaseName);
    const collections = await connection.db.listCollections().toArray();
    await connection.close();
    return collections.length > 0;
  } catch (error) {
    return false;
  }
};

module.exports = {
  createTenantDatabase,
  getTenantConnection,
  createTenantAdminUser,
  initializeTenantDatabase,
  deleteTenantDatabase,
  tenantDatabaseExists
};
