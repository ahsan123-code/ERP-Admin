// Creates (or repairs) the admin account in Supabase Auth.
//
// Sign-in used to be a literal comparison in the browser — Login.jsx checked
// `username === 'admin' && password === 'admin123'` — so the password shipped inside the
// JavaScript bundle for anyone to read, and there was no account to change it on.
//
// This creates a real user. Supabase stores the password hashed and verifies it on its own
// servers; the browser only ever receives a session token. The Settings page can then change
// the password through supabase.auth.updateUser, which is the point of the exercise.
//
// The account is created pre-confirmed, since there is no mailbox behind the address and an
// unconfirmed user cannot sign in.
//
// Run with the password you want:
//   node setup-admin-auth.js --password "your new password"
//
// Run with no password and it keeps the old admin123 so nothing breaks on deploy — change
// it from Settings straight afterwards.
//
// Re-running is safe: an existing account has its password reset to the one given, which is
// also the way back in if the password is ever lost.
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// The username typed at sign-in is mapped onto this address, so staff keep typing "admin"
// while Supabase gets the email address it requires. Login.jsx holds the matching constant.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@alliedsteelcenter.com';

const argPassword = () => {
  const i = process.argv.indexOf('--password');
  return i !== -1 ? process.argv[i + 1] : null;
};

(async () => {
  if (!URL || !SERVICE_KEY) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in server/.env');
    process.exitCode = 1;
    return;
  }

  const password = argPassword() || 'admin123';
  if (!argPassword()) {
    console.warn('No --password given, so the account keeps the old "admin123".');
    console.warn('Change it from Settings the moment you sign in.\n');
  }
  if (password.length < 6) {
    console.error('Supabase requires at least 6 characters.');
    process.exitCode = 1;
    return;
  }

  // The service key bypasses row-level security and can reach the admin API. It lives in
  // server/.env and must never be given to the browser, which holds only the anon key.
  const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) throw new Error(listErr.message);

    const existing = list.users.find(u => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());

    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        password, email_confirm: true,
      });
      if (error) throw new Error(error.message);
      console.log(`Password reset for the existing account ${ADMIN_EMAIL}`);
    } else {
      const { error } = await admin.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password,
        email_confirm: true,                       // no mailbox behind it, so confirm now
        user_metadata: { display_name: 'Admin', role_title: 'Administrator' },
      });
      if (error) throw new Error(error.message);
      console.log(`Created ${ADMIN_EMAIL}`);
    }

    console.log('\nSign in with:');
    console.log(`  username   admin            (or the full address ${ADMIN_EMAIL})`);
    console.log(`  password   ${password}`);
    console.log('\nThe password is stored hashed by Supabase. It is no longer in the app bundle.');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  }
})();
