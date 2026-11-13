"use client";
import { useState } from "react";
import { useForm, FieldValues } from "react-hook-form";
import { Download, Printer, Search } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { FormField } from "@/components/fields";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
import { call } from "@/services/api";
import { Row } from "@/types";
import { errorMessage, formatDate, number } from "@/lib/utils";
import { csv } from "@/lib/csv";
import { dailyCut, thirdPartyBalances, operationNames } from "@/lib/reports";
import { useLabels } from "@/hooks/use-labels";
import { statuses } from "../../../../functions/src/domain";
export default function Reports() {
  const { company } = useSession(),
    [rows, setRows] = useState<Row[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filters, setFilters] = useState<FieldValues>({ kind: "projects" });
  const { register, handleSubmit, watch } = useForm<FieldValues>({
    defaultValues: { kind: "projects" },
    shouldUnregister: true,
  });
  const kind = watch("kind");
  async function run(data: FieldValues, more = false) {
    try {
      setBusy(true);
      setError("");
      const result = await call<{ rows: Row[]; cursor: string | null }>(
        "reportPage",
        {
          ...data,
          kind:
            data.kind === "cutDaily"
              ? "productionMovements"
              : data.kind === "lateProjects"
                ? "projects"
                : data.kind,
          lateOnly: data.kind === "lateProjects",
          companyId: company!.id,
          cursor: more ? (cursor ?? "") : "",
        },
      );
      setFilters(data);
      setRows((old) => (more ? [...old, ...result.rows] : result.rows));
      setCursor(result.cursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const projects = ["projects", "lateProjects"].includes(filters.kind);
  const displayRows =
    filters.kind === "cutDaily"
      ? dailyCut(rows)
      : filters.kind === "productionBalances"
        ? thirdPartyBalances(rows, filters.thirdPartyId, filters.stage)
        : rows;
  const label = useLabels(
    company?.id,
    displayRows.flatMap(
      (row) =>
        [
          ["thirdParties", String(row.thirdPartyId ?? "")],
          ["colors", String(row.colorId ?? "")],
          ["sizes", String(row.sizeId ?? "")],
          ...[row.source, row.destination].flatMap((value) =>
            String(value ?? "")
              .split(",")
              .filter((v) => v.includes(":"))
              .map((v) => ["thirdParties", v.split(":")[1]]),
          ),
        ] as [string, string][],
    ),
  );
  function displayValue(key: string, value: unknown): string | number {
    if (key.endsWith("On")) return formatDate(value);
    if (key === "thirdPartyId") return label("thirdParties", value);
    if (key === "colorId") return label("colors", value);
    if (key === "sizeId") return label("sizes", value);
    if (["source", "destination"].includes(key))
      return (
        String(value ?? "")
          .split(",")
          .map((account) => {
            const [stage, third] = account.split(":");
            return `${operationNames[stage] ?? stage}${third ? ` · ${label("thirdParties", third)}` : ""}`;
          })
          .join(", ") || "—"
      );
    if (["kind", "stage"].includes(key))
      return operationNames[String(value)] ?? String(value ?? "—");
    return typeof value === "number" ? value : String(value ?? "—");
  }
  const columns = projects
    ? [
        { accessorKey: "name", header: "Projeto" },
        { accessorKey: "status", header: "Situação" },
        { accessorKey: "planned", header: "Previsto" },
        { accessorKey: "cut", header: "Corte acumulado" },
        { accessorKey: "shipped", header: "Despachado" },
        { accessorKey: "printing", header: "Em estamparia" },
        { accessorKey: "sewing", header: "Em costura" },
        { accessorKey: "packed", header: "Embalado" },
        { accessorKey: "dueOn", header: "Conclusão prevista" },
      ]
    : filters.kind === "cutDaily"
      ? [
          { accessorKey: "projectName", header: "Projeto" },
          { accessorKey: "occurredOn", header: "Data" },
          { accessorKey: "quantity", header: "Corte líquido (peças)" },
        ]
      : filters.kind === "productionBalances"
        ? [
            { accessorKey: "projectName", header: "Projeto" },
            { accessorKey: "lotId", header: "Lote" },
            { accessorKey: "colorId", header: "Cor" },
            { accessorKey: "sizeId", header: "Tamanho" },
            { accessorKey: "thirdPartyId", header: "Terceiro" },
            { accessorKey: "stage", header: "Etapa" },
            { accessorKey: "quantity", header: "Saldo atual (peças)" },
            { accessorKey: "updatedOn", header: "Atualizado em" },
          ]
        : [
            { accessorKey: "projectName", header: "Projeto" },
            { accessorKey: "occurredOn", header: "Data" },
            { accessorKey: "kind", header: "Operação" },
            { accessorKey: "quantity", header: "Quantidade" },
            { accessorKey: "unit", header: "Unidade" },
            { accessorKey: "thirdPartyId", header: "Terceiro" },
            { accessorKey: "approved", header: "Aprovado" },
            { accessorKey: "rejected", header: "Reprovado" },
            { accessorKey: "source", header: "Origem" },
            { accessorKey: "destination", header: "Destino" },
          ];
  function exportCsv() {
    const text = csv(
      columns.map((c) => c.header),
      displayRows.map((row) =>
        columns.map((c) => displayValue(c.accessorKey, row[c.accessorKey])),
      ),
    );
    const a = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8;" }),
      );
    a.href = url;
    a.download = "textilflow-relatorio.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DADOS PARA DECIDIR</div>
          <h1>Relatórios da produção</h1>
          <p>
            {company?.name} · Consulte resultados e exporte os dados filtrados.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!rows.length} onClick={exportCsv}>
            <Download size={16} />
            Exportar CSV das páginas carregadas
          </Button>
          <Button
            variant="outline"
            disabled={!rows.length}
            onClick={() => window.print()}
          >
            <Printer size={16} />
            Imprimir
          </Button>
        </div>
      </div>
      <section className="panel">
        <form onSubmit={handleSubmit((d) => run(d))}>
          <div className="report-filters">
            <FormField
              field={{
                key: "kind",
                label: "Relatório",
                type: "select",
                options: [
                  "projects",
                  "lateProjects",
                  "cutDaily",
                  "productionBalances",
                  "productionMovements",
                  "inspections",
                ],
              }}
              register={register}
            />
            <FormField
              field={{
                key: "projectId",
                label: "Projeto",
                type: "select",
                collection: "projects",
              }}
              register={register}
              companyId={company?.id}
            />
            <FormField
              field={{
                key: "clientId",
                label: "Cliente",
                type: "select",
                collection: "clients",
              }}
              register={register}
              companyId={company?.id}
            />
            <FormField
              field={{
                key: "productId",
                label: "Produto",
                type: "select",
                collection: "products",
              }}
              register={register}
              companyId={company?.id}
            />
            {["productionMovements", "productionBalances"].includes(kind) && (
              <FormField
                field={{
                  key: "thirdPartyId",
                  label: "Terceiro",
                  type: "select",
                  collection: "thirdParties",
                }}
                register={register}
                companyId={company?.id}
              />
            )}
            <FormField
              field={{ key: "from", label: "De", type: "date" }}
              register={register}
            />
            <FormField
              field={{ key: "to", label: "Até", type: "date" }}
              register={register}
            />
            {["projects", "lateProjects", "inspections"].includes(kind) && (
              <FormField
                field={{
                  key: "status",
                  label: "Situação",
                  type: "select",
                  options:
                    kind === "inspections"
                      ? [
                          "Aguardando inspeção",
                          "Em inspeção",
                          "Aprovado",
                          "Aprovado com ressalvas",
                          "Reprovado",
                        ]
                      : [...statuses],
                }}
                register={register}
              />
            )}
            {["productionMovements", "productionBalances"].includes(kind) && (
              <FormField
                field={{
                  key: "stage",
                  label: "Etapa",
                  type: "select",
                  options: ["estamparia", "costura"],
                }}
                register={register}
              />
            )}
            <div className="flex items-end">
              <Button disabled={busy}>
                <Search size={15} />
                {busy ? "Consultando…" : "Aplicar filtros"}
              </Button>
            </div>
          </div>
        </form>
        <Feedback error={error} />
        <p className="muted p-4">
          {kind === "lateProjects"
            ? "Período pela conclusão prevista. Exibe projetos cujo prazo já venceu."
            : kind === "productionBalances"
              ? "Saldos atuais. O período filtra a última atualização do lote; não reconstrói o estoque de uma data passada."
              : kind === "projects"
                ? "Período pela abertura do projeto."
                : "Período pela data da operação. Cortes líquidos incluem estornos na data em que foram registrados."}
        </p>
        <DataTable
          rows={displayRows}
          columns={columns.map((c) => ({
            ...c,
            cell: (i) =>
              typeof i.getValue() === "number"
                ? number(i.getValue())
                : displayValue(c.accessorKey, i.getValue()),
          }))}
        />
        <div className="panel-footer">
          <span>
            {rows.length} registros de origem carregados. Totais e exportação
            consideram somente estas páginas.{" "}
            {cursor
              ? "Carregue as próximas páginas para incluir todo o período."
              : "Todas as páginas foram carregadas."}
          </span>
          {cursor && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => run(filters, true)}
            >
              Carregar próxima página
            </Button>
          )}
        </div>
      </section>
    </>
  );
}
