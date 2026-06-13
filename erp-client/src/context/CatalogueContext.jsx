import { createContext, useContext, useState } from 'react';

const CatalogueContext = createContext(null);

export function CatalogueProvider({ children }) {
  const [items, setItems] = useState([]);

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
