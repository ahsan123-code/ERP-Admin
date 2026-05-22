// Generic async data hook for Supabase queries.
// Usage: const { data, loading, error, refetch } = useDb(() => hrDb.getEmployees());
import { useState, useEffect, useCallback } from 'react';

export function useDb(fetcher, deps = []) {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

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
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
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
