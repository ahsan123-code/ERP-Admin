import { Component } from 'react';
import { AlertCircle } from 'lucide-react';
import styles from './ErrorBoundary.module.css';

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isPage = this.props.page;

    return (
      <div className={`${styles.wrapper} ${isPage ? styles.page : styles.inline}`}>
        <div className={styles.icon}><AlertCircle size={32} strokeWidth={1.5} /></div>
        <h3 className={styles.title}>Something went wrong</h3>
        <p className={styles.message}>
          {isPage
            ? 'This section encountered an unexpected error. Your other modules are unaffected.'
            : 'This component could not be displayed.'}
        </p>
        <button className={styles.retryBtn} onClick={this.handleReset}>
          Try again
        </button>
      </div>
    );
  }
}
