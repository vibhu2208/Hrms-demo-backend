/**
 * Test Email Controller
 * For testing email functionality with custom recipient addresses
 */

const { getTenantModel } = require('../utils/tenantModels');
const { sendOfferLetterWithDocumentLink } = require('../services/emailService');

/**
 * Send test onboarding email to any email address
 * @route POST /api/onboarding/:onboardingId/send-test-email
 */
exports.sendTestOnboardingEmail = async (req, res) => {
  try {
    const { onboardingId } = req.params;
    const { testEmail } = req.body;
    const tenantConnection = req.tenant.connection;

    if (!testEmail) {
      return res.status(400).json({
        success: false,
        message: 'Test email address is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address format'
      });
    }

    const Onboarding = getTenantModel(tenantConnection, 'Onboarding');
    const CandidateDocumentUploadToken = getTenantModel(tenantConnection, 'CandidateDocumentUploadToken');

    // Get onboarding record
    const onboarding = await Onboarding.findById(onboardingId);
    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'Onboarding record not found'
      });
    }

    // Get or create upload token
    let uploadToken = await CandidateDocumentUploadToken.findOne({
      onboardingId: onboarding._id,
      isActive: true,
      expiresAt: { $gt: new Date() }
    });

    if (!uploadToken) {
      // Create new token if doesn't exist
      const token = require('crypto').randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      uploadToken = await CandidateDocumentUploadToken.create({
        onboardingId: onboarding._id,
        candidateId: onboarding.onboardingId,
        candidateName: onboarding.candidateName,
        candidateEmail: onboarding.candidateEmail,
        position: onboarding.position,
        token,
        expiresAt,
        generatedBy: req.user._id
      });
    }

    // Hard-coded public upload URL as requested
    const uploadUrl = `http://3.108.172.119/public/upload-documents/${uploadToken.token}`;

    // Send test email
    await sendOfferLetterWithDocumentLink({
      candidateName: onboarding.candidateName,
      candidateEmail: testEmail, // Use test email instead of actual candidate email
      position: onboarding.position,
      joiningDate: onboarding.joiningDate,
      uploadUrl,
      companyName: req.tenant?.companyName || 'SPC MANAGMENT'
    });

    console.log(`📧 Test onboarding email sent to ${testEmail} for ${onboarding.candidateName}`);

    res.status(200).json({
      success: true,
      message: `Test email sent successfully to ${testEmail}`,
      data: {
        testEmail,
        uploadUrl,
        candidateName: onboarding.candidateName,
        position: onboarding.position
      }
    });

  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = exports;
