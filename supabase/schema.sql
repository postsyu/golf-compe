-- =====================================================================
-- ゴルフコンペアプリ データベース定義（Supabase の SQL Editor に貼り付けて実行）
--
-- 方針
--  * テーブルはすべて app スキーマに置く（Supabase の API からは直接見えない）
--  * 画面からの操作はすべて public.api_* 関数（SECURITY DEFINER）経由
--  * ログインは独自実装：パスワードは bcrypt、セッションはランダムトークン
-- 何度実行しても壊れないように書いてある（既存データは残る）
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists app;

-- ---------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------
create table if not exists app.users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique check (username ~ '^[a-z0-9_.-]{2,32}$'),
  display_name  text not null check (char_length(display_name) between 1 and 40),
  role          text not null check (role in ('player', 'compe_admin', 'super_admin')),
  status        text not null default 'active' check (status in ('active', 'suspended')),
  password_hash text not null,
  failed_count  int  not null default 0,
  locked_until  timestamptz,
  created_by    uuid references app.users(id),
  created_at    timestamptz not null default now()
);

create table if not exists app.sessions (
  token_hash  text primary key,
  user_id     uuid not null references app.users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists sessions_user_idx on app.sessions(user_id);

create table if not exists app.competitions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 80),
  event_date    date not null,
  course        text not null default '',
  status        text not null default 'preparing' check (status in ('preparing', 'active', 'finished')),
  local_rules   text not null default '',
  public_token  text not null unique,
  version       bigint not null default 1,
  created_by    uuid not null references app.users(id),
  created_at    timestamptz not null default now()
);

create table if not exists app.groups (
  id          uuid primary key default gen_random_uuid(),
  compe_id    uuid not null references app.competitions(id) on delete cascade,
  number      int  not null check (number between 1 and 99),
  start_time  text not null default '',
  unique (compe_id, number)
);

create table if not exists app.participants (
  compe_id  uuid not null references app.competitions(id) on delete cascade,
  user_id   uuid not null references app.users(id),
  group_id  uuid references app.groups(id) on delete set null,
  primary key (compe_id, user_id)
);

create table if not exists app.hole_settings (
  compe_id  uuid not null references app.competitions(id) on delete cascade,
  hole      int  not null check (hole between 1 and 18),
  kind      text not null check (kind in ('english', 'longest', 'nearest')),
  primary key (compe_id, hole, kind)
);

-- compe_id が null の行は全コンペ共通の標準の罰
create table if not exists app.penalty_types (
  id            uuid primary key default gen_random_uuid(),
  compe_id      uuid references app.competitions(id) on delete cascade,
  code          text unique,
  name          text not null check (char_length(name) between 1 and 30),
  sort          int  not null default 0,
  english_only  boolean not null default false
);

create table if not exists app.penalty_counts (
  compe_id         uuid not null references app.competitions(id) on delete cascade,
  user_id          uuid not null references app.users(id),
  hole             int  not null check (hole between 1 and 18),
  penalty_type_id  uuid not null references app.penalty_types(id) on delete cascade,
  count            int  not null default 0 check (count >= 0),
  updated_by       uuid references app.users(id),
  updated_at       timestamptz not null default now(),
  primary key (compe_id, user_id, hole, penalty_type_id)
);

create table if not exists app.contest_leaders (
  compe_id    uuid not null references app.competitions(id) on delete cascade,
  hole        int  not null check (hole between 1 and 18),
  kind        text not null check (kind in ('longest', 'nearest')),
  user_id     uuid references app.users(id),
  updated_by  uuid references app.users(id),
  updated_at  timestamptz not null default now(),
  primary key (compe_id, hole, kind)
);

create table if not exists app.audit_logs (
  id              bigserial primary key,
  compe_id        uuid not null references app.competitions(id) on delete cascade,
  at              timestamptz not null default now(),
  actor_id        uuid references app.users(id),
  target_user_id  uuid references app.users(id),
  hole            int,
  item            text not null,
  before_val      text,
  after_val       text
);
create index if not exists audit_logs_compe_idx on app.audit_logs(compe_id, at desc);

