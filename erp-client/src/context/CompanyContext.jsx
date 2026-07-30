import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const CompanyContext = createContext(null);

const STORAGE_KEY = 'erp.companyId';
const DEFAULT_ID = 1;

// Restored during the initial render so the app reopens on the branch you were last
// using. Without this every reload silently dropped you back to Shop #41, which is
// easy to miss when the page you land on looks the same either way.
const readStored = () => {
  try {
    const id = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    return Number.isInteger(id) && id > 0 ? id : DEFAULT_ID;
  } catch { return DEFAULT_ID; }
};

export function CompanyProvider({ children }) {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyIdState] = useState(readStored);

  useEffect(() => {
    supabase.from('companies').select('id, name').order('id')
      .then(({ data }) => { if (data?.length) setCompanies(data); });
  }, []);

  const setCompanyId = useCallback((id) => {
    const next = parseInt(id, 10) || DEFAULT_ID;
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* this session only */ }
    setCompanyIdState(next);
  }, []);

  const value = useMemo(
    () => ({ companies, companyId, setCompanyId }),
    [companies, companyId, setCompanyId],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

const FALLBACK = { companies: [], companyId: DEFAULT_ID, setCompanyId: () => {} };

export function useCompany() {
  return useContext(CompanyContext) ?? FALLBACK;
}
