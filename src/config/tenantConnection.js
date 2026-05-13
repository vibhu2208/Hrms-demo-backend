const mongoose = require('mongoose');

/**
 * Tenant Connection Manager
 * Manages database connections for multi-tenant architecture
 * Each tenant gets their own database for data isolation
 */
class TenantConnectionManager {
  constructor() {
    this.connections = new Map();
    this.superAdminConnection = null;
  }

  /**
   * Get or create tenant-specific database connection
   * @param {string} clientId - Client/Tenant ID
   * @returns {mongoose.Connection} - Tenant database connection
   */
  async getTenantConnection(clientId) {
    try {
      const tenantId = clientId.toString();
      
      // Return existing connection if available
      if (this.connections.has(tenantId)) {
        const connection = this.connections.get(tenantId);
        if (connection.readyState === 1) { // Connected
          return connection;
        } else {
          // Remove stale connection
          this.connections.delete(tenantId);
        }
      }

      // Create new tenant database connection
      const dbName = `hrms_tenant_${tenantId}`;
      const mongoUri = process.env.MONGODB_URI.replace(/\/[^\/]*$/, `/${dbName}`);
      
      console.log(`🔗 Creating tenant connection for: ${dbName}`);
      
      const connection = await mongoose.createConnection(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      // Handle connection events
      connection.on('connected', () => {
        console.log(`✅ Tenant DB Connected: ${dbName}`);
      });

      connection.on('error', (err) => {
        console.error(`❌ Tenant DB Error (${dbName}):`, err);
        this.connections.delete(tenantId);
      });

      connection.on('disconnected', () => {
        console.log(`🔌 Tenant DB Disconnected: ${dbName}`);
        this.connections.delete(tenantId);
      });

      // Store connection
      this.connections.set(tenantId, connection);
      
      return connection;
    } catch (error) {
      console.error(`❌ Failed to create tenant connection for ${clientId}:`, error);
      throw error;
    }
  }

  /**
   * Get Super Admin database connection
   * @returns {mongoose.Connection} - Super Admin database connection
   */
  getSuperAdminConnection() {
    if (!this.superAdminConnection) {
      // Use default mongoose connection for Super Admin
      this.superAdminConnection = mongoose.connection;
    }
    return this.superAdminConnection;
  }

  /**
   * Close tenant connection
   * @param {string} clientId - Client/Tenant ID
   */
  async closeTenantConnection(clientId) {
    try {
      const tenantId = clientId.toString();
      const connection = this.connections.get(tenantId);
      
      if (connection) {
        await connection.close();
        this.connections.delete(tenantId);
        console.log(`🔌 Closed tenant connection: hrms_tenant_${tenantId}`);
      }
    } catch (error) {
      console.error(`❌ Error closing tenant connection for ${clientId}:`, error);
    }
  }

  /**
   * Close all tenant connections
   */
  async closeAllConnections() {
    try {
      const closePromises = Array.from(this.connections.entries()).map(
        async ([tenantId, connection]) => {
          try {
            await connection.close();
            console.log(`🔌 Closed tenant connection: hrms_tenant_${tenantId}`);
          } catch (error) {
            console.error(`❌ Error closing connection for tenant ${tenantId}:`, error);
          }
        }
      );

      await Promise.all(closePromises);
      this.connections.clear();
      console.log('✅ All tenant connections closed');
    } catch (error) {
      console.error('❌ Error closing tenant connections:', error);
    }
  }

  /**
   * Get connection status for all tenants
   * @returns {Object} - Connection status summary
   */
  getConnectionStatus() {
    const status = {
      totalConnections: this.connections.size,
      connections: {}
    };

    this.connections.forEach((connection, tenantId) => {
      status.connections[tenantId] = {
        readyState: connection.readyState,
        name: connection.name,
        host: connection.host,
        port: connection.port
      };
    });

    return status;
  }

  /**
   * Health check for tenant connections
   * @returns {Object} - Health status
   */
  async healthCheck() {
    const health = {
      healthy: true,
      totalConnections: this.connections.size,
      healthyConnections: 0,
      unhealthyConnections: 0,
      details: {}
    };

    for (const [tenantId, connection] of this.connections.entries()) {
      const isHealthy = connection.readyState === 1;
      health.details[tenantId] = {
        healthy: isHealthy,
        readyState: connection.readyState,
        name: connection.name
      };

      if (isHealthy) {
        health.healthyConnections++;
      } else {
        health.unhealthyConnections++;
        health.healthy = false;
      }
    }

    return health;
  }
}

// Create singleton instance
const tenantConnectionManager = new TenantConnectionManager();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down tenant connections...');
  await tenantConnectionManager.closeAllConnections();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down tenant connections...');
  await tenantConnectionManager.closeAllConnections();
  process.exit(0);
});

module.exports = tenantConnectionManager;
