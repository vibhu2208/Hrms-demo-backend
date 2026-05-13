const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  description: {
    type: String
  },
  level: {
    type: Number,
    required: true,
    default: 1
  },
  permissions: [{
    permissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permission',
      required: true
    },
    scope: {
      type: String,
      enum: ['own', 'team', 'department', 'all'],
      default: 'own'
    },
    conditions: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  }],
  inheritsFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  },
  isSystemRole: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

roleSchema.index({ code: 1 });
roleSchema.index({ level: 1 });

roleSchema.methods.getAllPermissions = async function() {
  let permissions = [...this.permissions];
  
  if (this.inheritsFrom) {
    const parentRole = await this.model('Role').findById(this.inheritsFrom);
    if (parentRole) {
      const parentPermissions = await parentRole.getAllPermissions();
      permissions = [...permissions, ...parentPermissions];
    }
  }
  
  const uniquePermissions = permissions.filter((perm, index, self) =>
    index === self.findIndex((p) => p.permissionId.toString() === perm.permissionId.toString())
  );
  
  return uniquePermissions;
};

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
