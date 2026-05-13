const redis = require('redis');

/**
 * Token Blacklist Service using Redis
 * Manages blacklisted JWT tokens for revoked access
 */
class TokenBlacklistService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.connectionAttempted = false;
  }

  /**
   * Initialize Redis connection
   */
  async connect() {
    if (this.isConnected) return;
    if (this.connectionAttempted) return; // Prevent repeated connection attempts

    // If no Redis URL configured, run in fallback mode (no blacklisting)
    if (!process.env.REDIS_URL) {
      console.warn('⚠️  Redis not configured - token blacklisting disabled (tokens will remain valid until expiry)');
      this.isConnected = false;
      this.connectionAttempted = true;
      return;
    }

    this.connectionAttempted = true;

    try {
      this.client = redis.createClient({
        url: process.env.REDIS_URL,
        password: process.env.REDIS_PASSWORD || undefined,
        database: parseInt(process.env.REDIS_DB) || 0,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              console.error('Redis connection failed after 3 retries - running without blacklist');
              this.isConnected = false;
              return false; // Stop retrying
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('✅ Redis connected for token blacklist');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        console.log('Redis connection closed');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error.message);
      console.warn('⚠️  Running without Redis - token blacklisting disabled');
      this.isConnected = false;
      // Don't throw - allow app to continue without Redis
    }
  }

  /**
   * Add token to blacklist
   * @param {String} token - JWT token to blacklist
   * @param {Date} expiresAt - Token expiration date
   */
  async addToBlacklist(token, expiresAt) {
    if (!this.isConnected) {
      await this.connect();
    }

    if (!this.isConnected) {
      console.warn('Redis not available - token not blacklisted');
      return; // Gracefully skip if Redis unavailable
    }

    try {
      const ttl = Math.floor((new Date(expiresAt) - new Date()) / 1000);
      
      if (ttl > 0) {
        await this.client.setEx(`blacklist:${token}`, ttl, 'revoked');
        console.log(`Token blacklisted for ${ttl} seconds`);
      }
    } catch (error) {
      console.error('Error adding token to blacklist:', error);
      // Don't throw - allow operation to continue
    }
  }

  /**
   * Check if token is blacklisted
   * @param {String} token - JWT token to check
   * @returns {Boolean}
   */
  async isBlacklisted(token) {
    if (!this.isConnected && !this.connectionAttempted) {
      await this.connect();
    }

    if (!this.isConnected) {
      // Redis not available, fail open (allow request)
      return false;
    }

    try {
      const result = await this.client.get(`blacklist:${token}`);
      return result === 'revoked';
    } catch (error) {
      console.error('Error checking token blacklist:', error);
      this.isConnected = false; // Mark as disconnected on error
      // Fail open - if Redis is down, allow the request
      return false;
    }
  }

  /**
   * Remove token from blacklist (if needed)
   * @param {String} token - JWT token to remove
   */
  async removeFromBlacklist(token) {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      await this.client.del(`blacklist:${token}`);
    } catch (error) {
      console.error('Error removing token from blacklist:', error);
      throw error;
    }
  }

  /**
   * Blacklist all tokens for a user
   * @param {String} userId - User ID
   * @param {Number} ttl - Time to live in seconds
   */
  async blacklistUserTokens(userId, ttl = 86400) {
    if (!this.isConnected) {
      await this.connect();
    }

    if (!this.isConnected) {
      console.warn('Redis not available - user tokens not blacklisted');
      return;
    }

    try {
      // Store user ID with TTL to invalidate all their tokens
      await this.client.setEx(`user_revoked:${userId}`, ttl, new Date().toISOString());
      console.log(`All tokens for user ${userId} blacklisted`);
    } catch (error) {
      console.error('Error blacklisting user tokens:', error);
      // Don't throw - allow operation to continue
    }
  }

  /**
   * Check if all user tokens are blacklisted
   * @param {String} userId - User ID
   * @returns {Boolean}
   */
  async isUserBlacklisted(userId) {
    if (!this.isConnected && !this.connectionAttempted) {
      await this.connect();
    }

    if (!this.isConnected) {
      // Redis not available, fail open (allow request)
      return false;
    }

    try {
      const result = await this.client.get(`user_revoked:${userId}`);
      return result !== null;
    } catch (error) {
      console.error('Error checking user blacklist:', error);
      this.isConnected = false; // Mark as disconnected on error
      return false;
    }
  }

  /**
   * Clean up expired tokens (called by cron job)
   */
  async cleanupExpiredTokens() {
    // Redis automatically removes expired keys with TTL
    // This is just a placeholder for any additional cleanup
    console.log('Redis TTL handles automatic cleanup');
  }

  /**
   * Get blacklist statistics
   */
  async getStats() {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const keys = await this.client.keys('blacklist:*');
      const userKeys = await this.client.keys('user_revoked:*');
      
      return {
        blacklistedTokens: keys.length,
        blacklistedUsers: userKeys.length,
        isConnected: this.isConnected
      };
    } catch (error) {
      console.error('Error getting blacklist stats:', error);
      return {
        blacklistedTokens: 0,
        blacklistedUsers: 0,
        isConnected: false
      };
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      console.log('Redis disconnected');
    }
  }
}

module.exports = new TokenBlacklistService();
