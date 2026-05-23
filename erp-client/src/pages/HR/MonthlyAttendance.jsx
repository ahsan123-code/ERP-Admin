import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { hrDb } from '../../lib/db';
import Button from '../../components/ui/Button';
import styles from './Attendance.module.css';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const STATUS_SHORT = { present: 'P', absent: 'A', late: 'L', half: 'H', leave: 'LV' };
const STATUS_COLOR = { present: 'green', absent: 'red', late: 'orange', half: 'blue', leave: 'purple' };

export default function MonthlyAttendance({ employees }) {
  const now = new Date();
  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const active = employees.filter(e => e.status === 'active');

  useEffect(() => {
    setLoading(true);
    hrDb.getMonthlyAttendance(year, month).then(({ data }) => {
      setRecords(data || []);
      setLoading(false);
    });
  }, [year, month]);

  // Build map: employee_id → { day → status }
  const attMap = {};
  records.forEach(r => {
    const day = parseInt(r.date.split('-')[2], 10);
    if (!attMap[r.employee_id]) attMap[r.employee_id] = {};
    attMap[r.employee_id][day] = r.status;
  });

  const exportCsv = () => {
    const header = ['Employee', 'Department', ...days.map(String), 'Present', 'Absent', 'Late', 'Half'].join(',');
    const rows = active.map(emp => {
      const empAtt = attMap[emp.employee_id] || {};
      const dayVals = days.map(d => STATUS_SHORT[empAtt[d]] || '-');
      const p = days.filter(d => empAtt[d] === 'present').length;
      const a = days.filter(d => empAtt[d] === 'absent').length;
      const l = days.filter(d => empAtt[d] === 'late').length;
      const h = days.filter(d => empAtt[d] === 'half').length;
      return [`"${emp.name}"`, `"${emp.department || ''}"`, ...dayVals, p, a, l, h].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${year}_${MONTH_SHORT[month - 1]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const yearOptions = [2024, 2025, 2026, 2027];

  return (
    <div className={styles.monthlyWrap}>
      <div className={styles.monthlyToolbar}>
        <div className={styles.monthPicker}>
          <select className={styles.monthSelect} value={month} onChange={e => setMonth(+e.target.value)}>
            {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select className={styles.yearSelect} value={year} onChange={e => setYear(+e.target.value)}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading attendance data…</div>
      ) : (
        <div className={styles.monthlyScroll}>
          <table className={styles.monthlyGrid}>
            <thead>
              <tr>
                <th className={styles.empThCol}>Employee</th>
                <th className={styles.deptThCol}>Dept</th>
                {days.map(d => <th key={d} className={styles.dayTh}>{d}</th>)}
                <th className={styles.totalTh} title="Present">P</th>
                <th className={styles.totalTh} title="Absent">A</th>
              </tr>
            </thead>
            <tbody>
              {active.map(emp => {
                const empAtt = attMap[emp.employee_id] || {};
                const present = days.filter(d => empAtt[d] === 'present').length;
                const absent  = days.filter(d => empAtt[d] === 'absent').length;
                return (
                  <tr key={emp.employee_id} className={styles.monthlyRow}>
                    <td className={styles.empTdCol}>
                      <span className={styles.empName}>{emp.name}</span>
                    </td>
                    <td className={styles.deptTdCol}>{emp.department || '—'}</td>
                    {days.map(d => {
                      const st = empAtt[d];
                      return (
                        <td key={d} className={styles.dayTd}>
                          {st ? (
                            <span className={`${styles.dayCell} ${styles[`cell_${STATUS_COLOR[st]}`]}`}>
                              {STATUS_SHORT[st]}
                            </span>
                          ) : (
                            <span className={styles.dayCellEmpty}>·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className={`${styles.totalTd} ${styles.totalPresent}`}>{present || 0}</td>
                    <td className={`${styles.totalTd} ${styles.totalAbsent}`}>{absent || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
