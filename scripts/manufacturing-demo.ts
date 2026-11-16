import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import { blankGrade } from "../src/features/orders/model";
import {
  applyDeltas,
  catalogSchema,
  movementSchema,
  planMovement,
  projectSchema,
} from "../functions/src/domain";
import { createHash } from "node:crypto";

export const demoCompany = "confeccao-modelo-demo";
export const demoInspector = "modelo-inspector";
export const demoOwner = "modelo-owner";
export const demoEmails = {
  inspector: "inspetor.modelo@textilflow.test",
  owner: "proprietario.modelo@textilflow.test",
};
const sectorIds = [
  "corte",
  "costura",
  "inspecao-final",
  "embalagem",
  "expedicao",
];
const colors = ["preto", "azul-marinho"];
const sizes = ["p", "m", "g", "gg"];
const vector = (...values: number[]) => [
  ...values,
  ...blankGrade().slice(values.length),
];

export async function seedManufacturing(
  db: Firestore,
  auth: Auth,
  password: string,
) {
  for (const [uid, email, role] of [
    [demoInspector, demoEmails.inspector, "inspector"],
    [demoOwner, demoEmails.owner, "owner"],
  ] as const) {
    const existing = await auth.getUser(uid).catch((e) => {
      if (e.code === "auth/user-not-found") return undefined;
      throw e;
    });
    const profile = {
      email,
      emailVerified: true,
      displayName:
        role === "inspector" ? "Inspetor Modelo" : "Proprietário Modelo",
      password,
    };
    if (existing) await auth.updateUser(uid, profile);
    else await auth.createUser({ uid, ...profile });
  }
  const company = db.doc(`companies/${demoCompany}`);
  const seeded = await company.get();
  if (!seeded.exists) {
    const stamp = {
      createdBy: demoInspector,
      updatedBy: demoInspector,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const catalog = (name: string, fields = {}) => ({
      ...catalogSchema.parse({ name, ...fields }),
      ...stamp,
      companyId: demoCompany,
      searchName: name.toLocaleLowerCase("pt-BR"),
    });
    const catalogs: Record<string, ReturnType<typeof catalog>> = {
      "clients/cliente": catalog("Cliente Modelo"),
      "thirdParties/costura": catalog("Oficina de Costura Modelo"),
      "suppliers/alfa": catalog("Fornecedor Alfa"),
      "suppliers/beta": catalog("Fornecedor Beta"),
      "materials/malha": catalog("Malha penteada 30/1", {
        reference: "MAT-001",
        composition: "100% algodão",
        unit: "quilograma",
        supplierId: "alfa",
        supplierIds: ["alfa", "beta"],
      }),
      "materials/ribana": catalog("Ribana de algodão", {
        reference: "MAT-002",
        composition: "97% algodão, 3% elastano",
        unit: "quilograma",
        supplierId: "beta",
        supplierIds: ["beta"],
      }),
      "products/cam-001": catalog("Camiseta Básica", {
        reference: "CAM-001",
        composition: "100% algodão",
        materialIds: ["malha", "ribana"],
        modelId: "mod-014",
        gradeId: "padrao",
        colorIds: [...colors, "branco"],
      }),
      "models/mod-014": catalog("Camiseta regular", {
        reference: "MOD-014",
        productId: "cam-001",
      }),
      "colors/preto": catalog("Preto"),
      "colors/azul-marinho": catalog("Azul-marinho"),
      "colors/branco": catalog("Branco"),
      "sizes/p": catalog("P"),
      "sizes/m": catalog("M"),
      "sizes/g": catalog("G"),
      "sizes/gg": catalog("GG"),
      "grades/padrao": catalog("P, M, G e GG", { sizeIds: sizes }),
      "sectors/corte": catalog("Corte", { operationalType: "corte" }),
      "sectors/costura": catalog("Costura", { operationalType: "costura" }),
      "sectors/inspecao-final": catalog("Inspeção final", {
        operationalType: "inspecao",
      }),
      "sectors/embalagem": catalog("Embalagem", {
        operationalType: "embalagem",
      }),
      "sectors/expedicao": catalog("Expedição", {
        operationalType: "despacho",
      }),
      "flows/camiseta": catalog("Camiseta padrão", { sectorIds }),
      "units/kg": catalog("quilograma"),
      "units/peca": catalog("unidade"),
      "categories/basicos": catalog("Básicos"),
      "rejectionReasons/costura": catalog("Falha de costura"),
      "inspectionTypes/final": catalog("Inspeção final"),
    };
    const batch = db.batch();
    batch.create(company, catalog("Confecção Modelo — Demonstração"));
    for (const [path, data] of Object.entries(catalogs))
      batch.create(
        company.collection(path.split("/")[0]).doc(path.split("/")[1]),
        data,
      );
    for (const [uid, role, name] of [
      [demoInspector, "inspector", "Inspetor Modelo"],
      [demoOwner, "owner", "Proprietário Modelo"],
    ]) {
      batch.set(db.doc(`users/${uid}`), {
        name,
        ...(role === "inspector" ? { inspectorRegistered: true } : {}),
      });
      batch.set(company.collection("members").doc(uid), {
        role,
        name,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
      });
      batch.set(db.doc(`users/${uid}/companies/${demoCompany}`), {
        companyId: demoCompany,
      });
    }
    const order = company.collection("orders").doc("ped-1042");
    batch.create(order, {
      number: "PED-1042",
      clientId: "cliente",
      dueOn: "2027-02-28",
      flowId: "camiseta",
      sectorIds,
      searchName: "ped-1042",
      ...stamp,
    });
    batch.create(order.collection("items").doc("cam-001"), {
      productId: "cam-001",
      gradeId: "padrao",
      colors,
      sizes,
      ordered: vector(20, 50, 40, 10, 20, 50, 40, 10),
      allocated: vector(20, 50, 40, 10, 10, 25, 20, 5),
      leaves: vector(30, 30),
      lastOf: "of-0087",
      ...stamp,
    });
    const project = company.collection("projects").doc("of-0087");
    batch.create(project, {
      ...projectSchema.parse({
        name: "OF-0087",
        clientId: "cliente",
        productId: "cam-001",
        modelId: "mod-014",
        planned: 180,
        openedOn: "2026-11-16",
        startsOn: "2026-11-16",
        dueOn: "2027-02-28",
        responsible: "Inspetor Modelo",
        materialIds: ["malha", "ribana"],
        supplierIds: ["alfa", "beta"],
        thirdPartyIds: ["costura"],
        stages: [
          "recebimento",
          "inspecao",
          "modelagem",
          "corte",
          "costura",
          "embalagem",
          "despacho",
        ],
      }),
      ...stamp,
      companyId: demoCompany,
      searchName: "of-0087",
      active: true,
      cut: 0,
      shipped: 0,
      printing: 0,
      sewing: 0,
      packing: 0,
      packed: 0,
      balances: {},
      modelingStatus: "Liberada",
      reconciliationOk: true,
      manufacturing: {
        orderId: "ped-1042",
        itemId: "cam-001",
        orderNumber: "PED-1042",
        colors,
        sizes,
        quantities: vector(20, 50, 40, 10, 10, 25, 20, 5),
        leaves: vector(30, 15),
        sectorIds,
      },
    });
    batch.create(project.collection("modeling").doc("liberacao-demo"), {
      companyId: demoCompany,
      projectId: "of-0087",
      operationId: "liberacao-demo",
      occurredOn: "2026-11-16",
      status: "Liberada",
      responsible: "Inspetor Modelo",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: demoInspector,
    });
    batch.create(project.collection("activityLog").doc("liberacao-demo"), {
      action: "modeling",
      data: { operationId: "liberacao-demo" },
      createdAt: FieldValue.serverTimestamp(),
      createdBy: demoInspector,
    });
    await batch.commit();
  }
  const ref = company.collection("projects").doc("of-0087");
  await db.runTransaction(async (tx) => {
    const ledger = ref.collection("productionMovements").doc("corte-demo");
    if ((await tx.get(ledger)).exists) return;
    const project = await tx.get(ref);
    if (
      project.get("cut") !== 0 ||
      project.get("modelingStatus") !== "Liberada"
    )
      throw Error(
        "A OF inicial precisa estar liberada e sem corte para receber a operação de demonstração.",
      );
    const m = movementSchema.parse({
      companyId: demoCompany,
      projectId: "of-0087",
      lotId: "preto-p",
      operationId: "corte-demo",
      kind: "cut",
      quantity: 20,
      colorId: "preto",
      sizeId: "p",
      occurredOn: "2026-11-16",
    });
    const deltas = planMovement(m, false);
    const balances = applyDeltas({}, deltas);
    const fields = {
      clientId: "cliente",
      productId: "cam-001",
      projectName: "OF-0087",
    };
    const stamp = {
      updatedBy: demoInspector,
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.create(ledger, {
      ...m,
      ...fields,
      deltas,
      cutDelta: m.quantity,
      source: "",
      destination: "corte",
      unit: "unidade",
      createdBy: demoInspector,
      recordedAt: FieldValue.serverTimestamp(),
      hash: createHash("sha256").update(JSON.stringify(m)).digest("hex"),
    });
    tx.create(ref.collection("productionBalances").doc(m.lotId), {
      ...fields,
      ...stamp,
      companyId: demoCompany,
      projectId: "of-0087",
      lotId: m.lotId,
      colorId: m.colorId,
      sizeId: m.sizeId,
      inspectorUid: demoInspector,
      inspectorName: "Inspetor Modelo",
      balances,
      externalQueues: {},
      nextDueOn: "9999-12-31",
      updatedOn: m.occurredOn,
    });
    tx.update(ref, {
      ...stamp,
      cut: m.quantity,
      balances,
      status: "Em produção",
      sparkMovementId: m.operationId,
    });
    tx.create(ref.collection("activityLog").doc(m.operationId), {
      action: "movement",
      data: { operationId: m.operationId, kind: m.kind },
      createdAt: FieldValue.serverTimestamp(),
      createdBy: demoInspector,
    });
  });
  const [item, operation, lot, ...members] = await Promise.all([
    db.doc(`companies/${demoCompany}/orders/ped-1042/items/cam-001`).get(),
    ref.collection("productionMovements").doc("corte-demo").get(),
    ref.collection("productionBalances").doc("preto-p").get(),
    ...[demoInspector, demoOwner].map((uid) =>
      company.collection("members").doc(uid).get(),
    ),
  ]);
  if (
    !item.exists ||
    !operation.exists ||
    !lot.exists ||
    members.some((m) => !m.get("active"))
  )
    throw Error("O cenário de demonstração está incompleto.");
}
