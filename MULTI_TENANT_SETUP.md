# Multi-Tenant HRMS Setup Documentation

## Overview

This document describes the multi-tenant architecture implementation for the HRMS system, where each client company gets its own isolated database with automatic provisioning and admin user creation.

## Architecture

### Database Structure

1. **Main Database** (`hrms_main` or as configured in `MONGODB_URI`)
   - Stores global data
   - Contains the `companies` collection (tracks all tenant companies)
   - Contains super admin users
   - Contains system-wide configurations

2. **Tenant Databases** (`hrms_<company_name>`)
   - One database per client company
   - Automatically created when a company is added
   - Contains company-specific data (users, employees, departments, etc.)
   - Completely isolated from other tenants

### Example:
```
Main DB: hrms_main
  ├── companies (global)
  ├── users (super admins only)
  └── system_configs

Tenant DB: hrms_techthrive
  ├── users (company admins & employees)
  ├── employees
  ├── departments
  └── ... (all company-specific collections)

Tenant DB: hrms_acmecorp
  ├── users (company admins & employees)
  ├── employees
  ├── departments
  └── ... (all company-specific collections)
```

## Workflow: Adding a New Client Company

When a Super Admin adds a new client company, the following automated process occurs:

### Step 1: Company Creation
- Super Admin fills out the form with:
  - Company Name (e.g., "TechThrive")
  - Email (e.g., "admin@techthrive.com")
  - Phone Number
  - Optional: Address, Subscription details, Enabled modules

### Step 2: Validation
- System checks if company name or email already exists
- Validates required fields

### Step 3: Database Provisioning
- Automatically creates a new MongoDB database
- Database name format: `hrms_<sanitized_company_name>`
- Example: "TechThrive Solutions" → `hrms_techthrive_solutions`

### Step 4: Admin User Generation
- Generates a random secure password (8-10 characters, alphanumeric)
- Creates an admin user in the tenant database
- Password is hashed using bcrypt
- User is marked as `mustChangePassword: true` for first login

### Step 5: Database Initialization
- Creates default departments (HR, IT, Finance, Operations)
- Creates default designations (Manager, Team Lead, etc.)
- Sets up initial collections and indexes

### Step 6: Email Notification
- Sends a professional welcome email to the company admin email
- Email contains:
  - Company Name
  - Admin Email (login username)
  - Temporary Password
  - Login URL
  - Security instructions
  - Getting started guide

### Step 7: Record Keeping
- Saves company record in global database
- Logs the action in audit trail
- Updates company status to "active"

## API Endpoints

### Create Company (Super Admin Only)

**Endpoint:** `POST /api/superadmin/clients`

**Headers:**
```json
{
  "Authorization": "Bearer <super_admin_token>",
  "Content-Type": "application/json"
}
```

**Request Body:**
```json
{
  "companyName": "TechThrive Solutions",
  "email": "admin@techthrive.com",
  "phone": "+1234567890",
  "address": {
    "street": "123 Tech Street",
    "city": "San Francisco",
    "state": "CA",
    "zipCode": "94105",
    "country": "USA"
  },
  "subscription": {
    "plan": "professional",
    "maxEmployees": 100,
    "maxAdmins": 3
  },
  "enabledModules": ["hr", "payroll", "attendance", "recruitment"]
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Company created successfully. Admin credentials have been sent via email.",
  "data": {
    "company": {
      "id": "507f1f77bcf86cd799439011",
      "companyCode": "COMP00001",
      "companyName": "TechThrive Solutions",
      "email": "admin@techthrive.com",
      "phone": "+1234567890",
      "databaseName": "hrms_techthrive_solutions",
      "databaseStatus": "active",
      "status": "active",
      "subscription": {
        "plan": "professional",
        "status": "active",
        "maxEmployees": 100,
        "maxAdmins": 3
      },
      "enabledModules": ["hr", "payroll", "attendance", "recruitment"],
      "adminUser": {
        "email": "admin@techthrive.com",
        "createdAt": "2025-11-11T06:53:00.000Z"
      },
      "createdAt": "2025-11-11T06:53:00.000Z"
    }
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Company with this name or email already exists",
  "error": "Duplicate company"
}
```

## Email Template

The admin receives a beautifully formatted email with:

### Email Subject
```
🎉 Welcome to HRMS - TechThrive Solutions Account Created
```

### Email Content
- Welcome message with company name
- Login credentials box with:
  - Company Name
  - Admin Email
  - Temporary Password
  - Login URL
- Security warnings and best practices
- Call-to-action button to login
- Getting started checklist
- Support contact information

## Security Features

