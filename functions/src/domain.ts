import { z } from "zod";
export class DomainError extends Error {}

export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const text = z.string().trim().max(2000);
export const name = z.string().trim().min(2).max(160);
export const quantity = z.number().int().positive().max(10_000_000);
export const date = z.string().date();
export const stages = [
  "recebimento",
  "inspecao",
  "modelagem",
  "corte",
  "estamparia",
  "costura",
  "embalagem",
  "despacho",
] as const;
export const statuses = [
  "Planejado",
  "Aguardando material",
  "Em inspeção",
  "Aguardando modelagem",
  "Em produção",
  "Parcialmente concluído",
  "Concluído",
  "Suspenso",
  "Cancelado",
] as const;
export const catalogKinds = [
  "clients",
  "thirdParties",
  "suppliers",
  "materials",
  "products",
  "models",
  "colors",
  "sizes",
  "grades",
  "units",
  "rejectionReasons",
  "inspectionTypes",
  "modules",
  "categories",
] as const;
const optional = text.optional().default("");
export const catalogSchema = z
  .object({
    name,
    tradeName: optional,
    legalName: optional,
    taxId: z
      .string()
      .regex(/^(|\d{11}|\d{14})$/, "Use 11 ou 14 dígitos")
      .optional()
      .default(""),
    personType: z.enum(["Física", "Jurídica"]).optional().default("Jurídica"),
    stateRegistration: optional,
    contact: optional,
    phone: optional,
    whatsapp: optional,
    email: z
      .union([z.email(), z.literal("")])
      .optional()
      .default(""),
    address: optional,
    number: optional,
    complement: optional,
    neighborhood: optional,
    city: optional,
    state: optional,
    zip: optional,
    notes: optional,
    category: optional,
    type: optional,
    composition: optional,
    color: optional,
    unit: optional,
    supplierId: z
      .union([id, z.literal("")])
      .optional()
      .default(""),
    productId: z
      .union([id, z.literal("")])
      .optional()
      .default(""),
    services: z.array(z.string().max(80)).max(20).optional().default([]),
    averageDays: z.number().int().min(0).max(365).optional().default(0),
    technicalNotes: optional,
    image: optional,
    order: z.number().int().min(0).max(100).optional().default(0),
    operationalType: z.enum(stages).optional().default("recebimento"),
    required: z.boolean().optional().default(false),
    active: z.boolean().default(true),
  })
  .strict();
export const projectSchema = z
  .object({
    name,
    clientId: id,
    productId: id,
    modelId: z.union([id, z.literal("")]).default(""),
    planned: quantity,
    unit: z.literal("unidade").default("unidade"),
    openedOn: date,
    startsOn: date,
    dueOn: date,
    responsible: name,
    materialIds: z.array(id).max(50).default([]),
    thirdPartyIds: z.array(id).max(50).default([]),
    supplierIds: z.array(id).max(50).default([]),
    stages: z.array(z.enum(stages)).min(4).max(8),
    moduleIds: z.array(id).max(30).default([]),
    notes: optional,
    status: z.enum(statuses).default("Planejado"),
  })
  .strict()
  .refine((p) => p.dueOn >= p.startsOn && p.startsOn >= p.openedOn, {
    message: "Confira a ordem das datas",
    path: ["dueOn"],
  })
  .refine(
    (p) =>
      ["corte", "costura", "embalagem", "despacho"].every((s) =>
        p.stages.includes(s as (typeof stages)[number]),
      ),
    {
      message: "Corte, costura, embalagem e despacho são obrigatórios",
      path: ["stages"],
    },
  );
export const movementSchema = z
  .object({
    companyId: id,
    projectId: id,
    operationId: id,
    lotId: id,
    kind: z.enum([
      "cut",
      "send",
      "receive",
      "transfer",
      "loss",
      "dispatch",
      "reverse",
    ]),
    source: z.string().max(200).default(""),
    destination: z.string().max(200).default(""),
    quantity,
    defective: z.number().int().min(0).max(10_000_000).default(0),
    thirdPartyId: z.union([id, z.literal("")]).default(""),
    stage: z.enum(["estamparia", "costura"]).default("estamparia"),
    dueOn: z.union([date, z.literal("")]).default(""),
    occurredOn: date,
    reason: text.default(""),
    recipient: text.default(""),
    document: text.default(""),
    reverses: z.union([id, z.literal("")]).default(""),
    colorId: z.union([id, z.literal("")]).default(""),
    sizeId: z.union([id, z.literal("")]).default(""),
  })
  .strict();
export type MovementInput = z.infer<typeof movementSchema>;
export type Balances = Record<string, number>;
export type Delta = { account: string; quantity: number };
export function planMovement(m: MovementInput, printed: boolean): Delta[] {
  const ready = m.stage === "estamparia" ? "corte" : "costura-pronta";
  const external = `${m.stage}:${m.thirdPartyId}`;
  switch (m.kind) {
    case "cut":
      return [{ account: "corte", quantity: m.quantity }];
    case "send": {
      if (!m.thirdPartyId || !m.dueOn)
        throw new DomainError("Informe terceiro e previsão de retorno");
      if (m.stage === "estamparia" && !printed)
        throw new DomainError("Estamparia não configurada neste projeto");
      const source =
        m.stage === "estamparia"
          ? "corte"
          : printed
            ? "estampa-pronta"
            : "corte";
      return [
        { account: source, quantity: -m.quantity },
        { account: external, quantity: m.quantity },
      ];
    }
    case "receive": {
      if (!m.thirdPartyId || m.defective > m.quantity)
        throw new DomainError("Retorno ou defeitos inválidos");
      const destination = m.stage === "estamparia" ? "estampa-pronta" : ready;
      return [
        { account: external, quantity: -m.quantity },
        { account: destination, quantity: m.quantity - m.defective },
        { account: "quarentena", quantity: m.defective },
      ];
    }
    case "transfer": {
      const allowed = [
        ["costura-pronta", "embalagem"],
        ["embalagem", "embalado"],
      ];
      if (!allowed.some(([a, b]) => a === m.source && b === m.destination))
        throw new DomainError("Transferência não permitida");
      return [
        { account: m.source, quantity: -m.quantity },
        { account: m.destination, quantity: m.quantity },
      ];
    }
    case "loss":
      if (!m.reason || !m.source || ["perdas", "despachado"].includes(m.source))
        throw new DomainError("Origem e motivo da perda são obrigatórios");
      return [
        { account: m.source, quantity: -m.quantity },
        { account: "perdas", quantity: m.quantity },
      ];
    case "dispatch":
      if (!m.recipient) throw new DomainError("Informe o destinatário");
      return [
        { account: "embalado", quantity: -m.quantity },
        { account: "despachado", quantity: m.quantity },
      ];
    case "reverse":
      throw new DomainError("Estorno exige movimento original");
  }
}
export function applyDeltas(balances: Balances, deltas: Delta[]): Balances {
  const result = { ...balances };
  for (const d of deltas) {
    result[d.account] = (result[d.account] ?? 0) + d.quantity;
    if (!Number.isSafeInteger(result[d.account]) || result[d.account] < 0)
      throw new DomainError("Saldo insuficiente na origem");
  }
  return result;
}
export function sameBalances(a: Balances, b: Balances) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(
    (k) => (a[k] ?? 0) === (b[k] ?? 0),
  );
}
