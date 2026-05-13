# Email Troubleshooting Guide

## Quick Diagnostics

### 1. Check Current Configuration

**In Render Dashboard:**
- Go to your service → Environment tab
- Verify these variables exist:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `EMAIL_USER`

**In Application Logs:**
Look for startup message:
```
📧 Using Gmail SMTP configuration
OR
📧 Using custom SMTP configuration
```

---

## Common Errors & Solutions

### Error 1: "Connection timeout" (ETIMEDOUT)

**Symptom:**
```
❌ Error sending interview notification: Error: Connection timeout
code: 'ETIMEDOUT'
command: 'CONN'
```

**Cause:** Gmail SMTP is blocked by hosting provider

**Solution:**
1. Switch to Brevo SMTP (see `EMAIL_TIMEOUT_FIX.md`)
2. Update Render environment variables
3. Redeploy

**Verification:**
```bash
# Check logs for:
📧 Using custom SMTP configuration
```

---

### Error 2: "Authentication failed" (EAUTH)

**Symptom:**
```
❌ Error sending email: Invalid login: 535 Authentication failed
code: 'EAUTH'
responseCode: 535
```

**Cause:** Wrong SMTP credentials

**Solution:**

**For Brevo:**
1. Go to Brevo → Settings → SMTP & API
2. Regenerate SMTP key
3. Update `SMTP_PASS` in Render
4. Ensure `SMTP_USER` matches your Brevo email

**For Gmail:**
1. Regenerate App Password: https://myaccount.google.com/apppasswords
2. Update `EMAIL_APP_PASSWORD`
3. Ensure 2FA is enabled on Gmail account

**Verification:**
```bash
# Test credentials at: https://www.smtper.net/
```

---

### Error 3: "Email transporter not configured"

**Symptom:**
```
❌ Error: Email transporter not configured
```

**Cause:** Missing environment variables

**Solution:**
1. Check Render environment variables
2. Ensure either:
   - `EMAIL_USER` + `EMAIL_APP_PASSWORD` (Gmail), OR
   - `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` (Custom SMTP)
3. Save changes and redeploy

**Verification:**
```bash
# Check Render logs for:
❌ Email configuration missing. Please set EMAIL_USER and EMAIL_APP_PASSWORD or SMTP credentials
```

---

### Error 4: "ECONNREFUSED"

**Symptom:**
```
❌ Error: connect ECONNREFUSED
code: 'ECONNREFUSED'
```

**Cause:** Wrong SMTP host or port

**Solution:**
1. Verify `SMTP_HOST` is correct
2. Verify `SMTP_PORT` is correct (usually 587)
3. Check `SMTP_SECURE`:
   - `false` for port 587 (TLS)
   - `true` for port 465 (SSL)

**Common SMTP Settings:**

| Provider | Host | Port | Secure |
|----------|------|------|--------|
| Brevo | smtp-relay.brevo.com | 587 | false |
| SendGrid | smtp.sendgrid.net | 587 | false |
| Mailgun | smtp.mailgun.org | 587 | false |
| AWS SES | email-smtp.us-east-1.amazonaws.com | 587 | false |

---

### Error 5: Emails going to spam

**Symptom:** Emails sent but land in spam folder

**Cause:** Poor sender reputation or missing authentication

**Solution:**
1. **Verify sender email** in SMTP provider
2. **Add SPF record** to your domain:
   ```
   v=spf1 include:_spf.brevo.com ~all
   ```
3. **Add DKIM record** (provided by SMTP service)
4. **Use professional from address**:
   - ✅ `hr@yourcompany.com`
   - ❌ `noreply@gmail.com`
5. **Avoid spam trigger words** in subject/body

---

### Error 6: Slow email sending

**Symptom:** Emails take 30+ seconds to send

**Cause:** No connection pooling or high timeout

**Solution:**
Already implemented! The fix includes:
- ✅ Connection pooling (5 connections)
- ✅ Optimized timeouts (60s)
- ✅ Connection reuse (100 messages per connection)

**Verification:**
```bash
# Check logs for fast sending:
📤 Sending email (attempt 1/3) to user@example.com
✅ Email sent successfully: <messageId>
# Should complete in 1-3 seconds
```

---

### Error 7: "Network is unreachable"

**Symptom:**
```
❌ Error: Network is unreachable
code: 'ENETUNREACH'
```

**Cause:** Firewall blocking outbound SMTP

**Solution:**
1. This is rare on Render
2. Try different SMTP provider
3. Contact Render support
4. Use alternative port (465 instead of 587)

---

## Testing Checklist

### Local Testing

