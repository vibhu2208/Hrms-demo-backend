// Super Admin Internal Role Definitions and Permission Matrix
// Phase 7: RBAC Expansion for Super Admin Module

const SUPER_ADMIN_ROLES = {
  SUPER_ADMIN: 'super_admin',
  SYSTEM_MANAGER: 'system_manager', 
  FINANCE_ADMIN: 'finance_admin',
  COMPLIANCE_OFFICER: 'compliance_officer',
  TECH_ADMIN: 'tech_admin',
  VIEWER: 'viewer'
};

const MODULES = {
  CLIENT_MANAGEMENT: 'client_management',
  PACKAGE_MANAGEMENT: 'package_management',
  SUBSCRIPTION_BILLING: 'subscription_billing',
  COMPLIANCE_LEGAL: 'compliance_legal',
  SYSTEM_CONFIG: 'system_config',
  DATA_MANAGEMENT: 'data_management',
  ANALYTICS_MONITORING: 'analytics_monitoring',
  REPORTS_CENTER: 'reports_center',
  ROLE_MANAGEMENT: 'role_management',
  AUDIT_LOGS: 'audit_logs'
};

const ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  EXPORT: 'export',
  APPROVE: 'approve',
  CONFIGURE: 'configure',
  PROCESS_PAYMENT: 'process_payment',
  REFUND: 'refund',
  GENERATE_INVOICE: 'generate_invoice',
  SEND_REMINDER: 'send_reminder',
  RECONCILE: 'reconcile'
};

// Role Definitions with Descriptions and Scope
const ROLE_DEFINITIONS = {
  [SUPER_ADMIN_ROLES.SUPER_ADMIN]: {
    name: 'Super Admin (Owner)',
    description: 'Full system control — manages all modules, configurations, and security',
    scope: 'Global',
    level: 1, // Highest level
    inherits: []
  },
  [SUPER_ADMIN_ROLES.SYSTEM_MANAGER]: {
    name: 'System Manager',
    description: 'Handles client onboarding, package assignments, and module configuration',
    scope: 'Clients & Modules',
    level: 2,
    inherits: []
  },
  [SUPER_ADMIN_ROLES.FINANCE_ADMIN]: {
    name: 'Finance Admin',
    description: 'Manages billing, subscriptions, and payment histories',
    scope: 'Billing & Reports',
    level: 3,
    inherits: []
  },
  [SUPER_ADMIN_ROLES.COMPLIANCE_OFFICER]: {
    name: 'Compliance Officer',
    description: 'Tracks document compliance, audit trails, and legal data',
    scope: 'Compliance & Logs',
    level: 3,
    inherits: []
  },
  [SUPER_ADMIN_ROLES.TECH_ADMIN]: {
    name: 'Tech Admin (DevOps)',
    description: 'Oversees backups, integrations, uptime monitoring, and infrastructure health',
    scope: 'Infrastructure',
    level: 3,
    inherits: []
  },
  [SUPER_ADMIN_ROLES.VIEWER]: {
    name: 'Viewer / Analyst',
    description: 'View-only access for business or operational insights',
    scope: 'Analytics & Reports',
    level: 4, // Lowest level
    inherits: []
  }
};

