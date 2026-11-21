import { authed } from '../api';
import { ErrorBox, Loading, Page, UserMenu } from '../components';
import { useLoad } from '../hooks';
import { t } from '../i18n';
import type { LogRow } from '../types';

export default function AdminLogs({ id }: { id: string }) {
  const { data, error, reload } = useLoad(() => authed<LogRow[]>('api_logs', { p_compe_id: id }), [id]);
  return (
    <Page
      title={t('logs')}
      back={`/admin/c/${id}`}
      right={
        <>
          <button className="btn small ghost" onClick={reload}>
            ↻
          </button>
          <UserMenu />
        </>
      }
    >
      {error && <ErrorBox code={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && data.length === 0 && <p className="card muted">{t('noLogs')}</p>}
      {data && data.length > 0 && (
        <ul className="log-list">
          {data.map((l) => (
            <li key={l.id} className="log-item">
              <div className="row between">
                <span className="muted">
                  {new Date(l.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="muted">
                  {t('logActor')}: {l.actor ?? '-'}
                </span>
              </div>
              <div>
                {l.hole != null && <strong>{t('holeShort', { n: l.hole })} </strong>}
                {l.item}
                {l.target && ` · ${l.target}`}
              </div>
              <div className="log-change">
                {l.before_val ?? '-'} → <strong>{l.after_val ?? '-'}</strong>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
