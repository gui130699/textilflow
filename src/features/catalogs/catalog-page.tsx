"use client";
import { useState } from "react";
import { useForm, FieldValues } from "react-hook-form";
import { Plus, Search, X, Building2 } from "lucide-react";
import { catalogs } from "@/config/catalogs";
import { useSession } from "@/hooks/use-session";
import { useCollection } from "@/hooks/use-collection";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { Feedback, Loading } from "@/components/feedback";
import { FormField } from "@/components/fields";
import { call } from "@/services/api";
import { Row } from "@/types";
import { catalogSchema } from "../../../functions/src/domain";
import { errorMessage, formatDate } from "@/lib/utils";
import { CatalogImage } from "@/components/catalog-image";
export function CatalogPage({ kind }: { kind: string }) {
  const session = useSession(),
    config = catalogs[kind],
    company = session.company;
  const [search, setSearch] = useState(""),
    [active, setActive] = useState("all"),
    [editing, setEditing] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const list = useCollection(
    company && kind !== "companies" ? `companies/${company.id}/${kind}` : null,
    search,
    active,
  );
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting },
  } = useForm<FieldValues>();
  if (!config) return <Feedback error="Cadastro não encontrado." />;
  const writable =
    kind === "companies"
      ? session.canCreate || company?.role === "inspector"
      : company?.role === "inspector";
  const rows =
    kind === "companies"
      ? session.companies.filter(
          (c) =>
            c.name.toLowerCase().includes(search.toLowerCase()) &&
            (active === "all" || c.active === (active === "active")),
        )
      : list.rows;
  function edit(row: Row) {
    setEditing(row);
    setError("");
    reset({
      ...catalogSchema.parse({ name: "Novo registro" }),
      name: "",
      active: true,
      ...row,
      services: Array.isArray(row.services) ? row.services.join(", ") : "",
    });
  }
  async function save(values: FieldValues) {
    try {
      setError("");
      const allowed = Object.fromEntries(
        Object.entries(values).filter(([key]) => key in catalogSchema.shape),
      );
      allowed.services = String(values.services ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const data = catalogSchema.parse(allowed);
      await call(kind === "companies" ? "saveCompany" : "saveCatalog", {
        ...(kind !== "companies" ? { companyId: company!.id, kind } : {}),
        id: editing!.id,
        data,
      });
      setEditing(null);
      setSuccess("Registro salvo com sucesso.");
      list.reload();
      if (kind === "companies") await session.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CADASTROS</div>
          <h1>{config.label}</h1>
          <p>{config.description}</p>
        </div>
        {writable && (
          <Button onClick={() => edit({ id: crypto.randomUUID() })}>
            <Plus size={17} />
            Adicionar {config.singular}
          </Button>
        )}
      </div>
      <Feedback success={success} error={list.error} />
      <div className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Pesquisar registros"
              placeholder={`Pesquisar ${config.label.toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filtrar situação"
            value={active}
            onChange={(e) => setActive(e.target.value)}
          >
            <option value="all">Todas as situações</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
          <span className="muted">{rows.length} registros carregados</span>
        </div>
        {list.loading && !rows.length ? (
          <Loading />
        ) : (
          <DataTable
            rows={rows}
            columns={[
              {
                accessorKey: "name",
                header: "Nome",
                cell: (i) => (
                  <span className="name-cell">
                    <Building2 size={17} />
                    {String(i.getValue())}
                  </span>
                ),
              },
              {
                accessorKey: "category",
                header: "Categoria / tipo",
                cell: (i) => String(i.getValue() || i.row.original.city || "—"),
              },
              {
                accessorKey: "active",
                header: "Situação",
                cell: (i) => (
                  <span className={`badge ${i.getValue() ? "green" : "gray"}`}>
                    {i.getValue() ? "Ativo" : "Inativo"}
                  </span>
                ),
              },
              {
                accessorKey: "updatedAt",
                header: "Última atualização",
                cell: (i) => formatDate(i.getValue()),
              },
            ]}
            onRow={edit}
          />
        )}
        <div className="panel-footer">
          Registros históricos são preservados.
          {list.more && (
            <Button variant="outline" onClick={() => list.next()}>
              Carregar mais
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-title"
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">{config.label}</div>
                <h2 id="catalog-title">
                  {editing.name
                    ? String(editing.name)
                    : `Adicionar ${config.singular}`}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Fechar formulário"
                onClick={() => setEditing(null)}
              >
                <X />
              </Button>
            </div>
            <form onSubmit={handleSubmit(save)}>
              <fieldset disabled={!writable || isSubmitting}>
                <div className="form-grid">
                  <FormField
                    field={{
                      key: "name",
                      label: "Nome / descrição",
                      required: true,
                    }}
                    register={register}
                  />
                  {config.fields.map((field) => (
                    <FormField
                      key={field.key}
                      field={field}
                      register={register}
                      companyId={company?.id}
                      defaultValue={editing[field.key]}
                    />
                  ))}
                  <FormField
                    field={{
                      key: "notes",
                      label: "Observações",
                      type: "textarea",
                    }}
                    register={register}
                  />
                  <FormField
                    field={{
                      key: "active",
                      label: "Registro ativo",
                      type: "checkbox",
                    }}
                    register={register}
                  />
                </div>
              </fieldset>
              <Feedback error={error} />
              {Boolean(editing.name) &&
                ["companies", "models"].includes(kind) && (
                  <CatalogImage
                    companyId={kind === "companies" ? editing.id : company!.id}
                    kind={kind as "companies" | "models"}
                    recordId={editing.id}
                    path={String(editing.image ?? "")}
                    writable={Boolean(writable)}
                    onSaved={(path) => {
                      setValue("image", path);
                      setEditing({ ...editing, image: path });
                      list.reload();
                    }}
                  />
                )}
              <div className="form-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  Fechar
                </Button>
                {writable && (
                  <Button disabled={isSubmitting}>
                    {isSubmitting ? "Salvando…" : "Salvar registro"}
                  </Button>
                )}
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
