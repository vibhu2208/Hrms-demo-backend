const puppeteer = require('puppeteer');

/**
 * Generate PDF from HTML content
 * @param {string} html - HTML content to convert to PDF
 * @param {object} options - PDF generation options
 * @returns {Buffer} PDF buffer
 */
const generatePDFFromHTML = async (html, options = {}) => {
  let browser;
  try {
    console.log('🔍 PDF Generation - HTML length:', html.length);
    console.log('🔍 PDF Generation - HTML preview:', html.substring(0, 200) + '...');
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfOptions = {
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      },
      ...options
    };
    
    const pdf = await page.pdf(pdfOptions);
    console.log('🔍 PDF Generation - PDF buffer size:', pdf.length, 'bytes');
    console.log('🔍 PDF Generation - PDF buffer type:', typeof pdf);
    
    return pdf;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

/**
 * Generate invoice PDF template
 * @param {object} invoice - Invoice data
 * @param {object} client - Client data
 * @param {object} package - Package data
 * @returns {string} HTML template
 */
const generateInvoiceHTML = (invoice, client, packageData) => {
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice ${invoice.invoiceNumber}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 20px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #3b82f6;
          padding-bottom: 20px;
        }
        .company-info {
          flex: 1;
        }
        .company-name {
          font-size: 24px;
          font-weight: bold;
          color: #3b82f6;
          margin-bottom: 5px;
        }
        .invoice-info {
          text-align: right;
        }
        .invoice-title {
          font-size: 32px;
          font-weight: bold;
          color: #3b82f6;
          margin-bottom: 10px;
        }
        .invoice-number {
          font-size: 18px;
          color: #666;
        }
        .billing-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
        }
        .billing-info {
          flex: 1;
        }
        .billing-title {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 10px;
          color: #3b82f6;
        }
        .invoice-details {
          margin-bottom: 30px;
        }
        .details-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .details-table th,
        .details-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        .details-table th {
          background-color: #f8f9fa;
          font-weight: bold;
          color: #3b82f6;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        .items-table th,
        .items-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        .items-table th {
          background-color: #3b82f6;
          color: white;
          font-weight: bold;
        }
        .items-table .amount {
          text-align: right;
        }
        .totals {
          margin-left: auto;
          width: 300px;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #eee;
        }
        .total-row.grand-total {
          font-weight: bold;
          font-size: 18px;
          border-bottom: 2px solid #3b82f6;
          color: #3b82f6;
        }
        .payment-info {
          margin-top: 30px;
          padding: 20px;
          background-color: #f8f9fa;
          border-radius: 8px;
        }
        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .status-paid {
          background-color: #d1fae5;
          color: #065f46;
        }
        .status-pending {
          background-color: #fef3c7;
          color: #92400e;
        }
        .status-overdue {
          background-color: #fee2e2;
          color: #991b1b;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          text-align: center;
          color: #666;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-info">
          <div class="company-name">HRMS System</div>
          <div>Human Resource Management System</div>
          <div>Email: admin@hrms.com</div>
          <div>Phone: +1 (555) 123-4567</div>
        </div>
        <div class="invoice-info">
          <div class="invoice-title">INVOICE</div>
          <div class="invoice-number">#${invoice.invoiceNumber}</div>
        </div>
      </div>

      <div class="billing-section">
        <div class="billing-info">
          <div class="billing-title">Bill To:</div>
          <div><strong>${client?.companyName || client?.name}</strong></div>
          ${client?.email ? `<div>${client.email}</div>` : ''}
          ${client?.phone ? `<div>${client.phone}</div>` : ''}
          ${client?.address ? `<div>${client.address}</div>` : ''}
        </div>
        <div class="billing-info">
          <div class="billing-title">Invoice Details:</div>
          <table class="details-table">
            <tr>
              <td><strong>Invoice Date:</strong></td>
              <td>${formatDate(invoice.createdAt)}</td>
            </tr>
            <tr>
              <td><strong>Due Date:</strong></td>
              <td>${formatDate(invoice.dueDate)}</td>
            </tr>
            <tr>
              <td><strong>Status:</strong></td>
              <td>
                <span class="status-badge status-${invoice.status}">
                  ${invoice.status}
                </span>
              </td>
            </tr>
            <tr>
              <td><strong>Payment Status:</strong></td>
              <td>
                <span class="status-badge status-${invoice.paymentStatus}">
                  ${invoice.paymentStatus}
                </span>
              </td>
            </tr>
          </table>
        </div>
      </div>

      <div class="invoice-details">
        <table class="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Billing Period</th>
              <th>Package</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Subscription Service</strong>
                <br>
                <small>${packageData?.name || 'Standard Package'}</small>
              </td>
              <td>
                ${formatDate(invoice.billingPeriod?.startDate)} - 
                ${formatDate(invoice.billingPeriod?.endDate)}
              </td>
              <td>${packageData?.name || 'Standard Package'}</td>
              <td class="amount">${formatCurrency(invoice.amount?.subtotal || invoice.amount?.total, invoice.currency)}</td>
            </tr>
            ${invoice.discountDetails?.amount ? `
            <tr>
              <td colspan="3"><strong>Discount (${invoice.discountDetails.type})</strong></td>
              <td class="amount">-${formatCurrency(invoice.discountDetails.amount, invoice.currency)}</td>
            </tr>
            ` : ''}
            ${invoice.taxDetails?.amount ? `
            <tr>
              <td colspan="3"><strong>Tax (${invoice.taxDetails.rate}%)</strong></td>
              <td class="amount">${formatCurrency(invoice.taxDetails.amount, invoice.currency)}</td>
            </tr>
            ` : ''}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>${formatCurrency(invoice.amount?.subtotal || invoice.amount?.total, invoice.currency)}</span>
          </div>
          ${invoice.discountDetails?.amount ? `
          <div class="total-row">
            <span>Discount:</span>
            <span>-${formatCurrency(invoice.discountDetails.amount, invoice.currency)}</span>
          </div>
          ` : ''}
          ${invoice.taxDetails?.amount ? `
          <div class="total-row">
            <span>Tax:</span>
            <span>${formatCurrency(invoice.taxDetails.amount, invoice.currency)}</span>
          </div>
          ` : ''}
          <div class="total-row grand-total">
            <span>Total:</span>
            <span>${formatCurrency(invoice.amount?.total, invoice.currency)}</span>
          </div>
        </div>
      </div>

      ${invoice.paymentStatus === 'paid' && invoice.paidDate ? `
      <div class="payment-info">
        <h3 style="margin-top: 0; color: #3b82f6;">Payment Information</h3>
        <p><strong>Payment Date:</strong> ${formatDate(invoice.paidDate)}</p>
        <p><strong>Amount Paid:</strong> ${formatCurrency(invoice.paidAmount, invoice.currency)}</p>
        ${invoice.paymentMethod ? `<p><strong>Payment Method:</strong> ${invoice.paymentMethod}</p>` : ''}
        ${invoice.transactionId ? `<p><strong>Transaction ID:</strong> ${invoice.transactionId}</p>` : ''}
      </div>
      ` : ''}

      ${invoice.notes ? `
      <div class="payment-info">
        <h3 style="margin-top: 0; color: #3b82f6;">Notes</h3>
        <p>${invoice.notes}</p>
      </div>
      ` : ''}

      <div class="footer">
        <p>Thank you for your business!</p>
        <p>This is a computer-generated invoice. No signature required.</p>
        <p>Generated on ${formatDate(new Date())}</p>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  generatePDFFromHTML,
  generateInvoiceHTML
};
