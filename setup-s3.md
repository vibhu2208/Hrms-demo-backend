# AWS S3 Setup for Resume Uploads

This guide will help you set up AWS S3 for storing resume files uploaded through the HRMS system.

## Prerequisites
- AWS account with appropriate permissions
- AWS CLI installed (optional, for testing)

## Step 1: Create S3 Bucket

1. **Log in to AWS Console** and navigate to S3 service
2. **Create a new bucket** with the following settings:
   - **Bucket name**: `spc-resumes` (or your preferred name)
   - **Region**: `ap-south-1` (Mumbai) or your preferred region
   - **Block Public Access settings**: Keep all settings enabled (we'll use signed URLs)
   - **Versioning**: Enable (recommended for backup)
   - **Encryption**: Enable (Server-side encryption with Amazon S3 keys)

## Step 2: Configure CORS

Add the following CORS configuration to your bucket:

```json
[
    {
        "AllowedHeaders": [
            "*"
        ],
        "AllowedMethods": [
            "GET",
            "PUT",
            "POST",
            "DELETE",
            "HEAD"
        ],
        "AllowedOrigins": [
            "*"
        ],
        "ExposeHeaders": [
            "ETag"
        ],
        "MaxAgeSeconds": 3000
    }
]
```

**How to add CORS:**
1. Select your bucket
2. Go to "Permissions" tab
3. Scroll down to "Cross-origin resource sharing (CORS)"
4. Click "Edit" and paste the configuration above

## Step 3: Create IAM User

1. Go to **IAM service** in AWS Console
2. Create a new user with the following settings:
   - **User name**: `hrms-s3-uploader`
   - **Access type**: "Programmatic access"
3. Attach policies directly:
   - Create a new inline policy with the following permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket",
                "s3:GetObjectVersion"
            ],
            "Resource": [
                "arn:aws:s3:::spc-resumes",
                "arn:aws:s3:::spc-resumes/*"
            ]
        }
    ]
}
```

## Step 4: Get AWS Credentials

After creating the IAM user, you'll get:
- **Access Key ID**
- **Secret Access Key**

**Important**: Save these credentials securely as you won't be able to see the secret key again.

## Step 5: Update Environment Variables

Add the following to your `.env` file:

```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=ap-south-1
AWS_S3_BUCKET=spc-resumes
```

## Step 6: Test the Configuration

1. Restart your backend server
2. Try uploading a resume through the job application form
3. Check the browser console for upload logs
4. Verify the file appears in your S3 bucket

## File Organization

Files will be organized in S3 as follows:
```
spc-resumes/
├── resumes/
│   ├── 2024-02-26/
│   │   ├── 1708941234567-abc123.pdf
│   │   └── 1708941234567-def456.docx
│   └── 2024-02-27/
│       └── 1709027890123-ghi789.pdf
└── candidates/
    └── {candidate_id}/
        └── 2024-02-26/
            └── resume.pdf
```

## Security Features

- **Private Storage**: Files are stored as private objects
- **Signed URLs**: Access via time-limited signed URLs (1 hour expiry)
- **Automatic Cleanup**: Local files are cleaned up after S3 upload
- **Fallback**: If S3 fails, system falls back to local storage

## Troubleshooting

### Common Issues:

1. **CORS Errors**: Make sure CORS is properly configured on your S3 bucket
2. **Access Denied**: Check IAM user permissions and bucket policies
3. **Region Mismatch**: Ensure the bucket region matches your AWS_REGION setting
4. **File Size Limits**: Current limit is 10MB per file

### Testing S3 Access:

You can test S3 access using AWS CLI:

```bash
# Test listing bucket
aws s3 ls s3://spc-resumes --region ap-south-1

# Test upload
aws s3 cp test.txt s3://spc-resumes/test.txt --region ap-south-1

# Test download
aws s3 cp s3://spc-resumes/test.txt downloaded-test.txt --region ap-south-1
```

## Monitoring

Monitor your S3 usage through:
- **AWS S3 Console**: Check storage usage and request metrics
- **CloudWatch**: Set up alerts for unusual activity
- **Application Logs**: Check server logs for upload success/failure

## Cost Optimization

- **Enable S3 Lifecycle Policies**: Automatically move old files to Glacier
- **Monitor Storage Usage**: Regular cleanup of unnecessary files
- **Use Compression**: Enable S3 compression for supported file types

## Production Considerations

1. **Enable S3 Server Access Logging** for audit trails
2. **Set up CloudWatch Alarms** for monitoring
3. **Enable S3 Versioning** for file recovery
4. **Consider S3 Intelligent-Tiering** for cost optimization
5. **Set up appropriate bucket policies** for additional security

---

**Note**: Once S3 is configured, the system will automatically:
- Upload new resumes to S3
- Generate signed URLs for viewing
- Maintain backward compatibility with existing local files
- Fall back to local storage if S3 is unavailable
