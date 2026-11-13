"use client";
import { projectUrl } from "@/lib/project-url";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, ArrowUpRight } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { useCollection } from "@/hooks/use-collection";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Feedback, Loading } from "@/components/feedback";
import { ProjectForm } from "./project-form";
import { number, formatDate } from "@/lib/utils";
import { statuses } from "../../../functions/src/domain";
export function ProjectsPage({ mode = "projects" }: { mode?: string }) {
  const { company } = useSession(),
    router = useRouter(),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [creating, setCreating] = useState(false);
  const list = useCollection(
    company ? `companies/${company.id}/projects` : null,
    search,
    "all",
    "searchName",
    false,
    status,
  );
  const title =
    mode === "inspections"
      ? "Inspeções"
      : mode === "production"
        ? "Produção"
        : mode === "dispatch"
          ? "Expedição"
          : "Projetos";
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ACOMPANHAMENTO DA PRODUÇÃO</div>
          <h1>{title}</h1>
          <p>
            {mode === "projects"
              ? "Cada projeto, cada etapa, tudo sob controle."
              : "Selecione um projeto para consultar ou registrar a operação."}
          </p>
        </div>
        {company?.role === "inspector" && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={17} />
            Novo projeto
          </Button>
        )}
      </div>
      <Feedback error={list.error} />
      <div className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Pesquisar projetos"
              placeholder="Pesquisar pelo nome do projeto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="muted">{list.rows.length} projetos carregados</span>
          <select
            aria-label="Filtrar situação do projeto"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todas as situações</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {list.loading && !list.rows.length ? (
          <Loading />
        ) : (
          <DataTable
            rows={list.rows}
            onRow={(p) =>
              router.push(
                projectUrl(
                  p.id,
                  mode === "inspections"
                    ? "inspections"
                    : mode === "production" || mode === "dispatch"
                      ? "production"
                      : "overview",
                ),
              )
            }
            columns={[
              {
                accessorKey: "name",
                header: "Projeto",
                cell: (i) => (
                  <span className="project-name">
                    {String(i.getValue())}
                    <ArrowUpRight size={14} />
                  </span>
                ),
              },
              {
                accessorKey: "status",
                header: "Situação",
                cell: (i) => (
                  <span
                    className={`badge ${i.getValue() === "Concluído" ? "green" : "blue"}`}
                  >
                    {String(i.getValue())}
                  </span>
                ),
              },
              {
                accessorKey: "planned",
                header: "Meta",
                cell: (i) => `${number(i.getValue())} peças`,
              },
              {
                accessorKey: "cut",
                header: "Corte acumulado",
                cell: (i) => number(i.getValue()),
              },
              {
                id: "progress",
                header: "Despacho / meta",
                cell: (i) => {
                  const b = i.row.original.balances as Record<string, number>;
                  const progress = Math.min(
                    100,
                    Math.round(
                      ((b?.despachado ?? 0) / Number(i.row.original.planned)) *
                        100,
                    ),
                  );
                  return (
                    <div className="progress-cell">
                      <div className="progress-track">
                        <i style={{ width: `${progress}%` }} />
                      </div>
                      <span>{progress}%</span>
                    </div>
                  );
                },
              },
              {
                accessorKey: "dueOn",
                header: "Previsão de conclusão",
                cell: (i) => formatDate(i.getValue()),
              },
            ]}
          />
        )}
        <div className="panel-footer">
          <span>Abra um projeto para acompanhar todas as etapas.</span>
          {list.more && (
            <Button variant="outline" onClick={() => list.next()}>
              Carregar mais
            </Button>
          )}
        </div>
      </div>
      {creating && company && (
        <ProjectForm
          companyId={company.id}
          onClose={() => setCreating(false)}
          onSaved={(id) => router.push(projectUrl(id))}
        />
      )}
    </>
  );
}
