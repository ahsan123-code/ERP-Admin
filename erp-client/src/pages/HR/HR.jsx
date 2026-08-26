import { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Plus, Users, CalendarCheck, Palmtree, Banknote, FileDown, Pencil, FileSpreadsheet, Trash2,
  Check, X,
} from 'lucide-react';
import AddEmployeeModal from './AddEmployeeModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import EditEmployeeModal from './EditEmployeeModal';
import DailyAttendance from './DailyAttendance';
import MonthlyAttendance from './MonthlyAttendance';
import NewLeaveModal from './NewLeaveModal';
import AddLoanModal from './AddLoanModal';
import AddAdvanceModal from './AddAdvanceModal';
import EditLoanModal from './EditLoanModal';
import PayslipModal from './PayslipModal';
import PayrollManageModal from './PayrollManageModal';
import SalarySheetModal from './SalarySheetModal';
import GeneratePayrollModal from './GeneratePayrollModal';
import DisbursePayrollModal from './DisbursePayrollModal';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import DataTable from '../../components/shared/DataTable';
import { useToast } from '../../components/shared/Toast';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { useDb } from '../../hooks/useDb';
import { hrDb, financeDb } from '../../lib/db';
import { useCompany } from '../../context/CompanyContext';
import { isAdvance, LOAN_TYPES } from '../../data/hr';
import { formatDate, formatCurrency } from '../../utils/format';
import { getStatus } from '../../utils/statusConfig';
import styles from './HR.module.css';