### Password Security
- Random password generation (8-10 characters)
- Alphanumeric only (no special characters for easier typing)
- Excludes similar-looking characters (0, O, l, 1, I)
- Hashed using bcrypt (10 rounds) before storage
- Never stored in plain text anywhere except the email

### First Login Flow
1. Admin receives email with temporary password
2. Logs in with email and temporary password
3. System detects `isFirstLogin: true` and `mustChangePassword: true`
4. Forces password change before accessing the system
5. After password change, full access is granted

### Database Isolation
- Each company has its own database
- No cross-tenant data access possible
- Connection strings are dynamically generated
- Tenant connections are properly closed after operations

## File Structure

```
hrms-backend/
├── src/
│   ├── models/
│   │   ├── Company.js              # Global company model
│   │   ├── Client.js               # Legacy client model (can be deprecated)
│   │   └── User.js                 # User model (used in both main & tenant DBs)
│   ├── controllers/
│   │   └── superAdminController.js # Contains createClient function
│   ├── utils/
│   │   ├── databaseProvisioning.js # Tenant DB creation & management
│   │   └── generatePassword.js     # Password generation utilities
│   ├── services/
│   │   └── emailService.js         # Email sending (includes sendCompanyAdminCredentials)
│   └── routes/
│       └── superAdminRoutes.js     # Super admin API routes
└── MULTI_TENANT_SETUP.md          # This documentation
```

## Environment Variables Required

Add these to your `.env` file:

```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/hrms_main

# Email Configuration (Gmail)
EMAIL_USER=your-email@gmail.com
EMAIL_APP_PASSWORD=your-app-specific-password

# OR Custom SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password

# Frontend URL (for login links in emails)
FRONTEND_URL=http://localhost:5173

# JWT Secret
JWT_SECRET=your-jwt-secret-key
```

## Testing the Implementation

### 1. Create a Super Admin User (if not exists)
```javascript
// Run this in MongoDB shell or create via API
db.users.insertOne({
  email: "superadmin@hrms.com",
  password: "$2a$10$hashed_password_here", // Hash your password first
  role: "superadmin",
  isActive: true,
  createdAt: new Date()
});
```

### 2. Login as Super Admin
```bash
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "superadmin@hrms.com",
  "password": "your-password"
}
```

### 3. Create a New Company
```bash
POST http://localhost:5000/api/superadmin/clients
Authorization: Bearer <super_admin_token>
Content-Type: application/json

{
  "companyName": "Test Company",
  "email": "admin@testcompany.com",
  "phone": "+1234567890"
}
```

### 4. Check Email
- Check the inbox of `admin@testcompany.com`
- You should receive the welcome email with credentials

### 5. Login as Company Admin
```bash
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "admin@testcompany.com",
  "password": "<password-from-email>"
}
```

### 6. Verify Database Creation
```bash
# In MongoDB shell
show dbs
# Should show: hrms_test_company

use hrms_test_company
show collections
# Should show: users, departments, designations, etc.
```

## Troubleshooting

### Issue: Email not sending
**Solution:**
- Check `EMAIL_USER` and `EMAIL_APP_PASSWORD` in `.env`
- For Gmail, enable 2FA and create an App Password
- Check console logs for email errors
- Email failure doesn't stop company creation

### Issue: Database not created
**Solution:**
- Check MongoDB connection string
- Ensure MongoDB user has permission to create databases
- Check console logs for database creation errors

### Issue: Company creation fails
**Solution:**
- Check if company name or email already exists
- Verify all required fields are provided
- Check MongoDB connection
- Review server logs for detailed error messages

### Issue: Admin can't login
**Solution:**
- Verify email address is correct
- Check if password was copied correctly (no extra spaces)
- Ensure the tenant database was created successfully
- Check if user exists in the tenant database

## Future Enhancements

1. **Custom Subdomains**
   - Each company gets a subdomain (e.g., `techthrive.hrms.com`)
   - Automatic subdomain routing to tenant database

2. **Database Migration Tools**
   - Migrate data between tenant databases
   - Backup and restore individual tenant databases

3. **Usage Analytics**
   - Track storage usage per tenant
   - Monitor API calls and resource consumption
   - Billing based on usage

4. **Multi-Region Support**
   - Deploy tenant databases in different regions
   - Comply with data residency requirements

5. **Advanced Security**
   - IP whitelisting per tenant
   - Two-factor authentication for admins
   - SSO integration (SAML, OAuth)

## Support

For issues or questions:
- Check server logs: `npm run dev`
- Review MongoDB logs
- Contact: support@hrms.com

---

**Last Updated:** November 11, 2025
**Version:** 1.0.0