-- 標準の罰（全コンペ共通）
insert into app.penalty_types (compe_id, code, name, sort, english_only) values
  (null, 'pond',    '池ポチャ',     10, false),
  (null, 'ob',      'OB',           20, false),
  (null, 'putt3',   '3パット',      30, false),
  (null, 'english', '英語禁止発話', 40, true)
on conflict (code) do nothing;

-- 念のため RLS を有効化（ポリシーなし＝API から直接は一切読めない）
alter table app.users           enable row level security;
alter table app.sessions        enable row level security;
alter table app.competitions    enable row level security;
alter table app.groups          enable row level security;
alter table app.participants    enable row level security;
alter table app.hole_settings   enable row level security;
alter table app.penalty_types   enable row level security;
alter table app.penalty_counts  enable row level security;
alter table app.contest_leaders enable row level security;
alter table app.audit_logs      enable row level security;

-- ---------------------------------------------------------------------
-- 内部用の関数（app スキーマ、画面からは呼べない）
-- ---------------------------------------------------------------------
create or replace function app.err(p_code text) returns void
language plpgsql as $$
begin
  raise exception '%', p_code using errcode = 'P0001';
end $$;

create or replace function app.hash_token(p_token text) returns text
language sql immutable as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

create or replace function app.today_jst() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Tokyo')::date
$$;

create or replace function app.require_user(p_token text) returns app.users
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users;
begin
  select usr.* into u
    from app.sessions s join app.users usr on usr.id = s.user_id
   where s.token_hash = app.hash_token(p_token) and s.expires_at > now();
  if not found or u.status <> 'active' then
    perform app.err('not_authenticated');
  end if;
  return u;
end $$;

create or replace function app.require_admin(p_token text) returns app.users
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users;
begin
  u := app.require_user(p_token);
  if u.role not in ('compe_admin', 'super_admin') then perform app.err('forbidden'); end if;
  return u;
end $$;

create or replace function app.get_compe(p_id uuid) returns app.competitions
language plpgsql security definer set search_path = app, public, extensions as $$
declare c app.competitions;
begin
  select * into c from app.competitions where id = p_id;
  if not found then perform app.err('not_found'); end if;
  return c;
end $$;

create or replace function app.can_manage(u app.users, c app.competitions) returns boolean
language sql stable as $$
  select u.role = 'super_admin' or (u.role = 'compe_admin' and c.created_by = u.id)
$$;

create or replace function app.can_input(u app.users, c app.competitions) returns boolean
language sql stable security definer set search_path = app, public, extensions as $$
  select app.can_manage(u, c)
      or exists (select 1 from app.participants p where p.compe_id = c.id and p.user_id = u.id)
$$;

create or replace function app.bump(p_compe uuid) returns bigint
language sql security definer set search_path = app, public, extensions as $$
  update app.competitions set version = version + 1 where id = p_compe returning version
$$;

create or replace function app.user_json(u app.users) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', u.id, 'username', u.username,
                            'display_name', u.display_name, 'role', u.role)
$$;

create or replace function app.check_password(p text) returns void
language plpgsql as $$
begin
  if p is null or char_length(p) < 6 or char_length(p) > 72 then
    perform app.err('weak_password');
  end if;
end $$;

-- 全コンペで共通の「コンペの中身」（入力画面とダッシュボードで使う）
create or replace function app.compe_body(c app.competitions) returns jsonb
language sql stable security definer set search_path = app, public, extensions as $$
  select jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'number', g.number, 'start_time', g.start_time)
                       order by g.number)
        from app.groups g where g.compe_id = c.id), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', u.id, 'display_name', u.display_name,
                                          'group_id', p.group_id)
                       order by g.number nulls last, u.display_name)
        from app.participants p
        join app.users u on u.id = p.user_id
        left join app.groups g on g.id = p.group_id
       where p.compe_id = c.id), '[]'::jsonb),
    'penalty_types', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'english_only', t.english_only,
                                          'custom', t.compe_id is not null)
                       order by t.sort, t.name)
        from app.penalty_types t where t.compe_id is null or t.compe_id = c.id), '[]'::jsonb),
    'holes', jsonb_build_object(
      'english', coalesce((select jsonb_agg(h.hole order by h.hole) from app.hole_settings h
                            where h.compe_id = c.id and h.kind = 'english'), '[]'::jsonb),
      'longest', coalesce((select jsonb_agg(h.hole order by h.hole) from app.hole_settings h
                            where h.compe_id = c.id and h.kind = 'longest'), '[]'::jsonb),
      'nearest', coalesce((select jsonb_agg(h.hole order by h.hole) from app.hole_settings h
                            where h.compe_id = c.id and h.kind = 'nearest'), '[]'::jsonb)),
    'counts', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', pc.user_id, 'hole', pc.hole,
                                          'type_id', pc.penalty_type_id, 'count', pc.count,
                                          'updated_by', ub.display_name))
        from app.penalty_counts pc
        left join app.users ub on ub.id = pc.updated_by
       where pc.compe_id = c.id and pc.count > 0), '[]'::jsonb),
    'leaders', coalesce((
      select jsonb_agg(jsonb_build_object('hole', l.hole, 'kind', l.kind, 'user_id', l.user_id,
                                          'updated_by', ub.display_name))
        from app.contest_leaders l
        left join app.users ub on ub.id = l.updated_by
       where l.compe_id = c.id), '[]'::jsonb)
  )
