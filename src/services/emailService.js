const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

/**
 * Email Service for HRMS
 * Handles all email communications including onboarding, notifications, etc.
 * Uses Gmail SMTP with app password for secure authentication
 */

/**
 * Generic email sending function
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 */
const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    if (!transporter) {
      throw new Error('Email transporter not configured');
    }

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'HRMS System'}" <${process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || ''
    };

    // Add attachments if provided
    if (options.attachments && Array.isArray(options.attachments)) {
      mailOptions.attachments = options.attachments;
    }

    const result = await sendEmailWithRetry(transporter, mailOptions);
    console.log(`✅ Email sent successfully to ${options.to}`);
    return result;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw error;
  }
};

// Create reusable transporter with timeout and retry configuration
const createTransporter = () => {
  // Check for Gmail configuration first
  if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
    console.log('📧 Using Gmail SMTP configuration');
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
      },
      // Connection pooling for better performance
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      // Timeout configuration (critical for production)
      connectionTimeout: 60000, // 60 seconds
      greetingTimeout: 30000,   // 30 seconds
      socketTimeout: 60000,     // 60 seconds
      // Security options
      secure: true,
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2'
      },
      // Retry configuration
      retry: {
        maxRetries: 3,
        delay: 1000
      }
    });
  }
  
  // Fallback to custom SMTP configuration (for production environments like Render)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log('📧 Using custom SMTP configuration');
    return nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      // Connection pooling
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      // Timeout configuration
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
        minVersion: 'TLSv1.2'
      }
    });
  }
  
  console.error('❌ Email configuration missing. Please set EMAIL_USER and EMAIL_APP_PASSWORD or SMTP credentials in .env file');
  return null;
};

// Helper function to send email with retry logic
const sendEmailWithRetry = async (transporter, mailOptions, maxRetries = 3) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 Sending email (attempt ${attempt}/${maxRetries}) to ${mailOptions.to}`);
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully: ${info.messageId}`);
      return info;
    } catch (error) {
      lastError = error;
      console.error(`❌ Email send attempt ${attempt} failed:`, error.message);
      
      // Don't retry on authentication errors
      if (error.code === 'EAUTH' || error.responseCode === 535) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
};

/**
 * Send onboarding welcome email with employee credentials
 * @param {Object} options - Email options
 * @param {string} options.employeeName - Full name of the employee
 * @param {string} options.employeeEmail - Email address of the employee
 * @param {string} options.employeeId - Generated employee ID
 * @param {string} options.tempPassword - Temporary password (plain text, will be sent once)
 * @param {string} options.companyName - Company name (optional)
 * @returns {Promise<Object>} Email send result
 */
const sendOnboardingEmail = async ({
  employeeName,
  employeeEmail,
  employeeId,
  tempPassword,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      throw new Error('Email transporter not configured');
    }

    // Validate required fields
    if (!employeeName || !employeeEmail || !employeeId || !tempPassword) {
      throw new Error('Missing required fields for onboarding email');
    }

    // Email template with professional design
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .content {
      padding: 30px;
    }
    .credentials-box {
      background: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .credential-item {
      margin: 10px 0;
      padding: 8px 0;
    }
    .credential-label {
      font-weight: 600;
      color: #555;
      display: inline-block;
      width: 180px;
    }
    .credential-value {
      color: #333;
      font-family: 'Courier New', monospace;
      background: #fff;
      padding: 5px 10px;
      border-radius: 3px;
      display: inline-block;
    }
    .warning-box {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .cta-button {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 12px 30px;
      text-decoration: none;
      border-radius: 5px;
      margin: 20px 0;
      font-weight: 600;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px;
      text-align: center;
      color: #666;
      font-size: 14px;
    }
    .emoji {
      font-size: 24px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="emoji">🎉</div>
      <h1>Welcome to ${companyName}!</h1>
    </div>
    
    <div class="content">
      <p>Hi <strong>${employeeName}</strong>,</p>
      
      <p>Congratulations and welcome aboard! 🎊</p>
      
      <p>Your onboarding process is complete, and your employee account has been successfully created. We're thrilled to have you join our team!</p>
      
      <h3>Your Login Credentials</h3>
      
      <div class="credentials-box">
        <div class="credential-item">
          <span class="credential-label">Employee ID:</span>
          <span class="credential-value">${employeeId}</span>
        </div>
        <div class="credential-item">
          <span class="credential-label">Email:</span>
          <span class="credential-value">${employeeEmail}</span>
        </div>
        <div class="credential-item">
          <span class="credential-label">Temporary Password:</span>
          <span class="credential-value">${tempPassword}</span>
        </div>
      </div>
      
      <div class="warning-box">
        <strong>⚠️ Important Security Notice:</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>This is a temporary password sent only once</li>
          <li>You will be required to change your password on first login</li>
          <li>Never share your password with anyone</li>
          <li>Store this email securely and delete it after changing your password</li>
        </ul>
      </div>
      
      <p style="text-align: center;">
        <a href="${process.env.FRONTEND_URL || 'http://3.108.172.119:8080'}/login/spc-management" class="cta-button">
          👉 Login to HRMS Portal
        </a>
      </p>
      
      <p>If you have any questions or need assistance, please don't hesitate to reach out to the HR team.</p>
      
      <p>We're excited to have you on the team!</p>
      
      <p style="margin-top: 30px;">
        Best regards,<br>
        <strong>HR Team</strong><br>
        ${companyName}
      </p>
    </div>
    
    <div class="footer">
      <p>This is an automated email from the HRMS system. Please do not reply to this email.</p>
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;

    // Plain text version for email clients that don't support HTML
    const textContent = `
Welcome to ${companyName}!

Hi ${employeeName},

Congratulations and welcome aboard!

Your onboarding process is complete, and your employee account has been successfully created.

Your Login Credentials:
- Employee ID: ${employeeId}
- Email: ${employeeEmail}
- Temporary Password: ${tempPassword}

IMPORTANT SECURITY NOTICE:
- This is a temporary password sent only once
- You will be required to change your password on first login
- Never share your password with anyone
- Store this email securely and delete it after changing your password

Please log in to the HRMS portal and change your password immediately.

If you have any questions or need assistance, please reach out to the HR team.

Best regards,
HR Team
${companyName}

---
This is an automated email from the HRMS system. Please do not reply to this email.
    `;

    // Email options
    const mailOptions = {
      from: {
        name: `${companyName} - HRMS`,
        address: process.env.EMAIL_USER
      },
      to: employeeEmail,
      subject: `🎉 Welcome to ${companyName} — Your Employee Account Details`,
      text: textContent,
      html: htmlContent,
      // High priority for important onboarding email
      priority: 'high'
    };

    // Send email with retry logic
    const info = await sendEmailWithRetry(transporter, mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      recipient: employeeEmail
    };

  } catch (error) {
    console.error('❌ Error sending onboarding email:', error);
    throw new Error(`Failed to send onboarding email: ${error.message}`);
  }
};

/**
 * Send notification email to HR when new employee account is created
 * @param {Object} options - Notification options
 * @param {string} options.employeeName - Full name of the employee
 * @param {string} options.employeeId - Generated employee ID
 * @param {string} options.department - Department name
 * @param {string} options.designation - Job designation
 * @param {string} options.hrEmail - HR email address (optional, uses default if not provided)
 * @returns {Promise<Object>} Email send result
 */
const sendHRNotification = async ({
  employeeName,
  employeeId,
  department,
  designation,
  hrEmail
}) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      console.warn('Email transporter not configured, skipping HR notification');
      return { success: false, message: 'Email not configured' };
    }

    const recipientEmail = hrEmail || process.env.EMAIL_USER;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 20px auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
    .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 5px; }
    .content { padding: 20px; background: white; margin-top: 20px; border-radius: 5px; }
    .info-item { margin: 10px 0; padding: 8px; background: #f8f9fa; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>✅ New Employee Account Created</h2>
    </div>
    <div class="content">
      <p>A new employee account has been successfully created in the HRMS system.</p>
      <div class="info-item"><strong>Employee Name:</strong> ${employeeName}</div>
      <div class="info-item"><strong>Employee ID:</strong> ${employeeId}</div>
      <div class="info-item"><strong>Department:</strong> ${department}</div>
      <div class="info-item"><strong>Designation:</strong> ${designation}</div>
      <div class="info-item"><strong>Created On:</strong> ${new Date().toLocaleString()}</div>
      <p style="margin-top: 20px;">The employee has been sent their login credentials via email.</p>
    </div>
  </div>
</body>
</html>
    `;

    const mailOptions = {
      from: {
        name: 'HRMS System',
        address: process.env.EMAIL_USER
      },
      to: recipientEmail,
      subject: `✅ New Employee Account Created - ${employeeName}`,
      html: htmlContent
    };

    const info = await sendEmailWithRetry(transporter, mailOptions);
    
    return {
      success: true,
      messageId: info.messageId
    };

  } catch (error) {
    console.error('❌ Error sending HR notification:', error);
    // Don't throw error for HR notification failure - it's not critical
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Send interview notification email to candidate
 * @param {Object} options - Email options
 * @param {string} options.candidateName - Full name of the candidate
 * @param {string} options.candidateEmail - Email address of the candidate
 * @param {string} options.interviewType - Type of interview (Technical, HR, etc.)
 * @param {string} options.interviewDate - Date of interview
 * @param {string} options.interviewTime - Time of interview
 * @param {string} options.meetingLink - Meeting link (Google Meet, Zoom, etc.)
 * @param {string} options.meetingPlatform - Platform name
 * @param {string} options.interviewerName - Name of interviewer (optional)
 * @param {string} options.position - Position applied for
 * @param {string} options.companyName - Company name (optional)
 * @returns {Promise<Object>} Email send result
 */
const sendInterviewNotification = async ({
  candidateName,
  candidateEmail,
  interviewType,
  interviewDate,
  interviewTime,
  meetingLink,
  meetingPlatform,
  interviewerName,
  position,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      throw new Error('Email transporter not configured');
    }

    // Validate required fields
    if (!candidateName || !candidateEmail || !interviewDate) {
      throw new Error('Missing required fields for interview notification');
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Interview Scheduled – ${position} at ${companyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', serif;
      background-color: #ffffff;
      color: #000000;
      padding: 40px 20px;
    }
    .wrapper {
      max-width: 620px;
      margin: 0 auto;
    }
    .header {
      padding: 28px 40px 10px 40px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header p {
      font-size: 12px;
      margin-top: 4px;
      letter-spacing: 0.5px;
      color: #444444;
    }
    .body {
      padding: 28px 40px;
    }
    .salutation {
      font-size: 15px;
      margin-bottom: 16px;
    }
    .intro {
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 8px;
    }
    .invite {
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 24px;
    }

    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 28px;
      font-size: 14px;
    }
    .details-table tr td {
      padding: 10px 0;
    }
    .details-table tr td:first-child {
      color: #555555;
      width: 160px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .details-table tr td:last-child {
      font-weight: bold;
    }
    .details-table tr {
      border-bottom: 1px solid #e0e0e0;
    }
    .details-table tr:last-child {
      border-bottom: none;
    }

    .section-title {
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .tips-list {
      list-style: none;
      padding: 0;
      margin-bottom: 28px;
    }
    .tips-list li {
      font-size: 14px;
      line-height: 1.7;
      padding: 5px 0;
      display: flex;
      gap: 10px;
    }
    .tips-list li::before {
      content: "—";
      flex-shrink: 0;
    }

    .closing {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 8px;
    }
    .closing2 {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 28px;
    }
    .signature {
      font-size: 14px;
      line-height: 1.8;
    }
    .signature strong {
      display: block;
      font-size: 15px;
    }
    .footer {
      padding: 16px 40px;
      font-size: 11px;
      color: #555555;
      letter-spacing: 0.4px;
    }
    .meeting-link {
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <div class="header">
      <h1>${companyName}</h1>
      <p>Human Resources Department</p>
    </div>

    <div class="body">

      <p class="salutation">Dear <strong>${candidateName}</strong>,</p>

      <p class="intro">
        Thank you for your interest in the <strong>${position}</strong> position at ${companyName}.
      </p>
      <p class="invite">
        We are pleased to invite you for an interview. Please find the details below:
      </p>

      <table class="details-table">
        <tr>
          <td>Interview Type</td>
          <td>${interviewType || 'To be confirmed'}</td>
        </tr>
        <tr>
          <td>Date</td>
          <td>${new Date(interviewDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
        </tr>
        <tr>
          <td>Time</td>
          <td>${interviewTime || 'To be confirmed'}</td>
        </tr>
        <tr>
          <td>Platform</td>
          <td>${meetingPlatform || 'To be confirmed'}</td>
        </tr>
        ${interviewerName ? `
        <tr>
          <td>Interviewer</td>
          <td>${interviewerName}</td>
        </tr>
        ` : ''}
        ${meetingLink ? `
        <tr>
          <td>Meeting Link</td>
          <td><a class="meeting-link" href="${meetingLink}">${meetingLink}</a></td>
        </tr>
        ` : ''}
      </table>

      <p class="section-title">Interview Tips</p>
      <ul class="tips-list">
        <li>Join the meeting 5 minutes early.</li>
        <li>Ensure a stable internet connection.</li>
        <li>Test your camera and microphone beforehand.</li>
        <li>Keep your resume and documents ready.</li>
        <li>Choose a quiet, well-lit location.</li>
      </ul>

      <p class="closing">If you have any questions or need to reschedule, please contact us as soon as possible.</p>
      <p class="closing2">We look forward to speaking with you.</p>

      <div class="signature">
        <p>Best regards,</p>
        <strong>HR Team</strong>
        <span>${companyName}</span>
      </div>

    </div>

    <div class="footer">
      This is an automated email from the HRMS system. &nbsp;|&nbsp; &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
    </div>

  </div>
</body>
</html>
    `;

    const textContent = `
Interview Scheduled - ${companyName}

Dear ${candidateName},

Thank you for your interest in the ${position} position at ${companyName}.

We are pleased to invite you for an interview.

Interview Details:
- Type: ${interviewType}
- Date: ${new Date(interviewDate).toLocaleDateString()}
- Time: ${interviewTime || 'To be confirmed'}
- Platform: ${meetingPlatform || 'To be confirmed'}
${interviewerName ? `- Interviewer: ${interviewerName}` : ''}
${meetingLink ? `- Meeting Link: ${meetingLink}` : ''}

Interview Tips:
- Join the meeting 5 minutes early
- Ensure stable internet connection
- Test your camera and microphone beforehand
- Keep your resume and documents ready
- Choose a quiet, well-lit location

If you have any questions or need to reschedule, please contact us as soon as possible.

We look forward to speaking with you!

Best regards,
HR Team
${companyName}
    `;

    const mailOptions = {
      from: {
        name: `${companyName} - HRMS`,
        address: process.env.EMAIL_USER
      },
      to: candidateEmail,
      subject: `📅 Interview Scheduled - ${interviewType} for ${position}`,
      text: textContent,
      html: htmlContent,
      priority: 'high'
    };

    const info = await sendEmailWithRetry(transporter, mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      recipient: candidateEmail
    };

  } catch (error) {
    console.error('❌ Error sending interview notification:', error);
    throw new Error(`Failed to send interview notification: ${error.message}`);
  }
};

