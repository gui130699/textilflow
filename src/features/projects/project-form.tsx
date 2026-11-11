"use client";
import { useState } from "react";
import { useForm, FieldValues } from "react-hook-form";
import { X } from "lucide-react";
import { projectSchema, stages, statuses } from "../../../functions/src/domain";
import { FormField } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
import { Field } from "@/config/catalogs";
import { call } from "@/services/api";
import { Row } from "@/types";
import { today, errorMessage } from "@/lib/utils";
const fields: Field[] = [
  { key: "name", label: "Nome do projeto", required: true },
  {
    key: "clientId",
    label: "Cliente",
    type: "select",
    collection: "clients",
    required: true,
  },
  {
    key: "productId",
    label: "Produto",
    type: "select",
    collection: "products",
    required: true,
  },
  { key: "modelId", label: "Modelo", type: "select", collection: "models" },
  {
    key: "planned",
    label: "Quantidade prevista (peças)",
    type: "number",
    required: true,
  },
  { key: "responsible", label: "Responsável", required: true },
  { key: "openedOn", label: "Data de abertura", type: "date", required: true },
  {
    key: "startsOn",
    label: "Previsão de início",
    type: "date",
    required: true,
  },
  {
    key: "dueOn",
    label: "Previsão de conclusão",
    type: "date",
    required: true,
  },
  { key: "status", label: "Situação", type: "select", options: [...statuses] },
  {
    key: "materialIds",
    label: "Materiais (selecione vários)",
    type: "multi",
    collection: "materials",
  },
  {
    key: "supplierIds",
    label: "Fornecedores",
    type: "multi",
    collection: "suppliers",
  },
  {
    key: "thirdPartyIds",
    label: "Terceiros",
    type: "multi",
    collection: "thirdParties",
  },
  {
    key: "moduleIds",
    label: "Módulos personalizados",
    type: "multi",
    collection: "modules",
  },
  { key: "notes", label: "Observações", type: "textarea" },
];
export function ProjectForm({
  companyId,
  project,
  onClose,
  onSaved,
}: {
  companyId: string;
  project?: Row;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [error, setError] = useState(""),
    [recordId] = useState(() => project?.id ?? crypto.randomUUID());
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FieldValues>({
    defaultValues: {
      name: "",
      planned: 1,
      unit: "unidade",
      status: "Planejado",
      openedOn: today(),
      startsOn: today(),
      dueOn: today(),
      stages: [...stages],
      ...project,
    },
  });
  async function save(values: FieldValues) {
    try {
      setError("");
      const data = projectSchema.parse(
        Object.fromEntries(
          Object.entries(values).filter(([k]) => k in projectSchema.shape),
        ),
      );
      if (
        ["Concluído", "Cancelado"].includes(data.status) &&
        !window.confirm(
          "Confirmar encerramento do projeto? Esta ação será auditada.",
        )
      )
        return;
      await call("saveProject", {
        companyId,
        id: recordId,
        data,
        reason: values.reason ?? "",
      });
      onSaved(recordId);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-form-title"
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow">PROJETOS</div>
            <h2 id="project-form-title">
              {project ? "Editar projeto" : "Novo projeto"}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <form onSubmit={handleSubmit(save)}>
          <div className="form-grid">
            {fields.map((f) => (
              <FormField
                key={f.key}
                field={f}
                register={register}
                companyId={companyId}
                defaultValue={project?.[f.key]}
              />
            ))}
            <fieldset className="wide">
              <legend>Etapas aplicáveis</legend>
              <div className="checkbox-grid">
                {stages.map((s) => (
                  <label key={s}>
                    <input type="checkbox" value={s} {...register("stages")} />
                    {s}
                  </label>
                ))}
              </div>
            </fieldset>
            {project && (
              <FormField
                field={{
                  key: "reason",
                  label:
                    "Justificativa do ajuste de meta / encerramento excepcional",
                  type: "textarea",
                }}
                register={register}
              />
            )}
          </div>
          <Feedback error={error} />
          <div className="form-actions">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : "Salvar projeto"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
