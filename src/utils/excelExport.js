const ExcelJS = require('exceljs');

const exportToExcel = async (data, columns, sheetName = 'Sheet1', title = 'Report') => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Add title
  worksheet.mergeCells('A1', `${String.fromCharCode(64 + columns.length)}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  
  // Add timestamp
  worksheet.mergeCells('A2', `${String.fromCharCode(64 + columns.length)}2`);
  const timestampCell = worksheet.getCell('A2');
  timestampCell.value = `Generated on: ${new Date().toLocaleString()}`;
  timestampCell.font = { size: 10, italic: true };
  timestampCell.alignment = { horizontal: 'center' };

  // Add empty row
  worksheet.addRow([]);

  // Add headers
  const headerRow = worksheet.addRow(columns.map(col => col.header));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2563EB' }
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Add data
  data.forEach(item => {
    const row = columns.map(col => {
      const value = col.key.split('.').reduce((obj, key) => obj?.[key], item);
      return col.format ? col.format(value) : value;
    });
    worksheet.addRow(row);
  });

  // Auto-fit columns
  worksheet.columns.forEach((column, index) => {
    let maxLength = columns[index].header.length;
    column.eachCell({ includeEmpty: false }, cell => {
      const cellLength = cell.value ? cell.value.toString().length : 0;
      if (cellLength > maxLength) {
        maxLength = cellLength;
      }
    });
    column.width = Math.min(maxLength + 2, 50);
  });

  // Add borders to all cells
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 3) {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }
  });

  return workbook;
};

const exportEmployeeReport = async (employees) => {
  const columns = [
    { header: 'Employee Code', key: 'employeeCode' },
    { header: 'Name', key: 'firstName', format: (val, item) => `${item.firstName} ${item.lastName}` },
    { header: 'Email', key: 'email' },
    { header: 'Phone', key: 'phone' },
    { header: 'Department', key: 'department.name' },
    { header: 'Designation', key: 'designation' },
    { header: 'Status', key: 'status' },
    { header: 'Joining Date', key: 'joiningDate', format: (val) => val ? new Date(val).toLocaleDateString() : '' }
  ];

  return await exportToExcel(employees, columns, 'Employees', 'Employee Report');
};

const exportAttendanceReport = async (attendance) => {
  const columns = [
    { header: 'Employee', key: 'employee.firstName', format: (val, item) => `${item.employee?.firstName} ${item.employee?.lastName}` },
    { header: 'Date', key: 'date', format: (val) => new Date(val).toLocaleDateString() },
    { header: 'Check In', key: 'checkIn', format: (val) => val ? new Date(val).toLocaleTimeString() : '-' },
    { header: 'Check Out', key: 'checkOut', format: (val) => val ? new Date(val).toLocaleTimeString() : '-' },
    { header: 'Work Hours', key: 'workHours', format: (val) => val?.toFixed(2) || '0' },
    { header: 'Status', key: 'status' },
    { header: 'Location', key: 'location' }
  ];

  return await exportToExcel(attendance, columns, 'Attendance', 'Attendance Report');
};

const exportTimesheetReport = async (timesheets) => {
  const columns = [
    { header: 'Employee', key: 'employee.firstName', format: (val, item) => `${item.employee?.firstName} ${item.employee?.lastName}` },
    { header: 'Project', key: 'project.name' },
    { header: 'Client', key: 'client.name' },
    { header: 'Week Start', key: 'weekStartDate', format: (val) => new Date(val).toLocaleDateString() },
    { header: 'Week End', key: 'weekEndDate', format: (val) => new Date(val).toLocaleDateString() },
    { header: 'Total Hours', key: 'totalHours' },
    { header: 'Billable Hours', key: 'totalBillableHours' },
    { header: 'Status', key: 'status' }
  ];

  return await exportToExcel(timesheets, columns, 'Timesheets', 'Timesheet Report');
};

const exportPayrollReport = async (payrolls) => {
  const columns = [
    { header: 'Employee', key: 'employee.firstName', format: (val, item) => `${item.employee?.firstName} ${item.employee?.lastName}` },
    { header: 'Month', key: 'month' },
    { header: 'Year', key: 'year' },
    { header: 'Basic Salary', key: 'basicSalary', format: (val) => `$${val}` },
    { header: 'Total Earnings', key: 'totalEarnings', format: (val) => `$${val}` },
    { header: 'Total Deductions', key: 'totalDeductions', format: (val) => `$${val}` },
    { header: 'Net Salary', key: 'netSalary', format: (val) => `$${val}` },
    { header: 'Status', key: 'paymentStatus' }
  ];

  return await exportToExcel(payrolls, columns, 'Payroll', 'Payroll Report');
};

module.exports = {
  exportToExcel,
  exportEmployeeReport,
  exportAttendanceReport,
  exportTimesheetReport,
  exportPayrollReport
};
