import Link from "next/link";
import { ProjectsPage } from "@/features/projects/projects-page";
import { Button } from "@/components/ui/button";
export default function Page() {
  return (
    <>
      <nav aria-label="Áreas de produção" className="mb-5 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/projetos">OFs e projetos anteriores</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/inspecoes">Inspeções</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/expedicao">Expedição</Link>
        </Button>
      </nav>
      <ProjectsPage mode="production" />
    </>
  );
}
