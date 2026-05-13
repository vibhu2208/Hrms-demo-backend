const Subscription = require('../models/Subscription');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const SubscriptionLog = require('../models/SubscriptionLog');
const Client = require('../models/Client');
const Package = require('../models/Package');
const User = require('../models/User');

class BillingAutomationService {
  constructor() {
    this.notificationSettings = {
      renewalAlertDays: [30, 14, 7, 3, 1], // Days before expiry to send alerts
      gracePeriodDays: 3,
      autoRenewalEnabled: true,
      emailNotificationsEnabled: true
    };
  }

  // Main automation runner - should be called by cron job
  async runDailyBillingAutomation() {
    try {
      console.log('🚀 Starting daily billing automation...');
      
      const results = {
        renewalAlerts: 0,
        expiredSubscriptions: 0,
        autoRenewals: 0,
        invoicesGenerated: 0,
        overdueReminders: 0,
        errors: []
      };

      // 1. Check for subscriptions needing renewal alerts
      await this.processRenewalAlerts(results);

      // 2. Process expired subscriptions
      await this.processExpiredSubscriptions(results);

      // 3. Handle auto-renewals
      await this.processAutoRenewals(results);

      // 4. Generate invoices for new billing cycles
      await this.generateScheduledInvoices(results);

      // 5. Send overdue payment reminders
      await this.sendOverdueReminders(results);

      console.log('✅ Daily billing automation completed:', results);
      return results;

    } catch (error) {
      console.error('❌ Error in daily billing automation:', error);
      throw error;
    }
  }

