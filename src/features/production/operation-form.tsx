"use client";
import { useState } from "react";
import { FieldValues, useForm } from "react-hook-form";
import { X } from "lucide-react";
import { FormField } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
import { Field, movementLabels } from "@/config/catalogs";
import { call } from "@/services/api";
import { today, errorMessage } from "@/lib/utils";
const receipt: Field[] = [
  {
    key: "materialId",
    label: "Material",
    collection: "materials",
    type: "select",
    required: true,
  },
  {
    key: "supplierId",
    label: "Fornecedor",
    collection: "suppliers",
    type: "select",
    required: true,
  },
  {
    key: "quantity",
    label: "Quantidade recebida",
    type: "number",
    required: true,
  },
  {
    key: "unit",
    label: "Unidade",
    type: "select",
    options: ["rolo", "quilograma", "metro", "unidade", "pacote"],
  },
  {
    key: "weight",
    label: "Peso (kg) ou metragem complementar",
    type: "number",
  },
  { key: "lot", label: "Lote do material" },
  { key: "color", label: "Cor" },
  { key: "document", label: "Nota fiscal / documento" },
];
const inspection: Field[] = [
  { key: "receiptId", label: "ID do recebimento", required: true },
  {
    key: "quantity",
    label: "Quantidade inspecionada",
    type: "number",
    required: true,
  },
  {
    key: "unit",
    label: "Unidade do recebimento",
    type: "select",
    options: ["rolo", "quilograma", "metro", "unidade", "pacote"],
  },
  {
    key: "approved",
    label: "Quantidade aprovada",
    type: "number",
    required: true,
  },
  {
    key: "rejected",
    label: "Quantidade reprovada",
    type: "number",
    required: true,
  },
  {
    key: "status",
    label: "Resultado",
    type: "select",
    options: [
      "Aguardando inspeção",
      "Em inspeção",
      "Aprovado",
      "Aprovado com ressalvas",
      "Reprovado",
    ],
  },
  { key: "reason", label: "Motivo da reprovação", type: "textarea" },
];
const modeling: Field[] = [
  { key: "requestedOn", label: "Data de solicitação", type: "date" },
  { key: "dueOn", label: "Previsão de liberação", type: "date" },
  { key: "responsible", label: "Responsável", required: true },
  {
    key: "status",
    label: "Situação",
    type: "select",
    options: [
      "Aguardando liberação",
      "Em desenvolvimento",
      "Liberada",
      "Bloqueada",
    ],
  },
];
export function OperationForm({
  companyId,
  projectId,
  operation,
  onClose,
  onSaved,
  initial = {},
}: {
  companyId: string;
  projectId: string;
  operation: string;
  onClose: () => void;
  onSaved: () => void;
  initial?: FieldValues;
}) {
  const [error, setError] = useState(""),
    [operationId] = useState(() => crypto.randomUUID());
  const event = ["materialReceipts", "inspections", "modeling"].includes(
    operation,
  );
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<FieldValues>({
    defaultValues: {
      occurredOn: today(),
      lotId: "principal",
      unit: "rolo",
      quantity: 1,
      weight: 0,
      approved: 0,
      rejected: 0,
      defective: 0,
      status:
        operation === "modeling"
          ? "Aguardando liberação"
          : "Aguardando inspeção",
      stage: "estamparia",
      source: "costura-pronta",
      destination: "embalagem",
      ...initial,
    },
  });
  const title =
    operation === "materialReceipts"
      ? "Recebimento de material"
      : operation === "inspections"
        ? "Registrar inspeção"
        : operation === "modeling"
          ? "Atualizar modelagem"
          : movementLabels[operation];
  const fields: Field[] = event
    ? operation === "materialReceipts"
      ? receipt
      : operation === "inspections"
        ? inspection
        : modeling
    : [
        { key: "lotId", label: "Lote operacional", required: true },
        {
          key: "quantity",
          label:
            operation === "reverse"
              ? "Quantidade do movimento original"
              : "Quantidade de peças",
          type: "number",
          required: true,
        },
        ...(["send", "receive"].includes(operation)
          ? ([
              {
                key: "thirdPartyId",
                label: "Terceiro vinculado",
                type: "select",
                collection: "thirdParties",
                required: true,
              },
              {
                key: "stage",
                label: "Etapa",
                type: "select",
                options: ["estamparia", "costura"],
              },
              { key: "dueOn", label: "Previsão de retorno", type: "date" },
            ] as Field[])
          : []),
        ...(operation === "receive"
          ? ([
              {
                key: "defective",
                label: "Peças com defeito (quarentena)",
                type: "number",
              },
            ] as Field[])
          : []),
        ...(operation === "transfer"
          ? ([
              {
                key: "source",
                label: "Origem",
                type: "select",
                options: ["costura-pronta", "embalagem"],
              },
              {
                key: "destination",
                label: "Destino",
                type: "select",
                options: ["embalagem", "embalado"],
              },
            ] as Field[])
          : []),
        ...(operation === "loss"
          ? [
              {
                key: "source",
                label: "Conta de origem (igual ao saldo)",
                required: true,
              },
            ]
          : []),
        ...(operation === "dispatch"
          ? [
              { key: "recipient", label: "Destinatário", required: true },
              { key: "document", label: "Nota fiscal / documento" },
            ]
          : []),
        ...(operation === "reverse"
          ? [
              {
                key: "reverses",
                label: "ID do movimento original",
                required: true,
              },
            ]
          : []),
        {
          key: "colorId",
          label: "Cor do lote (opcional)",
          type: "select",
          collection: "colors",
        },
        {
          key: "sizeId",
          label: "Tamanho do lote (opcional)",
          type: "select",
          collection: "sizes",
        },
        {
          key: "reason",
          label: "Observação / justificativa",
          type: "textarea",
          required: ["loss", "reverse"].includes(operation),
        },
      ];
  async function save(v: FieldValues) {
    try {
      setError("");
      if (
        ["loss", "reverse", "dispatch"].includes(operation) &&
        !window.confirm(
          `Confirmar: ${title.toLowerCase()}? A operação ficará no histórico.`,
        )
      )
        return;
      const data = Object.fromEntries(
        Object.entries(v).filter(
          ([, value]) => value !== "" && !Number.isNaN(value),
        ),
      );
      if (event) {
        for (const key of [
          "lotId",
          "stage",
          "source",
          "destination",
          "defective",
        ])
          delete data[key];
        await call("recordEvent", {
          companyId,
          projectId,
          operationId,
          kind: operation,
          data,
        });
      } else {
        delete data.status;
        delete data.unit;
        delete data.weight;
        delete data.approved;
        delete data.rejected;
        await call("productionMovement", {
          companyId,
          projectId,
          operationId,
          kind: operation,
          ...data,
        });
      }
      onSaved();
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
        aria-labelledby="op-title"
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow">ATUALIZAR PRODUÇÃO</div>
            <h2 id="op-title">{title}</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fechar operação"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <form onSubmit={handleSubmit(save)}>
          <div className="form-grid">
            <FormField
              field={{
                key: "occurredOn",
                label:
                  operation === "modeling" && watch("status") === "Liberada"
                    ? "Data efetiva de liberação"
                    : "Data da operação",
                type: "date",
                required: true,
              }}
              register={register}
            />
            {fields.map((f) => (
              <FormField
                key={f.key}
                field={f}
                register={register}
                companyId={companyId}
              />
            ))}
            {event && (
              <FormField
                field={{ key: "notes", label: "Observações", type: "textarea" }}
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
              {isSubmitting ? "Registrando…" : "Confirmar registro"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
