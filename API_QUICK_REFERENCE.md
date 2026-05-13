# Multi-Tenant HRMS - API Quick Reference

## 🚀 Quick Start Guide

### 1. Super Admin - Create New Company

**Endpoint:** `POST /api/superadmin/clients`

**Authentication:** Super Admin Bearer Token Required

**Minimal Request:**
```json
{
  "companyName": "TechThrive Solutions",
  "email": "admin@techthrive.com",
  "phone": "+1234567890"
}
```

**Full Request (All Options):**
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
  "enabledModules": ["hr", "payroll", "attendance", "recruitment", "performance"]
}
```

**Success Response:**
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
      "enabledModules": ["hr", "payroll", "attendance", "recruitment", "performance"],
      "adminUser": {
        "email": "admin@techthrive.com",
        "createdAt": "2025-11-11T06:53:00.000Z"
      },
      "createdAt": "2025-11-11T06:53:00.000Z"
    }
  }
}
```

---

### 2. Company Admin - First Login

**Endpoint:** `POST /api/auth/login`

**Request:**
```json
{
  "email": "admin@techthrive.com",
  "password": "Abc123xyz"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439012",
      "email": "admin@techthrive.com",
      "role": "admin",
      "isFirstLogin": true,
      "mustChangePassword": true,
      "themePreference": "dark"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Note:** If `isFirstLogin: true` or `mustChangePassword: true`, redirect user to change password page.

---

### 3. Company Admin - Change Password

**Endpoint:** `POST /api/auth/change-password`

**Authentication:** Bearer Token Required

**Request:**
```json
{
  "currentPassword": "Abc123xyz",
  "newPassword": "MyNewSecurePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

## 📋 Complete API Endpoints

### Super Admin Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/superadmin/dashboard/stats` | Get dashboard statistics | Super Admin |
| GET | `/api/superadmin/dashboard/health` | Get system health | Super Admin |
| GET | `/api/superadmin/clients` | List all companies | Super Admin |
| GET | `/api/superadmin/clients/:id` | Get company details | Super Admin |
| POST | `/api/superadmin/clients` | Create new company | Super Admin |
| PUT | `/api/superadmin/clients/:id` | Update company | Super Admin |
| PATCH | `/api/superadmin/clients/:id/status` | Update company status | Super Admin |
| PATCH | `/api/superadmin/clients/:id/subscription` | Update subscription | Super Admin |
| DELETE | `/api/superadmin/clients/:id` | Delete company | Super Admin |

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login user | No |
| GET | `/api/auth/me` | Get current user | Yes |
| POST | `/api/auth/change-password` | Change password | Yes |
| POST | `/api/auth/forgot-password` | Request password reset | No |
| POST | `/api/auth/reset-password` | Reset password | No |

---

## 🔐 Authentication

All authenticated requests must include the JWT token in the Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📧 Email Notifications

### Company Admin Welcome Email

**Sent automatically when company is created**

**Contains:**
- Company Name
- Admin Email (login username)
- Temporary Password
- Login URL
- Security instructions
- Getting started guide

**Subject:** `🎉 Welcome to HRMS - [Company Name] Account Created`

---

## 🗄️ Database Structure

### Main Database: `hrms_main`
- `companies` - All client companies
- `users` - Super admin users only
- `packages` - Subscription packages
- `systemconfigs` - System configurations
- `auditlogs` - Audit trail

### Tenant Database: `hrms_<company_name>`
- `users` - Company admins and employees
- `employees` - Employee details
- `departments` - Company departments
- `designations` - Job designations
- `attendance` - Attendance records
- `leaves` - Leave applications
- `projects` - Projects
- `candidates` - Recruitment candidates
- ... (all company-specific data)

---

## 🧪 Testing with cURL

### Create Company
```bash
curl -X POST http://localhost:5000/api/superadmin/clients \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "Test Company",
    "email": "admin@testcompany.com",
    "phone": "+1234567890"
  }'
```

### Login as Company Admin
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@testcompany.com",
    "password": "Abc123xyz"
  }'
```

### Get Current User
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🧪 Testing with Postman

### 1. Import Collection

Create a new Postman collection with these requests:

**Environment Variables:**
```
base_url: http://localhost:5000
super_admin_token: <your_super_admin_token>
company_admin_token: <company_admin_token>
```

### 2. Create Company Request

```
POST {{base_url}}/api/superadmin/clients
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json

Body:
{
  "companyName": "Test Company",
  "email": "admin@testcompany.com",
  "phone": "+1234567890"
}
```

### 3. Login Request

```
POST {{base_url}}/api/auth/login
Content-Type: application/json

Body:
{
  "email": "admin@testcompany.com",
  "password": "Abc123xyz"
}

Tests (to save token):
pm.environment.set("company_admin_token", pm.response.json().data.token);
```

---

## 🐛 Common Issues & Solutions

### Issue: "Company with this name or email already exists"
**Solution:** Use a different company name or email address.

### Issue: "Email transporter not configured"
**Solution:** Set `EMAIL_USER` and `EMAIL_APP_PASSWORD` in `.env` file.

### Issue: "Failed to create tenant database"
**Solution:** 
- Check MongoDB connection
- Ensure MongoDB user has permission to create databases
- Verify `MONGODB_URI` in `.env`

### Issue: "Invalid credentials" on login
**Solution:**
- Check email address (case-sensitive)
- Verify password from email
- Ensure no extra spaces when copying password

### Issue: Token expired
**Solution:** Login again to get a new token.

---

## 📊 Response Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Authentication required or failed |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 500 | Server Error | Internal server error |

---

## 🔒 Security Best Practices

1. **Never share JWT tokens** - Each user should have their own token
2. **Change password on first login** - Temporary passwords should be changed immediately
3. **Use HTTPS in production** - Never send credentials over HTTP
4. **Store tokens securely** - Use secure storage (not localStorage for sensitive apps)
5. **Implement token refresh** - Refresh tokens before they expire
6. **Log out properly** - Clear tokens on logout
7. **Monitor failed login attempts** - Implement rate limiting

---

## 📞 Support

For issues or questions:
- Check server logs: `npm run dev`
- Review MongoDB logs
- Check email service logs
- Contact: support@hrms.com

---

**Last Updated:** November 11, 2025
