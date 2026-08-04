import { useState, useEffect, useRef } from 'react';
import { User, Lock, LogIn, Eye, EyeOff } from 'lucide-react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import RobotPeek from './RobotPeek';
import styles from './Login.module.css';

// Matches ADMIN_EMAIL in server/setup-admin-auth.js, which created the account.
const ADMIN_DOMAIN = 'alliedsteelcenter.com';

// The wordmark, poured rather than printed: each line arrives white-hot and cools to steel.
// Two lines so the name holds its weight in the column rather than shrinking to fit one.
const BRAND = ['Allied Steel', 'Center'];

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // 'logo' → show logo, 'video' → show video
  const [phase, setPhase] = useState('logo');
  const videoRef = useRef(null);

  useEffect(() => {
    // Logo shows for 3.5s then switch to video
    const t = setTimeout(() => setPhase('video'), 3500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase === 'video' && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [phase]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    setLoading(true);
    // Supabase identifies an account by email, while staff are used to typing "admin".
    // A value with no "@" is treated as the local part of the admin address, so both work.
    const email = username.includes('@') ? username.trim() : `${username.trim()}@${ADMIN_DOMAIN}`;
    const { error: authError } = await onLogin(email, password);
    if (authError) {
      // Supabase answers "Invalid login credentials" whether it was the address or the
      // password, and repeating that distinction back would help someone guessing.
      setError(/invalid login/i.test(authError.message)
        ? 'Invalid username or password.'
        : authError.message);
      setLoading(false);
    }
    // On success the auth state change swaps this screen out, so nothing to do here.
  };

  return (
    <div className={styles.page}>
      {/* ── Left panel: logo → video ── */}
      <div className={styles.leftPanel}>
        {/* Logo phase */}
        <div className={`${styles.logoPhase} ${phase === 'logo' ? styles.phaseVisible : styles.phaseHidden}`}>
          <img src="/Logo.jpeg" alt="Allied Steel Center" className={styles.logoImg} />
        </div>

        {/* Video phase */}
        <div className={`${styles.videoPhase} ${phase === 'video' ? styles.phaseVisible : styles.phaseHidden}`}>
          <video
            ref={videoRef}
            className={styles.videoEl}
            src="/Video.mp4"
            muted
            loop
            playsInline
            preload="auto"
          />
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className={styles.rightPanel}>
        <div className={styles.dotGrid} />

        <div className={styles.formCard}>
          <div className={styles.formHead}>
            <h1 className={styles.brand}>
              {BRAND.map((line, li) => (
                <span key={li} className={styles.brandLine} style={{ '--line': li }}>
                  {/* The same word laid over itself, glowing, and fading as the metal
                      loses its heat. Hidden from screen readers so the name is read once. */}
                  <span className={styles.heat} aria-hidden="true">{line}</span>
                  {line}
                </span>
              ))}
            </h1>
            <p className={styles.formSub}>Admin Panel</p>
          </div>

          {/* This wrapper is what the robot measures itself against, so it stands on the top
              edge of the box rather than being placed against the wordmark above it. */}
          <div className={styles.boxWrap}>
            {/* It commiserates when a sign-in is refused, and cheers up again the moment the
                message clears — which it does on the next attempt. */}
            <RobotPeek sad={!!error} />

            <div className={styles.formBox}>
              <form className={styles.form} onSubmit={handleSubmit}>
            <Input
              label="Username"
              placeholder="Enter your username"
              icon={<User size={16} strokeWidth={1.75} />}
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
            />

            <div className={styles.pwWrap}>
              <Input
                label="Password"
                placeholder="Enter your password"
                type={showPw ? 'text' : 'password'}
                icon={<Lock size={16} strokeWidth={1.75} />}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPw(v => !v)}
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
              </button>
            </div>

            {error && <div className={styles.errBox}>{error}</div>}

            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={loading}
              icon={loading ? null : <LogIn size={16} strokeWidth={1.75} />}
            >
                  {loading ? <span className={styles.spinner} /> : 'Sign In'}
                </Button>
              </form>
            </div>
          </div>

        </div>

        <p className={styles.rFooter}>&copy; 2026 Allied Steel Center &middot; All rights reserved</p>
      </div>
    </div>
  );
}
