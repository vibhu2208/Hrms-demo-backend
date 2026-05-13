/**
 * Tenant-Level RBAC Configuration
 * Phase 3: Role & Permission Integration for Offboarding Module
 */

// Tenant Role Definitions
const TENANT_ROLES = {
  ADMIN: 'admin',
  HR_MANAGER: 'hr_manager',
  HR_EXECUTIVE: 'hr_executive',
  FINANCE_MANAGER: 'finance_manager',
  FINANCE_EXECUTIVE: 'finance_executive',
  IT_ADMIN: 'it_admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
  DEPARTMENT_HEAD: 'department_head'
};

// Offboarding Module Permissions
const OFFBOARDING_PERMISSIONS = {
  // Initiation Permissions
  OFFBOARDING_INITIATE: 'offboarding_initiate',
  OFFBOARDING_INITIATE_SELF: 'offboarding_initiate_self',
  OFFBOARDING_INITIATE_TEAM: 'offboarding_initiate_team',
  OFFBOARDING_INITIATE_ANY: 'offboarding_initiate_any',

  // Management Permissions
  OFFBOARDING_MANAGE: 'offboarding_manage',
  OFFBOARDING_MANAGE_TEAM: 'offboarding_manage_team',
  OFFBOARDING_MANAGE_DEPARTMENT: 'offboarding_manage_department',
  OFFBOARDING_MANAGE_ALL: 'offboarding_manage_all',

  // Approval Permissions
  OFFBOARDING_APPROVE_MANAGER: 'offboarding_approve_manager',
  OFFBOARDING_APPROVE_HR: 'offboarding_approve_hr',
  OFFBOARDING_APPROVE_FINANCE: 'offboarding_approve_finance',
  OFFBOARDING_APPROVE_FINAL: 'offboarding_approve_final',

  // View Permissions
  OFFBOARDING_VIEW_SELF: 'offboarding_view_self',
  OFFBOARDING_VIEW_TEAM: 'offboarding_view_team',
  OFFBOARDING_VIEW_DEPARTMENT: 'offboarding_view_department',
  OFFBOARDING_VIEW_ALL: 'offboarding_view_all',

  // Task Management
  OFFBOARDING_TASK_ASSIGN: 'offboarding_task_assign',
  OFFBOARDING_TASK_COMPLETE: 'offboarding_task_complete',
  OFFBOARDING_TASK_VERIFY: 'offboarding_task_verify',
  OFFBOARDING_TASK_MANAGE: 'offboarding_task_manage',

  // Clearance Permissions
  OFFBOARDING_CLEARANCE_HR: 'offboarding_clearance_hr',
  OFFBOARDING_CLEARANCE_IT: 'offboarding_clearance_it',
  OFFBOARDING_CLEARANCE_FINANCE: 'offboarding_clearance_finance',
  OFFBOARDING_CLEARANCE_ADMIN: 'offboarding_clearance_admin',
  OFFBOARDING_CLEARANCE_SECURITY: 'offboarding_clearance_security',

  // Asset Management
  OFFBOARDING_ASSET_VIEW: 'offboarding_asset_view',
  OFFBOARDING_ASSET_MANAGE: 'offboarding_asset_manage',
  OFFBOARDING_ASSET_APPROVE: 'offboarding_asset_approve',

  // Settlement Permissions
  OFFBOARDING_SETTLEMENT_CALCULATE: 'offboarding_settlement_calculate',
  OFFBOARDING_SETTLEMENT_REVIEW: 'offboarding_settlement_review',
  OFFBOARDING_SETTLEMENT_APPROVE: 'offboarding_settlement_approve',
  OFFBOARDING_SETTLEMENT_PROCESS: 'offboarding_settlement_process',

  // Handover Permissions
  OFFBOARDING_HANDOVER_CREATE: 'offboarding_handover_create',
  OFFBOARDING_HANDOVER_MANAGE: 'offboarding_handover_manage',
  OFFBOARDING_HANDOVER_APPROVE: 'offboarding_handover_approve',

  // Feedback Permissions
  OFFBOARDING_FEEDBACK_CONDUCT: 'offboarding_feedback_conduct',
  OFFBOARDING_FEEDBACK_VIEW: 'offboarding_feedback_view',
  OFFBOARDING_FEEDBACK_ANALYZE: 'offboarding_feedback_analyze',

  // Closure Permissions
  OFFBOARDING_CLOSE: 'offboarding_close',
  OFFBOARDING_REOPEN: 'offboarding_reopen',
  OFFBOARDING_CANCEL: 'offboarding_cancel',

  // Reporting Permissions
  OFFBOARDING_REPORTS_VIEW: 'offboarding_reports_view',
  OFFBOARDING_REPORTS_EXPORT: 'offboarding_reports_export',
  OFFBOARDING_ANALYTICS_VIEW: 'offboarding_analytics_view'
};

