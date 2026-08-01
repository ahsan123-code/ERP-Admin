/* Prototype behaviour: enough interactivity to judge the design, nothing more.
   No framework, no build, no network — open any page with file:// and it works. */

// ── Theme ───────────────────────────────────────────────────────────
// Persisted so switching pages does not bounce you between light and dark.
const THEME_KEY = 'erp-proto-theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* file:// with storage blocked */ }
  document.querySelectorAll('[data-theme-label]').forEach(el => {
    el.textContent = theme === 'dark' ? 'Light' : 'Dark';
  });
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  applyTheme(saved || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
}

function toggleTheme() {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

// ── Branch ──────────────────────────────────────────────────────────
// Also persisted: losing your branch on every navigation is the exact bug
// the real app had, and the prototype should not reintroduce it.
const BRANCH_KEY = 'erp-proto-branch';

function applyBranch(name) {
  try { localStorage.setItem(BRANCH_KEY, name); } catch { /* ignore */ }
  document.querySelectorAll('[data-branch]').forEach(b => {
    b.classList.toggle('on', b.dataset.branch === name);
  });
  document.querySelectorAll('[data-branch-name]').forEach(el => { el.textContent = name; });
  // Screens can show per-branch figures by tagging elements with data-for-branch.
  document.querySelectorAll('[data-for-branch]').forEach(el => {
    el.hidden = el.dataset.forBranch !== name;
  });
}

function initBranch() {
  let saved = null;
  try { saved = localStorage.getItem(BRANCH_KEY); } catch { /* ignore */ }
  applyBranch(saved || 'Shop #41');
  document.querySelectorAll('[data-branch]').forEach(b => {
    b.addEventListener('click', () => applyBranch(b.dataset.branch));
  });
}

// ── Segmented controls / tabs ───────────────────────────────────────
function initToggleGroups() {
  document.querySelectorAll('[data-toggle-group]').forEach(group => {
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        const target = btn.dataset.panel;
        if (!target) return;
        document.querySelectorAll(`[data-panel-for="${group.dataset.toggleGroup}"]`)
          .forEach(p => { p.hidden = p.dataset.panelName !== target; });
      });
    });
  });
}

// ── Fake loading, so the skeleton states are judgeable ───────────────
function initLoadingDemo() {
  document.querySelectorAll('[data-demo-load]').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrap = document.querySelector(btn.dataset.demoLoad);
      if (!wrap) return;
      const real = wrap.querySelector('[data-real]');
      const skel = wrap.querySelector('[data-skeleton]');
      if (!real || !skel) return;
      real.hidden = true; skel.hidden = false;
      setTimeout(() => { real.hidden = false; skel.hidden = true; }, 1600);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initBranch();
  initToggleGroups();
  initLoadingDemo();
  document.querySelectorAll('[data-theme-toggle]').forEach(b => b.addEventListener('click', toggleTheme));
});
