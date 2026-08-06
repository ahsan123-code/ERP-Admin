import { useState, useRef } from 'react';
import { CalendarDays, Plus, Check, Trash2, Camera, Building2 } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Card, { CardHeader } from '../../components/shared/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useToast } from '../../components/shared/Toast';
import { mastersDb } from '../../lib/db';
import { useFiscalYear } from '../../context/FiscalYearContext';
import { useAdminProfile } from '../../context/AdminProfileContext';
import { useAuth } from '../../context/AuthContext';
import { useEmployeeSections } from '../../context/EmployeeSectionsContext';
import styles from './Settings.module.css';

// An avatar never needs to be larger than it is drawn, and the row it is stored in travels
// with every profile read. Downscaling to a square here keeps a 4 MB phone photo down to a
// few tens of kilobytes, which is what makes storing it as a data URL reasonable at all.
const AVATAR_PX = 256;

const readResizedImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read that file.'));
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('That file is not an image the browser can read.'));
    img.onload = () => {
      // Cover-crop to a square so portrait and landscape photos both fill the circle
      // instead of being squashed.
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = AVATAR_PX;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side,
        0, 0, AVATAR_PX, AVATAR_PX);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

function ProfileSection() {
  const toast = useToast();
  const fileRef = useRef(null);
  // The same context the sidebar and top bar read, so a save updates the chrome at once
  // rather than only this page.
  const { profile, reload, initials: savedInitials } = useAdminProfile();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(null);           // null = untouched, use the stored value

  const displayName = name ?? profile?.display_name ?? '';
  const initials = savedInitials;

  const save = async (patch, message) => {
    setSaving(true);
    try {
      const { error } = await mastersDb.updateAdminProfile(patch);
      if (error) throw new Error(error.message);
      await reload();
      toast.success(message, 'Profile Updated');
    } catch (err) {
      toast.error(err.message, 'Could Not Save');
    } finally {
      setSaving(false);
    }
  };

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';                             // let the same file be picked again
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Choose an image file.'); return; }
    try {
      const photo_data = await readResizedImage(file);
      await save({ photo_data }, 'Your photo has been updated.');
    } catch (err) {
      toast.error(err.message, 'Could Not Read Image');
    }
  };

  return (
    <Card>
      <CardHeader title="Profile" subtitle="The name and photo shown in the sidebar and top bar" />
      <div className={styles.cardBody}>
        <div className={styles.profileRow}>
          <div className={styles.avatarWrap}>
            {profile?.photo_data
              ? <img src={profile.photo_data} alt="" className={styles.avatarImg} />
              : <div className={styles.avatarFallback}>{initials}</div>}
            <button
              type="button"
              className={styles.avatarBtn}
              onClick={() => fileRef.current?.click()}
              disabled={saving}
              title="Change photo"
            >
              <Camera size={14} strokeWidth={2} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPick} hidden />
          </div>

          <div className={styles.profileFields}>
            <Input
              label="Display Name"
              value={displayName}
              onChange={e => setName(e.target.value)}
              placeholder="Name shown across the app"
            />
            <div className={styles.profileActions}>
              <Button
                variant="primary"
                disabled={saving || !displayName.trim() || displayName === profile?.display_name}
                onClick={() => save({ display_name: displayName.trim() }, 'Your name has been updated.')}
              >
                {saving ? 'Saving…' : 'Save Name'}
              </Button>
              {profile?.photo_data && (
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => save({ photo_data: null }, 'Your photo has been removed.')}
                >
                  Remove Photo
                </Button>
              )}
            </div>
            <p className={styles.hint}>
              A photo is cropped to a square and scaled to {AVATAR_PX}×{AVATAR_PX} before saving.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function FiscalYearSection() {
  const toast = useToast();
  const { fiscalYears, fiscalYearId, currentFyStart, reloadFiscalYears } = useFiscalYear();
  const [busy, setBusy] = useState(false);

  // The next year that does not exist yet, so July's rollover is one click and nobody has
  // to work out which year comes next.
  const years = fiscalYears.map(y => parseInt(String(y.start_date).slice(0, 4), 10));
  const suggested = years.length ? Math.max(...years) + 1 : currentFyStart;

  const run = async (fn, message) => {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw new Error(error.message);
      await reloadFiscalYears();
      toast.success(message, 'Fiscal Years');
    } catch (err) {
      toast.error(err.message, 'Could Not Save');
    } finally {
      setBusy(false);
    }
  };

  const remove = (y) => {
    if (!window.confirm(
      `Remove ${y.label}?\n\nThis only removes it from the selector — no vouchers, invoices or balances are deleted.`
    )) return;
    run(() => mastersDb.deleteFiscalYear(y.id), `${y.label} removed.`);
  };

  return (
    <Card>
      <CardHeader
        title="Fiscal Years"
        subtitle="A year runs 1 July to 30 June. The year chosen in the top bar is the one you are working in."
      />
      <div className={styles.cardBody}>
        <div className={styles.addRow}>
          <span className={styles.addText}>
            Next year to add: <strong>F-{suggested}-{suggested + 1}</strong>
            <span className={styles.addDates}> (1 Jul {suggested} — 30 Jun {suggested + 1})</span>
          </span>
          <Button
            variant="primary"
            icon={<Plus size={14} />}
            disabled={busy}
            onClick={() => run(() => mastersDb.addFiscalYear(suggested), `F-${suggested}-${suggested + 1} added.`)}
          >
            Add Year
          </Button>
        </div>

        <table className={styles.tbl}>
          <thead>
            <tr>
              <th>Fiscal Year</th><th>Starts</th><th>Ends</th><th>Opens By Default</th><th />
            </tr>
          </thead>
          <tbody>
            {fiscalYears.length === 0
              ? <tr><td colSpan={5} className={styles.empty}>No fiscal years yet.</td></tr>
              : fiscalYears.map(y => (
                <tr key={y.id} className={y.id === fiscalYearId ? styles.selectedRow : undefined}>
                  <td>
                    <strong>{y.label}</strong>
                    {y.id === fiscalYearId && <Badge variant="info">Viewing</Badge>}
                  </td>
                  <td className={styles.date}>{y.start_date}</td>
                  <td className={styles.date}>{y.end_date}</td>
                  <td>
                    {y.is_active
                      ? <Badge variant="success">Default</Badge>
                      : (
                        <button
                          type="button"
                          className={styles.linkBtn}
                          disabled={busy}
                          onClick={() => run(() => mastersDb.setActiveFiscalYear(y.id), `${y.label} is now the default.`)}
                        >
                          <Check size={12} strokeWidth={2.5} /> Make default
                        </button>
                      )}
                  </td>
                  <td className={styles.right}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      disabled={busy || y.id === fiscalYearId}
                      title={y.id === fiscalYearId ? 'Switch to another year before removing this one' : `Remove ${y.label}`}
                      onClick={() => remove(y)}
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </td>
                  <td hidden />
                </tr>
              ))}
          </tbody>
        </table>

        <div className={styles.noteBox}>
          <CalendarDays size={14} strokeWidth={2} />
          <span>
            Reports and ledgers show all dates by default. Set the From and To dates on a
            report to look at a particular period.
          </span>
        </div>
      </div>
    </Card>
  );
}

