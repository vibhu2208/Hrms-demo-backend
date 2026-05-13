const mongoose = require('mongoose');
const Client = require('../models/Client');
const Package = require('../models/Package');
const ClientPackage = require('../models/ClientPackage');
const Subscription = require('../models/Subscription');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const SubscriptionLog = require('../models/SubscriptionLog');
const User = require('../models/User');

class BillingSeeder {
  constructor() {
    this.createdData = {
      clients: [],
      packages: [],
      clientPackages: [],
      subscriptions: [],
      invoices: [],
      payments: [],
      users: []
    };
  }

  async seedAll() {
    try {
      console.log('🌱 Starting billing data seeding...');
      
      await this.seedUsers();
      await this.seedClients();
      await this.seedPackages();
      await this.seedClientPackages(); // First assign packages to clients
      await this.seedSubscriptions();  // Then create subscriptions based on assignments
      await this.seedInvoices();
      await this.seedPayments();
      await this.seedSubscriptionLogs();
      
      console.log('✅ Billing data seeding completed successfully!');
      console.log('📊 Created:');
      console.log(`   - ${this.createdData.clients.length} Clients`);
      console.log(`   - ${this.createdData.packages.length} Packages`);
      console.log(`   - ${this.createdData.clientPackages.length} Client-Package Assignments`);
      console.log(`   - ${this.createdData.subscriptions.length} Subscriptions`);
      console.log(`   - ${this.createdData.invoices.length} Invoices`);
      console.log(`   - ${this.createdData.payments.length} Payments`);
      
      return this.createdData;
    } catch (error) {
      console.error('❌ Error seeding billing data:', error);
      throw error;
    }
  }

  async seedUsers() {
    console.log('👥 Updating existing users with internal roles...');
    
    // Find all existing super admin users and assign internal roles
    const existingUsers = await User.find({ role: 'superadmin' });
    
    for (const user of existingUsers) {
      if (!user.internalRole) {
        // Assign super_admin role to the first user, others get finance_admin
        user.internalRole = this.createdData.users.length === 0 ? 'super_admin' : 'finance_admin';
        await user.save();
        console.log(`   ↻ Updated user: ${user.email} -> ${user.internalRole}`);
      }
      this.createdData.users.push(user);
    }
    
    // If no super admin users exist, create a default one
    if (existingUsers.length === 0) {
      const defaultUser = new User({
        email: 'superadmin@hrms.com',
        password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
        role: 'superadmin',
        internalRole: 'super_admin',
        isActive: true
      });
      await defaultUser.save();
      this.createdData.users.push(defaultUser);
      console.log(`   ✓ Created default user: ${defaultUser.email}`);
    }
  }

