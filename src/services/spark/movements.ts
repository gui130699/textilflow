import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { today } from "@/lib/utils";
import {
  applyDeltas,
  movementSchema,
  planMovement,
  type Delta,
} from "../../../functions/src/domain";

type Queue = { operationId: string; quantity: number; dueOn: string }[];
type Queues = Record<string, Queue>;

export async function productionMovement(
  uid: string,
  raw: unknown,
  digest: (v: string) => Promise<string>,
) {
  const m = movementSchema.parse(raw);
  const hash = await digest(JSON.stringify(m));
  const company = doc(db, "companies", m.companyId);
  const project = doc(company, "projects", m.projectId);
  const lot = doc(project, "productionBalances", m.lotId);
  const ledger = doc(project, "productionMovements", m.operationId);
  return runTransaction(db, async (tx) => {
    const [p, l, prior, member] = await Promise.all([
      tx.get(project),
      tx.get(lot),
      tx.get(ledger),
      tx.get(doc(company, "members", uid)),
    ]);
    if (prior.exists()) {
      if (prior.get("hash") !== hash)
        throw Error("Identificador já utilizado em outra operação.");
      return { id: m.operationId, duplicate: true };
    }
    if (
      !p.exists() ||
      ["Suspenso", "Cancelado", "Concluído"].includes(p.get("status"))
    )
      throw Error("Projeto está encerrado ou suspenso.");
    if (m.kind !== "cut" && !l.exists())
      throw Error("Lote sem entrada de corte.");
    if (
      l.exists() &&
      (l.get("colorId") !== m.colorId || l.get("sizeId") !== m.sizeId)
    )
      throw Error("Cor e tamanho devem ser mantidos no lote.");
    if (m.kind === "cut" && p.get("modelingStatus") !== "Liberada")
      throw Error("Libere a modelagem antes do corte.");
    const queues: Queues = l.get("externalQueues") ?? {};
    let deltas: Delta[],
      cutDelta = 0;
    let queueAccount = "",
      queueBefore: Queue = [],
      queueAfter: Queue = [];
    let printingDelta = 0,
      sewingDelta = 0;
    if (m.kind === "reverse") {
      const originalRef = doc(
        project,
        "productionMovements",
        m.reverses || "_invalid",
      );
      const reverseRef = doc(project, "reversals", m.reverses || "_invalid");
      const [original, reversed] = await Promise.all([
        tx.get(originalRef),
        tx.get(reverseRef),
      ]);
      if (
        !original.exists() ||
        reversed.exists() ||
        original.get("kind") === "reverse" ||
        original.get("lotId") !== m.lotId ||
        original.get("quantity") !== m.quantity ||
        m.reason.length < 5
      )
        throw Error("Movimento inválido ou já estornado.");
      deltas = (original.get("deltas") as Delta[]).map(
        ({ account, quantity }) => ({ account, quantity: -quantity }),
      );
      cutDelta = -original.get("cutDelta");
      const external = deltas.find((d) => d.account.includes(":"));
      queueAccount = external?.account ?? "";
      printingDelta = queueAccount.startsWith("estamparia:")
        ? external!.quantity
        : 0;
      sewingDelta = queueAccount.startsWith("costura:")
        ? external!.quantity
        : 0;
      if (queueAccount) {
        queueBefore = queues[queueAccount] ?? [];
        if (
          JSON.stringify(queueBefore) !==
          JSON.stringify(original.get("queueAfter")[queueAccount] ?? [])
        )
          throw Error(
            "Estorne primeiro os movimentos posteriores deste terceiro e lote.",
          );
        queueAfter = original.get("queueBefore")[queueAccount] ?? [];
      }
      tx.set(reverseRef, {
        operationId: m.operationId,
        createdBy: uid,
        createdAt: serverTimestamp(),
      });
    } else {
      deltas = planMovement(m, p.get("stages").includes("estamparia"));
      if (m.kind === "cut") cutDelta = m.quantity;
      const outside = deltas.find((d) => d.account.includes(":"));
      if (outside) {
        queueAccount = outside.account;
        queueBefore = queues[queueAccount] ?? [];
        if (m.stage === "estamparia") printingDelta = outside.quantity;
        else sewingDelta = outside.quantity;
        if (m.kind === "send") {
          if (queueBefore.length >= 100)
            throw Error("Este lote possui 100 envios pendentes ao terceiro.");
          queueAfter = [
            ...queueBefore,
            {
              operationId: m.operationId,
              quantity: m.quantity,
              dueOn: m.dueOn,
            },
          ];
        } else if (m.kind === "receive") {
          const [head, ...rest] = queueBefore;
          if (!head || m.quantity > head.quantity)
            throw Error(
              "Registre um retorno por envio pendente, começando pelo mais antigo.",
            );
          queueAfter =
            m.quantity === head.quantity
              ? rest
              : [{ ...head, quantity: head.quantity - m.quantity }, ...rest];
        }
      }
    }
    const cut = (p.get("cut") ?? 0) + cutDelta;
    if (cut < 0 || cut > p.get("planned"))
      throw Error("Corte excede a meta planejada.");
    const balances = applyDeltas(l.get("balances") ?? {}, deltas);
    const totals = applyDeltas(p.get("balances") ?? {}, deltas);
    if (Object.values(totals).reduce((a, b) => a + b, 0) !== cut)
      throw Error("Divergência de saldo.");
    const externalQueues = queueAccount
      ? { ...queues, [queueAccount]: queueAfter }
      : queues;
    const nextDueOn =
      Object.values(externalQueues)
        .flat()
        .map((e) => e.dueOn)
        .sort()[0] ?? "9999-12-31";
    const stamp = { updatedAt: serverTimestamp(), updatedBy: uid };
    tx.set(
      lot,
      {
        companyId: m.companyId,
        projectId: m.projectId,
        lotId: m.lotId,
        inspectorUid: l.get("inspectorUid") || uid,
        inspectorName: l.get("inspectorName") || member.get("name") || uid,
        colorId: m.colorId,
        sizeId: m.sizeId,
        balances,
        externalQueues,
        nextDueOn,
        projectName: p.get("name"),
        clientId: p.get("clientId"),
        productId: p.get("productId"),
        updatedOn: today(),
        sparkMovementId: m.operationId,
        ...stamp,
      },
      { merge: true },
    );
    tx.update(project, {
      cut,
      balances: totals,
      shipped: totals.despachado ?? 0,
      printing: (p.get("printing") ?? 0) + printingDelta,
      sewing: (p.get("sewing") ?? 0) + sewingDelta,
      packing: totals.embalagem ?? 0,
      packed: totals.embalado ?? 0,
      status: totals.despachado > 0 ? "Parcialmente concluído" : "Em produção",
      sparkMovementId: m.operationId,
      ...stamp,
    });
    tx.set(ledger, {
      ...m,
      spark: true,
      hash,
      deltas,
      cutDelta,
      printingDelta,
      sewingDelta,
      queueAccount,
      queueAccounts: queueAccount ? [queueAccount] : [],
      queueBefore: queueAccount ? { [queueAccount]: queueBefore } : {},
      queueAfter: queueAccount ? { [queueAccount]: queueAfter } : {},
      clientId: p.get("clientId"),
      productId: p.get("productId"),
      projectName: p.get("name"),
      source: deltas
        .filter((d) => d.quantity < 0)
        .map((d) => d.account)
        .join(","),
      destination: deltas
        .filter((d) => d.quantity > 0)
        .map((d) => d.account)
        .join(","),
      unit: "unidade",
      createdBy: uid,
      recordedAt: serverTimestamp(),
    });
    return { id: m.operationId, duplicate: false };
  });
}
