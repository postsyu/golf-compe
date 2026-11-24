import { useState } from 'react';
import { t } from './i18n';
import {
  groupMembers,
  groupStandings,
  olympicAvailable,
  scoreHole,
  tapPlayer,
  toggleDiamond,
  toggleGiveup,
  toggleMade,
  toggleSand,
  type OlympicEntry,
} from './olympic';
import type { CompeBody, Group } from './types';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** 組ごとのオリンピック順位（ダッシュボードとランキングタブ） */
export function OlympicBoard({ body }: { body: CompeBody }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!body.olympic.enabled) return null;
  const groups = body.groups.filter((g) => olympicAvailable(body, g));
  return (
    <section className="card olympic-board">
      <h2>{t('olympic')}</h2>
      {groups.length === 0 ? (
        <p className="muted">{t('olympicNoGroups')}</p>
      ) : (
        <p className="hint">{t('olympicBoardHint')}</p>
      )}
      {groups.map((g) => {
        const rows = groupStandings(body, g);
        return (
          <div key={g.id} className="olympic-group">
            <h3>{t('groupN', { n: g.number })}</h3>
            <div className="olympic-head">
              <span />
              <span />
              <span>{t('olympicRaw')}</span>
              <span>{t('olympicFinal')}</span>
            </div>
            <ol className="olympic-rows">
              {rows.map((r) => (
                <li key={r.user_id}>
                  <button className="olympic-row" onClick={() => setOpen(open === r.user_id ? null : r.user_id)}>
                    <span className="rank">{t('rankN', { n: r.rank })}</span>
                    <span className="rank-name">{r.name}</span>
                    <span className="olympic-raw">{r.raw}</span>
                    <span className={`olympic-final ${r.final > 0 ? 'plus' : r.final < 0 ? 'minus' : ''}`}>{signed(r.final)}</span>
                  </button>
                  {open === r.user_id && (
                    <ul className="detail">
                      {r.holes.length === 0 && <li>{t('noPenalties')}</li>}
                      {r.holes.map((h) => (
                        <li key={h.hole}>
                          {t('holeShort', { n: h.hole })} {h.label}
                          {h.label !== 'ギブアップ' && h.label !== 'ダイヤ' && (h.made ? ' ○' : ' ×')}
                          {h.sand && ` ${t('olympicSand')}`}
                          {h.kuzutetsu && ` ${t('olympicKuzutetsu')}`} {signed(h.points)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </section>
  );
}

/** 入力画面：1 ホール・1 組のオリンピック入力 */
export function OlympicInput({
  body,
  group,
  hole,
  disabled,
  onChange,
  onToggleGroup,
}: {
  body: CompeBody;
  group: Group;
  hole: number;
  disabled: boolean;
  onChange: (entries: OlympicEntry[]) => void;
  onToggleGroup: (on: boolean) => void;
}) {
  if (!body.olympic.enabled) return null;

  if (!group.olympic_on) {
    return (
      <section className="card olympic-off">
        <span className="muted">{t('olympicHiddenInGroup')}</span>
        <button className="btn small" disabled={disabled} onClick={() => onToggleGroup(true)}>
          {t('olympicShow')}
        </button>
      </section>
    );
  }

  const members = groupMembers(body, group);
  const header = (
    <div className="row between">
      <h2>
        {t('olympic')} · {t('holeN', { n: hole })}
      </h2>
      <button className="link-btn" disabled={disabled} onClick={() => onToggleGroup(false)}>
        {t('olympicHide')}
      </button>
    </div>
  );
  if (!olympicAvailable(body, group)) {
    return (
      <section className="card olympic-card">
        {header}
        <p className="muted">{t('olympicGroupSize')}</p>
      </section>
    );
  }

  const ids = new Set(members.map((m) => m.user_id));
  const entries: OlympicEntry[] = body.olympic_results.filter((r) => r.hole === hole && ids.has(r.user_id));
  const scores = new Map(scoreHole(entries, body.olympic).map((s) => [s.user_id, s]));
  const nextRank = entries.filter((e) => e.state === 'ranked').length + 1;
  const updatedBy = body.olympic_results.find((r) => r.hole === hole && ids.has(r.user_id) && r.updated_by)?.updated_by;

  return (
    <section className="card olympic-card">
      {header}
      <p className="hint">{t('olympicHint')}</p>
      {members.map((m) => {
        const e = entries.find((x) => x.user_id === m.user_id);
        const s = scores.get(m.user_id);
        const ranked = e?.state === 'ranked';
        const diamond = e?.state === 'diamond';
        const giveup = e?.state === 'giveup';
        const medalClass = diamond ? 'diamond' : ranked ? `m${e!.rank}` : giveup ? 'giveup' : 'none';
        return (
          <div key={m.user_id} className={`oly-row ${e ? 'set' : ''}`}>
            <button
              className="oly-main"
              disabled={disabled || diamond || giveup}
              onClick={() => onChange(tapPlayer(entries, m.user_id))}
              aria-label={`${m.display_name} ${t('olympicOrder')}`}
            >
              <span className={`medal ${medalClass}`}>
                {s?.label === 'ギブアップ' ? t('olympicGiveupShort') : s?.label || (e ? '' : `${nextRank}?`)}
              </span>
              <span className="oly-name">{m.display_name}</span>
              {e && <span className={`oly-pts ${s && s.points < 0 ? 'minus' : ''}`}>{signed(s?.points ?? 0)}</span>}
            </button>
            <div className="oly-btns">
              <button
                className={`chip-btn ${ranked && e!.made ? 'on' : ''}`}
                disabled={disabled || !ranked}
                onClick={() => onChange(toggleMade(entries, m.user_id))}
              >
                {t('olympicMade')}
              </button>
              <button
                className={`chip-btn diamond ${diamond ? 'on' : ''}`}
                disabled={disabled}
                onClick={() => onChange(toggleDiamond(entries, m.user_id))}
              >
                ◆ {t('olympicDiamond')}
              </button>
              {body.olympic.sand && (
                <button
                  className={`chip-btn ${e?.sand ? 'on' : ''}`}
                  disabled={disabled || !(diamond || (ranked && e!.made))}
                  onClick={() => onChange(toggleSand(entries, m.user_id))}
                >
                  {t('olympicSand')}
                </button>
              )}
              <button
                className={`chip-btn ${giveup ? 'on' : ''}`}
                disabled={disabled}
                onClick={() => onChange(toggleGiveup(entries, m.user_id))}
              >
                {t('olympicGiveup')}
              </button>
            </div>
          </div>
        );
      })}
      <div className="row between">
        <small className="muted">{updatedBy ? t('lastBy', { name: updatedBy }) : ''}</small>
        <button className="link-btn" disabled={disabled || entries.length === 0} onClick={() => onChange([])}>
          {t('olympicReset')}
        </button>
      </div>
    </section>
  );
}
