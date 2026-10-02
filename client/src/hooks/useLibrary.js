import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchStats,
  fetchTaxonomy,
  fetchBookmarks,
  fetchNotes,
  fetchCrossRelations
} from '../api';

const EMPTY_LIBRARY = {
  bookmarks: [],
  notes: [],
  stats: null,
  taxonomy: null,
  relations: [],
  version: 0
};

async function fetchLibrary(signal) {
  const [stats, taxonomy, bookmarks, notes, relations] = await Promise.all([
    fetchStats(signal),
    fetchTaxonomy(signal),
    fetchBookmarks({}, signal),
    fetchNotes({}, signal),
    fetchCrossRelations(signal)
  ]);
  return { stats, taxonomy, bookmarks, notes, relations };
}

function isAbort(err) {
  return err?.name === 'AbortError';
}

/**
 * All library data in one place.
 *
 * - `library` is always the complete, unfiltered collection: the graph,
 *   wikilinks and the link picker must never depend on the active filter.
 * - `visibleBookmarks` / `visibleNotes` are the filtered lists for the
 *   collection pages. Only they are refetched when the search or filters
 *   change, and a newer search aborts the older one so results never arrive
 *   out of order. While a search runs, the previous results stay on screen.
 *
 * @param {{category?: string, subcategory?: string, theme?: string, tag?: string, q?: string}} activeFilters
 */
export function useLibrary(activeFilters) {
  const [library, setLibrary] = useState(EMPTY_LIBRARY);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const libraryRequestRef = useRef(null);

  const applyLibrary = useCallback((data) => {
    setLibrary(prev => ({ ...data, version: prev.version + 1 }));
    setError(null);
    setIsInitialLoading(false);
  }, []);

  const applyLibraryError = useCallback(() => {
    setError('No se pudo conectar con el servidor local SQLite.');
    setIsInitialLoading(false);
  }, []);

  /** Reloads everything; await it after a mutation. */
  const refresh = useCallback(async () => {
    libraryRequestRef.current?.abort();
    const controller = new AbortController();
    libraryRequestRef.current = controller;
    try {
      applyLibrary(await fetchLibrary(controller.signal));
    } catch (err) {
      if (!isAbort(err)) applyLibraryError();
    }
  }, [applyLibrary, applyLibraryError]);

  useEffect(() => {
    const controller = new AbortController();
    libraryRequestRef.current = controller;
    fetchLibrary(controller.signal)
      .then(applyLibrary)
      .catch(err => !isAbort(err) && applyLibraryError());
    return () => controller.abort();
  }, [applyLibrary, applyLibraryError]);

  // Filtered lists, keyed by the filter set they answer.
  const filterKey = JSON.stringify(activeFilters);
  const isFiltered = Object.values(activeFilters).some(Boolean);
  const [filtered, setFiltered] = useState(null);

  useEffect(() => {
    if (!isFiltered) return undefined;
    const filters = JSON.parse(filterKey);
    const controller = new AbortController();
    Promise.all([
      fetchBookmarks(filters, controller.signal),
      fetchNotes(filters, controller.signal)
    ])
      .then(([bookmarks, notes]) => setFiltered({ key: filterKey, bookmarks, notes, error: null }))
      .catch(err => {
        if (!isAbort(err)) setFiltered(prev => ({ ...(prev || { bookmarks: [], notes: [] }), key: filterKey, error: err.message }));
      });
    return () => controller.abort();
    // library.version: refetch the filtered lists after every mutation too
  }, [filterKey, isFiltered, library.version]);

  const hasFilteredResults = isFiltered && filtered !== null;

  return {
    library,
    visibleBookmarks: !isFiltered ? library.bookmarks : hasFilteredResults ? filtered.bookmarks : [],
    visibleNotes: !isFiltered ? library.notes : hasFilteredResults ? filtered.notes : [],
    // Skeleton only when there is nothing sensible to show yet.
    isLoading: isInitialLoading || (isFiltered && !hasFilteredResults),
    // A newer search is in flight while older results remain visible.
    isRefreshing: isFiltered && hasFilteredResults && filtered.key !== filterKey,
    error: error || (isFiltered && filtered?.key === filterKey ? filtered.error : null),
    refresh
  };
}
