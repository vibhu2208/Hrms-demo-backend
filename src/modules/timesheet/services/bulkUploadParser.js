function parseCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line, index) => {
    const values = line.split(',').map((v) => v.trim());
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || '';
    });
    row._rowNumber = index + 2;
    return row;
  });
}

function validateParsedRows(rows) {
  const valid = [];
  const errors = [];
  for (const row of rows) {
    const hours = Number(row.hours);
    if (!row.employeeId || !row.entryDate || !row.projectId) {
      errors.push({ row_number: row._rowNumber, employee_id: row.employeeId || '', reason: 'Missing employeeId/entryDate/projectId' });
      continue;
    }
    if (Number.isNaN(hours) || hours < 0 || hours > 24) {
      errors.push({ row_number: row._rowNumber, employee_id: row.employeeId, reason: 'Invalid hours' });
      continue;
    }
    valid.push({
      employeeId: row.employeeId,
      entryDate: row.entryDate,
      projectId: row.projectId,
      taskDescription: row.taskDescription || '',
      hours,
      entryType: row.entryType || 'work',
      isBillable: row.isBillable !== 'false'
    });
  }
  return { valid, errors };
}

module.exports = { parseCsv, validateParsedRows };
