"use client";

import { useSearchParams } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { CatalogPage } from "./catalog-page";

export function CompanyCatalog() {
  const { canCreate } = useSession();
  const openNew = useSearchParams().get("novo") === "1" && canCreate;
  return (
    <CatalogPage key={String(openNew)} kind="companies" openNew={openNew} />
  );
}
