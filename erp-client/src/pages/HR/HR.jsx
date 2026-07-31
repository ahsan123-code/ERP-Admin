import { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Users, CalendarCheck, Palmtree, Banknote, HandCoins, FileDown, Pencil, FileSpreadsheet, Trash2 } from 'lucide-react';
import AddEmployeeModal from './AddEmployeeModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import EditEmployeeModal from './EditEmployeeModal';
import DailyAttendance from './DailyAttendance';
import MonthlyAttendance from './MonthlyAttendance';
import NewLeaveModal from './NewLeaveModal';
import AddLoanModal from './AddLoanModal';
import EditLoanModal from './EditLoanModal';
import PayslipModal from './PayslipModal';
import PayrollManageModal from './PayrollManageModal';
import SalarySheetModal from './SalarySheetModal';
import GeneratePayrollModal from './GeneratePayrollModal';
import DisbursePayrollModal from './DisbursePayrollModal';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import DataTable from '../../components/shared/DataTable';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { useDb } from '../../hooks/useDb';
import { hrDb, financeDb } from '../../lib/db';
import { useCompany } from '../../context/CompanyContext';
import { formatDate, formatCurrency } from '../../utils/format';
import { getStatus } from '../../utils/statusConfig';
import styles from './HR.module.css';

const buildEmpCols = (onDelete) => [
  { key: 'employee_id',  label: 'Emp ID',      width: 110, render: v => <span className={styles.code}>{v}</span> },
  { key: 'name',         label: 'Name',         width: 180 },
  { key: 'designation',  label: 'Designation',  width: 180 },
  { key: 'department',   label: 'Department',   width: 160 },
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
        <button className={styles.printBtn} onClick={() => onPrint(row)} title="Payslip">
          <FileDown size={14} strokeWidth={1.75} />
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
  const [deleteEmp,    setDeleteEmp]    = useState(null);
  const [attSubTab,    setAttSubTab]    = useState('daily');
  const [leaveOpen,    setLeaveOpen]    = useState(false);
  const [loanOpen,     setLoanOpen]     = useState(false);
  const [editLoan,     setEditLoan]     = useState(null);
  const [payslipRec,   setPayslipRec]   = useState(null);
  const [manageRec,    setManageRec]    = useState(null);
  const [sheetOpen,    setSheetOpen]    = useState(false);
  const [genOpen,      setGenOpen]      = useState(false);
  const [disburseOpen, setDisburseOpen] = useState(false);

  const { companyId } = useCompany();

  const { data: employees,     loading: loadEmp,     refetch: refetchEmp }     = useDb(() => hrDb.getEmployees());
  const { data: attendance,    loading: loadAtt }   = useDb(() => hrDb.getAttendance());
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

  const handlePayrollSave = async (updated) => {
    await hrDb.updatePayroll(updated.payroll_id, updated);
    refetchPay();
  };

  const EMP_COLS = buildEmpCols(setDeleteEmp);
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
            subtitle={loadLoans ? 'Loading…' : `${activeLoans} active loans — click any row to edit`}
            actions={<Button icon={<Plus size={15} />} size="sm" onClick={() => setLoanOpen(true)}>Add Loan</Button>}
          />
          <DataTable columns={LOAN_COLS} data={loans} loading={loadLoans} keyField="loan_id" searchPlaceholder="Search loans..." onRowClick={setEditLoan} />
        </Card>
      )}

      <AddEmployeeModal open={empOpen} onClose={() => setEmpOpen(false)} onSave={handleSave} />
      <EditEmployeeModal employee={editEmp} onClose={() => setEditEmp(null)} onSave={handleEditSave} />
      <DeleteConfirmModal employee={deleteEmp} onClose={() => setDeleteEmp(null)} onConfirm={handleDeleteConfirm} />
      <NewLeaveModal open={leaveOpen} onClose={() => setLeaveOpen(false)} onSave={() => refetchLeave()} employees={employees} />
      <AddLoanModal open={loanOpen} onClose={() => setLoanOpen(false)} onSave={() => refetchLoans()} employees={employees} />
      <EditLoanModal loan={editLoan} onClose={() => setEditLoan(null)} onSave={() => refetchLoans()} />
      {payslipRec && <PayslipModal record={payslipRec} onClose={() => setPayslipRec(null)} />}
      {manageRec  && <PayrollManageModal record={manageRec} onSave={handlePayrollSave} onClose={() => setManageRec(null)} />}
      {sheetOpen  && <SalarySheetModal records={sheetRecords} employees={employees} loans={loans} month={selMonth} year={selYear} onClose={() => setSheetOpen(false)} />}
      <GeneratePayrollModal
        open={genOpen}
        employees={employees}
        loans={loans}
        onClose={() => setGenOpen(false)}
        onGenerated={(m, y) => { refetchPay(); setPeriod(`${m} ${y}`); }}
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
