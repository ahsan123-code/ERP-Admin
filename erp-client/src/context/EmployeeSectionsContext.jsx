import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { mastersDb } from '../lib/db';
import { EMPLOYEE_SECTIONS } from '../data/hr';

// The sections staff are posted to. Held in context rather than fetched per form so a
// section added in Settings shows up in the Add and Edit employee dropdowns straight away,
// without a page reload — the same reason fiscal years live in a context.
const EmployeeSectionsContext = createContext(null);

export function EmployeeSectionsProvider({ children }) {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);

  // Awaitable, for Settings to call after adding or removing one so the dropdowns update
  // without a reload.
  const reload = useCallback(async () => {
    const { data } = await mastersDb.getEmployeeSections();
    if (data) setSections(data);
    return data;
  }, []);

  // Written as a promise chain rather than calling reload(), so nothing sets state
  // synchronously in the effect body — the shape the other contexts here use.
  useEffect(() => {
    mastersDb.getEmployeeSections()
      .then(({ data }) => { if (data) setSections(data); })
      .finally(() => setLoading(false));
  }, []);

  // Just the names, which is what a <select> needs. Falls back to the built-in list only
  // while the first fetch is in flight or if the table is unreachable, so the forms are
  // never left with an empty dropdown.
  const names = sections.length > 0 ? sections.map(s => s.name) : EMPLOYEE_SECTIONS;

  return (
    <EmployeeSectionsContext.Provider value={{ sections, names, loading, reload }}>
      {children}
    </EmployeeSectionsContext.Provider>
  );
}

const FALLBACK = {
  sections: [],
  names: EMPLOYEE_SECTIONS,
  loading: false,
  reload: async () => [],
};

export function useEmployeeSections() {
  return useContext(EmployeeSectionsContext) ?? FALLBACK;
}
