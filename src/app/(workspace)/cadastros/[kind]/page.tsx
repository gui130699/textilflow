import { CatalogPage } from "@/features/catalogs/catalog-page";
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
  return <CatalogPage kind={kind} />;
}
