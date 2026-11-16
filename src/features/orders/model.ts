import { z } from "zod";
import { date, id } from "../../../functions/src/domain";

export const gradeSlots = 12;
const vectorSize = 24;
const uniqueIds = (max: number) =>
  z
    .array(id)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, "Há opções duplicadas.");
const pieces = z.number().int().min(0).max(10000000);
export const quantities = z.array(pieces).length(vectorSize);
export const orderSchema = z.object({
  number: z.string().trim().min(2).max(100),
  clientId: id,
  dueOn: date,
  flowId: id.or(z.literal("")),
  sectorIds: uniqueIds(12),
});
export const itemSchema = z
  .object({
    productId: id,
    gradeId: id,
    colors: uniqueIds(6),
    sizes: uniqueIds(gradeSlots),
    ordered: quantities,
    leaves: quantities,
  })
  .superRefine((item, ctx) => {
    const slots = item.colors.length * item.sizes.length;
    if (
      !slots ||
      slots > gradeSlots ||
      !total(item.ordered) ||
      item.ordered.slice(slots).some(Boolean) ||
      item.leaves.slice(item.colors.length).some(Boolean)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Informe cores, uma grade de até 12 combinações e pelo menos uma peça.",
      });
    }
  });
export const ofInputSchema = z.object({
  number: z.string().trim().min(2).max(100),
  itemId: id,
  quantities,
  leaves: quantities,
  sectorIds: uniqueIds(12),
  thirdPartyIds: uniqueIds(12).default([]),
});
export type Order = z.infer<typeof orderSchema> & { id: string };
export type OrderItem = z.infer<typeof itemSchema> & {
  id: string;
  allocated: number[];
  lastOf: string;
};
export type Manufacturing = {
  orderId: string;
  itemId: string;
  orderNumber: string;
  quantities: number[];
  leaves: number[];
  colors: string[];
  sizes: string[];
  sectorIds: string[];
};
export const blankGrade = () => Array<number>(vectorSize).fill(0);
export const total = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0);
export const skuIndex = (color: number, size: number, sizes: string[]) =>
  color * sizes.length + size;
