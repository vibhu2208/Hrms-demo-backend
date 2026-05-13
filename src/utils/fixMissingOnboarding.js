/**
 * Migration Script: Fix Missing Onboarding Records
 * 
 * This script finds candidates with HR decision "move-to-onboarding"
 * but no corresponding onboarding record, and creates them.
 * 
 * Run: node src/utils/fixMissingOnboarding.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Candidate = require('../models/Candidate');
const Onboarding = require('../models/Onboarding');

const fixMissingOnboarding = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all candidates with HR decision "move-to-onboarding"
    const candidates = await Candidate.find({
      'hrCall.decision': 'move-to-onboarding'
    }).populate('appliedFor');

    console.log(`📊 Found ${candidates.length} candidates with "move-to-onboarding" decision\n`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const candidate of candidates) {
      try {
        // Check if onboarding already exists
        const existingOnboarding = await Onboarding.findOne({
          $or: [
            { candidateEmail: candidate.email },
            { candidate: candidate._id }
          ]
        });

        if (existingOnboarding) {
          console.log(`⏭️  Skipped: ${candidate.firstName} ${candidate.lastName} (${candidate.email}) - Already has onboarding`);
          skipped++;
          continue;
        }

        // Create onboarding record
        const onboardingData = {
          candidate: candidate._id,
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
          candidateEmail: candidate.email,
          candidatePhone: candidate.phone,
          position: candidate.appliedFor?.title || candidate.currentDesignation || 'Position',
          department: candidate.appliedFor?.department,
          joiningDate: candidate.offerDetails?.joiningDate,
          stages: ['interview1', 'hrDiscussion', 'documentation', 'success'],
          currentStage: 'interview1',
          status: 'in-progress'
        };

        const onboarding = await Onboarding.create(onboardingData);

        console.log(`✅ Created: ${candidate.firstName} ${candidate.lastName} (${candidate.email}) - Onboarding ID: ${onboarding._id}`);
        created++;

        // Update candidate timeline
        candidate.timeline.push({
          action: 'Moved to Onboarding',
          description: 'Candidate moved to onboarding process (migrated)',
          metadata: { onboardingId: onboarding._id, migrated: true }
        });
        await candidate.save();

      } catch (error) {
        console.error(`❌ Error for ${candidate.firstName} ${candidate.lastName}:`, error.message);
        errors++;
      }
    }

    console.log('\n📈 Summary:');
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📊 Total: ${candidates.length}`);

    console.log('\n✅ Migration completed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Run the migration
fixMissingOnboarding();
