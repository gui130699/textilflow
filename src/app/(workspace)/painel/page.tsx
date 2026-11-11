"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  FolderKanban,
  CheckCheck,
  AlertTriangle,
  Scissors,
  ArrowRight,
  Plus,
  CalendarDays,
} from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { useCollection } from "@/hooks/use-collection";
import { call } from "@/services/api";
import { number, formatDate, errorMessage, today } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { Feedback, Loading } from "@/components/feedback";
type Dashboard = {
  stagesCount: { key: string; count: number }[];
  summary: Record<string, number>;
  counts: { status: string; count: number }[];
  alerts: { projectId: string; name: string; message: string; kind: string }[];
};
export default function DashboardPage() {
  const { company } = useSession(),
    router = useRouter(),
    [data, setData] = useState<Dashboard | null>(null),
    [error, setError] = useState("");
  const recent = useCollection(
    company ? `companies/${company.id}/projects` : null,
    "",
    "all",
    "updatedAt",
  );
  useEffect(() => {
    if (company)
      call<Dashboard>("dashboard", { companyId: company.id })
        .then(setData)
        .catch((e) => setError(errorMessage(e)));
  }, [company]);
  const completed =
    data?.counts.find((c) => c.status === "Concluído")?.count ?? 0;
  const active =
    data?.counts
      .filter((c) => !["Concluído", "Cancelado", "Suspenso"].includes(c.status))
      .reduce((n, c) => n + c.count, 0) ?? 0;
  const chart = [
    { name: "Estamparia", value: data?.summary.printing ?? 0 },
    { name: "Costura", value: data?.summary.sewing ?? 0 },
    { name: "Embalagem", value: data?.summary.packing ?? 0 },
    { name: "Embalado", value: data?.summary.packed ?? 0 },
    { name: "Despachado", value: data?.summary.shipped ?? 0 },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CADA ETAPA IMPORTA</div>
          <h1>Visão geral da produção</h1>
          <p>Acompanhe o que está em andamento e o que precisa de atenção.</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/relatorios")}>
          <CalendarDays size={15} />
          {formatDate(today())}
        </Button>
      </div>
      <Feedback error={error || recent.error} />
      {!data && !error ? (
        <Loading />
      ) : (
        <>
          <div className="metrics">
            <div className="metric">
              <FolderKanban className="metric-icon" />
              <span>Projetos ativos</span>
              <strong>{number(active)}</strong>
              <p>Em acompanhamento na empresa</p>
            </div>
            <div className="metric">
              <CheckCheck className="metric-icon" />
              <span>Projetos concluídos</span>
              <strong>{number(completed)}</strong>
              <p className="metric-accent">Encerramentos confirmados</p>
            </div>
            <div className="metric">
              <Scissors className="metric-icon" />
              <span>Peças cortadas</span>
              <strong>{number(data?.summary.cut)}</strong>
              <p>Total acumulado de corte</p>
            </div>
            <div className="metric">
              <CheckCheck className="metric-icon" />
              <span>Peças despachadas</span>
              <strong>{number(data?.summary.shipped)}</strong>
              <p className="metric-accent">Entregas registradas</p>
            </div>
          </div>
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Distribuição da produção</h2>
                  <p>Onde estão as peças neste momento</p>
                </div>
                <span className="badge blue">Saldos atuais</span>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chart}
                    barSize={35}
                    margin={{ left: -17, right: 10, top: 10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#edf1f6"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#94a2b4" }}
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#a0adbd" }}
                    />
                    <Tooltip
                      cursor={{ fill: "#f5f8fc" }}
                      formatter={(v) => [`${number(v)} peças`, "Saldo"]}
                      contentStyle={{
                        borderRadius: 9,
                        border: "1px solid #e5eaf0",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                      {chart.map((c, i) => (
                        <Cell
                          key={c.name}
                          fill={
                            [
                              "#adc8ed",
                              "#7fa8e0",
                              "#598ed1",
                              "#3874bc",
                              "#5fa58f",
                            ][i]
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="stats-strip">
                <span>
                  <strong>{number(data?.summary.late)}</strong>Projetos
                  atrasados
                </span>
                {data?.stagesCount?.map((s) => (
                  <span key={s.key}>
                    <strong>{s.count}</strong>
                    {
                      (
                        {
                          cut: "Em corte",
                          printing: "Em estamparia",
                          sewing: "Em costura",
                          packing: "Em embalagem",
                        } as Record<string, string>
                      )[s.key]
                    }
                  </span>
                ))}
                {data?.counts
                  .filter((c) =>
                    [
                      "Aguardando material",
                      "Em inspeção",
                      "Aguardando modelagem",
                    ].includes(c.status),
                  )
                  .map((c) => (
                    <span key={c.status}>
                      <strong>{c.count}</strong>
                      {c.status}
                    </span>
                  ))}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Atenção aos próximos passos</h2>
                <span className="badge yellow">
                  {data?.alerts.length ?? 0} alertas
                </span>
              </div>
              <div className="alert-list">
                {data?.alerts.map((a, i) => (
                  <div className="alert-item" key={i}>
                    <AlertTriangle />
                    <div>
                      <h3>{a.name}</h3>
                      <p>{a.message}</p>
                      <Link href={`/projetos/${a.projectId}`}>
                        Acompanhar projeto →
                      </Link>
                    </div>
                  </div>
                ))}
                {!data?.alerts.length && (
                  <div className="empty">
                    <CheckCheck />
                    <strong>Nenhuma pendência encontrada</strong>
                    <p>Os alertas aparecerão conforme a produção avançar.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Projetos em acompanhamento</h2>
            <p>Últimas atualizações da sua empresa</p>
          </div>
          <Link className="text-link" href="/projetos">
            Ver todos
            <ArrowRight size={14} />
          </Link>
        </div>
        <DataTable
          rows={recent.rows.slice(0, 6)}
          onRow={(p) => router.push(`/projetos/${p.id}`)}
          columns={[
            {
              accessorKey: "name",
              header: "Projeto",
              cell: (i) => (
                <strong className="project-name">{String(i.getValue())}</strong>
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
              header: "Quantidade prevista",
              cell: (i) => `${number(i.getValue())} peças`,
            },
            {
              accessorKey: "cut",
              header: "Cortado",
              cell: (i) => number(i.getValue()),
            },
            {
              accessorKey: "dueOn",
              header: "Previsão de conclusão",
              cell: (i) => formatDate(i.getValue()),
            },
          ]}
        />
        <div className="panel-footer">
          <span>Informações reais da empresa selecionada.</span>
          {company?.role === "inspector" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/projetos")}
            >
              <Plus size={14} />
              Gerenciar projetos
            </Button>
          )}
        </div>
      </section>
    </>
  );
}
