import { useEffect, useState, type ReactNode } from 'react';
import { clearSession, getUser, rpc, getToken } from './api';
import { errorMessage, t } from './i18n';
import { navigate } from './router';
import { penaltyRanking } from './stats';
import type { CompeBody, CompeStatus, ContestKind } from './types';

// ---- 画面の枠 ---------------------------------------------------------------
export function Page({
  title,
  back,
  right,
  children,
  footer,
}: {
  title: string;
  back?: string;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="page">
      <header className="appbar">
        {back ? (
          <button className="icon-btn" aria-label={t('back')} onClick={() => navigate(back)}>
            ‹
          </button>
        ) : (
          <span className="appbar-logo">⛳</span>
        )}
        <h1 className="appbar-title">{title}</h1>
        <div className="appbar-right">{right}</div>
      </header>
      <main className="content">
        {children}
        <HelpLinks />
      </main>
      {footer}
    </div>
  );
}

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const user = getUser();
  if (!user) return null;
  const logout = async () => {
    try {
      await rpc('api_logout', { p_token: getToken() ?? '' });
    } catch {
      /* 失敗しても端末側はログアウトする */
    }
    clearSession();
    navigate('/login');
  };
  return (
    <div className="menu-wrap">
      <button className="icon-btn" aria-label={t('menu')} onClick={() => setOpen(!open)}>
        ☰
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu">
            <div className="menu-user">
              {user.display_name}
              <small>{t(`role_${user.role}`)}</small>
            </div>
            <button onClick={() => { setOpen(false); navigate('/'); }}>{t('selectCompe')}</button>
            {user.role !== 'player' && (
              <button onClick={() => { setOpen(false); navigate('/admin'); }}>{t('adminMenu')}</button>
            )}
            <button onClick={() => { setOpen(false); navigate('/password'); }}>{t('changePassword')}</button>
            <a href={`${import.meta.env.BASE_URL}help/quick.html`} target="_blank" rel="noopener">
              {t('quickGuide')}
            </a>
            <a href={`${import.meta.env.BASE_URL}help/manual.html`} target="_blank" rel="noopener">
              {t('userManual')}
            </a>
            <button onClick={logout}>{t('logout')}</button>
          </div>
        </>
      )}
    </div>
  );
}

export function Loading() {
  return <div className="center muted">{t('loading')}</div>;
}

export function ErrorBox({ code, onRetry }: { code: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      {errorMessage(code)}
      {onRetry && (
        <button className="btn small" onClick={onRetry}>
          ↻
        </button>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: CompeStatus }) {
  return <span className={`badge badge-${status}`}>{t(`status_${status}`)}</span>;
}

// ---- トースト（画面下に一瞬出るお知らせ） ----------------------------------
export function toast(message: string, kind: 'info' | 'error' = 'info') {
  window.dispatchEvent(new CustomEvent('golf-compe-toast', { detail: { message, kind } }));
}

export function ToastHost() {
  const [msg, setMsg] = useState<{ message: string; kind: string } | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const on = (e: Event) => {
      setMsg((e as CustomEvent).detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 3000);
    };
    window.addEventListener('golf-compe-toast', on);
    return () => window.removeEventListener('golf-compe-toast', on);
  }, []);
  if (!msg) return null;
  return <div className={`toast toast-${msg.kind}`}>{msg.message}</div>;
}

// ---- ダッシュボードと入力画面で共通の表示 ----------------------------------
export function LocalRules({ text }: { text: string }) {
  return (
    <section className="card local-rules">
      <h2>{t('localRules')}</h2>
      {text.trim() ? <p className="pre">{text}</p> : <p className="muted">{t('noLocalRules')}</p>}
    </section>
  );
}

export function Ranking({ body }: { body: CompeBody }) {
  const rows = penaltyRanking(body);
  const [open, setOpen] = useState<string | null>(null);
  const anyPenalty = rows.some((r) => r.total > 0);
  if (body.penalty_types.length === 0) return null; // 罰がすべて非表示
  return (
    <section className="card">
      <h2>{t('penaltyRanking')}</h2>
      {!anyPenalty && <p className="muted">{t('noPenalties')}</p>}
      {anyPenalty && <p className="hint">{t('tapForDetail')}</p>}
      <ol className="ranking">
        {rows.map((r) => (
          <li key={r.user_id} className={r.rank === 1 && r.total > 0 ? 'top' : ''}>
            <button className="rank-row" onClick={() => setOpen(open === r.user_id ? null : r.user_id)}>
              <span className="rank">{t('rankN', { n: r.rank })}</span>
              <span className="rank-name">{r.name}</span>
              <span className="rank-total">{t('totalTimes', { n: r.total })}</span>
            </button>
            {r.byType.length > 0 && (
              <div className="chips">
                {r.byType.map((x) => (
                  <span key={x.type_id} className="chip">
                    {x.name} {x.count}
                  </span>
                ))}
              </div>
            )}
            {open === r.user_id && r.byHole.length > 0 && (
              <ul className="detail">
                {r.byHole.map((x, i) => (
                  <li key={i}>
                    {t('holeShort', { n: x.hole })} {x.type} ×{x.count}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ContestTops({ body }: { body: CompeBody }) {
  const name = new Map(body.players.map((p) => [p.user_id, p.display_name]));
  const items: { hole: number; kind: ContestKind }[] = [
    ...body.holes.longest.map((hole) => ({ hole, kind: 'longest' as const })),
    ...body.holes.nearest.map((hole) => ({ hole, kind: 'nearest' as const })),
  ].sort((a, b) => a.hole - b.hole);
  if (!body.display.longest && !body.display.nearest) return null; // 両方とも非表示
  return (
    <section className="card">
      <h2>{t('contestTop')}</h2>
      {items.length === 0 && <p className="muted">{t('noContestHoles')}</p>}
      <ul className="contest-list">
        {items.map((it) => {
          const l = body.leaders.find((x) => x.hole === it.hole && x.kind === it.kind);
          const who = l?.user_id ? name.get(l.user_id) : undefined;
          return (
            <li key={`${it.kind}-${it.hole}`}>
              <span className={`kind kind-${it.kind}`}>{t(it.kind)}</span>
              <span className="contest-hole">{t('holeShort', { n: it.hole })}</span>
              <span className={who ? 'contest-who' : 'contest-who muted'}>{who ?? t('undecided')}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** クイックガイドと利用マニュアルへのリンク（ログイン不要で読める静的ページ） */
export function HelpLinks() {
  const base = import.meta.env.BASE_URL;
  return (
    <nav className="help-links">
      <a href={`${base}help/quick.html`} target="_blank" rel="noopener">
        📘 {t('quickGuide')}
      </a>
      <a href={`${base}help/manual.html`} target="_blank" rel="noopener">
        📖 {t('userManual')}
      </a>
    </nav>
  );
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('copied'));
  } catch {
    window.prompt(t('copy'), text);
  }
}
