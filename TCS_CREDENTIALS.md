# TCS System - Login Credentials

## 🚀 Quick Start

Run the seeder to create all users:

```bash
cd hrms-backend
npm run seed:tcs
```

---

## 🔐 Login Credentials

### 1️⃣ Super Admin (Global System Access)

- **Email:** `superadmin@hrms.com`
- **Password:** `SuperAdmin@2025`
- **Role:** Super Admin
- **Access:** Super Admin Dashboard - All Companies
- **Login URL:** http://localhost:5173/login/super-admin
- **Database:** hrms_global

**Capabilities:**
- Manage all companies
- View system-wide analytics
- Configure global settings
- Onboard new companies
- Manage subscription plans

---

### 2️⃣ Company Admin (TCS - Full Company Access)

- **Email:** `admin@tcs.com`
- **Password:** `TCSAdmin@2025`
- **Role:** Company Admin
- **Company:** TCS
- **Access:** Full company management, all modules
- **Login URL:** http://localhost:5173/login/company
- **Database:** tenant_[companyId]

**Capabilities:**
- Full access to all TCS modules
- Create/manage HR, Managers, Employees
- Configure company settings
- View all reports and analytics
- Manage departments and roles

---

### 3️⃣ HR User (TCS - HR Management)

- **Email:** `hr@tcs.com`
- **Password:** `TCSHR@2025`
- **Role:** HR User
- **Company:** TCS
- **Access:** Employee, Recruitment, Attendance, Leaves
- **Login URL:** http://localhost:5173/login/company
- **Database:** tenant_[companyId]

**Capabilities:**
- Manage employees (create, update, view)
- Handle recruitment and onboarding
- Manage attendance and leaves
- Access HR reports
- Configure HR policies

---

### 4️⃣ Manager (TCS - Team Management)

- **Email:** `manager@tcs.com`
- **Password:** `TCSManager@2025`
- **Role:** Manager
- **Company:** TCS
- **Access:** Team reports, Leave approvals, Attendance
- **Login URL:** http://localhost:5173/login/company
- **Database:** tenant_[companyId]

**Capabilities:**
- View team members
- Approve/reject leave requests
- View team attendance
- Access team performance reports
- Manage team tasks

---

### 5️⃣ Employee (TCS - Self Service)

- **Email:** `employee@tcs.com`
- **Password:** `TCSEmployee@2025`
- **Role:** Employee
- **Company:** TCS
- **Department:** Engineering
- **Designation:** Software Engineer
- **Access:** Self-service portal, attendance, leaves
- **Login URL:** http://localhost:5173/login/company
- **Database:** tenant_[companyId]

**Capabilities:**
- View own profile and documents
- Apply for leaves
- Mark attendance
- View payslips
- Update personal information

---

## 📊 Quick Reference Table

| Role          | Email                | Password         | Database      |
|---------------|----------------------|------------------|---------------|
| Super Admin   | superadmin@hrms.com  | SuperAdmin@2025  | hrms_global   |
| Company Admin | admin@tcs.com        | TCSAdmin@2025    | tenant_*      |
| HR User       | hr@tcs.com           | TCSHR@2025       | tenant_*      |
| Manager       | manager@tcs.com      | TCSManager@2025  | tenant_*      |
| Employee      | employee@tcs.com     | TCSEmployee@2025 | tenant_*      |

---

## 🏢 Company Details

- **Company Name:** TCS (Tata Consultancy Services)
- **Company Code:** TCS00001
- **Subscription Plan:** Enterprise
- **Max Employees:** 10,000
- **Max Admins:** 50
- **Billing Cycle:** Yearly
- **Status:** Active

**Enabled Modules:**
- HR Management
- Payroll
- Timesheet
- Attendance
- Recruitment
- Performance Management
- Asset Management
- Learning & Development

---

## 🔄 Login Flow

### For Super Admin:
1. Go to http://localhost:5173/login
2. Click "Super Admin Login"
3. Enter: `superadmin@hrms.com` / `SuperAdmin@2025`
4. Access Super Admin Dashboard

### For Company Users (Admin, HR, Manager, Employee):
1. Go to http://localhost:5173/login
2. Click "Company Login"
3. Search for company: "TCS"
4. Select TCS from dropdown
5. Enter respective email and password
6. Access company dashboard based on role

---

## ⚠️ Important Notes

- **Security:** All passwords are temporary. Change them after first login.
- **Multi-tenancy:** Data is completely isolated between companies.
- **Hierarchy:** Super Admin → Company Admin → HR/Manager → Employee
- **Permissions:** Each role has specific permissions and access levels.
- **Database:** Super Admin uses global DB, company users use tenant DB.

---

## 🧪 Testing Scenarios

### Test Super Admin:
- View all companies
- Create new company
- Manage subscriptions
- View system analytics

### Test Company Admin:
- Create new HR user
- Create new employee
- Configure company settings
- View all reports

### Test HR User:
- Create new employee
- Schedule interview
- Manage attendance
- Process leaves

### Test Manager:
- View team members
- Approve leave request
- View team attendance
- Access team reports

### Test Employee:
- Apply for leave
- Mark attendance
- View payslip
- Update profile

---

## 📝 Additional Information

**Created by:** Seed script (`seedTCSSystem.js`)
**Last Updated:** 2025
**Environment:** Development
**MongoDB:** Local instance

For production deployment, ensure to:
1. Change all default passwords
2. Enable 2FA for admin accounts
3. Configure proper email SMTP (Brevo/SendGrid)
4. Set up backup and monitoring
5. Review and adjust role permissions