// Permission Matrix - Role to Module/Action mapping
const PERMISSION_MATRIX = {
  [SUPER_ADMIN_ROLES.SUPER_ADMIN]: {
    [MODULES.CLIENT_MANAGEMENT]: [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.EXPORT],
    [MODULES.PACKAGE_MANAGEMENT]: [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.CONFIGURE],
    [MODULES.SUBSCRIPTION_BILLING]: [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.EXPORT, ACTIONS.APPROVE, ACTIONS.PROCESS_PAYMENT, ACTIONS.REFUND, ACTIONS.GENERATE_INVOICE, ACTIONS.SEND_REMINDER, ACTIONS.RECONCILE],
    [MODULES.COMPLIANCE_LEGAL]: [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.EXPORT, ACTIONS.APPROVE],
    [MODULES.SYSTEM_CONFIG]: [ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.CONFIGURE],
    [MODULES.DATA_MANAGEMENT]: [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.DELETE, ACTIONS.EXPORT],
    [MODULES.ANALYTICS_MONITORING]: [ACTIONS.READ, ACTIONS.EXPORT, ACTIONS.CONFIGURE],
    [MODULES.REPORTS_CENTER]: [ACTIONS.READ, ACTIONS.EXPORT, ACTIONS.CREATE],
    [MODULES.ROLE_MANAGEMENT]: [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.DELETE],
    [MODULES.AUDIT_LOGS]: [ACTIONS.READ, ACTIONS.EXPORT]
  },
  
  [SUPER_ADMIN_ROLES.SYSTEM_MANAGER]: {
    [MODULES.CLIENT_MANAGEMENT]: [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.EXPORT],
    [MODULES.PACKAGE_MANAGEMENT]: [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.CONFIGURE],
    [MODULES.SUBSCRIPTION_BILLING]: [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE],
    [MODULES.SYSTEM_CONFIG]: [ACTIONS.READ, ACTIONS.UPDATE],
    [MODULES.ANALYTICS_MONITORING]: [ACTIONS.READ, ACTIONS.EXPORT],
    [MODULES.REPORTS_CENTER]: [ACTIONS.READ, ACTIONS.EXPORT],
    [MODULES.AUDIT_LOGS]: [ACTIONS.READ]
  },
  
  [SUPER_ADMIN_ROLES.FINANCE_ADMIN]: {
    [MODULES.SUBSCRIPTION_BILLING]: [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.EXPORT, ACTIONS.APPROVE, ACTIONS.PROCESS_PAYMENT, ACTIONS.GENERATE_INVOICE, ACTIONS.SEND_REMINDER, ACTIONS.RECONCILE],
    [MODULES.ANALYTICS_MONITORING]: [ACTIONS.READ, ACTIONS.EXPORT],
    [MODULES.REPORTS_CENTER]: [ACTIONS.READ, ACTIONS.EXPORT, ACTIONS.CREATE],
    [MODULES.AUDIT_LOGS]: [ACTIONS.READ]
  },
  
  [SUPER_ADMIN_ROLES.COMPLIANCE_OFFICER]: {
    [MODULES.COMPLIANCE_LEGAL]: [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.EXPORT, ACTIONS.APPROVE],
    [MODULES.SUBSCRIPTION_BILLING]: [ACTIONS.READ, ACTIONS.EXPORT],
    [MODULES.SYSTEM_CONFIG]: [ACTIONS.READ],
    [MODULES.ANALYTICS_MONITORING]: [ACTIONS.READ, ACTIONS.EXPORT],
    [MODULES.REPORTS_CENTER]: [ACTIONS.READ, ACTIONS.EXPORT, ACTIONS.CREATE],
    [MODULES.AUDIT_LOGS]: [ACTIONS.READ, ACTIONS.EXPORT]
  },
  
  [SUPER_ADMIN_ROLES.TECH_ADMIN]: {
    [MODULES.SYSTEM_CONFIG]: [ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.CONFIGURE],
    [MODULES.DATA_MANAGEMENT]: [ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.EXPORT],
    [MODULES.ANALYTICS_MONITORING]: [ACTIONS.READ, ACTIONS.EXPORT, ACTIONS.CONFIGURE],
    [MODULES.REPORTS_CENTER]: [ACTIONS.READ, ACTIONS.EXPORT],
    [MODULES.AUDIT_LOGS]: [ACTIONS.READ, ACTIONS.EXPORT]
  },
  
  [SUPER_ADMIN_ROLES.VIEWER]: {
    [MODULES.ANALYTICS_MONITORING]: [ACTIONS.READ],
    [MODULES.REPORTS_CENTER]: [ACTIONS.READ],
    [MODULES.AUDIT_LOGS]: [ACTIONS.READ]
  }
};

