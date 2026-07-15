import { useState, useEffect, useRef } from 'react';
import { User, Lock, LogIn, Eye, EyeOff } from 'lucide-react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import styles from './Login.module.css';

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

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      if (username === 'admin' && password === 'admin123') {
        onLogin();
      } else {
        setError('Invalid username or password.');
        setLoading(false);
      }
    }, 1200);
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
            <h2 className={styles.formTitle}>Administrator Login</h2>
            <p className={styles.formSub}>Sign in to access the management portal</p>
          </div>

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

        <p className={styles.rFooter}>&copy; 2026 Allied Steel Center &middot; All rights reserved</p>
      </div>
    </div>
  );
}
