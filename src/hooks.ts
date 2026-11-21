import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

/**
 * データを読み込み、数秒おきに「版番号」だけを確認して、変わっていたら読み直す。
 * 通信量を抑えつつ、他の人の入力を数秒以内に反映するための仕組み。
 */
export function useLiveData<T>(
  load: () => Promise<T>,
  getVersion: () => Promise<number>,
  versionOf: (data: T) => number,
  intervalMs = 3000,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const dataRef = useRef<T | null>(null);
  const loadRef = useRef(load);
  const verRef = useRef(getVersion);
  loadRef.current = load;
  verRef.current = getVersion;

  const reload = useCallback(async () => {
    try {
      const d = await loadRef.current();
      dataRef.current = d;
      setData(d);
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'unknown');
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === 'visible') {
        try {
          const v = await verRef.current();
          const cur = dataRef.current;
          if (!cur || versionOf(cur) !== v) await reload();
          else setUpdatedAt(new Date());
        } catch (e) {
          setError(e instanceof ApiError ? e.code : 'unknown');
        }
      }
      if (!stopped) timer = window.setTimeout(tick, intervalMs);
    };
    reload().then(() => {
      if (!stopped) timer = window.setTimeout(tick, intervalMs);
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, intervalMs]);

  return { data, setData, error, reload, updatedAt };
}

/** 一度だけ読み込む */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'unknown');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, setData, error, reload };
}