/**
 * Verify email configuration
 * @returns {Promise<boolean>} True if email is configured correctly
 */
const verifyEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      return false;
    }

    await transporter.verify();
    return true;
  } catch (error) {
    console.error('❌ Email service verification failed:', error.message);
    return false;
  }
};

/**
 * Send application received confirmation email
 */
const sendApplicationReceivedEmail = async ({
  candidateName,
  candidateEmail,
  position,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .highlight-box { background: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Application Received</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${candidateName}</strong>,</p>
      <p>Thank you for applying for the <strong>${position}</strong> position at ${companyName}.</p>
      <div class="highlight-box">
        <p><strong>✅ Your application has been successfully received!</strong></p>
        <p>Our recruitment team will review your application and get back to you soon.</p>
      </div>
      <p><strong>What's Next?</strong></p>
      <ul>
        <li>Our team will review your application</li>
        <li>Shortlisted candidates will be contacted for interviews</li>
        <li>You'll receive updates via email</li>
      </ul>
      <p>We appreciate your interest in joining our team!</p>
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: candidateEmail,
      subject: `✅ Application Received - ${position}`,
      html: htmlContent
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending application email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send interview scheduled notification email
 */
const sendInterviewScheduledEmail = async ({
  candidateName,
  candidateEmail,
  position,
  interviewDate,
  interviewTime,
  interviewType,
  interviewLocation,
  interviewerName,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Interview Scheduled – ${position} at ${companyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', serif;
      background-color: #ffffff;
      color: #000000;
      padding: 40px 20px;
    }
    .wrapper {
      max-width: 620px;
      margin: 0 auto;
    }
    .header {
      padding: 28px 40px 10px 40px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header p {
      font-size: 12px;
      margin-top: 4px;
      letter-spacing: 0.5px;
      color: #444444;
    }
    .body {
      padding: 28px 40px;
    }
    .salutation {
      font-size: 15px;
      margin-bottom: 16px;
    }
    .intro {
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 8px;
    }
    .invite {
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 24px;
    }

    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 28px;
      font-size: 14px;
    }
    .details-table tr td {
      padding: 10px 0;
    }
    .details-table tr td:first-child {
      color: #555555;
      width: 160px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .details-table tr td:last-child {
      font-weight: bold;
    }
    .details-table tr {
      border-bottom: 1px solid #e0e0e0;
    }
    .details-table tr:last-child {
      border-bottom: none;
    }

    .section-title {
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .tips-list {
      list-style: none;
      padding: 0;
      margin-bottom: 28px;
    }
    .tips-list li {
      font-size: 14px;
      line-height: 1.7;
      padding: 5px 0;
      display: flex;
      gap: 10px;
    }
    .tips-list li::before {
      content: "—";
      flex-shrink: 0;
    }

    .closing {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 8px;
    }
    .closing2 {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 28px;
    }
    .signature {
      font-size: 14px;
      line-height: 1.8;
    }
    .signature strong {
      display: block;
      font-size: 15px;
    }
    .footer {
      padding: 16px 40px;
      font-size: 11px;
      color: #555555;
      letter-spacing: 0.4px;
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <div class="header">
      <h1>${companyName}</h1>
      <p>Human Resources Department</p>
    </div>

    <div class="body">

      <p class="salutation">Dear <strong>${candidateName}</strong>,</p>

      <p class="intro">
        Thank you for your interest in the <strong>${position}</strong> position at ${companyName}.
      </p>
      <p class="invite">
        We are pleased to invite you for an interview. Please find the details below:
      </p>

      <table class="details-table">
        <tr>
          <td>Interview Type</td>
          <td>${interviewType || 'To be confirmed'}</td>
        </tr>
        <tr>
          <td>Date</td>
          <td>${new Date(interviewDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
        </tr>
        <tr>
          <td>Time</td>
          <td>${interviewTime || 'To be confirmed'}</td>
        </tr>
        <tr>
          <td>Platform</td>
          <td>${interviewLocation || 'To be confirmed'}</td>
        </tr>
        ${interviewerName ? `
        <tr>
          <td>Interviewer</td>
          <td>${interviewerName}</td>
        </tr>
        ` : ''}
      </table>

      <p class="section-title">Interview Tips</p>
      <ul class="tips-list">
        <li>Join the meeting 5 minutes early.</li>
        <li>Ensure a stable internet connection.</li>
        <li>Test your camera and microphone beforehand.</li>
        <li>Keep your resume and documents ready.</li>
        <li>Choose a quiet, well-lit location.</li>
      </ul>

      <p class="closing">If you have any questions or need to reschedule, please contact us as soon as possible.</p>
      <p class="closing2">We look forward to speaking with you.</p>

      <div class="signature">
        <p>Best regards,</p>
        <strong>HR Team</strong>
        <span>${companyName}</span>
      </div>

    </div>

    <div class="footer">
      This is an automated email from the HRMS system. &nbsp;|&nbsp; &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
    </div>

  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: candidateEmail,
      subject: `📅 Interview Scheduled - ${position} at ${companyName}`,
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending interview scheduled email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send interview reminder email
 */
const sendInterviewReminderEmail = async ({
  candidateName,
  candidateEmail,
  position,
  interviewDate,
  interviewTime,
  interviewType,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .reminder-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏰ Interview Reminder</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${candidateName}</strong>,</p>
      <div class="reminder-box">
        <p><strong>⏰ Reminder: Your interview is coming up!</strong></p>
        <p>This is a friendly reminder about your upcoming interview for the <strong>${position}</strong> position at ${companyName}.</p>
        <p><strong>Date:</strong> ${interviewDate}<br>
        <strong>Time:</strong> ${interviewTime}<br>
        <strong>Type:</strong> ${interviewType}</p>
      </div>
      <p>Please ensure you are prepared and arrive on time. We look forward to meeting you!</p>
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: candidateEmail,
      subject: `⏰ Interview Reminder - ${position} Tomorrow`,
      html: htmlContent
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending interview reminder email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send interview cancelled notification email
 */
const sendInterviewCancelledEmail = async ({
  candidateName,
  candidateEmail,
  position,
  reason,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .alert-box { background: #fee2e2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ Interview Cancelled</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${candidateName}</strong>,</p>
      <div class="alert-box">
        <p><strong>We regret to inform you that your interview has been cancelled.</strong></p>
        <p>Position: <strong>${position}</strong></p>
        ${reason ? `<p>Reason: ${reason}</p>` : ''}
      </div>
      <p>We apologize for any inconvenience this may cause. We will contact you if we wish to reschedule or if any other opportunities arise.</p>
      <p>Thank you for your interest in ${companyName}.</p>
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: candidateEmail,
      subject: `Interview Cancelled - ${position} at ${companyName}`,
      html: htmlContent
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending interview cancelled email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send interview completed notification
 */
const sendInterviewCompletedEmail = async ({
  candidateName,
  candidateEmail,
  interviewType,
  position,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Thank You – HR Interview Completed</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', serif;
      background-color: #ffffff;
      color: #000000;
      padding: 40px 20px;
    }
    .wrapper {
      max-width: 620px;
      margin: 0 auto;
    }
    .header {
      padding: 28px 40px 10px 40px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header p {
      font-size: 12px;
      margin-top: 4px;
      letter-spacing: 0.5px;
      color: #444444;
    }
    .body {
      padding: 28px 40px;
    }
    .salutation {
      font-size: 15px;
      margin-bottom: 16px;
    }
    .intro {
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 28px;
    }
    .section-title {
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    .whats-next {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 28px;
    }
    .closing {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 8px;
    }
    .closing2 {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 28px;
    }
    .signature {
      font-size: 14px;
      line-height: 1.8;
    }
    .signature strong {
      display: block;
      font-size: 15px;
    }
    .footer {
      padding: 16px 40px;
      font-size: 11px;
      color: #555555;
      letter-spacing: 0.4px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${companyName}</h1>
      <p>Human Resources Department</p>
    </div>

    <div class="body">
      <p class="salutation">Dear <strong>${candidateName}</strong>,</p>

      <p class="intro">
        Thank you for attending the <strong>${interviewType || 'HR'}</strong> interview for the
        <strong>${position}</strong> position at ${companyName}.
      </p>

      <p class="section-title">What's Next</p>
      <p class="whats-next">
        Our team is currently reviewing your interview performance. We will get
        back to you with the next steps soon.
      </p>

      <p class="closing">We appreciate the time you took to interview with us and your interest in joining our team.</p>

      <div class="signature">
        <p>Best regards,</p>
        <strong>HR Team</strong>
        <span>${companyName}</span>
      </div>
    </div>

    <div class="footer">
      &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved. &nbsp;|&nbsp; This is an automated email from the HRMS system.
    </div>
  </div>
</body>
</html>
    `;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: candidateEmail,
      subject: `Interview Completed - ${position} at ${companyName}`,
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending interview completed email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send offer letter using a stored OfferTemplate (DB)
 */
const sendOfferLetterWithTemplate = async ({
  templateId,
  candidateName,
  candidateEmail,
  position,
  designation,
  ctc,
  joiningDate,
  offerDetails = {},
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const OfferTemplate = require('../models/OfferTemplate');
    const template = await OfferTemplate.findById(templateId);
    if (!template) {
      throw new Error('Offer template not found');
    }

    const formattedJoiningDate = joiningDate
      ? new Date(joiningDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : '';

    const variables = {
      candidateName,
      position,
      designation: designation || position,
      ctc,
      joiningDate: formattedJoiningDate,
      companyName,
      ...offerDetails
    };

    let htmlContent = template.content || '';
    let subject = template.subject || `Offer Letter - ${position}`;

    Object.keys(variables).forEach((key) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      const value = variables[key] ?? '';
      htmlContent = htmlContent.replace(regex, value);
      subject = subject.replace(regex, value);
    });

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: candidateEmail,
      subject,
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending offer letter with template:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send offer extended email
 */
const sendOfferExtendedEmail = async ({
  candidateName,
  candidateEmail,
  position,
  joiningDate,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .offer-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Offer letter</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${candidateName}</strong>,</p>
      <div class="offer-box">
        <p><strong>🎊 Congratulations!</strong></p>
        <p>We are delighted to extend an offer for the <strong>${position}</strong> position at ${companyName}.</p>
        ${joiningDate ? `<p><strong>Proposed Joining Date:</strong> ${new Date(joiningDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
      </div>
      <p><strong>Next Steps:</strong></p>
      <ul>
        <li>Please review the offer letter attached or sent separately</li>
        <li>Contact us if you have any questions</li>
        <li>Confirm your acceptance at your earliest convenience</li>
      </ul>
      <p>We are excited about the possibility of you joining our team!</p>
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: candidateEmail,
      subject: `🎊 Offer Letter - ${position} at ${companyName}`,
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending offer email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send rejection email
 */
const sendRejectionEmail = async ({
  candidateName,
  candidateEmail,
  position,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .info-box { background: #f8f9fa; border-left: 4px solid #6b7280; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Application Update</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${candidateName}</strong>,</p>
      <p>Thank you for your interest in the <strong>${position}</strong> position at ${companyName} and for taking the time to interview with us.</p>
      <div class="info-box">
        <p>After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.</p>
      </div>
      <p>We appreciate your interest in ${companyName} and encourage you to apply for future opportunities that match your skills and experience.</p>
      <p>We wish you all the best in your job search and future endeavors.</p>
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: candidateEmail,
      subject: `Application Update - ${position}`,
      html: htmlContent
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending rejection email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send shortlisted notification email
 */
const sendShortlistedEmail = async ({
  candidateName,
  candidateEmail,
  position,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>You're Shortlisted – ${position} at ${companyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', serif;
      background-color: #ffffff;
      color: #000000;
      padding: 40px 20px;
    }
    .wrapper {
      max-width: 620px;
      margin: 0 auto;
    }
    .header {
      padding: 28px 40px;
      text-align: left;
    }
    .header h1 {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header p {
      font-size: 12px;
      margin-top: 4px;
      letter-spacing: 0.5px;
      color: #444444;
    }
    .body {
      padding: 36px 40px;
    }
    .salutation {
      font-size: 15px;
      margin-bottom: 20px;
      text-align: left;
    }
    .notice-box {
      padding: 0;
      margin-bottom: 24px;
      text-align: left;
    }
    .notice-box p {
      font-size: 14px;
      line-height: 1.7;
    }
    .notice-box strong {
      font-weight: bold;
    }
    .section-title {
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
      padding-bottom: 6px;
      text-align: left;
    }
    .steps-list {
      list-style: none;
      padding: 0;
      margin-bottom: 28px;
    }
    .steps-list li {
      font-size: 14px;
      line-height: 1.7;
      padding: 6px 0;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      text-align: left;
    }
    .steps-list li::before {
      content: "—";
      font-weight: bold;
      flex-shrink: 0;
    }
    .closing {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 28px;
      text-align: left;
    }
    .signature {
      font-size: 14px;
      line-height: 1.8;
      text-align: left;
    }
    .signature strong {
      display: block;
      font-size: 15px;
    }
    .footer {
      padding: 16px 40px;
      text-align: left;
      font-size: 11px;
      color: #555555;
      letter-spacing: 0.4px;
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <div class="header">
      <h1>${companyName}</h1>
      <p>Human Resources Department</p>
    </div>

    <div class="body">

      <p class="salutation">Dear <strong>${candidateName}</strong>,</p>

      <div class="notice-box">
        <p>
          We are pleased to inform you that you have been <strong>shortlisted</strong>
          for the position of <strong>${position}</strong> at
          <strong>${companyName}</strong>. Your profile has been reviewed and
          selected to move forward in our recruitment process.
        </p>
      </div>

      <p class="section-title">Next Steps</p>
      <ul class="steps-list">
        <li>You will be contacted shortly to schedule a formal interview.</li>
        <li>Please ensure your phone and email address remain accessible.</li>
        <li>Kindly prepare your documents and portfolio in advance.</li>
      </ul>

      <p class="closing">
        We look forward to meeting you and learning more about your experience.
        Should you have any questions in the meantime, please do not hesitate
        to reach out to our HR team.
      </p>

      <div class="signature">
        <p>Yours sincerely,</p>
        <strong>HR Team</strong>
        <span>${companyName}</span>
      </div>

    </div>

    <div class="footer">
      &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved. &nbsp;|&nbsp;
      This is an automated notification. Please do not reply directly to this email.
    </div>

  </div>
</body>
</html>
    `;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: candidateEmail,
      subject: `You're Shortlisted - ${position} at ${companyName}`,
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending shortlisted email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send company admin credentials email
 * @param {Object} options - Email options
 * @param {string} options.companyName - Name of the company
 * @param {string} options.adminEmail - Admin email address
 * @param {string} options.adminPassword - Auto-generated password
 * @param {string} options.loginUrl - Login URL for the company
 * @returns {Promise<Object>} Email send result
 */
const sendCompanyAdminCredentials = async ({
  companyName,
  adminEmail,
  adminPassword,
  loginUrl = process.env.FRONTEND_URL || 'http://3.108.172.119:8080'
}) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      throw new Error('Email transporter not configured');
    }

    // Validate required fields
    if (!companyName || !adminEmail || !adminPassword) {
      throw new Error('Missing required fields for company admin credentials email');
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .header p {
      margin: 10px 0 0 0;
      font-size: 16px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
    }
    .welcome-message {
      background: linear-gradient(135deg, #e0e7ff 0%, #f3e8ff 100%);
      border-radius: 8px;
      padding: 25px;
      margin: 25px 0;
      text-align: center;
    }
    .welcome-message h2 {
      margin: 0 0 10px 0;
      color: #667eea;
      font-size: 24px;
    }
    .credentials-box {
      background: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 25px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .credential-item {
      margin: 15px 0;
      padding: 12px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .credential-item:last-child {
      border-bottom: none;
    }
    .credential-label {
      font-weight: 600;
      color: #555;
      display: block;
      margin-bottom: 5px;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .credential-value {
      color: #1f2937;
      font-family: 'Courier New', monospace;
      background: #fff;
      padding: 10px 15px;
      border-radius: 4px;
      display: block;
      font-size: 16px;
      border: 1px solid #e5e7eb;
      word-break: break-all;
    }
    .warning-box {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .warning-box strong {
      color: #856404;
    }
    .warning-box ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    .warning-box li {
      margin: 8px 0;
      color: #856404;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 40px;
      text-decoration: none;
      border-radius: 6px;
      margin: 25px 0;
      font-weight: 600;
      font-size: 16px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      transition: transform 0.2s;
    }
    .cta-button:hover {
      transform: translateY(-2px);
    }
    .features-box {
      background: #f8f9fa;
      padding: 20px;
      margin: 25px 0;
      border-radius: 4px;
    }
    .features-box h3 {
      margin-top: 0;
      color: #333;
    }
    .features-box ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    .features-box li {
      margin: 8px 0;
    }
    .footer {
      background: #f8f9fa;
      padding: 25px;
      text-align: center;
      color: #666;
      font-size: 14px;
    }
    .footer p {
      margin: 5px 0;
    }
    .emoji {
      font-size: 32px;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="emoji">🎉</div>
      <h1>Welcome to HRMS Platform!</h1>
      <p>Your company account has been created</p>
    </div>
    
    <div class="content">
      <div class="welcome-message">
        <h2>🏢 ${companyName}</h2>
        <p>Your HRMS account is now active and ready to use!</p>
      </div>
      
      <p>Dear Administrator,</p>
      
      <p>Congratulations! Your company has been successfully onboarded to our HRMS platform. We're excited to have <strong>${companyName}</strong> join our growing community of organizations streamlining their HR operations.</p>
      
      <div class="credentials-box">
        <h3>🔐 Your Administrator Login Credentials</h3>
        
        <div class="credential-item">
          <span class="credential-label">Company Name</span>
          <span class="credential-value">${companyName}</span>
        </div>
        
        <div class="credential-item">
          <span class="credential-label">Admin Email</span>
          <span class="credential-value">${adminEmail}</span>
        </div>
        
        <div class="credential-item">
          <span class="credential-label">Temporary Password</span>
          <span class="credential-value">${adminPassword}</span>
        </div>
        
        <div class="credential-item">
          <span class="credential-label">Login URL</span>
          <span class="credential-value">${loginUrl}/login</span>
        </div>
      </div>
      
      <div class="warning-box">
        <strong>⚠️ Important Security Notice:</strong>
        <ul>
          <li>This is a <strong>temporary password</strong> sent only once via this email</li>
          <li>You will be <strong>required to change your password</strong> upon first login</li>
          <li><strong>Never share</strong> your password with anyone</li>
          <li>Store this email securely and <strong>delete it after</strong> changing your password</li>
          <li>If you didn't request this account, please contact our support team immediately</li>
        </ul>
      </div>
      
      <p style="text-align: center;">
        <a href="${loginUrl}/login" class="cta-button">
          🚀 Login to Your HRMS Dashboard
        </a>
      </p>
      
      <div class="features-box">
        <h3>✨ What You Can Do Next:</h3>
        <ul>
          <li>📊 Set up your company profile and preferences</li>
          <li>👥 Add departments and designations</li>
          <li>🆕 Create employee accounts and manage your team</li>
          <li>📋 Configure HR policies and workflows</li>
          <li>📈 Access analytics and reports</li>
          <li>⚙️ Customize system settings to match your needs</li>
        </ul>
      </div>
      
      <p><strong>Need Help?</strong></p>
      <p>If you have any questions or need assistance getting started, our support team is here to help. Feel free to reach out to us anytime.</p>
      
      <p>We're committed to making your HR management experience smooth and efficient!</p>
      
      <p style="margin-top: 30px;">
        Best regards,<br>
        <strong>HRMS Support Team</strong><br>
        <a href="mailto:${process.env.EMAIL_USER}" style="color: #667eea; text-decoration: none;">${process.env.EMAIL_USER}</a>
      </p>
    </div>
    
    <div class="footer">
      <p>This is an automated email from the HRMS system. Please do not reply to this email.</p>
      <p>For support, contact us at <a href="mailto:${process.env.EMAIL_USER}" style="color: #667eea;">${process.env.EMAIL_USER}</a></p>
      <p>&copy; ${new Date().getFullYear()} HRMS Platform. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;

    const textContent = `
Welcome to HRMS Platform!

Company: ${companyName}

Dear Administrator,

Congratulations! Your company has been successfully onboarded to our HRMS platform.

YOUR ADMINISTRATOR LOGIN CREDENTIALS:
- Company Name: ${companyName}
- Admin Email: ${adminEmail}
- Temporary Password: ${adminPassword}
- Login URL: ${loginUrl}/login

IMPORTANT SECURITY NOTICE:
- This is a temporary password sent only once via this email
- You will be required to change your password upon first login
- Never share your password with anyone
- Store this email securely and delete it after changing your password
- If you didn't request this account, please contact our support team immediately

WHAT YOU CAN DO NEXT:
- Set up your company profile and preferences
- Add departments and designations
- Create employee accounts and manage your team
- Configure HR policies and workflows
- Access analytics and reports
- Customize system settings to match your needs

Need Help?
If you have any questions or need assistance getting started, our support team is here to help.

Best regards,
HRMS Support Team
${process.env.EMAIL_USER}

---
This is an automated email from the HRMS system. Please do not reply to this email.
    `;

    const mailOptions = {
      from: {
        name: 'HRMS Platform',
        address: process.env.EMAIL_USER
      },
      to: adminEmail,
      subject: `🎉 Welcome to HRMS - ${companyName} Account Created`,
      text: textContent,
      html: htmlContent,
      priority: 'high'
    };

    const info = await sendEmailWithRetry(transporter, mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      recipient: adminEmail
    };

  } catch (error) {
    console.error('❌ Error sending company admin credentials email:', error);
    throw new Error(`Failed to send company admin credentials email: ${error.message}`);
  }
};

/**
 * Send welcome email to new employee
 */
const sendWelcomeEmail = async ({
  employeeName,
  employeeEmail,
  employeeId,
  department,
  position,
  joiningDate,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { padding: 30px; }
    .welcome-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .info-item { margin: 10px 0; padding: 8px; background: #f8f9fa; border-radius: 4px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to ${companyName}!</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${employeeName}</strong>,</p>
      <div class="welcome-box">
        <p><strong>🎊 Welcome aboard!</strong></p>
        <p>We are thrilled to have you join our team at ${companyName}. Your skills and experience will be a great addition to our organization.</p>
      </div>
      <h3>Your Details:</h3>
      <div class="info-item"><strong>Employee ID:</strong> ${employeeId}</div>
      <div class="info-item"><strong>Position:</strong> ${position}</div>
      <div class="info-item"><strong>Department:</strong> ${department}</div>
      ${joiningDate ? `<div class="info-item"><strong>Joining Date:</strong> ${new Date(joiningDate).toLocaleDateString()}</div>` : ''}
      <p><strong>What's Next:</strong></p>
      <ul>
        <li>Check your email for login credentials</li>
        <li>Complete your profile in the HRMS portal</li>
        <li>Review company policies and guidelines</li>
        <li>Meet your team and manager</li>
      </ul>
      <p>If you have any questions, please don't hesitate to reach out to the HR team.</p>
      <p>We look forward to working with you!</p>
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: employeeEmail,
      subject: `🎉 Welcome to ${companyName}!`,
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send document request email with upload portal link
 * @param {Object} options - Email options
 * @param {string} options.candidateName - Full name of the candidate
 * @param {string} options.candidateEmail - Email address of the candidate
 * @param {string} options.position - Position/role
 * @param {string} options.uploadUrl - Public upload portal URL with token
 * @param {string} options.companyName - Company name (optional)
 * @returns {Promise<Object>} Email send result
 */
const sendDocumentRequestEmail = async ({
  candidateName,
  candidateEmail,
  position,
  uploadUrl,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      throw new Error('Email transporter not configured');
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Document Submission Required – ${companyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', serif;
      background-color: #ffffff;
      color: #000000;
      padding: 40px 20px;
    }
    .wrapper {
      max-width: 620px;
      margin: 0 auto;
    }
    .header {
      padding: 28px 40px 10px 40px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header p {
      font-size: 12px;
      margin-top: 4px;
      letter-spacing: 0.5px;
      color: #444444;
    }
    .body {
      padding: 28px 40px;
    }
    .salutation {
      font-size: 15px;
      margin-bottom: 16px;
    }
    .para {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 20px;
    }
    .action-title {
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .action-desc {
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 24px;
    }
    .section-title {
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .doc-list {
      list-style: none;
      padding: 0;
      margin-bottom: 28px;
    }
    .doc-list li {
      font-size: 14px;
      line-height: 1.7;
      padding: 5px 0;
      display: flex;
      gap: 10px;
    }
    .doc-list li::before {
      content: "—";
      flex-shrink: 0;
    }
    .upload-btn {
      display: inline-block;
      margin: 4px 0 28px 0;
      padding: 11px 28px;
      font-size: 14px;
      font-family: 'Georgia', serif;
      font-weight: bold;
      text-decoration: none;
      color: #000000;
      border: 1.5px solid #000000;
      letter-spacing: 0.5px;
    }
    .notes-title {
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .notes-list {
      list-style: none;
      padding: 0;
      margin-bottom: 24px;
    }
    .notes-list li {
      font-size: 14px;
      line-height: 1.7;
      padding: 5px 0;
      display: flex;
      gap: 10px;
    }
    .notes-list li::before {
      content: "—";
      flex-shrink: 0;
    }
    .closing {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 24px;
    }
    .signature {
      font-size: 14px;
      line-height: 1.8;
    }
    .signature strong {
      display: block;
      font-size: 15px;
    }
    .footer {
      padding: 16px 40px;
      font-size: 11px;
      color: #555555;
      letter-spacing: 0.4px;
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <!-- Header -->
    <div class="header">
      <h1>${companyName}</h1>
      <p>Human Resources Department</p>
    </div>

    <!-- Body -->
    <div class="body">

      <p class="salutation">Dear <strong>${candidateName}</strong>,</p>

      <p class="para">
        We are pleased to inform you that your onboarding process for the
        <strong>${position}</strong> position at ${companyName} is progressing well.
      </p>

      <!-- Action Required -->
      <p class="action-title">Action Required: Submit Your Documents</p>
      <p class="action-desc">
        To proceed with your onboarding, we need you to upload the required documents
        through our secure document portal.
      </p>

      <!-- Required Documents -->
      <p class="section-title">Required Documents</p>
      <ul class="doc-list">
        <li>Aadhaar Card (both sides)</li>
        <li>PAN Card</li>
        <li>Educational Certificates</li>
        <li>Address Proof</li>
        <li>Bank Account Details (cancelled cheque or passbook)</li>
        <li>Passport-size Photograph</li>
        <li>Previous Employment Documents (if applicable)</li>
      </ul>

      <!-- Upload Button -->
      <a href="${uploadUrl}" class="upload-btn">Upload Documents Now</a>

      <!-- Important Notes -->
      <p class="notes-title">Important Notes</p>
      <ul class="notes-list">
        <li>All documents should be clear and legible.</li>
        <li>Accepted formats: PDF, JPG, PNG.</li>
        <li>Maximum file size: 10MB per document.</li>
        <li>This link is secure and unique to you.</li>
      </ul>

      <p class="closing">
        If you face any issues or have questions, please do not hesitate to contact our HR team.
      </p>

      <!-- Signature -->
      <div class="signature">
        <p>Best regards,</p>
        <strong>HR Team</strong>
        <span>${companyName}</span>
      </div>

    </div>

    <!-- Footer -->
    <div class="footer">
      This is an automated email from the HRMS system. Please do not reply to this email. &nbsp;|&nbsp; © ${new Date().getFullYear()} ${companyName}. All rights reserved.
    </div>

  </div>
</body>
</html>
    `;

    const textContent = `
Document Submission Required – ${companyName}

Dear ${candidateName},

We are pleased to inform you that your onboarding process for the ${position} position at ${companyName} is progressing well.

Action Required: Submit Your Documents
To proceed with your onboarding, we need you to upload the required documents through our secure document portal.

Required Documents:
— Aadhaar Card (both sides)
— PAN Card
— Educational Certificates
— Address Proof
— Bank Account Details (cancelled cheque or passbook)
— Passport-size Photograph
— Previous Employment Documents (if applicable)

Upload Link: ${uploadUrl}

Important Notes:
— All documents should be clear and legible.
— Accepted formats: PDF, JPG, PNG.
— Maximum file size: 10MB per document.
— This link is secure and unique to you.

If you face any issues or have questions, please do not hesitate to contact our HR team.

Best regards,
HR Team
${companyName}

© ${new Date().getFullYear()} ${companyName}. All rights reserved.
    `;

    const mailOptions = {
      from: {
        name: `${companyName} - HRMS`,
        address: process.env.EMAIL_USER
      },
      to: candidateEmail,
      subject: `Document Submission Required – ${position} at ${companyName}`,
      text: textContent,
      html: htmlContent,
      priority: 'high'
    };

    const info = await sendEmailWithRetry(transporter, mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      recipient: candidateEmail
    };

  } catch (error) {
    console.error('❌ Error sending document request email:', error);
    throw new Error(`Failed to send document request email: ${error.message}`);
  }
};

/**
 * Send joining date confirmation email to candidate
 * @param {Object} options - Email options
 * @param {string} options.candidateName - Full name of the candidate
 * @param {string} options.candidateEmail - Email address of the candidate
 * @param {string} options.position - Position/role
 * @param {string} options.joiningDate - Joining date
 * @param {string} options.companyName - Company name (optional)
 * @returns {Promise<Object>} Email send result
 */
const sendJoiningDateConfirmationEmail = async ({
  candidateName,
  candidateEmail,
  position,
  joiningDate,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      throw new Error('Email transporter not configured');
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Joining Date Confirmed – ${companyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', serif;
      background-color: #ffffff;
      color: #000000;
      padding: 40px 20px;
    }
    .wrapper {
      max-width: 620px;
      margin: 0 auto;
    }
    .header {
      padding: 28px 40px 10px 40px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header p {
      font-size: 12px;
      margin-top: 4px;
      letter-spacing: 0.5px;
      color: #444444;
    }
    .body {
      padding: 28px 40px;
    }
    .salutation {
      font-size: 15px;
      margin-bottom: 16px;
    }
    .para {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 20px;
    }
    .onboarding-notice {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 6px;
    }
    .onboarding-sub {
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 24px;
    }
    .joining-label {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #555555;
      margin-bottom: 6px;
    }
    .joining-date {
      font-size: 22px;
      font-weight: bold;
      letter-spacing: 0.5px;
      margin-bottom: 28px;
    }
    .section-title {
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .info-list {
      list-style: none;
      padding: 0;
      margin-bottom: 24px;
    }
    .info-list li {
      font-size: 14px;
      line-height: 1.7;
      padding: 5px 0;
      display: flex;
      gap: 10px;
    }
    .info-list li::before {
      content: "—";
      flex-shrink: 0;
    }
    .closing {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 24px;
    }
    .signature {
      font-size: 14px;
      line-height: 1.8;
    }
    .signature strong {
      display: block;
      font-size: 15px;
    }
    .footer {
      padding: 16px 40px;
      font-size: 11px;
      color: #555555;
      letter-spacing: 0.4px;
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <!-- Header -->
    <div class="header">
      <h1>${companyName}</h1>
      <p>Human Resources Department</p>
    </div>

    <!-- Body -->
    <div class="body">

      <p class="salutation">Dear <strong>${candidateName}</strong>,</p>

      <p class="para">
        We are delighted to confirm your joining details for the
        <strong>${position}</strong> position at ${companyName}.
      </p>

      <!-- Onboarding Notice -->
      <p class="onboarding-notice">Your onboarding process is almost complete!</p>
      <p class="onboarding-sub">We look forward to welcoming you to our team.</p>

      <!-- Joining Date -->
      <p class="joining-label">Your Joining Date</p>
      <p class="joining-date">${new Date(joiningDate).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}</p>

      <!-- What to Expect -->
      <p class="section-title">What to Expect on Your First Day</p>
      <ul class="info-list">
        <li>Orientation and introduction to the team.</li>
        <li>IT setup and account access.</li>
        <li>Documentation verification.</li>
        <li>Office and facilities tour.</li>
      </ul>

      <!-- What to Bring -->
      <p class="section-title">What to Bring</p>
      <ul class="info-list">
        <li>Original documents for verification.</li>
        <li>ID proof (Aadhaar / PAN / Passport).</li>
        <li>Passport-size photographs.</li>
      </ul>

      <p class="closing">
        If you have any questions or need to reschedule, please contact our HR team immediately.
      </p>

      <!-- Signature -->
      <div class="signature">
        <p>Best regards,</p>
        <strong>HR Team</strong>
        <span>${companyName}</span>
      </div>

    </div>

    <!-- Footer -->
    <div class="footer">
      This is an automated email from the HRMS system. Please do not reply to this email. &nbsp;|&nbsp; © ${new Date().getFullYear()} ${companyName}. All rights reserved.
    </div>

  </div>
</body>
</html>
    `;

    const mailOptions = {
      from: {
        name: `${companyName} - HRMS`,
        address: process.env.EMAIL_USER
      },
      to: candidateEmail,
      subject: `Joining Date Confirmed – ${position} at ${companyName}`,
      text: `
Joining Date Confirmed – ${companyName}

Dear ${candidateName},

We are delighted to confirm your joining details for the ${position} position at ${companyName}.

Your onboarding process is almost complete! We look forward to welcoming you to our team.

Your Joining Date
${new Date(joiningDate).toLocaleDateString('en-US', { 
  weekday: 'long', 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})}

What to Expect on Your First Day:
— Orientation and introduction to the team.
— IT setup and account access.
— Documentation verification.
— Office and facilities tour.

What to Bring:
— Original documents for verification.
— ID proof (Aadhaar / PAN / Passport).
— Passport-size photographs.

If you have any questions or need to reschedule, please contact our HR team immediately.

Best regards,
HR Team
${companyName}

© ${new Date().getFullYear()} ${companyName}. All rights reserved.
      `,
      html: htmlContent,
      priority: 'high'
    };

    const info = await sendEmailWithRetry(transporter, mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      recipient: candidateEmail
    };

  } catch (error) {
    console.error('❌ Error sending joining date confirmation email:', error);
    throw new Error(`Failed to send joining date confirmation email: ${error.message}`);
  }
};

/**
 * Send IT notification for new employee setup
 * @param {Object} options - Email options
 * @param {string} options.employeeName - Full name of the employee
 * @param {string} options.employeeEmail - Email address of the employee
 * @param {string} options.position - Position/role
 * @param {string} options.department - Department name
 * @param {string} options.joiningDate - Joining date
 * @param {string} options.itEmail - IT department email (optional)
 * @param {string} options.companyName - Company name (optional)
 * @returns {Promise<Object>} Email send result
 */
const sendITNotification = async ({
  employeeName,
  employeeEmail,
  position,
  department,
  joiningDate,
  itEmail,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      console.warn('Email transporter not configured, skipping IT notification');
      return { success: false, message: 'Email not configured' };
    }

    const recipientEmail = itEmail || process.env.IT_EMAIL || process.env.EMAIL_USER;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 20px auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
    .header { background: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 5px; }
    .content { padding: 20px; background: white; margin-top: 20px; border-radius: 5px; }
    .info-item { margin: 10px 0; padding: 8px; background: #f8f9fa; border-radius: 3px; }
    .urgent { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>🔧 IT Setup Required - New Employee</h2>
    </div>
    <div class="content">
      <p>A new employee will be joining soon and requires IT setup.</p>
      <div class="urgent">
        <strong>⚠️ Action Required:</strong> Please prepare the following IT resources before the joining date.
      </div>
      <div class="info-item"><strong>Employee Name:</strong> ${employeeName}</div>
      <div class="info-item"><strong>Email:</strong> ${employeeEmail}</div>
      <div class="info-item"><strong>Position:</strong> ${position}</div>
      <div class="info-item"><strong>Department:</strong> ${department}</div>
      <div class="info-item"><strong>Joining Date:</strong> ${new Date(joiningDate).toLocaleDateString()}</div>
      
      <h3>IT Setup Checklist:</h3>
      <ul>
        <li>Create user accounts and email</li>
        <li>Prepare laptop/desktop and accessories</li>
        <li>Configure system access and permissions</li>
        <li>Set up development tools and software</li>
        <li>Prepare network credentials</li>
        <li>Configure communication tools (Slack, Teams, etc.)</li>
      </ul>
    </div>
  </div>
</body>
</html>
    `;

    const mailOptions = {
      from: {
        name: 'HRMS System',
        address: process.env.EMAIL_USER
      },
      to: recipientEmail,
      subject: `🔧 IT Setup Required - ${employeeName} joining on ${new Date(joiningDate).toLocaleDateString()}`,
      html: htmlContent
    };

    const info = await sendEmailWithRetry(transporter, mailOptions);
    
    return {
      success: true,
      messageId: info.messageId
    };

  } catch (error) {
    console.error('❌ Error sending IT notification:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Send Facilities notification for new employee
 * @param {Object} options - Email options
 * @param {string} options.employeeName - Full name of the employee
 * @param {string} options.position - Position/role
 * @param {string} options.department - Department name
 * @param {string} options.joiningDate - Joining date
 * @param {string} options.facilitiesEmail - Facilities department email (optional)
 * @param {string} options.companyName - Company name (optional)
 * @returns {Promise<Object>} Email send result
 */
const sendFacilitiesNotification = async ({
  employeeName,
  position,
  department,
  joiningDate,
  facilitiesEmail,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      console.warn('Email transporter not configured, skipping Facilities notification');
      return { success: false, message: 'Email not configured' };
    }

    const recipientEmail = facilitiesEmail || process.env.FACILITIES_EMAIL || process.env.EMAIL_USER;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 20px auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }
    .header { background: #8b5cf6; color: white; padding: 20px; text-align: center; border-radius: 5px; }
    .content { padding: 20px; background: white; margin-top: 20px; border-radius: 5px; }
    .info-item { margin: 10px 0; padding: 8px; background: #f8f9fa; border-radius: 3px; }
    .urgent { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>🏢 Facilities Setup Required - New Employee</h2>
    </div>
    <div class="content">
      <p>A new employee will be joining soon and requires facilities setup.</p>
      <div class="urgent">
        <strong>⚠️ Action Required:</strong> Please prepare the following facilities before the joining date.
      </div>
      <div class="info-item"><strong>Employee Name:</strong> ${employeeName}</div>
      <div class="info-item"><strong>Position:</strong> ${position}</div>
      <div class="info-item"><strong>Department:</strong> ${department}</div>
      <div class="info-item"><strong>Joining Date:</strong> ${new Date(joiningDate).toLocaleDateString()}</div>
      
      <h3>Facilities Setup Checklist:</h3>
      <ul>
        <li>Allocate workspace/desk</li>
        <li>Prepare chair and ergonomic setup</li>
        <li>Arrange access card/ID badge</li>
        <li>Prepare welcome kit and stationery</li>
        <li>Coordinate parking/access permissions</li>
        <li>Set up locker and storage if needed</li>
        <li>Prepare induction materials</li>
      </ul>
    </div>
  </div>
</body>
</html>
    `;

    const mailOptions = {
      from: {
        name: 'HRMS System',
        address: process.env.EMAIL_USER
      },
      to: recipientEmail,
      subject: `🏢 Facilities Setup Required - ${employeeName} joining on ${new Date(joiningDate).toLocaleDateString()}`,
      html: htmlContent
    };

    const info = await sendEmailWithRetry(transporter, mailOptions);
    
    return {
      success: true,
      messageId: info.messageId
    };

  } catch (error) {
    console.error('❌ Error sending Facilities notification:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Send document rejection/re-submission email
 */
const sendDocumentRejectionEmail = async ({
  candidateName,
  candidateEmail,
  documentName,
  rejectionReason,
  uploadUrl,
  rejectedDocuments = []
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const rejectedDocsList = rejectedDocuments.map(doc => 
      `<li><strong>${doc.documentType.replace(/_/g, ' ').toUpperCase()}</strong>: ${doc.reason}</li>`
    ).join('');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .alert-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .rejected-docs { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📄 Document Re-submission Required</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${candidateName}</strong>,</p>
      <div class="alert-box">
        <p>Thank you for submitting your onboarding documents. After careful review, we need you to re-submit some documents to proceed with your onboarding.</p>
      </div>
      <div class="rejected-docs">
        <p><strong>Documents requiring re-submission:</strong></p>
        <ul>
          ${rejectedDocsList}
        </ul>
      </div>
      <p><strong>What you need to do:</strong></p>
      <ol>
        <li>Review the reasons mentioned above for each document</li>
        <li>Prepare corrected/updated versions of the documents</li>
        <li>Click the button below to re-upload the documents</li>
        <li>Ensure documents are clear, complete, and meet the specified requirements</li>
      </ol>
      <div style="text-align: center;">
        <a href="${uploadUrl}" class="cta-button">Re-Upload Documents</a>
      </div>
      <p><strong>Important Guidelines:</strong></p>
      <ul>
        <li>Ensure all documents are clear and readable</li>
        <li>Upload documents in the correct format (PDF, JPG, PNG)</li>
        <li>Make sure all required information is visible</li>
        <li>Double-check document accuracy before uploading</li>
      </ul>
      <p>If you have any questions or need assistance, please don't hesitate to contact our HR team.</p>
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong></p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} HRMS. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: 'HRMS - Document Verification', address: process.env.EMAIL_USER },
      to: candidateEmail,
      subject: '📄 Action Required: Re-submit Onboarding Documents',
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending document rejection email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send offer letter with document upload link
 */
const sendOfferLetterWithDocumentLink = async ({
  candidateName,
  candidateEmail,
  position,
  joiningDate,
  uploadUrl,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .offer-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .document-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎊 Congratulations!</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${candidateName}</strong>,</p>
      <div class="offer-box">
        <p><strong>🎊 We are delighted to extend an offer!</strong></p>
        <p>We are pleased to offer you the <strong>${position}</strong> position at ${companyName}.</p>
        ${joiningDate ? `<p><strong>Proposed Joining Date:</strong> ${new Date(joiningDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
      </div>
      
      <div class="document-box">
        <p><strong>📄 Next Step: Upload Your Documents</strong></p>
        <p>To complete your onboarding process, please upload the required documents using the secure link below:</p>
        <div style="text-align: center;">
          <a href="${uploadUrl}" class="cta-button">Upload Your Documents</a>
        </div>
        <p style="margin-top: 15px;"><strong>Required Documents:</strong></p>
        <ul>
          <li>Educational/Qualification Certificates</li>
          <li>Aadhaar Card</li>
          <li>PAN Card</li>
          <li>Experience Letters (if applicable)</li>
          <li>Latest Resume</li>
          <li>Passport-size Photograph</li>
          <li>Address Proof</li>
          <li>Bank Account Details</li>
        </ul>
        <p><em>Please upload all documents within 7 days to ensure a smooth onboarding process.</em></p>
      </div>

      <p><strong>What's Next:</strong></p>
      <ol>
        <li>Review the offer letter (attached or sent separately)</li>
        <li>Upload all required documents using the link above</li>
        <li>Confirm your acceptance at your earliest convenience</li>
        <li>Contact us if you have any questions</li>
      </ol>
      
      <p>We are excited about the possibility of you joining our team!</p>
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
      <p style="margin-top: 10px; font-size: 12px;">This is an automated email. Please do not reply directly to this message.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: candidateEmail,
      subject: `🎊 Offer Letter & Document Upload - ${position} at ${companyName}`,
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending document request email:', error);
    throw new Error(`Failed to send document request email: ${error.message}`);
  }
};

/**
 * Send offboarding initiated email to employee
 */
const sendOffboardingInitiatedEmail = async ({
  employeeName,
  employeeEmail,
  lastWorkingDate,
  resignationType,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .info-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Offboarding Process Initiated</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${employeeName}</strong>,</p>
      <div class="info-box">
        <p><strong>📋 Offboarding Process Started</strong></p>
        <p>Your offboarding process has been initiated at ${companyName}.</p>
        <p><strong>Last Working Date:</strong> ${new Date(lastWorkingDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <p><strong>Resignation Type:</strong> ${resignationType}</p>
      </div>
      <p><strong>Next Steps:</strong></p>
      <ol>
        <li>You will receive notifications for each stage of the offboarding process</li>
        <li>Please complete the exit interview when scheduled</li>
        <li>Return all company assets and complete clearance formalities</li>
        <li>Ensure all pending work is handed over properly</li>
      </ol>
      <p>HR will guide you through each step of this process. Please reach out if you have any questions.</p>
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: employeeEmail,
      subject: `Offboarding Process Initiated - ${companyName}`,
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending offboarding initiated email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send exit interview scheduled email
 */
const sendExitInterviewScheduledEmail = async ({
  employeeName,
  employeeEmail,
  scheduledDate,
  interviewerName,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .interview-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📅 Exit Interview Scheduled</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${employeeName}</strong>,</p>
      <div class="interview-box">
        <p><strong>📋 Exit Interview Scheduled</strong></p>
        <p>Your exit interview has been scheduled as part of the offboarding process.</p>
        <p><strong>Date:</strong> ${new Date(scheduledDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        ${interviewerName ? `<p><strong>Interviewer:</strong> ${interviewerName}</p>` : ''}
      </div>
      <p><strong>About Exit Interview:</strong></p>
      <ul>
        <li>This is a confidential conversation about your experience at ${companyName}</li>
        <li>Your feedback helps us improve our workplace and processes</li>
        <li>Please be open and honest about your experience</li>
        <li>The interview typically takes 30-45 minutes</li>
      </ul>
      <p>Please ensure you attend this important meeting. If you need to reschedule, please contact HR at least 24 hours in advance.</p>
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: employeeEmail,
      subject: `Exit Interview Scheduled - ${companyName}`,
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending exit interview scheduled email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send asset return reminder email
 */
const sendAssetReturnReminderEmail = async ({
  employeeName,
  employeeEmail,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .asset-box { background: #f3e8ff; border-left: 4px solid #8b5cf6; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💻 Asset Return Reminder</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${employeeName}</strong>,</p>
      <div class="asset-box">
        <p><strong>📦 Asset Return Required</strong></p>
        <p>As part of your offboarding process, please return all company assets and property.</p>
      </div>
      <p><strong>Items to Return:</strong></p>
      <ul>
        <li>Laptop/Computer and accessories</li>
        <li>Mobile phone (if provided)</li>
        <li>Company ID card/access cards</li>
        <li>Keys (office, desk, etc.)</li>
        <li>Documents and files</li>
        <li>Any other company property</li>
      </ul>
      <p><strong>Return Process:</strong></p>
      <ol>
        <li>Contact IT department for equipment return</li>
        <li>Ensure all data is backed up from your devices</li>
        <li>Clear personal data from company devices</li>
        <li>Get acknowledgment receipt for returned items</li>
      </ol>
      <p>Please complete this process before your last working day to ensure smooth final settlement.</p>
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: employeeEmail,
      subject: `Asset Return Reminder - ${companyName}`,
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending asset return reminder email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send clearance process email
 */
const sendClearanceProcessEmail = async ({
  employeeName,
  employeeEmail,
  department,
  cleared,
  notes,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, ${cleared ? '#10b981' : '#f59e0b'} 0%, ${cleared ? '#059669' : '#d97706'} 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .clearance-box { background: ${cleared ? '#d1fae5' : '#fef3c7'}; border-left: 4px solid ${cleared ? '#10b981' : '#f59e0b'}; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${cleared ? '✅' : '⏳'} ${department} Clearance ${cleared ? 'Completed' : 'Pending'}</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${employeeName}</strong>,</p>
      <div class="clearance-box">
        <p><strong>${cleared ? '✅' : '⏳'} ${department} Department Status</strong></p>
        <p>Your clearance from the ${department} department is <strong>${cleared ? 'completed' : 'pending'}</strong>.</p>
        ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
      </div>
      ${cleared ? `
        <p><strong>Great! Your ${department} clearance is complete.</strong></p>
        <p>Please proceed with other department clearances if pending.</p>
      ` : `
        <p><strong>Action Required:</strong></p>
        <p>Please complete the clearance process with the ${department} department at the earliest.</p>
        <p>Contact the concerned department to understand any pending requirements.</p>
      `}
      <p><strong>Departments for Clearance:</strong></p>
      <ul>
        <li>HR Department</li>
        <li>Finance Department</li>
        <li>IT Department</li>
        <li>Admin Department</li>
      </ul>
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: employeeEmail,
      subject: `${department} Clearance ${cleared ? 'Completed' : 'Pending'} - ${companyName}`,
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending clearance process email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send final settlement email
 */
const sendFinalSettlementEmail = async ({
  employeeName,
  employeeEmail,
  amount,
  paymentStatus,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .settlement-box { background: #d1fae5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💰 Final Settlement Process</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${employeeName}</strong>,</p>
      <div class="settlement-box">
        <p><strong>💰 Final Settlement Details</strong></p>
        <p>Your final settlement has been processed as part of the offboarding completion.</p>
        ${amount ? `<p><strong>Settlement Amount:</strong> ₹${amount.toLocaleString('en-IN')}</p>` : ''}
        <p><strong>Payment Status:</strong> ${paymentStatus}</p>
      </div>
      <p><strong>Settlement Includes:</strong></p>
      <ul>
        <li>Final month's salary</li>
        <li>Leave encashment (if applicable)</li>
        <li>Other dues/benefits</li>
        <li>Deductions (if any)</li>
      </ul>
      <p><strong>Important Notes:</strong></p>
      <ul>
        <li>The amount will be credited to your registered bank account</li>
        <li>Please update your bank details if there have been any changes</li>
        <li>Contact finance department for any settlement-related queries</li>
      </ul>
      <p>Thank you for your contributions to ${companyName}. We wish you the very best in your future endeavors!</p>
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: employeeEmail,
      subject: `Final Settlement Processed - ${companyName}`,
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending final settlement email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send offboarding completed email
 */
const sendOffboardingCompletedEmail = async ({
  employeeName,
  employeeEmail,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .completion-box { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎓 Offboarding Completed</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${employeeName}</strong>,</p>
      <div class="completion-box">
        <p><strong>✅ Offboarding Process Completed</strong></p>
        <p>Your offboarding process has been successfully completed at ${companyName}.</p>
      </div>
      <p><strong>Process Summary:</strong></p>
      <ul>
        <li>✅ Exit discussion completed</li>
        <li>✅ Assets returned</li>
        <li>✅ Documentation completed</li>
        <li>✅ All department clearances obtained</li>
        <li>✅ Final settlement processed</li>
      </ul>
      <p><strong>Final Documents:</strong></p>
      <ul>
        <li>Experience certificate will be sent to your registered email</li>
        <li>Relieving letter will be provided</li>
        <li>Form 16 and other tax documents will be shared</li>
  </ul>
      <p>Thank you for being a valuable part of ${companyName}. Your contributions have been appreciated, and we wish you tremendous success in your future career!</p>
      <p>Please stay in touch. You're always welcome to visit or connect with us professionally.</p>
      <p style="margin-top: 30px;">Wishing you all the very best,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: employeeEmail,
      subject: `Offboarding Completed - Thank You from ${companyName}`,
      html: htmlContent,
      priority: 'high'
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending offboarding completed email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send documentation stage email
 */
const sendDocumentationStageEmail = async ({
  employeeName,
  employeeEmail,
  clearanceStatus,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    console.log('📧 sendDocumentationStageEmail: Sending email to', employeeEmail);
    console.log('📧 sendDocumentationStageEmail: Clearance status:', clearanceStatus);
    
    const transporter = createTransporter();
    if (!transporter) throw new Error('Email transporter not configured');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .doc-box { background: #ecfeff; border-left: 4px solid #06b6d4; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .clearance-item { margin: 10px 0; padding: 10px; background: #f8fafc; border-radius: 4px; }
    .clearance-completed { border-left: 4px solid #10b981; }
    .clearance-pending { border-left: 4px solid #f59e0b; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Documentation & Clearance Stage</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${employeeName}</strong>,</p>
      <div class="doc-box">
        <p><strong>📋 Documentation & Clearance Process</strong></p>
        <p>You have reached the documentation and clearance stage of your offboarding process. Please complete the following department clearances:</p>
      </div>
      
      <p><strong>Department Clearance Status:</strong></p>
      ${Object.entries(clearanceStatus || {}).map(([dept, status]) => `
        <div class="clearance-item ${status.cleared ? 'clearance-completed' : 'clearance-pending'}">
          <strong>${dept.charAt(0).toUpperCase() + dept.slice(1)} Department:</strong> 
          ${status.cleared ? '✅ Completed' : '⏳ Pending'}
          ${status.notes ? `<br><small>Notes: ${status.notes}</small>` : ''}
        </div>
      `).join('')}
      
      <p><strong>Required Actions:</strong></p>
      <ul>
        <li>Visit each department to complete clearance formalities</li>
        <li>Return all company assets and documents</li>
        <li>Settle any pending dues or advances</li>
        <li>Complete exit interview if not already done</li>
        <li>Update your contact information for future correspondence</li>
      </ul>
      
      <p><strong>Important Documents to Collect:</strong></p>
      <ul>
        <li>Experience Certificate</li>
        <li>Relieving Letter</li>
        <li>Form 16 (Tax Document)</li>
        <li>PF and ESIC statements (if applicable)</li>
      </ul>
      
      <p>Please coordinate with the HR department to ensure all clearances are completed smoothly. Each department will provide you with specific instructions for their clearance process.</p>
      
      <p style="margin-top: 30px;">Best regards,<br><strong>HR Team</strong><br>${companyName}</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

    await sendEmailWithRetry(transporter, {
      from: { name: `${companyName} - HRMS`, address: process.env.EMAIL_USER },
      to: employeeEmail,
      subject: `Documentation & Clearance Stage - ${companyName}`,
      html: htmlContent,
      priority: 'high'
    });

    console.log('✅ sendDocumentationStageEmail: Email sent successfully to', employeeEmail);
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending documentation stage email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send payslip verification request email to candidate
 * @param {Object} options - Email options
 * @param {string} options.candidateName - Candidate's full name
 * @param {string} options.candidateEmail - Candidate's email address
 * @param {string} options.position - Position/role
 * @param {string} options.uploadUrl - Secure upload link
 * @param {string} options.companyName - Company name
 * @param {Date} options.expiryDate - Upload link expiry date
 * @returns {Promise<Object>} Email send result
 */
const sendPayslipVerificationRequestEmail = async ({
  candidateName,
  candidateEmail,
  position,
  uploadUrl,
  companyName = 'SPC MANAGMENT',
  expiryDate
}) => {
  try {
    const subject = `Payslip Verification Required – ${position} Position`;
    
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Payslip Verification Required – ${position} Position</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', serif;
      background-color: #ffffff;
      color: #000000;
      padding: 40px 20px;
    }
    .wrapper {
      max-width: 620px;
      margin: 0 auto;
    }
    .header {
      padding: 28px 40px 10px 40px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header p {
      font-size: 12px;
      margin-top: 4px;
      letter-spacing: 0.5px;
      color: #444444;
    }
    .body {
      padding: 28px 40px;
    }
    .salutation {
      font-size: 15px;
      margin-bottom: 16px;
    }
    .para {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 16px;
    }
    .important-box {
      padding: 0;
      margin-bottom: 24px;
    }
    .important-box p {
      font-size: 14px;
      line-height: 1.7;
    }
    .section-title {
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .instructions-list {
      list-style: none;
      padding: 0;
      margin-bottom: 28px;
    }
    .instructions-list li {
      font-size: 14px;
      line-height: 1.7;
      padding: 5px 0;
      display: flex;
      gap: 10px;
    }
    .instructions-list li::before {
      content: "—";
      flex-shrink: 0;
    }
    .upload-btn {
      display: inline-block;
      margin: 4px 0 28px 0;
      padding: 11px 28px;
      font-size: 14px;
      font-family: 'Georgia', serif;
      font-weight: bold;
      text-decoration: none;
      color: #000000;
      border: 1.5px solid #000000;
      letter-spacing: 0.5px;
    }
    .closing {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 8px;
    }
    .closing2 {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 28px;
    }
    .signature {
      font-size: 14px;
      line-height: 1.8;
    }
    .signature strong {
      display: block;
      font-size: 15px;
    }
    .footer {
      padding: 16px 40px;
      font-size: 11px;
      color: #555555;
      letter-spacing: 0.4px;
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <!-- Header -->
    <div class="header">
      <h1>${companyName}</h1>
      <p>Human Resources Department</p>
    </div>

    <!-- Body -->
    <div class="body">

      <p class="salutation">Dear <strong>${candidateName}</strong>,</p>

      <p class="para">
        Congratulations on your progress for the <strong>${position}</strong> position at ${companyName}.
      </p>

      <p class="para">
        As part of our verification process, we need you to upload your recent payslip for verification.
        This is a mandatory step before we can proceed with your offer letter.
      </p>

      <!-- Important Notice -->
      <div class="important-box">
        <p>
          <strong>Important:</strong> Please upload your payslip within 7 days.
          The upload link will expire on ${expiryDate ? new Date(expiryDate).toLocaleDateString() : 'the given date'}.
        </p>
      </div>

      <!-- Instructions -->
      <p class="section-title">Instructions</p>
      <ul class="instructions-list">
        <li>Click the button below to upload your payslip.</li>
        <li>Ensure the payslip shows your name, company, and salary details.</li>
        <li>File should be in PDF, JPG, or PNG format.</li>
        <li>Maximum file size: 5MB.</li>
        <li>This link is secure and unique to you.</li>
      </ul>

      <!-- Upload Button -->
      

      <p class="closing">If you have any issues uploading the document, please contact our HR team.</p>
      <p class="closing2">We look forward to receiving your documents and moving forward with your onboarding process.</p>

      <!-- Signature -->
      <div class="signature">
        <p>Best regards,</p>
        <strong>HR Team</strong>
        <span>${companyName}</span>
      </div>

    </div>

    <!-- Footer -->
    <div class="footer">
      This is an automated message. Please do not reply to this email. &nbsp;|&nbsp; © ${new Date().getFullYear()} ${companyName}. All rights reserved.
    </div>

  </div>
</body>
</html>
    `;

    return await sendEmail({
      to: candidateEmail,
      subject,
      html: htmlContent
    });
  } catch (error) {
    console.error('Error sending payslip verification request email:', error);
    throw error;
  }
};

/**
 * Send payslip verification result email to candidate
 * @param {Object} options - Email options
 * @param {string} options.candidateName - Candidate's full name
 * @param {string} options.candidateEmail - Candidate's email address
 * @param {string} options.position - Position/role
 * @param {boolean} options.isApproved - Whether payslip was approved
 * @param {string} options.notes - Additional notes or rejection reason
 * @param {string} options.companyName - Company name
 * @returns {Promise<Object>} Email send result
 */
const sendPayslipVerificationResultEmail = async ({
  candidateName,
  candidateEmail,
  position,
  isApproved,
  notes,
  companyName = 'SPC MANAGMENT'
}) => {
  try {
    const subject = isApproved 
      ? `Payslip Verification Approved – ${companyName}`
      : `Payslip Verification Requires Attention – ${companyName}`;
    
    let htmlContent;
    
    if (isApproved) {
      // Approved template - Georgia style
      htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Payslip Verification Approved – ${companyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', serif;
      background-color: #ffffff;
      color: #000000;
      padding: 40px 20px;
    }
    .wrapper {
      max-width: 620px;
      margin: 0 auto;
    }
    .header {
      padding: 28px 40px 10px 40px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header p {
      font-size: 12px;
      margin-top: 4px;
      letter-spacing: 0.5px;
      color: #444444;
    }
    .body {
      padding: 28px 40px;
    }
    .salutation {
      font-size: 15px;
      margin-bottom: 20px;
    }
    .good-news {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 20px;
    }
    .para {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 14px;
    }
    .signature {
      margin-top: 28px;
      font-size: 14px;
      line-height: 1.8;
    }
    .signature strong {
      display: block;
      font-size: 15px;
    }
    .footer {
      padding: 16px 40px;
      font-size: 11px;
      color: #555555;
      letter-spacing: 0.4px;
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <!-- Header -->
    <div class="header">
      <h1>${companyName}</h1>
      <p>Human Resources Department</p>
    </div>

    <!-- Body -->
    <div class="body">

      <p class="salutation">Dear <strong>${candidateName}</strong>,</p>

      <p class="good-news">Good News! Your payslip has been successfully verified and approved.</p>

      <p class="para">
        Your verification for the <strong>${position}</strong> position at ${companyName}
        is complete. We will now proceed with the next steps in your onboarding process.
      </p>

      <p class="para">
        You will receive further communication regarding your offer letter shortly.
      </p>

      <p class="para">
        If you have any questions or need assistance, please do not hesitate to contact our HR team.
      </p>

      <!-- Signature -->
      <div class="signature">
        <p>Best regards,</p>
        <strong>HR Team</strong>
        <span>${companyName}</span>
      </div>

    </div>

    <!-- Footer -->
    <div class="footer">
      This is an automated message. Please do not reply to this email. &nbsp;|&nbsp; © ${new Date().getFullYear()} ${companyName}. All rights reserved.
    </div>

  </div>
</body>
</html>
      `;
    } else {
      // Rejected template - Georgia style
      htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Payslip Verification Requires Attention – ${companyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', serif;
      background-color: #ffffff;
      color: #000000;
      padding: 40px 20px;
    }
    .wrapper {
      max-width: 620px;
      margin: 0 auto;
    }
    .header {
      padding: 28px 40px 10px 40px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header p {
      font-size: 12px;
      margin-top: 4px;
      letter-spacing: 0.5px;
      color: #444444;
    }
    .body {
      padding: 28px 40px;
    }
    .salutation {
      font-size: 15px;
      margin-bottom: 20px;
    }
    .attention {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 20px;
    }
    .para {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 14px;
    }
    .reason-box {
      background-color: #f5f5f5;
      padding: 16px;
      margin: 20px 0;
      border-left: 3px solid #000000;
    }
    .reason-box p {
      font-size: 14px;
      line-height: 1.7;
      font-style: italic;
    }
    .signature {
      margin-top: 28px;
      font-size: 14px;
      line-height: 1.8;
    }
    .signature strong {
      display: block;
      font-size: 15px;
    }
    .footer {
      padding: 16px 40px;
      font-size: 11px;
      color: #555555;
      letter-spacing: 0.4px;
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <!-- Header -->
    <div class="header">
      <h1>${companyName}</h1>
      <p>Human Resources Department</p>
    </div>

    <!-- Body -->
    <div class="body">

      <p class="salutation">Dear <strong>${candidateName}</strong>,</p>

      <p class="attention">Action Required: There is an issue with your payslip submission.</p>

      <p class="para">
        Our team has reviewed your payslip submission for the <strong>${position}</strong> position at ${companyName} and found the following issue:
      </p>

      <div class="reason-box">
        <p>${notes || 'No specific reason provided.'}</p>
      </div>

      <p class="para">
        Please rectify the issue and re-submit your payslip. Our HR team will contact you shortly with further instructions.
      </p>

      <p class="para">
        If you have any questions or need assistance, please do not hesitate to contact our HR team.
      </p>

      <!-- Signature -->
      <div class="signature">
        <p>Best regards,</p>
        <strong>HR Team</strong>
        <span>${companyName}</span>
      </div>

    </div>

    <!-- Footer -->
    <div class="footer">
      This is an automated message. Please do not reply to this email. &nbsp;|&nbsp; © ${new Date().getFullYear()} ${companyName}. All rights reserved.
    </div>

  </div>
</body>
</html>
      `;
    }

    return await sendEmail({
      to: candidateEmail,
      subject,
      html: htmlContent
    });
  } catch (error) {
    console.error('Error sending payslip verification result email:', error);
    throw error;
  }
};

/**
 * Send agreement letter with template
 * @param {Object} options - Email options
 * @param {string} options.templateId - Template ID
 * @param {string} options.employeeName - Employee name
 * @param {string} options.employeeEmail - Employee email
 * @param {string} options.designation - Employee designation
 * @param {Object} options.agreementData - Agreement data for template
 * @param {string} options.companyName - Company name
 */
const sendAgreementLetterWithTemplate = async (options) => {
  const {
    templateId,
    employeeName,
    employeeEmail,
    designation,
    agreementData,
    companyName,
    tenantConnection
  } = options;

  try {
    // Get agreement template and tenant connection
    const { getTenantModel } = require('../utils/tenantModels');
    const AgreementTemplate = getTenantModel(tenantConnection || global.connection, 'AgreementTemplate');
    
    const template = await AgreementTemplate.findById(templateId);
    if (!template) {
      throw new Error('Agreement template not found');
    }

    // Process template variables
    let processedContent = template.content;
    let processedSubject = template.subject;
    
    // Replace template variables with actual data
    const variables = {
      employeeName,
      employeeEmail,
      designation,
      companyName,
      ...agreementData
    };

    // Replace all {{variable}} placeholders
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      const value = variables[key] || '';
      processedContent = processedContent.replace(regex, value);
      processedSubject = processedSubject.replace(regex, value);
    });

    // Generate PDF from processed HTML content
    const { generatePDFFromHTML } = require('../utils/pdfGenerator');
    const pdfBuffer = await generatePDFFromHTML(processedContent, {
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });

    // Create email with PDF attachment
    const subject = processedSubject || `Employment Agreement - ${companyName}`;
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Employment Agreement – ${designation} – ${companyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Georgia', serif;
      background-color: #ffffff;
      color: #000000;
      padding: 40px 20px;
    }
    .wrapper {
      max-width: 620px;
      margin: 0 auto;
    }
    .header {
      padding: 28px 40px 10px 40px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .header p {
      font-size: 12px;
      margin-top: 4px;
      letter-spacing: 0.5px;
      color: #444444;
    }
    .body {
      padding: 28px 40px;
    }
    .salutation {
      font-size: 15px;
      margin-bottom: 16px;
    }
    .para {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 24px;
    }
    .section-title {
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 28px;
      font-size: 14px;
    }
    .details-table tr td {
      padding: 9px 0;
    }
    .details-table tr td:first-child {
      color: #555555;
      width: 160px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .details-table tr td:last-child {
      font-weight: bold;
    }
    .details-table tr {
      border-bottom: 1px solid #e0e0e0;
    }
    .details-table tr:last-child {
      border-bottom: none;
    }
    .important-title {
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    .important-para {
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 8px;
    }
    .action-required {
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 28px;
    }
    .steps-list {
      list-style: none;
      padding: 0;
      margin-bottom: 24px;
      counter-reset: steps;
    }
    .steps-list li {
      font-size: 14px;
      line-height: 1.7;
      padding: 5px 0;
      display: flex;
      gap: 12px;
      counter-increment: steps;
    }
    .steps-list li::before {
      content: counter(steps) ".";
      font-weight: bold;
      flex-shrink: 0;
      min-width: 16px;
    }
    .help-title {
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    .help-para {
      font-size: 14px;
      line-height: 1.8;
      margin-bottom: 28px;
    }
    .signature {
      font-size: 14px;
      line-height: 1.8;
    }
    .signature strong {
      display: block;
      font-size: 15px;
    }
    .footer {
      padding: 16px 40px;
      font-size: 11px;
      color: #555555;
      letter-spacing: 0.4px;
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <!-- Header -->
    <div class="header">
      <h1>${companyName}</h1>
      <p>Human Resources Department &nbsp;|&nbsp; Employment Agreement</p>
    </div>

    <!-- Body -->
    <div class="body">

      <p class="salutation">Dear <strong>${employeeName}</strong>,</p>

      <p class="para">
        Congratulations! We are pleased to send you your employment agreement
        for the position of <strong>${designation}</strong> at <strong>${companyName}</strong>.
      </p>

      <!-- Agreement Details -->
      <p class="section-title">Your Agreement Details</p>
      <table class="details-table">
        <tr>
          <td>Position</td>
          <td>${designation}</td>
        </tr>
        <tr>
          <td>Company</td>
          <td>${companyName}</td>
        </tr>
        <tr>
          <td>Effective Date</td>
          <td>${agreementData.effectiveDate || 'As per agreement'}</td>
        </tr>
        <tr>
          <td>Agreement Type</td>
          <td>${template.category || 'Employment Agreement'}</td>
        </tr>
      </table>

      <!-- Important Notice -->
      <p class="important-title">Important: Your Agreement is Attached</p>
      <p class="important-para">
        Please find your complete employment agreement attached as a PDF file.
        This document contains all the terms and conditions of your employment.
      </p>
      <p class="action-required">
        <strong>Action Required:</strong> Please review the agreement carefully and keep it for your records.
      </p>

      <!-- Next Steps -->
      <p class="section-title">Next Steps</p>
      <ol class="steps-list">
        <li>Download and review the attached agreement PDF.</li>
        <li>Sign the agreement if required by your HR team.</li>
        <li>Keep a copy for your personal records.</li>
        <li>Contact HR if you have any questions.</li>
      </ol>

      <!-- Need Help -->
      <p class="help-title">Need Help?</p>
      <p class="help-para">
        If you have any questions about your agreement or need any clarifications,
        please do not hesitate to contact our HR team.
      </p>

      <!-- Signature -->
      <div class="signature">
        <p>Best regards,</p>
        <strong>HR Team</strong>
        <span>${companyName}</span>
      </div>

    </div>

    <!-- Footer -->
    <div class="footer">
      This is an automated email. Please do not reply to this message. &nbsp;|&nbsp; © ${new Date().getFullYear()} ${companyName}. All rights reserved.
    </div>

  </div>
</body>
</html>
    `;

    // Create email attachments array with the PDF
    const attachments = [
      {
        filename: `Employment_Agreement_${employeeName.replace(/\s+/g, '_')}_${companyName.replace(/\s+/g, '_')}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ];
    
    console.log('🔍 Email Attachment - PDF buffer size:', pdfBuffer.length, 'bytes');
    console.log('🔍 Email Attachment - PDF buffer type:', typeof pdfBuffer);
    console.log('🔍 Email Attachment - Attachment created:', attachments[0].filename);

    // Send email with PDF attachment
    await sendEmail({
      to: employeeEmail,
      subject: subject,
      html: html,
      attachments: attachments
    });

    console.log(`📧 Agreement email with PDF sent to ${employeeEmail}`);
    
  } catch (error) {
    console.error('Error sending agreement email with PDF:', error);
    throw error;
  }
};

module.exports = {
  sendEmail, // Generic email function
  sendOnboardingEmail,
  sendHRNotification,
  sendInterviewNotification,
  sendInterviewScheduledEmail,
  sendInterviewReminderEmail,
  sendInterviewCancelledEmail,
  sendShortlistedEmail,
  sendInterviewCompletedEmail,
  sendOfferExtendedEmail,
  sendOfferLetterWithTemplate,
  sendOfferLetterWithDocumentLink,
  sendDocumentRequestEmail,
  sendJoiningDateConfirmationEmail,
  sendITNotification,
  sendFacilitiesNotification,
  sendRejectionEmail,
  sendApplicationReceivedEmail,
  verifyEmailConfig,
  sendDocumentRejectionEmail,
  sendCompanyAdminCredentials,
  // Payslip verification email functions
  sendPayslipVerificationRequestEmail,
  sendPayslipVerificationResultEmail,
  // Agreement email functions
  sendAgreementLetterWithTemplate,
  // Offboarding email functions
  sendOffboardingInitiatedEmail,
  sendExitInterviewScheduledEmail,
  sendAssetReturnReminderEmail,
  sendClearanceProcessEmail,
  sendFinalSettlementEmail,
  sendOffboardingCompletedEmail,
  sendDocumentationStageEmail,
  // Payslip verification email functions
  sendPayslipVerificationRequestEmail,
  sendPayslipVerificationResultEmail
};