  async seedClients() {
    console.log('🏢 Seeding clients...');
    
    const clientsData = [
      {
        clientCode: 'TC001',
        name: 'TechCorp Solutions',
        companyName: 'TechCorp Solutions',
        email: 'admin@techcorp.com',
        phone: '+1-555-0101',
        contactPerson: {
          name: 'John Smith',
          email: 'john.smith@techcorp.com',
          phone: '+1-555-0101'
        },
        address: {
          street: '123 Tech Street',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94105',
          country: 'USA'
        },
        industry: 'Technology',
        companySize: 'medium',
        status: 'active'
      },
      {
        clientCode: 'HP002',
        name: 'Healthcare Plus',
        companyName: 'Healthcare Plus',
        email: 'contact@healthcareplus.com',
        phone: '+1-555-0102',
        contactPerson: {
          name: 'Sarah Johnson',
          email: 'sarah.j@healthcareplus.com',
          phone: '+1-555-0102'
        },
        address: {
          street: '456 Medical Ave',
          city: 'Boston',
          state: 'MA',
          postalCode: '02101',
          country: 'USA'
        },
        industry: 'Healthcare',
        companySize: 'large',
        status: 'active'
      },
      {
        clientCode: 'SH003',
        name: 'StartupHub Inc',
        companyName: 'StartupHub Inc',
        email: 'hello@startuphub.com',
        phone: '+1-555-0103',
        contactPerson: {
          name: 'Mike Chen',
          email: 'mike@startuphub.com',
          phone: '+1-555-0103'
        },
        address: {
          street: '789 Innovation Blvd',
          city: 'Austin',
          state: 'TX',
          postalCode: '73301',
          country: 'USA'
        },
        industry: 'Technology',
        companySize: 'small',
        status: 'active'
      },
      {
        clientCode: 'MC004',
        name: 'Manufacturing Co',
        companyName: 'Manufacturing Co',
        email: 'info@manufacturingco.com',
        phone: '+1-555-0104',
        contactPerson: {
          name: 'Lisa Brown',
          email: 'lisa.brown@manufacturingco.com',
          phone: '+1-555-0104'
        },
        address: {
          street: '321 Industrial Way',
          city: 'Detroit',
          state: 'MI',
          postalCode: '48201',
          country: 'USA'
        },
        industry: 'Manufacturing',
        companySize: 'large',
        status: 'active'
      },
      {
        clientCode: 'GE005',
        name: 'Green Energy Corp',
        companyName: 'Green Energy Corp',
        email: 'contact@greenenergy.com',
        phone: '+1-555-0105',
        contactPerson: {
          name: 'David Wilson',
          email: 'david.wilson@greenenergy.com',
          phone: '+1-555-0105'
        },
        address: {
          street: '654 Renewable St',
          city: 'Portland',
          state: 'OR',
          postalCode: '97201',
          country: 'USA'
        },
        industry: 'Energy',
        companySize: 'medium',
        status: 'active'
      }
    ];

    for (const clientData of clientsData) {
      const existingClient = await Client.findOne({ email: clientData.email });
      if (!existingClient) {
        const client = new Client(clientData);
        await client.save();
        this.createdData.clients.push(client);
        console.log(`   ✓ Created client: ${clientData.companyName}`);
      } else {
        this.createdData.clients.push(existingClient);
        console.log(`   → Using existing client: ${clientData.companyName}`);
      }
    }
  }

  async seedPackages() {
    console.log('📦 Seeding packages...');
    
    const packagesData = [
      {
        name: 'Starter Plan',
        description: 'Perfect for small businesses getting started with HR management',
        type: 'starter',
        pricing: {
          monthly: 99,
          quarterly: 267, // 10% discount
          yearly: 950,    // 20% discount
          currency: 'USD'
        },
        features: {
          maxEmployees: 25,
          maxAdmins: 2,
          storageLimit: 5,
          customBranding: false,
          apiAccess: false,
          advancedReporting: false,
          multiLocation: false,
          integrations: false
        },
        includedModules: ['hr', 'attendance', 'leave'],
        addOnModules: [
          { module: 'payroll', price: 29 },
          { module: 'recruitment', price: 19 }
        ],
        isActive: true,
        isPopular: false,
        trialDays: 14
      },
      {
        name: 'Professional Plan',
        description: 'Comprehensive HR solution for growing companies',
        type: 'professional',
        pricing: {
          monthly: 199,
          quarterly: 537, // 10% discount
          yearly: 1910,   // 20% discount
          currency: 'USD'
        },
        features: {
          maxEmployees: 100,
          maxAdmins: 5,
          storageLimit: 25,
          customBranding: true,
          apiAccess: true,
          advancedReporting: true,
          multiLocation: false,
          integrations: true
        },
        includedModules: ['hr', 'payroll', 'attendance', 'leave', 'recruitment'],
        addOnModules: [
          { module: 'performance', price: 39 },
          { module: 'assets', price: 29 }
        ],
        isActive: true,
        isPopular: true,
        trialDays: 14
      },
      {
        name: 'Enterprise Plan',
        description: 'Full-featured solution for large organizations',
        type: 'enterprise',
        pricing: {
          monthly: 399,
          quarterly: 1077, // 10% discount
          yearly: 3830,    // 20% discount
          currency: 'USD'
        },
        features: {
          maxEmployees: 1000,
          maxAdmins: 20,
          storageLimit: 100,
          customBranding: true,
          apiAccess: true,
          advancedReporting: true,
          multiLocation: true,
          integrations: true
        },
        includedModules: ['hr', 'payroll', 'timesheet', 'attendance', 'recruitment', 'performance', 'assets', 'compliance'],
        addOnModules: [],
        isActive: true,
        isPopular: false,
        trialDays: 30
      }
    ];

    for (const packageData of packagesData) {
      const existingPackage = await Package.findOne({ name: packageData.name });
      if (!existingPackage) {
        const pkg = new Package(packageData);
        await pkg.save();
        this.createdData.packages.push(pkg);
        console.log(`   ✓ Created package: ${packageData.name}`);
      } else {
        this.createdData.packages.push(existingPackage);
        console.log(`   → Using existing package: ${packageData.name}`);
      }
    }
  }

