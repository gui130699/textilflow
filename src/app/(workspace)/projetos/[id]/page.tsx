import { ProjectDetail } from "@/features/projects/project-detail";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  return <ProjectDetail id={id} initialTab={(await searchParams).tab} />;
}