$$;

-- 最初の全体管理者を作る（SQL Editor から 1 回だけ実行。画面からは呼べない）
create or replace function app.bootstrap_super_admin(p_username text, p_display_name text, p_password text)
returns text
language plpgsql security definer set search_path = app, public, extensions as $$
begin
  if exists (select 1 from app.users where role = 'super_admin') then
    return '全体管理者は既に登録されています';
  end if;
  perform app.check_password(p_password);
  insert into app.users (username, display_name, role, password_hash)
  values (lower(trim(p_username)), trim(p_display_name), 'super_admin',
          extensions.crypt(p_password, extensions.gen_salt('bf')));
  return '全体管理者を登録しました';
end $$;

-- ---------------------------------------------------------------------
-- 画面から呼ぶ関数（public.api_*）
-- ---------------------------------------------------------------------

-- ログイン：失敗回数を記録するため、例外ではなく結果を返す
create or replace function public.api_login(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users; v_token text;
begin
  select * into u from app.users where username = lower(trim(coalesce(p_username, '')));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'login_failed');
  end if;
  if u.locked_until is not null and u.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if u.password_hash <> extensions.crypt(coalesce(p_password, ''), u.password_hash) then
    if u.failed_count + 1 >= 10 then
      update app.users set failed_count = 0, locked_until = now() + interval '15 minutes' where id = u.id;
    else
      update app.users set failed_count = failed_count + 1 where id = u.id;
    end if;
    return jsonb_build_object('ok', false, 'error', 'login_failed');
  end if;
  if u.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'suspended');
  end if;

  update app.users set failed_count = 0, locked_until = null where id = u.id;
  delete from app.sessions where expires_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into app.sessions (token_hash, user_id, expires_at)
  values (app.hash_token(v_token), u.id, now() + interval '30 days');
  return jsonb_build_object('ok', true, 'token', v_token, 'user', app.user_json(u));
end $$;

create or replace function public.api_logout(p_token text) returns void
language sql security definer set search_path = app, public, extensions as $$
  delete from app.sessions where token_hash = app.hash_token(p_token)
$$;

create or replace function public.api_me(p_token text) returns jsonb
language plpgsql security definer set search_path = app, public, extensions as $$
begin
  return app.user_json(app.require_user(p_token));
end $$;

create or replace function public.api_change_password(p_token text, p_old text, p_new text) returns void
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users;
begin
  u := app.require_user(p_token);
  if u.password_hash <> extensions.crypt(coalesce(p_old, ''), u.password_hash) then
    perform app.err('wrong_password');
  end if;
  perform app.check_password(p_new);
  update app.users set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf')) where id = u.id;
  delete from app.sessions where user_id = u.id and token_hash <> app.hash_token(p_token);
end $$;

-- ユーザー管理 --------------------------------------------------------
create or replace function public.api_list_users(p_token text) returns jsonb
language plpgsql security definer set search_path = app, public, extensions as $$
begin
  perform app.require_admin(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'username', username, 'display_name', display_name,
                                        'role', role, 'status', status) order by display_name)
      from app.users), '[]'::jsonb);
end $$;

