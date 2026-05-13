# Email Configuration Guide - HRMS Backend

## Overview

The HRMS system uses email notifications for various features including:
- Employee onboarding credentials
- Interview scheduling notifications
- Application status updates
- Offer letters and rejection notifications

## Common Issues

### 1. Connection Timeout Error (Production)

**Error Message:**
```
Error: Connection timeout
code: 'ETIMEDOUT'
command: 'CONN'
```

**Cause:** Many cloud hosting providers (Render, Heroku, etc.) block Gmail SMTP ports (465, 587) for security reasons.

**Solution:** Use a dedicated SMTP service instead of Gmail.

---

## Configuration Options

### Option 1: Gmail SMTP (Development Only)

**Recommended for:** Local development and testing

**Setup:**
1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Add to `.env`:

```env
EMAIL_USER=your_email@gmail.com
EMAIL_APP_PASSWORD=your_16_character_app_password
```

**Limitations:**
- May be blocked by cloud hosting providers
- Daily sending limits (500 emails/day for free Gmail)
- Not recommended for production

---

### Option 2: Brevo (Sendinblue) - RECOMMENDED FOR PRODUCTION

**Recommended for:** Production deployments (FREE tier available)

**Why Brevo:**
- ✅ Free tier: 300 emails/day
- ✅ Works on all cloud platforms (Render, Vercel, AWS, etc.)
- ✅ Reliable delivery rates
- ✅ Easy setup

**Setup Steps:**

1. **Create Brevo Account:**
   - Visit: https://www.brevo.com/
   - Sign up for free account
   - Verify your email

2. **Get SMTP Credentials:**
   - Go to: Settings → SMTP & API
   - Click "Generate a new SMTP key"
   - Copy the SMTP key

3. **Configure Environment Variables:**

Add to your `.env` file (or Render environment variables):

```env
# Remove or comment out Gmail config
# EMAIL_USER=...
# EMAIL_APP_PASSWORD=...

# Add Brevo SMTP config
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_brevo_email@example.com
SMTP_PASS=your_smtp_key_here
```

4. **Set Sender Email:**
   - The `SMTP_USER` should be the email you registered with Brevo
   - Update `EMAIL_USER` to match (for the "from" address):

```env
EMAIL_USER=your_brevo_email@example.com
```

---

### Option 3: SendGrid

**Recommended for:** High-volume production (100 emails/day free)

**Setup:**

1. Create account: https://sendgrid.com/
2. Generate API key: Settings → API Keys
3. Configure:

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
EMAIL_USER=verified_sender@yourdomain.com
```

---

### Option 4: AWS SES

**Recommended for:** AWS-hosted applications

**Setup:**

1. Verify domain/email in AWS SES
2. Create SMTP credentials
3. Configure:

```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_aws_smtp_username
SMTP_PASS=your_aws_smtp_password
EMAIL_USER=verified@yourdomain.com
```

---

## Render Deployment Configuration

### Setting Environment Variables on Render

1. Go to your Render dashboard
2. Select your backend service
3. Navigate to "Environment" tab
4. Add the following variables:

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_brevo_email@example.com
SMTP_PASS=your_brevo_smtp_key
EMAIL_USER=your_brevo_email@example.com
```

5. Click "Save Changes"
6. Render will automatically redeploy

---

## Testing Email Configuration

### 1. Test SMTP Connection

Add this test endpoint to your backend (temporary):

```javascript
// Add to routes
app.get('/api/test-email', async (req, res) => {
  const { verifyEmailConfig } = require('./services/emailService');
  const isConfigured = await verifyEmailConfig();
  res.json({ 
    configured: isConfigured,
    message: isConfigured ? 'Email is configured correctly' : 'Email configuration failed'
  });
});
```

### 2. Send Test Email

```javascript
app.post('/api/test-email-send', async (req, res) => {
  const { sendInterviewNotification } = require('./services/emailService');
  
  try {
    await sendInterviewNotification({
      candidateName: 'Test User',
      candidateEmail: 'your_test_email@example.com',
      interviewType: 'Technical',
      interviewDate: new Date(),
      interviewTime: '10:00 AM',
      meetingLink: 'https://meet.google.com/test',
      meetingPlatform: 'Google Meet',
      position: 'Test Position',
      companyName: 'Test Company'
    });
    
    res.json({ success: true, message: 'Test email sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## Troubleshooting

### Issue: "Email transporter not configured"

**Solution:** Ensure you have either:
- `EMAIL_USER` and `EMAIL_APP_PASSWORD` set, OR
- `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` set

### Issue: "Authentication failed"

**Solution:**
- For Gmail: Regenerate App Password
- For Brevo/SendGrid: Verify API key is correct
- Check that `SMTP_USER` matches your account email

### Issue: "Connection timeout" (ETIMEDOUT)

**Solution:**
- Switch from Gmail to Brevo/SendGrid
- Verify `SMTP_PORT` is correct (usually 587)
- Check firewall/network settings

### Issue: Emails going to spam

**Solution:**
- Verify sender domain in SMTP service
- Add SPF/DKIM records to your domain
- Use a professional "from" address
- Avoid spam trigger words in subject/body

---

## Email Service Features

### Built-in Features:
- ✅ **Automatic retry logic** (3 attempts with exponential backoff)
- ✅ **Connection pooling** (reuses connections for better performance)
- ✅ **Timeout configuration** (60s connection, 60s socket timeout)
- ✅ **Fallback support** (tries Gmail first, then custom SMTP)
- ✅ **Detailed logging** (tracks all email attempts and failures)

### Retry Behavior:
- Attempt 1: Immediate
- Attempt 2: Wait 1 second
- Attempt 3: Wait 2 seconds
- Maximum wait: 10 seconds

### Timeout Settings:
- Connection timeout: 60 seconds
- Greeting timeout: 30 seconds
- Socket timeout: 60 seconds

---

## Production Checklist

Before deploying to production:

- [ ] Choose SMTP provider (Brevo recommended)
- [ ] Create account and verify email
- [ ] Generate SMTP credentials
- [ ] Add environment variables to hosting platform
- [ ] Test email sending with test endpoint
- [ ] Remove test endpoints before production
- [ ] Monitor email logs for failures
- [ ] Set up email delivery monitoring

---

## Support

If you continue to experience issues:

1. Check application logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test SMTP credentials using a tool like: https://www.smtper.net/
4. Contact your SMTP provider's support

---

## Quick Start (Brevo - Recommended)

```bash
# 1. Sign up at https://www.brevo.com/
# 2. Get SMTP key from Settings → SMTP & API
# 3. Add to .env or Render environment:

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@example.com
SMTP_PASS=your_smtp_key
EMAIL_USER=your_email@example.com

# 4. Restart your application
# 5. Test email functionality
```

That's it! Your email service should now work reliably in production.
