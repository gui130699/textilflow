import { z } from "zod";
import {
  collection,
  collectionGroup,
  doc,
  documentId,
  getDoc,
  getDocs,
  getAggregateFromServer,
  count,
  sum,
  limit,
  orderBy,
  query,
  getDocFromServer,
  startAfter,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { today } from "@/lib/utils";
import {
  date,
  id,
  sameBalances,
  statuses,
  type Balances,
  type Delta,
} from "../../../functions/src/domain";

export async function reconcileProduction(raw: unknown) {
  const { companyId, projectId } = z
    .object({ companyId: id, projectId: id })
    .parse(raw);
  const project = doc(db, "companies", companyId, "projects", projectId);
  // Retry if production changed while the read-only reconciliation was running.
  const snapshot = await getDocFromServer(project);
  if (!snapshot.exists()) throw Error("Projeto não encontrado.");
  const [movements, lots] = await Promise.all([
    getDocs(collection(project, "productionMovements")),
    getDocs(collection(project, "productionBalances")),
  ]);
  const current = await getDocFromServer(project);
  if (!current.get("updatedAt")?.isEqual(snapshot.get("updatedAt")))
    throw Error("O projeto foi atualizado. Execute a conferência novamente.");
  const expected = new Map<string, Balances>();
  const totals: Balances = {};
  let cut = 0;
  for (const movement of movements.docs) {
    cut += movement.get("cutDelta");
    const lotId = movement.get("lotId");
    const balance = expected.get(lotId) ?? {};
    for (const { account, quantity } of movement.get("deltas") as Delta[]) {
      balance[account] = (balance[account] ?? 0) + quantity;
      totals[account] = (totals[account] ?? 0) + quantity;
    }
    expected.set(lotId, balance);
  }
  let valid =
    current.get("cut") === cut &&
    sameBalances(current.get("balances") ?? {}, totals);
  for (const lot of lots.docs) {
    valid &&= sameBalances(lot.get("balances"), expected.get(lot.id) ?? {});
    expected.delete(lot.id);
  }
  return { valid: valid && expected.size === 0, movementCount: movements.size };
}

const open = statuses.slice(0, 6);
const totals = [
  "cut",
  "shipped",
  "printing",
  "sewing",
  "packing",
  "packed",
] as const;
export async function dashboard(raw: unknown) {
  const { companyId } = z.object({ companyId: id }).parse(raw);
  const projects = collection(db, "companies", companyId, "projects");
  const day = today();
  const lateQuery = query(
    projects,
    where("status", "in", open),
    where("dueOn", "<", day),
  );
  const stageKeys = ["cut", "printing", "sewing", "packing"];
  const [
    stats,
    counts,
    stagesCount,
    lateCount,
    late,
    pending,
    materials,
    external,
    divergences,
    completed,
    stale,
  ] = await Promise.all([
    getAggregateFromServer(projects, {
      total: count(),
      cut: sum("cut"),
      shipped: sum("shipped"),
      printing: sum("printing"),
      sewing: sum("sewing"),
      packing: sum("packing"),
      packed: sum("packed"),
    }),
    Promise.all(
      statuses.map(async (status) => ({
        status,
        count: (
          await getAggregateFromServer(
            query(projects, where("status", "==", status)),
            { n: count() },
          )
        ).data().n,
      })),
    ),
    Promise.all(
      stageKeys.map(async (key) => ({
        key,
        count: (
          await getAggregateFromServer(
            query(
              projects,
              where(key, ">", 0),
              where("status", "in", ["Em produção", "Parcialmente concluído"]),
            ),
            { n: count() },
          )
        ).data().n,
      })),
    ),
    getAggregateFromServer(lateQuery, { n: count() }),
    getDocs(query(lateQuery, orderBy("dueOn"), limit(10))),
    getDocs(
      query(
        projects,
        where("modelingStatus", "!=", "Liberada"),
        orderBy("modelingStatus"),
        limit(5),
      ),
    ),
    getDocs(
      query(
        collectionGroup(db, "materialReceipts"),
        where("companyId", "==", companyId),
        where("pendingInspection", "==", true),
        limit(5),
      ),
    ),
    getDocs(
      query(
        collectionGroup(db, "productionBalances"),
        where("companyId", "==", companyId),
        where("nextDueOn", "<", day),
        orderBy("nextDueOn"),
        limit(5),
      ),
    ),
    getDocs(query(projects, where("reconciliationOk", "==", false), limit(5))),
    getDocs(
      query(
        projects,
        where("status", "==", "Concluído"),
        orderBy("updatedAt", "desc"),
        limit(3),
      ),
    ),
    getDocs(
      query(
        projects,
        where("status", "==", "Em produção"),
        where("updatedAt", "<", new Date(Date.now() - 7 * 86400000)),
        orderBy("updatedAt"),
        limit(5),
      ),
    ),
  ]);
  return {
    summary: {
      ...Object.fromEntries(totals.map((key) => [key, stats.data()[key] ?? 0])),
      total: stats.data().total,
      late: lateCount.data().n,
    },
    counts,
    stagesCount,
    alerts: [
      ...divergences.docs.map((d) => ({
        projectId: d.id,
        name: d.get("name"),
        message: "Divergência de quantidades.",
        kind: "divergence",
      })),
      ...external.docs.map((d) => ({
        projectId: d.get("projectId"),
        name: d.get("projectName"),
        message: `Terceiro com peças pendentes desde ${d.get("nextDueOn")}.`,
        kind: "external",
      })),
      ...materials.docs.map((d) => ({
        projectId: d.get("projectId"),
        name: d.get("projectName"),
        message: "Material recebido aguardando inspeção.",
        kind: "inspection",
      })),
      ...late.docs.map((d) => ({
        projectId: d.id,
        name: d.get("name"),
        message: `Prazo ultrapassado: ${d.get("dueOn")}.`,
        kind: "late",
      })),
      ...pending.docs
        .filter((d) => open.includes(d.get("status")))
        .map((d) => ({
          projectId: d.id,
          name: d.get("name"),
          message: "Modelagem ainda não liberada.",
          kind: "modeling",
        })),
      ...stale.docs.map((d) => ({
        projectId: d.id,
        name: d.get("name"),
        message: "Produção sem atualização há mais de 7 dias.",
        kind: "stale",
      })),
      ...completed.docs.map((d) => ({
        projectId: d.id,
        name: d.get("name"),
        message: "Projeto concluído. Consulte o relatório final.",
        kind: "completed",
      })),
    ],
  };
}

const optionalId = id.or(z.literal("")).default("");
const optionalDate = date.or(z.literal("")).default("");
const filters = z.object({
  companyId: id,
  kind: z.enum([
    "projects",
    "productionMovements",
    "inspections",
    "productionBalances",
  ]),
  projectId: optionalId,
  clientId: optionalId,
  productId: optionalId,
  thirdPartyId: optionalId,
  stage: z.string().max(40).default(""),
  status: z.string().max(40).default(""),
  from: optionalDate,
  to: optionalDate,
  cursor: z.string().max(500).default(""),
  lateOnly: z.boolean().default(false),
});
export async function reportPage(raw: unknown) {
  const f = filters.parse(raw);
  if (f.from && f.to && f.from > f.to)
    throw Error("O início do período deve anteceder o fim.");
  const path = `companies/${f.companyId}/projects`;
  const isProject = f.kind === "projects";
  const dateField = isProject
    ? f.lateOnly
      ? "dueOn"
      : "openedOn"
    : f.kind === "productionBalances"
      ? "updatedOn"
      : "occurredOn";
  if (isProject && f.lateOnly && f.status && !open.some((s) => s === f.status))
    return { rows: [], cursor: null };
  if (isProject && f.projectId) {
    const result = await getDoc(doc(db, path, f.projectId));
    const d = result.data();
    const matches =
      d &&
      (["clientId", "productId", "status"] as const).every(
        (k) => !f[k] || d[k] === f[k],
      ) &&
      (!f.from || d[dateField] >= f.from) &&
      (!f.to || d[dateField] <= f.to) &&
      (!f.lateOnly || (d.dueOn < today() && open.includes(d.status)));
    return { rows: matches ? [{ ...d, id: result.id }] : [], cursor: null };
  }
  const constraints: QueryConstraint[] = [];
  if (!isProject) constraints.push(where("companyId", "==", f.companyId));
  if (f.projectId) constraints.push(where("projectId", "==", f.projectId));
  for (const k of [
    "clientId",
    "productId",
    "thirdPartyId",
    "stage",
    "status",
  ] as const) {
    if (
      f[k] &&
      !(
        f.kind === "productionBalances" &&
        ["thirdPartyId", "stage", "status"].includes(k)
      )
    )
      constraints.push(where(k, "==", f[k]));
  }
  if (isProject && f.lateOnly) {
    constraints.push(where("dueOn", "<", today()));
    if (!f.status) constraints.push(where("status", "in", open));
  }
  if (f.from) constraints.push(where(dateField, ">=", f.from));
  if (f.to) constraints.push(where(dateField, "<=", f.to));
  constraints.push(orderBy(dateField, "desc"), orderBy(documentId()));
  if (f.cursor) {
    const parts = f.cursor.split("/");
    if (
      !f.cursor.startsWith(path + "/") ||
      (isProject
        ? parts.length !== 4
        : parts.length !== 6 || parts[4] !== f.kind)
    )
      throw Error("Cursor inválido.");
    const cursor = await getDoc(doc(db, f.cursor));
    if (!cursor.exists()) throw Error("Cursor expirado.");
    constraints.push(startAfter(cursor));
  }
  const result = await getDocs(
    query(
      isProject ? collection(db, path) : collectionGroup(db, f.kind),
      ...constraints,
      limit(100),
    ),
  );
  return {
    rows: result.docs.map((d) => ({ ...d.data(), id: d.id })),
    cursor: result.size === 100 ? result.docs.at(-1)!.ref.path : null,
  };
}