// Permission Matrix for Tenant Roles
const TENANT_PERMISSION_MATRIX = {
  [TENANT_ROLES.ADMIN]: [
    // Full access to all offboarding operations
    OFFBOARDING_PERMISSIONS.OFFBOARDING_INITIATE_ANY,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_MANAGE_ALL,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_APPROVE_FINAL,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_VIEW_ALL,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_TASK_MANAGE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_HR,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_IT,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_FINANCE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_ADMIN,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_ASSET_MANAGE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_SETTLEMENT_APPROVE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_HANDOVER_APPROVE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_FEEDBACK_ANALYZE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLOSE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_REOPEN,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CANCEL,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_REPORTS_EXPORT,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_ANALYTICS_VIEW
  ],

  [TENANT_ROLES.HR_MANAGER]: [
    // HR management with approval rights
    OFFBOARDING_PERMISSIONS.OFFBOARDING_INITIATE_ANY,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_MANAGE_ALL,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_APPROVE_HR,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_VIEW_ALL,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_TASK_ASSIGN,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_TASK_MANAGE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_HR,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_ASSET_VIEW,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_SETTLEMENT_REVIEW,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_HANDOVER_MANAGE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_FEEDBACK_CONDUCT,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_FEEDBACK_VIEW,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_FEEDBACK_ANALYZE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLOSE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_REPORTS_VIEW,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_REPORTS_EXPORT,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_ANALYTICS_VIEW
  ],

  [TENANT_ROLES.HR_EXECUTIVE]: [
    // HR operations without final approval
    OFFBOARDING_PERMISSIONS.OFFBOARDING_INITIATE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_MANAGE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_VIEW_ALL,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_TASK_ASSIGN,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_TASK_COMPLETE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_HR,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_ASSET_VIEW,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_HANDOVER_CREATE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_FEEDBACK_CONDUCT,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_FEEDBACK_VIEW,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_REPORTS_VIEW
  ],

  [TENANT_ROLES.FINANCE_MANAGER]: [
    // Finance operations with approval rights
    OFFBOARDING_PERMISSIONS.OFFBOARDING_VIEW_ALL,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_APPROVE_FINANCE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_TASK_COMPLETE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_FINANCE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_SETTLEMENT_CALCULATE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_SETTLEMENT_REVIEW,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_SETTLEMENT_APPROVE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_SETTLEMENT_PROCESS,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_REPORTS_VIEW,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_REPORTS_EXPORT
  ],

  [TENANT_ROLES.FINANCE_EXECUTIVE]: [
    // Finance operations without approval
    OFFBOARDING_PERMISSIONS.OFFBOARDING_VIEW_ALL,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_TASK_COMPLETE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_FINANCE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_SETTLEMENT_CALCULATE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_SETTLEMENT_REVIEW,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_REPORTS_VIEW
  ],

  [TENANT_ROLES.IT_ADMIN]: [
    // IT-specific operations
    OFFBOARDING_PERMISSIONS.OFFBOARDING_VIEW_DEPARTMENT,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_TASK_COMPLETE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_TASK_VERIFY,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_IT,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_ASSET_MANAGE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_ASSET_APPROVE
  ],

  [TENANT_ROLES.MANAGER]: [
    // Team management and approval
    OFFBOARDING_PERMISSIONS.OFFBOARDING_INITIATE_TEAM,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_MANAGE_TEAM,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_APPROVE_MANAGER,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_VIEW_TEAM,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_HANDOVER_APPROVE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_FEEDBACK_CONDUCT
  ],

  [TENANT_ROLES.DEPARTMENT_HEAD]: [
    // Department-level management
    OFFBOARDING_PERMISSIONS.OFFBOARDING_INITIATE_DEPARTMENT,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_MANAGE_DEPARTMENT,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_APPROVE_MANAGER,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_VIEW_DEPARTMENT,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_TASK_ASSIGN,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_HANDOVER_APPROVE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_REPORTS_VIEW
  ],

  [TENANT_ROLES.EMPLOYEE]: [
    // Self-service operations
    OFFBOARDING_PERMISSIONS.OFFBOARDING_INITIATE_SELF,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_VIEW_SELF,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_HANDOVER_CREATE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_FEEDBACK_VIEW
  ]
};

