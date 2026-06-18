import { createContext, useContext, useState, useEffect } from 'react';
import { salesDb } from '../lib/db';

const CustomerContext = createContext(null);

export function CustomerProvider({ children }) {
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    salesDb.getCustomers().then(({ data }) => {
      if (data) setCustomers(data);
    });
  }, []);

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
