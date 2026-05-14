/**
 * Allocate a unique employee code for tenant Employee collection.
 * @param {import('mongoose').Model} TenantEmployee
 * @param {string|undefined|null} preferredCode - trimmed manual code, or falsy to auto-generate EMP####
 * @returns {Promise<string>}
 */
async function allocateEmployeeCode(TenantEmployee, preferredCode) {
  const trimmed =
    typeof preferredCode === 'string' ? preferredCode.trim() : '';

  if (trimmed) {
    const exists = await TenantEmployee.exists({ employeeCode: trimmed });
    if (exists) {
      const err = new Error(`Employee code "${trimmed}" is already in use`);
      err.statusCode = 400;
      throw err;
    }
    return trimmed;
  }

  const rows = await TenantEmployee.find({ employeeCode: { $regex: /^EMP\d+$/i } })
    .select('employeeCode')
    .lean();

  let maxNum = 0;
  for (const row of rows) {
    const m = String(row.employeeCode || '').match(/^EMP(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
  }

  let next = maxNum + 1;
  let candidate = `EMP${String(next).padStart(4, '0')}`;
  for (let guard = 0; guard < 100000; guard++) {
    const taken = await TenantEmployee.exists({ employeeCode: candidate });
    if (!taken) return candidate;
    next += 1;
    candidate = `EMP${String(next).padStart(4, '0')}`;
  }

  const err = new Error('Could not allocate a unique employee code');
  err.statusCode = 500;
  throw err;
}

module.exports = { allocateEmployeeCode };
