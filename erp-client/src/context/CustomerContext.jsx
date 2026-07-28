import { createContext, useContext, useState, useEffect } from 'react';
import { salesDb } from '../lib/db';
import { useCompany } from './CompanyContext';

const CustomerContext = createContext(null);

export function CustomerProvider({ children }) {
  const { companyId } = useCompany();
  const [customers, setCustomers] = useState([]);

  // Refetches whenever the branch changes. This used to load once on mount with
  // no company filter, so the customer list was whichever branch happened to be
  // selected at startup — and never changed when you switched.
  useEffect(() => {
    let cancelled = false;
    salesDb.getCustomers(companyId).then(({ data }) => {
      if (!cancelled) setCustomers(data || []);
    });
    return () => { cancelled = true; };
  }, [companyId]);

  const addCustomer = (customer) => {
    if (customer) setCustomers(prev => [customer, ...prev]);
  };

  const removeCustomer = (id) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
  };

  return (
    <CustomerContext.Provider value={{ customers, addCustomer, removeCustomer }}>
      {children}
    </CustomerContext.Provider>
  );
}

const FALLBACK = { customers: [], addCustomer: () => {}, removeCustomer: () => {} };

export function useCustomers() {
  return useContext(CustomerContext) ?? FALLBACK;
}
