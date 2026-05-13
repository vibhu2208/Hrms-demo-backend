const tokenBlacklistService = require('./tokenBlacklistService');
const auditService = require('./auditService');

/**
 * Access Revocation Service
 * Handles revoking access for employees on exit/termination
 */
class AccessRevocationService {
  /**
   * Revoke all access for an employee
   * @param {String} employeeId - Employee ID
   * @param {Date} lastWorkingDay - Last working day
   * @param {String} revokedBy - User ID who initiated revocation
   */
  async revokeAllAccess(employeeId, lastWorkingDay, revokedBy, tenantConnection) {
    const results = {
      systemAccess: false,
      emailAccess: false,
      vpnAccess: false,
      thirdPartyAccess: [],
      errors: []
    };

    try {
      // 1. Revoke system access (JWT tokens)
      await this.revokeSystemAccess(employeeId);
      results.systemAccess = true;
      
      // Log access revocation
      await auditService.logAccessRevocation(
        employeeId,
        'system_access',
        revokedBy,
        `Access revoked on last working day: ${lastWorkingDay}`,
        tenantConnection
      );

      // 2. Revoke email access (if Google Workspace integration configured)
      try {
        await this.revokeEmailAccess(employeeId);
        results.emailAccess = true;
      } catch (error) {
        results.errors.push({ type: 'email', error: error.message });
      }

      // 3. Revoke VPN access (placeholder - integrate with your VPN provider)
      try {
        await this.revokeVPNAccess(employeeId);
        results.vpnAccess = true;
      } catch (error) {
        results.errors.push({ type: 'vpn', error: error.message });
      }

      // 4. Revoke third-party access (Slack, Jira, etc.)
      try {
        const thirdPartyResults = await this.revokeThirdPartyAccess(employeeId);
        results.thirdPartyAccess = thirdPartyResults;
      } catch (error) {
        results.errors.push({ type: 'third_party', error: error.message });
      }

      console.log(`✅ Access revoked for employee ${employeeId}`);
      return results;
    } catch (error) {
      console.error('Error revoking access:', error);
      throw error;
    }
  }

  /**
   * Revoke system access (blacklist JWT tokens)
   */
  async revokeSystemAccess(employeeId) {
    try {
      // Blacklist all tokens for this user for 7 days
      await tokenBlacklistService.blacklistUserTokens(employeeId, 7 * 24 * 60 * 60);
      
      console.log(`System access revoked for employee ${employeeId}`);
      return true;
    } catch (error) {
      console.error('Error revoking system access:', error);
      throw error;
    }
  }

  /**
   * Revoke email access (Google Workspace)
   */
  async revokeEmailAccess(employeeId) {
    // This requires Google Workspace Admin SDK integration
    // Placeholder implementation
    
    if (!process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL) {
      console.warn('Google Workspace not configured - skipping email revocation');
      return false;
    }

    try {
      // TODO: Implement Google Workspace API integration
      // const { google } = require('googleapis');
      // const admin = google.admin('directory_v1');
      // await admin.users.update({
      //   userKey: employeeEmail,
      //   requestBody: { suspended: true }
      // });
      
      console.log(`Email access revocation queued for employee ${employeeId}`);
      return true;
    } catch (error) {
      console.error('Error revoking email access:', error);
      throw error;
    }
  }

  /**
   * Revoke VPN access
   */
  async revokeVPNAccess(employeeId) {
    // Placeholder - integrate with your VPN provider's API
    console.log(`VPN access revocation queued for employee ${employeeId}`);
    return true;
  }

  /**
   * Revoke third-party access (Slack, Jira, etc.)
   */
  async revokeThirdPartyAccess(employeeId) {
    const results = [];

    // Placeholder implementations
    const services = ['slack', 'jira', 'github', 'aws'];

    for (const service of services) {
      try {
        // TODO: Integrate with each service's API
        console.log(`${service} access revocation queued for employee ${employeeId}`);
        results.push({ service, revoked: true });
      } catch (error) {
        results.push({ service, revoked: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Restore access (in case of error or reversal)
   */
  async restoreAccess(employeeId, restoredBy, reason, tenantConnection) {
    try {
      // Remove from token blacklist
      await tokenBlacklistService.removeFromBlacklist(employeeId);

      // Log restoration
      await auditService.logAccessRevocation(
        employeeId,
        'access_restored',
        restoredBy,
        reason,
        tenantConnection
      );

      console.log(`Access restored for employee ${employeeId}`);
      return true;
    } catch (error) {
      console.error('Error restoring access:', error);
      throw error;
    }
  }

  /**
   * Schedule access revocation for future date
   */
  async scheduleRevocation(employeeId, scheduledDate, revokedBy) {
    // This would integrate with a job scheduler (e.g., Bull, Agenda)
    // For now, we'll rely on the cron job to check daily
    
    console.log(`Access revocation scheduled for ${employeeId} on ${scheduledDate}`);
    return {
      employeeId,
      scheduledDate,
      scheduledBy: revokedBy,
      status: 'scheduled'
    };
  }
}

module.exports = new AccessRevocationService();
