import { z } from "zod";
import { date, id, text } from "./domain";
const context = z.object({ companyId: id, projectId: id });
export const eventSchema = context.extend({
  operationId: id,
  kind: z.enum(["materialReceipts", "inspections", "modeling"]),
  data: z
    .object({
      occurredOn: date,
      materialId: z.union([id, z.literal("")]).default(""),
      supplierId: z.union([id, z.literal("")]).default(""),
      receiptId: z.union([id, z.literal("")]).default(""),
      lot: text.default(""),
      color: text.default(""),
      unit: z
        .enum(["rolo", "quilograma", "metro", "unidade", "pacote"])
        .default("rolo"),
      quantity: z.number().nonnegative().max(10_000_000).default(0),
      weight: z.number().nonnegative().max(10_000_000).default(0),
      approved: z.number().nonnegative().max(10_000_000).default(0),
      rejected: z.number().nonnegative().max(10_000_000).default(0),
      reason: text.default(""),
      notes: text.default(""),
      document: text.default(""),
      responsible: text.default(""),
      status: z.enum([
        "Aguardando inspeção",
        "Em inspeção",
        "Aprovado",
        "Aprovado com ressalvas",
        "Reprovado",
        "Aguardando liberação",
        "Em desenvolvimento",
        "Liberada",
        "Bloqueada",
      ]),
      dueOn: z.union([date, z.literal("")]).default(""),
      requestedOn: z.union([date, z.literal("")]).default(""),
    })
    .strict(),
});
