/**
 * Test Email Script
 * Sends a test email to verify email configuration
 * 
 * Run: node src/utils/testEmail.js <recipient_email>
 * Example: node src/utils/testEmail.js krishnaupadhyay161003@gmail.com
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

const recipientEmail = process.argv[2];

if (!recipientEmail) {
  console.log('❌ Please provide a recipient email address');
  console.log('Usage: node testEmail.js <recipient_email>');
  console.log('Example: node testEmail.js krishnaupadhyay161003@gmail.com');
  process.exit(1);
}

// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(recipientEmail)) {
  console.log('❌ Invalid email format');
  process.exit(1);
}

const testEmail = async () => {
  try {
    console.log('🔧 Email Configuration Test');
    console.log('═══════════════════════════════════════════════════════\n');

    // Check environment variables
    console.log('📋 Checking environment variables...\n');
    
    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASSWORD;
    const emailHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
    const emailPort = process.env.EMAIL_PORT || 587;
    const emailFrom = process.env.EMAIL_FROM || emailUser;

    if (!emailUser) {
      console.log('❌ EMAIL_USER not configured');
      process.exit(1);
    }

    if (!emailPassword) {
      console.log('❌ EMAIL_APP_PASSWORD or EMAIL_PASSWORD not configured');
      console.log('\n💡 For Gmail:');
      console.log('   1. Go to: https://myaccount.google.com/apppasswords');
      console.log('   2. Generate an App Password');
      console.log('   3. Add to .env: EMAIL_APP_PASSWORD=your-app-password\n');
      process.exit(1);
    }

    console.log('✅ Email User:', emailUser);
    console.log('✅ Email Host:', emailHost);
    console.log('✅ Email Port:', emailPort);
    console.log('✅ Email From:', emailFrom);
    console.log('✅ Recipient:', recipientEmail);
    console.log('\n');

    // Create transporter
    console.log('🔗 Creating email transporter...');
    const transporter = nodemailer.createTransport({
      host: emailHost,
      port: emailPort,
      secure: emailPort === 465, // true for 465, false for other ports
      auth: {
        user: emailUser,
        pass: emailPassword
      }
    });

    console.log('✅ Transporter created\n');

    // Verify connection
    console.log('🔍 Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection verified\n');

    // Send test email
    console.log('📧 Sending test email...');
    const mailOptions = {
      from: emailFrom,
      to: recipientEmail,
      subject: '🧪 HRMS Test Email - Configuration Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px;">
            <h2 style="color: #333; margin-top: 0;">✅ Email Configuration Test</h2>
            
            <p style="color: #666; font-size: 16px;">
              This is a test email to verify that your HRMS email configuration is working correctly.
            </p>
            
            <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #2e7d32; margin-top: 0;">✅ Success!</h3>
              <p style="color: #1b5e20; margin: 0;">
                Your email service is configured and working properly.
              </p>
            </div>
            
            <div style="background-color: #fff3e0; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4 style="color: #e65100; margin-top: 0;">📋 Configuration Details:</h4>
              <ul style="color: #bf360c; margin: 10px 0; padding-left: 20px;">
                <li>Sent from: ${emailFrom}</li>
                <li>SMTP Host: ${emailHost}</li>
                <li>SMTP Port: ${emailPort}</li>
                <li>Timestamp: ${new Date().toLocaleString()}</li>
              </ul>
            </div>
            
            <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px;">
              This is an automated test email from HRMS. Please do not reply to this email.
            </p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email sent successfully!\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 EMAIL CONFIGURATION TEST PASSED');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📊 Email Details:');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   From: ${info.from}`);
    console.log(`   To: ${recipientEmail}`);
    console.log(`   Subject: ${mailOptions.subject}`);
    console.log(`   Sent at: ${new Date().toLocaleString()}\n`);

    console.log('✅ Your email service is working correctly!');
    console.log('   Check your inbox at: ' + recipientEmail + '\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Email Test Failed\n');
    console.error('═══════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error('═══════════════════════════════════════════════════════\n');

    if (error.code === 'EAUTH') {
      console.log('💡 Possible Issues:');
      console.log('   1. Incorrect EMAIL_USER or EMAIL_PASSWORD');
      console.log('   2. Gmail: Enable "Less secure app access" or use App Password');
      console.log('   3. Check if 2FA is enabled on your email account\n');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('💡 Possible Issues:');
      console.log('   1. SMTP server is not reachable');
      console.log('   2. Firewall is blocking the connection');
      console.log('   3. Wrong EMAIL_HOST or EMAIL_PORT\n');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('💡 Possible Issues:');
      console.log('   1. Network timeout - check your internet connection');
      console.log('   2. SMTP server is slow or unresponsive');
      console.log('   3. Firewall is blocking the connection\n');
    }

    console.log('🔧 Configuration to check in .env file:');
    console.log('   EMAIL_USER=your-email@gmail.com');
    console.log('   EMAIL_PASSWORD=your-app-password');
    console.log('   EMAIL_HOST=smtp.gmail.com (default)');
    console.log('   EMAIL_PORT=587 (default)\n');

    process.exit(1);
  }
};

// Run the test
testEmail();
