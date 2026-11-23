import { useEffect, useState } from 'react';

/** URL の # 以降（例: "/c/xxxx"）。GitHub Pages でも再読み込みで 404 にならないようハッシュ方式にしている */
function currentPath(): string {
  const h = location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath);
  const [, setTick] = useState(0);
  useEffect(() => {
    const on = () => {
      setPath(currentPath());
      setTick((n) => n + 1);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}

export function navigate(path: string) {
  if (currentPath() !== path) location.hash = path;
  // 同じパスでも画面を描き直す（ログイン直後など、表示すべき画面が変わっている場合がある）
  else window.dispatchEvent(new HashChangeEvent('hashchange'));
  window.scrollTo(0, 0);
}

/** "/c/:id" のようなパターンに一致したらパラメータを返す */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/');
  const a = path.split('/');
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}
