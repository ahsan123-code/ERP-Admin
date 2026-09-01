import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { financeDb, procurementDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { useCustomers } from '../../context/CustomerContext';
import { formatCurrency } from '../../utils/format';
import { bankAccountOptions } from '../../utils/paymentSources';

const today = new Date().toISOString().split('T')[0];

// Party | account | narration | amount | remove. Shared by the header row and the lines
// so the two can never fall out of step.
const ROW_COLS = '2fr 2fr 1.6fr 1fr 32px';

// The fixed "pockets" the money moves through — mapped to the REAL existing cash ledger
// accounts in the chart of accounts (group 11-01-001), not invented ones.
const CASH_POCKETS = [
  { code: '11-01-001-000001', name: 'Cash in Hand' },
  { code: '11-01-001-000002', name: 'Jazz Cash (Maqsood Ahmad)' },
  { code: '11-01-001-000004', name: 'Easypaisa (Maqsood Ahmad)' },
];

const AR = { code: '11-03-001-000001', name: 'Accounts Receivable', type: 'Asset', parent: '11-03-001' };
// The payable control account is 14-01-001-000000 "Trade Creditors", which heads
// the 206 per-vendor accounts under 14-01-001-*. This previously pointed at
// 14-01-001-000001 under the name "Accounts Payable", but that code is a real
// supplier (BASHIR PIPE INDUSTRY) — every vendor payment would have posted to that
// one supplier's balance. No payment had been made through this screen yet, so
// nothing needed repairing, but the next one would have landed there.
const AP = { code: '14-01-001-000000', name: 'Trade Creditors', type: 'Liability', parent: '14-01-001' };

// One row of the voucher: which party, out of which account, how much, and why.
//
// The account sits on the row rather than on the header because a payment run is not
// always one pocket: some vendors are settled from one bank and some from another, and
// that is still one decision the office makes at one time. Rows are addressed by index,
// not by party — the same customer can legitimately appear twice, paid out of two
// different accounts.
const emptyLine = (pocket = '') => ({ party: '', pocket, amount: '', narration: '' });

const EMPTY = { date: today, narration: '' };

// mode: 'cash' = cash/wallet only (PV/RV), 'bank' = bank accounts only (BPV/BRV)
export default function NewPaymentReceiptModal({ open, onClose, onSave, type = 'Receipt', mode = 'cash', bankAccounts = [], chartOfAccounts = [] }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const { customers } = useCustomers();
  const { data: vendors } = useDb(() => procurementDb.getVendors(companyId), [companyId]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [lines, setLines] = useState([emptyLine()]);

  const isReceipt = type === 'Receipt';

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setLines([emptyLine()]);
  }, [open, type]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const setLine = (i, key, value) =>
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));

  // A new row inherits the account the row above used. Most runs are paid out of one
  // account with the odd exception, so carrying it down means the account is picked once
  // and only changed where it actually differs.
  const addLine = () => setLines(prev => [...prev, emptyLine(prev[prev.length - 1]?.pocket ?? '')]);
  const removeLine = (i) => setLines(prev => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  // Pocket dropdown — cash/wallet for PV/RV, bank accounts for BPV/BRV.
  //
  // The bank list comes from the shared builder so a bank reads the same here as in
  // every other picker. The cash list stays local: these three carry the names new
  // ledger accounts are created under below, which is not something to read from the
  // chart when the point is to create the account when it is missing.
  const pocketOptions = mode === 'bank'
    ? bankAccountOptions(bankAccounts, { prefix: 'bank:' })
    : CASH_POCKETS.map(p => ({ value: `cash:${p.code}`, label: p.name }));

  // Expense heads a payment can be made straight to — group 12 of the chart, the same
  // set petty cash and the disburse screens draw on. Not everything paid out settles a
  // customer or vendor balance: rent, utilities, freight and repairs are paid to an
  // expense account directly, and with only parties in this list the only way to record
  // one was to raise it as petty cash or key a manual journal.
  //
  // Payments only. On a receipt, money coming in against an expense head would be a
  // refund — a different entry that belongs with income accounts, not this list.
  const expenseAccounts = useMemo(() => (isReceipt
    ? []
    : (chartOfAccounts || []).filter(a => a.account_code?.slice(0, 2) === '12')),
  [isReceipt, chartOfAccounts]);

  // Dasti parties — money handed over outside the customer and vendor ledgers (committee
  // and hawala holders, contractors, staff lent cash personally). They sit under
  // 11-01-006 and belong to neither list, so without them here there was no way to record
  // handing someone cash by hand at all.
  //
  // Offered on receipts as well as payments, unlike expense heads: a dasti balance runs
  // both ways by nature — cash goes out by hand and comes back the same way — and money
  // returned that could not be recorded would leave the balance permanently overstated.
  const dastiAccounts = useMemo(
    () => financeDb.dastiPartyAccounts(chartOfAccounts), [chartOfAccounts]);

  // Party dropdown = customers + vendors + dasti parties + (on payments) expense
  // accounts. The prefix on each value decides what the line posts against: AR
  // sub-ledger, AP control, or the account itself.
  //
  // One row per party, not one per record. 119 parties trade both ways — we sell to them
  // and buy from them — so they hold a customer record and a vendor record, and listing
  // both put the same person in the list twice under the same name, told apart only by a
  // tag. Picking between two identical-looking rows is a coin toss, and the wrong one
  // posts to the wrong side of the ledger. 30 more are the same name duplicated inside
  // one table, which is simply bad data and should never have been offered twice either.
  //
  // Which side a merged party posts to follows the voucher: money going out settles what
  // we owe them, money coming in settles what they owe us. That is the ordinary case for
  // both directions, and the hint on the row says which side it will use so it is never a
  // silent choice.
  const partyOptions = useMemo(() => {
    const byName = new Map();
    const add = (name, side, option) => {
      const key = String(name || '').trim().toLowerCase();
      if (!key) return;
      const cur = byName.get(key);
      if (!cur) { byName.set(key, { sides: { [side]: option }, label: name }); return; }
      // First record of a side wins; a repeat of the same side is a duplicate row.
      if (!cur.sides[side]) cur.sides[side] = option;
    };

    (customers || []).forEach(c => add(c.name, 'cust', { value: `cust:${c.id}`, label: c.name }));
    (vendors   || []).forEach(v => add(v.name, 'vend', { value: `vend:${v.id}`, label: v.name }));

    // On a payment the vendor side is the one being settled; on a receipt, the customer.
    const preferred = isReceipt ? ['cust', 'vend'] : ['vend', 'cust'];

    const parties = [...byName.values()].map(({ sides, label }) => {
      const side = preferred.find(k => sides[k]);
      const both = sides.cust && sides.vend;
      return {
        ...sides[side],
        label,
        // Kept short. This sits beside the name in a narrow column, and a long tag costs
        // the name the width it needs to stay readable.
        hint: both ? (side === 'vend' ? 'Vendor +' : 'Customer +')
                   : (side === 'vend' ? 'Vendor' : 'Customer'),
      };
    }).sort((a, b) => a.label.localeCompare(b.label));

    return [
      ...parties,
      ...dastiAccounts.map(a => ({
        value: `dasti:${a.account_id}`,
        label: a.account_name,
        hint: 'Dasti',
        search: a.account_code,
      })),
      ...expenseAccounts.map(a => ({
        value: `exp:${a.account_id}`,
        label: a.account_name,
        hint: 'Expense',
        search: a.account_code,
      })),
    ];
  }, [customers, vendors, dastiAccounts, expenseAccounts, isReceipt]);

  const partyByValue  = new Map(partyOptions.map(o => [o.value, o]));
  const pocketByValue = new Map(pocketOptions.map(o => [o.value, o]));

  const pocketLabel = (value) => {
    const o = pocketByValue.get(value);
    return o ? [o.label, o.hint].filter(Boolean).join(' - ') : value;
  };

  // A row counts as started once anything has been touched on it, and every started row
  // has to be complete before the voucher posts. A trailing row left entirely blank is
  // just the next empty line, not an error.
  const startedLines = lines.filter(l => l.party || l.pocket || String(l.amount).trim());
  const isComplete = (l) => Boolean(l.party) && Boolean(l.pocket) && (parseFloat(l.amount) || 0) > 0;

  const filledLines = startedLines
    .filter(isComplete)
    .map(l => ({ ...l, amountNum: parseFloat(l.amount) || 0 }));
  const total = filledLines.reduce((s, l) => s + l.amountNum, 0);

  // What each account contributes, in the order the accounts first appear down the rows.
  // Two rows paid out of the same bank are one leg on the voucher carrying their sum,
  // not two legs against the same account.
  const pocketTotals = filledLines.reduce((map, l) => {
    map.set(l.pocket, (map.get(l.pocket) || 0) + l.amountNum);
    return map;
  }, new Map());

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!startedLines.length) {
      toast.error(isReceipt ? 'Add a line saying who paid, and into which account.' : 'Add a line saying who was paid, and out of which account.');
      return;
    }
    // Point at the row and say what is missing from it. "Check your lines" is no help
    // once a dozen are on screen.
    const firstBad = startedLines.findIndex(l => !isComplete(l));
    if (firstBad !== -1) {
      const l = startedLines[firstBad];
      const where = `Line ${firstBad + 1}`;
      const what = !l.party
        ? (isReceipt ? 'needs a party.' : 'needs a party or expense account.')
        : !l.pocket
          ? (isReceipt ? 'needs the account the money came into.' : 'needs the account it was paid from.')
          : 'needs an amount.';
      toast.error(`${where} ${what}`);
      return;
    }
    setSaving(true);
    try {
      // One ledger account per distinct pocket, resolved once however many rows use it
      // (auto-created if missing). Distinct pockets are distinct account codes, so these
      // cannot race each other.
      const pockets = await Promise.all([...pocketTotals].map(async ([value, amount]) => {
        let account;
        if (value.startsWith('cash:')) {
          const code = value.slice(5);
          const def = CASH_POCKETS.find(p => p.code === code);
          account = await financeDb.ensureLedgerAccount({ code, name: def.name, type: 'Asset', parent: '11-01-001', companyId });
        } else {
          const bankId = value.slice(5);
          const bank = bankAccounts.find(b => b.account_id === bankId);
          account = financeDb.bankCodeToAccount(chartOfAccounts, bankId, bankAccounts) || await financeDb.ensureBankLedgerAccount(bank, companyId);
        }
        if (!account) {
          throw new Error(`Could not resolve a ledger account for ${pocketLabel(value)}.`);
        }
        return { account, amount };
      }));

      // Resolve the control accounts once (AR for customers, AP for vendors) rather than
      // per line — a voucher with ten customer lines still only needs AR looked up once.
      const needsAR = filledLines.some(l => l.party.startsWith('cust:'));
      const needsAP = filledLines.some(l => l.party.startsWith('vend:'));
      const [arAccount, apAccount] = await Promise.all([
        needsAR ? financeDb.ensureLedgerAccount({ ...AR, companyId }) : null,
        needsAP ? financeDb.ensureLedgerAccount({ ...AP, companyId }) : null,
      ]);
      if ((needsAR && !arAccount) || (needsAP && !apAccount)) {
        throw new Error('Could not resolve the receivable/payable control account.');
      }

      // A customer line posts to that customer's own sub-ledger account, not to the shared
      // AR control account — the Customer Ledger and Customer Balance reports read the
      // sub-ledgers, so a receipt booked against the control account never reaches the
      // customer it settles. AR stays the fallback for a customer with no code of its own.
      // Vendors keep the control account: there is no per-vendor sub-ledger to post to.
      const parties = await Promise.all(filledLines.map(async (l) => {
        const sep  = l.party.indexOf(':');
        const kind = l.party.slice(0, sep);
        const id   = l.party.slice(sep + 1);
        const label = partyByValue.get(l.party)?.label ?? l.party;

        // Expense heads and dasti parties both post to their own chart account — each is
        // already in the chart, so there is nothing to resolve or create. The leg's
        // direction is the voucher's, which is what makes a dasti account work both
        // ways: a payment debits the party (cash handed out, they owe it) and a receipt
        // credits them (it came back), exactly as the ledger has always recorded it.
        const directAccount = (kind === 'exp' || kind === 'dasti')
          ? (chartOfAccounts || []).find(a => a.account_id === id)
          : null;
        if ((kind === 'exp' || kind === 'dasti') && !directAccount) {
          throw new Error(`Could not resolve the ${kind === 'dasti' ? 'dasti' : 'expense'} account for "${label}".`);
        }

        const customer = kind === 'cust'
          ? (customers || []).find(c => String(c.id) === id) || null
          : null;
        return {
          controlAccount: directAccount
            ? directAccount
            : kind === 'vend'
              ? apAccount
              : await financeDb.customerLedgerAccount({ customer, companyId, fallback: arAccount }),
          name: label,
          amount: l.amountNum,
          narration: l.narration.trim() || null,
        };
      }));

      const { voucherId } = await financeDb.addPaymentReceipt({
        type,
        date: form.date,
        pockets,
        parties,
        narration: form.narration.trim(),
        companyId,
      });

      toast.success(
        `${isReceipt ? 'Receipt' : 'Payment'} voucher ${voucherId} posted — ${formatCurrency(total)} across ${parties.length} ${parties.length === 1 ? 'line' : 'lines'}.`,
        isReceipt ? 'Receipt Recorded' : 'Payment Recorded',
      );
      onSave();
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  // Live double-entry preview: one leg per filled row, and one cash/bank leg per account
  // used, each carrying that account's own subtotal. Showing the money side split the way
  // it will actually post is the point — it is how you catch a row left on the wrong bank
  // before the voucher is written rather than afterwards.
  const preview = filledLines.length
    ? (() => {
      const partyLegs = filledLines.map(l => ({
        name: partyByValue.get(l.party)?.label || '—',
        dr: isReceipt ? 0 : l.amountNum,
        cr: isReceipt ? l.amountNum : 0,
      }));
      const pocketLegs = [...pocketTotals].map(([value, amount]) => ({
        name: pocketLabel(value),
        dr: isReceipt ? amount : 0,
        cr: isReceipt ? 0 : amount,
      }));
      return isReceipt ? [...pocketLegs, ...partyLegs] : [...partyLegs, ...pocketLegs];
    })()
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        mode === 'bank'
          ? (isReceipt ? 'Bank Receipt Voucher (BRV)' : 'Bank Payment Voucher (BPV)')
          : (isReceipt ? 'New Receipt Voucher (RV)' : 'New Payment Voucher (PV)')
      }
      subtitle={
        mode === 'bank'
          ? (isReceipt ? 'Record money received into a bank account' : 'Record money paid out of a bank account')
          : (isReceipt ? 'Record money received into a cash/bank account' : 'Record money paid out of a cash/bank account')
      }
      size="lg"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving || !filledLines.length}>
            {saving
              ? 'Posting…'
              : filledLines.length
                ? `${isReceipt ? 'Post Receipt' : 'Post Payment'} — ${formatCurrency(total)}`
                : (isReceipt ? 'Post Receipt' : 'Post Payment')}
          </Button>
        </div>
      }
    >
      <form className="fg" onSubmit={handleSubmit}>
        <Input label="Date *" type="date" value={form.date} onChange={set('date')} required />
        <div />
        <div className="ff">
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
            {isReceipt
              ? 'One line per party — and the account their money came into'
              : `One line per party or expense head — and the account it was paid from (${expenseAccounts.length} expense accounts available)`}
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: 8, padding: '0 2px 6px', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            <span>{isReceipt ? 'Party' : 'Party / Expense Account'}</span>
            <span>{mode === 'bank' ? 'Bank Account' : 'Cash Account'}</span>
            <span>Narration</span>
            <span style={{ textAlign: 'right' }}>Amount</span>
            <span />
          </div>

          {lines.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <SearchableSelect
                placeholder={isReceipt ? 'Search customer or vendor…' : 'Search customer, vendor or expense account…'}
                emptyText={isReceipt ? 'No parties found' : 'No parties or expense accounts found'}
                value={l.party}
                onChange={(val) => setLine(i, 'party', val)}
                options={partyOptions}
              />
              <SearchableSelect
                placeholder={mode === 'bank' ? 'Search bank…' : 'Search cash account…'}
                emptyText={mode === 'bank' ? 'No bank accounts found' : 'No cash accounts found'}
                value={l.pocket}
                onChange={(val) => setLine(i, 'pocket', val)}
                options={pocketOptions}
              />
              <Input placeholder="Invoice / reason" value={l.narration} onChange={e => setLine(i, 'narration', e.target.value)} />
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={l.amount} onChange={e => setLine(i, 'amount', e.target.value)} />
              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={lines.length <= 1}
                title={lines.length <= 1 ? 'A voucher needs at least one line' : 'Remove line'}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, borderRadius: 6, cursor: lines.length <= 1 ? 'not-allowed' : 'pointer',
                  border: '1px solid var(--border-subtle)', background: 'transparent',
                  color: lines.length <= 1 ? 'var(--text-tertiary)' : 'var(--red, #ef4444)',
                  opacity: lines.length <= 1 ? 0.4 : 1,
                }}
              >
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>
          ))}

          <Button type="button" variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addLine} style={{ marginTop: 2 }}>
            Add Line
          </Button>

          {/* What each account will be credited (or debited) once the rows are grouped.
              Only worth showing when more than one is in play — with a single account it
              just repeats the total below. */}
          {pocketTotals.size > 1 && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                {isReceipt ? 'Into' : 'Out of'} {pocketTotals.size} accounts
              </div>
              {[...pocketTotals].map(([value, amount]) => (
                <div key={value} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, padding: '2px 0' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{pocketLabel(value)}</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 32px', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', fontSize: 13, fontWeight: 700 }}>
            <span style={{ color: 'var(--text-secondary)' }}>{isReceipt ? 'Total Received' : 'Total Paid'}</span>
            <span />
            <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(total)}</span>
            <span />
          </div>
        </div>

        <div className="ff">
          <Input label="Narration" value={form.narration} onChange={set('narration')} placeholder="Applies to the whole voucher — lines can have their own" />
        </div>

        {preview && (
          <div className="ff" style={{ marginTop: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
              Posts as (double-entry {isReceipt ? 'Receipt' : 'Payment'} voucher)
            </label>
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '8px 12px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <span>Account</span><span style={{ textAlign: 'right' }}>Debit</span><span style={{ textAlign: 'right' }}>Credit</span>
              </div>
              {preview.map((leg, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '8px 12px', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-primary)' }}>{leg.name}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: leg.dr ? 'var(--green)' : 'var(--text-tertiary)' }}>{leg.dr ? formatCurrency(leg.dr) : '—'}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: leg.cr ? 'var(--orange)' : 'var(--text-tertiary)' }}>{leg.cr ? formatCurrency(leg.cr) : '—'}</span>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '8px 12px', fontSize: 13, fontWeight: 700, background: 'var(--bg-tertiary)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Totals (balanced)</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(total)}</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
