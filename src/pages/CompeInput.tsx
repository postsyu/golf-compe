import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, authed } from '../api';
import { ContestTops, ErrorBox, Loading, LocalRules, Page, Ranking, StatusBadge, UserMenu, toast } from '../components';
import { useLiveData } from '../hooks';
import { errorMessage, t } from '../i18n';
import { navigate } from '../router';
import { countOf } from '../stats';
import type { CompeState, ContestKind } from '../types';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const NO_GROUP = 'none';

export default function CompeInput({ id }: { id: string }) {
  const { data, setData, error, reload } = useLiveData<CompeState>(
    () => authed<CompeState>('api_competition_state', { p_id: id }),
    () => authed<number>('api_version', { p_id: id }),
    (d) => d.compe.version,
    3000,
  );

  const holeKey = `golf-compe.hole.${id}`;
  const [hole, setHoleState] = useState<number>(() => Number(localStorage.getItem(holeKey)) || 1);
  const setHole = (h: number) => {
    setHoleState(h);
    localStorage.setItem(holeKey, String(h));
  };
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [tab, setTab] = useState<'input' | 'summary'>('input');
  const inflight = useRef(0);

  // 最初は自分の組を表示
  useEffect(() => {
    if (data && groupKey === null) {
      setGroupKey(data.my_group_id ?? data.groups[0]?.id ?? NO_GROUP);
    }
  }, [data, groupKey]);

  const groupTabs = useMemo(() => {
    if (!data) return [];
    const tabs = data.groups.map((g) => ({ key: g.id, label: t('groupN', { n: g.number }) }));
    if (data.players.some((p) => !p.group_id)) tabs.push({ key: NO_GROUP, label: t('noGroup') });
    return tabs;
  }, [data]);

  if (!data) {
    return (
      <Page title={t('appName')} back="/" right={<UserMenu />}>
        {error ? <ErrorBox code={error} onRetry={reload} /> : <Loading />}
      </Page>
    );
  }

  const finished = data.compe.status === 'finished';
  const isEnglish = data.holes.english.includes(hole);
  const contestKinds: ContestKind[] = (['longest', 'nearest'] as const).filter((k) => data.holes[k].includes(hole));
  const players = data.players.filter((p) => (groupKey === NO_GROUP ? !p.group_id : p.group_id === groupKey));
  const types = data.penalty_types.filter((pt) => !pt.english_only || isEnglish);

  // 回数の +1 / −1（画面はすぐ更新し、送信後に最新データを読み直す）
  const addPenalty = async (userId: string, typeId: string, delta: 1 | -1) => {
    const cur = countOf(data, userId, hole, typeId)?.count ?? 0;
    if (delta === -1 && cur === 0) return;
    setData((d) => {
      if (!d) return d;
      const others = d.counts.filter((c) => !(c.user_id === userId && c.hole === hole && c.type_id === typeId));
      return { ...d, counts: [...others, { user_id: userId, hole, type_id: typeId, count: cur + delta, updated_by: null }] };
    });
    inflight.current++;
    try {
      await authed('api_add_penalty', {
        p_compe_id: id,
        p_user_id: userId,
        p_hole: hole,
        p_type_id: typeId,
        p_delta: delta,
      });
    } catch (e) {
      toast(errorMessage(e instanceof ApiError ? e.code : 'unknown'), 'error');
    } finally {
      inflight.current--;
      if (inflight.current === 0) reload();
    }
  };

  const setLeader = async (kind: ContestKind, userId: string) => {
    const value = userId || null;
    setData((d) => {
      if (!d) return d;
      const others = d.leaders.filter((l) => !(l.hole === hole && l.kind === kind));
      return { ...d, leaders: [...others, { hole, kind, user_id: value, updated_by: null }] };
    });
    try {
      await authed('api_set_leader', { p_compe_id: id, p_hole: hole, p_kind: kind, p_user_id: value });
    } catch (e) {
      toast(errorMessage(e instanceof ApiError ? e.code : 'unknown'), 'error');
    } finally {
      reload();
    }
  };

  const right = (
    <>
      {data.compe.can_manage && (
        <button className="btn small ghost" onClick={() => navigate(`/admin/c/${id}`)}>
          {t('manage')}
        </button>
      )}
      <UserMenu />
    </>
  );

  return (
    <Page title={data.compe.name} back="/" right={right}>
      <div className="row between">
        <StatusBadge status={data.compe.status} />
        <a className="link" href={`#/d/${data.compe.public_token}`}>
          {t('dashboard')} ›
        </a>
      </div>
      {error && <ErrorBox code={error} onRetry={reload} />}
      {finished && <div className="notice">{t('finishedNotice')}</div>}

      <div className="tabs">
        <button className={tab === 'input' ? 'on' : ''} onClick={() => setTab('input')}>
          {t('inputTab')}
        </button>
        <button className={tab === 'summary' ? 'on' : ''} onClick={() => setTab('summary')}>
          {t('penaltyRanking')}
        </button>
      </div>

      {tab === 'summary' ? (
        <>
          <Ranking body={data} />
          <ContestTops body={data} />
        </>
      ) : (
        <>
          {/* ホール選択 */}
          <div className="hole-nav">
            <button className="btn" disabled={hole <= 1} onClick={() => setHole(hole - 1)} aria-label={t('prevHole')}>
              ‹
            </button>
            <div className="hole-current">
              <span className="hole-big">{t('holeN', { n: hole })}</span>
              <span className="hole-marks">
                {isEnglish && <span className="kind kind-english">{t('englishHole')}</span>}
                {contestKinds.map((k) => (
                  <span key={k} className={`kind kind-${k}`}>
                    {t(k)}
                  </span>
                ))}
              </span>
            </div>
            <button className="btn" disabled={hole >= 18} onClick={() => setHole(hole + 1)} aria-label={t('nextHole')}>
              ›
            </button>
          </div>
          <div className="hole-strip">
            {HOLES.map((h) => (
              <button key={h} className={h === hole ? 'on' : ''} onClick={() => setHole(h)}>
                {h}
                <span className="marks">
                  {data.holes.english.includes(h) && t('markEnglish')}
                  {data.holes.longest.includes(h) && t('markLongest')}
                  {data.holes.nearest.includes(h) && t('markNearest')}
                </span>
              </button>
            ))}
          </div>

          {/* ドラコン・ニアピン */}
          {contestKinds.map((kind) => {
            const leader = data.leaders.find((l) => l.hole === hole && l.kind === kind);
            return (
              <section key={kind} className={`card contest-card kind-border-${kind}`}>
                <h2>
                  {t(kind)} · {t('currentTop')}
                </h2>
                <select
                  className="big-select"
                  value={leader?.user_id ?? ''}
                  disabled={finished}
                  onChange={(e) => setLeader(kind, e.target.value)}
                >
                  <option value="">{t('none')}</option>
                  {data.players.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
                {leader?.updated_by && <small className="muted">{t('lastBy', { name: leader.updated_by })}</small>}
              </section>
            );
          })}

          {/* 組の選択 */}
          {groupTabs.length > 1 && (
            <div className="group-tabs">
              {groupTabs.map((g) => (
                <button key={g.key} className={g.key === groupKey ? 'on' : ''} onClick={() => setGroupKey(g.key)}>
                  {g.label}
                </button>
              ))}
            </div>
          )}

          {/* 罰ゲームの入力 */}
          {players.length === 0 && <p className="card muted">{t('noPlayersInGroup')}</p>}
          {players.map((p) => {
            const holeTotal = types.reduce((s, pt) => s + (countOf(data, p.user_id, hole, pt.id)?.count ?? 0), 0);
            return (
              <section key={p.user_id} className="card player-card">
                <div className="row between">
                  <h2>{p.display_name}</h2>
                  {holeTotal > 0 && <span className="muted">{t('holeTotal', { n: holeTotal })}</span>}
                </div>
                {types.map((pt) => {
                  const c = countOf(data, p.user_id, hole, pt.id);
                  const n = c?.count ?? 0;
                  return (
                    <div key={pt.id} className={`counter ${n > 0 ? 'has' : ''}`}>
                      <div className="counter-label">
                        {pt.name}
                        {n > 0 && c?.updated_by && <small>{t('lastBy', { name: c.updated_by })}</small>}
                      </div>
                      <button
                        className="cnt-btn minus"
                        disabled={finished || n === 0}
                        onClick={() => addPenalty(p.user_id, pt.id, -1)}
                        aria-label={`${pt.name} −1`}
                      >
                        −
                      </button>
                      <span className="cnt">{n}</span>
                      <button
                        className="cnt-btn plus"
                        disabled={finished}
                        onClick={() => addPenalty(p.user_id, pt.id, 1)}
                        aria-label={`${pt.name} +1`}
                      >
                        ＋
                      </button>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </>
      )}

      <LocalRules text={data.compe.local_rules} />
    </Page>
  );
}
