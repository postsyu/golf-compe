import { useState, type FormEvent } from 'react';
import { ApiError, rpc, saveSession } from '../api';
import { ErrorBox } from '../components';
import { t } from '../i18n';
import { navigate } from '../router';
import type { User } from '../types';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await rpc<{ ok: boolean; error?: string; token?: string; user?: User }>('api_login', {
        p_username: username,
        p_password: password,
      });
      if (!r.ok || !r.token || !r.user) {
        setError(r.error ?? 'login_failed');
      } else {
        saveSession(r.token, r.user);
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'unknown');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-logo">⛳</div>
      <h1>{t('appName')}</h1>
      <form className="card form" onSubmit={submit}>
        <label>
          {t('username')}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            inputMode="email"
            required
          />
        </label>
        <label>
          {t('password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <ErrorBox code={error} />}
        <button className="btn primary big" disabled={busy}>
          {busy ? t('loading') : t('loginButton')}
        </button>
      </form>
    </div>
  );
}
