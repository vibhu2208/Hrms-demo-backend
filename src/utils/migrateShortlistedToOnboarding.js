require('dotenv').config();
const mongoose = require('mongoose');
const Candidate = require('../models/Candidate');
const Employee = require('../models/Employee');
const Onboarding = require('../models/Onboarding');
const JobPosting = require('../models/JobPosting');

const migrateShortlistedCandidates = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Find all shortlisted candidates
    const shortlistedCandidates = await Candidate.find({ 
      stage: 'shortlisted',
      status: 'active'
    }).populate('appliedFor');

    console.log(`📋 Found ${shortlistedCandidates.length} shortlisted candidates`);

    let created = 0;
    let skipped = 0;

    for (const candidate of shortlistedCandidates) {
      // Check if already in onboarding
      const existingOnboarding = await Onboarding.findOne({ 
        candidateEmail: candidate.email 
      });

      if (existingOnboarding) {
        console.log(`⏭️  Skipped: ${candidate.firstName} ${candidate.lastName} (already in onboarding)`);
        skipped++;
        continue;
      }

      try {
        // Create onboarding record without employee reference
        await Onboarding.create({
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          candidateEmail: candidate.email,
          candidatePhone: candidate.phone,
          position: candidate.appliedFor?.title || candidate.currentDesignation || 'Position',
          department: candidate.appliedFor?.department,
          joiningDate: candidate.offerDetails?.joiningDate,
          stages: ['interview1', 'hrDiscussion', 'documentation', 'success'],
          currentStage: 'interview1',
          status: 'in-progress',
          notes: `Migrated from recruitment. Applied for: ${candidate.appliedFor?.title || 'N/A'}`
        });

        console.log(`✅ Created onboarding for: ${candidate.firstName} ${candidate.lastName}`);
        created++;
      } catch (error) {
        console.error(`❌ Error creating onboarding for ${candidate.firstName} ${candidate.lastName}:`, error.message);
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   Total Shortlisted: ${shortlistedCandidates.length}`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

migrateShortlistedCandidates();
