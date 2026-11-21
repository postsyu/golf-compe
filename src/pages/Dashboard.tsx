import { rpc } from '../api';
import { ContestTops, ErrorBox, Loading, LocalRules, Ranking, StatusBadge } from '../components';
import { useLiveData } from '../hooks';
import { t } from '../i18n';
import { formatDate } from '../stats';
import type { DashboardData } from '../types';

type DashResult = DashboardData | { error: 'not_found' | 'expired' };

export default function Dashboard({ token }: { token: string }) {
  const { data, error, reload, updatedAt } = useLiveData<DashResult>(
    () => rpc<DashResult>('api_dashboard', { p_public_token: token }),
    () => rpc<number>('api_dashboard_version', { p_public_token: token }),
    (d) => ('error' in d ? -1 : d.compe.version),
    4000,
  );

  if (data && 'error' in data) {
    return (
      <div className="page">
        <main className="content">
          <div className="card center">{data.error === 'expired' ? t('dashExpired') : t('dashNotFound')}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="page dashboard">
      <header className="dash-head">
        <div className="dash-title">
          <h1>{data ? data.compe.name : t('appName')}</h1>
          {data && <StatusBadge status={data.compe.status} />}
        </div>
        {data && (
          <p className="muted">
            {formatDate(data.compe.event_date)} {data.compe.course}
          </p>
        )}
        <p className="live">
          <span className="live-dot" />
          {t('autoUpdate')}
          {updatedAt && ` · ${t('lastUpdated', { time: updatedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}`}
        </p>
      </header>
      <main className="content">
        {error && <ErrorBox code={error} onRetry={reload} />}
        {!data && !error && <Loading />}
        {data && (
          <>
            <Ranking body={data} />
            <ContestTops body={data} />
            <LocalRules text={data.compe.local_rules} />
          </>
        )}
      </main>
    </div>
  );
}
