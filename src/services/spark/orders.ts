import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { today } from "@/lib/utils";
import { projectSchema } from "../../../functions/src/domain";
import {
  blankGrade,
  itemSchema,
  ofInputSchema,
  orderSchema,
  total,
  type Manufacturing,
  type OrderItem,
} from "@/features/orders/model";

const orderRef = (companyId: string, id: string) =>
  doc(db, "companies", companyId, "orders", id);
const projectRef = (companyId: string, id: string) =>
  doc(db, "companies", companyId, "projects", id);
const stamp = (uid: string) => ({
  updatedBy: uid,
  updatedAt: serverTimestamp(),
});

export async function saveOrder(
  c: string,
  id: string,
  uid: string,
  raw: unknown,
  items: { id: string; data: unknown }[],
) {
  const data = orderSchema.parse(raw);
  const validated = items.map((item) => ({
    id: item.id,
    data: itemSchema.parse(item.data),
  }));
  const ref = orderRef(c, id);
  const creation = { createdAt: serverTimestamp(), createdBy: uid };
  await runTransaction(db, async (tx) => {
    const [prior, ...priorItems] = await Promise.all([
      tx.get(ref),
      ...validated.map((item) => tx.get(doc(ref, "items", item.id))),
    ]);
    tx.set(
      ref,
      {
        ...data,
        searchName: data.number.toLowerCase(),
        ...stamp(uid),
        ...(!prior.exists() ? creation : {}),
      },
      { merge: true },
    );
    validated.forEach((item, index) => {
      const current = priorItems[index].data() as OrderItem | undefined;
      if (current?.allocated.some((n, i) => n > item.data.ordered[i]))
        throw Error("A quantidade pedida deve cobrir o que já foi programado.");
      if (
        current?.lastOf &&
        (current.productId !== item.data.productId ||
          current.gradeId !== item.data.gradeId ||
          current.colors.join(",") !== item.data.colors.join(",") ||
          current.sizes.join(",") !== item.data.sizes.join(","))
      )
        throw Error(
          "Cores, tamanhos e produto ficam fixos depois que uma OF é gerada.",
        );
      tx.set(
        priorItems[index].ref,
        {
          ...item.data,
          ...stamp(uid),
          ...(!current
            ? { ...creation, allocated: blankGrade(), lastOf: "" }
            : {}),
        },
        { merge: true },
      );
    });
  });
}

