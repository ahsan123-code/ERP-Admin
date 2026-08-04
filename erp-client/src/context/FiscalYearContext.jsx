import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const FiscalYearContext = createContext(null);

const STORAGE_KEY = 'erp.fiscalYearId';

// A Pakistani fiscal year runs 1 July to 30 June and is named for the year it starts in,
// so 1-Jul-2026 to 30-Jun-2027 is "F-2026-2027".
const fyStartOf = (d) => (d.getMonth() + 1 >= 7 ? d.getFullYear() : d.getFullYear() - 1);

// Restored during the initial render so a reload keeps the year you were working in —
// the same reason CompanyContext restores the branch. localStorage can throw when storage
// is blocked, in which case the choice simply lasts for this session.
const readStored = () => {
  try {
    const id = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch { return null; }
};

export function FiscalYearProvider({ children }) {
  const [fiscalYears, setFiscalYears] = useState([]);
  const [fiscalYearId, setIdState] = useState(readStored);

  const load = useCallback(() => supabase
    .from('fiscal_years')
    .select('id, label, start_date, end_date, is_active')
    .order('start_date', { ascending: false })
    .then(({ data }) => {
      if (!data?.length) return;
      setFiscalYears(data);
      // Fall back to the year the books call current, then to the most recent one. Done
      // here rather than in the initial state because the list is not known until it
      // loads, and a stored id that no longer exists (a year deleted from Settings) must
      // not strand the app on an empty selection.
      setIdState(prev => (prev && data.some(y => y.id === prev))
        ? prev
        : (data.find(y => y.is_active)?.id ?? data[0].id));
    }), []);

  useEffect(() => { load(); }, [load]);

  const setFiscalYearId = useCallback((id) => {
    const next = parseInt(id, 10);
    if (!Number.isInteger(next)) return;
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* this session only */ }
    setIdState(next);
  }, []);

  const fiscalYear = useMemo(
    () => fiscalYears.find(y => y.id === fiscalYearId) ?? null,
    [fiscalYears, fiscalYearId],
  );

  // The year containing today, for screens that want to offer "the current year" without
  // caring which one is selected — and for Settings to suggest the next year each July.
  const currentFyStart = fyStartOf(new Date());

  const value = useMemo(() => ({
    fiscalYears,
    fiscalYear,
    fiscalYearId,
    setFiscalYearId,
    // The selected range, as plain YYYY-MM-DD for date inputs and query filters. Null when
    // the list has not loaded yet, so callers can tell "not ready" from "no range".
    from: fiscalYear?.start_date ?? null,
    to: fiscalYear?.end_date ?? null,
    currentFyStart,
    reloadFiscalYears: load,
  }), [fiscalYears, fiscalYear, fiscalYearId, setFiscalYearId, currentFyStart, load]);

  return <FiscalYearContext.Provider value={value}>{children}</FiscalYearContext.Provider>;
}

const FALLBACK = {
  fiscalYears: [], fiscalYear: null, fiscalYearId: null, setFiscalYearId: () => {},
  from: null, to: null, currentFyStart: fyStartOf(new Date()), reloadFiscalYears: () => {},
};

export function useFiscalYear() {
  return useContext(FiscalYearContext) ?? FALLBACK;
}