const MIN_PASSWORD = 8;

function PasswordSection() {
  const toast = useToast();
  const { changePassword } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const problem =
    !form.current ? 'Enter your current password.'
    : form.next.length < MIN_PASSWORD ? `Choose at least ${MIN_PASSWORD} characters.`
    : form.next === form.current ? 'The new password must differ from the current one.'
    : form.next !== form.confirm ? 'The two new passwords do not match.'
    : null;

  const submit = async (e) => {
    e.preventDefault();
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    try {
      const { error } = await changePassword(form.current, form.next);
      if (error) throw new Error(error.message);
      setForm({ current: '', next: '', confirm: '' });
      toast.success('Your password has been changed. It applies the next time you sign in.', 'Password Changed');
    } catch (err) {
      toast.error(err.message, 'Could Not Change Password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Password" subtitle="Change the password you sign in with" />
      <form className={styles.cardBody} onSubmit={submit}>
        <div className={styles.pwGrid}>
          <Input
            label="Current Password" type="password" autoComplete="current-password"
            value={form.current} onChange={set('current')} placeholder="The password you signed in with"
          />
          <Input
            label="New Password" type="password" autoComplete="new-password"
            value={form.next} onChange={set('next')} placeholder={`At least ${MIN_PASSWORD} characters`}
          />
          <Input
            label="Confirm New Password" type="password" autoComplete="new-password"
            value={form.confirm} onChange={set('confirm')} placeholder="Type it again"
          />
        </div>
        <div className={styles.profileActions}>
          <Button variant="primary" type="submit" disabled={saving || !!problem}>
            {saving ? 'Changing…' : 'Change Password'}
          </Button>
          {problem && (form.current || form.next || form.confirm) && (
            <span className={styles.hint}>{problem}</span>
          )}
        </div>
      </form>
    </Card>
  );
}

function EmployeeSectionsSection() {
  const toast = useToast();
  const { sections, reload } = useEmployeeSections();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) { toast.error('Enter a section name.'); return; }
    if (sections.some(s => s.name.toLowerCase() === clean.toLowerCase())) {
      toast.error(`"${clean}" already exists.`); return;
    }
    setBusy(true);
    try {
      const { error } = await mastersDb.addEmployeeSection(clean);
      if (error) throw new Error(error.message);
      await reload();
      setName('');
      toast.success(`"${clean}" added — it is now selectable on an employee.`, 'Section Added');
    } catch (err) {
      toast.error(err.message, 'Could Not Add');
    } finally {
      setBusy(false);
    }
  };

  // Staff standing in a removed section would fall into the salary sheet's "Admins" block,
  // so the count is checked first and the removal refused with the number in the way.
  const remove = async (s) => {
    setBusy(true);
    try {
      const { count, error: countErr } = await mastersDb.countEmployeesInSection(s.name);
      if (countErr) throw new Error(countErr.message);
      if (count > 0) {
        toast.error(
          `${count} employee${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} still in "${s.name}". ` +
          'Move them to another section first.',
          'Section In Use',
        );
        return;
      }
      if (!window.confirm(`Remove "${s.name}"?\n\nNo employee is using it. Payroll already printed keeps the section name it was generated with.`)) return;
      const { error } = await mastersDb.deleteEmployeeSection(s.id);
      if (error) throw new Error(error.message);
      await reload();
      toast.success(`"${s.name}" removed.`, 'Section Removed');
    } catch (err) {
      toast.error(err.message, 'Could Not Remove');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Employee Sections"
        subtitle="Where staff are posted. The salary sheet groups by section and gives each one its own worksheet tab."
      />
      <div className={styles.cardBody}>
        <div className={styles.addRow}>
          <Input
            placeholder="e.g. Shop 58"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          />
          <Button variant="primary" icon={<Plus size={14} />} disabled={busy} onClick={add}>
            Add Section
          </Button>
        </div>

        <table className={styles.tbl}>
          <thead>
            <tr><th>Section</th><th /></tr>
          </thead>
          <tbody>
            {sections.length === 0
              ? <tr><td colSpan={2} className={styles.empty}>No sections yet.</td></tr>
              : sections.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong></td>
                  <td className={styles.right}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      disabled={busy}
                      title={`Remove ${s.name}`}
                      onClick={() => remove(s)}
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        <div className={styles.noteBox}>
          <Building2 size={14} strokeWidth={2} />
          <span>
            A new section is selectable on an employee immediately. It appears on the salary
            sheet — as its own block and its own Excel tab — once an employee in it has
            payroll generated. Staff with no section print together under "Admins".
          </span>
        </div>
      </div>
    </Card>
  );
}

export default function Settings() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Profile, fiscal years, employee sections, and account security" />
      <div className={styles.stack}>
        <ProfileSection />
        <FiscalYearSection />
        <EmployeeSectionsSection />
        <PasswordSection />
      </div>
    </>
  );
}
