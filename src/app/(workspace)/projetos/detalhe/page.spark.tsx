"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ProjectDetail } from "@/features/projects/project-detail";
import { Loading, Feedback } from "@/components/feedback";

function Detail() {
  const params = useSearchParams();
  const id = params.get("id");
  if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id))
    return <Feedback error="Projeto não encontrado." />;
  return (
    <ProjectDetail
      key={id}
      id={id}
      initialTab={params.get("tab") ?? undefined}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Detail />
    </Suspense>
  );
}
