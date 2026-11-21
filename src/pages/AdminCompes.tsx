import { useState, type FormEvent } from 'react';
import { ApiError, authed, dashboardUrl } from '../api';
import { ErrorBox, Loading, Page, StatusBadge, UserMenu, copyText } from '../components';
import { useLoad } from '../hooks';
import { t } from '../i18n';
import { navigate } from '../router';
import { formatDate } from '../stats';
import type { AdminCompeSummary } from '../types';

function todayJst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export default function AdminCompes() {
  const { data, error, reload } = useLoad(() => authed<AdminCompeSummary[]>('api_admin_competitions'));
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayJst());
  const [course, setCourse] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const id = await authed<string>('api_create_competition', {
        p_name: name,
        p_event_date: date,
        p_course: course,
      });
      navigate(`/admin/c/${id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.code : 'unknown');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t('adminCompes')} back="/" right={<UserMenu />}>
      <div className="row gap">
        <button className="btn primary" onClick={() => setShowNew(!showNew)}>
          ＋ {t('newCompe')}
        </button>
        <button className="btn" onClick={() => navigate('/admin/users')}>
          {t('userManagement')}
        </button>
      </div>

      {showNew && (
        <form className="card form" onSubmit={create}>
          <label>
            {t('compeName')}
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </label>
          <label>
            {t('eventDate')}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            {t('course')}
            <input value={course} onChange={(e) => setCourse(e.target.value)} />
          </label>
          {formError && <ErrorBox code={formError} />}
          <button className="btn primary" disabled={busy}>
            {t('create')}
          </button>
        </form>
      )}

      {error && <ErrorBox code={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      <ul className="list">
        {data?.map((c) => (
          <li key={c.id} className="card compe-admin-item">
            <div className="row between">
              <strong>{c.name}</strong>
              <StatusBadge status={c.status} />
            </div>
            <small className="muted">
              {formatDate(c.event_date)} {c.course} · {t('participants', { n: c.participants })} ·{' '}
              {t('createdBy', { name: c.creator })}
            </small>
            <div className="row gap wrap">
              <button className="btn small" onClick={() => navigate(`/admin/c/${c.id}`)}>
                {t('edit')}
              </button>
              <button className="btn small" onClick={() => navigate(`/c/${c.id}`)}>
                {t('openInput')}
              </button>
              <button className="btn small" onClick={() => navigate(`/admin/c/${c.id}/logs`)}>
                {t('logs')}
              </button>
              <button className="btn small" onClick={() => copyText(dashboardUrl(c.public_token))}>
                URL {t('copy')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Page>
  );
}
