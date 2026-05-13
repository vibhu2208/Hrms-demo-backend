# Role Hierarchy Analysis

## Current System vs Desired Structure

### **CURRENT ROLES** (from tenantPermissions.js):
```
1. ADMIN (Level 1)
2. HR_MANAGER (Level 2) 
3. FINANCE_MANAGER (Level 2)
4. DEPARTMENT_HEAD (Level 3)
5. MANAGER (Level 4)
6. HR_EXECUTIVE (Level 5)
7. FINANCE_EXECUTIVE (Level 5)
8. IT_ADMIN (Level 5)
9. EMPLOYEE (Level 6)
```

### **DESIRED ROLES** (your specification):
```
1. ADMIN / COMPANY ADMIN
   - Full system control
   - Creates projects
   - Creates managers and HR users
   - Assigns managers to projects
   - Assigns HRs to managers (team formation)

2. MANAGER
   - Assigned by Admin
   - Can work on multiple projects
   - Can have multiple HRs
   - Sees only: Projects assigned to them, HRs assigned to them

3. HR
   - Can belong to multiple teams
   - Works under different managers for different projects
   - Sees only: Projects + manager contexts they are assigned to
```

## **GAPS IDENTIFIED**:

### **Missing Features**:
1. **Project Management System** - No project assignments in current system
2. **Team Formation** - No manager-HR assignment relationships
3. **Project-Based Access Control** - Current system is department-based
4. **Multi-Team HR Support** - HRs can't work under multiple managers
5. **Project Context Filtering** - No project-based data filtering

### **Current System Issues**:
1. **Too Many Roles** - 9 roles vs 3 needed
2. **Department-Focused** - Based on departments, not projects
3. **Static Teams** - No dynamic team formation
4. **Limited Scope** - Managers see department data, not project-specific data

## **RECOMMENDED SOLUTION**:

### **Simplified Role Structure**:
```
1. COMPANY_ADMIN (replaces ADMIN)
2. MANAGER (keep but enhance)
3. HR (new simplified role)
4. EMPLOYEE (keep)
```

### **New Database Schema Needed**:
```javascript
// Projects Collection
{
  _id: ObjectId,
  name: String,
  description: String,
  status: String, // active, completed, on-hold
  assignedManagers: [ObjectId], // Manager IDs
  assignedHRs: [ObjectId], // HR IDs
  startDate: Date,
  endDate: Date,
  createdBy: ObjectId, // Admin who created
  createdAt: Date
}

// Manager-HR Assignments
{
  _id: ObjectId,
  managerId: ObjectId,
  hrId: ObjectId,
  projectId: ObjectId,
  role: String, // 'lead_hr', 'support_hr', etc.
  assignedBy: ObjectId, // Admin who assigned
  assignedAt: Date
}

// User Projects (for tracking assignments)
{
  _id: ObjectId,
  userId: ObjectId,
  projectId: ObjectId,
  role: String, // 'manager', 'hr', 'employee'
  assignedBy: ObjectId,
  assignedAt: Date
}
```

### **Permission Matrix Update**:
```javascript
const PROJECT_PERMISSIONS = {
  PROJECT_CREATE: 'project_create',
  PROJECT_ASSIGN_MANAGER: 'project_assign_manager',
  PROJECT_ASSIGN_HR: 'project_assign_hr',
  PROJECT_VIEW_ASSIGNED: 'project_view_assigned',
  PROJECT_VIEW_ALL: 'project_view_all',
  PROJECT_MANAGE_TEAM: 'project_manage_team',
  PROJECT_VIEW_TEAM: 'project_view_team'
};
```

## **Migration Strategy**:

### **Phase 1: Database Schema**
1. Add Projects collection
2. Add Manager-HR assignment collection
3. Add User-Project assignment collection

### **Phase 2: Role Simplification**
1. Map existing roles to new structure:
   - ADMIN → COMPANY_ADMIN
   - MANAGER → MANAGER (enhanced)
   - HR_MANAGER, HR_EXECUTIVE → HR
   - Remove: FINANCE_*, IT_ADMIN, DEPARTMENT_HEAD

### **Phase 3: Permission System**
1. Update permission matrix for project-based access
2. Implement project-scoped data filtering
3. Add team formation functionality

### **Phase 4: UI Updates**
1. Admin panel: Project creation and assignment
2. Manager dashboard: Project-specific views
3. HR dashboard: Multi-project context
4. Data filtering based on project assignments

## **Benefits of New Structure**:
✅ **Simplified Roles** - 4 roles instead of 9  
✅ **Project-Based** - Aligns with actual work structure  
✅ **Flexible Teams** - HRs can work with multiple managers  
✅ **Clear Access** - Users see only relevant project data  
✅ **Scalable** - Easy to add new projects and teams  

Would you like me to create the migration scripts to implement this new role structure?
