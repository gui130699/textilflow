import { z } from "zod";
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { id, projectSchema, text } from "../../../functions/src/domain";
import { eventSchema } from "../../../functions/src/event-schema";

export async function saveProject(uid: string, raw: unknown) {
  const {
    companyId,
    id: projectId,
    data,
    reason,
  } = z
    .object({
      companyId: id,
      id,
      data: projectSchema,
      reason: text.default(""),
    })
    .parse(raw);
  const company = doc(db, "companies", companyId);
  const ref = doc(company, "projects", projectId);
  const change = doc(collection(ref, "projectChanges"));
  await runTransaction(db, async (tx) => {
    const before = await tx.get(ref);
    const refs = [
      ["clients", data.clientId],
      ["products", data.productId],
      ...(data.modelId ? [["models", data.modelId]] : []),
      ...data.materialIds.map((v) => ["materials", v]),
      ...data.thirdPartyIds.map((v) => ["thirdParties", v]),
      ...data.supplierIds.map((v) => ["suppliers", v]),
      ...data.moduleIds.map((v) => ["modules", v]),
    ];
    const linked = await Promise.all(
      refs.map(([kind, key]) => tx.get(doc(company, kind, key))),
    );
    if (linked.some((d) => d.get("active") !== true))
      throw Error("Todos os vínculos devem estar ativos nesta empresa.");
    if (data.modelId && linked[2].get("productId") !== data.productId)
      throw Error("Modelo não pertence ao produto selecionado.");
    if (before.exists() && data.planned < before.get("cut"))
      throw Error("Meta menor que o corte realizado.");
    tx.set(
      ref,
      {
        ...data,
        companyId,
        searchName: data.name.toLocaleLowerCase("pt-BR"),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        sparkChangeId: change.id,
        ...(!before.exists()
          ? {
              createdAt: serverTimestamp(),
              createdBy: uid,
              cut: 0,
              shipped: 0,
              printing: 0,
              sewing: 0,
              packing: 0,
              packed: 0,
              active: true,
              balances: {},
              modelingStatus: "Aguardando liberação",
              reconciliationOk: true,
            }
          : {}),
      },
      { merge: true },
    );
    tx.set(change, { reason, createdAt: serverTimestamp(), createdBy: uid });
  });
  return { id: projectId };
}

const scaled = (n: number) => {
  const value = Math.round(n * 1000);
  if (Math.abs(value / 1000 - n) > 0.0000001)
    throw Error("Máximo de três casas decimais.");
  return value;
};

export async function recordEvent(
  uid: string,
  raw: unknown,
  hash: (v: string) => Promise<string>,
) {
  const input = eventSchema.parse(raw);
  const { companyId, projectId, operationId, kind, data } = input;
  const fingerprint = await hash(JSON.stringify(input));
  const project = doc(db, "companies", companyId, "projects", projectId);
  const ref = doc(project, kind, operationId);
  await runTransaction(db, async (tx) => {
    const [p, existing] = await Promise.all([tx.get(project), tx.get(ref)]);
    if (existing.exists()) {
      if (existing.get("hash") !== fingerprint)
        throw Error("Operação já utilizada.");
      return;
    }
    if (
      !p.exists() ||
      ["Concluído", "Cancelado", "Suspenso"].includes(p.get("status"))
    )
      throw Error("Projeto indisponível.");
    const q = scaled(data.quantity),
      approved = scaled(data.approved),
      rejected = scaled(data.rejected);
    if (
      !["quilograma", "metro"].includes(data.unit) &&
      ![data.quantity, data.approved, data.rejected].every(Number.isInteger)
    )
      throw Error("Esta unidade exige quantidades inteiras.");
    if (kind === "inspections") {
      if (
        !data.receiptId ||
        q <= 0 ||
        approved + rejected !== q ||
        (rejected && !data.reason)
      )
        throw Error(
          "Confira a quantidade inspecionada e justifique reprovações.",
        );
      const receipt = await tx.get(
        doc(project, "materialReceipts", data.receiptId),
      );
      const inspectedScaled = (receipt.get("inspectedScaled") ?? 0) + q;
      if (
        !receipt.exists() ||
        receipt.get("unit") !== data.unit ||
        inspectedScaled > receipt.get("quantityScaled")
      )
        throw Error("Inspeção excede o recebido ou usa unidade diferente.");
      tx.update(receipt.ref, {
        inspectedScaled,
        pendingInspection: inspectedScaled < receipt.get("quantityScaled"),
        sparkInspectionId: operationId,
      });
    }
    if (
      kind === "materialReceipts" &&
      (!data.materialId || !data.supplierId || q <= 0)
    )
      throw Error("Informe material, fornecedor e quantidade.");
    tx.set(ref, {
      ...(kind === "materialReceipts"
        ? { pendingInspection: true, inspectedScaled: 0 }
        : {}),
      ...data,
      projectName: p.get("name"),
      clientId: p.get("clientId"),
      productId: p.get("productId"),
      quantityScaled: q,
      approvedScaled: approved,
      rejectedScaled: rejected,
      weightScaled: scaled(data.weight),
      companyId,
      projectId,
      operationId,
      hash: fingerprint,
      createdAt: serverTimestamp(),
      createdBy: uid,
    });
    tx.update(project, {
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      sparkEventId: operationId,
      sparkEventKind: kind,
      ...(kind === "modeling" ? { modelingStatus: data.status } : {}),
    });
  });
  return { id: operationId };
}
