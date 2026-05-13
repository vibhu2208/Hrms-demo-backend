# Seed Applicants Instructions

This guide explains how to add 20 dummy applicants to a job posting in the database.

## Prerequisites

- Backend server environment variables configured (`.env` file with `MONGODB_URI`)
- At least one job posting created in the database

## Method 1: Seed to First Job (Automatic)

This will automatically add 20 applicants to the first job posting found in the database:

```bash
cd hrms-backend
npm run seed:applicants
```

## Method 2: Seed to Specific Job (Recommended)

This allows you to specify which job posting to add applicants to:

1. **Get the Job ID:**
   - Go to Job Desk in the frontend
   - Open browser DevTools (F12)
   - Click on a job card
   - Look at the Network tab or Console to find the job `_id`
   - Or check MongoDB directly

2. **Run the seed script with Job ID:**

```bash
cd hrms-backend
npm run seed:job YOUR_JOB_ID_HERE
```

**Example:**
```bash
npm run seed:job 671234567890abcdef123456
```

## What Gets Created

The script creates 20 diverse applicants with:

- **Personal Info:** Name, email, phone, location
- **Experience:** 0-8 years (mix of freshers and experienced)
- **Current Employment:** Company, designation, CTC (for experienced candidates)
- **Skills:** Relevant technical skills (JavaScript, Python, Java, etc.)
- **Education:** Degree details
- **Application Details:** 
  - Various stages (applied, screening, shortlisted, interview-scheduled, etc.)
  - Different sources (LinkedIn, Naukri, referral, etc.)
  - Resume URLs
  - Expected CTC and notice period

## Verification

After running the script:

1. Check the console output for confirmation
2. Go to Job Desk → Click "View" on the job
3. You should see all 20 applicants listed
4. The job card should show the updated applications count

## Sample Output

```
✅ Connected to MongoDB
📋 Job Found: Software Engineer
📍 Department: 671234567890abcdef123456
✅ Added 20 applicants
✅ Updated job applications count to 20

📊 Summary:
   Job: Software Engineer
   Total Applicants: 20
```

## Troubleshooting

**Error: "No job postings found"**
- Create at least one job posting first from the Job Desk page

**Error: "Job with ID not found"**
- Verify the job ID is correct
- Check if the job exists in the database

**Error: "Cannot connect to MongoDB"**
- Verify `.env` file has correct `MONGODB_URI`
- Ensure MongoDB is running

## Notes

- Applicants have unique emails to avoid duplicates
- The script updates the job's `applications` count automatically
- You can run the script multiple times to add more applicants
- All applicants are marked as active by default
