import { createContext, useContext, useState, useEffect } from 'react';
import { mastersDb } from '../lib/db';

const CatalogueContext = createContext(null);

export function CatalogueProvider({ children }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    mastersDb.getCustomCatalogueItems().then(({ data }) => {
      if (data) setItems(data);
    });
  }, []);

  const addItem = (item) => {
    if (item) setItems(prev => [item, ...prev]);
  };

  const removeItem = (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  return (
    <CatalogueContext.Provider value={{ items, addItem, removeItem }}>
      {children}
    </CatalogueContext.Provider>
  );
}

const FALLBACK = { items: [], addItem: () => {}, removeItem: () => {} };

export function useCatalogue() {
  return useContext(CatalogueContext) ?? FALLBACK;
}