export async function generateOf(
  c: string,
  orderId: string,
  projectId: string,
  uid: string,
  raw: unknown,
) {
  const input = ofInputSchema.parse(raw);
  const planned = total(input.quantities);
  if (!planned) throw Error("Programe pelo menos uma peça.");
  const order = orderRef(c, orderId);
  const itemRef = doc(order, "items", input.itemId);
  const project = projectRef(c, projectId);
  const change = doc(collection(project, "projectChanges"));
  return runTransaction(db, async (tx) => {
    const [previous, orderDoc, itemDoc] = await Promise.all([
      tx.get(project),
      tx.get(order),
      tx.get(itemRef),
    ]);
    if (previous.exists()) {
      const saved = previous.get("manufacturing") as Manufacturing | undefined;
      if (
        saved?.orderId === orderId &&
        saved.itemId === input.itemId &&
        previous.get("name") === input.number &&
        JSON.stringify(previous.get("thirdPartyIds")) ===
          JSON.stringify(input.thirdPartyIds) &&
        JSON.stringify([saved.quantities, saved.leaves, saved.sectorIds]) ===
          JSON.stringify([input.quantities, input.leaves, input.sectorIds])
      )
        return projectId;
      throw Error("Esta tentativa já gerou uma OF com dados diferentes.");
    }
    if (!orderDoc.exists() || !itemDoc.exists())
      throw Error("Pedido ou item não encontrado.");
    const item = itemDoc.data() as OrderItem;
    const allocated = item.allocated.map((n, i) => {
      const value = n + input.quantities[i];
      if (value > item.ordered[i])
        throw Error("A quantidade programada excede o saldo do pedido.");
      return value;
    });
    const company = doc(db, "companies", c);
    const product = await tx.get(doc(company, "products", item.productId));
    const sectors = await Promise.all(
      input.sectorIds.map((id) => tx.get(doc(company, "sectors", id))),
    );
    if (sectors.some((s) => s.get("active") !== true))
      throw Error("Selecione setores ativos.");
    const thirdParties = await Promise.all(
      input.thirdPartyIds.map((id) => tx.get(doc(company, "thirdParties", id))),
    );
    if (thirdParties.some((s) => s.get("active") !== true))
      throw Error("Selecione terceiros ativos.");
    const modelId = product.get("modelId") || "";
    const day = today();
    const projectData = projectSchema.parse({
      name: input.number,
      clientId: orderDoc.get("clientId"),
      productId: item.productId,
      modelId,
      planned,
      openedOn: day,
      startsOn: day,
      dueOn: orderDoc.get("dueOn") < day ? day : orderDoc.get("dueOn"),
      responsible: "Equipe de produção",
      materialIds: product.get("materialIds") ?? [],
      thirdPartyIds: input.thirdPartyIds,
      stages: [
        "recebimento",
        "inspecao",
        "modelagem",
        "corte",
        ...(sectors.some((s) => s.get("operationalType") === "estamparia")
          ? ["estamparia"]
          : []),
        "costura",
        "embalagem",
        "despacho",
      ],
    });
    const manufacturing: Manufacturing = {
      orderId,
      itemId: input.itemId,
      orderNumber: orderDoc.get("number"),
      colors: item.colors,
      sizes: item.sizes,
      quantities: input.quantities,
      leaves: input.leaves,
      sectorIds: input.sectorIds,
    };
    const creation = { createdBy: uid, createdAt: serverTimestamp() };
    tx.set(project, {
      ...projectData,
      companyId: c,
      searchName: input.number.toLowerCase(),
      manufacturing,
      ...stamp(uid),
      ...creation,
      sparkChangeId: change.id,
      active: true,
      cut: 0,
      shipped: 0,
      printing: 0,
      sewing: 0,
      packing: 0,
      packed: 0,
      balances: {},
      modelingStatus: "Aguardando liberação",
      reconciliationOk: true,
    });
    tx.set(change, { reason: "Geração de OF a partir do pedido", ...creation });
    tx.update(itemRef, { allocated, lastOf: projectId, ...stamp(uid) });
    return projectId;
  });
}

export async function cancelOf(c: string, id: string, uid: string) {
  const project = projectRef(c, id);
  await runTransaction(db, async (tx) => {
    const p = await tx.get(project);
    const of = p.get("manufacturing") as Manufacturing | undefined;
    if (!of) throw Error("Ordem de fabricação não encontrada.");
    if (p.get("status") === "Cancelado") return;
    if (p.get("sparkMovementId") || p.get("sparkEventId") || p.get("cut") !== 0)
      throw Error(
        "A OF tem operações registradas e deve manter a programação.",
      );
    const ref = doc(orderRef(c, of.orderId), "items", of.itemId);
    const item = await tx.get(ref);
    const allocated = (item.get("allocated") as number[]).map(
      (n, i) => n - of.quantities[i],
    );
    tx.update(project, { status: "Cancelado", ...stamp(uid) });
    tx.update(ref, { allocated, lastOf: id, ...stamp(uid) });
  });
}

export async function editOfSectors(
  c: string,
  id: string,
  uid: string,
  sectorIds: string[],
) {
  const project = projectRef(c, id);
  await runTransaction(db, async (tx) => {
    const previous = await tx.get(project);
    if (
      JSON.stringify(previous.get("manufacturing.sectorIds")) ===
      JSON.stringify(sectorIds)
    )
      return;
    const sectors = await Promise.all(
      sectorIds.map((id) => tx.get(doc(db, "companies", c, "sectors", id))),
    );
    if (sectors.some((sector) => sector.get("active") !== true))
      throw Error("Selecione setores ativos.");
    tx.update(project, {
      "manufacturing.sectorIds": sectorIds,
      ...stamp(uid),
    });
  });
}
