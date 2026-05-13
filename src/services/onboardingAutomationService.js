/**
 * Onboarding Automation Service
 * Handles automatic candidate to onboarding transition
 */

const { getTenantModel } = require('../utils/tenantModels');
const { sendEmail } = require('./emailService');

class OnboardingAutomationService {
  /**
   * Auto-move candidate to onboarding when selected in HR call
   * Triggered when: HR Call status = 'completed' AND Final Decision = 'selected'
   */
  async autoMoveToOnboarding(candidateId, tenantConnection, hrDetails) {
    try {
      const Candidate = getTenantModel(tenantConnection, 'Candidate');
      const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
      
      // Get candidate details
      const candidate = await Candidate.findById(candidateId)
        .populate('appliedFor', 'title department');
      
      if (!candidate) {
        throw new Error('Candidate not found');
      }

      console.log(`🔄 Auto-moving candidate ${candidate.firstName} ${candidate.lastName} to onboarding...`);

      // Check if already in onboarding
      const existingOnboarding = await Onboarding.findOne({ 
        candidateEmail: candidate.email 
      });
      
      if (existingOnboarding) {
        console.log('⚠️  Candidate already in onboarding');
        return {
          success: true,
          alreadyExists: true,
          onboarding: existingOnboarding
        };
      }

      // Create onboarding record
      const onboardingData = {
        applicationId: candidate._id,
        jobId: candidate.appliedFor?._id,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone || candidate.mobile,
        position: candidate.appliedFor?.title || candidate.currentDesignation || 'Position',
        department: candidate.appliedFor?.department,
        status: 'preboarding',
        offer: {
          offeredDesignation: candidate.appliedFor?.title,
          offeredCTC: candidate.expectedSalary || 0
        },
        hrDetails: {
          selectedBy: hrDetails?.selectedBy,
          selectionDate: new Date(),
          hrComments: hrDetails?.comments
        },
        timeline: [{
          stage: 'preboarding',
          status: 'current',
          startedAt: new Date(),
          notes: 'Auto-created from recruitment - HR call completed with selection'
        }]
      };

      const onboarding = await Onboarding.create(onboardingData);

      // Update candidate stage
      candidate.stage = 'onboarding';
      candidate.status = 'selected';
      await candidate.save();

      // Send onboarding notification email
      await this.sendOnboardingNotification(candidate, onboarding);

      console.log(`✅ Candidate moved to onboarding successfully`);

      return {
        success: true,
        alreadyExists: false,
        onboarding,
        candidate
      };
    } catch (error) {
      console.error('❌ Error in auto-move to onboarding:', error);
      throw error;
    }
  }

  /**
   * Send onboarding notification to candidate
   */
  async sendOnboardingNotification(candidate, onboarding) {
    try {
      const emailData = {
        to: candidate.email,
        subject: 'Congratulations! Welcome to Onboarding',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">Congratulations ${candidate.firstName}!</h2>
            
            <p>We are pleased to inform you that you have been selected for the position of <strong>${onboarding.position}</strong>.</p>
            
            <p>Your onboarding process has been initiated. Here's what happens next:</p>
            
            <ol>
              <li><strong>Document Submission:</strong> You'll receive a link to upload your documents</li>
              <li><strong>Offer Letter:</strong> We'll send you the official offer letter</li>
              <li><strong>Background Verification:</strong> Standard verification process</li>
              <li><strong>Joining Date:</strong> We'll coordinate your joining date</li>
            </ol>
            
            <p>Please keep an eye on your email for further instructions.</p>
            
            <div style="margin-top: 30px; padding: 15px; background-color: #F3F4F6; border-radius: 5px;">
              <p style="margin: 0;"><strong>Onboarding ID:</strong> ${onboarding.onboardingId || onboarding._id}</p>
              <p style="margin: 5px 0 0 0;"><strong>Position:</strong> ${onboarding.position}</p>
            </div>
            
            <p style="margin-top: 30px;">If you have any questions, please don't hesitate to reach out.</p>
            
            <p>Best regards,<br>HR Team</p>
          </div>
        `
      };

      await sendEmail(emailData);
      console.log(`📧 Onboarding notification sent to ${candidate.email}`);
    } catch (error) {
      console.error('Failed to send onboarding notification:', error.message);
      // Don't throw - email failure shouldn't stop the process
    }
  }

  /**
   * Check if candidate should be auto-moved to onboarding
   */
  shouldAutoMoveToOnboarding(candidate) {
    // Check if HR call is completed and final decision is selected
    const hrInterview = candidate.interviews?.find(
      interview => interview.round === 'HR Round' || interview.interviewType === 'hr'
    );

    if (!hrInterview) return false;

    const isHRCallCompleted = hrInterview.status === 'completed';
    const isFinalDecisionSelected = candidate.finalDecision === 'selected' || 
                                    candidate.status === 'selected';

    return isHRCallCompleted && isFinalDecisionSelected;
  }
}

module.exports = new OnboardingAutomationService();