// Module to Route mapping for access control
const MODULE_ROUTES = {
  [MODULES.CLIENT_MANAGEMENT]: [
    '/api/super-admin/clients',
    '/api/super-admin/clients/*'
  ],
  [MODULES.PACKAGE_MANAGEMENT]: [
    '/api/super-admin/packages',
    '/api/super-admin/packages/*'
  ],
  [MODULES.SUBSCRIPTION_BILLING]: [
    '/api/super-admin/subscriptions',
    '/api/super-admin/subscriptions/*',
    '/api/super-admin/invoices',
    '/api/super-admin/invoices/*',
    '/api/super-admin/payments',
    '/api/super-admin/payments/*',
    '/api/super-admin/revenue',
    '/api/super-admin/revenue/*',
    '/api/super-admin/billing',
    '/api/super-admin/billing/*'
  ],
  [MODULES.COMPLIANCE_LEGAL]: [
    '/api/super-admin/compliance',
    '/api/super-admin/compliance/*',
    '/api/super-admin/legal/*'
  ],
  [MODULES.SYSTEM_CONFIG]: [
    '/api/super-admin/config',
    '/api/super-admin/config/*',
    '/api/super-admin/settings/*'
  ],
  [MODULES.DATA_MANAGEMENT]: [
    '/api/super-admin/data',
    '/api/super-admin/data/*',
    '/api/super-admin/backup/*'
  ],
  [MODULES.ANALYTICS_MONITORING]: [
    '/api/super-admin/analytics',
    '/api/super-admin/monitoring',
    '/api/super-admin/dashboard/*'
  ],
  [MODULES.REPORTS_CENTER]: [
    '/api/super-admin/reports',
    '/api/super-admin/reports/*'
  ],
  [MODULES.ROLE_MANAGEMENT]: [
    '/api/super-admin/roles',
    '/api/super-admin/roles/*'
  ],
  [MODULES.AUDIT_LOGS]: [
    '/api/super-admin/audit',
    '/api/super-admin/audit/*'
  ]
};

// Helper functions for permission checking
const hasPermission = (role, module, action) => {
  const rolePermissions = PERMISSION_MATRIX[role];
  if (!rolePermissions) return false;
  
  const modulePermissions = rolePermissions[module];
  if (!modulePermissions) return false;
  
  return modulePermissions.includes(action);
};

const hasModuleAccess = (role, module) => {
  const rolePermissions = PERMISSION_MATRIX[role];
  return rolePermissions && rolePermissions[module] && rolePermissions[module].length > 0;
};

const getModuleFromRoute = (route) => {
  for (const [module, routes] of Object.entries(MODULE_ROUTES)) {
    for (const routePattern of routes) {
      if (routePattern.endsWith('*')) {
        const baseRoute = routePattern.slice(0, -1);
        if (route.startsWith(baseRoute)) {
          return module;
        }
      } else if (route === routePattern) {
        return module;
      }
    }
  }
  return null;
};

const getRoleLevel = (role) => {
  return ROLE_DEFINITIONS[role]?.level || 999;
};

const canAccessRoute = (role, route, method = 'GET') => {
  const module = getModuleFromRoute(route);
  if (!module) return false;
  
  // Map HTTP methods to actions
  const methodActionMap = {
    'GET': ACTIONS.READ,
    'POST': ACTIONS.CREATE,
    'PUT': ACTIONS.UPDATE,
    'PATCH': ACTIONS.UPDATE,
    'DELETE': ACTIONS.DELETE
  };
  
  const action = methodActionMap[method.toUpperCase()] || ACTIONS.READ;
  return hasPermission(role, module, action);
};

module.exports = {
  SUPER_ADMIN_ROLES,
  MODULES,
  ACTIONS,
  ROLE_DEFINITIONS,
  PERMISSION_MATRIX,
  MODULE_ROUTES,
  hasPermission,
  hasModuleAccess,
  getModuleFromRoute,
  getRoleLevel,
  canAccessRoute
};
