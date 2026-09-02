/**
 * Excel worksheet tab names cap at 31 characters, reject [ ] : * ? / \ and must be
 * unique within a workbook — SheetJS throws on a duplicate rather than renaming it.
 *
 * `used` is a Set the caller keeps for the workbook it is building; each call adds the
 * name it returned, so a clash gets a " (2)" suffix that still fits inside the 31.
 *
 * Lives here rather than in one page because both the payroll sheet and the archive
 * export build multi-tab workbooks from names a user typed.
 */
export const sheetName = (label, used) => {
  const base = label.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = base;
  let n = 2;
  while (used.has(name)) {
    const suffix = ` (${n++})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name);
  return name;
};
