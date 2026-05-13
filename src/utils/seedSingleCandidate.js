/**
 * Seed Single Candidate Script
 * Creates one candidate for testing onboarding workflow
 * 
 * Run: node src/utils/seedSingleCandidate.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Candidate = require('../models/Candidate');
const JobPosting = require('../models/JobPosting');
const { sendApplicationReceivedEmail } = require('../services/emailService');

const seedCandidate = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const jobId = '68fdc6560584ce5f3e22fbf9';
    const email = 'krishnaupadhyay161003@gmail.com';

    // Verify job exists
    console.log('🔍 Checking if job exists...');
    const job = await JobPosting.findById(jobId);
    
    if (!job) {
      console.error(`❌ Job with ID ${jobId} not found!`);
      console.log('\n💡 Tip: Check if the job ID is correct');
      process.exit(1);
    }

    console.log(`✅ Job found: ${job.title} - ${job.department?.name || 'No Department'}\n`);

    // Check if candidate already exists
    const existingCandidate = await Candidate.findOne({ email });
    
    if (existingCandidate) {
      console.log(`⚠️  Candidate with email ${email} already exists!`);
      console.log(`   Name: ${existingCandidate.firstName} ${existingCandidate.lastName}`);
      console.log(`   Candidate Code: ${existingCandidate.candidateCode}`);
      console.log(`   Stage: ${existingCandidate.stage}`);
      console.log(`   Applied For: ${existingCandidate.appliedFor}\n`);
      
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        readline.question('Do you want to delete and recreate? (yes/no): ', resolve);
      });
      readline.close();
      
      if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        await Candidate.findByIdAndDelete(existingCandidate._id);
        console.log('✅ Existing candidate deleted\n');
      } else {
        console.log('❌ Operation cancelled');
        process.exit(0);
      }
    }

    // Create candidate
    console.log('📝 Creating candidate...');
    
    // Generate unique candidate code by finding the highest existing code
    const lastCandidate = await Candidate.findOne()
      .sort({ candidateCode: -1 })
      .select('candidateCode');
    
    let nextNumber = 1;
    if (lastCandidate && lastCandidate.candidateCode) {
      // Extract number from code like "CAN00022" -> 22
      const lastNumber = parseInt(lastCandidate.candidateCode.replace('CAN', ''));
      nextNumber = lastNumber + 1;
    }
    
    const candidateCode = `CAN${String(nextNumber).padStart(5, '0')}`;
    
    console.log(`   Last Candidate Code: ${lastCandidate?.candidateCode || 'None'}`);
    console.log(`   Generated Candidate Code: ${candidateCode}`);
    
    const candidateData = {
      candidateCode: candidateCode, // Explicitly set to avoid duplicate key error
      firstName: 'Krishna',
      lastName: 'Upadhyay',
      email: email,
      phone: '9876543210',
      alternatePhone: '9876543211',
      currentLocation: 'Bangalore',
      preferredLocation: ['Bangalore', 'Mumbai', 'Delhi'],
      source: 'linkedin',
      appliedFor: jobId,
      experience: {
        years: 3,
        months: 6
      },
      currentCompany: 'Tech Solutions Pvt Ltd',
      currentDesignation: 'Software Developer',
      currentCTC: 800000,
      expectedCTC: 1200000,
      noticePeriod: 30,
      skills: [
        'JavaScript',
        'React',
        'Node.js',
        'MongoDB',
        'Express',
        'TypeScript',
        'REST APIs',
        'Git'
      ],
      education: [
        {
          degree: 'Bachelor of Technology',
          specialization: 'Computer Science',
          institution: 'ABC University',
          passingYear: 2020,
          percentage: 85
        }
      ],
      resume: {
        url: 'https://example.com/resume.pdf',
        uploadedAt: new Date()
      },
      stage: 'applied',
      status: 'active',
      isActive: true,
      timeline: [
        {
          action: 'Application Submitted',
          description: 'Candidate applied for the position',
          timestamp: new Date()
        }
      ]
    };

    const candidate = await Candidate.create(candidateData);

    console.log('\n✅ Candidate created successfully!\n');
    
    // Send application received email
    console.log('📧 Sending application received email...');
    try {
      await sendApplicationReceivedEmail({
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email,
        position: job.title,
        companyName: 'TechThrive System'
      });
      console.log('✅ Application received email sent successfully!\n');
    } catch (emailError) {
      console.error('❌ Failed to send email:', emailError.message);
      console.log('💡 Email configuration may need to be checked\n');
    }
    console.log('📊 Candidate Details:');
    console.log(`   Name: ${candidate.firstName} ${candidate.lastName}`);
    console.log(`   Email: ${candidate.email}`);
    console.log(`   Phone: ${candidate.phone}`);
    console.log(`   Candidate Code: ${candidate.candidateCode}`);
    console.log(`   Applied For: ${job.title}`);
    console.log(`   Current Stage: ${candidate.stage}`);
    console.log(`   Status: ${candidate.status}`);
    console.log(`   Experience: ${candidate.experience.years} years ${candidate.experience.months} months`);
    console.log(`   Current CTC: ₹${candidate.currentCTC.toLocaleString()}`);
    console.log(`   Expected CTC: ₹${candidate.expectedCTC.toLocaleString()}`);
    console.log(`   Skills: ${candidate.skills.join(', ')}`);
    console.log(`   ID: ${candidate._id}\n`);

    console.log('🎯 Next Steps:');
    console.log('1. Schedule interviews for this candidate');
    console.log('2. Complete interviews with feedback');
    console.log('3. Conduct HR call with decision "move-to-onboarding"');
    console.log('4. Candidate will appear in onboarding section');
    console.log('5. Complete onboarding to create employee account\n');

    console.log('✅ Seeding completed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding candidate:', error);
    process.exit(1);
  }
};

// Run the script
seedCandidate();
