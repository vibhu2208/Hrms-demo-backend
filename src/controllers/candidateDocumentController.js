const CandidateDocument = require('../models/CandidateDocument');
const Candidate = require('../models/Candidate');
const Onboarding = require('../models/Onboarding');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// Configure email transporter using existing email config
const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.warn('Email configuration missing. Using SMTP fallback.');
    // Fallback to SMTP configuration if Gmail not configured
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  });
};

/**
 * Validate candidate by candidate code (public access)
 * @route POST /api/public/candidate-documents/validate
 */
exports.validateCandidate = async (req, res) => {
  try {
    const { candidateCode } = req.body;

    if (!candidateCode) {
      return res.status(400).json({
        success: false,
        message: 'Candidate ID is required'
      });
    }

    // Find candidate by code
    const candidate = await Candidate.findOne({ candidateCode })
      .select('candidateCode firstName lastName email phone stage status');

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Invalid Candidate ID. Please check and try again.'
      });
    }

    // Check if candidate is in onboarding stage
    if (candidate.stage !== 'shortlisted' && candidate.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Document submission is only available for candidates in onboarding stage.'
      });
    }

    // Check if documents already exist
    const existingDocs = await CandidateDocument.findOne({ candidateId: candidateCode });

    res.status(200).json({
      success: true,
      data: {
        candidateCode: candidate.candidateCode,
        name: `${candidate.firstName} ${candidate.lastName}`,
        email: candidate.email,
        documentsSubmitted: existingDocs?.allDocumentsSubmitted || false
      }
    });

  } catch (error) {
    console.error('Error validating candidate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate candidate',
      error: error.message
    });
  }
};

/**
 * Submit candidate documents (public access)
 * @route POST /api/public/candidate-documents/submit
 */
exports.submitDocuments = async (req, res) => {
  try {
    const { candidateCode, bankDetails } = req.body;
    const files = req.files;

    if (!candidateCode) {
      return res.status(400).json({
        success: false,
        message: 'Candidate ID is required'
      });
    }

    // Validate candidate
    const candidate = await Candidate.findOne({ candidateCode });
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Invalid Candidate ID'
      });
    }

    // Validate required files
    if (!files || !files.aadhar || !files.pan || !files.bankProof) {
      return res.status(400).json({
        success: false,
        message: 'All documents (Aadhar, PAN, Bank Proof) are required'
      });
    }

    // Validate bank details
    if (!bankDetails || !bankDetails.bankName || !bankDetails.accountNumber || !bankDetails.ifscCode) {
      return res.status(400).json({
        success: false,
        message: 'Complete bank details are required'
      });
    }

    // Check if documents already exist
    let candidateDoc = await CandidateDocument.findOne({ candidateId: candidateCode });

    const now = new Date();

    if (candidateDoc) {
      // Update existing document
      candidateDoc.aadhar = {
        documentUrl: files.aadhar[0].path,
        documentName: files.aadhar[0].filename,
        uploadedAt: now,
        verified: false
      };

      candidateDoc.pan = {
        documentUrl: files.pan[0].path,
        documentName: files.pan[0].filename,
        uploadedAt: now,
        verified: false
      };

      candidateDoc.bankDetails = {
        bankName: bankDetails.bankName,
        accountNumber: bankDetails.accountNumber,
        ifscCode: bankDetails.ifscCode,
        accountHolderName: bankDetails.accountHolderName || `${candidate.firstName} ${candidate.lastName}`,
        proofDocumentUrl: files.bankProof[0].path,
        proofDocumentName: files.bankProof[0].filename,
        uploadedAt: now,
        verified: false
      };

      candidateDoc.allDocumentsSubmitted = true;
      candidateDoc.submittedAt = now;

    } else {
      // Create new document record
      candidateDoc = new CandidateDocument({
        candidateId: candidateCode,
        aadhar: {
          documentUrl: files.aadhar[0].path,
          documentName: files.aadhar[0].filename,
          uploadedAt: now,
          verified: false
        },
        pan: {
          documentUrl: files.pan[0].path,
          documentName: files.pan[0].filename,
          uploadedAt: now,
          verified: false
        },
        bankDetails: {
          bankName: bankDetails.bankName,
          accountNumber: bankDetails.accountNumber,
          ifscCode: bankDetails.ifscCode,
          accountHolderName: bankDetails.accountHolderName || `${candidate.firstName} ${candidate.lastName}`,
          proofDocumentUrl: files.bankProof[0].path,
          proofDocumentName: files.bankProof[0].filename,
          uploadedAt: now,
          verified: false
        },
        allDocumentsSubmitted: true,
        submittedAt: now
      });
    }

    await candidateDoc.save();

    // Send confirmation email to candidate
    if (!candidateDoc.submissionEmailSent) {
      await sendCandidateConfirmationEmail(candidate, candidateDoc);
      candidateDoc.submissionEmailSent = true;
      await candidateDoc.save();
    }

    // Send notification email to HR
    if (!candidateDoc.hrNotificationSent) {
      await sendHRNotificationEmail(candidate, candidateDoc);
      candidateDoc.hrNotificationSent = true;
      await candidateDoc.save();
    }

    res.status(200).json({
      success: true,
      message: 'Documents submitted successfully! You will receive a confirmation email shortly.',
      data: {
        candidateCode: candidateDoc.candidateId,
        submittedAt: candidateDoc.submittedAt
      }
    });

  } catch (error) {
    console.error('Error submitting documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit documents',
      error: error.message
    });
  }
};

