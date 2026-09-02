import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useCompany } from './CompanyContext';
import { SCOPE_RECENT, SCOPE_ALL, cutoffFor, hasArchive } from '../lib/dataScope';

// Whether the everyday screens show the archived years or leave them in Manage Data.
//
// Deliberately NOT built on FiscalYearContext, though that context already holds a
// from/to pair and nothing consumes it. They answer different questions: a fiscal year
// is one twelve-month window a user picks to look at, while this is a permanent floor
// under every list. Driving the registers off the fiscal year would collapse Sales to a
// single year, which is a much larger change than was asked for and would take away
// "show me the last few years" entirely.
const DataScopeContext = createContext(null);

const STORAGE_KEY = 'erp.dataScope';

// Restored during the first render, like CompanyContext does with the branch, so the
// app reopens the way it was left rather than flashing the default and refetching.
const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === SCOPE_ALL ? SCOPE_ALL : SCOPE_RECENT;
  } catch { return SCOPE_RECENT; }
};

export function DataScopeProvider({ children }) {
  const { companyId } = useCompany();
  const [mode, setModeState] = useState(readStored);

  const setMode = useCallback((next) => {
    const value = next === SCOPE_ALL ? SCOPE_ALL : SCOPE_RECENT;
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* this session only */ }
    setModeState(value);
  }, []);

  // A company with no archive has nothing to reveal, so leaving the toggle on while
  // switching to Shop #58 would show a banner about years that do not exist. The scope
  // still reports the stored mode; it is applyScope that no-ops on a null cutoff.
  const companyHasArchive = hasArchive(companyId);

  // What db.js readers receive. Kept to two primitives plus the id so useScopedDb can
  // put it in a dependency key without a fresh object defeating the comparison.
  const scope = useMemo(
    () => ({ mode, companyId }),
    [mode, companyId],
  );

  const value = useMemo(
    () => ({
      scope,
      mode,
      setMode,
      hasArchive: companyHasArchive,
      cutoff: cutoffFor(companyId),
      showingAll: mode === SCOPE_ALL,
    }),
    [scope, mode, setMode, companyHasArchive, companyId],
  );

  return <DataScopeContext.Provider value={value}>{children}</DataScopeContext.Provider>;
}

// scope: null means unscoped, which is what a component rendered outside the provider
// should get — all the data, never a silently truncated list.
const FALLBACK = {
  scope: null,
  mode: SCOPE_RECENT,
  setMode: () => {},
  hasArchive: false,
  cutoff: null,
  showingAll: false,
};

export function useDataScope() {
  return useContext(DataScopeContext) ?? FALLBACK;
}
