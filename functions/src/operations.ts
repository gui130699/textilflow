import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  Timestamp,
  AggregateField,
  FieldPath,
  type Query,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError } from "firebase-functions/v2/https";
import type { DecodedIdToken } from "firebase-admin/auth";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import {
  catalogKinds,
  catalogSchema,
  projectSchema,
  id,
  text,
  date,
  DomainError,
} from "./domain";
import { authorize, audit, move, reconcile } from "./production";
import { validCnpj } from "./cnpj";
import { lookupCompany } from "./company-lookup";
if (getApps().length === 0) initializeApp();
const db = getFirestore();
export function verifyOperationToken(token: string) {
  return getAuth().verifyIdToken(token, true);
}
type OperationRequest = {
  data: unknown;
  auth?: { uid: string; token: DecodedIdToken };
};
function uid(r: OperationRequest) {
  if (!r.auth)
    throw new HttpsError(
      "unauthenticated",
      "Entre na sua conta para continuar.",
    );
  return r.auth.uid;
}
function operation(fn: (r: OperationRequest) => Promise<unknown>) {
  return async (r: OperationRequest) => {
    try {
      return await fn(r);
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      if (e instanceof z.ZodError)
        throw new HttpsError(
          "invalid-argument",
          e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        );
      if (e instanceof DomainError)
        throw new HttpsError("failed-precondition", e.message);
      console.error("Operation failed", e);
      throw new HttpsError(
        "internal",
        "Não foi possível concluir. Tente novamente.",
      );
    }
  };
}
const context = z.object({ companyId: id, projectId: id });
const registeredInspector = (r: OperationRequest, profile: boolean) =>
  r.auth?.token.inspector === true ||
  (r.auth?.token.email_verified === true && profile);

export const lookupCompanyCnpj = operation(async (r) => {
  const user = uid(r);
  const { taxId } = z.object({ taxId: z.string().max(32) }).parse(r.data);
  const profile = await db.doc(`users/${user}`).get();
  if (!registeredInspector(r, profile.get("inspectorRegistered") === true))
    throw new HttpsError(
      "permission-denied",
      "Conclua seu cadastro de inspetor para consultar o CNPJ.",
    );
  return lookupCompany(taxId);
});

