// Generic async data hook for Supabase queries.
// Usage: const { data, loading, error, refetch } = useDb(() => hrDb.getEmployees());
import { useState, useEffect, useCallback } from 'react';

export function useDb(fetcher, deps = []) {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Which deps the data in hand was fetched for. `loading` alone cannot answer
  // "is this result current?" for a chained query — one whose deps are built from
  // another query's result. Those deps change during render, but the effect that
  // acts on them runs after the commit, so for one painted frame the query reports
  // loading:false while still holding the previous query's answer. Callers that
  // chain should gate on `settled`, which is false across that gap.
  const key = JSON.stringify(deps);
  const [settledKey, setSettledKey] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: result, error: err } = await fetcher();
    if (err) {
      setError(err.message);
      setData([]);
    } else {
      setData(result ?? []);
    }
    setSettledKey(key);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { fetch(); }, [fetch]);

  // Also false while a fetch is in flight, so an explicit refetch() - which reuses the
  // same key - still reads as unsettled rather than instantly "done".
  return { data, loading, error, refetch: fetch, settled: !loading && settledKey === key };
}

export function useDbSingle(fetcher, deps = []) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: result, error: err } = await fetcher();
    if (err) {
      setError(err.message);
      setData(null);
    } else {
      setData(result ?? null);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
