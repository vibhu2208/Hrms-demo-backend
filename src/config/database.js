const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    console.error(`⚠️  Server will continue running but database operations may fail.`);
    console.error(`💡 Please check your MongoDB connection string and network connectivity.`);
    // Don't exit - allow server to start even if DB connection fails
    // This allows frontend to work while DB issues are resolved
  }
};

module.exports = connectDB;
