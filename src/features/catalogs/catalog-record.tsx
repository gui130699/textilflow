"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useSession } from "@/hooks/use-session";
import { Feedback, Loading } from "@/components/feedback";
import type { Row } from "@/types";
import { CatalogPage } from "./catalog-page";

function RecordCatalog({
  kind,
  companyId,
  id,
}: {
  kind: string;
  companyId: string;
  id: string;
}) {
  const [row, setRow] = useState<Row>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getDoc(doc(db, "companies", companyId, kind, id))
      .then((item) => {
        if (!active) return;
        if (item.exists()) setRow({ ...item.data(), id });
        else setError("Registro não encontrado.");
      })
      .catch(() => {
        if (active) setError("Não foi possível abrir o registro.");
      });
    return () => {
      active = false;
    };
  }, [companyId, kind, id]);
  if (error) return <Feedback error={error} />;
  return row ? <CatalogPage kind={kind} initialRecord={row} /> : <Loading />;
}

export function CatalogRecord({ kind }: { kind: string }) {
  const id = useSearchParams().get("registro");
  const { company } = useSession();
  return company && id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? (
    <RecordCatalog key={id} kind={kind} companyId={company.id} id={id} />
  ) : (
    <CatalogPage kind={kind} />
  );
}
