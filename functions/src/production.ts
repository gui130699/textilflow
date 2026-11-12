import {
  getFirestore,
  FieldValue,
  Transaction,
  DocumentReference,
} from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { createHash } from "node:crypto";
type QueueEntry = { operationId: string; quantity: number; dueOn: string };
type Queues = Record<string, QueueEntry[]>;
import {
  applyDeltas,
  planMovement,
  movementSchema,
  type Balances,
  type Delta,
  sameBalances,
} from "./domain";

export async function authorize(
  tx: Transaction,
  companyId: string,
  uid: string,
  write = true,
) {
  const db = getFirestore();
  const [company, member] = await Promise.all([
    tx.get(db.doc(`companies/${companyId}`)),
    tx.get(db.doc(`companies/${companyId}/members/${uid}`)),
  ]);
  if (
    !company.exists ||
    !company.get("active") ||
    !member.get("active") ||
    (write && member.get("role") !== "inspector")
  )
    throw new HttpsError(
      "permission-denied",
      "Você não tem permissão nesta empresa.",
    );
  return member.data()!;
}
export function audit(
  tx: Transaction,
  ref: DocumentReference,
  uid: string,
  action: string,
  data: unknown,
) {
  tx.create(ref.collection("activityLog").doc(), {
    action,
    data,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });
}
export async function move(uid: string, input: unknown) {
  const m = movementSchema.parse(input);
  const db = getFirestore();
  const project = db.doc(`companies/${m.companyId}/projects/${m.projectId}`);
  const lot = project.collection("productionBalances").doc(m.lotId);
  const ledger = project.collection("productionMovements").doc(m.operationId);
  const hash = createHash("sha256").update(JSON.stringify(m)).digest("hex");
  return db.runTransaction(async (tx) => {
    const actor = await authorize(tx, m.companyId, uid);
    const [p, l, existing] = await Promise.all([
      tx.get(project),
      tx.get(lot),
      tx.get(ledger),
    ]);
    if (existing.exists) {
      if (existing.get("hash") !== hash)
        throw new HttpsError(
          "already-exists",
          "Identificador já utilizado em outra operação.",
        );
      return { id: m.operationId, duplicate: true };
    }
    if (!p.exists) throw new HttpsError("not-found", "Projeto não encontrado.");
    if (["Suspenso", "Cancelado", "Concluído"].includes(p.get("status")))
      throw new HttpsError(
        "failed-precondition",
        "Projeto está encerrado ou suspenso.",
      );
    if (m.thirdPartyId) {
      const third = await tx.get(
        db.doc(`companies/${m.companyId}/thirdParties/${m.thirdPartyId}`),
      );
      if (
        !third.get("active") ||
        !p.get("thirdPartyIds").includes(m.thirdPartyId)
      )
        throw new HttpsError(
          "failed-precondition",
          "Terceiro não está ativo e vinculado ao projeto.",
        );
    }
    if (
      l.exists &&
      (l.get("colorId") !== m.colorId || l.get("sizeId") !== m.sizeId)
    )
      throw new HttpsError(
        "failed-precondition",
        "Cor e tamanho devem ser mantidos no lote.",
      );
    if (m.kind !== "cut" && !l.exists)
      throw new HttpsError("failed-precondition", "Lote sem entrada de corte.");
    let deltas: Delta[],
      cutDelta = 0;
    const queueBefore = (l.get("externalQueues") ?? {}) as Queues;
    const externalQueues: Queues = structuredClone(queueBefore);
    if (m.kind === "reverse") {
      if (!m.reverses || m.reason.length < 5)
        throw new HttpsError(
          "invalid-argument",
          "Informe movimento e motivo do estorno.",
        );
      const original = await tx.get(
        project.collection("productionMovements").doc(m.reverses),
      );
      const reversalRef = project.collection("reversals").doc(m.reverses);
      const reversed = await tx.get(reversalRef);
      if (
        !original.exists ||
        original.get("kind") === "reverse" ||
        original.get("quantity") !== m.quantity ||
        original.get("lotId") !== m.lotId ||
        reversed.exists
      )
        throw new HttpsError(
          "failed-precondition",
          "Movimento inválido ou já estornado.",
        );
      deltas = (original.get("deltas") as Delta[]).map((d) => ({
        ...d,
        quantity: -d.quantity,
      }));
      cutDelta = -(original.get("cutDelta") as number);
      const affected = original.get("queueAccounts") as string[] | undefined;
      if (affected?.length) {
        for (const account of affected) {
          if (
            JSON.stringify(externalQueues[account] ?? []) !==
            JSON.stringify(original.get("queueAfter")?.[account] ?? [])
          )
            throw new HttpsError(
              "failed-precondition",
              "Estorne primeiro os movimentos posteriores deste terceiro e lote.",
            );
          externalQueues[account] =
            original.get("queueBefore")?.[account] ?? [];
        }
      }
      tx.create(reversalRef, {
        operationId: m.operationId,
        createdBy: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      if (m.kind === "cut") {
        if (p.get("modelingStatus") !== "Liberada")
          throw new HttpsError(
            "failed-precondition",
            "Libere a modelagem antes do corte.",
          );
        cutDelta = m.quantity;
      }
      deltas = planMovement(m, p.get("stages").includes("estamparia"));
      for (const delta of deltas.filter((d) => d.account.includes(":"))) {
        externalQueues[delta.account] ??= [];
        if (delta.quantity > 0) {
          if (externalQueues[delta.account].length >= 100)
            throw new HttpsError(
              "resource-exhausted",
              "Este lote possui 100 envios pendentes ao terceiro. Registre os retornos antes de novos envios.",
            );
          externalQueues[delta.account].push({
            operationId: m.operationId,
            quantity: delta.quantity,
            dueOn: m.dueOn,
          });
        } else {
          let remaining = -delta.quantity;
          for (const entry of externalQueues[delta.account]) {
            const consumed = Math.min(entry.quantity, remaining);
            entry.quantity -= consumed;
            remaining -= consumed;
          }
          if (remaining)
            throw new HttpsError(
              "failed-precondition",
              "Saldo insuficiente no histórico de envios deste terceiro.",
            );
          externalQueues[delta.account] = externalQueues[delta.account].filter(
            (e) => e.quantity > 0,
          );
        }
      }
    }
    const cut = (p.get("cut") ?? 0) + cutDelta;
    if (cut < 0 || cut > p.get("planned"))
      throw new HttpsError(
        "failed-precondition",
        "Corte excede a meta planejada. Ajuste a meta com justificativa.",
      );
    const balances = applyDeltas((l.get("balances") ?? {}) as Balances, deltas);
    for (const [account, entries] of Object.entries(externalQueues))
      if (
        entries.reduce((n, e) => n + e.quantity, 0) !== (balances[account] ?? 0)
      )
        throw new HttpsError(
          "failed-precondition",
          "Saldo divergente dos envios pendentes.",
        );
    const nextDueOn =
      Object.values(externalQueues)
        .flat()
        .map((e) => e.dueOn)
        .sort()[0] ?? "9999-12-31";
    const totals = applyDeltas((p.get("balances") ?? {}) as Balances, deltas);
    if (Object.values(totals).reduce((a, b) => a + b, 0) !== cut)
      throw new HttpsError(
        "failed-precondition",
        "Divergência de saldo: execute a reconciliação.",
      );
    const stamp = { updatedAt: FieldValue.serverTimestamp(), updatedBy: uid };
    tx.set(lot, {
      companyId: m.companyId,
      projectId: m.projectId,
      lotId: m.lotId,
      inspectorUid: l.get("inspectorUid") || uid,
      inspectorName: l.get("inspectorName") || actor.name || uid,
      colorId: m.colorId,
      sizeId: m.sizeId,
      balances,
      externalQueues,
      nextDueOn,
      projectName: p.get("name"),
      clientId: p.get("clientId"),
      productId: p.get("productId"),
      updatedOn: new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      ...stamp,
    });
    const sumPrefix = (prefix: string) =>
      Object.entries(totals)
        .filter(([key]) => key.startsWith(prefix))
        .reduce((sum, [, v]) => sum + v, 0);
    tx.update(project, {
      cut,
      balances: totals,
      shipped: totals.despachado ?? 0,
      printing: sumPrefix("estamparia:"),
      sewing: sumPrefix("costura:"),
      packing: totals.embalagem ?? 0,
      packed: totals.embalado ?? 0,
      status: totals.despachado > 0 ? "Parcialmente concluído" : "Em produção",
      ...stamp,
    });
    tx.create(ledger, {
      ...m,
      queueAccounts: [
        ...new Set(
          deltas.filter((d) => d.account.includes(":")).map((d) => d.account),
        ),
      ],
      queueBefore: Object.fromEntries(
        deltas
          .filter((d) => d.account.includes(":"))
          .map((d) => [d.account, queueBefore[d.account] ?? []]),
      ),
      queueAfter: Object.fromEntries(
        deltas
          .filter((d) => d.account.includes(":"))
          .map((d) => [d.account, externalQueues[d.account] ?? []]),
      ),
      clientId: p.get("clientId"),
      productId: p.get("productId"),
      projectName: p.get("name"),
      hash,
      deltas,
      cutDelta,
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
      recordedAt: FieldValue.serverTimestamp(),
    });
    audit(tx, project, uid, "movement", {
      operationId: m.operationId,
      kind: m.kind,
    });
    return { id: m.operationId, duplicate: false };
  });
}
export async function reconcile(
  uid: string,
  companyId: string,
  projectId: string,
) {
  const db = getFirestore(),
    ref = db.doc(`companies/${companyId}/projects/${projectId}`);
  return db.runTransaction(async (tx) => {
    await authorize(tx, companyId, uid);
    const [p, m, l] = await Promise.all([
      tx.get(ref),
      tx.get(ref.collection("productionMovements")),
      tx.get(ref.collection("productionBalances")),
    ]);
    const lots: Record<string, Balances> = {};
    const totals: Balances = {};
    let cut = 0;
    for (const event of m.docs) {
      cut += event.get("cutDelta");
      const key = event.get("lotId");
      lots[key] ??= {};
      for (const d of event.get("deltas") as Delta[]) {
        lots[key][d.account] = (lots[key][d.account] ?? 0) + d.quantity;
        totals[d.account] = (totals[d.account] ?? 0) + d.quantity;
      }
    }
    const divergences = l.docs
      .filter((d) => !sameBalances(d.get("balances"), lots[d.id] ?? {}))
      .map((d) => d.id);
    for (const key of Object.keys(lots))
      if (!l.docs.some((d) => d.id === key)) divergences.push(key);
    const valid =
      divergences.length === 0 &&
      sameBalances(p.get("balances") ?? {}, totals) &&
      p.get("cut") === cut;
    const result = { valid, divergences, cut, totals, movementCount: m.size };
    tx.update(ref, {
      reconciliationOk: valid,
      reconciledAt: FieldValue.serverTimestamp(),
    });
    audit(tx, ref, uid, "reconcile", result);
    return result;
  });
}