/**
 * Get candidate documents (for HR)
 * @route GET /api/candidate-documents/:candidateCode
 */
exports.getCandidateDocuments = async (req, res) => {
  try {
    const { candidateCode } = req.params;

    const candidateDoc = await CandidateDocument.findOne({ candidateId: candidateCode })
      .populate('aadhar.verifiedBy', 'name employeeId')
      .populate('pan.verifiedBy', 'name employeeId')
      .populate('bankDetails.verifiedBy', 'name employeeId');

    if (!candidateDoc) {
      return res.status(404).json({
        success: false,
        message: 'No documents found for this candidate'
      });
    }

    res.status(200).json({
      success: true,
      data: candidateDoc
    });

  } catch (error) {
    console.error('Error fetching candidate documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents',
      error: error.message
    });
  }
};

/**
 * Verify/Reject a document (for HR)
 * @route PUT /api/candidate-documents/:candidateCode/verify
 */
exports.verifyDocument = async (req, res) => {
  try {
    const { candidateCode } = req.params;
    const { documentType, verified, rejectionReason } = req.body;
    const hrUserId = req.user._id;

    if (!['aadhar', 'pan', 'bankDetails'].includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type'
      });
    }

    const candidateDoc = await CandidateDocument.findOne({ candidateId: candidateCode });

    if (!candidateDoc) {
      return res.status(404).json({
        success: false,
        message: 'No documents found for this candidate'
      });
    }

    // Update verification status
    candidateDoc[documentType].verified = verified;
    candidateDoc[documentType].verifiedBy = hrUserId;
    candidateDoc[documentType].verifiedAt = new Date();
    
    if (!verified && rejectionReason) {
      candidateDoc[documentType].rejectionReason = rejectionReason;
    }

    // Check if all documents are verified
    candidateDoc.allDocumentsVerified = candidateDoc.checkAllDocumentsVerified();

    await candidateDoc.save();

    // If all verified, send final confirmation email
    if (candidateDoc.allDocumentsVerified) {
      const candidate = await Candidate.findOne({ candidateCode });
      await sendVerificationCompleteEmail(candidate);
    }

    res.status(200).json({
      success: true,
      message: `Document ${verified ? 'verified' : 'rejected'} successfully`,
      data: candidateDoc
    });

  } catch (error) {
    console.error('Error verifying document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify document',
      error: error.message
    });
  }
};

