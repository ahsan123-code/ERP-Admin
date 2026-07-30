import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEY = 'erp.isLoggedIn';

// Read during the initial render rather than in an effect: restoring the session from an
// effect would render the login screen first and flash it away on every reload.
// localStorage can throw when storage is blocked, so failures fall back to a
// session-only login instead of breaking the app.
const readStored = () => {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; }
  catch { return false; }
};

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(readStored);

  const login = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* stays logged in for this tab only */ }
    setIsLoggedIn(true);
  }, []);

  const logout = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing persisted to clear */ }
    setIsLoggedIn(false);
  }, []);

  const value = useMemo(() => ({ isLoggedIn, login, logout }), [isLoggedIn, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const FALLBACK = { isLoggedIn: false, login: () => {}, logout: () => {} };
export const useAuth = () => useContext(AuthContext) ?? FALLBACK;
