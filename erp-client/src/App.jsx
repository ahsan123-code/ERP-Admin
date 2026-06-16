import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Shell from './components/layout/Shell';
import ErrorBoundary from './components/shared/ErrorBoundary';
import { ToastProvider } from './components/shared/Toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { CompanyProvider } from './context/CompanyContext';
import { CatalogueProvider } from './context/CatalogueContext';
import Login from './pages/Login/Login';

import Dashboard  from './pages/Dashboard/Dashboard';
import Inventory  from './pages/Inventory/Inventory';
import Procurement from './pages/Procurement/Procurement';
import Production  from './pages/Production/Production';
import Sales       from './pages/Sales/Sales';
import Invoicing   from './pages/Invoicing/Invoicing';
import Finance     from './pages/Finance/Finance';
import HR          from './pages/HR/HR';
import Reports     from './pages/Reports/Reports';
import Help        from './pages/Help/Help';

function PageWrap({ children }) {
  return <ErrorBoundary page>{children}</ErrorBoundary>;
}

function AppRoutes() {
  const { isLoggedIn, login } = useAuth();

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

              <Route path="finance"   element={<PageWrap><Finance /></PageWrap>} />
              <Route path="finance/*" element={<PageWrap><Finance /></PageWrap>} />

              <Route path="hr"   element={<PageWrap><HR /></PageWrap>} />
              <Route path="hr/*" element={<PageWrap><HR /></PageWrap>} />

              <Route path="reports"   element={<PageWrap><Reports /></PageWrap>} />
              <Route path="reports/*" element={<PageWrap><Reports /></PageWrap>} />

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
        <CompanyProvider>
          <CatalogueProvider>
            <AppRoutes />
          </CatalogueProvider>
        </CompanyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
