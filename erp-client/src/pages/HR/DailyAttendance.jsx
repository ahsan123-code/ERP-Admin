import { useState, useEffect } from 'react';
import { hrDb } from '../../lib/db';
import { useToast } from '../../components/shared/Toast';
import Button from '../../components/ui/Button';
import styles from './Attendance.module.css';

const STATUS_OPTIONS = [
  { value: 'present', label: 'P', title: 'Present',  color: 'green'  },
  { value: 'absent',  label: 'A', title: 'Absent',   color: 'red'    },
  { value: 'late',    label: 'L', title: 'Late',      color: 'orange' },
  { value: 'half',    label: 'H', title: 'Half Day', color: 'blue'   },
];

export default function DailyAttendance({ employees }) {
  const toast = useToast();
  const today = new Date().toISOString().split('T')[0];
  const [date,      setDate]      = useState(today);
  const [statusMap, setStatusMap] = useState({});
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [dirty,     setDirty]     = useState(false);

  const active = employees.filter(e => e.status === 'active');

  useEffect(() => {
    if (!active.length) return;
    setLoading(true);
    hrDb.getAttendanceForDate(date).then(({ data }) => {
      const map = {};
      active.forEach(e => { map[e.employee_id] = 'present'; });
      (data || []).forEach(r => { if (map[r.employee_id] !== undefined) map[r.employee_id] = r.status; });
      setStatusMap(map);
      setDirty(false);
      setLoading(false);
    });
  }, [date, employees.length]);

  const setStatus = (empId, status) => {
    setStatusMap(prev => ({ ...prev, [empId]: status }));
    setDirty(true);
  };

  const markAllPresent = () => {
    const map = {};
    active.forEach(e => { map[e.employee_id] = 'present'; });
    setStatusMap(map);
    setDirty(true);
  };

  const saveAttendance = async () => {
    setSaving(true);
    const records = active.map(emp => ({
      employee_id:   emp.employee_id,
      employee_name: emp.name,
      date,
      status: statusMap[emp.employee_id] || 'present',
    }));
    const { error } = await hrDb.bulkUpsertAttendance(records);
    setSaving(false);
    if (error) {
      toast.error(error.message, 'Save Failed');
    } else {
      toast.success(`Attendance saved for ${records.length} employees.`, 'Saved');
      setDirty(false);
    }
  };

  const presentCount = Object.values(statusMap).filter(s => s === 'present').length;
  const absentCount  = Object.values(statusMap).filter(s => s === 'absent').length;
  const lateCount    = Object.values(statusMap).filter(s => s === 'late').length;

  return (
    <div className={styles.dailyWrap}>
      <div className={styles.dailyToolbar}>
        <div className={styles.dateWrap}>
          <label className={styles.dateLabel}>Date</label>
          <input
            type="date"
            className={styles.dateInput}
            value={date}
            max={today}
            onChange={e => setDate(e.target.value)}
          />
        </div>
        <div className={styles.attSummary}>
          <span className={`${styles.attBadge} ${styles.badgeGreen}`}>Present: {presentCount}</span>
          <span className={`${styles.attBadge} ${styles.badgeRed}`}>Absent: {absentCount}</span>
          <span className={`${styles.attBadge} ${styles.badgeOrange}`}>Late: {lateCount}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <Button variant="secondary" size="sm" onClick={markAllPresent}>Mark All Present</Button>
          <Button variant="primary" size="sm" onClick={saveAttendance} disabled={saving || !dirty}>
            {saving ? 'Saving…' : dirty ? 'Save Attendance' : 'Saved'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading attendance data…</div>
      ) : (
        <div className={styles.dailyTable}>
          <div className={styles.dailyHead}>
            <div className={styles.dailyColEmp}>Employee</div>
            <div className={styles.dailyColDept}>Department</div>
            <div className={styles.dailyColStatus}>Status</div>
          </div>
          <div className={styles.dailyBody}>
            {active.map(emp => {
              const status = statusMap[emp.employee_id] || 'present';
              return (
                <div key={emp.employee_id} className={styles.dailyRow}>
                  <div className={styles.dailyColEmp}>
                    <span className={styles.empName}>{emp.name}</span>
                    <span className={styles.empId}>{emp.employee_id}</span>
                  </div>
                  <div className={styles.dailyColDept}>{emp.department || '—'}</div>
                  <div className={styles.dailyColStatus}>
                    {STATUS_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        className={`${styles.statusBtn} ${status === opt.value ? styles[`status_${opt.color}`] : ''}`}
                        onClick={() => setStatus(emp.employee_id, opt.value)}
                        title={opt.title}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
