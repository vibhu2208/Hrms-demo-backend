/**
 * Report Export Utilities
 * Handles export of reports to different formats (Excel, PDF, CSV)
 */

const XLSX = require('xlsx');
// const PDFDocument = require('pdfkit'); // Would need pdfkit package

/**
 * Export data to Excel
 */
async function exportToExcel(data, fields) {
  try {
    const workbook = XLSX.utils.book_new();

    // Prepare worksheet data
    const worksheetData = [];
    
    // Add headers
    if (fields && fields.length > 0) {
      worksheetData.push(fields.map(f => f.displayName || f.fieldName));
    } else if (data.length > 0) {
      worksheetData.push(Object.keys(data[0]));
    }

    // Add data rows
    data.forEach(row => {
      if (fields && fields.length > 0) {
        worksheetData.push(fields.map(f => {
          const value = this.getNestedValue(row, f.fieldName);
          return this.formatValue(value, f.dataType);
        }));
      } else {
        worksheetData.push(Object.values(row));
      }
    });

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

    return workbook;
  } catch (error) {
    throw new Error(`Excel export failed: ${error.message}`);
  }
}

/**
 * Export data to CSV
 */
async function exportToCSV(data, fields) {
  try {
    let csvContent = '';

    // Add headers
    if (fields && fields.length > 0) {
      csvContent += fields.map(f => f.displayName || f.fieldName).join(',') + '\n';
    } else if (data.length > 0) {
      csvContent += Object.keys(data[0]).join(',') + '\n';
    }

    // Add data rows
    data.forEach(row => {
      if (fields && fields.length > 0) {
        csvContent += fields.map(f => {
          const value = this.getNestedValue(row, f.fieldName);
          return this.formatCSVValue(value);
        }).join(',') + '\n';
      } else {
        csvContent += Object.values(row).map(v => this.formatCSVValue(v)).join(',') + '\n';
      }
    });

    return csvContent;
  } catch (error) {
    throw new Error(`CSV export failed: ${error.message}`);
  }
}

/**
 * Export data to PDF
 */
async function exportToPDF(data, template) {
  try {
    // Placeholder for PDF generation
    // Would use pdfkit or similar library
    // const doc = new PDFDocument();
    // ... PDF generation logic
    // return doc;
    
    throw new Error('PDF export not yet implemented');
  } catch (error) {
    throw new Error(`PDF export failed: ${error.message}`);
  }
}

/**
 * Get nested value from object
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, prop) => current && current[prop], obj);
}

/**
 * Format value based on data type
 */
function formatValue(value, dataType) {
  if (value === null || value === undefined) return '';

  switch (dataType) {
    case 'date':
      return value instanceof Date ? value.toLocaleDateString() : value;
    case 'currency':
      return typeof value === 'number' ? `₹${value.toFixed(2)}` : value;
    case 'number':
      return typeof value === 'number' ? value : parseFloat(value) || 0;
    default:
      return String(value);
  }
}

/**
 * Format value for CSV
 */
function formatCSVValue(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  // Escape quotes and wrap in quotes if contains comma or newline
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

module.exports = {
  exportToExcel,
  exportToCSV,
  exportToPDF,
  getNestedValue,
  formatValue,
  formatCSVValue
};


