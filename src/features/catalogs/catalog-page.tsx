"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useForm, FieldValues } from "react-hook-form";
import { Plus, Search, X, Building2 } from "lucide-react";
import { catalogs } from "@/config/catalogs";
import { useSession } from "@/hooks/use-session";
import { useCollection } from "@/hooks/use-collection";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { Feedback, Loading } from "@/components/feedback";
import { FormField } from "@/components/fields";
import { call, filesEnabled, sparkApi } from "@/services/api";
import { Row } from "@/types";
import { catalogSchema } from "../../../functions/src/domain";
import { normalizeDocument, validCnpj } from "../../../functions/src/cnpj";
import { errorMessage, formatDate } from "@/lib/utils";
import { CatalogImage } from "@/components/catalog-image";
const lookupFields = [
  "name",
  "legalName",
  "tradeName",
  "personType",
  "address",
  "number",
  "complement",
  "neighborhood",
  "city",
  "state",
  "zip",
  "phone",
  "email",
  "stateRegistration",
] as const;
const emptyCatalog = {
  ...catalogSchema.parse({ name: "Novo registro" }),
  name: "",
  services: "",
};

export function CatalogPage({
  kind,
  openNew = false,
}: {
  kind: string;
  openNew?: boolean;
}) {
  const session = useSession(),
    config = catalogs[kind],
    company = session.company;
  const [search, setSearch] = useState(""),
    [active, setActive] = useState("all"),
    [editing, setEditing] = useState<Row | null>(() =>
      openNew ? { id: crypto.randomUUID() } : null,
    ),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [lookupBusy, setLookupBusy] = useState(false),
    [lookupSuccess, setLookupSuccess] = useState("");
  const lookupPending = useRef(false);
  const autofill = useRef<{
    taxId: string;
    previous: Map<string, string>;
  } | null>(null);
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
    getValues,
    formState: { isSubmitting },
  } = useForm<FieldValues>({ defaultValues: emptyCatalog });
  const taxIdInput = register("taxId");
  if (!config) return <Feedback error="Cadastro não encontrado." />;
  const companies = kind === "companies";
  const isNew = editing !== null && !editing.name;
  const canAdd = companies ? session.canCreate : company?.role === "inspector";
  const writable =
    companies && !isNew
      ? session.companies.some(
          (row) => row.id === editing?.id && row.role === "inspector",
        )
      : canAdd;
  const companyFields = config.fields.filter(
    (field) => !companies || field.key !== "taxId",
  );
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
    setLookupSuccess("");
    autofill.current = null;
    reset({
      ...catalogSchema.parse({ name: "Novo registro" }),
      name: "",
      active: true,
      ...row,
      services: Array.isArray(row.services) ? row.services.join(", ") : "",
    });
  }
  function changeCnpj(value: string) {
    setError("");
    if (
      autofill.current &&
      normalizeDocument(value) !== autofill.current.taxId
    ) {
      for (const [key, previous] of autofill.current.previous) {
        setValue(key, previous, { shouldDirty: true, shouldValidate: true });
      }
      autofill.current = null;
      setLookupSuccess("");
    }
  }
  async function fillCompany() {
    if (lookupPending.current) return;
    const taxId = normalizeDocument(String(getValues("taxId") ?? ""));
    if (!validCnpj(taxId)) {
      setError(
        "Confira o CNPJ informado. Você pode continuar preenchendo o formulário.",
      );
      return;
    }
    lookupPending.current = true;
    setLookupBusy(true);
    setError("");
    setLookupSuccess("");
    try {
      const result = await call<{
        source: string;
        fields: Record<string, string | null>;
      }>("lookupCompanyCnpj", { taxId });
      if (normalizeDocument(String(getValues("taxId") ?? "")) !== taxId) return;
      const previous = autofill.current?.previous ?? new Map<string, string>();
      for (const key of lookupFields) {
        const value = result.fields[key];
        if (value?.trim()) {
          if (!previous.has(key))
            previous.set(key, String(getValues(key) ?? ""));
          setValue(key, value.trim(), {
            shouldDirty: true,
            shouldValidate: true,
          });
        }
      }
      autofill.current = { taxId, previous };
      setLookupSuccess(
        `Dados preenchidos via ${result.source}. Revise antes de salvar e complete os campos em branco.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      lookupPending.current = false;
      setLookupBusy(false);
    }
  }
  async function save(values: FieldValues) {
    if (lookupPending.current) return;
    try {
      setError("");
      const allowed = Object.fromEntries(
        Object.entries(values).filter(([key]) => key in catalogSchema.shape),
      );
      allowed.services = String(values.services ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (kind === "companies")
        allowed.taxId = normalizeDocument(String(values.taxId ?? ""));
      if (companies && sparkApi && !validCnpj(String(allowed.taxId ?? "")))
        throw Error("Confira o CNPJ informado antes de salvar a empresa.");
      const data = catalogSchema.parse(allowed);
      const result = await call<{ status?: string }>(
        kind === "companies" ? "saveCompany" : "saveCatalog",
        {
          ...(kind !== "companies" ? { companyId: company!.id, kind } : {}),
          id: editing!.id,
          data,
        },
      );
      setEditing(null);
      setSuccess(
        result.status === "pending"
          ? "Pedido enviado. Aguarde a aprovação do primeiro inspetor da empresa."
          : result.status === "already-member"
            ? "Você já tem acesso a esta empresa."
            : "Registro salvo com sucesso.",
      );
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
        {canAdd && (
          <Button onClick={() => edit({ id: crypto.randomUUID() })}>
            <Plus size={17} />
            {companies
              ? "Cadastrar nova empresa"
              : `Adicionar ${config.singular}`}
          </Button>
        )}
        {companies && !canAdd && !session.loading && !session.error && (
          <Button asChild variant="outline">
            <Link href="/cadastro-inspetor">Cadastrar perfil de inspetor</Link>
          </Button>
        )}
        {companies && session.error && (
          <Button variant="outline" onClick={() => void session.refresh()}>
            Tentar carregar empresas novamente
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
                    : companies
                      ? "Cadastrar nova empresa"
                      : `Adicionar ${config.singular}`}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Fechar formulário"
                disabled={lookupBusy}
                onClick={() => setEditing(null)}
              >
                <X />
              </Button>
            </div>
            <form onSubmit={(event) => void handleSubmit(save)(event)}>
              <fieldset disabled={!writable || isSubmitting || lookupBusy}>
                <div className="form-grid">
                  {companies && (
                    <div className="wide flex flex-wrap items-end gap-3">
                      <div className="field min-w-48 flex-1">
                        <label htmlFor="taxId">CNPJ</label>
                        <input
                          id="taxId"
                          placeholder="00.000.000/0000-00"
                          maxLength={22}
                          required={sparkApi}
                          readOnly={Boolean(editing.taxId)}
                          {...taxIdInput}
                          onChange={(event) => {
                            void taxIdInput.onChange(event);
                            changeCnpj(event.target.value);
                          }}
                        />
                      </div>
                      {isNew && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={fillCompany}
                        >
                          <Search size={16} />
                          {lookupBusy ? "Consultando…" : "Consultar CNPJ"}
                        </Button>
                      )}
                    </div>
                  )}
                  <FormField
                    field={{
                      key: "name",
                      label: "Nome / descrição",
                      required: true,
                    }}
                    register={register}
                  />
                  {companyFields.map((field) => (
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
              <Feedback error={error} success={lookupSuccess} />
              {filesEnabled &&
                Boolean(editing.name) &&
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
                  disabled={lookupBusy}
                  onClick={() => setEditing(null)}
                >
                  Fechar
                </Button>
                {writable && (
                  <Button disabled={isSubmitting || lookupBusy}>
                    {isSubmitting
                      ? "Salvando…"
                      : companies
                        ? "Salvar empresa"
                        : "Salvar registro"}
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
