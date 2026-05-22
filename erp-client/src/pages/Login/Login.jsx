import { useState } from 'react';
import { User, Lock, LogIn, Eye, EyeOff, TrendingUp, Users, Factory, Package } from 'lucide-react';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import styles from './Login.module.css';

const STATS = [
  { icon: TrendingUp, label: 'Annual Revenue',      value: 'PKR 2.4B+',   color: 'blue'   },
  { icon: Factory,    label: 'Production Capacity', value: '18,000 T/yr', color: 'green'  },
  { icon: Package,    label: 'Product SKUs',        value: '200+',        color: 'orange' },
  { icon: Users,      label: 'Active Employees',    value: '120+',        color: 'purple' },
];

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

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
      {/* ── Left branding panel ── */}
      <div className={styles.leftPanel}>
        <div className={styles.lglow1} />
        <div className={styles.lglow2} />

        <div className={styles.lContent}>
          {/* Brand */}
          <div className={styles.brandRow}>
            <div className={styles.logoBox}>
              <span className={styles.logoShimmer} />
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4"  width="18" height="3" rx="1" fill="white" opacity="0.95"/>
                <rect x="9" y="7"  width="6"  height="8" fill="white" opacity="0.95"/>
                <rect x="3" y="15" width="18" height="3" rx="1" fill="white" opacity="0.95"/>
              </svg>
            </div>
            <div>
              <h1 className={styles.brandName}>Ahsan Brothers</h1>
              <p className={styles.brandSub}>Steel Manufacturing Group</p>
            </div>
          </div>

          {/* Hero */}
          <div className={styles.heroBlock}>
            <h2 className={styles.heroTitle}>Enterprise Resource<br />Planning System</h2>
            <p className={styles.heroDesc}>
              Unified operations management — procurement, production, inventory,
              sales, invoicing, finance, and HR in one platform.
            </p>
          </div>

          {/* Stats */}
          <div className={styles.statsGrid}>
            {STATS.map((s) => (
              <div key={s.label} className={`${styles.statCard} ${styles['stat_' + s.color]}`}>
                <div className={styles.statIcon}><s.icon size={18} strokeWidth={1.75} /></div>
                <div>
                  <p className={styles.statValue}>{s.value}</p>
                  <p className={styles.statLabel}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer tag */}
          <div className={styles.lFooter}>
            <span className={styles.onlineDot} />
            <span>AB-ERP-DESIGN-002 &middot; Secure Access &middot; Confidential</span>
          </div>
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

        <p className={styles.rFooter}>&copy; 2026 Ahsan Brothers &middot; All rights reserved</p>
      </div>
    </div>
  );
}
