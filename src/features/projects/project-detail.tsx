"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Download,
  Edit3,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { ref, uploadBytes, getBlob } from "firebase/storage";
import { useSession } from "@/hooks/use-session";
import { useCollection } from "@/hooks/use-collection";
import { db, storage } from "@/lib/firebase";
import { number, formatDate, errorMessage } from "@/lib/utils";
import { Project, Row } from "@/types";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { Feedback, Loading } from "@/components/feedback";
import { OperationForm } from "@/features/production/operation-form";
import { ProjectForm } from "./project-form";
import { accountLabels, movementLabels } from "@/config/catalogs";
import { call, serverApi } from "@/services/api";
import { useLabels } from "@/hooks/use-labels";
export function ProjectDetail({
  id,
  initialTab = "overview",
}: {
  id: string;
  initialTab?: string;
}) {
  const { company } = useSession(),
    [project, setProject] = useState<Project | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [tab, setTab] = useState(
      ["overview", "inspections", "production"].includes(initialTab)
        ? initialTab
        : "overview",
    ),
    [operation, setOperation] = useState(""),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [initial, setInitial] = useState<Record<string, unknown>>({});
  const path = company ? `companies/${company.id}/projects/${id}` : null;
  const writable = company?.role === "inspector";
  useEffect(() => {
    if (!path) return;
    return onSnapshot(
      doc(db, path),
      (s) => {
        if (s.exists()) setProject({ id: s.id, ...s.data() } as Project);
        else setError("Projeto não encontrado.");
      },
      (e) => setError(errorMessage(e)),
    );
  }, [path]);
  const collections: Record<string, string> = {
    overview: "productionBalances",
    receipts: "materialReceipts",
    inspections: "inspections",
    modeling: "modeling",
    production: "productionMovements",
    files: "attachments",
    history: "activityLog",
  };
  const sort =
    tab === "overview"
      ? "updatedAt"
      : tab === "production"
        ? "recordedAt"
        : "createdAt";
  const list = useCollection(
    path ? `${path}/${collections[tab]}` : null,
    "",
    "all",
    sort,
    tab === "files" && !writable,
  );
  const label = useLabels(company?.id, [
    ["clients", String(project?.clientId ?? "")],
    ["products", String(project?.productId ?? "")],
    ["models", String(project?.modelId ?? "")],
    ...(project?.thirdPartyIds ?? []).map(
      (id) => ["thirdParties", id] as [string, string],
    ),
    ...((project?.materialIds ?? []) as string[]).map(
      (id) => ["materials", id] as [string, string],
    ),
    ...((project?.supplierIds ?? []) as string[]).map(
      (id) => ["suppliers", id] as [string, string],
    ),
    ...list.rows.flatMap(
      (r) =>
        [
          ["colors", String(r.colorId ?? "")],
          ["sizes", String(r.sizeId ?? "")],
          ["materials", String(r.materialId ?? "")],
          ["suppliers", String(r.supplierId ?? "")],
        ] as [string, string][],
    ),
  ]);
  const accountName = (key: string) =>
    key.includes(":")
      ? `${key.split(":")[0] === "costura" ? "Costura" : "Estamparia"} · ${label("thirdParties", key.split(":")[1])}`
      : (accountLabels[key] ?? key);
  async function reconcile() {
    try {
      setBusy(true);
      setError("");
      const result = await call<{ valid: boolean; movementCount: number }>(
        "reconcileProduction",
        { companyId: company!.id, projectId: id },
      );
      setSuccess(
        result.valid
          ? `Reconciliação concluída: ${result.movementCount} movimentos conferidos, sem divergências.`
          : "Divergências identificadas. Consulte o histórico e revise os saldos.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File | undefined) {
    if (!file || !company) return;
    try {
      setBusy(true);
      setError("");
      if (
        file.size > 10 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "application/pdf"].includes(file.type)
      )
        throw Error("Use JPG, PNG ou PDF de até 10 MB.");
      const attachmentId = crypto.randomUUID();
      const storagePath = `companies/${company.id}/projects/${id}/${attachmentId}`;
      await uploadBytes(ref(storage, storagePath), file, {
        contentType: file.type,
      });
      await call("saveAttachment", {
        companyId: company.id,
        projectId: id,
        id: attachmentId,
        name: file.name,
        ownerVisible: window.confirm(
          "Permitir que os proprietários da empresa visualizem este anexo?",
        ),
      });
      list.reload();
      setSuccess("Anexo enviado com sucesso.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function download(row: Row) {
    try {
      const blob = await getBlob(ref(storage, String(row.path)));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = String(row.name);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  if (error && !project) return <Feedback error={error} />;
  if (!project || !company) return <Loading />;
  const progress = Math.min(
    100,
    Math.round(((project.balances?.despachado ?? 0) / project.planned) * 100),
  );
  function start(kind: string, data: Record<string, unknown> = {}) {
    setInitial(data);
    setOperation(kind);
  }
  const records = list.rows;
  return (
    <>
      <Link href="/projetos" className="back-link">
        <ArrowLeft size={15} />
        Todos os projetos
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ACOMPANHAMENTO DO PROJETO</div>
          <h1>
            {project.name} <span className="badge blue">{project.status}</span>
          </h1>
          <p>
            <CalendarDays size={15} />
            Conclusão prevista: {formatDate(project.dueOn)} <span>·</span>{" "}
            Responsável: {String(project.responsible)}
          </p>
        </div>
        {writable && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Edit3 size={16} />
            Editar projeto
          </Button>
        )}
      </div>
      <Feedback error={error || list.error} success={success} />
      <div className="metrics four">
        <div className="metric">
          <span>Quantidade prevista</span>
          <strong>
            {number(project.planned)}
            <small>peças</small>
          </strong>
          <p>Meta autorizada do projeto</p>
        </div>
        <div className="metric">
          <span>Corte acumulado</span>
          <strong>
            {number(project.cut)}
            <small>peças</small>
          </strong>
          <p>{number(project.planned - project.cut)} peças restantes</p>
        </div>
        <div className="metric">
          <span>Já despachado</span>
          <strong>
            {number(project.balances?.despachado)}
            <small>peças</small>
          </strong>
          <p>Saídas confirmadas</p>
        </div>
        <div className="metric">
          <span>Progresso de entrega</span>
          <strong>
            {progress}
            <small>%</small>
          </strong>
          <div className="progress-track">
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      <div className="panel timeline-panel">
        <div className="panel-heading">
          <h2>Etapas do projeto</h2>
          <span className="muted">Etapas podem acontecer simultaneamente</span>
        </div>
        <div className="timeline">
          {project.stages.map((stage, i) => (
            <div className="timeline-step" key={stage}>
              <span
                className={
                  stage === "modelagem" && project.modelingStatus === "Liberada"
                    ? "complete"
                    : ""
                }
              >
                {stage === "modelagem" &&
                project.modelingStatus === "Liberada" ? (
                  <Check size={18} />
                ) : (
                  i + 1
                )}
              </span>
              <strong>{stage}</strong>
              {i < project.stages.length - 1 && <ChevronRight size={15} />}
            </div>
          ))}
        </div>
      </div>
      <div className="tabs" role="tablist">
        {[
          ["overview", "Visão geral"],
          ["receipts", "Recebimentos"],
          ["inspections", "Inspeções"],
          ["modeling", "Modelagem"],
          ["production", "Produção"],
          ["files", "Fotos e anexos"],
          ["history", "Histórico"],
        ]
          .filter(([key]) => !serverApi || key !== "files")
          .map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
      </div>
      {tab === "overview" ? (
        <div className="detail-grid">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Onde estão as peças</h2>
                <p>Saldos físicos atuais · unidade: peça</p>
              </div>
              <Package size={22} />
            </div>
            <div className="balance-list">
              {Object.entries(project.balances ?? {}).map(([key, value]) => (
                <div key={key}>
                  <span>{accountName(key)}</span>
                  <strong>{number(value)}</strong>
                </div>
              ))}
            </div>
            {!Object.keys(project.balances ?? {}).length && (
              <div className="empty">Nenhum corte registrado.</div>
            )}
            <div className="panel-footer">
              <strong>
                Total em controle:{" "}
                {number(
                  Object.values(project.balances ?? {}).reduce(
                    (a, b) => a + b,
                    0,
                  ),
                )}
              </strong>
              <span className="badge green">Inclui despachados e perdas</span>
            </div>
          </section>
          <section className="panel project-info">
            <h2>Informações e pendências</h2>
            <dl>
              <dt>Cliente</dt>
              <dd>{label("clients", project.clientId)}</dd>
              <dt>Produto / modelo</dt>
              <dd>
                {label("products", project.productId)} ·{" "}
                {label("models", project.modelId)}
              </dd>
              <dt>Materiais</dt>
              <dd>
                {((project.materialIds ?? []) as string[])
                  .map((id) => label("materials", id))
                  .join(", ") || "—"}
              </dd>
              <dt>Terceiros vinculados</dt>
              <dd>
                {project.thirdPartyIds
                  .map((id) => label("thirdParties", id))
                  .join(", ") || "—"}
              </dd>
              <dt>Modelagem</dt>
              <dd>{project.modelingStatus}</dd>
              <dt>Reconciliação</dt>
              <dd>
                {project.reconciliationOk === false
                  ? "Divergência encontrada"
                  : "Sem divergência registrada"}
              </dd>
              <dt>Última atualização</dt>
              <dd>{formatDate(project.updatedAt)}</dd>
              <dt>Observações</dt>
              <dd>{String(project.notes || "Sem observações.")}</dd>
            </dl>
            {writable && (
              <Button variant="outline" disabled={busy} onClick={reconcile}>
                <ShieldCheck size={16} />
                Conferir saldos com histórico
              </Button>
            )}
          </section>
          <section className="panel wide">
            <div className="panel-heading">
              <h2>Lotes operacionais</h2>
            </div>
            <DataTable
              rows={records}
              columns={[
                { accessorKey: "lotId", header: "Lote" },
                { accessorKey: "colorId", header: "Cor" },
                { accessorKey: "sizeId", header: "Tamanho" },
                {
                  id: "balances",
                  header: "Distribuição",
                  cell: (i) =>
                    Object.entries(
                      i.row.original.balances as Record<string, number>,
                    )
                      .map(([k, v]) => `${accountName(k)}: ${number(v)}`)
                      .join(" · "),
                },
              ]}
            />
          </section>
        </div>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                {tab === "production"
                  ? "Movimentações de produção"
                  : tab === "receipts"
                    ? "Recebimentos de materiais"
                    : tab === "files"
                      ? "Fotos e documentos"
                      : tab === "history"
                        ? "Histórico de alterações"
                        : tab === "modeling"
                          ? "Liberação de modelagem"
                          : "Inspeções de qualidade"}
              </h2>
              <p>Registros preservados com data e responsável.</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Atualizar registros"
              onClick={list.reload}
            >
              <RefreshCw size={17} />
            </Button>
          </div>
          {writable && (
            <div className="operation-toolbar">
              {tab === "production" ? (
                Object.entries(movementLabels).map(([key, label]) => (
                  <Button
                    variant={key === "cut" ? "default" : "outline"}
                    key={key}
                    size="sm"
                    onClick={() => start(key)}
                  >
                    <Plus size={14} />
                    {label}
                  </Button>
                ))
              ) : tab === "files" ? (
                <label className="upload-button">
                  <Upload size={16} />
                  {busy ? "Enviando…" : "Enviar foto ou documento"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    disabled={busy}
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                </label>
              ) : (
                tab !== "history" && (
                  <Button onClick={() => start(collections[tab])}>
                    <Plus size={16} />
                    Novo registro
                  </Button>
                )
              )}
            </div>
          )}
          {list.loading && !records.length ? (
            <Loading />
          ) : tab === "files" ? (
            <div className="files-grid">
              {records.map((row) => (
                <button
                  className="file-card"
                  key={row.id}
                  onClick={() => download(row)}
                >
                  <Download size={22} />
                  <strong>{String(row.name)}</strong>
                  <small>
                    {row.ownerVisible
                      ? "Visível para proprietários"
                      : "Somente inspetores"}
                  </small>
                </button>
              ))}
              {!records.length && (
                <div className="empty">Nenhum anexo disponível.</div>
              )}
            </div>
          ) : (
            <DataTable
              rows={records}
              columns={
                tab === "production"
                  ? [
                      {
                        accessorKey: "kind",
                        header: "Operação",
                        cell: (i) => movementLabels[String(i.getValue())],
                      },
                      { accessorKey: "lotId", header: "Lote" },
                      {
                        accessorKey: "quantity",
                        header: "Peças",
                        cell: (i) => number(i.getValue()),
                      },
                      {
                        accessorKey: "source",
                        header: "Origem",
                        cell: (i) =>
                          String(i.getValue() ?? "")
                            .split(",")
                            .map(accountName)
                            .join(", "),
                      },
                      {
                        accessorKey: "destination",
                        header: "Destino",
                        cell: (i) =>
                          String(i.getValue() ?? "")
                            .split(",")
                            .map(accountName)
                            .join(", "),
                      },
                      {
                        accessorKey: "recordedAt",
                        header: "Registro",
                        cell: (i) => formatDate(i.getValue()),
                      },
                      {
                        accessorKey: "id",
                        header: "ID / estorno",
                        cell: (i) => (
                          <button
                            className="text-link"
                            disabled={!writable}
                            onClick={() =>
                              start("reverse", {
                                reverses: i.row.original.id,
                                lotId: i.row.original.lotId,
                                quantity: i.row.original.quantity,
                                colorId: i.row.original.colorId,
                                sizeId: i.row.original.sizeId,
                              })
                            }
                          >
                            {String(i.getValue()).slice(0, 8)}
                            <ArrowUpRight size={12} />
                          </button>
                        ),
                      },
                    ]
                  : tab === "history"
                    ? [
                        { accessorKey: "action", header: "Ação" },
                        { accessorKey: "createdBy", header: "Responsável" },
                        {
                          accessorKey: "createdAt",
                          header: "Data",
                          cell: (i) => formatDate(i.getValue()),
                        },
                        {
                          accessorKey: "data",
                          header: "Detalhes",
                          cell: (i) => (
                            <details>
                              <summary>Ver alterações</summary>
                              <pre className="audit-json">
                                {JSON.stringify(i.getValue(), null, 2)}
                              </pre>
                            </details>
                          ),
                        },
                      ]
                    : [
                        {
                          accessorKey: "occurredOn",
                          header: "Data",
                          cell: (i) => formatDate(i.getValue()),
                        },
                        {
                          accessorKey: "status",
                          header: "Situação",
                          cell: (i) => (
                            <span className="badge blue">
                              {String(i.getValue())}
                            </span>
                          ),
                        },
                        {
                          accessorKey: "quantity",
                          header: "Quantidade",
                          cell: (i) =>
                            `${number(i.getValue())} ${String(i.row.original.unit ?? "")}`,
                        },
                        { accessorKey: "notes", header: "Observações" },
                        {
                          accessorKey: "id",
                          header: "Identificador",
                          cell: (i) =>
                            tab === "receipts" && writable ? (
                              <button
                                className="text-link"
                                onClick={() =>
                                  start("inspections", {
                                    receiptId: i.row.original.id,
                                    unit: i.row.original.unit,
                                  })
                                }
                              >
                                <ClipboardCheck size={15} />
                                Inspecionar
                              </button>
                            ) : (
                              String(i.getValue()).slice(0, 8)
                            ),
                        },
                      ]
              }
            />
          )}
          <div className="panel-footer">
            <span>{records.length} registros carregados</span>
            {list.more && (
              <Button variant="outline" onClick={() => list.next()}>
                Carregar mais
              </Button>
            )}
          </div>
        </section>
      )}
      {operation && (
        <OperationForm
          companyId={company.id}
          projectId={id}
          operation={operation}
          initial={initial}
          onClose={() => setOperation("")}
          onSaved={() => {
            setOperation("");
            list.reload();
            setSuccess("Operação registrada com sucesso.");
          }}
        />
      )}
      {editing && (
        <ProjectForm
          companyId={company.id}
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setSuccess("Projeto atualizado.");
          }}
        />
      )}
    </>
  );
}
