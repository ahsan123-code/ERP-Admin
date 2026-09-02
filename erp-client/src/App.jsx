import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Shell from './components/layout/Shell';
import ErrorBoundary from './components/shared/ErrorBoundary';
import { ToastProvider } from './components/shared/Toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { CompanyProvider } from './context/CompanyContext';
import { DataScopeProvider } from './context/DataScopeContext';
import { CatalogueProvider } from './context/CatalogueContext';
import { CustomerProvider } from './context/CustomerContext';
import { FiscalYearProvider } from './context/FiscalYearContext';
import { AdminProfileProvider } from './context/AdminProfileContext';
import { EmployeeSectionsProvider } from './context/EmployeeSectionsContext';
import Login from './pages/Login/Login';

import Dashboard  from './pages/Dashboard/Dashboard';
import Inventory  from './pages/Inventory/Inventory';
import Procurement from './pages/Procurement/Procurement';
import Production  from './pages/Production/Production';
import Sales       from './pages/Sales/Sales';
import Invoicing   from './pages/Invoicing/Invoicing';
import ExpenseAccounts from './pages/ExpenseAccounts/ExpenseAccounts';
import Settings from './pages/Settings/Settings';
import ManageData from './pages/ManageData/ManageData';
import Finance     from './pages/Finance/Finance';
import HR          from './pages/HR/HR';
import Reports     from './pages/Reports/Reports';
import Help        from './pages/Help/Help';

function PageWrap({ children }) {
  return <ErrorBoundary page>{children}</ErrorBoundary>;
}

function AppRoutes() {
  const { isLoggedIn, ready, login } = useAuth();

  // Restoring a Supabase session is asynchronous. Rendering the login screen before it
  // resolves would flash it on every reload for someone already signed in, so nothing is
  // drawn until the answer is known — it takes a moment, not a visible pause.
  if (!ready) return null;

  if (!isLoggedIn) {
    return <Login onLogin={login} />;
  }

  return (
    <BrowserRouter>
      <ToastProvider>
        <ErrorBoundary page>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<PageWrap><Dashboard /></PageWrap>} />
              <Route path="dashboard"   element={<PageWrap><Dashboard /></PageWrap>} />
              <Route path="dashboard/*" element={<PageWrap><Dashboard /></PageWrap>} />

              <Route path="inventory"   element={<PageWrap><Inventory /></PageWrap>} />
              <Route path="inventory/*" element={<PageWrap><Inventory /></PageWrap>} />

              <Route path="procurement"   element={<PageWrap><Procurement /></PageWrap>} />
              <Route path="procurement/*" element={<PageWrap><Procurement /></PageWrap>} />

              <Route path="production"   element={<PageWrap><Production /></PageWrap>} />
              <Route path="production/*" element={<PageWrap><Production /></PageWrap>} />

              <Route path="sales"   element={<PageWrap><Sales /></PageWrap>} />
              <Route path="sales/*" element={<PageWrap><Sales /></PageWrap>} />

              <Route path="invoicing"   element={<PageWrap><Invoicing /></PageWrap>} />
              <Route path="invoicing/*" element={<PageWrap><Invoicing /></PageWrap>} />

              <Route path="expense-accounts" element={<PageWrap><ExpenseAccounts /></PageWrap>} />

              <Route path="finance"   element={<PageWrap><Finance /></PageWrap>} />
              <Route path="finance/*" element={<PageWrap><Finance /></PageWrap>} />

              <Route path="hr"   element={<PageWrap><HR /></PageWrap>} />
              <Route path="hr/*" element={<PageWrap><HR /></PageWrap>} />

              <Route path="reports"   element={<PageWrap><Reports /></PageWrap>} />
              <Route path="reports/*" element={<PageWrap><Reports /></PageWrap>} />

              <Route path="settings" element={<PageWrap><Settings /></PageWrap>} />

              <Route path="manage-data" element={<PageWrap><ManageData /></PageWrap>} />

              <Route path="help"   element={<PageWrap><Help /></PageWrap>} />
              <Route path="help/*" element={<PageWrap><Help /></PageWrap>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AdminProfileProvider>
          <CompanyProvider>
            {/* Inside CompanyProvider: the cutoff is per company, so the scope has to
                know which branch is selected. */}
            <DataScopeProvider>
              <FiscalYearProvider>
                <CatalogueProvider>
                  <CustomerProvider>
                    <EmployeeSectionsProvider>
                      <AppRoutes />
                    </EmployeeSectionsProvider>
                  </CustomerProvider>
                </CatalogueProvider>
              </FiscalYearProvider>
            </DataScopeProvider>
          </CompanyProvider>
        </AdminProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
