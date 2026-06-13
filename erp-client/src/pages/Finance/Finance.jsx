import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TrendingUp, Scale, Plus, Landmark, FileCheck, CreditCard, BarChart2, BookOpen, Banknote, ArrowRightLeft, Coins, CalendarDays, Trash2, Check, Ban } from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import NewVoucherModal from './NewVoucherModal';
import NewChequeModal from './NewChequeModal';
import NewCashReceiptModal from './NewCashReceiptModal';
import NewPettyCashModal from './NewPettyCashModal';
import NewTransferModal from './NewTransferModal';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import DataTable from '../../components/shared/DataTable';
import { useToast } from '../../components/shared/Toast';
import { financeDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { formatDate, formatCurrency } from '../../utils/format';
import { getStatus } from '../../utils/statusConfig';
import styles from './Finance.module.css';

const AGING_COLS = [
  { key: 'party_name',     label: 'Party',      width: 220 },
  { key: 'party_type',     label: 'Type',       width: 90  },
  { key: 'current_amount', label: 'Current',    width: 130, align: 'right', render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'days_30',        label: '1–30 Days',  width: 130, align: 'right', render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'days_60',        label: '31–60 Days', width: 130, align: 'right', render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'over_90',        label: '90+ Days',   width: 130, align: 'right',
    render: v => <span className={`${styles.mono} ${v > 0 ? styles.overdue : ''}`}>{formatCurrency(v)}</span> },
  { key: 'total',          label: 'Total',      width: 140, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.totalVal}`}>{formatCurrency(v)}</span> },
];

const BANK_COLS = [
  { key: 'account_id',    label: 'Account ID',  width: 100, render: v => <span className={styles.code}>{v}</span> },
  { key: 'bank_name',     label: 'Bank',        width: 170 },
  { key: 'account_no',    label: 'Account No.', width: 160, render: v => <span className={styles.mono}>{v}</span> },
  { key: 'account_title', label: 'Title',       width: 200 },
  { key: 'account_type',  label: 'Type',        width: 90  },
  { key: 'balance',       label: 'Balance',     width: 140, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.credit}`}>{formatCurrency(v)}</span> },
  { key: 'status',        label: 'Status',      width: 90,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const PAGE_TABS = [
  { value: 'vouchers',   label: 'Vouchers',            icon: FileCheck      },
  { value: 'banks',      label: 'Bank Accounts',       icon: Landmark       },
  { value: 'cheques',    label: 'Cheques',             icon: CreditCard     },
  { value: 'accounts',   label: 'Chart of Accounts',   icon: BookOpen       },
  { value: 'aging',      label: 'Aging',               icon: BarChart2      },
  { value: 'cash',       label: 'Cash Received',       icon: Banknote       },
  { value: 'inter-bank', label: 'Inter Bank Transfer', icon: ArrowRightLeft },
  { value: 'petty',      label: 'Petty Cash',          icon: Coins          },
  { value: 'daily',      label: 'Daily Cash',          icon: CalendarDays   },
];

const CR_COLS = [
  { key: 'cr_id',      label: 'Ref No.', width: 100, render: v => <span className={styles.code}>{v}</span> },
  { key: 'date',       label: 'Date',    width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'party_name', label: 'Party',   width: 220 },
  { key: 'amount',     label: 'Amount',  width: 140, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.credit}`}>{formatCurrency(v)}</span> },
  { key: 'mode',       label: 'Mode',    width: 90  },
  { key: 'bank_name',  label: 'Bank',    width: 140, render: v => v || <span className={styles.nil}>—</span> },
  { key: 'narration',  label: 'Narration', width: 200, render: v => <span className={styles.narration}>{v}</span> },
  { key: 'status',     label: 'Status',  width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const IBT_COLS = [
  { key: 'ibt_id',       label: 'Ref No.',      width: 100, render: v => <span className={styles.code}>{v}</span> },
  { key: 'date',         label: 'Date',         width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'from_account', label: 'From Account', width: 220 },
  { key: 'to_account',   label: 'To Account',   width: 220 },
  { key: 'amount',       label: 'Amount',       width: 140, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.credit}`}>{formatCurrency(v)}</span> },
  { key: 'narration',    label: 'Narration',    width: 160, render: v => <span className={styles.narration}>{v}</span> },
  { key: 'status',       label: 'Status',       width: 110,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const PC_COLS = [
  { key: 'pc_id',       label: 'Ref No.',     width: 100, render: v => <span className={styles.code}>{v}</span> },
  { key: 'date',        label: 'Date',        width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'description', label: 'Description', width: 250 },
  { key: 'category',    label: 'Category',    width: 110 },
  { key: 'amount',      label: 'Amount',      width: 130, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.debit}`}>{formatCurrency(v)}</span> },
  { key: 'approved_by', label: 'Approved By', width: 140 },
  { key: 'status',      label: 'Status',      width: 100,
    render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
];

const DC_COLS = [
  { key: 'date',            label: 'Date',            width: 130, render: v => <span className={styles.date}>{formatDate(v)}</span> },
  { key: 'opening_balance', label: 'Opening Balance', width: 160, align: 'right', render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
  { key: 'receipts',        label: 'Total Receipts',  width: 160, align: 'right', render: v => <span className={`${styles.mono} ${styles.credit}`}>{formatCurrency(v)}</span> },
  { key: 'payments',        label: 'Total Payments',  width: 160, align: 'right', render: v => <span className={`${styles.mono} ${styles.debit}`}>{formatCurrency(v)}</span> },
  { key: 'closing_balance', label: 'Closing Balance', width: 160, align: 'right',
    render: v => <span className={`${styles.mono} ${v >= 0 ? styles.credit : styles.debit}`}>{formatCurrency(Math.abs(v))}</span> },
];

const COA_COLS = [
  { key: 'account_code', label: 'Code',    width: 90,  render: v => <span className={styles.code}>{v}</span> },
  { key: 'account_name', label: 'Account', width: 280 },
  { key: 'account_type', label: 'Type',    width: 100 },
  { key: 'balance',      label: 'Balance', width: 180, align: 'right',
    render: v => <span className={`${styles.mono} ${styles.credit}`}>{(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 })}</span> },
];

const SEG_TO_TAB = {
  '': 'vouchers', vouchers: 'vouchers',
  bank: 'banks', cheques: 'cheques', accounts: 'accounts', aging: 'aging',
  'cash-received': 'cash', 'inter-bank': 'inter-bank', 'petty-cash': 'petty', 'daily-cash': 'daily',
};
const TAB_TO_SEG = {
  vouchers: 'vouchers', banks: 'bank', cheques: 'cheques', accounts: 'accounts', aging: 'aging',
  cash: 'cash-received', 'inter-bank': 'inter-bank', petty: 'petty-cash', daily: 'daily-cash',
};

export default function Finance() {
  const location = useLocation();
  const navigate  = useNavigate();
  const seg = location.pathname.split('/').filter(Boolean).pop() || '';
  const pageTab = SEG_TO_TAB[seg] ?? 'vouchers';
  const setPageTab = (tab) => navigate(`/finance/${TAB_TO_SEG[tab] ?? tab}`, { replace: true });

  const toast = useToast();
  const { companyId } = useCompany();
  const [chequeTab, setChequeTab] = useState('all');
  const [vchOpen,   setVchOpen]   = useState(false);
  const [chqOpen,   setChqOpen]   = useState(false);
  const [crOpen,    setCrOpen]    = useState(false);
  const [ibtOpen,   setIbtOpen]   = useState(false);
  const [pcOpen,    setPcOpen]    = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [clearingId, setClearingId] = useState(null);
  const [bouncingId, setBouncingId] = useState(null);

  const { data: dbVouchers, refetch: refetchVouchers } = useDb(() => financeDb.getVouchers(companyId), [companyId]);
  const { data: bankAccounts, refetch: refetchBanks } = useDb(() => financeDb.getBankAccounts(companyId), [companyId]);
  const { data: chequeTracking, refetch: refetchCheques } = useDb(() => financeDb.getChequeTracking());
  const { data: chartOfAccounts, refetch: refetchCOA } = useDb(() => financeDb.getChartOfAccounts(companyId), [companyId]);
  const { data: agingReport }        = useDb(() => financeDb.getAgingReport(companyId), [companyId]);
  const { data: cashReceived, refetch: refetchCash } = useDb(() => financeDb.getCashReceived());
  const { data: interBankTransfers, refetch: refetchIBT } = useDb(() => financeDb.getInterBankTransfers());
  const { data: pettyCash, refetch: refetchPetty } = useDb(() => financeDb.getPettyCash());
  const { data: dailyCash, refetch: refetchDailyCash } = useDb(() => financeDb.getDailyCash(companyId), [companyId]);

  const [voucherList, setVoucherList] = useState([]);
  useEffect(() => { setVoucherList(dbVouchers); }, [dbVouchers]);

  const handleSave = (vch) => {
    setVoucherList(prev => [vch, ...prev]);
    refetchCOA();
    refetchBanks();
  };

  const handleDeleteVoucher = async (row) => {
    setDeletingId(row.id);
    try {
      const { error } = await financeDb.deleteVoucher(row.id);
      if (error) throw new Error(error.message);

      const account = chartOfAccounts.find(a => a.account_name === row.account_name);
      if (account) await financeDb.applyVoucherToBalances(account, -(row.debit || 0), -(row.credit || 0));

      setVoucherList(prev => prev.filter(v => v.id !== row.id));
      refetchCOA();
      refetchBanks();
      toast.success(`Voucher ${row.voucher_id} deleted.`);
    } catch (err) {
      toast.error(err.message, 'Delete Failed');
    } finally {
      setDeletingId(null);
    }
  };

  const VCH_COLS = [
    { key: 'voucher_id',   label: 'Voucher No.', width: 110, render: v => <span className={styles.code}>{v}</span> },
    { key: 'voucher_type', label: 'Type',        width: 90  },
    { key: 'date',         label: 'Date',        width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
    { key: 'account_name', label: 'Account',     width: 220 },
    { key: 'debit',        label: 'Debit',       width: 130, align: 'right',
      render: v => v > 0 ? <span className={`${styles.mono} ${styles.debit}`}>{formatCurrency(v)}</span> : <span className={styles.nil}>—</span> },
    { key: 'credit',       label: 'Credit',      width: 130, align: 'right',
      render: v => v > 0 ? <span className={`${styles.mono} ${styles.credit}`}>{formatCurrency(v)}</span> : <span className={styles.nil}>—</span> },
    { key: 'narration',    label: 'Narration',   width: 160, render: v => <span className={styles.narration}>{v}</span> },
    {
      key: '_actions', label: '', width: 48, sortable: false,
      render: (_, row) => (
        <button
          className={styles.rowDeleteBtn}
          disabled={deletingId === row.id}
          onClick={(e) => { e.stopPropagation(); handleDeleteVoucher(row); }}
          title={`Delete voucher "${row.voucher_id}"`}
        >
          {deletingId === row.id
            ? <span className={styles.rowDeleteSpinner}>…</span>
            : <Trash2 size={13} strokeWidth={2} />}
        </button>
      ),
    },
  ];

  // Refreshes everything affected by a new ledger posting (Cash Received, Petty Cash,
  // Inter-Bank Transfer, Cheque clearing all run through postJournalEntry).
  const refreshLedger = () => {
    refetchCOA();
    refetchBanks();
    refetchVouchers();
    refetchDailyCash();
  };

  const handleSaveCheque = () => refetchCheques();

  const handleSaveCashReceived = () => {
    refetchCash();
    refreshLedger();
  };

  const handleSaveTransfer = () => {
    refetchIBT();
    refreshLedger();
  };

  const handleSavePettyCash = () => {
    refetchPetty();
    refreshLedger();
  };

  const handleClearCheque = async (cheque) => {
    setClearingId(cheque.id);
    try {
      const bankAccount = financeDb.bankCodeToAccount(chartOfAccounts, cheque.bank_account_id);
      const ledgerAccount = chartOfAccounts.find(a => a.account_id === cheque.account_id);
      if (!bankAccount || !ledgerAccount) throw new Error('Linked accounts not found for this cheque.');

      const { error } = await financeDb.clearCheque(cheque, { bankAccount, ledgerAccount, companyId });
      if (error) throw new Error(error.message);

      refetchCheques();
      refreshLedger();
      toast.success(`Cheque ${cheque.cheque_no} cleared.`);
    } catch (err) {
      toast.error(err.message, 'Clear Failed');
    } finally {
      setClearingId(null);
    }
  };

  const handleBounceCheque = async (cheque) => {
    setBouncingId(cheque.id);
    try {
      const { error } = await financeDb.markChequeBounced(cheque.id);
      if (error) throw new Error(error.message);

      refetchCheques();
      toast.success(`Cheque ${cheque.cheque_no} marked as bounced.`);
    } catch (err) {
      toast.error(err.message, 'Update Failed');
    } finally {
      setBouncingId(null);
    }
  };

  const CHEQUE_COLS = [
    { key: 'cheque_id',  label: 'Cheque ID',  width: 100, render: v => <span className={styles.code}>{v}</span> },
    { key: 'party_name', label: 'Party',      width: 190 },
    { key: 'cheque_no',  label: 'Cheque No.', width: 110, render: v => <span className={styles.mono}>{v}</span> },
    { key: 'bank_name',  label: 'Bank',       width: 150 },
    { key: 'amount',     label: 'Amount',     width: 130, align: 'right',
      render: v => <span className={styles.mono}>{formatCurrency(v)}</span> },
    { key: 'due_date',   label: 'Due Date',   width: 110, render: v => <span className={styles.date}>{formatDate(v)}</span> },
    { key: 'status',     label: 'Status',     width: 100,
      render: v => { const s = getStatus(v); return <Badge variant={s.variant}>{s.label}</Badge>; } },
    {
      key: '_actions', label: '', width: 70, sortable: false,
      render: (_, row) => row.status !== 'pending' ? null : (
        <div className={styles.rowActions}>
          <button
            className={styles.rowClearBtn}
            disabled={clearingId === row.id || bouncingId === row.id}
            onClick={(e) => { e.stopPropagation(); handleClearCheque(row); }}
            title={`Mark cheque "${row.cheque_no}" as cleared`}
          >
            {clearingId === row.id
              ? <span className={styles.rowDeleteSpinner}>…</span>
              : <Check size={14} strokeWidth={2} />}
          </button>
          <button
            className={styles.rowBounceBtn}
            disabled={clearingId === row.id || bouncingId === row.id}
            onClick={(e) => { e.stopPropagation(); handleBounceCheque(row); }}
            title={`Mark cheque "${row.cheque_no}" as bounced`}
          >
            {bouncingId === row.id
              ? <span className={styles.rowDeleteSpinner}>…</span>
              : <Ban size={14} strokeWidth={2} />}
          </button>
        </div>
      ),
    },
  ];

  const totalBankBalance = bankAccounts.reduce((sum, b) => sum + (b.balance || 0), 0);
  const pendingCheques   = chequeTracking.filter(c => c.status === 'pending').length;

  // P&L / Balance Sheet derived from chart-of-accounts balances, grouped by the
  // top-level account_code prefix: 10=Income, 11=Asset, 12=Expense, 13=Owner Equity, 14=Liability
  const codePrefix = a => a.account_code?.slice(0, 2);
  const revenue  = chartOfAccounts.filter(a => codePrefix(a) === '10').reduce((s, a) => s + (a.balance || 0), 0);
  const expenses = chartOfAccounts.filter(a => codePrefix(a) === '12').reduce((s, a) => s + (a.balance || 0), 0);
  const assets   = chartOfAccounts.filter(a => codePrefix(a) === '11').reduce((s, a) => s + (a.balance || 0), 0);
  const liabs    = chartOfAccounts.filter(a => ['13','14'].includes(codePrefix(a))).reduce((s, a) => s + (a.balance || 0), 0);

  const plReport     = { netProfit: revenue - expenses, revenue, costOfGoodsSold: 0, grossProfit: revenue, operatingExpenses: expenses };
  const balanceSheet = { asAt: new Date().toISOString().split('T')[0], totalAssets: assets, totalLiabilities: liabs, equity: assets - liabs };

  return (
    <div className={`${styles.page} page-enter`}>
      <PageHeader
        title="Finance"
        subtitle="General ledger, vouchers, bank accounts, cheques, and aging"
        actions={<Button icon={<Plus size={15} />} onClick={() => setVchOpen(true)}>New Voucher</Button>}
      />

      <div className={styles.summaryGrid}>
        <div className={styles.plCard}>
          <div className={styles.plHeader}>
            <div className={`${styles.summaryIcon} ${styles.blue}`}>
              <TrendingUp size={20} strokeWidth={1.75} />
            </div>
            <div>
              <p className={styles.summaryLabel}>Net Profit</p>
              <p className={`${styles.summaryValue} ${plReport.netProfit >= 0 ? styles.profit : styles.loss}`}>
                {formatCurrency(plReport.netProfit)}
              </p>
            </div>
          </div>
          <div className={styles.plRows}>
            <div className={styles.plRow}><span>Revenue</span><span className={styles.mono}>{formatCurrency(plReport.revenue)}</span></div>
            <div className={styles.plRow}><span>COGS</span><span className={`${styles.mono} ${styles.neg}`}>{formatCurrency(plReport.costOfGoodsSold)}</span></div>
            <div className={`${styles.plRow} ${styles.gross}`}><span>Gross Profit</span><span className={styles.mono}>{formatCurrency(plReport.grossProfit)}</span></div>
            <div className={styles.plRow}><span>Operating Expenses</span><span className={`${styles.mono} ${styles.neg}`}>{formatCurrency(plReport.operatingExpenses)}</span></div>
          </div>
        </div>

        <div className={styles.bsCard}>
          <div className={styles.plHeader}>
            <div className={`${styles.summaryIcon} ${styles.green}`}>
              <Scale size={20} strokeWidth={1.75} />
            </div>
            <div>
              <p className={styles.summaryLabel}>Balance Sheet — as at {formatDate(balanceSheet.asAt)}</p>
            </div>
          </div>
          <div className={styles.plRows}>
            <div className={styles.plRow}><span>Total Assets</span><span className={styles.mono}>{formatCurrency(balanceSheet.totalAssets)}</span></div>
            <div className={styles.plRow}><span>Total Liabilities</span><span className={`${styles.mono} ${styles.neg}`}>{formatCurrency(balanceSheet.totalLiabilities)}</span></div>
            <div className={`${styles.plRow} ${styles.gross}`}><span>Equity</span><span className={styles.mono}>{formatCurrency(balanceSheet.equity)}</span></div>
          </div>
        </div>

        <div className={styles.bankSummaryCard}>
          <div className={styles.plHeader}>
            <div className={`${styles.summaryIcon} ${styles.purple}`}>
              <Landmark size={20} strokeWidth={1.75} />
            </div>
            <div>
              <p className={styles.summaryLabel}>Total Bank Balance</p>
              <p className={`${styles.summaryValue} ${styles.profit}`}>{formatCurrency(totalBankBalance)}</p>
            </div>
          </div>
          <div className={styles.plRows}>
            {bankAccounts.map(b => (
              <div key={b.account_id} className={styles.plRow}>
                <span>{b.bank_name}</span>
                <span className={`${styles.mono} ${styles.credit}`}>{formatCurrency(b.balance)}</span>
              </div>
            ))}
          </div>
        </div>
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
          </button>
        ))}
        {pendingCheques > 0 && pageTab !== 'cheques' && (
          <span className={styles.tabAlert}>{pendingCheques} cheques pending</span>
        )}
      </div>

      {pageTab === 'vouchers' && (
        <Card padding={false}>
          <CardHeader title="Vouchers" subtitle={`${voucherList.length} accounting vouchers`} />
          <DataTable columns={VCH_COLS} data={voucherList} keyField="voucher_id" searchPlaceholder="Search vouchers..." />
        </Card>
      )}

      {pageTab === 'banks' && (
        <Card padding={false}>
          <CardHeader title="Bank Accounts" subtitle={`${bankAccounts.length} registered bank accounts`} />
          <DataTable columns={BANK_COLS} data={bankAccounts} keyField="account_id" searchPlaceholder="Search accounts..." />
        </Card>
      )}

      {pageTab === 'cheques' && (
        <Card padding={false}>
          <CardHeader
            title="Cheque Tracking"
            subtitle="Issued and received cheques"
            actions={<Button icon={<Plus size={15} />} onClick={() => setChqOpen(true)}>New Cheque</Button>}
          />
          <DataTable
            columns={CHEQUE_COLS}
            data={chequeTab === 'all' ? chequeTracking : chequeTracking.filter(c => c.status === chequeTab)}
            keyField="cheque_id"
            searchPlaceholder="Search cheques..."
            filterTabs={[
              { value: 'all',     label: 'All',     count: chequeTracking.length },
              { value: 'pending', label: 'Pending', count: chequeTracking.filter(c => c.status === 'pending').length },
              { value: 'cleared', label: 'Cleared', count: chequeTracking.filter(c => c.status === 'cleared').length },
              { value: 'bounced', label: 'Bounced', count: chequeTracking.filter(c => c.status === 'bounced').length },
            ]}
            activeTab={chequeTab}
            onTabChange={setChequeTab}
          />
        </Card>
      )}

      {pageTab === 'accounts' && (
        <Card padding={false}>
          <CardHeader title="Chart of Accounts" subtitle={`${chartOfAccounts.length} accounts`} />
          <DataTable columns={COA_COLS} data={chartOfAccounts} keyField="account_id" searchPlaceholder="Search accounts..." />
        </Card>
      )}

      {pageTab === 'aging' && (
        <Card padding={false}>
          <CardHeader
            title="Aging Report"
            subtitle="Approximate — based on posted invoices from the last 180 days, bucketed by age. Does not account for payments already received."
          />
          <DataTable columns={AGING_COLS} data={agingReport} keyField="party_name" searchPlaceholder="Search parties..." />
        </Card>
      )}

      {pageTab === 'cash' && (
        <Card padding={false}>
          <CardHeader
            title="Cash Received"
            subtitle={`${cashReceived.length} payment receipts`}
            actions={<Button icon={<Plus size={15} />} onClick={() => setCrOpen(true)}>New Receipt</Button>}
          />
          <DataTable columns={CR_COLS} data={cashReceived} keyField="cr_id" searchPlaceholder="Search receipts..." />
        </Card>
      )}

      {pageTab === 'inter-bank' && (
        <Card padding={false}>
          <CardHeader
            title="Inter Bank Transfers"
            subtitle={`${interBankTransfers.length} transfers`}
            actions={<Button icon={<Plus size={15} />} onClick={() => setIbtOpen(true)}>New Transfer</Button>}
          />
          <DataTable columns={IBT_COLS} data={interBankTransfers} keyField="ibt_id" searchPlaceholder="Search transfers..." />
        </Card>
      )}

      {pageTab === 'petty' && (
        <Card padding={false}>
          <CardHeader
            title="Petty Cash"
            subtitle={`${pettyCash.length} petty cash entries`}
            actions={<Button icon={<Plus size={15} />} onClick={() => setPcOpen(true)}>New Entry</Button>}
          />
          <DataTable columns={PC_COLS} data={pettyCash} keyField="pc_id" searchPlaceholder="Search petty cash..." />
        </Card>
      )}

      {pageTab === 'daily' && (
        <Card padding={false}>
          <CardHeader title="Daily Cash Summary" subtitle="Opening and closing cash balances per day, derived from Cash In Hand postings" />
          <DataTable columns={DC_COLS} data={dailyCash} keyField="date" searchPlaceholder="Search by date..." />
        </Card>
      )}

      <NewVoucherModal open={vchOpen} onClose={() => setVchOpen(false)} onSave={handleSave} />
      <NewChequeModal
        open={chqOpen} onClose={() => setChqOpen(false)} onSave={handleSaveCheque}
        bankAccounts={bankAccounts} chartOfAccounts={chartOfAccounts}
      />
      <NewCashReceiptModal
        open={crOpen} onClose={() => setCrOpen(false)} onSave={handleSaveCashReceived}
        bankAccounts={bankAccounts} chartOfAccounts={chartOfAccounts}
      />
      <NewTransferModal
        open={ibtOpen} onClose={() => setIbtOpen(false)} onSave={handleSaveTransfer}
        bankAccounts={bankAccounts} chartOfAccounts={chartOfAccounts}
      />
      <NewPettyCashModal
        open={pcOpen} onClose={() => setPcOpen(false)} onSave={handleSavePettyCash}
        bankAccounts={bankAccounts} chartOfAccounts={chartOfAccounts}
      />
    </div>
  );
}
