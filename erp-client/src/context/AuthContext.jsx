import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// Sign-in used to be a boolean in localStorage, set by comparing a password that shipped
// inside the JavaScript bundle. Anyone could read that password from the page source, and
// anyone could grant themselves access by writing the key by hand.
//
// The session now comes from Supabase Auth: the password is checked on Supabase's servers
// against a hash, and the browser holds a signed token that expires and refreshes itself.
// supabase-js persists and restores it, so there is nothing left for this file to store.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  // Restoring a session is asynchronous, so the first render cannot yet know whether anyone
  // is signed in. Routing on that unknown would flash the login screen on every reload for
  // a signed-in user — the very thing the old synchronous read existed to avoid — so the
  // router waits for `ready` instead.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setReady(true);
    });

    // Fires on sign-in, sign-out and every token refresh, so a session that expires while
    // the app is open returns the user to the login screen rather than leaving them on a
    // page whose queries have quietly begun to fail.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const email = session?.user?.email;
    if (!email) return { error: { message: 'You are not signed in.' } };

    // updateUser does not ask for the current password, so it is verified here first —
    // without this, anyone reaching an unattended screen could take the account over.
    const { error: checkErr } = await supabase.auth.signInWithPassword({
      email, password: currentPassword,
    });
    if (checkErr) return { error: { message: 'Your current password is not correct.' } };

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  }, [session]);

  const value = useMemo(() => ({
    isLoggedIn: !!session,
    ready,
    email: session?.user?.email ?? null,
    login,
    logout,
    changePassword,
  }), [session, ready, login, logout, changePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const FALLBACK = {
  isLoggedIn: false, ready: true, email: null,
  login: async () => ({ error: { message: 'Authentication is unavailable.' } }),
  logout: async () => {},
  changePassword: async () => ({ error: { message: 'Authentication is unavailable.' } }),
};

export const useAuth = () => useContext(AuthContext) ?? FALLBACK;