// Role Hierarchy for Inheritance
const ROLE_HIERARCHY = {
  [TENANT_ROLES.ADMIN]: 1,
  [TENANT_ROLES.HR_MANAGER]: 2,
  [TENANT_ROLES.FINANCE_MANAGER]: 2,
  [TENANT_ROLES.DEPARTMENT_HEAD]: 3,
  [TENANT_ROLES.MANAGER]: 4,
  [TENANT_ROLES.HR_EXECUTIVE]: 5,
  [TENANT_ROLES.FINANCE_EXECUTIVE]: 5,
  [TENANT_ROLES.IT_ADMIN]: 5,
  [TENANT_ROLES.EMPLOYEE]: 6
};

// Department-specific permissions
const DEPARTMENT_PERMISSIONS = {
  hr: [
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_HR,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_FEEDBACK_CONDUCT
  ],
  finance: [
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_FINANCE,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_SETTLEMENT_CALCULATE
  ],
  it: [
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_IT,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_ASSET_MANAGE
  ],
  admin: [
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_ADMIN,
    OFFBOARDING_PERMISSIONS.OFFBOARDING_CLEARANCE_SECURITY
  ]
};

/**
 * Check if user has specific permission
 */
function hasPermission(userRole, permission, userDepartment = null) {
  // Get base permissions for role
  const rolePermissions = TENANT_PERMISSION_MATRIX[userRole] || [];
  
  // Check if user has the permission directly
  if (rolePermissions.includes(permission)) {
    return true;
  }
  
  // Check department-specific permissions
  if (userDepartment && DEPARTMENT_PERMISSIONS[userDepartment]) {
    return DEPARTMENT_PERMISSIONS[userDepartment].includes(permission);
  }
  
  return false;
}

/**
 * Check if user can access offboarding request based on scope
 */
function canAccessOffboardingRequest(userRole, userId, offboardingRequest, userDepartment = null) {
  // Admin and HR Manager can access all
  if ([TENANT_ROLES.ADMIN, TENANT_ROLES.HR_MANAGER].includes(userRole)) {
    return true;
  }
  
  // Employee can only access their own
  if (userRole === TENANT_ROLES.EMPLOYEE) {
    return offboardingRequest.employeeId.toString() === userId.toString();
  }
  
  // Manager can access their team members
  if ([TENANT_ROLES.MANAGER, TENANT_ROLES.DEPARTMENT_HEAD].includes(userRole)) {
    // This would need to check if the employee reports to this manager
    // Implementation depends on your employee hierarchy structure
    return true; // Simplified for now
  }
  
  // Department-specific access
  if (userDepartment) {
    // Users can access requests that have tasks assigned to their department
    return true; // Simplified for now
  }
  
  return false;
}

/**
 * Get user permissions based on role and department
 */
function getUserPermissions(userRole, userDepartment = null) {
  const rolePermissions = TENANT_PERMISSION_MATRIX[userRole] || [];
  const departmentPermissions = userDepartment ? (DEPARTMENT_PERMISSIONS[userDepartment] || []) : [];
  
  return [...new Set([...rolePermissions, ...departmentPermissions])];
}

/**
 * Check if user can perform action on offboarding request
 */
function canPerformAction(userRole, action, offboardingRequest, userId, userDepartment = null) {
  // Check if user has the required permission
  if (!hasPermission(userRole, action, userDepartment)) {
    return false;
  }
  
  // Check if user can access the offboarding request
  if (!canAccessOffboardingRequest(userRole, userId, offboardingRequest, userDepartment)) {
    return false;
  }
  
  // Additional business logic checks can be added here
  // For example, checking workflow state, approval chains, etc.
  
  return true;
}

module.exports = {
  TENANT_ROLES,
  OFFBOARDING_PERMISSIONS,
  TENANT_PERMISSION_MATRIX,
  ROLE_HIERARCHY,
  DEPARTMENT_PERMISSIONS,
  hasPermission,
  canAccessOffboardingRequest,
  getUserPermissions,
  canPerformAction
};
