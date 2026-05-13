const Permission = require('../models/Permission');
const Role = require('../models/Role');
const { getTenantConnection } = require('../config/database.config');
const { getTenantModel } = require('../utils/tenantModels');

class PermissionService {
  async checkPermission(userId, permissionCode, scope = 'own', resourceOwnerId = null, tenantConnection = null) {
    try {
      // Use 'User' model name to match auth middleware
      const TenantUserSchema = require('../models/tenant/TenantUser');
      const TenantUser = tenantConnection ? tenantConnection.model('User', TenantUserSchema) : require('../models/tenant/TenantUser');
      
      const user = await TenantUser.findById(userId).populate('roleId');
      
      if (!user) {
        return false;
      }

      // Superadmin has all permissions
      if (user.role === 'superadmin' || user.role === 'company_admin') {
        return true;
      }

      // HR users have candidate and recruitment permissions by default
      if (user.role === 'hr') {
        const hrPermissions = [
          'manage_candidates', 'view_candidates', 'create_candidate', 'update_candidate', 'delete_candidate',
          'create_job_posting', 'view_job_posting', 'update_job_posting', 'delete_job_posting',
          'manage_recruitment', 'view_recruitment'
        ];
        if (hrPermissions.includes(permissionCode)) {
          return true;
        }
      }

      const userPermissions = await this.getUserPermissions(user);
      
      const permission = userPermissions.find(p => p.code === permissionCode);
      
      if (!permission) {
        return false;
      }

      return this.validateScope(permission.scope, scope, userId, resourceOwnerId, user);
    } catch (error) {
      console.error('Permission check error:', error);
      return false;
    }
  }

  async getUserPermissions(user) {
    let permissions = [];

    if (user.roleId) {
      const role = await Role.findById(user.roleId).populate('permissions.permissionId');
      if (role) {
        const allPermissions = await role.getAllPermissions();
        permissions = allPermissions.map(p => ({
          ...p.permissionId._doc,
          scope: p.scope
        }));
      }
    }

    if (user.customPermissions && user.customPermissions.length > 0) {
      const customPerms = await Permission.find({
        _id: { $in: user.customPermissions.map(cp => cp.permissionId) }
      });
      
      const customPermissionsWithScope = customPerms.map(perm => {
        const userPerm = user.customPermissions.find(
          cp => cp.permissionId.toString() === perm._id.toString()
        );
        return {
          ...perm._doc,
          scope: userPerm.scope,
          expiresAt: userPerm.expiresAt
        };
      });

      const activeCustomPerms = customPermissionsWithScope.filter(p => 
        !p.expiresAt || new Date(p.expiresAt) > new Date()
      );

      permissions = [...permissions, ...activeCustomPerms];
    }

    const uniquePermissions = permissions.filter((perm, index, self) =>
      index === self.findIndex((p) => p.code === perm.code)
    );

    return uniquePermissions;
  }

  validateScope(permissionScope, requestedScope, userId, resourceOwnerId, user) {
    const scopeHierarchy = {
      'own': 1,
      'team': 2,
      'department': 3,
      'all': 4
    };

    if (scopeHierarchy[permissionScope] < scopeHierarchy[requestedScope]) {
      return false;
    }

    if (requestedScope === 'own' && resourceOwnerId) {
      return userId.toString() === resourceOwnerId.toString();
    }

    if (requestedScope === 'team' && user.reportingManager) {
      return true;
    }

    if (requestedScope === 'department' && user.department) {
      return true;
    }

    if (requestedScope === 'all') {
      return scopeHierarchy[permissionScope] >= 4;
    }

    return true;
  }

  async grantPermission(userId, permissionCode, scope, grantedBy, expiresAt = null, reason = null, tenantConnection = null) {
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection ? tenantConnection.model('User', TenantUserSchema) : require('../models/tenant/TenantUser');
    const AuditLog = tenantConnection ? getTenantModel(tenantConnection, 'AuditLog') : require('../models/AuditLog');

    const permission = await Permission.findOne({ code: permissionCode });
    if (!permission) {
      throw new Error('Permission not found');
    }

    const user = await TenantUser.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const existingPermIndex = user.customPermissions.findIndex(
      p => p.permissionId.toString() === permission._id.toString()
    );

    if (existingPermIndex > -1) {
      user.customPermissions[existingPermIndex] = {
        permissionId: permission._id,
        scope,
        grantedBy,
        grantedAt: new Date(),
        expiresAt,
        reason
      };
    } else {
      user.customPermissions.push({
        permissionId: permission._id,
        scope,
        grantedBy,
        grantedAt: new Date(),
        expiresAt,
        reason
      });
    }

    await user.save();

    await AuditLog.create({
      userId: grantedBy,
      action: 'PERMISSION_GRANTED',
      resource: 'Permission',
      resourceId: permission._id,
      details: {
        targetUserId: userId,
        permissionCode,
        scope,
        expiresAt,
        reason
      },
      ipAddress: null,
      userAgent: null
    });

    return user;
  }

  async revokePermission(userId, permissionCode, revokedBy, reason = null, tenantConnection = null) {
    const TenantUserSchema = require('../models/tenant/TenantUser');
    const TenantUser = tenantConnection ? tenantConnection.model('User', TenantUserSchema) : require('../models/tenant/TenantUser');
    const AuditLog = tenantConnection ? getTenantModel(tenantConnection, 'AuditLog') : require('../models/AuditLog');

    const permission = await Permission.findOne({ code: permissionCode });
    if (!permission) {
      throw new Error('Permission not found');
    }

    const user = await TenantUser.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.customPermissions = user.customPermissions.filter(
      p => p.permissionId.toString() !== permission._id.toString()
    );

    await user.save();

    await AuditLog.create({
      userId: revokedBy,
      action: 'PERMISSION_REVOKED',
      resource: 'Permission',
      resourceId: permission._id,
      details: {
        targetUserId: userId,
        permissionCode,
        reason
      },
      ipAddress: null,
      userAgent: null
    });

    return user;
  }

  async cleanupExpiredPermissions() {
    const TenantUser = require('../models/tenant/TenantUser');
    
    const users = await TenantUser.find({
      'customPermissions.expiresAt': { $lt: new Date() }
    });

    for (const user of users) {
      user.customPermissions = user.customPermissions.filter(
        p => !p.expiresAt || new Date(p.expiresAt) > new Date()
      );
      await user.save();
    }

    return users.length;
  }
}

module.exports = new PermissionService();