  async seedClientPackages() {
    console.log('🔗 Seeding client-package assignments...');
    
    if (this.createdData.clients.length === 0 || this.createdData.packages.length === 0) {
      console.log('   ⚠️ No clients or packages found, skipping client-package assignments');
      return;
    }

    const superAdmin = this.createdData.users.find(u => u.internalRole === 'super_admin');
    
    const clientPackageData = [
      {
        clientId: this.createdData.clients[0]._id, // TechCorp
        packageId: this.createdData.packages[1]._id, // Professional
        billingCycle: 'monthly',
        status: 'active',
        startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        autoRenew: true,
        discount: {
          percentage: 10,
          reason: 'Early adopter discount'
        },
        assignedBy: superAdmin?._id
      },
      {
        clientId: this.createdData.clients[1]._id, // Healthcare Plus
        packageId: this.createdData.packages[2]._id, // Enterprise
        billingCycle: 'yearly',
        status: 'active',
        startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
        endDate: new Date(Date.now() + 275 * 24 * 60 * 60 * 1000), // 275 days from now (yearly)
        autoRenew: true,
        assignedBy: superAdmin?._id
      },
      {
        clientId: this.createdData.clients[2]._id, // StartupHub
        packageId: this.createdData.packages[0]._id, // Starter
        billingCycle: 'monthly',
        status: 'active',
        startDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
        endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now (expiring soon)
        autoRenew: false,
        assignedBy: superAdmin?._id
      },
      {
        clientId: this.createdData.clients[3]._id, // Manufacturing Co
        packageId: this.createdData.packages[1]._id, // Professional
        billingCycle: 'quarterly',
        status: 'active',
        startDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
        endDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days from now (quarterly)
        autoRenew: true,
        assignedBy: superAdmin?._id
      },
      {
        clientId: this.createdData.clients[4]._id, // Green Energy Corp
        packageId: this.createdData.packages[1]._id, // Professional
        billingCycle: 'monthly',
        status: 'expired',
        startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
        endDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago (expired)
        autoRenew: false,
        assignedBy: superAdmin?._id
      }
    ];

    for (const [index, cpData] of clientPackageData.entries()) {
      const existingCP = await ClientPackage.findOne({ 
        clientId: cpData.clientId,
        packageId: cpData.packageId 
      });
      
      if (!existingCP) {
        const clientPackage = new ClientPackage(cpData);
        await clientPackage.save();
        this.createdData.clientPackages.push(clientPackage);
        console.log(`   ✓ Assigned ${this.createdData.packages.find(p => p._id.equals(cpData.packageId))?.name} to ${this.createdData.clients[index]?.companyName}`);
      } else {
        this.createdData.clientPackages.push(existingCP);
        console.log(`   → Using existing assignment for ${this.createdData.clients[index]?.companyName}`);
      }
    }
  }

