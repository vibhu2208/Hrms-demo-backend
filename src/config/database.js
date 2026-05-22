const connectDB = async () => {
  const mongoose = require('mongoose');
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    console.error(`⚠️  Server will continue running but database operations may fail.`);
    console.error(`💡 Please check your MongoDB connection string and network connectivity.`);
  }
};

module.exports = connectDB;
