import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const AdminProfileContext = createContext(null);

// The sidebar, the top bar and the Settings page all show the same name and photo, so they
// read one shared copy. Settings calls reload() after saving, which is what makes the new
// avatar appear in the chrome straight away instead of on the next refresh.
const DEFAULTS = { display_name: 'Admin', role_title: 'Administrator', photo_data: null };

const initials = (name) =>
  (name || 'Admin').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

export function AdminProfileProvider({ children }) {
  const [profile, setProfile] = useState(DEFAULTS);

  const reload = useCallback(() => supabase
    .from('admin_profile').select('*').eq('id', 1).maybeSingle()
    .then(({ data }) => {
      // A database without the table seeded keeps the defaults rather than blanking the
      // chrome.
      if (data) setProfile({ ...DEFAULTS, ...data });
    }), []);

  useEffect(() => { reload(); }, [reload]);

  const value = useMemo(() => ({
    profile,
    reload,
    name: profile.display_name || DEFAULTS.display_name,
    role: profile.role_title || DEFAULTS.role_title,
    photo: profile.photo_data || null,
    initials: initials(profile.display_name),
  }), [profile, reload]);

  return <AdminProfileContext.Provider value={value}>{children}</AdminProfileContext.Provider>;
}

const FALLBACK = {
  profile: DEFAULTS, reload: () => {},
  name: DEFAULTS.display_name, role: DEFAULTS.role_title, photo: null,
  initials: initials(DEFAULTS.display_name),
};

export function useAdminProfile() {
  return useContext(AdminProfileContext) ?? FALLBACK;
}
