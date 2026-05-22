import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const CompanyContext = createContext(null);

export function CompanyProvider({ children }) {
  const [companies, setCompanies]   = useState([]);
  const [companyId, setCompanyId]   = useState(1);

  useEffect(() => {
    supabase.from('companies').select('id, name').order('id')
      .then(({ data }) => { if (data?.length) setCompanies(data); });
  }, []);

  return (
    <CompanyContext.Provider value={{ companies, companyId, setCompanyId }}>
      {children}
    </CompanyContext.Provider>
  );
}

const FALLBACK = { companies: [], companyId: 1, setCompanyId: () => {} };

export function useCompany() {
  return useContext(CompanyContext) ?? FALLBACK;
}
