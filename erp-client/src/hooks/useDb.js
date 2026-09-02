// Generic async data hook for Supabase queries.
// Usage: const { data, loading, error, refetch } = useDb(() => hrDb.getEmployees());
import { useState, useEffect, useCallback } from 'react';
import { useDataScope } from '../context/DataScopeContext';

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

// useDb for a list that honours the archive cutoff.
//
//   useScopedDb(scope => salesDb.getSalesInvoices(companyId, scope), [companyId])
//
// The fetcher receives the current scope and hands it to the db function; the scope's
// mode and company are appended to `deps` here, so flipping "include archived years"
// refetches every scoped list on its own.
//
// Appending the dep is the point of the wrapper. useDb re-runs on a change to `deps`
// and on nothing else, and a missing dep produces no error — just a list that quietly
// keeps showing the previous scope's rows. Callers cannot forget what they do not write.
//
// Use plain useDb wherever the cutoff must NOT apply: report aggregates, ledger reports
// with their own date range, and every document picker. The distinction is visible at
// the call site, which is the only place that knows which kind of read it is making.
export function useScopedDb(fetcher, deps = []) {
  const { scope } = useDataScope();
  return useDb(
    () => fetcher(scope),
    [...deps, scope?.mode, scope?.companyId],
  );
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
