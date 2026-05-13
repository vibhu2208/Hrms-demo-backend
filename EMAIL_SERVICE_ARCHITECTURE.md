# Email Service Architecture

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Email Send Request                            │
│              (Interview Notification, etc.)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  createTransporter()                             │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Check EMAIL_USER & EMAIL_APP_PASSWORD?                   │  │
│  │ ├─ YES → Gmail SMTP Configuration                        │  │
│  │ │         • Pool: 5 connections                          │  │
│  │ │         • Timeout: 60s                                 │  │
│  │ │         • TLS: Secure                                  │  │
│  │ │                                                         │  │
│  │ └─ NO → Check SMTP_HOST, SMTP_USER, SMTP_PASS?          │  │
│  │         ├─ YES → Custom SMTP Configuration               │  │
│  │         │         • Brevo / SendGrid / AWS SES           │  │
│  │         │         • Pool: 5 connections                  │  │
│  │         │         • Timeout: 60s                         │  │
│  │         │                                                 │  │
│  │         └─ NO → Return null (Email disabled)            │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              sendEmailWithRetry(transporter, mailOptions)        │
│                                                                  │
│  Attempt 1:                                                     │
│  ├─ Try sending email                                           │
│  ├─ SUCCESS? → Return result ✅                                 │
│  └─ FAIL? → Check error type                                    │
│      ├─ Auth Error (EAUTH/535)? → Throw immediately ❌          │
│      └─ Timeout/Network? → Wait 1s, retry                       │
│                                                                  │
│  Attempt 2:                                                     │
│  ├─ Try sending email again                                     │
│  ├─ SUCCESS? → Return result ✅                                 │
│  └─ FAIL? → Wait 2s, retry                                      │
│                                                                  │
│  Attempt 3 (Final):                                             │
│  ├─ Try sending email one last time                             │
│  ├─ SUCCESS? → Return result ✅                                 │
│  └─ FAIL? → Throw error ❌                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Result                                    │
│                                                                  │
│  ✅ Success:                                                     │
│     • Email sent successfully                                   │
│     • Log: "✅ Email sent successfully: <messageId>"            │
│     • Return: { success: true, messageId, recipient }           │
│                                                                  │
│  ❌ Failure:                                                     │
│     • All retries exhausted                                     │
│     • Log: "❌ Error sending email: <error>"                    │
│     • Throw: Error with detailed message                        │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration Priority

```
1. Gmail SMTP (Development)
   ├─ EMAIL_USER=your@gmail.com
   └─ EMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   
   ⚠️ Blocked by: Render, Heroku, Railway, Fly.io
   ✅ Works on: Local, some VPS

2. Custom SMTP (Production) ⭐ RECOMMENDED
   ├─ SMTP_HOST=smtp-relay.brevo.com
   ├─ SMTP_PORT=587
   ├─ SMTP_SECURE=false
   ├─ SMTP_USER=your@email.com
   └─ SMTP_PASS=your_api_key
   
   ✅ Works everywhere
   ✅ Better deliverability
   ✅ Higher sending limits
```

## Retry Strategy

```
Attempt 1: Immediate
    ↓ (fail)
Wait 1 second
    ↓
Attempt 2: After 1s
    ↓ (fail)
Wait 2 seconds
    ↓
Attempt 3: After 2s (total 3s elapsed)
    ↓ (fail)
Throw Error
```

**Exponential Backoff Formula:**
```javascript
delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
// Attempt 1: 1000ms (1s)
// Attempt 2: 2000ms (2s)
// Attempt 3: 4000ms (4s) - capped at 10s max
```

## Connection Pooling

```
┌─────────────────────────────────────┐
│      SMTP Server (Brevo/Gmail)      │
└─────────────────────────────────────┘
         ▲  ▲  ▲  ▲  ▲
         │  │  │  │  │
    ┌────┴──┴──┴──┴──┴────┐
    │  Connection Pool     │
    │  (5 connections)     │
    │  Reused for 100 msgs │
    └──────────────────────┘
         ▲  ▲  ▲  ▲  ▲
         │  │  │  │  │
    Email Email Email Email Email
    Req 1 Req 2 Req 3 Req 4 Req 5
```