  async seedSubscriptions() {
    console.log('📋 Seeding subscriptions based on client-package assignments...');
    
    if (this.createdData.clientPackages.length === 0) {
      console.log('   ⚠️ No client-package assignments found, skipping subscriptions');
      return;
    }

    const superAdmin = this.createdData.users.find(u => u.internalRole === 'super_admin');
    
    // Create subscriptions based on existing ClientPackage assignments
    for (const clientPackage of this.createdData.clientPackages) {
      const client = this.createdData.clients.find(c => c._id.equals(clientPackage.clientId));
      const pkg = this.createdData.packages.find(p => p._id.equals(clientPackage.packageId));
      
      if (!client || !pkg) continue;

      // Calculate pricing based on package and client package settings
      let basePrice = 0;
      switch (clientPackage.billingCycle) {
        case 'monthly':
          basePrice = pkg.pricing.monthly;
          break;
        case 'quarterly':
          basePrice = pkg.pricing.quarterly || pkg.pricing.monthly * 3;
          break;
        case 'yearly':
          basePrice = pkg.pricing.yearly || pkg.pricing.monthly * 12;
          break;
      }

      const effectivePrice = clientPackage.getEffectivePrice(basePrice);

      const subscriptionData = {
        clientId: clientPackage.clientId,
        packageId: clientPackage.packageId,
        clientPackageId: clientPackage._id, // Link to the actual client package assignment
        billingCycle: clientPackage.billingCycle,
        status: clientPackage.status === 'expired' ? 'expired' : 'active',
        startDate: clientPackage.startDate,
        endDate: clientPackage.endDate,
        basePrice,
        effectivePrice,
        discount: clientPackage.discount,
        autoRenew: clientPackage.autoRenew,
        assignedBy: superAdmin?._id,
        notes: `Subscription for ${client.companyName} - ${pkg.name} package`
      };

      const existingSubscription = await Subscription.findOne({ 
        clientId: subscriptionData.clientId,
        packageId: subscriptionData.packageId 
      });
      
      if (!existingSubscription) {
        const subscription = new Subscription(subscriptionData);
        await subscription.save();
        this.createdData.subscriptions.push(subscription);
        console.log(`   ✓ Created subscription: ${client.companyName} -> ${pkg.name} (${clientPackage.billingCycle})`);
      } else {
        // Update existing subscription to sync with client package
        existingSubscription.clientPackageId = clientPackage._id;
        existingSubscription.status = subscriptionData.status;
        existingSubscription.endDate = subscriptionData.endDate;
        existingSubscription.effectivePrice = subscriptionData.effectivePrice;
        await existingSubscription.save();
        
        this.createdData.subscriptions.push(existingSubscription);
        console.log(`   ↻ Updated subscription: ${client.companyName} -> ${pkg.name}`);
      }
    }
  }

  async seedInvoices() {
    console.log('🧾 Seeding invoices...');
    
    if (this.createdData.subscriptions.length === 0) {
      console.log('   ⚠️ No subscriptions found, skipping invoices');
      return;
    }

    const superAdmin = this.createdData.users.find(u => u.internalRole === 'super_admin');

    for (const subscription of this.createdData.subscriptions) {
      // Create 1-3 invoices per subscription
      const invoiceCount = Math.floor(Math.random() * 3) + 1;
      
      for (let i = 0; i < invoiceCount; i++) {
        const daysAgo = (i + 1) * 30; // Monthly invoices
        const invoiceDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        const dueDate = new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        const subtotal = subscription.effectivePrice;
        const tax = subtotal * 0.08; // 8% tax
        const total = subtotal + tax;
        
        const invoice = new Invoice({
          subscriptionId: subscription._id,
          clientId: subscription.clientId,
          packageId: subscription.packageId,
          billingPeriod: {
            startDate: new Date(invoiceDate.getTime() - 30 * 24 * 60 * 60 * 1000),
            endDate: invoiceDate
          },
          amount: {
            subtotal,
            discount: subscription.discount?.amount || 0,
            tax,
            total
          },
          currency: 'USD',
          status: i === 0 ? (Math.random() > 0.3 ? 'paid' : 'sent') : 'paid',
          paymentStatus: i === 0 ? (Math.random() > 0.3 ? 'paid' : 'pending') : 'paid',
          dueDate,
          paidDate: i === 0 ? (Math.random() > 0.3 ? new Date() : null) : new Date(),
          itemDetails: [{
            description: `${subscription.packageId.name} - ${subscription.billingCycle} subscription`,
            quantity: 1,
            unitPrice: subtotal,
            total: subtotal
          }],
          taxDetails: {
            percentage: 8,
            amount: tax,
            taxType: 'Sales Tax'
          },
          generatedBy: superAdmin?._id // Required field for invoice generation
        });

        await invoice.save();
        this.createdData.invoices.push(invoice);
      }
    }
    
    console.log(`   ✓ Created ${this.createdData.invoices.length} invoices`);
  }

