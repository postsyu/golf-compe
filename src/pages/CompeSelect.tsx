import { useEffect } from 'react';
import { authed, getUser, isAdmin } from '../api';
import { ErrorBox, Loading, Page, StatusBadge, UserMenu } from '../components';
import { useLoad } from '../hooks';
import { t } from '../i18n';
import { navigate } from '../router';
import { formatDate } from '../stats';
import type { CompeSummary } from '../types';

export default function CompeSelect() {
  const user = getUser();
  const { data, error, reload } = useLoad(() => authed<CompeSummary[]>('api_my_competitions'));

  // 参加コンペが 1 件だけで、管理者でなければそのまま開く
  useEffect(() => {
    if (data && data.length === 1 && !isAdmin(user) && !sessionStorage.getItem('golf-compe.autoOpened')) {
      sessionStorage.setItem('golf-compe.autoOpened', '1');
      navigate(`/c/${data[0].id}`);
    }
  }, [data, user]);

  return (
    <Page title={t('selectCompe')} right={<UserMenu />}>
      {error && <ErrorBox code={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && data.length === 0 && <p className="card muted">{t('noCompe')}</p>}
      <ul className="list">
        {data?.map((c) => (
          <li key={c.id}>
            <button className="list-item" onClick={() => navigate(`/c/${c.id}`)}>
              <span className="list-main">
                <strong>{c.name}</strong>
                <small>
                  {formatDate(c.event_date)} {c.course}
                </small>
              </span>
              <StatusBadge status={c.status} />
            </button>
          </li>
        ))}
      </ul>
      {isAdmin(user) && (
        <button className="btn block" onClick={() => navigate('/admin')}>
          {t('adminMenu')}
        </button>
      )}
    </Page>
  );
}
