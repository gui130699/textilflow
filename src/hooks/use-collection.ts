"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Row } from "@/types";
import { errorMessage } from "@/lib/utils";
export function useCollection(
  path: string | null,
  search = "",
  active = "all",
  sort = "searchName",
  visibleOnly = false,
  statusFilter = "",
) {
  const generation = useRef(0);
  const [rows, setRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [more, setMore] = useState(false),
    [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null),
    [revision, setRevision] = useState(0);
  const fetchPage = useCallback(
    async (after: QueryDocumentSnapshot | null) => {
      if (!path) return;
      const requestGeneration = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const constraints: QueryConstraint[] = [];
        if (visibleOnly) constraints.push(where("ownerVisible", "==", true));
        if (statusFilter) constraints.push(where("status", "==", statusFilter));
        if (active !== "all")
          constraints.push(where("active", "==", active === "active"));
        if (search && sort === "searchName") {
          const s = search.toLocaleLowerCase("pt-BR");
          constraints.push(
            where("searchName", ">=", s),
            where("searchName", "<=", s + "\uf8ff"),
          );
        }
        constraints.push(orderBy(sort, sort === "searchName" ? "asc" : "desc"));
        if (after) constraints.push(startAfter(after));
        constraints.push(limit(25));
        const result = await getDocs(
          query(collection(db, path), ...constraints),
        );
        if (requestGeneration !== generation.current) return;
        setRows((old) =>
          after
            ? [...old, ...result.docs.map((d) => ({ id: d.id, ...d.data() }))]
            : result.docs.map((d) => ({ id: d.id, ...d.data() })),
        );
        setCursor(result.docs.at(-1) ?? null);
        setMore(result.size === 25);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [path, search, active, sort, visibleOnly, statusFilter],
  );
  useEffect(() => {
    // Reset the paginated view when its external Firestore query changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows([]);
    setCursor(null);
    if (path) void fetchPage(null);
    return () => {
      // Invalidate in-flight requests; this ref is a counter, not a DOM reference.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [path, fetchPage, revision]);
  return {
    rows,
    loading,
    error,
    more,
    next: () => fetchPage(cursor),
    reload: () => setRevision((r) => r + 1),
  };
}
