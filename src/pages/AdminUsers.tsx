import { useState, type FormEvent } from 'react';
import { ApiError, authed, getUser } from '../api';
import { ErrorBox, Loading, Page, UserMenu, toast } from '../components';
import { useLoad } from '../hooks';
import { t } from '../i18n';
import type { Role, UserRow } from '../types';

export default function AdminUsers() {
  const me = getUser();
  const isSuper = me?.role === 'super_admin';
  const { data, error, reload } = useLoad(() => authed<UserRow[]>('api_list_users'));
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Page title={t('userManagement')} back="/admin" right={<UserMenu />}>
      <button className="btn primary" onClick={() => setShowNew(!showNew)}>
        ＋ {t('newUser')}
      </button>
      {showNew && (
        <NewUserForm
          isSuper={isSuper}
          onDone={() => {
            setShowNew(false);
            reload();
          }}
        />
      )}
      {error && <ErrorBox code={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      <ul className="list">
        {data?.map((u) => (
          <li key={u.id} className="card">
            <button className="list-item plain" onClick={() => setOpenId(openId === u.id ? null : u.id)}>
              <span className="list-main">
                <strong>{u.display_name}</strong>
                <small className="muted">
                  {u.username} · {t(`role_${u.role}`)}
                </small>
              </span>
              {u.status === 'suspended' && <span className="badge badge-finished">{t('user_suspended')}</span>}
            </button>
            {openId === u.id && (
              <EditUser
                user={u}
                me={me?.id ?? ''}
                isSuper={isSuper}
                onDone={() => {
                  setOpenId(null);
                  reload();
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </Page>
  );
}

function NewUserForm({ isSuper, onDone }: { isSuper: boolean; onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('player');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authed('api_create_user', {
        p_username: username,
        p_display_name: displayName,
        p_password: password,
        p_role: role,
      });
      toast(t('userCreated'));
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'unknown');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <label>
        {t('username')} <small className="muted">{t('usernameHint')}</small>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          autoCapitalize="none"
          autoCorrect="off"
          pattern="[a-z0-9_.\-]{2,32}"
          required
        />
      </label>
      <label>
        {t('displayName')}
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} required />
      </label>
      <label>
        {t('initialPassword')} <small className="muted">{t('passwordHint')}</small>
        <input value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoComplete="off" />
      </label>
      {isSuper && (
        <label>
          {t('role')}
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="player">{t('role_player')}</option>
            <option value="compe_admin">{t('role_compe_admin')}</option>
          </select>
        </label>
      )}
      {error && <ErrorBox code={error} />}
      <button className="btn primary" disabled={busy}>
        {t('create')}
      </button>
    </form>
  );
}

function EditUser({ user, me, isSuper, onDone }: { user: UserRow; me: string; isSuper: boolean; onDone: () => void }) {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [role, setRole] = useState<Role>(user.role);
  const [status, setStatus] = useState(user.status);
  const [newPw, setNewPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSelfSuper = user.role === 'super_admin';
  const canEdit = isSuper ? !isSelfSuper || user.id === me : user.role === 'player';
  const canChangeRole = isSuper && !isSelfSuper;
  const canReset = isSuper ? !isSelfSuper || user.id === me : user.role === 'player';

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast(msg);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'unknown');
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit && !canReset) return null;

  return (
    <div className="form edit-user">
      {canEdit && (
        <>
          <label>
            {t('displayName')}
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} />
          </label>
          {canChangeRole && (
            <>
              <label>
                {t('role')}
                <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="player">{t('role_player')}</option>
                  <option value="compe_admin">{t('role_compe_admin')}</option>
                </select>
              </label>
              <label>
                {t('userStatus')}
                <select value={status} onChange={(e) => setStatus(e.target.value as UserRow['status'])}>
                  <option value="active">{t('user_active')}</option>
                  <option value="suspended">{t('user_suspended')}</option>
                </select>
              </label>
            </>
          )}
          <button
            className="btn primary small"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  authed('api_update_user', {
                    p_user_id: user.id,
                    p_display_name: displayName,
                    p_role: role,
                    p_status: status,
                  }),
                t('saved'),
              )
            }
          >
            {t('save')}
          </button>
        </>
      )}
      {canReset && (
        <div className="row gap reset-row">
          <input
            value={newPw}
            placeholder={t('newPassword')}
            onChange={(e) => setNewPw(e.target.value)}
            minLength={6}
            autoComplete="off"
          />
          <button
            className="btn small"
            disabled={busy || newPw.length < 6}
            onClick={() =>
              run(() => authed('api_reset_password', { p_user_id: user.id, p_new: newPw }), t('passwordResetDone'))
            }
          >
            {t('resetPassword')}
          </button>
        </div>
      )}
      {error && <ErrorBox code={error} />}
    </div>
  );
}
