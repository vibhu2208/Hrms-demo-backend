const { google } = require('googleapis');

// @desc    Fetch data from Google Sheets
// @route   POST /api/employees/google-sheets/fetch
// @access  Private (Admin, HR)
exports.fetchGoogleSheetData = async (req, res) => {
  try {
    const { spreadsheetId, range, accessToken } = req.body;

    if (!spreadsheetId || !range) {
      return res.status(400).json({
        success: false,
        message: 'Spreadsheet ID and range are required'
      });
    }

    // Initialize OAuth2 client
    const oauth2Client = new google.auth.OAuth2();
    
    if (accessToken) {
      oauth2Client.setCredentials({ access_token: accessToken });
    }

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // Fetch data from Google Sheets
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No data found in the specified range'
      });
    }

    // Parse the data (assuming first row is header)
    const headers = rows[0];
    const data = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || '';
      });
      return obj;
    });

    res.status(200).json({
      success: true,
      data: {
        total: data.length,
        employees: data
      }
    });
  } catch (error) {
    console.error('Google Sheets fetch error:', error);
    
    if (error.code === 401) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. Please check your access token.'
      });
    }
    
    if (error.code === 403) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. Make sure the sheet is shared or you have access.'
      });
    }
    
    if (error.code === 404) {
      return res.status(404).json({
        success: false,
        message: 'Spreadsheet not found. Please check the spreadsheet ID.'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch data from Google Sheets'
    });
  }
};

// @desc    Get OAuth URL for Google Sheets
// @route   GET /api/employees/google-sheets/auth-url
// @access  Private (Admin, HR)
exports.getAuthUrl = async (req, res) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/employees/google-sheets/callback'
    );

    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });

    res.status(200).json({
      success: true,
      data: { authUrl: url }
    });
  } catch (error) {
    console.error('Auth URL generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Handle OAuth callback
// @route   GET /api/employees/google-sheets/callback
// @access  Public
exports.handleOAuthCallback = async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required'
      });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/employees/google-sheets/callback'
    );

    const { tokens } = await oauth2Client.getToken(code);

    res.status(200).json({
      success: true,
      data: { accessToken: tokens.access_token }
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = exports;
