import { CatalogPage } from "@/features/catalogs/catalog-page";
export default async function Page({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  return <CatalogPage kind={kind} />;
}
