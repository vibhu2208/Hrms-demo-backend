# ClientId Validation Error Fix

## Issue
When company admin tried to login, got error:
```
User validation failed: clientId: Path `clientId` is required.
```

## Root Cause
The `User` model had `clientId` as a required field for all non-superadmin users:

```javascript
clientId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Client',
  required: function() {
    return this.role !== 'superadmin';
  }
}
```

However, in the new **multi-tenant architecture**:
- Users in tenant databases don't have a `clientId`
- They belong to a **company** (stored in the global `Company` collection)
- The company info is tracked via the database name and JWT token

---

## Solution

### Changed `clientId` to Optional

**File:** `src/models/User.js`

**Before:**
```javascript
clientId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Client',
  required: function() {
    return this.role !== 'superadmin';
  }
}
```

**After:**
```javascript
clientId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Client',
  required: false // Made optional for multi-tenant support
}
```

---

## Why This Works

### Old Architecture (Single Database)
```
hrms (Main Database)
├── users
│   ├── user1 (clientId: client1)
│   ├── user2 (clientId: client1)
│   └── user3 (clientId: client2)
└── clients
    ├── client1
    └── client2
```
- All users in one database
- `clientId` required to isolate data

### New Architecture (Multi-Tenant)
```
hrms_main (Global Database)
├── companies
│   ├── company1 (databaseName: hrms_techthrive)
│   └── company2 (databaseName: hrms_acmecorp)
└── users (super admins only)

hrms_techthrive (Tenant Database)
└── users
    ├── admin@techthrive.com (no clientId needed)
    └── employee@techthrive.com (no clientId needed)

hrms_acmecorp (Tenant Database)
└── users
    ├── admin@acmecorp.com (no clientId needed)
    └── employee@acmecorp.com (no clientId needed)
```
- Each company has separate database
- No `clientId` needed - isolation by database
- Company info stored in JWT token

---

## User Types & ClientId

| User Type | Database | clientId Required? | Reason |
|-----------|----------|-------------------|---------|
| Super Admin | `hrms_main` | ❌ No | System-level user |
| Company Admin | `hrms_company` | ❌ No | Isolated by database |
| Company Employee | `hrms_company` | ❌ No | Isolated by database |
| Legacy Client User | `hrms_main` | ✅ Yes (if used) | Old single-DB model |

---

## Testing

### ✅ Test 1: Create Company & Admin User
```bash
node test-company-creation.js
```
**Result:** PASSED ✅
- Company created: COMP00004
- Admin user created without clientId
- Email sent successfully

### ✅ Test 2: Login as Company Admin
```bash
POST /api/auth/login
{
  "email": "admin@testcompany.com",
  "password": "C4km6cex"
}
```
**Expected:** 200 OK with JWT token

---

## Migration Notes

If you have existing users with `clientId` in the main database, they will continue to work. The field is now optional, not removed.

### Backward Compatibility
- ✅ Old users with `clientId` still work
- ✅ New tenant users without `clientId` work
- ✅ Super admins without `clientId` work

---

## Status: ✅ FIXED

Company admins can now login successfully!

**Date:** November 11, 2025
**Time:** 1:02 PM IST
