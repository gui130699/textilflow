"use client";
import { useState } from "react";
import { useForm, FieldValues } from "react-hook-form";
import { Copy, UserPlus } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { useCollection } from "@/hooks/use-collection";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
import { DataTable } from "@/components/data-table";
import { FormField } from "@/components/fields";
import { call } from "@/services/api";
import { errorMessage } from "@/lib/utils";
export default function Users() {
  const { company } = useSession(),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const list = useCollection(
    company ? `companies/${company.id}/members` : null,
    "",
    "all",
    "createdAt",
  );
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FieldValues>({ defaultValues: { role: "owner" } });
  async function invite(v: FieldValues) {
    try {
      setError("");
      const result = await call<{ token: string }>("createInvite", {
        companyId: company!.id,
        ...v,
      });
      setLink(`${location.origin}/convite#${result.token}`);
      setSuccess(
        "Convite criado. Compartilhe o link com o destinatário indicado. Válido por 48 horas.",
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function toggle(memberId: string, active: boolean) {
    if (
      !window.confirm(
        `${active ? "Reativar" : "Revogar"} o acesso deste usuário?`,
      )
    )
      return;
    try {
      await call("updateMember", { companyId: company!.id, memberId, active });
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  if (company?.role !== "inspector")
    return <Feedback error="Somente inspetores podem gerenciar os acessos." />;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ACESSO CONTROLADO</div>
          <h1>Usuários e permissões</h1>
          <p>Convide as pessoas certas para acompanhar esta empresa.</p>
        </div>
      </div>
      <section className="panel settings-card">
        <h2>Convidar usuário</h2>
        <form onSubmit={handleSubmit(invite)}>
          <div className="form-grid">
            <FormField
              field={{
                key: "email",
                label: "E-mail do destinatário",
                type: "email",
                required: true,
              }}
              register={register}
            />
            <FormField
              field={{
                key: "role",
                label: "Perfil de acesso",
                type: "select",
                options: ["owner", "inspector"],
              }}
              register={register}
            />
          </div>
          <p className="muted mt-3">
            owner: proprietário, somente leitura. inspector: pode alterar
            produção e gerenciar acessos.
          </p>
          <div className="form-actions">
            <Button disabled={isSubmitting}>
              <UserPlus size={16} />
              Gerar convite
            </Button>
          </div>
        </form>
        <Feedback error={error} success={success} />
        {link && (
          <div className="flex gap-2">
            <input aria-label="Link do convite" readOnly value={link} />
            <Button
              variant="outline"
              aria-label="Copiar convite"
              onClick={() => navigator.clipboard.writeText(link)}
            >
              <Copy size={16} />
            </Button>
          </div>
        )}
      </section>
      <section className="panel mt-6">
        <div className="panel-heading">
          <h2>Vínculos com a empresa</h2>
        </div>
        <Feedback error={list.error} />
        <DataTable
          rows={list.rows}
          columns={[
            { accessorKey: "id", header: "Identificador do usuário" },
            {
              accessorKey: "role",
              header: "Perfil",
              cell: (i) =>
                i.getValue() === "inspector" ? "Inspetor" : "Proprietário",
            },
            {
              accessorKey: "active",
              header: "Situação",
              cell: (i) => (
                <span className={`badge ${i.getValue() ? "green" : "gray"}`}>
                  {i.getValue() ? "Ativo" : "Revogado"}
                </span>
              ),
            },
            {
              id: "actions",
              header: "Gerenciar",
              cell: (i) => (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    toggle(i.row.original.id, !i.row.original.active)
                  }
                >
                  {i.row.original.active ? "Revogar acesso" : "Reativar acesso"}
                </Button>
              ),
            },
          ]}
        />
        {list.more && (
          <Button onClick={() => list.next()}>Carregar mais</Button>
        )}
      </section>
    </>
  );
}
