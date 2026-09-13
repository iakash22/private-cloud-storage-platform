import { useCallback, useEffect, useState } from 'react';
import type {
  PublicBucket,
  PublicObjectListPage,
  PublicObjectListFilters,
  PublicStorageObject,
  PublicStorageProvider,
} from '@vaultstack/types';
import { apiClient } from '../lib/api.js';

export function useBuckets() {
  const [buckets, setBuckets] = useState<PublicBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const next = await apiClient.listBuckets();
      setBuckets(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load buckets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { buckets, loading, error, refresh };
}

export function useStorageProviders() {
  const [providers, setProviders] = useState<PublicStorageProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const next = await apiClient.listStorageProviders();
      setProviders(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load storage providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { providers, loading, error, refresh };
}

export function useObjectList(
  bucketId?: string,
  prefix = '',
  search = '',
  filters: PublicObjectListFilters = {},
) {
  const [page, setPage] = useState<PublicObjectListPage | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => { window.clearTimeout(timer); };
  }, [search]);

  const refresh = useCallback(async () => {
    if (!bucketId) {
      setPage(undefined);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const next = await apiClient.listObjects(bucketId, {
        prefix,
        search: debouncedSearch || undefined,
        delimiter: '/',
        limit: 100,
        ...filters,
      });
      setPage(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load objects');
    } finally {
      setLoading(false);
    }
  }, [bucketId, prefix, debouncedSearch, filters]);

  const loadMore = useCallback(async () => {
    if (!bucketId || !page?.nextCursor) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const next = await apiClient.listObjects(bucketId, {
        prefix,
        search: debouncedSearch || undefined,
        delimiter: '/',
        limit: 100,
        cursor: page.nextCursor,
        ...filters,
      });

      setPage((current) =>
        current
          ? {
              ...next,
              objects: [...current.objects, ...next.objects],
              prefixes: [...new Set([...current.prefixes, ...next.prefixes])],
              folders: [
                ...new Map(
                  [...current.folders, ...next.folders].map((folder) => [
                    folder.prefix,
                    folder,
                  ]),
                ).values(),
              ],
            }
          : next,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load objects');
    } finally {
      setLoading(false);
    }
  }, [bucketId, prefix, debouncedSearch, filters, page?.nextCursor]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { page, loading, error, refresh, loadMore };
}

export function useSelectedObject(objectId?: string) {
  const [object, setObject] = useState<PublicStorageObject | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!objectId) {
      setObject(undefined);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void apiClient
      .getObject(objectId)
      .then((result) => {
        if (!cancelled) {
          setObject(result);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Unable to load object');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [objectId]);

  return { object, loading, error };
}

export async function computeUsageSummary(buckets: PublicBucket[]) {
  let totalBytes = 0;
  let objectCount = 0;

  for (const bucket of buckets) {
    let cursor: string | undefined;

    do {
      const page = await apiClient.listObjects(bucket.id, {
        limit: 100,
        cursor,
      });

      for (const object of page.objects) {
        totalBytes += object.size;
        objectCount += 1;
      }

      cursor = page.isTruncated ? (page.nextCursor ?? undefined) : undefined;
    } while (cursor);
  }

  return {
    totalBytes,
    objectCount,
    bucketCount: buckets.length,
  };
}
