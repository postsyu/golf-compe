import { useEffect, useState } from 'react';
import { ApiError, authed, dashboardUrl } from '../api';
import { ErrorBox, Loading, Page, UserMenu, copyText, toast } from '../components';
import { t } from '../i18n';
import { navigate } from '../router';
import type { AdminCompeDetail, CompeStatus, Holes, UserRow } from '../types';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const HOLE_KINDS: (keyof Holes)[] = ['english', 'longest', 'nearest'];
const HOLE_LABEL: Record<keyof Holes, 'englishHole' | 'longest' | 'nearest'> = {
  english: 'englishHole',
  longest: 'longest',
  nearest: 'nearest',
};

export default function AdminCompeEdit({ id }: { id: string }) {
  const [form, setForm] = useState<AdminCompeDetail | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [c, u] = await Promise.all([
        authed<AdminCompeDetail>('api_get_competition_admin', { p_id: id }),
        authed<UserRow[]>('api_list_users'),
      ]);
      setForm(c);
      setUsers(u);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'unknown');
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!form) {
    return (
      <Page title={t('compeSettings')} back="/admin" right={<UserMenu />}>
        {error ? <ErrorBox code={error} onRetry={load} /> : <Loading />}
      </Page>
    );
  }

  const update = (patch: Partial<AdminCompeDetail>) => setForm({ ...form, ...patch });
  const userName = new Map(users.map((u) => [u.id, u.display_name]));
  const assigned = new Set(form.groups.flatMap((g) => g.members));
  const available = users.filter((u) => u.status === 'active' && !assigned.has(u.id));

  const setGroups = (groups: AdminCompeDetail['groups']) =>
    update({ groups: groups.map((g, i) => ({ ...g, number: i + 1 })) });

  const toggleHole = (kind: keyof Holes, h: number) => {
    const list = form.holes[kind];
    update({
      holes: { ...form.holes, [kind]: list.includes(h) ? list.filter((x) => x !== h) : [...list, h].sort((a, b) => a - b) },
    });
  };

  const removePenalty = (i: number) => {
    const p = form.custom_penalties[i];
    if (p.used > 0 && !window.confirm(t('confirmDeletePenalty', { name: p.name, n: p.used }))) return;
    update({ custom_penalties: form.custom_penalties.filter((_, j) => j !== i) });
  };

  const save = async () => {
    if (form.status === 'finished' && !window.confirm(t('confirmFinish'))) return;
    setBusy(true);
    setError(null);
    try {
      await authed('api_save_competition', {
        p_id: id,
        p_data: {
          name: form.name,
          event_date: form.event_date,
          course: form.course,
          status: form.status,
          local_rules: form.local_rules,
          groups: form.groups,
          holes: form.holes,
          custom_penalties: form.custom_penalties
            .filter((p) => p.name.trim())
            .map((p) => ({ id: p.id ?? null, name: p.name })),
        },
      });
      toast(t('saved'));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'unknown');
      window.scrollTo(0, 0);
    } finally {
      setBusy(false);
    }
  };

  const url = dashboardUrl(form.public_token);

  return (
    <Page
      title={t('compeSettings')}
      back="/admin"
      right={<UserMenu />}
      footer={
        <div className="sticky-footer">
          <button className="btn primary big block" disabled={busy} onClick={save}>
            {busy ? t('saving') : t('save')}
          </button>
        </div>
      }
    >
      {error && <ErrorBox code={error} />}

      <section className="card">
        <h2>{t('dashboardUrl')}</h2>
        <div className="url-box">
          <code>{url}</code>
          <button className="btn small" onClick={() => copyText(url)}>
            {t('copy')}
          </button>
        </div>
        <div className="row gap wrap">
          <button className="btn small" onClick={() => navigate(`/c/${id}`)}>
            {t('openInput')}
          </button>
          <button className="btn small" onClick={() => navigate(`/admin/c/${id}/logs`)}>
            {t('logs')}
          </button>
        </div>
      </section>

      <section className="card form">
        <label>
          {t('compeName')}
          <input value={form.name} onChange={(e) => update({ name: e.target.value })} maxLength={80} />
        </label>
        <label>
          {t('eventDate')}
          <input type="date" value={form.event_date} onChange={(e) => update({ event_date: e.target.value })} />
        </label>
        <label>
          {t('course')}
          <input value={form.course} onChange={(e) => update({ course: e.target.value })} />
        </label>
        <label>
          {t('status')}
          <select value={form.status} onChange={(e) => update({ status: e.target.value as CompeStatus })}>
            {(['preparing', 'active', 'finished'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`status_${s}`)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card">
        <h2>{t('groupsAndMembers')}</h2>
        {form.groups.map((g, gi) => (
          <div key={gi} className="group-edit">
            <div className="row between">
              <strong>{t('groupN', { n: g.number })}</strong>
              <label className="inline">
                {t('startTime')}
                <input
                  className="short"
                  value={g.start_time}
                  placeholder="8:00"
                  onChange={(e) =>
                    setGroups(form.groups.map((x, j) => (j === gi ? { ...x, start_time: e.target.value } : x)))
                  }
                />
              </label>
            </div>
            <div className="chips">
              {g.members.map((m) => (
                <span key={m} className="chip removable">
                  {userName.get(m) ?? '?'}
                  <button
                    aria-label={t('delete')}
                    onClick={() =>
                      setGroups(form.groups.map((x, j) => (j === gi ? { ...x, members: x.members.filter((y) => y !== m) } : x)))
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="row gap">
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setGroups(form.groups.map((x, j) => (j === gi ? { ...x, members: [...x.members, v] } : x)));
                }}
              >
                <option value="">{t('addMember')}</option>
                {available.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}（{u.username}）
                  </option>
                ))}
              </select>
              <button className="btn small danger" onClick={() => setGroups(form.groups.filter((_, j) => j !== gi))}>
                {t('deleteGroup')}
              </button>
            </div>
          </div>
        ))}
        <button
          className="btn"
          onClick={() => setGroups([...form.groups, { number: form.groups.length + 1, start_time: '', members: [] }])}
        >
          ＋ {t('addGroup')}
        </button>
      </section>

      <section className="card">
        <h2>{t('targetHoles')}</h2>
        {HOLE_KINDS.map((k) => (
          <div key={k} className="hole-pick">
            <span className={`kind kind-${k}`}>{t(HOLE_LABEL[k])}</span>
            <div className="hole-grid">
              {HOLES.map((h) => (
                <button key={h} className={form.holes[k].includes(h) ? 'on' : ''} onClick={() => toggleHole(k, h)}>
                  {h}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>{t('customPenalties')}</h2>
        <p className="hint">{t('standardPenalties')}</p>
        {form.custom_penalties.map((p, i) => (
          <div key={p.id ?? `new-${i}`} className="row gap">
            <input
              value={p.name}
              placeholder={t('customPenaltyName')}
              maxLength={30}
              onChange={(e) =>
                update({
                  custom_penalties: form.custom_penalties.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                })
              }
            />
            <button className="btn small danger" onClick={() => removePenalty(i)}>
              {t('delete')}
            </button>
          </div>
        ))}
        <button className="btn" onClick={() => update({ custom_penalties: [...form.custom_penalties, { name: '', used: 0 }] })}>
          ＋ {t('addPenalty')}
        </button>
      </section>

      <section className="card form">
        <label>
          {t('localRules')}
          <textarea rows={6} value={form.local_rules} onChange={(e) => update({ local_rules: e.target.value })} />
        </label>
      </section>
    </Page>
  );
}