export const registerInspector = operation(async (r) => {
  const user = uid(r);
  if (!r.auth?.token.email_verified)
    throw new HttpsError(
      "failed-precondition",
      "Confirme seu e-mail antes de cadastrar o perfil.",
    );
  const { name } = z
    .object({ name: z.string().trim().min(2).max(120) })
    .parse(r.data);
  await db
    .doc(`users/${user}`)
    .set({ name, inspectorRegistered: true }, { merge: true });
  return { ok: true };
});
export const companiesForUser = operation(async (r) => {
  const user = uid(r);
  const [links, profile] = await Promise.all([
    db.collection(`users/${user}/companies`).get(),
    db.doc(`users/${user}`).get(),
  ]);
  const values = await Promise.all(
    links.docs.map(async (l) => {
      const [c, m] = await Promise.all([
        db.doc(`companies/${l.id}`).get(),
        db.doc(`companies/${l.id}/members/${user}`).get(),
      ]);
      return c.exists && m.get("active")
        ? { id: c.id, ...c.data(), role: m.get("role") }
        : null;
    }),
  );
  return {
    companies: values.filter(Boolean),
    canCreate: registeredInspector(
      r,
      profile.get("inspectorRegistered") === true,
    ),
  };
});
export const saveCompany = operation(async (r) => {
  const user = uid(r),
    input = z.object({ id: id, data: catalogSchema }).parse(r.data);
  const ref = db.doc(`companies/${input.id}`);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (input.data.image !== (existing.get("image") ?? ""))
      throw new HttpsError(
        "invalid-argument",
        "Use o envio de imagem para alterar o logo.",
      );
    if (existing.exists) {
      const membership = await tx.get(ref.collection("members").doc(user));
      if (!membership.get("active") || membership.get("role") !== "inspector")
        throw new HttpsError("permission-denied", "Acesso não autorizado.");
      if (existing.get("taxId") && existing.get("taxId") !== input.data.taxId)
        throw new HttpsError(
          "failed-precondition",
          "O documento de uma empresa cadastrada não pode ser alterado.",
        );
    }
    const profile = await tx.get(db.doc(`users/${user}`));
    if (
      !existing.exists &&
      !registeredInspector(r, profile.get("inspectorRegistered") === true)
    )
      throw new HttpsError(
        "permission-denied",
        "Cadastre seu perfil de inspetor com e-mail verificado.",
      );
    const taxId = input.data.taxId;
    if (
      !existing.exists &&
      r.auth?.token.inspector !== true &&
      taxId.length !== 14
    )
      throw new HttpsError(
        "invalid-argument",
        "Informe o CNPJ completo da empresa.",
      );
    if (taxId.length === 14) {
      if (existing.get("taxId") !== taxId && !validCnpj(taxId))
        throw new HttpsError("invalid-argument", "Confira o CNPJ informado.");
      const registry = db.doc(`companyCnpjs/${taxId}`);
      const [indexed, legacy] = await Promise.all([
        tx.get(registry),
        tx.get(db.collection("companies").where("taxId", "==", taxId).limit(2)),
      ]);
      if (legacy.size > 1)
        throw new HttpsError(
          "failed-precondition",
          "O CNPJ possui cadastros duplicados antigos. Contate o administrador.",
        );
      const registeredId = indexed.get("companyId") || legacy.docs[0]?.id;
      if (registeredId && registeredId !== input.id) {
        if (existing.exists)
          throw new HttpsError(
            "already-exists",
            "Este CNPJ já pertence a outra empresa.",
          );
        const company = db.doc(`companies/${registeredId}`);
        const request = company.collection("inspectorRequests").doc(user);
        const [target, membership, previous] = await Promise.all([
          tx.get(company),
          tx.get(company.collection("members").doc(user)),
          tx.get(request),
        ]);
        if (membership.get("active") && membership.get("role") === "inspector")
          return { status: "already-member" };
        if (!target.get("active") || !target.get("createdBy"))
          throw new HttpsError(
            "failed-precondition",
            "O responsável pelo cadastro desta empresa precisa regularizar o acesso.",
          );
        if (!r.auth?.token.email_verified)
          throw new HttpsError(
            "failed-precondition",
            "Confirme seu e-mail para pedir acesso.",
          );
        if (!previous.exists || previous.get("status") !== "pending") {
          tx.set(request, {
            status: "pending",
            email: r.auth.token.email ?? "",
            name: profile.get("name") || r.auth.token.name || "Inspetor",
            createdAt: FieldValue.serverTimestamp(),
          });
          audit(tx, company, user, "requestInspectorAccess", {
            requesterId: user,
          });
        }
        return { status: "pending" };
      }
      if (!indexed.exists) tx.create(registry, { companyId: input.id });
    }
    tx.set(
      ref,
      {
        ...input.data,
        companyId: input.id,
        searchName: input.data.name.toLocaleLowerCase("pt-BR"),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user,
        ...(!existing.exists
          ? { createdAt: FieldValue.serverTimestamp(), createdBy: user }
          : {}),
      },
      { merge: true },
    );
    if (!existing.exists) {
      tx.create(ref.collection("members").doc(user), {
        role: "inspector",
        name:
          profile.get("name") ||
          r.auth?.token.name ||
          r.auth?.token.email ||
          "Inspetor",
        active: true,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(db.doc(`users/${user}/companies/${input.id}`), {
        companyId: input.id,
      });
    }
    audit(tx, ref, user, "saveCompany", input.data);
    return { id: input.id, status: "saved" };
  });
});
export const decideInspectorRequest = operation(async (r) => {
  const user = uid(r);
  const { companyId, requesterId, approve } = z
    .object({
      companyId: id,
      requesterId: id,
      approve: z.boolean(),
    })
    .parse(r.data);
  const company = db.doc(`companies/${companyId}`);
  const request = company.collection("inspectorRequests").doc(requesterId);
  await db.runTransaction(async (tx) => {
    await authorize(tx, companyId, user);
    const [target, pending] = await Promise.all([
      tx.get(company),
      tx.get(request),
    ]);
    if (target.get("createdBy") !== user)
      throw new HttpsError(
        "permission-denied",
        "Somente o primeiro inspetor pode decidir este pedido.",
      );
    if (pending.get("status") !== "pending")
      throw new HttpsError(
        "failed-precondition",
        "Este pedido já foi analisado.",
      );
    tx.update(request, {
      status: approve ? "approved" : "rejected",
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: user,
    });
    if (approve) {
      tx.set(
        company.collection("members").doc(requesterId),
        {
          role: "inspector",
          name: pending.get("name"),
          active: true,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(db.doc(`users/${requesterId}/companies/${companyId}`), {
        companyId,
      });
    }
    audit(tx, company, user, "decideInspectorRequest", {
      requesterId,
      approve,
    });
  });
  return { ok: true };
});
export const listInspectorRequests = operation(async (r) => {
  const user = uid(r);
  const { companyId } = z.object({ companyId: id }).parse(r.data);
  const company = db.doc(`companies/${companyId}`);
  return db.runTransaction(async (tx) => {
    await authorize(tx, companyId, user);
    if ((await tx.get(company)).get("createdBy") !== user)
      throw new HttpsError(
        "permission-denied",
        "Somente o primeiro inspetor pode consultar estes pedidos.",
      );
    const pending = await tx.get(
      company
        .collection("inspectorRequests")
        .where("status", "==", "pending")
        .limit(100),
    );
    return pending.docs.map((request) => ({
      id: request.id,
      name: request.get("name"),
      email: request.get("email"),
    }));
  });
});
export const listLotInspectors = operation(async (r) => {
  const user = uid(r);
  const { companyId } = z.object({ companyId: id }).parse(r.data);
  return db.runTransaction(async (tx) => {
    await authorize(tx, companyId, user);
    const members = await tx.get(
      db
        .collection(`companies/${companyId}/members`)
        .where("role", "==", "inspector")
        .where("active", "==", true),
    );
    return members.docs.map((member) => ({
      id: member.id,
      name: member.get("name") || member.id,
    }));
  });
});
export const assignLotInspector = operation(async (r) => {
  const user = uid(r);
  const { companyId, projectId, lotId, inspectorUid } = context
    .extend({ lotId: id, inspectorUid: id })
    .parse(r.data);
  const company = db.doc(`companies/${companyId}`);
  const project = company.collection("projects").doc(projectId);
  const lot = project.collection("productionBalances").doc(lotId);
  await db.runTransaction(async (tx) => {
    await authorize(tx, companyId, user);
    const [projectDoc, current, member] = await Promise.all([
      tx.get(project),
      tx.get(lot),
      tx.get(company.collection("members").doc(inspectorUid)),
    ]);
    if (!projectDoc.exists || !current.exists)
      throw new HttpsError("not-found", "Lote não encontrado.");
    if (!member.get("active") || member.get("role") !== "inspector")
      throw new HttpsError(
        "failed-precondition",
        "Selecione um inspetor ativo desta empresa.",
      );
    tx.update(lot, {
      inspectorUid,
      inspectorName: member.get("name") || inspectorUid,
    });
    audit(tx, project, user, "assignLotInspector", {
      lotId,
      previousInspectorUid: current.get("inspectorUid") ?? null,
      inspectorUid,
    });
  });
  return { ok: true };
});
export const saveCatalog = operation(async (r) => {
  const user = uid(r),
    input = z
      .object({
        companyId: id,
        kind: z.enum(catalogKinds),
        id: id,
        data: catalogSchema,
      })
      .parse(r.data);
  const company = db.doc(`companies/${input.companyId}`),
    ref = company.collection(input.kind).doc(input.id);
  await db.runTransaction(async (tx) => {
    await authorize(tx, input.companyId, user);
    const previous = await tx.get(ref);
    if (input.data.image !== (previous.get("image") ?? ""))
      throw new HttpsError(
        "invalid-argument",
        "Use o envio de imagem para alterar a foto.",
      );
    for (const [key, collection] of [
      ["supplierId", "suppliers"],
      ["productId", "products"],
    ] as const) {
      if (input.data[key]) {
        const linked = await tx.get(
          company.collection(collection).doc(input.data[key]),
        );
        if (!linked.get("active"))
          throw new HttpsError(
            "invalid-argument",
            "Vínculo deve pertencer à empresa e estar ativo.",
          );
      }
    }
    tx.set(
      ref,
      {
        ...input.data,
        companyId: input.companyId,
        searchName: input.data.name.toLocaleLowerCase("pt-BR"),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user,
        ...(!previous.exists
          ? { createdAt: FieldValue.serverTimestamp(), createdBy: user }
          : {}),
      },
      { merge: true },
    );
    audit(tx, company, user, "saveCatalog", {
      kind: input.kind,
      id: input.id,
      before: previous.data() ?? null,
      after: input.data,
    });
  });
  return { id: input.id };
});
export const saveProject = operation(async (r) => {
  const user = uid(r),
    input = z
      .object({
        companyId: id,
        id: id,
        data: projectSchema,
        reason: text.default(""),
      })
      .parse(r.data),
    company = db.doc(`companies/${input.companyId}`),
    ref = company.collection("projects").doc(input.id);
  await db.runTransaction(async (tx) => {
    await authorize(tx, input.companyId, user);
    const previous = await tx.get(ref);
    const refs: [[string, string], ...[string, string][]] = [
      ["clients", input.data.clientId],
      ["products", input.data.productId],
      ...([
        ...(input.data.modelId ? [["models", input.data.modelId]] : []),
        ...input.data.materialIds.map((v) => ["materials", v]),
        ...input.data.thirdPartyIds.map((v) => ["thirdParties", v]),
        ...input.data.supplierIds.map((v) => ["suppliers", v]),
        ...input.data.moduleIds.map((v) => ["modules", v]),
      ] as [string, string][]),
    ];
    const linked = await Promise.all(
      refs.map(([kind, key]) => tx.get(company.collection(kind).doc(key))),
    );
    if (linked.some((s) => !s.get("active")))
      throw new HttpsError(
        "invalid-argument",
        "Todos os vínculos devem estar ativos nesta empresa.",
      );
    if (input.data.modelId) {
      const model = linked.find((d) => d.ref.parent.id === "models");
      if (model?.get("productId") !== input.data.productId)
        throw new HttpsError(
          "invalid-argument",
          "Modelo não pertence ao produto selecionado.",
        );
    }
    if (previous.exists) {
      if (input.data.planned < previous.get("cut"))
        throw new HttpsError(
          "failed-precondition",
          "Meta menor que o corte realizado.",
        );
      if (
        input.data.planned !== previous.get("planned") &&
        input.reason.length < 5
      )
        throw new HttpsError(
          "invalid-argument",
          "Justifique o ajuste da meta.",
        );
      if (
        previous.get("cut") > 0 &&
        (JSON.stringify(input.data.stages) !==
          JSON.stringify(previous.get("stages")) ||
          JSON.stringify(input.data.moduleIds) !==
            JSON.stringify(previous.get("moduleIds")))
      )
        throw new HttpsError(
          "failed-precondition",
          "Etapas históricas não podem ser alteradas após iniciar produção.",
        );
    }
    if (["Concluído", "Cancelado"].includes(input.data.status)) {
      const b = previous.get("balances") ?? {};
      const wip = Object.entries(b).some(
        ([k, v]) => !["despachado", "perdas"].includes(k) && Number(v) > 0,
      );
      if (
        (wip || (b.despachado ?? 0) < input.data.planned) &&
        input.reason.length < 10
      )
        throw new HttpsError(
          "failed-precondition",
          "Encerramento excepcional exige justificativa detalhada.",
        );
    }
    tx.set(
      ref,
      {
        ...input.data,
        companyId: input.companyId,
        searchName: input.data.name.toLocaleLowerCase("pt-BR"),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user,
        ...(!previous.exists
          ? {
              createdAt: FieldValue.serverTimestamp(),
              createdBy: user,
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
    audit(tx, ref, user, "saveProject", {
      before: previous.data() ?? null,
      after: input.data,
      reason: input.reason,
    });
  });
  return { id: input.id };
});
const eventSchema = context.extend({
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
export const recordEvent = operation(async (r) => {
  const user = uid(r),
    input = eventSchema.parse(r.data),
    { companyId, projectId, operationId, kind, data } = input;
  const ref = db.doc(`companies/${companyId}/projects/${projectId}`),
    event = ref.collection(kind).doc(operationId),
    hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  await db.runTransaction(async (tx) => {
    await authorize(tx, companyId, user);
    const [project, existing] = await Promise.all([tx.get(ref), tx.get(event)]);
    if (existing.exists) {
      if (existing.get("hash") !== hash)
        throw new HttpsError("already-exists", "Operação já utilizada.");
      return;
    }
    if (
      !project.exists ||
      ["Concluído", "Cancelado", "Suspenso"].includes(project.get("status"))
    )
      throw new HttpsError("failed-precondition", "Projeto indisponível.");
    const scaled = (n: number) => {
      const value = Math.round(n * 1000);
      if (Math.abs(value / 1000 - n) > 0.0000001)
        throw new HttpsError(
          "invalid-argument",
          "Máximo de três casas decimais.",
        );
      return value;
    };
    if (
      !["quilograma", "metro"].includes(data.unit) &&
      ![data.quantity, data.approved, data.rejected].every(Number.isInteger)
    )
      throw new HttpsError(
        "invalid-argument",
        "Esta unidade exige quantidades inteiras.",
      );
    if (kind === "materialReceipts") {
      if (!data.materialId || !data.supplierId || data.quantity <= 0)
        throw new HttpsError(
          "invalid-argument",
          "Informe material, fornecedor e quantidade.",
        );
      for (const [collection, key] of [
        ["materials", data.materialId],
        ["suppliers", data.supplierId],
      ]) {
        const linked = await tx.get(
          db.doc(`companies/${companyId}/${collection}/${key}`),
        );
        if (!linked.get("active"))
          throw new HttpsError(
            "invalid-argument",
            "Material ou fornecedor inválido.",
          );
      }
    }
    if (kind === "inspections") {
      if (
        !data.receiptId ||
        data.quantity <= 0 ||
        scaled(data.approved) + scaled(data.rejected) !==
          scaled(data.quantity) ||
        (data.rejected > 0 && !data.reason)
      )
        throw new HttpsError(
          "invalid-argument",
          "Aprovado + reprovado deve ser igual à quantidade inspecionada. Justifique reprovações.",
        );
      const receiptRef = ref.collection("materialReceipts").doc(data.receiptId),
        receipt = await tx.get(receiptRef);
      if (
        !receipt.exists ||
        receipt.get("unit") !== data.unit ||
        (receipt.get("inspectedScaled") ?? 0) + scaled(data.quantity) >
          receipt.get("quantityScaled")
      )
        throw new HttpsError(
          "failed-precondition",
          "Inspeção excede o recebido ou usa unidade diferente.",
        );
      tx.update(receiptRef, {
        pendingInspection:
          (receipt.get("inspectedScaled") ?? 0) + scaled(data.quantity) <
          receipt.get("quantityScaled"),
        inspectedScaled:
          (receipt.get("inspectedScaled") ?? 0) + scaled(data.quantity),
      });
    }
    if (
      kind === "modeling" &&
      ![
        "Aguardando liberação",
        "Em desenvolvimento",
        "Liberada",
        "Bloqueada",
      ].includes(data.status)
    )
      throw new HttpsError(
        "invalid-argument",
        "Situação de modelagem inválida.",
      );
    tx.create(event, {
      ...(kind === "materialReceipts" ? { pendingInspection: true } : {}),
      ...data,
      projectName: project.get("name"),
      clientId: project.get("clientId"),
      productId: project.get("productId"),
      quantityScaled: scaled(data.quantity),
      approvedScaled: scaled(data.approved),
      rejectedScaled: scaled(data.rejected),
      weightScaled: scaled(data.weight),
      companyId,
      projectId,
      operationId,
      hash,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: user,
    });
    tx.update(ref, {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user,
      ...(kind === "modeling" ? { modelingStatus: data.status } : {}),
    });
    audit(tx, ref, user, kind, { operationId });
  });
  return { id: operationId };
});
export const productionMovement = operation((r) => move(uid(r), r.data));
export const reconcileProduction = operation((r) => {
  const c = context.parse(r.data);
  return reconcile(uid(r), c.companyId, c.projectId);
});
export const createInvite = operation(async (r) => {
  const user = uid(r),
    input = z
      .object({
        companyId: id,
        email: z.email(),
        role: z.enum(["owner", "inspector"]),
      })
      .parse(r.data),
    token = randomBytes(32).toString("hex"),
    hash = createHash("sha256").update(token).digest("hex");
  await db.runTransaction(async (tx) => {
    await authorize(tx, input.companyId, user);
    if (
      input.role === "inspector" &&
      (await tx.get(db.doc(`companies/${input.companyId}`))).get(
        "createdBy",
      ) !== user
    )
      throw new HttpsError(
        "permission-denied",
        "Somente o primeiro inspetor pode convidar outro inspetor.",
      );
    tx.create(db.doc(`invites/${hash}`), {
      ...input,
      email: input.email.toLowerCase(),
      createdBy: user,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 48 * 60 * 60 * 1000),
      used: false,
    });
    audit(tx, db.doc(`companies/${input.companyId}`), user, "inviteCreated", {
      email: input.email,
      role: input.role,
    });
  });
  return { token, expiresInHours: 48 };
});
export const acceptInvite = operation(async (r) => {
  const user = uid(r),
    { token } = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(r.data);
  if (!r.auth?.token.email_verified)
    throw new HttpsError(
      "failed-precondition",
      "Confirme seu e-mail antes de aceitar o convite.",
    );
  const ref = db.doc(
    `invites/${createHash("sha256").update(token).digest("hex")}`,
  );
  await db.runTransaction(async (tx) => {
    const invite = await tx.get(ref);
    if (
      !invite.exists ||
      invite.get("used") ||
      invite.get("expiresAt").toMillis() < Date.now() ||
      invite.get("email") !== r.auth?.token.email?.toLowerCase()
    )
      throw new HttpsError(
        "permission-denied",
        "Convite inválido, expirado ou de outro e-mail.",
      );
    await authorize(tx, invite.get("companyId"), invite.get("createdBy"));
    const company = invite.get("companyId");
    if (
      invite.get("role") === "inspector" &&
      (await tx.get(db.doc(`companies/${company}`))).get("createdBy") !==
        invite.get("createdBy")
    )
      throw new HttpsError(
        "permission-denied",
        "Convite sem autorização do primeiro inspetor.",
      );
    const memberRef = db.doc(`companies/${company}/members/${user}`);
    const currentMember = await tx.get(memberRef);
    if (
      currentMember.get("role") === "inspector" &&
      invite.get("role") !== "inspector"
    )
      throw new HttpsError(
        "failed-precondition",
        "Este usuário já é inspetor desta empresa.",
      );
    tx.set(memberRef, {
      active: true,
      role: invite.get("role"),
      name: r.auth?.token.name || r.auth?.token.email || "Usuário",
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`users/${user}/companies/${company}`), {
      companyId: company,
    });
    tx.update(ref, {
      used: true,
      usedBy: user,
      usedAt: FieldValue.serverTimestamp(),
    });
    audit(tx, db.doc(`companies/${company}`), user, "inviteAccepted", {
      role: invite.get("role"),
    });
  });
  return { ok: true };
});
export const updateMember = operation(async (r) => {
  const user = uid(r),
    input = z
      .object({ companyId: id, memberId: id, active: z.boolean() })
      .parse(r.data);
  if (user === input.memberId)
    throw new HttpsError(
      "failed-precondition",
      "Não é permitido alterar o próprio acesso.",
    );
  await db.runTransaction(async (tx) => {
    await authorize(tx, input.companyId, user);
    const ref = db.doc(
      `companies/${input.companyId}/members/${input.memberId}`,
    );
    const member = await tx.get(ref);
    if (!member.exists)
      throw new HttpsError("not-found", "Vínculo não encontrado.");
    if (
      member.get("role") === "inspector" &&
      (await tx.get(db.doc(`companies/${input.companyId}`))).get(
        "createdBy",
      ) !== user
    )
      throw new HttpsError(
        "permission-denied",
        "Somente o primeiro inspetor pode gerenciar outro inspetor.",
      );
    tx.update(ref, {
      active: input.active,
      updatedAt: FieldValue.serverTimestamp(),
    });
    audit(
      tx,
      db.doc(`companies/${input.companyId}`),
      user,
      "updateMember",
      input,
    );
  });
  return { ok: true };
});
export const saveProfile = operation(async (r) => {
  const user = uid(r),
    data = z
      .object({
        name: z.string().trim().min(2).max(160),
        phone: text.default(""),
      })
      .parse(r.data);
  await getAuth().updateUser(user, { displayName: data.name });
  await db
    .doc(`users/${user}`)
    .set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

export const saveAttachment = operation(async (r) => {
  const user = uid(r),
    input = context
      .extend({
        id,
        name: z.string().min(1).max(200),
        ownerVisible: z.boolean(),
      })
      .parse(r.data);
  await db.runTransaction(async (tx) => {
    await authorize(tx, input.companyId, user);
  });
  const path = `companies/${input.companyId}/projects/${input.projectId}/${input.id}`,
    file = getStorage().bucket().file(path);
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) > 10 * 1024 * 1024)
    throw new HttpsError("invalid-argument", "Arquivo maior que 10 MB.");
  const [bytes] = await file.download({ start: 0, end: 15 });
  const type = metadata.contentType;
  const valid =
    type === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : type === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : type === "application/pdf"
          ? bytes.subarray(0, 5).toString() === "%PDF-"
          : false;
  if (!valid)
    throw new HttpsError("invalid-argument", "Formato de arquivo inválido.");
  await db.runTransaction(async (tx) => {
    await authorize(tx, input.companyId, user);
    const project = db.doc(
      `companies/${input.companyId}/projects/${input.projectId}`,
    );
    const p = await tx.get(project);
    if (!p.exists) throw new HttpsError("not-found", "Projeto inexistente.");
    tx.create(project.collection("attachments").doc(input.id), {
      ...input,
      path,
      size: Number(metadata.size),
      contentType: type,
      createdBy: user,
      createdAt: FieldValue.serverTimestamp(),
    });
    audit(tx, project, user, "attachment", {
      id: input.id,
      name: input.name,
      ownerVisible: input.ownerVisible,
    });
  });
  return { ok: true };
});
export const dashboard = operation(async (r) => {
  const user = uid(r),
    { companyId } = z.object({ companyId: id }).parse(r.data);
  await db.runTransaction((tx) => authorize(tx, companyId, user, false));
  const projects = db.collection(`companies/${companyId}/projects`),
    today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const [
    summary,
    counts,
    late,
    pending,
    materials,
    external,
    divergences,
    completed,
    lateCount,
    stagesCount,
    stale,
    packagingSummary,
  ] = await Promise.all([
    projects
      .aggregate({
        total: AggregateField.count(),
        cut: AggregateField.sum("cut"),
        shipped: AggregateField.sum("shipped"),
        printing: AggregateField.sum("printing"),
        sewing: AggregateField.sum("sewing"),
      })
      .get(),
    Promise.all(
      [
        "Planejado",
        "Aguardando material",
        "Em inspeção",
        "Aguardando modelagem",
        "Em produção",
        "Parcialmente concluído",
        "Concluído",
        "Suspenso",
        "Cancelado",
      ].map(async (status) => ({
        status,
        count: (
          await projects.where("status", "==", status).count().get()
        ).data().count,
      })),
    ),
    projects
      .where("status", "in", [
        "Planejado",
        "Aguardando material",
        "Em inspeção",
        "Aguardando modelagem",
        "Em produção",
        "Parcialmente concluído",
      ])
      .where("dueOn", "<", today)
      .orderBy("dueOn")
      .limit(10)
      .get(),
    projects
      .where("modelingStatus", "!=", "Liberada")
      .orderBy("modelingStatus")
      .limit(5)
      .get(),
    db
      .collectionGroup("materialReceipts")
      .where("companyId", "==", companyId)
      .where("pendingInspection", "==", true)
      .limit(5)
      .get(),
    db
      .collectionGroup("productionBalances")
      .where("companyId", "==", companyId)
      .where("nextDueOn", "<", today)
      .orderBy("nextDueOn")
      .limit(5)
      .get(),
    projects.where("reconciliationOk", "==", false).limit(5).get(),
    projects
      .where("status", "==", "Concluído")
      .orderBy("updatedAt", "desc")
      .limit(3)
      .get(),
    projects
      .where("status", "in", [
        "Planejado",
        "Aguardando material",
        "Em inspeção",
        "Aguardando modelagem",
        "Em produção",
        "Parcialmente concluído",
      ])
      .where("dueOn", "<", today)
      .count()
      .get(),
    Promise.all(
      ["cut", "printing", "sewing", "packing"].map(async (key) => ({
        key,
        count: (
          await projects
            .where(key, ">", 0)
            .where("status", "in", ["Em produção", "Parcialmente concluído"])
            .count()
            .get()
        ).data().count,
      })),
    ),
    projects
      .where("status", "==", "Em produção")
      .where("updatedAt", "<", Timestamp.fromMillis(Date.now() - 7 * 86400000))
      .orderBy("updatedAt")
      .limit(5)
      .get(),
    projects
      .aggregate({
        packing: AggregateField.sum("packing"),
        packed: AggregateField.sum("packed"),
      })
      .get(),
  ]);
  const alerts = [
    ...divergences.docs.map((d) => ({
      projectId: d.id,
      name: d.get("name"),
      message: "Reconciliação encontrou divergência de quantidades.",
      kind: "divergence",
    })),
    ...external.docs.map((d) => ({
      projectId: d.get("projectId"),
      name: d.get("projectName"),
      message: `Terceiro com peças pendentes desde ${d.get("nextDueOn").split("-").reverse().join("/")}.`,
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
      message: `Prazo ultrapassado: ${d.get("dueOn").split("-").reverse().join("/")}`,
      kind: "late",
    })),
    ...pending.docs
      .filter((d) => !["Concluído", "Cancelado"].includes(d.get("status")))
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
  ];
  return {
    summary: {
      ...summary.data(),
      ...packagingSummary.data(),
      late: lateCount.data().count,
    },
    counts,
    alerts,
    stagesCount,
  };
});
const reportSchema = z.object({
  companyId: id,
  kind: z
    .enum([
      "projects",
      "productionMovements",
      "inspections",
      "productionBalances",
    ])
    .default("projects"),
  projectId: z.union([id, z.literal("")]).default(""),
  clientId: z.union([id, z.literal("")]).default(""),
  productId: z.union([id, z.literal("")]).default(""),
  thirdPartyId: z.union([id, z.literal("")]).default(""),
  stage: z.string().max(40).default(""),
  status: z.string().max(40).default(""),
  from: z.union([date, z.literal("")]).default(""),
  to: z.union([date, z.literal("")]).default(""),
  cursor: z.string().max(500).default(""),
  lateOnly: z.boolean().default(false),
});
export const reportPage = operation(async (r) => {
  const user = uid(r),
    input = reportSchema.parse(r.data);
  await db.runTransaction((tx) => authorize(tx, input.companyId, user, false));
  if (input.from && input.to && input.from > input.to)
    throw new HttpsError(
      "invalid-argument",
      "O início do período deve anteceder o fim.",
    );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const activeStatuses = [
    "Planejado",
    "Aguardando material",
    "Em inspeção",
    "Aguardando modelagem",
    "Em produção",
    "Parcialmente concluído",
  ];
  if (input.kind === "projects" && input.projectId) {
    const project = await db
      .doc(`companies/${input.companyId}/projects/${input.projectId}`)
      .get();
    const value = project.data();
    const period = value?.[input.lateOnly ? "dueOn" : "openedOn"];
    const matches =
      value &&
      ["clientId", "productId", "status"].every(
        (key) =>
          !input[key as "clientId" | "productId" | "status"] ||
          value[key] === input[key as "clientId" | "productId" | "status"],
      ) &&
      (!input.from || period >= input.from) &&
      (!input.to || period <= input.to) &&
      (!input.lateOnly ||
        (value.dueOn < today && activeStatuses.includes(value.status)));
    return {
      rows: matches ? [{ id: project.id, ...value }] : [],
      cursor: null,
    };
  }
  const collection =
    input.kind === "projects"
      ? db.collection(`companies/${input.companyId}/projects`)
      : db.collectionGroup(input.kind);
  let q: Query = collection;
  if (input.kind !== "projects")
    q = q.where("companyId", "==", input.companyId);
  if (input.projectId) q = q.where("projectId", "==", input.projectId);
  for (const key of [
    "clientId",
    "productId",
    "thirdPartyId",
    "stage",
    "status",
  ] as const)
    if (
      input[key] &&
      !(
        input.kind === "productionBalances" &&
        ["thirdPartyId", "stage", "status"].includes(key)
      )
    )
      q = q.where(key, "==", input[key]);
  const dateField =
    input.kind === "productionBalances"
      ? "updatedOn"
      : input.kind === "projects"
        ? input.lateOnly
          ? "dueOn"
          : "openedOn"
        : "occurredOn";
  if (input.lateOnly && input.kind === "projects") {
    if (input.status && !activeStatuses.includes(input.status))
      return { rows: [], cursor: null };
    q = q.where("dueOn", "<", today);
    if (!input.status)
      q = q.where("status", "in", [
        "Planejado",
        "Aguardando material",
        "Em inspeção",
        "Aguardando modelagem",
        "Em produção",
        "Parcialmente concluído",
      ]);
  }
  if (input.from) q = q.where(dateField, ">=", input.from);
  if (input.to) q = q.where(dateField, "<=", input.to);
  q = q.orderBy(dateField, "desc").orderBy(FieldPath.documentId());
  if (input.cursor) {
    const prefix = `companies/${input.companyId}/projects/`;
    if (!input.cursor.startsWith(prefix))
      throw new HttpsError("invalid-argument", "Cursor inválido.");
    const cursor = await db.doc(input.cursor).get();
    if (!cursor.exists || cursor.ref.parent.id !== input.kind)
      throw new HttpsError("invalid-argument", "Cursor expirado.");
    q = q.startAfter(cursor);
  }
  const result = await q.limit(100).get();
  return {
    rows: result.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: result.size === 100 ? result.docs.at(-1)!.ref.path : null,
  };
});

export const saveCatalogImage = operation(async (r) => {
  const user = uid(r),
    input = z
      .object({
        companyId: id,
        recordId: id,
        assetId: id,
        kind: z.enum(["companies", "models"]),
        name: z.string().min(1).max(200),
      })
      .parse(r.data);
  if (input.kind === "companies" && input.recordId !== input.companyId)
    throw new HttpsError("permission-denied", "Empresa inválida.");
  await db.runTransaction((tx) => authorize(tx, input.companyId, user));
  const path = `companies/${input.companyId}/assets/${input.assetId}`,
    file = getStorage().bucket().file(path),
    [meta] = await file.getMetadata();
  if (Number(meta.size) > 10 * 1024 * 1024)
    throw new HttpsError("invalid-argument", "Imagem maior que 10 MB.");
  const [bytes] = await file.download({ start: 0, end: 15 });
  if (!(
    (meta.contentType === "image/jpeg" &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255) ||
    (meta.contentType === "image/png" &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
  ))
    throw new HttpsError(
      "invalid-argument",
      "Imagem inválida. Use JPG ou PNG.",
    );
  await db.runTransaction(async (tx) => {
    await authorize(tx, input.companyId, user);
    const company = db.doc(`companies/${input.companyId}`),
      record =
        input.kind === "companies"
          ? company
          : company.collection("models").doc(input.recordId),
      snap = await tx.get(record);
    if (!snap.exists)
      throw new HttpsError(
        "not-found",
        "Salve o cadastro antes de anexar a imagem.",
      );
    tx.update(record, {
      image: path,
      updatedBy: user,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(company.collection("assets").doc(input.assetId), {
      path,
      name: input.name,
      kind: input.kind,
      recordId: input.recordId,
      size: Number(meta.size),
      createdBy: user,
      createdAt: FieldValue.serverTimestamp(),
    });
    audit(tx, company, user, "catalogImage", {
      recordId: input.recordId,
      path,
    });
  });
  return { path };
});