```bash
# 1. Set environment variables in .env
EMAIL_USER=your@gmail.com
EMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx

# 2. Start server
npm run dev

# 3. Test email endpoint
curl -X POST http://localhost:5000/api/candidates/:id/schedule-interview \
  -H "Content-Type: application/json" \
  -d '{
    "interviewType": "Technical",
    "scheduledDate": "2025-02-01",
    "scheduledTime": "10:00 AM",
    "meetingLink": "https://meet.google.com/test"
  }'

# 4. Check console for:
📧 Using Gmail SMTP configuration
📤 Sending email (attempt 1/3) to candidate@example.com
✅ Email sent successfully: <messageId>
```

### Production Testing (Render)

```bash
# 1. Check environment variables in Render dashboard
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@email.com
SMTP_PASS=your_smtp_key
EMAIL_USER=your@email.com

# 2. Check Render logs for:
📧 Using custom SMTP configuration

# 3. Test via frontend:
- Create candidate
- Schedule interview
- Check Render logs for email confirmation

# 4. Verify email received in inbox
```

---

## Debug Mode

### Enable Detailed Logging

Add to `emailService.js` temporarily:

```javascript
const createTransporter = () => {
  const transporter = nodemailer.createTransporter({
    // ... existing config
    logger: true,  // Enable logging
    debug: true    // Enable debug output
  });
  return transporter;
};
```

This will show detailed SMTP conversation in logs.

---

## SMTP Provider Comparison

| Provider | Free Tier | Setup Time | Reliability | Render Compatible |
|----------|-----------|------------|-------------|-------------------|
| **Brevo** | 300/day | 5 min | ⭐⭐⭐⭐⭐ | ✅ Yes |
| **SendGrid** | 100/day | 10 min | ⭐⭐⭐⭐⭐ | ✅ Yes |
| **Mailgun** | 100/day | 10 min | ⭐⭐⭐⭐ | ✅ Yes |
| **AWS SES** | 62,000/month | 20 min | ⭐⭐⭐⭐⭐ | ✅ Yes |
| **Gmail** | 500/day | 2 min | ⭐⭐⭐ | ❌ No (blocked) |

**Recommendation:** Brevo for easiest setup and good free tier.

---

## Emergency Fallback

If email is completely broken:

### Option 1: Disable Email Temporarily

In `candidateController.js`:

```javascript
// Wrap email calls in try-catch (already done)
try {
  await sendInterviewNotification({...});
} catch (emailError) {
  console.error('Email failed, but continuing:', emailError);
  // Don't fail the request
}
```

### Option 2: Use Alternative Notification

- SMS via Twilio
- In-app notifications
- Slack/Discord webhooks
- Manual email from HR

---

## Health Check Endpoint

Add this to test email configuration:

```javascript
// In routes/index.js or app.js
app.get('/api/email-health', async (req, res) => {
  const { verifyEmailConfig } = require('./services/emailService');
  
  try {
    const isConfigured = await verifyEmailConfig();
    
    res.json({
      status: isConfigured ? 'healthy' : 'unhealthy',
      configured: isConfigured,
      timestamp: new Date().toISOString(),
      config: {
        hasGmail: !!(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD),
        hasSMTP: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});
```

Test: `GET https://your-app.onrender.com/api/email-health`

---

## Support Contacts

### Brevo Support
- Email: support@brevo.com
- Docs: https://developers.brevo.com/docs
- Status: https://status.brevo.com/

### SendGrid Support
- Email: support@sendgrid.com
- Docs: https://docs.sendgrid.com/
- Status: https://status.sendgrid.com/

### Render Support
- Email: support@render.com
- Docs: https://render.com/docs
- Status: https://status.render.com/

---

## Final Checklist

Before contacting support:

- [ ] Verified environment variables are set correctly
- [ ] Checked application logs for specific error messages
- [ ] Tested SMTP credentials at https://www.smtper.net/
- [ ] Tried alternative SMTP provider
- [ ] Checked SMTP provider status page
- [ ] Verified sender email is verified in SMTP service
- [ ] Tested with different recipient email
- [ ] Checked spam folder
- [ ] Reviewed firewall/network settings
- [ ] Enabled debug logging

---

## Quick Fixes Summary

| Issue | Quick Fix |
|-------|-----------|
| Connection timeout | Switch to Brevo SMTP |
| Auth failed | Regenerate SMTP key |
| Not configured | Add environment variables |
| Connection refused | Check host/port |
| Goes to spam | Verify sender email |
| Slow sending | Already fixed with pooling |
| Network unreachable | Try different provider |

---

**Need more help?** See `EMAIL_CONFIGURATION_GUIDE.md` for detailed setup instructions.