create or replace function public.api_create_user(p_token text, p_username text, p_display_name text,
                                                  p_password text, p_role text) returns uuid
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users; v_id uuid; v_username text := lower(trim(coalesce(p_username, '')));
begin
  u := app.require_admin(p_token);
  if p_role not in ('player', 'compe_admin') then perform app.err('invalid_input'); end if;
  if p_role = 'compe_admin' and u.role <> 'super_admin' then perform app.err('forbidden'); end if;
  if v_username !~ '^[a-z0-9_.-]{2,32}$' then perform app.err('invalid_username'); end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 40 then
    perform app.err('invalid_input');
  end if;
  perform app.check_password(p_password);
  if exists (select 1 from app.users where username = v_username) then
    perform app.err('username_taken');
  end if;
  insert into app.users (username, display_name, role, password_hash, created_by)
  values (v_username, trim(p_display_name), p_role,
          extensions.crypt(p_password, extensions.gen_salt('bf')), u.id)
  returning id into v_id;
  return v_id;
end $$;

-- 表示名・ロール・状態の変更
--  コンペ管理者：一般ユーザーの表示名だけ
--  全体管理者  ：一般ユーザーとコンペ管理者のすべて（自分の表示名も可）
create or replace function public.api_update_user(p_token text, p_user_id uuid, p_display_name text,
                                                  p_role text, p_status text) returns void
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users; t app.users;
begin
  u := app.require_admin(p_token);
  select * into t from app.users where id = p_user_id;
  if not found then perform app.err('not_found'); end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 1 and 40 then
    perform app.err('invalid_input');
  end if;

  if t.role = 'super_admin' then
    if u.id <> t.id or p_role <> t.role or p_status <> t.status then perform app.err('forbidden'); end if;
  elsif u.role = 'compe_admin' then
    if t.role <> 'player' or p_role <> t.role or p_status <> t.status then perform app.err('forbidden'); end if;
  else
    if p_role not in ('player', 'compe_admin') or p_status not in ('active', 'suspended') then
      perform app.err('invalid_input');
    end if;
  end if;

  update app.users set display_name = trim(p_display_name), role = p_role, status = p_status
   where id = t.id;
  if p_status = 'suspended' then delete from app.sessions where user_id = t.id; end if;
end $$;

create or replace function public.api_reset_password(p_token text, p_user_id uuid, p_new text) returns void
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users; t app.users;
begin
  u := app.require_admin(p_token);
  select * into t from app.users where id = p_user_id;
  if not found then perform app.err('not_found'); end if;
  if t.role = 'super_admin' and t.id <> u.id then perform app.err('forbidden'); end if;
  if u.role = 'compe_admin' and t.role <> 'player' then perform app.err('forbidden'); end if;
  perform app.check_password(p_new);
  update app.users set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf')),
                       failed_count = 0, locked_until = null
   where id = t.id;
  if t.id <> u.id then delete from app.sessions where user_id = t.id; end if;
end $$;

-- コンペ --------------------------------------------------------------
create or replace function public.api_my_competitions(p_token text) returns jsonb
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users;
begin
  u := app.require_user(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'event_date', c.event_date,
                                        'course', c.course, 'status', c.status)
                     order by c.event_date, c.name)
      from app.competitions c
     where c.status in ('preparing', 'active')
       and exists (select 1 from app.participants p where p.compe_id = c.id and p.user_id = u.id)
  ), '[]'::jsonb);
end $$;

create or replace function public.api_admin_competitions(p_token text) returns jsonb
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users;
begin
  u := app.require_admin(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'name', c.name, 'event_date', c.event_date, 'course', c.course,
             'status', c.status, 'public_token', c.public_token, 'creator', cu.display_name,
             'participants', (select count(*) from app.participants p where p.compe_id = c.id))
           order by c.event_date desc, c.name)
      from app.competitions c join app.users cu on cu.id = c.created_by
     where app.can_manage(u, c)
  ), '[]'::jsonb);
end $$;

