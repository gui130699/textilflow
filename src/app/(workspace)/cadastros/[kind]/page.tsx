import { Suspense } from "react";
import { CatalogPage } from "@/features/catalogs/catalog-page";
import { CompanyCatalog } from "@/features/catalogs/company-catalog";
import { Loading } from "@/components/feedback";
import { catalogs } from "@/config/catalogs";

export function generateStaticParams() {
  return Object.keys(catalogs).map((kind) => ({ kind }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  if (kind === "companies")
    return (
      <Suspense fallback={<Loading />}>
        <CompanyCatalog />
      </Suspense>
    );
  return <CatalogPage kind={kind} />;
}