  // Process renewal alerts for subscriptions expiring soon
  async processRenewalAlerts(results) {
    try {
      for (const days of this.notificationSettings.renewalAlertDays) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + days);
        
        // Find subscriptions expiring on the target date
        const expiringSubscriptions = await Subscription.find({
          status: 'active',
          endDate: {
            $gte: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()),
            $lt: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1)
          }
        })
        .populate('clientId', 'name companyName email contactPerson')
        .populate('packageId', 'name type pricing');

        for (const subscription of expiringSubscriptions) {
          await this.sendRenewalAlert(subscription, days);
          results.renewalAlerts++;
        }
      }
    } catch (error) {
      console.error('Error processing renewal alerts:', error);
      results.errors.push(`Renewal alerts: ${error.message}`);
    }
  }

  // Process subscriptions that have expired
  async processExpiredSubscriptions(results) {
    try {
      const expiredSubscriptions = await Subscription.find({
        status: 'active',
        endDate: { $lt: new Date() }
      })
      .populate('clientId', 'name companyName email')
      .populate('packageId', 'name type');

      for (const subscription of expiredSubscriptions) {
        // Check if still in grace period
        if (subscription.isInGracePeriod()) {
          await this.sendGracePeriodAlert(subscription);
        } else {
          // Mark as expired and disable access
          subscription.status = 'expired';
          await subscription.save();

          // Log the expiry
          await SubscriptionLog.logAction({
            subscriptionId: subscription._id,
            clientId: subscription.clientId._id,
            action: 'expired',
            description: `Subscription ${subscription.subscriptionCode} expired automatically`,
            performedBy: null, // System action
            performedByRole: 'system',
            category: 'subscription',
            metadata: { automaticAction: true }
          });

          await this.sendExpiryNotification(subscription);
          results.expiredSubscriptions++;
        }
      }
    } catch (error) {
      console.error('Error processing expired subscriptions:', error);
      results.errors.push(`Expired subscriptions: ${error.message}`);
    }
  }

  // Handle automatic renewals
  async processAutoRenewals(results) {
    try {
      if (!this.notificationSettings.autoRenewalEnabled) return;

      const autoRenewSubscriptions = await Subscription.find({
        status: 'active',
        autoRenew: true,
        endDate: { $lte: new Date() }
      })
      .populate('clientId', 'name companyName email')
      .populate('packageId', 'name type pricing');

      for (const subscription of autoRenewSubscriptions) {
        try {
          // Attempt auto-renewal
          await subscription.renew();

          // Generate invoice for the new period
          await this.generateRenewalInvoice(subscription);

          // Log the auto-renewal
          await SubscriptionLog.logAction({
            subscriptionId: subscription._id,
            clientId: subscription.clientId._id,
            action: 'auto_renewed',
            description: `Subscription ${subscription.subscriptionCode} auto-renewed`,
            performedBy: null,
            performedByRole: 'system',
            category: 'subscription',
            metadata: { 
              automaticAction: true,
              billingCycle: subscription.billingCycle,
              newEndDate: subscription.endDate
            }
          });

          await this.sendAutoRenewalConfirmation(subscription);
          results.autoRenewals++;

        } catch (error) {
          console.error(`Error auto-renewing subscription ${subscription.subscriptionCode}:`, error);
          
          // Send auto-renewal failure notification
          await this.sendAutoRenewalFailure(subscription, error.message);
          results.errors.push(`Auto-renewal failed for ${subscription.subscriptionCode}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error('Error processing auto-renewals:', error);
      results.errors.push(`Auto-renewals: ${error.message}`);
    }
  }

  // Generate scheduled invoices
  async generateScheduledInvoices(results) {
    try {
      // Find subscriptions that need invoicing (new billing cycles starting today)
      const today = new Date();
      const subscriptionsToInvoice = await Subscription.find({
        status: 'active',
        nextBillingDate: {
          $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
          $lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
        }
      })
      .populate('clientId', 'name companyName email address')
      .populate('packageId', 'name type pricing');

      for (const subscription of subscriptionsToInvoice) {
        try {
          await this.generateInvoiceForSubscription(subscription);
          results.invoicesGenerated++;
        } catch (error) {
          console.error(`Error generating invoice for subscription ${subscription.subscriptionCode}:`, error);
          results.errors.push(`Invoice generation failed for ${subscription.subscriptionCode}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error('Error generating scheduled invoices:', error);
      results.errors.push(`Scheduled invoices: ${error.message}`);
    }
  }

  // Send overdue payment reminders
  async sendOverdueReminders(results) {
    try {
      const overdueInvoices = await Invoice.findOverdue();

      for (const invoice of overdueInvoices) {
        // Send reminder based on how overdue it is
        const daysOverdue = Math.ceil((new Date() - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24));
        
        // Send reminders at 1, 7, 14, and 30 days overdue
        if ([1, 7, 14, 30].includes(daysOverdue)) {
          await this.sendOverduePaymentReminder(invoice, daysOverdue);
          results.overdueReminders++;
        }
      }
    } catch (error) {
      console.error('Error sending overdue reminders:', error);
      results.errors.push(`Overdue reminders: ${error.message}`);
    }
  }

  // Generate invoice for subscription
  async generateInvoiceForSubscription(subscription) {
    const billingPeriodStart = new Date(subscription.lastBillingDate || subscription.startDate);
    const billingPeriodEnd = new Date(subscription.endDate);

    const subtotal = subscription.basePrice;
    const discountAmount = this.calculateDiscountAmount(subtotal, subscription.discount);
    const taxAmount = this.calculateTaxAmount(subtotal - discountAmount, subscription.tax);
    const total = subtotal - discountAmount + taxAmount;

    const invoice = new Invoice({
      subscriptionId: subscription._id,
      clientId: subscription.clientId._id,
      packageId: subscription.packageId._id,
      billingPeriod: {
        startDate: billingPeriodStart,
        endDate: billingPeriodEnd
      },
      amount: {
        subtotal,
        discount: discountAmount,
        tax: taxAmount,
        total
      },
      currency: subscription.currency,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      itemDetails: [{
        description: `${subscription.packageId.name} - ${subscription.billingCycle} subscription`,
        quantity: 1,
        unitPrice: subtotal,
        total: subtotal
      }],
      discountDetails: {
        percentage: subscription.discount?.percentage || 0,
        amount: discountAmount,
        reason: subscription.discount?.reason
      },
      taxDetails: {
        percentage: subscription.tax?.percentage || 0,
        amount: taxAmount,
        taxType: subscription.tax?.type || 'VAT'
      },
      billingAddress: {
        companyName: subscription.clientId.companyName,
        addressLine1: subscription.clientId.address?.street,
        city: subscription.clientId.address?.city,
        state: subscription.clientId.address?.state,
        postalCode: subscription.clientId.address?.postalCode,
        country: subscription.clientId.address?.country
      },
      generatedBy: null // System generated
    });

    await invoice.save();

    // Update subscription's next billing date
    subscription.nextBillingDate = subscription.calculateNextRenewalDate();
    subscription.lastBillingDate = new Date();
    await subscription.save();

    return invoice;
  }

  // Generate renewal invoice
  async generateRenewalInvoice(subscription) {
    return await this.generateInvoiceForSubscription(subscription);
  }

  // Notification methods (to be implemented with actual email service)
  async sendRenewalAlert(subscription, daysUntilExpiry) {
    console.log(`📧 Sending renewal alert: ${subscription.clientId.companyName} - ${daysUntilExpiry} days until expiry`);
    
    // Log the alert
    await SubscriptionLog.logAction({
      subscriptionId: subscription._id,
      clientId: subscription.clientId._id,
      action: 'reminder_sent',
      description: `Renewal reminder sent - ${daysUntilExpiry} days until expiry`,
      performedBy: null,
      performedByRole: 'system',
      category: 'subscription',
      metadata: { 
        automaticAction: true,
        daysUntilExpiry,
        alertType: 'renewal_reminder'
      }
    });

    // TODO: Implement actual email sending
    // await emailService.sendRenewalAlert(subscription, daysUntilExpiry);
  }

  async sendGracePeriodAlert(subscription) {
    console.log(`⚠️ Sending grace period alert: ${subscription.clientId.companyName}`);
    
    await SubscriptionLog.logAction({
      subscriptionId: subscription._id,
      clientId: subscription.clientId._id,
      action: 'grace_period_started',
      description: `Grace period alert sent for expired subscription`,
      performedBy: null,
      performedByRole: 'system',
      category: 'subscription',
      metadata: { automaticAction: true, alertType: 'grace_period' }
    });
  }

  async sendExpiryNotification(subscription) {
    console.log(`❌ Sending expiry notification: ${subscription.clientId.companyName}`);
    
    // TODO: Implement actual email sending
    // await emailService.sendExpiryNotification(subscription);
  }

  async sendAutoRenewalConfirmation(subscription) {
    console.log(`✅ Sending auto-renewal confirmation: ${subscription.clientId.companyName}`);
    
    // TODO: Implement actual email sending
    // await emailService.sendAutoRenewalConfirmation(subscription);
  }

  async sendAutoRenewalFailure(subscription, error) {
    console.log(`❌ Sending auto-renewal failure notification: ${subscription.clientId.companyName} - ${error}`);
    
    // TODO: Implement actual email sending
    // await emailService.sendAutoRenewalFailure(subscription, error);
  }

  async sendOverduePaymentReminder(invoice, daysOverdue) {
    console.log(`💰 Sending overdue payment reminder: ${invoice.clientId.companyName} - ${daysOverdue} days overdue`);
    
    await invoice.sendReminder();
    
    // TODO: Implement actual email sending
    // await emailService.sendOverduePaymentReminder(invoice, daysOverdue);
  }

  // Helper methods
  calculateDiscountAmount(subtotal, discount) {
    if (!discount) return 0;
    
    let discountAmount = 0;
    if (discount.percentage > 0) {
      discountAmount += subtotal * (discount.percentage / 100);
    }
    if (discount.amount > 0) {
      discountAmount += discount.amount;
    }
    
    return Math.min(discountAmount, subtotal);
  }

  calculateTaxAmount(taxableAmount, tax) {
    if (!tax) return 0;
    
    let taxAmount = 0;
    if (tax.percentage > 0) {
      taxAmount += taxableAmount * (tax.percentage / 100);
    }
    if (tax.amount > 0) {
      taxAmount += tax.amount;
    }
    
    return taxAmount;
  }

  // Manual trigger methods for testing
  async triggerRenewalAlertsForSubscription(subscriptionId) {
    const subscription = await Subscription.findById(subscriptionId)
      .populate('clientId', 'name companyName email')
      .populate('packageId', 'name type');
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const daysRemaining = subscription.daysRemaining;
    await this.sendRenewalAlert(subscription, daysRemaining);
    
    return { success: true, daysRemaining };
  }

  async triggerAutoRenewalForSubscription(subscriptionId) {
    const subscription = await Subscription.findById(subscriptionId)
      .populate('clientId', 'name companyName email')
      .populate('packageId', 'name type pricing');
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (!subscription.autoRenew) {
      throw new Error('Auto-renewal is not enabled for this subscription');
    }

    await subscription.renew();
    await this.generateRenewalInvoice(subscription);
    await this.sendAutoRenewalConfirmation(subscription);
    
    return { success: true, newEndDate: subscription.endDate };
  }
}

module.exports = new BillingAutomationService();