create or replace function public.api_create_competition(p_token text, p_name text, p_event_date date,
                                                         p_course text) returns uuid
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users; v_id uuid;
begin
  u := app.require_admin(p_token);
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 80 or p_event_date is null then
    perform app.err('invalid_input');
  end if;
  insert into app.competitions (name, event_date, course, public_token, created_by)
  values (trim(p_name), p_event_date, trim(coalesce(p_course, '')),
          encode(extensions.gen_random_bytes(18), 'hex'), u.id)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.api_get_competition_admin(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users; c app.competitions;
begin
  u := app.require_admin(p_token);
  c := app.get_compe(p_id);
  if not app.can_manage(u, c) then perform app.err('forbidden'); end if;
  return jsonb_build_object(
    'id', c.id, 'name', c.name, 'event_date', c.event_date, 'course', c.course,
    'status', c.status, 'local_rules', c.local_rules, 'public_token', c.public_token,
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'number', g.number, 'start_time', g.start_time,
               'members', coalesce((select jsonb_agg(p.user_id) from app.participants p
                                     where p.group_id = g.id), '[]'::jsonb))
             order by g.number)
        from app.groups g where g.compe_id = c.id), '[]'::jsonb),
    'holes', (app.compe_body(c))->'holes',
    'custom_penalties', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name,
               'used', (select coalesce(sum(pc.count), 0) from app.penalty_counts pc
                         where pc.penalty_type_id = t.id))
             order by t.sort)
        from app.penalty_types t where t.compe_id = c.id), '[]'::jsonb)
  );
end $$;

