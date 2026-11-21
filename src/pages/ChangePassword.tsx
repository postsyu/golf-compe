import { useState, type FormEvent } from 'react';
import { ApiError, authed } from '../api';
import { ErrorBox, Page, toast } from '../components';
import { t } from '../i18n';
import { navigate } from '../router';

export default function ChangePassword() {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authed('api_change_password', { p_old: oldPw, p_new: newPw });
      toast(t('passwordChanged'));
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'unknown');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t('changePassword')} back="/">
      <form className="card form" onSubmit={submit}>
        <label>
          {t('currentPassword')}
          <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" required />
        </label>
        <label>
          {t('newPassword')} <small className="muted">{t('passwordHint')}</small>
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" minLength={6} required />
        </label>
        {error && <ErrorBox code={error} />}
        <button className="btn primary big" disabled={busy}>
          {busy ? t('saving') : t('save')}
        </button>
      </form>
    </Page>
  );
}
