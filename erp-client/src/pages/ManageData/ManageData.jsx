import { useState, useMemo } from 'react';
import { Download, FileDown, Loader2, Database } from 'lucide-react';
import * as XLSX from 'xlsx';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import DataTable from '../../components/shared/DataTable';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import SelectField from '../../components/ui/SelectField';
import { useToast } from '../../components/shared/Toast';
import { archiveDb, ARCHIVE_DATASETS } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';
import { useDataScope } from '../../context/DataScopeContext';
import { SCOPE_ALL, SCOPE_RECENT } from '../../lib/dataScope';
import { sheetName } from '../../utils/xlsx';
import { formatDate, formatCurrency } from '../../utils/format';
import styles from './ManageData.module.css';

// Reads pretty for a person: 2019-06-30 is the first day KEPT, so the archive is
// everything up to the day before it.
const dayBefore = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Columns are derived from the rows rather than hand-specified per table: the archive
// shows ten different datasets and a fixed spec for each would be ten things to keep in
// step with the schema. Internal plumbing columns are dropped, and the few names that
// carry money or dates are formatted the way the live screens format them.
const HIDDEN = new Set(['id', 'company_id']);
const MONEY  = /(amount|total|debit|credit|price|value|balance|subtotal|tax)/i;
const DATEY  = /(date|_at)$/i;

const buildColumns = (rows) => {
  if (!rows.length) return [];
  return Object.keys(rows[0])
    .filter(k => !HIDDEN.has(k))
    .map(key => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      width: MONEY.test(key) ? 130 : DATEY.test(key) ? 110 : 150,
      align: MONEY.test(key) ? 'right' : 'left',
      render: MONEY.test(key)
        ? (v) => (v == null || v === '' ? '—' : <span className={styles.mono}>{formatCurrency(v)}</span>)
        : DATEY.test(key)
          ? (v) => (v ? <span className={styles.date}>{formatDate(v)}</span> : '—')
          : undefined,
    }));
};

