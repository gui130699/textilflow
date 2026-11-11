"use client";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
export function useLabels(
  companyId: string | undefined,
  references: [string, string][],
) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const serialized = JSON.stringify(
    [
      ...new Set(
        references.filter(([, id]) => id).map(([kind, id]) => `${kind}/${id}`),
      ),
    ].sort(),
  );
  useEffect(() => {
    if (!companyId) return;
    let active = true;
    const paths = JSON.parse(serialized) as string[];
    Promise.all(
      paths.map(async (p) => {
        const snapshot = await getDoc(doc(db, `companies/${companyId}/${p}`));
        return [p, snapshot.get("name") ?? p.split("/")[1]];
      }),
    )
      .then((values) => {
        if (active) setLabels(Object.fromEntries(values));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [companyId, serialized]);
  return (kind: string, id: unknown) =>
    labels[`${kind}/${id}`] || String(id || "—");
}
