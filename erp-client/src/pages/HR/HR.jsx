import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Users, CalendarCheck, Palmtree, Banknote, HandCoins, Printer, Pencil, FileSpreadsheet } from 'lucide-react';
import AddEmployeeModal from './AddEmployeeModal';
import EditEmployeeModal from './EditEmployeeModal';
import MarkAttendanceModal from './MarkAttendanceModal';
import NewLeaveModal from './NewLeaveModal';
import AddLoanModal from './AddLoanModal';
import EditLoanModal from './EditLoanModal';
import PayslipModal from './PayslipModal';
import PayrollManageModal from './PayrollManageModal';
import SalarySheetModal from './SalarySheetModal';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import DataTable from '../../components/shared/DataTable';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { useDb } from '../../hooks/useDb';
import { hrDb } from '../../lib/db';
import { formatDate, formatCurrency } from '../../utils/format';
import { getStatus } from '../../utils/statusConfig';
import styles from './HR.module.css';

const EMP_COLS = [
  { key: 'employee_id',  label: 'Emp ID',     width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'name',         label: 'Name',        width: 180 },
  { key: 'designation',  label: 'Designation', width: 180 },
  { key: 'department',   label: 'Department',  width: 160 },
  { key: 'section',      label: 'Section',     width: 130 },
  { key: 'joining_date', label: 'Joined',      width: 120, render: v => <span className={styles.date}>{v ? formatDate(v) : '—'}</span> },
  { key: 'gross_salary', label: 'Gross Salary',width: 140, align: 'right',
    render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'status',       label: 'Status',      width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const ATT_COLS = [
  { key: 'employee_name', label: 'Employee',  width: 180 },
  { key: 'date',          label: 'Date',      width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'check_in',      label: 'Check In',  width: 100, render: v => <span className={styles.mono}>{v ?? '—'}</span> },
  { key: 'check_out',     label: 'Check Out', width: 100, render: v => <span className={styles.mono}>{v ?? '—'}</span> },
  { key: 'status',        label: 'Status',    width: 120,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const LEAVE_COLS = [
  { key: 'leave_id',      label: 'Leave ID',  width: 120, render: v => <span className={styles.code}>{v}</span> },
  { key: 'employee_name', label: 'Employee',  width: 180 },
  { key: 'leave_type',    label: 'Type',      width: 100 },
  { key: 'from_date',     label: 'From',      width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'to_date',       label: 'To',        width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'days',          label: 'Days',      width: 70,  align: 'center' },
  { key: 'reason',        label: 'Reason',    width: 180, render: v => <span className={styles.reason}>{v}</span> },
  { key: 'status',        label: 'Status',    width: 110,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const LOAN_COLS = [
  { key: 'loan_id',          label: 'Loan ID',          width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'employee_name',    label: 'Employee',          width: 180 },
  { key: 'loan_amount',      label: 'Loan Amount',       width: 140, align: 'right',
    render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'disbursed_date',   label: 'Disbursed',         width: 120, render: v => <span className={styles.date}>{v ? formatDate(v) : '—'}</span> },
  { key: 'monthly_deduction',label: 'Monthly Deduction', width: 155, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.negative}`}>{formatCurrency(v)}</span> },
  { key: 'remaining_balance',label: 'Balance',           width: 140, align: 'right',
    render: v => <span className={`${styles.mono} ${v > 0 ? styles.debitVal : styles.positive}`}>{formatCurrency(v)}</span> },
  { key: 'paid_installments',label: 'Progress',          width: 120,
    render: (v, row) => (
      <div className={styles.progress}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${(v / row.total_installments) * 100}%` }} />
        </div>
        <span className={styles.progressText}>{v}/{row.total_installments}</span>
      </div>
    ) },
  { key: 'status', label: 'Status', width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const buildPayCols = (onPrint, onManage) => [
  { key: 'employee_name', label: 'Employee',  width: 180 },
  { key: 'section',       label: 'Section',   width: 120 },
  { key: 'month',         label: 'Month',     width: 90  },
  { key: 'gross_salary',  label: 'Gross',     width: 130, align: 'right',
    render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'total_deductions', label: 'Deductions', width: 130, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.negative}`}>{formatCurrency(v)}</span> },
  { key: 'net_salary',    label: 'Net Pay',   width: 140, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.netPay}`}>{formatCurrency(v)}</span> },
  { key: 'status',        label: 'Status',    width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
  { key: '_actions', label: '', width: 100, sortable: false,
    render: (_, row) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <button className={styles.printBtn} onClick={() => onManage(row)} title="Edit Payroll">
          <Pencil size={13} strokeWidth={1.75} />
        </button>
        <button className={styles.printBtn} onClick={() => onPrint(row)} title="Print Payslip">
          <Printer size={14} strokeWidth={1.75} />
        </button>
      </div>
    ) },
];

const SEG_TO_TAB = {
  '': 'employees', employees: 'employees',
  attendance: 'attendance',
  leaves: 'leave', leave: 'leave',
  loans: 'loans',
  payroll: 'payroll',
};
const TAB_TO_SEG = { employees: 'employees', attendance: 'attendance', leave: 'leaves', loans: 'loans', payroll: 'payroll' };

const PAGE_TABS = [
  { value: 'employees',  label: 'Employees',  icon: Users         },
  { value: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { value: 'leave',      label: 'Leave',      icon: Palmtree      },
  { value: 'payroll',    label: 'Payroll',    icon: Banknote      },
  { value: 'loans',      label: 'Loans',      icon: HandCoins     },
];

export default function HR() {
  const location = useLocation();
  const navigate  = useNavigate();
  const seg = location.pathname.split('/').filter(Boolean).pop() || '';
  const pageTab = SEG_TO_TAB[seg] ?? 'employees';
  const setPageTab = (tab) => navigate(`/hr/${TAB_TO_SEG[tab] ?? tab}`, { replace: true });

  const [empOpen,      setEmpOpen]      = useState(false);
  const [editEmp,      setEditEmp]      = useState(null);
  const [attOpen,      setAttOpen]      = useState(false);
  const [leaveOpen,    setLeaveOpen]    = useState(false);
  const [loanOpen,     setLoanOpen]     = useState(false);
  const [editLoan,     setEditLoan]     = useState(null);
  const [payslipRec,   setPayslipRec]   = useState(null);
  const [manageRec,    setManageRec]    = useState(null);
  const [sheetOpen,    setSheetOpen]    = useState(false);

  const { data: employees,     loading: loadEmp,     refetch: refetchEmp }     = useDb(() => hrDb.getEmployees());
  const { data: attendance,    loading: loadAtt,   refetch: refetchAtt }   = useDb(() => hrDb.getAttendance());
  const { data: leaveRequests, loading: loadLeave, refetch: refetchLeave } = useDb(() => hrDb.getLeaveRequests());
  const { data: payrollRecords,loading: loadPay,     refetch: refetchPay }     = useDb(() => hrDb.getPayrollRecords());
  const { data: loans,         loading: loadLoans,   refetch: refetchLoans }   = useDb(() => hrDb.getLoans());

  const handleSave = async (emp) => {
    await hrDb.addEmployee(emp);
    refetchEmp();
  };

  const handleEditSave = () => refetchEmp();

  const handlePayrollSave = async (updated) => {
    await hrDb.updatePayroll(updated.payroll_id, updated);
    refetchPay();
  };

  const PAY_COLS = buildPayCols(setPayslipRec, setManageRec);

  const totalActive      = employees.filter(e => e.status === 'active').length;
  const presentToday     = attendance.filter(a => a.status === 'present').length;
  const onLeaveToday     = attendance.filter(a => a.status === 'leave').length;
  const payrollProcessed = payrollRecords.filter(p => p.status === 'paid').length;
  const activeLoans      = loans.filter(l => l.status === 'active').length;

  const stats = [
    { icon: Users,         label: 'Total Employees',  value: loadEmp  ? '…' : totalActive,      color: 'blue'   },
    { icon: CalendarCheck, label: 'Present Today',    value: loadAtt  ? '…' : presentToday,     color: 'green'  },
    { icon: Palmtree,      label: 'On Leave',         value: loadAtt  ? '…' : onLeaveToday,     color: 'orange' },
    { icon: Banknote,      label: 'Payroll Processed',value: loadPay  ? '…' : payrollProcessed, color: 'purple' },
  ];

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader
        title="HR & Payroll"
        subtitle="Allied Steel Center — employees, attendance, leave, payroll, and loans"
        actions={<Button icon={<Plus size={15} />} onClick={() => setEmpOpen(true)}>Add Employee</Button>}
      />

      <div className={styles.summaryGrid}>
        {stats.map((s) => (
          <div key={s.label} className={styles.summaryCard}>
            <div className={`${styles.summaryIcon} ${styles[s.color]}`}>
              <s.icon size={20} strokeWidth={1.75} />
            </div>
            <div>
              <p className={styles.summaryLabel}>{s.label}</p>
              <p className={styles.summaryValue}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.pageTabs}>
        {PAGE_TABS.map(t => (
          <button
            key={t.value}
            className={`${styles.pageTab} ${pageTab === t.value ? styles.pageTabActive : ''}`}
            onClick={() => setPageTab(t.value)}
          >
            <t.icon size={15} strokeWidth={1.75} />
            {t.label}
            {t.value === 'loans' && activeLoans > 0 && (
              <span className={styles.pageTabBadge}>{activeLoans}</span>
            )}
          </button>
        ))}
      </div>

      {pageTab === 'employees' && (
        <Card padding={false}>
          <CardHeader title="Employees" subtitle={loadEmp ? 'Loading…' : `${employees.length} employee records — click any row to edit`} />
          <DataTable columns={EMP_COLS} data={employees} keyField="employee_id" searchPlaceholder="Search employees..." onRowClick={setEditEmp} />
        </Card>
      )}

      {pageTab === 'attendance' && (
        <Card padding={false}>
          <CardHeader
            title="Attendance"
            subtitle={loadAtt ? 'Loading…' : `${attendance.length} records`}
            actions={<Button icon={<Plus size={15} />} size="sm" onClick={() => setAttOpen(true)}>Mark Attendance</Button>}
          />
          <DataTable columns={ATT_COLS} data={attendance} keyField="id" searchPlaceholder="Search attendance..." />
        </Card>
      )}

      {pageTab === 'leave' && (
        <Card padding={false}>
          <CardHeader
            title="Leave Requests"
            subtitle={loadLeave ? 'Loading…' : `${leaveRequests.length} leave applications`}
            actions={<Button icon={<Plus size={15} />} size="sm" onClick={() => setLeaveOpen(true)}>Apply Leave</Button>}
          />
          <DataTable columns={LEAVE_COLS} data={leaveRequests} keyField="leave_id" searchPlaceholder="Search leaves..." />
        </Card>
      )}

      {pageTab === 'payroll' && (
        <Card padding={false}>
          <CardHeader
            title="Payroll — April 2026"
            subtitle={loadPay ? 'Loading…' : `${payrollRecords.length} payroll records`}
            actions={
              <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={14} />} onClick={() => setSheetOpen(true)}>
                Export Sheet
              </Button>
            }
          />
          <DataTable columns={PAY_COLS} data={payrollRecords} keyField="payroll_id" searchPlaceholder="Search payroll..." />
        </Card>
      )}

      {pageTab === 'loans' && (
        <Card padding={false}>
          <CardHeader
            title="Loans & Advances"
            subtitle={loadLoans ? 'Loading…' : `${activeLoans} active loans — click any row to edit`}
            actions={<Button icon={<Plus size={15} />} size="sm" onClick={() => setLoanOpen(true)}>Add Loan</Button>}
          />
          <DataTable columns={LOAN_COLS} data={loans} keyField="loan_id" searchPlaceholder="Search loans..." onRowClick={setEditLoan} />
        </Card>
      )}

      <AddEmployeeModal open={empOpen} onClose={() => setEmpOpen(false)} onSave={handleSave} />
      <EditEmployeeModal employee={editEmp} onClose={() => setEditEmp(null)} onSave={handleEditSave} />
      <MarkAttendanceModal open={attOpen} onClose={() => setAttOpen(false)} onSave={() => refetchAtt()} employees={employees} />
      <NewLeaveModal open={leaveOpen} onClose={() => setLeaveOpen(false)} onSave={() => refetchLeave()} employees={employees} />
      <AddLoanModal open={loanOpen} onClose={() => setLoanOpen(false)} onSave={() => refetchLoans()} employees={employees} />
      <EditLoanModal loan={editLoan} onClose={() => setEditLoan(null)} onSave={() => refetchLoans()} />
      {payslipRec && <PayslipModal record={payslipRec} onClose={() => setPayslipRec(null)} />}
      {manageRec  && <PayrollManageModal record={manageRec} onSave={handlePayrollSave} onClose={() => setManageRec(null)} />}
      {sheetOpen  && <SalarySheetModal records={payrollRecords} employees={employees} loans={loans} month="April" year={2026} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}
