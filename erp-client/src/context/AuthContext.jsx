import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  return (
    <AuthContext.Provider value={{ isLoggedIn, login: () => setIsLoggedIn(true), logout: () => setIsLoggedIn(false) }}>
      {children}
    </AuthContext.Provider>
  );
}

const FALLBACK = { isLoggedIn: false, login: () => {}, logout: () => {} };
export const useAuth = () => useContext(AuthContext) ?? FALLBACK;