  async seedPayments() {
    console.log('💳 Seeding payments...');
    
    const paidInvoices = this.createdData.invoices.filter(inv => inv.paymentStatus === 'paid');
    
    for (const invoice of paidInvoices) {
      const payment = new Payment({
        invoiceId: invoice._id,
        subscriptionId: invoice.subscriptionId,
        clientId: invoice.clientId,
        amount: invoice.amount.total,
        currency: invoice.currency,
        paymentMethod: ['card', 'bank_transfer', 'digital_wallet'][Math.floor(Math.random() * 3)],
        paymentGateway: 'stripe',
        status: 'completed',
        transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        processedDate: invoice.paidDate || new Date(),
        gatewayResponse: {
          id: `ch_${Math.random().toString(36).substr(2, 24)}`,
          status: 'succeeded',
          amount: Math.round(invoice.amount.total * 100), // cents
          currency: 'usd'
        }
      });

      await payment.save();
      this.createdData.payments.push(payment);
    }
    
    console.log(`   ✓ Created ${this.createdData.payments.length} payments`);
  }

  async seedSubscriptionLogs() {
    console.log('📝 Seeding subscription logs...');
    
    const superAdmin = this.createdData.users.find(u => u.internalRole === 'super_admin');
    
    for (const subscription of this.createdData.subscriptions) {
      // Create subscription creation log
      await SubscriptionLog.logAction({
        subscriptionId: subscription._id,
        clientId: subscription.clientId,
        action: 'created',
        description: `Subscription ${subscription.subscriptionCode} created`,
        performedBy: superAdmin?._id,
        performedByRole: 'superadmin',
        category: 'subscription',
        metadata: {
          packageId: subscription.packageId,
          billingCycle: subscription.billingCycle,
          basePrice: subscription.basePrice
        }
      });

      // Create some additional logs for active subscriptions
      if (subscription.status === 'active') {
        await SubscriptionLog.logAction({
          subscriptionId: subscription._id,
          clientId: subscription.clientId,
          action: 'reactivated',
          description: `Subscription ${subscription.subscriptionCode} reactivated`,
          performedBy: superAdmin?._id,
          performedByRole: 'superadmin',
          category: 'subscription'
        });
      }
    }
    
    console.log('   ✓ Created subscription logs');
  }

  async clearExistingData() {
    console.log('🧹 Clearing existing billing data...');
    
    await Promise.all([
      SubscriptionLog.deleteMany({}),
      Payment.deleteMany({}),
      Invoice.deleteMany({}),
      Subscription.deleteMany({}),
      // Don't delete clients and packages as they might be used elsewhere
    ]);
    
    console.log('   ✓ Cleared existing billing data');
  }
}

// Export the seeder class and a convenience function
module.exports = BillingSeeder;

// Standalone seeding function
const seedBillingData = async (clearExisting = false) => {
  const seeder = new BillingSeeder();
  
  if (clearExisting) {
    await seeder.clearExistingData();
  }
  
  return await seeder.seedAll();
};

module.exports.seedBillingData = seedBillingData;
