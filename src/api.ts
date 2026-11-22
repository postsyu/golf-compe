import type { User } from './types';

// URL は「https://xxx.supabase.co」「…/」「…/rest/v1」のどれで登録されていても動くようにそろえる
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?.trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/, '');
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** Supabase のデータベース関数（public.api_*）を呼ぶ */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new ApiError('config');
  const headers: Record<string, string> = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  // 旧形式の anon key（JWT）は Authorization にも入れる。新形式の publishable key は apikey だけでよい
  if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
    });
  } catch {
    throw new ApiError('network');
  }
  const text = await res.text();
  if (!res.ok) {
    let code = 'unknown';
    try {
      const body = JSON.parse(text);
      if (body?.code === 'P0001' && typeof body.message === 'string') code = body.message;
    } catch {
      /* 何もしない */
    }
    if (code === 'not_authenticated') clearSession();
    throw new ApiError(code);
  }
  return (text ? JSON.parse(text) : null) as T;
}

// ---- セッション（端末に保存） ---------------------------------------------
const TOKEN_KEY = 'golf-compe.token';
const USER_KEY = 'golf-compe.user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): User | null {
  try {
    const s = localStorage.getItem(USER_KEY);
    return s ? (JSON.parse(s) as User) : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('golf-compe-session'));
}

/** ログイン中のトークンを付けて呼ぶ */
export function authed<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return rpc<T>(fn, { p_token: getToken() ?? '', ...args });
}

export function isAdmin(user: User | null): boolean {
  return !!user && (user.role === 'compe_admin' || user.role === 'super_admin');
}

export function dashboardUrl(publicToken: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}#/d/${publicToken}`;
}