const buildEmpCols = (onDelete) => [
  { key: 'employee_id',  label: 'Emp ID',      width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'name',         label: 'Name',         width: 180 },
  { key: 'designation',  label: 'Designation',  width: 180 },
  // No Department column: it holds the same string as Section for every real employee,
  // and the two forms now write it from Section, so showing both repeated the value.
  { key: 'section',      label: 'Section',      width: 130 },
  { key: 'joining_date', label: 'Joined',       width: 120, render: v => <span className={styles.date}>{v ? formatDate(v) : '—'}</span> },
  { key: 'gross_salary', label: 'Gross Salary', width: 140, align: 'right',
    render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'status',       label: 'Status',       width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
  { key: '_del', label: '', width: 48, sortable: false,
    render: (_, row) => (
      <button
        className={styles.deleteBtn}
        onClick={e => { e.stopPropagation(); onDelete(row); }}
        title="Delete employee"
      >
        <Trash2 size={14} strokeWidth={1.75} />
      </button>
    )},
];


const buildLeaveCols = (onDecide, busyId) => [
  { key: 'leave_id',      label: 'Leave ID',  width: 120, render: v => <span className={styles.code}>{v}</span> },
  { key: 'employee_name', label: 'Employee',  width: 180 },
  { key: 'leave_type',    label: 'Type',      width: 100 },
  { key: 'from_date',     label: 'From',      width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'to_date',       label: 'To',        width: 120, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'days',          label: 'Days',      width: 70,  align: 'center' },
  { key: 'reason',        label: 'Reason',    width: 180, render: v => <span className={styles.reason}>{v}</span> },
  { key: 'status',        label: 'Status',    width: 110,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
  // Only pending requests can be decided; once approved or rejected the row is settled.
  { key: '_decide', label: '', width: 80, sortable: false,
    render: (_, row) => row.status !== 'pending' ? null : (
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className={styles.approveBtn}
          disabled={busyId === row.leave_id}
          onClick={e => { e.stopPropagation(); onDecide(row, 'approved'); }}
          title="Approve leave"
        >
          <Check size={14} strokeWidth={2} />
        </button>
        <button
          className={styles.rejectBtn}
          disabled={busyId === row.leave_id}
          onClick={e => { e.stopPropagation(); onDecide(row, 'rejected'); }}
          title="Reject leave"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    ) },
];

// One table for both kinds of credit, so the labels stay neutral: an advance's
// loan_amount is the advance, and its monthly_deduction is what comes off the coming
// salary — calling either column "Loan" would misread half the rows.
const LOAN_COLS = [
  { key: 'loan_id',          label: 'Ref',               width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'type',             label: 'Type',              width: 100,
    render: (_, row) => (
      <Badge variant={isAdvance(row) ? 'cyan' : 'purple'}>{isAdvance(row) ? 'Advance' : 'Loan'}</Badge>
    ) },
  { key: 'employee_name',    label: 'Employee',          width: 180 },
  { key: 'loan_amount',      label: 'Amount',            width: 140, align: 'right',
    render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'disbursed_date',   label: 'Disbursed',         width: 120, render: v => <span className={styles.date}>{v ? formatDate(v) : '—'}</span> },
  { key: 'monthly_deduction',label: 'Per Month',         width: 155, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.negative}`}>{formatCurrency(v)}</span> },
  { key: 'remaining_balance',label: 'Balance',           width: 140, align: 'right',
    render: v => <span className={`${styles.mono} ${v > 0 ? styles.debitVal : styles.positive}`}>{formatCurrency(v)}</span> },
  { key: 'paid_installments',label: 'Progress',          width: 120,
    render: (v, row) => {
      // total_installments is 0 on nothing real, but a stray 0 would divide to NaN and
      // render an invalid width, so the bar reads empty rather than breaking the row.
      const total = Number(row.total_installments) || 0;
      const pct   = total > 0 ? Math.min(100, (v / total) * 100) : 0;
      return (
        <div className={styles.progress}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <span className={styles.progressText}>{v}/{total || '—'}</span>
        </div>
      );
    } },
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
        <button className={styles.printBtn} onClick={() => onPrint(row)} title="Payslip">
          <FileDown size={14} strokeWidth={1.75} />
        </button>
      </div>
    ) },
];

const today = new Date().toISOString().split('T')[0];

const SEG_TO_TAB = {
  '': 'employees', employees: 'employees',
  attendance: 'attendance',
  leaves: 'leave', leave: 'leave',
  loans: 'loans',
  payroll: 'payroll',
};
export default function HR() {
  const location = useLocation();
  const seg = location.pathname.split('/').filter(Boolean).pop() || '';
  const pageTab = SEG_TO_TAB[seg] ?? 'employees';

  const [empOpen,      setEmpOpen]      = useState(false);
  const [editEmp,      setEditEmp]      = useState(null);
  const [deleteEmp,    setDeleteEmp]    = useState(null);
  const [attSubTab,    setAttSubTab]    = useState('daily');
  const [leaveOpen,    setLeaveOpen]    = useState(false);
  const [loanOpen,     setLoanOpen]     = useState(false);
  const [advanceOpen,  setAdvanceOpen]  = useState(false);
  const [editLoan,     setEditLoan]     = useState(null);
  const [creditFilter, setCreditFilter] = useState('all');
  const [payslipRec,   setPayslipRec]   = useState(null);
  const [manageRec,    setManageRec]    = useState(null);
  const [sheetOpen,    setSheetOpen]    = useState(false);
  const [genOpen,      setGenOpen]      = useState(false);
  const [disburseOpen, setDisburseOpen] = useState(false);

  const toast = useToast();
  const [leaveBusy, setLeaveBusy] = useState(null);

  const { companyId } = useCompany();

  const { data: employees,     loading: loadEmp,     refetch: refetchEmp }     = useDb(() => hrDb.getEmployees());
  const { data: attendance,    loading: loadAtt }   = useDb(() => hrDb.getAttendance(today));
  const { data: leaveRequests, loading: loadLeave, refetch: refetchLeave } = useDb(() => hrDb.getLeaveRequests());
  const { data: payrollRecords,loading: loadPay,     refetch: refetchPay }     = useDb(() => hrDb.getPayrollRecords());
  const { data: loans,         loading: loadLoans,   refetch: refetchLoans }   = useDb(() => hrDb.getLoans());
  const { data: chartOfAccounts } = useDb(() => financeDb.getChartOfAccounts(companyId), [companyId]);
  const { data: bankAccounts }    = useDb(() => financeDb.getBankAccounts(companyId),    [companyId]);

  // Distinct payroll periods present in the data (newest first), for the period selector.
  const MONTH_ORDER = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const periods = useMemo(() => {
    const map = new Map();
    (payrollRecords || []).forEach(r => {
      if (r.month && r.year) map.set(`${r.month} ${r.year}`, { month: r.month, year: r.year });
    });
    return [...map.values()].sort((a, b) => b.year - a.year || MONTH_ORDER.indexOf(b.month) - MONTH_ORDER.indexOf(a.month));
  }, [payrollRecords]);

  const [period, setPeriod] = useState('');
  // Default to the most recent period once data loads
  const activePeriod = period || (periods[0] ? `${periods[0].month} ${periods[0].year}` : '');
  const [selMonth, selYearStr] = activePeriod.split(/ (?=\d{4}$)/);
  const selYear = Number(selYearStr);
  const sheetRecords = (payrollRecords || []).filter(r => r.month === selMonth && r.year === selYear);
  const pendingSheet = sheetRecords.filter(r => r.status !== 'paid');

  const handleSave = async (emp) => {
    await hrDb.addEmployee(emp);
    refetchEmp();
  };

  const handleEditSave = () => refetchEmp();

  const handleDeleteConfirm = async () => {
    await hrDb.deleteEmployee(deleteEmp.employee_id);
    setDeleteEmp(null);
    refetchEmp();
  };

  const handleLeaveDecision = async (row, status) => {
    setLeaveBusy(row.leave_id);
    const { error } = await hrDb.updateLeaveStatus(row.leave_id, status);
    setLeaveBusy(null);
    if (error) {
      toast.error(error.message, 'Update Failed');
      return;
    }
    toast.success(`${row.employee_name}'s leave was ${status}.`, status === 'approved' ? 'Approved' : 'Rejected');
    refetchLeave();
  };

  const handlePayrollSave = async (updated) => {
    await hrDb.updatePayroll(updated.payroll_id, updated);
    refetchPay();
  };

  const EMP_COLS = buildEmpCols(setDeleteEmp);
  const LEAVE_COLS = buildLeaveCols(handleLeaveDecision, leaveBusy);
  const PAY_COLS = buildPayCols(setPayslipRec, setManageRec);

  const totalActive      = employees.filter(e => e.status === 'active').length;
  const presentToday     = attendance.filter(a => a.status === 'present').length;
  // Leave lives in leave_requests, not attendance -- attendance only ever carries
  // present/absent/late, so counting a 'leave' status there was always zero.
  const onLeaveToday     = leaveRequests.filter(l =>
    l.status === 'approved' && l.from_date <= today && l.to_date >= today).length;
  const payrollProcessed = payrollRecords.filter(p => p.status === 'paid').length;
  const activeCredit     = loans.filter(l => l.status === 'active');
  const activeLoans      = activeCredit.filter(l => !isAdvance(l)).length;
  const activeAdvances   = activeCredit.filter(isAdvance).length;

  const visibleCredit = creditFilter === 'all'
    ? loans
    : loans.filter(l => (creditFilter === LOAN_TYPES.ADVANCE ? isAdvance(l) : !isAdvance(l)));

  const stats = [
    { icon: Users,         label: 'Total Employees',  value: loadEmp  ? '…' : totalActive,      color: 'blue'   },
    { icon: CalendarCheck, label: 'Present Today',    value: loadAtt  ? '…' : presentToday,     color: 'green'  },
    { icon: Palmtree,      label: 'On Leave',         value: loadLeave? '…' : onLeaveToday,     color: 'orange' },
    { icon: Banknote,      label: 'Payroll Processed',value: loadPay  ? '…' : payrollProcessed, color: 'purple' },
  ];

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader
        title="HR & Payroll"
        subtitle="Allied Steel Center — employees, attendance, leave, payroll, loans and advances"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {activeLoans    > 0 && <Badge variant="warning">{activeLoans} active loan{activeLoans === 1 ? '' : 's'}</Badge>}
            {activeAdvances > 0 && <Badge variant="cyan">{activeAdvances} open advance{activeAdvances === 1 ? '' : 's'}</Badge>}
            <Button icon={<Plus size={15} />} onClick={() => setEmpOpen(true)}>Add Employee</Button>
          </div>
        }
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

      {pageTab === 'employees' && (
        <Card padding={false}>
          <CardHeader title="Employees" subtitle={loadEmp ? 'Loading…' : `${employees.length} employee records — click any row to edit`} />
          <DataTable columns={EMP_COLS} data={employees} loading={loadEmp} keyField="employee_id" searchPlaceholder="Search employees..." onRowClick={setEditEmp} />
        </Card>
      )}

      {pageTab === 'attendance' && (
        <Card padding={false}>
          <CardHeader
            title="Attendance"
            subtitle="Daily bulk marking and monthly overview"
            actions={
              <div style={{ display: 'flex', gap: 6 }}>
                <Button variant={attSubTab === 'daily'   ? 'primary' : 'secondary'} size="sm" onClick={() => setAttSubTab('daily')}>Daily</Button>
                <Button variant={attSubTab === 'monthly' ? 'primary' : 'secondary'} size="sm" onClick={() => setAttSubTab('monthly')}>Monthly</Button>
              </div>
            }
          />
          {attSubTab === 'daily'   && <DailyAttendance   employees={employees} />}
          {attSubTab === 'monthly' && <MonthlyAttendance employees={employees} />}
        </Card>
      )}

      {pageTab === 'leave' && (
        <Card padding={false}>
          <CardHeader
            title="Leave Requests"
            subtitle={loadLeave ? 'Loading…' : `${leaveRequests.length} leave applications`}
            actions={<Button icon={<Plus size={15} />} size="sm" onClick={() => setLeaveOpen(true)}>Apply Leave</Button>}
          />
          <DataTable columns={LEAVE_COLS} data={leaveRequests} loading={loadLeave} keyField="leave_id" searchPlaceholder="Search leaves..." />
        </Card>
      )}

      {pageTab === 'payroll' && (
        <Card padding={false}>
          <CardHeader
            title={`Payroll — ${activePeriod || '—'}`}
            subtitle={loadPay ? 'Loading…' : `${sheetRecords.length} payroll records`}
            actions={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={activePeriod}
                  onChange={e => setPeriod(e.target.value)}
                  style={{
                    background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                    borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                    padding: '7px 10px', fontSize: 13, outline: 'none', cursor: 'pointer',
                  }}
                >
                  {periods.length === 0 && <option value="">No periods</option>}
                  {periods.map(p => {
                    const v = `${p.month} ${p.year}`;
                    return <option key={v} value={v}>{v}</option>;
                  })}
                </select>
                <Button size="sm" icon={<Plus size={14} />} onClick={() => setGenOpen(true)}>
                  Generate Payroll
                </Button>
                <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={14} />} onClick={() => setSheetOpen(true)} disabled={sheetRecords.length === 0}>
                  Export Sheet
                </Button>
                <Button size="sm" icon={<Banknote size={14} />} onClick={() => setDisburseOpen(true)} disabled={pendingSheet.length === 0}>
                  Disburse ({pendingSheet.length})
                </Button>
              </div>
            }
          />
          <DataTable columns={PAY_COLS} data={sheetRecords} loading={loadPay} keyField="payroll_id" searchPlaceholder="Search payroll..." />
        </Card>
      )}

      {pageTab === 'loans' && (
        <Card padding={false}>
          <CardHeader
            title="Loans & Advances"
            subtitle={loadLoans
              ? 'Loading…'
              : `${activeLoans} active loan${activeLoans === 1 ? '' : 's'} · ${activeAdvances} open advance${activeAdvances === 1 ? '' : 's'} — click any row to edit`}
            actions={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button variant={creditFilter === 'all' ? 'primary' : 'secondary'} size="sm" onClick={() => setCreditFilter('all')}>All</Button>
                  <Button variant={creditFilter === LOAN_TYPES.LOAN ? 'primary' : 'secondary'} size="sm" onClick={() => setCreditFilter(LOAN_TYPES.LOAN)}>Loans</Button>
                  <Button variant={creditFilter === LOAN_TYPES.ADVANCE ? 'primary' : 'secondary'} size="sm" onClick={() => setCreditFilter(LOAN_TYPES.ADVANCE)}>Advances</Button>
                </div>
                <Button icon={<Plus size={15} />} size="sm" onClick={() => setLoanOpen(true)}>Add Loan</Button>
                <Button icon={<Plus size={15} />} size="sm" variant="secondary" onClick={() => setAdvanceOpen(true)}>Add Advance</Button>
              </div>
            }
          />
          <DataTable columns={LOAN_COLS} data={visibleCredit} loading={loadLoans} keyField="loan_id" searchPlaceholder="Search loans and advances..." onRowClick={setEditLoan} />
        </Card>
      )}

      <AddEmployeeModal open={empOpen} onClose={() => setEmpOpen(false)} onSave={handleSave} />
      <EditEmployeeModal employee={editEmp} onClose={() => setEditEmp(null)} onSave={handleEditSave} />
      <DeleteConfirmModal employee={deleteEmp} onClose={() => setDeleteEmp(null)} onConfirm={handleDeleteConfirm} />
      <NewLeaveModal open={leaveOpen} onClose={() => setLeaveOpen(false)} onSave={() => refetchLeave()} employees={employees} />
      <AddLoanModal open={loanOpen} onClose={() => setLoanOpen(false)} onSave={() => refetchLoans()} employees={employees} />
      <AddAdvanceModal open={advanceOpen} onClose={() => setAdvanceOpen(false)} onSave={() => refetchLoans()} employees={employees} />
      <EditLoanModal loan={editLoan} onClose={() => setEditLoan(null)} onSave={() => refetchLoans()} />
      {payslipRec && <PayslipModal record={payslipRec} onClose={() => setPayslipRec(null)} />}
      {manageRec  && <PayrollManageModal record={manageRec} onSave={handlePayrollSave} onClose={() => setManageRec(null)} />}
      {sheetOpen  && <SalarySheetModal records={sheetRecords} employees={employees} loans={loans} month={selMonth} year={selYear} onClose={() => setSheetOpen(false)} />}
      {/* Generating recovers outstanding advances against their balances, so the
          Loans & Advances tab is stale the moment it finishes — hence refetchLoans. */}
      <GeneratePayrollModal
        open={genOpen}
        employees={employees}
        loans={loans}
        onClose={() => setGenOpen(false)}
        onGenerated={(m, y) => { refetchPay(); refetchLoans(); setPeriod(`${m} ${y}`); }}
      />
      <DisbursePayrollModal
        open={disburseOpen}
        month={selMonth}
        year={selYear}
        records={sheetRecords}
        chartOfAccounts={chartOfAccounts}
        bankAccounts={bankAccounts}
        companyId={companyId}
        onClose={() => setDisburseOpen(false)}
        onDone={refetchPay}
      />
    </div>
  );
}
