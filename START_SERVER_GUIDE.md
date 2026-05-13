# 🚀 Start Server Guide - Fix "Failed to fetch dashboard data"

## **❌ Problem**: Backend server is not running

## **🔧 Solution**: Start your backend server

### **Step 1: Open Terminal**
Navigate to your backend directory:
```
cd C:\Users\vaibh\OneDrive\Desktop\Reseachpaper\hrms-spc\hrms-backend
```

### **Step 2: Start the Server**
```bash
npm start
```

### **Step 3: Wait for Server to Start**
You should see output like:
```
🚀 Server running in development mode on port 5000
📡 API Base URL: http://localhost:5000
🌐 Allowed Origins: http://localhost:3000,http://localhost:5173
```

### **Step 4: Test the Connection**
Once server is running, run:
```bash
node testAPIConnection.js
```

## **🔍 What This Will Test**:

1. ✅ **Server Health Check** - Verifies server is running
2. ✅ **Authentication** - Tests admin login
3. ✅ **SPC Dashboard** - Tests `/api/spc/dashboard` endpoint
4. ✅ **Projects Endpoint** - Tests `/api/spc/projects` endpoint

## **🎯 Expected Results**:

```
✅ Server is running: HRMS API is running
✅ Authentication successful
✅ SPC dashboard endpoint working
✅ Projects endpoint working
🎉 API Connection Test Complete!
```

## **🚨 After Server Starts**:

### **Frontend Will Work**:
- ✅ Navigation to "Projects" in sidebar
- ✅ Project creation modal will load
- ✅ Team assignment will work
- ✅ All SPC features will be functional

### **Admin Can**:
- ✅ Create projects
- ✅ Assign managers and HRs
- ✅ Form teams
- ✅ Manage complete project lifecycle

## **🔧 If Issues Persist**:

### **Common Problems**:
1. **Port 5000 is in use**:
   ```bash
   netstat -ano | findstr :5000
   ```
   Kill the process using the PID

2. **MongoDB Connection Error**:
   - Check your `.env` file
   - Verify MongoDB Atlas connection string
   - Check network access

3. **Authentication Issues**:
   - Verify admin credentials
   - Check JWT token generation

## **📱 Once Server is Running**:

1. **Start Frontend** (if not already running):
   ```bash
   cd C:\Users\vaibh\OneDrive\Desktop\Reseachpaper\hrms-spc\hrms-frontend-spc
   npm start
   ```

2. **Login as Admin**:
   - Email: `admin@company.com`
   - Password: [Your admin password]

3. **Navigate to Projects**:
   - Click "Projects" in the sidebar
   - Start creating projects!

## **🎉 Success Indicators**:

✅ **Server Running**: Backend API is active  
✅ **Authentication Working**: Admin can login  
✅ **SPC Endpoints Active**: Project system is functional  
✅ **Frontend Connected**: Dashboard data loads successfully  
✅ **Project Creation**: Admin can create and manage projects  

**The "Failed to fetch dashboard data" error will be resolved once the server is running!** 🚀
