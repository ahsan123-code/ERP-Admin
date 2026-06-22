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

  // Optimistically remove from the list, then delete from the DB so it stays gone
  // after a refresh. If the DB delete fails, put the item back and report the error.
  const removeItem = async (id) => {
    const prevItems = items;
    setItems(prev => prev.filter(i => i.id !== id));
    const { error } = await mastersDb.deleteProductCatalogueItem(id);
    if (error) {
      setItems(prevItems);
      return { error };
    }
    return { error: null };
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