-- コンペ設定をまとめて保存
-- p_data = { name, event_date, course, status, local_rules,
--            groups: [{number, start_time, members: [user_id]}],
--            holes: {english: [int], longest: [int], nearest: [int]},
--            custom_penalties: [{id?: uuid, name}] }
create or replace function public.api_save_competition(p_token text, p_id uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = app, public, extensions as $$
declare
  u app.users; c app.competitions;
  g jsonb; m jsonb; v_gid uuid; k text; h jsonb; i int := 0; v_keep uuid[] := '{}';
begin
  u := app.require_admin(p_token);
  c := app.get_compe(p_id);
  if not app.can_manage(u, c) then perform app.err('forbidden'); end if;

  if char_length(trim(coalesce(p_data->>'name', ''))) not between 1 and 80
     or (p_data->>'event_date') is null
     or coalesce(p_data->>'status', '') not in ('preparing', 'active', 'finished') then
    perform app.err('invalid_input');
  end if;

  update app.competitions
     set name = trim(p_data->>'name'),
         event_date = (p_data->>'event_date')::date,
         course = trim(coalesce(p_data->>'course', '')),
         status = p_data->>'status',
         local_rules = coalesce(p_data->>'local_rules', '')
   where id = c.id;

  -- 組と参加者（同じ人が 2 つの組に入っていたらエラー）
  if (select count(*) from jsonb_array_elements(coalesce(p_data->'groups', '[]')) g2,
                           jsonb_array_elements_text(coalesce(g2->'members', '[]')) m2)
     <> (select count(distinct m2) from jsonb_array_elements(coalesce(p_data->'groups', '[]')) g2,
                                        jsonb_array_elements_text(coalesce(g2->'members', '[]')) m2) then
    perform app.err('duplicate_member');
  end if;

  delete from app.participants where compe_id = c.id;
  delete from app.groups where compe_id = c.id;
  for g in select * from jsonb_array_elements(coalesce(p_data->'groups', '[]')) loop
    insert into app.groups (compe_id, number, start_time)
    values (c.id, (g->>'number')::int, coalesce(g->>'start_time', ''))
    returning id into v_gid;
    for m in select * from jsonb_array_elements(coalesce(g->'members', '[]')) loop
      insert into app.participants (compe_id, user_id, group_id)
      values (c.id, (m #>> '{}')::uuid, v_gid);
    end loop;
  end loop;

  -- 対象ホール
  delete from app.hole_settings where compe_id = c.id;
  foreach k in array array['english', 'longest', 'nearest'] loop
    for h in select * from jsonb_array_elements(coalesce(p_data->'holes'->k, '[]')) loop
      insert into app.hole_settings (compe_id, hole, kind)
      values (c.id, (h #>> '{}')::int, k) on conflict do nothing;
    end loop;
  end loop;

  -- オリジナル罰（リストにないものは削除。記録済みの回数も消える）
  for g in select * from jsonb_array_elements(coalesce(p_data->'custom_penalties', '[]')) loop
    i := i + 1;
    if char_length(trim(coalesce(g->>'name', ''))) not between 1 and 30 then
      perform app.err('invalid_input');
    end if;
    if (g->>'id') is not null
       and exists (select 1 from app.penalty_types where id = (g->>'id')::uuid and compe_id = c.id) then
      update app.penalty_types set name = trim(g->>'name'), sort = 100 + i where id = (g->>'id')::uuid;
      v_keep := v_keep || (g->>'id')::uuid;
    else
      insert into app.penalty_types (compe_id, name, sort)
      values (c.id, trim(g->>'name'), 100 + i) returning id into v_gid;
      v_keep := v_keep || v_gid;
    end if;
  end loop;
  delete from app.penalty_types where compe_id = c.id and not (id = any(v_keep));

  perform app.bump(c.id);
exception
  when unique_violation then perform app.err('invalid_input');
  when foreign_key_violation then perform app.err('invalid_input');
  when invalid_text_representation then perform app.err('invalid_input');
  when check_violation then perform app.err('invalid_input');
end $$;

-- 入力画面 ------------------------------------------------------------
create or replace function public.api_competition_state(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users; c app.competitions; v_manage boolean;
begin
  u := app.require_user(p_token);
  c := app.get_compe(p_id);
  if not app.can_input(u, c) then perform app.err('forbidden'); end if;
  v_manage := app.can_manage(u, c);
  return app.compe_body(c) || jsonb_build_object(
    'compe', jsonb_build_object(
      'id', c.id, 'name', c.name, 'event_date', c.event_date, 'course', c.course,
      'status', c.status, 'local_rules', c.local_rules, 'version', c.version,
      'can_manage', v_manage, 'public_token', c.public_token),
    'my_group_id', (select p.group_id from app.participants p where p.compe_id = c.id and p.user_id = u.id)
  );
end $$;

create or replace function public.api_version(p_token text, p_id uuid) returns bigint
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users; c app.competitions;
begin
  u := app.require_user(p_token);
  c := app.get_compe(p_id);
  if not app.can_input(u, c) then perform app.err('forbidden'); end if;
  return c.version;
end $$;

create or replace function public.api_add_penalty(p_token text, p_compe_id uuid, p_user_id uuid, p_hole int,
                                                  p_type_id uuid, p_delta int) returns jsonb
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users; c app.competitions; t app.penalty_types; v_before int; v_after int; v_ver bigint;
begin
  u := app.require_user(p_token);
  c := app.get_compe(p_compe_id);
  if not app.can_input(u, c) then perform app.err('forbidden'); end if;
  if c.status = 'finished' then perform app.err('compe_finished'); end if;
  if p_delta not in (-1, 1) or p_hole not between 1 and 18 then perform app.err('invalid_input'); end if;
  if not exists (select 1 from app.participants where compe_id = c.id and user_id = p_user_id) then
    perform app.err('invalid_input');
  end if;
  select * into t from app.penalty_types where id = p_type_id and (compe_id is null or compe_id = c.id);
  if not found then perform app.err('invalid_input'); end if;
  if t.english_only and not exists (select 1 from app.hole_settings
                                     where compe_id = c.id and hole = p_hole and kind = 'english') then
    perform app.err('not_english_hole');
  end if;

  select count into v_before from app.penalty_counts
   where compe_id = c.id and user_id = p_user_id and hole = p_hole and penalty_type_id = t.id
   for update;
  v_before := coalesce(v_before, 0);
  v_after := greatest(0, v_before + p_delta);
  if v_after = v_before then
    return jsonb_build_object('count', v_after, 'version', c.version);
  end if;

  insert into app.penalty_counts (compe_id, user_id, hole, penalty_type_id, count, updated_by, updated_at)
  values (c.id, p_user_id, p_hole, t.id, v_after, u.id, now())
  on conflict (compe_id, user_id, hole, penalty_type_id)
  do update set count = greatest(0, app.penalty_counts.count + p_delta), updated_by = u.id, updated_at = now()
  returning count into v_after;

  insert into app.audit_logs (compe_id, actor_id, target_user_id, hole, item, before_val, after_val)
  values (c.id, u.id, p_user_id, p_hole, t.name, v_before::text, v_after::text);
  v_ver := app.bump(c.id);
  return jsonb_build_object('count', v_after, 'version', v_ver);
end $$;

create or replace function public.api_set_leader(p_token text, p_compe_id uuid, p_hole int, p_kind text,
                                                 p_user_id uuid) returns bigint
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users; c app.competitions; v_before uuid; v_ver bigint;
begin
  u := app.require_user(p_token);
  c := app.get_compe(p_compe_id);
  if not app.can_input(u, c) then perform app.err('forbidden'); end if;
  if c.status = 'finished' then perform app.err('compe_finished'); end if;
  if p_kind not in ('longest', 'nearest') or not exists (
       select 1 from app.hole_settings where compe_id = c.id and hole = p_hole and kind = p_kind) then
    perform app.err('invalid_input');
  end if;
  if p_user_id is not null and not exists (
       select 1 from app.participants where compe_id = c.id and user_id = p_user_id) then
    perform app.err('invalid_input');
  end if;

  select user_id into v_before from app.contest_leaders
   where compe_id = c.id and hole = p_hole and kind = p_kind for update;
  if v_before is not distinct from p_user_id then return c.version; end if;

  insert into app.contest_leaders (compe_id, hole, kind, user_id, updated_by, updated_at)
  values (c.id, p_hole, p_kind, p_user_id, u.id, now())
  on conflict (compe_id, hole, kind)
  do update set user_id = excluded.user_id, updated_by = u.id, updated_at = now();

  insert into app.audit_logs (compe_id, actor_id, target_user_id, hole, item, before_val, after_val)
  values (c.id, u.id, p_user_id, p_hole,
          case p_kind when 'longest' then 'ドラコン' else 'ニアピン' end,
          coalesce((select display_name from app.users where id = v_before), 'なし'),
          coalesce((select display_name from app.users where id = p_user_id), 'なし'));
  v_ver := app.bump(c.id);
  return v_ver;
end $$;

create or replace function public.api_logs(p_token text, p_compe_id uuid) returns jsonb
language plpgsql security definer set search_path = app, public, extensions as $$
declare u app.users; c app.competitions;
begin
  u := app.require_admin(p_token);
  c := app.get_compe(p_compe_id);
  if not app.can_manage(u, c) then perform app.err('forbidden'); end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.at desc, x.id desc) from (
      select l.id, l.at, a.display_name as actor, t.display_name as target, l.hole, l.item,
             l.before_val, l.after_val
        from app.audit_logs l
        left join app.users a on a.id = l.actor_id
        left join app.users t on t.id = l.target_user_id
       where l.compe_id = c.id
       order by l.at desc, l.id desc
       limit 2000) x
  ), '[]'::jsonb);
end $$;

-- 公開ダッシュボード（ログイン不要。開催日の 30 日後まで）----------------
create or replace function public.api_dashboard(p_public_token text) returns jsonb
language plpgsql security definer set search_path = app, public, extensions as $$
declare c app.competitions;
begin
  select * into c from app.competitions where public_token = p_public_token;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if app.today_jst() > c.event_date + 30 then return jsonb_build_object('error', 'expired'); end if;
  return app.compe_body(c) || jsonb_build_object(
    'compe', jsonb_build_object(
      'name', c.name, 'event_date', c.event_date, 'course', c.course, 'status', c.status,
      'local_rules', c.local_rules, 'version', c.version));
end $$;

create or replace function public.api_dashboard_version(p_public_token text) returns bigint
language plpgsql security definer set search_path = app, public, extensions as $$
declare c app.competitions;
begin
  select * into c from app.competitions where public_token = p_public_token;
  if not found or app.today_jst() > c.event_date + 30 then return -1; end if;
  return c.version;
end $$;

-- ---------------------------------------------------------------------
-- 権限：app スキーマは誰にも見せず、api_* だけ実行可能にする
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  execute 'revoke all on schema app from public';
  for r in select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as sig,
                  n.nspname as ns, p.proname as name
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'app') or (n.nspname = 'public' and p.proname like 'api\_%')
  loop
    execute 'revoke all on function ' || r.sig || ' from public';
    if r.ns = 'public' then
      if exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'grant execute on function ' || r.sig || ' to anon, authenticated';
      end if;
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema app from anon, authenticated';
    execute 'revoke all on schema app from anon, authenticated';
  end if;
end $$;
