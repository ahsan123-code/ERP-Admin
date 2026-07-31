import { createContext, useContext, useState, useEffect } from 'react';
import { salesDb } from '../lib/db';
import { useCompany } from './CompanyContext';

const CustomerContext = createContext(null);

export function CustomerProvider({ children }) {
  const { companyId } = useCompany();
  // The branch the held list belongs to is stored alongside it, so `loading` is
  // derived rather than toggled. Setting a loading flag at the top of the effect
  // would be a synchronous setState in an effect body — an extra render pass, and
  // it leaves a window where the previous branch's customers are shown as current.
  const [state, setState] = useState({ list: [], loadedFor: null });
  const loading = state.loadedFor !== companyId;

  // Refetches whenever the branch changes. This used to load once on mount with
  // no company filter, so the customer list was whichever branch happened to be
  // selected at startup — and never changed when you switched.
  useEffect(() => {
    let cancelled = false;
    salesDb.getCustomers(companyId).then(({ data }) => {
      if (!cancelled) setState({ list: data || [], loadedFor: companyId });
    });
    return () => { cancelled = true; };
  }, [companyId]);

  const customers = state.list;
  const setCustomers = (fn) =>
    setState(prev => ({ ...prev, list: typeof fn === 'function' ? fn(prev.list) : fn }));

  const addCustomer = (customer) => {
    if (customer) setCustomers(prev => [customer, ...prev]);
  };

  const removeCustomer = (id) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
  };

  return (
    <CustomerContext.Provider value={{ customers, loading, addCustomer, removeCustomer }}>
      {children}
    </CustomerContext.Provider>
  );
}

const FALLBACK = { customers: [], loading: false, addCustomer: () => {}, removeCustomer: () => {} };

export function useCustomers() {
  return useContext(CustomerContext) ?? FALLBACK;
}