**Benefits:**
- Faster sending (no reconnection overhead)
- Lower server load
- Better resource utilization

## Timeout Configuration

```
Connection Timeout: 60s
├─ Time to establish TCP connection
└─ Prevents hanging on network issues

Greeting Timeout: 30s
├─ Time to receive SMTP greeting
└─ Prevents hanging on slow servers

Socket Timeout: 60s
├─ Time for any socket operation
└─ Prevents hanging on data transfer
```

## Error Handling

```
┌─────────────────────────────────────┐
│         Error Occurs                │
└────────────┬────────────────────────┘
             │
             ▼
    ┌────────────────────┐
    │ Check Error Code   │
    └────────┬───────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
EAUTH/535      ETIMEDOUT/ECONNREFUSED
(Auth Error)   (Network Error)
    │                 │
    ▼                 ▼
Throw          Retry with
Immediately    Backoff
    │                 │
    ▼                 ▼
❌ Fail        ✅ May Succeed
(Fix creds)    (Transient issue)
```

## Production vs Development

### Development (Local)
```javascript
// .env
EMAIL_USER=dev@gmail.com
EMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx

// Works fine locally
✅ Gmail SMTP allowed
✅ Fast connection
✅ Easy setup
```

### Production (Render/Cloud)
```javascript
// Render Environment Variables
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=prod@company.com
SMTP_PASS=brevo_api_key
EMAIL_USER=prod@company.com

// Required for cloud platforms
✅ Gmail SMTP blocked → Use Brevo
✅ Reliable delivery
✅ Better monitoring
```

## Email Functions Using Retry Logic

All these functions now have automatic retry:

1. ✅ `sendOnboardingEmail()` - Employee credentials
2. ✅ `sendHRNotification()` - HR notifications
3. ✅ `sendInterviewNotification()` - Interview scheduling ⭐ (Main fix)
4. ✅ `sendApplicationReceivedEmail()` - Application confirmation
5. ✅ `sendShortlistedEmail()` - Shortlist notification
6. ✅ `sendInterviewCompletedEmail()` - Interview completion
7. ✅ `sendOfferExtendedEmail()` - Offer letter
8. ✅ `sendRejectionEmail()` - Rejection notification

## Monitoring & Logging

```
📤 Sending email (attempt 1/3) to candidate@example.com
✅ Email sent successfully: <abc123@smtp.brevo.com>

OR

📤 Sending email (attempt 1/3) to candidate@example.com
❌ Email send attempt 1 failed: Connection timeout
⏳ Waiting 1000ms before retry...
📤 Sending email (attempt 2/3) to candidate@example.com
✅ Email sent successfully: <xyz789@smtp.brevo.com>
```

## Quick Reference

| Scenario | Configuration | Result |
|----------|--------------|---------|
| Local Dev | Gmail SMTP | ✅ Works |
| Render Free | Gmail SMTP | ❌ Timeout |
| Render Free | Brevo SMTP | ✅ Works |
| Vercel | Gmail SMTP | ❌ Blocked |
| Vercel | Brevo SMTP | ✅ Works |
| AWS EC2 | Gmail SMTP | ✅ Works |
| AWS Lambda | Gmail SMTP | ⚠️ May timeout |
| AWS Lambda | AWS SES | ✅ Works |

## Best Practices

1. ✅ Use custom SMTP in production (Brevo, SendGrid, AWS SES)
2. ✅ Enable connection pooling for better performance
3. ✅ Set appropriate timeouts (60s recommended)
4. ✅ Implement retry logic with exponential backoff
5. ✅ Log all email attempts for debugging
6. ✅ Monitor email delivery rates
7. ✅ Have fallback notification method (SMS, in-app)
8. ✅ Test email configuration before deployment