// One AOA per dataset: a header row of labels, then the raw values. Raw, not formatted —
// a spreadsheet should receive numbers it can total, not "PKR 1,234.00" strings.
const toSheet = (rows) => {
  if (!rows.length) return XLSX.utils.aoa_to_sheet([['No records']]);
  const keys = Object.keys(rows[0]).filter(k => k !== 'company_id');
  const header = keys.map(k => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
  return XLSX.utils.aoa_to_sheet([header, ...rows.map(r => keys.map(k => r[k] ?? ''))]);
};

export default function ManageData() {
  const toast = useToast();
  const { companyId, companies } = useCompany();
  const { cutoff, hasArchive, setMode, showingAll } = useDataScope();

  const [dataset, setDataset] = useState(ARCHIVE_DATASETS[0].table);
  const [exporting, setExporting] = useState(null);

  const company = companies.find(c => c.id === companyId);
  const companyName = company?.name || `Company ${companyId}`;

  const { data: summary, loading: loadingSummary } = useDb(
    () => archiveDb.getSummary(companyId, cutoff),
    [companyId, cutoff],
  );

  const spec = ARCHIVE_DATASETS.find(d => d.table === dataset) || ARCHIVE_DATASETS[0];

  const { data: rows, loading: loadingRows } = useDb(
    () => (cutoff
      ? archiveDb.getRows(spec.table, companyId, cutoff, spec.date)
      : Promise.resolve({ data: [], error: null })),
    [spec.table, spec.date, companyId, cutoff],
  );

  const columns = useMemo(() => buildColumns(rows || []), [rows]);
  const archivedTotal = (summary || []).reduce((n, s) => n + s.count, 0);

  // Re-fetches every archived row for the dataset rather than exporting what the table
  // happens to be showing — the point of the export is the whole archive.
  const exportOne = async (ds) => {
    setExporting(ds.table);
    try {
      const { data, error } = await archiveDb.getRows(ds.table, companyId, cutoff, ds.date);
      if (error) throw new Error(error.message);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, toSheet(data || []), sheetName(ds.label, new Set()));
      XLSX.writeFile(wb, `Archive ${ds.label} — ${companyName} upto ${dayBefore(cutoff)}.xlsx`);
      toast.success(`${(data || []).length.toLocaleString()} ${ds.label.toLowerCase()} exported.`);
    } catch (err) {
      toast.error(err.message, 'Export Failed');
    } finally {
      setExporting(null);
    }
  };

  const exportAll = async () => {
    setExporting('__all__');
    try {
      const wb = XLSX.utils.book_new();
      const used = new Set();
      let total = 0;
      // Sequential on purpose: ten paged reads at once would open eighty requests, and
      // this runs behind a spinner where a second either way does not matter.
      for (const ds of ARCHIVE_DATASETS) {
        const { data, error } = await archiveDb.getRows(ds.table, companyId, cutoff, ds.date);
        if (error) throw new Error(error.message);
        XLSX.utils.book_append_sheet(wb, toSheet(data || []), sheetName(ds.label, used));
        total += (data || []).length;
      }
      XLSX.writeFile(wb, `Archive — ${companyName} upto ${dayBefore(cutoff)}.xlsx`);
      toast.success(`${total.toLocaleString()} archived records exported across ${ARCHIVE_DATASETS.length} sheets.`);
    } catch (err) {
      toast.error(err.message, 'Export Failed');
    } finally {
      setExporting(null);
    }
  };

  if (!hasArchive) {
    return (
      <>
        <PageHeader title="Manage Data" subtitle="Older records kept out of the everyday screens" />
        <Card>
          <div className={styles.emptyState}>
            <Database size={30} strokeWidth={1.5} />
            <h3>{companyName} has no archived data</h3>
            <p>
              Its books begin in August 2023, well after the {formatDate('2019-06-30')} cut-off,
              so every record it has is already on the normal screens. Switch branch in the top
              bar to see Shop&nbsp;#41&apos;s archive.
            </p>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Manage Data"
        subtitle={`${companyName} — records before ${formatDate(cutoff)} are kept here, out of the everyday screens`}
      />

      <div className={styles.stack}>
        <Card>
          <CardHeader
            title="Archived records"
            subtitle={`Everything dated on or before ${formatDate(dayBefore(cutoff))}. Nothing here has been deleted.`}
            actions={
              <Button
                variant="secondary"
                icon={exporting === '__all__' ? <Loader2 size={15} className={styles.spin} /> : <FileDown size={15} />}
                disabled={Boolean(exporting)}
                onClick={exportAll}
              >
                {exporting === '__all__' ? 'Building workbook…' : 'Export all to Excel'}
              </Button>
            }
          />
          <div className={styles.cardBody}>
            <p className={styles.totalLine}>
              <strong>{loadingSummary ? '…' : archivedTotal.toLocaleString()}</strong> archived
              records across {ARCHIVE_DATASETS.length} datasets
            </p>
            <div className={styles.grid}>
              {(summary || []).map(s => (
                <div key={s.table} className={styles.tile}>
                  <span className={styles.tileLabel}>{s.label}</span>
                  <span className={styles.tileValue}>{s.count.toLocaleString()}</span>
                  <button
                    className={styles.tileBtn}
                    disabled={Boolean(exporting) || s.count === 0}
                    onClick={() => exportOne(s)}
                  >
                    {exporting === s.table
                      ? <Loader2 size={12} className={styles.spin} />
                      : <Download size={12} />}
                    Export
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Show archived years in the main screens"
            subtitle="Affects every list in the app. Balances and reports are unchanged either way — they always read the full history."
          />
          <div className={styles.cardBody}>
            <div className={styles.toggleRow}>
              <button
                className={`${styles.toggle} ${showingAll ? styles.toggleOn : ''}`}
                role="switch"
                aria-checked={showingAll}
                onClick={() => setMode(showingAll ? SCOPE_RECENT : SCOPE_ALL)}
              >
                <span className={styles.knob} />
              </button>
              <div>
                <p className={styles.toggleTitle}>
                  {showingAll ? 'Showing all years' : `Showing ${formatDate(cutoff)} onwards`}
                  <Badge variant={showingAll ? 'warning' : 'info'}>
                    {showingAll ? 'All data' : 'Recent'}
                  </Badge>
                </p>
                <p className={styles.toggleHint}>
                  {showingAll
                    ? `Lists include the ${archivedTotal.toLocaleString()} archived records. Screens will be slower.`
                    : `${archivedTotal.toLocaleString()} older records stay here, out of the way.`}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Browse the archive"
            subtitle="Read only — nothing on this page deletes or edits a record"
            actions={
              <div className={styles.pickerWrap}>
                <SelectField value={dataset} onChange={e => setDataset(e.target.value)}>
                  {ARCHIVE_DATASETS.map(d => (
                    <option key={d.table} value={d.table}>{d.label}</option>
                  ))}
                </SelectField>
              </div>
            }
          />
          <DataTable
            columns={columns.length ? columns : [{ key: 'x', label: '' }]}
            data={rows || []}
            loading={loadingRows}
            keyField={spec.key}
            pageSize={25}
            searchPlaceholder={`Search archived ${spec.label.toLowerCase()}...`}
          />
        </Card>
      </div>
    </>
  );
}