// Helper function to send confirmation email to candidate
async function sendCandidateConfirmationEmail(candidate, candidateDoc) {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.warn('Email transporter not configured, skipping confirmation email');
      return;
    }

    const mailOptions = {
      from: process.env.EMAIL_USER || process.env.SMTP_FROM || 'noreply@hrms.com',
      to: candidate.email,
      subject: 'Documents Received Successfully - HRMS Onboarding',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Documents Received Successfully!</h2>
          
          <p>Dear ${candidate.firstName} ${candidate.lastName},</p>
          
          <p>We have successfully received your onboarding documents.</p>
          
          <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Candidate ID:</strong> ${candidateDoc.candidateId}</p>
            <p style="margin: 5px 0;"><strong>Submitted At:</strong> ${candidateDoc.submittedAt.toLocaleString()}</p>
          </div>
          
          <h3>Documents Submitted:</h3>
          <ul>
            <li>✓ Aadhar Card</li>
            <li>✓ PAN Card</li>
            <li>✓ Bank Details & Proof</li>
          </ul>
          
          <p>Our HR team will review your documents and get back to you shortly.</p>
          
          <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">
            If you have any questions, please contact our HR department.
          </p>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
          <p style="color: #9CA3AF; font-size: 12px;">
            This is an automated email. Please do not reply to this message.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Confirmation email sent to ${candidate.email}`);
  } catch (error) {
    console.error('Error sending confirmation email:', error);
  }
}

// Helper function to send notification email to HR
async function sendHRNotificationEmail(candidate, candidateDoc) {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.warn('Email transporter not configured, skipping HR notification');
      return;
    }

    const hrEmail = process.env.HR_EMAIL || process.env.EMAIL_USER || process.env.SMTP_USER;
    
    const mailOptions = {
      from: process.env.EMAIL_USER || process.env.SMTP_FROM || 'noreply@hrms.com',
      to: hrEmail,
      subject: `New Documents Submitted - ${candidate.firstName} ${candidate.lastName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">New Onboarding Documents Submitted</h2>
          
          <p>A candidate has submitted their onboarding documents for review.</p>
          
          <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Candidate Name:</strong> ${candidate.firstName} ${candidate.lastName}</p>
            <p style="margin: 5px 0;"><strong>Candidate ID:</strong> ${candidateDoc.candidateId}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${candidate.email}</p>
            <p style="margin: 5px 0;"><strong>Phone:</strong> ${candidate.phone}</p>
            <p style="margin: 5px 0;"><strong>Submitted At:</strong> ${candidateDoc.submittedAt.toLocaleString()}</p>
          </div>
          
          <h3>Documents Submitted:</h3>
          <ul>
            <li>Aadhar Card</li>
            <li>PAN Card</li>
            <li>Bank Details & Proof</li>
          </ul>
          
          <p>Please review the documents in the HRMS onboarding panel.</p>
          
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/employees/onboarding" 
             style="display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 6px; margin-top: 20px;">
            View in HRMS
          </a>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`HR notification email sent for candidate ${candidateDoc.candidateId}`);
  } catch (error) {
    console.error('Error sending HR notification email:', error);
  }
}

// Helper function to send verification complete email
async function sendVerificationCompleteEmail(candidate) {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.warn('Email transporter not configured, skipping verification email');
      return;
    }

    const mailOptions = {
      from: process.env.EMAIL_USER || process.env.SMTP_FROM || 'noreply@hrms.com',
      to: candidate.email,
      subject: 'Documents Verified Successfully - HRMS Onboarding',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10B981;">✓ Documents Verified Successfully!</h2>
          
          <p>Dear ${candidate.firstName} ${candidate.lastName},</p>
          
          <p>Great news! All your onboarding documents have been verified by our HR team.</p>
          
          <div style="background-color: #D1FAE5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10B981;">
            <p style="margin: 0; color: #065F46;">
              <strong>Status:</strong> All documents verified ✓
            </p>
          </div>
          
          <p>We will contact you soon with the next steps in your onboarding process.</p>
          
          <p style="color: #6B7280; font-size: 14px; margin-top: 30px;">
            If you have any questions, please contact our HR department.
          </p>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
          <p style="color: #9CA3AF; font-size: 12px;">
            This is an automated email. Please do not reply to this message.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Verification complete email sent to ${candidate.email}`);
  } catch (error) {
    console.error('Error sending verification complete email:', error);
  }
}

module.exports = exports;
