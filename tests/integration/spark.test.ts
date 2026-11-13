import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { readFileSync } from "node:fs";

let env: RulesTestEnvironment;
let actor = "spark-a";
const a = "spark-a",
  b = "spark-b",
  owner = "spark-owner";
const companyId = "spark-co",
  second = "spark-other",
  projectId = "p1";
const p = `companies/${companyId}/projects/${projectId}`;
const registryCnpj = "33000167000101";
const client = (u: string, verified = true) =>
  env
    .authenticatedContext(u, {
      email: `${u}@example.test`,
      email_verified: verified,
    })
    .firestore();
const dbs = new Map<string, ReturnType<typeof client>>();
const as = (u: string) => {
  if (!dbs.has(u)) dbs.set(u, client(u));
  return dbs.get(u)!;
};
vi.mock("../../src/lib/firebase", () => ({
  get db() {
    return as(actor);
  },
  auth: {
    get currentUser() {
      return {
        uid: actor,
        email: `${actor}@example.test`,
        displayName: "Usuário Teste",
        getIdTokenResult: async () => ({ claims: { email_verified: true } }),
      };
    },
  },
}));
import { callFirestore } from "../../src/services/spark/api";
import { catalogSchema, projectSchema } from "../../functions/src/domain";

const call = (name: string, raw: unknown) => callFirestore(name, raw);
const event = (kind: string, operationId: string, data: unknown) =>
  call("recordEvent", {
    companyId,
    projectId,
    kind,
    operationId,
    data: { occurredOn: "2026-11-13", ...(data as object) },
  });
const movement = (
  kind: string,
  operationId: string,
  quantity: number,
  extra = {},
) =>
  call("productionMovement", {
    companyId,
    projectId,
    kind,
    operationId,
    quantity,
    lotId: "lot1",
    occurredOn: "2026-11-13",
    ...extra,
  }).catch((e: Error) => {
    throw new Error(operationId + ": " + e.message, { cause: e });
  });
const lot = () => doc(as(a), p, "productionBalances", "lot1");
const catalog = (kind: string) =>
  call("saveCatalog", {
    companyId,
    kind,
    id: kind,
    data: catalogSchema.parse({ name: `Cadastro ${kind}` }),
  });
const company = (id: string, taxId: string) =>
  call("saveCompany", {
    id,
    data: catalogSchema.parse({ name: "Empresa de testes Spark", taxId }),
  });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-textilflow",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});
afterAll(async () => env?.cleanup());

describe("Spark Web SDK e regras contra gravações diretas", () => {
  it("cria perfil verificado e reserva CNPJ uma única vez, exigindo aprovação", async () => {
    await assertFails(
      setDoc(doc(client("unverified", false), "users/unverified"), {
        name: "Sem verificação",
        inspectorRegistered: true,
      }),
    );
    await assertSucceeds(
      call("registerInspector", { name: "Primeiro Inspetor" }),
    );
    await expect(company(companyId, registryCnpj)).resolves.toMatchObject({
      status: "saved",
    });
    actor = b;
    await call("registerInspector", { name: "Segundo Inspetor" });
    await company(second, "00000000000191");
    await expect(
      company("another-company", registryCnpj),
    ).resolves.toMatchObject({ status: "pending" });
    await assertFails(getDoc(doc(as(b), "companies", companyId)));
    await assertFails(
      setDoc(doc(as(b), "companies", companyId, "members", b), {
        active: true,
        role: "inspector",
        name: "Inspetor invasor",
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(as(b), "companies", companyId, "inspectorRequests", b), {
        status: "approved",
        reviewedAt: serverTimestamp(),
        reviewedBy: b,
      }),
    );
    await assertFails(
      getDocs(
        query(
          collectionGroup(as(b), "productionMovements"),
          where("companyId", "==", companyId),
        ),
      ),
    );
    actor = a;
    await expect(call("companiesForUser", {})).resolves.toMatchObject({
      canCreate: true,
    });
    await assertFails(getDoc(doc(as(a), "companies", second)));
    await call("decideInspectorRequest", {
      companyId,
      requesterId: b,
      approve: true,
    });
    await assertSucceeds(getDoc(doc(as(b), "companies", companyId)));
  });

  it("aceita apenas o proprietário convidado, uma vez, dentro da validade", async () => {
    const { token } = (await call("createInvite", {
      companyId,
      email: `${owner}@example.test`,
      role: "owner",
    })) as { token: string };
    actor = "spark-stranger";
    await assertFails(call("acceptInvite", { token }));
    actor = owner;
    await assertSucceeds(call("acceptInvite", { token }));
    await assertFails(call("acceptInvite", { token }));
    await assertSucceeds(getDoc(doc(as(owner), "companies", companyId)));
    await assertFails(
      updateDoc(doc(as(owner), "companies", companyId), { name: "Alterado" }),
    );
    await assertFails(
      updateDoc(doc(as(owner), "companies", companyId, "members", owner), {
        role: "inspector",
      }),
    );
    const expiredToken = "a".repeat(64);
    const { createHash } = await import("node:crypto");
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(
          context.firestore(),
          "sparkInvites",
          createHash("sha256").update(expiredToken).digest("hex"),
        ),
        {
          companyId,
          email: `${owner}@example.test`,
          role: "owner",
          createdBy: a,
          createdAt: new Date(Date.now() - 49 * 3600000),
          used: false,
        },
      );
    });
    await assertFails(call("acceptInvite", { token: expiredToken }));
    actor = a;
  });

  it("grava projeto, recebimento, inspeção parcial e modelagem", async () => {
    for (const kind of [
      "clients",
      "products",
      "materials",
      "suppliers",
      "thirdParties",
    ])
      await catalog(kind);
    await call("saveProject", {
      companyId,
      id: projectId,
      data: projectSchema.parse({
        name: "Projeto Spark",
        clientId: "clients",
        productId: "products",
        planned: 100,
        openedOn: "2026-11-01",
        startsOn: "2026-11-01",
        dueOn: "2026-12-01",
        responsible: "Inspetor",
        thirdPartyIds: ["thirdParties"],
        stages: ["corte", "costura", "embalagem", "despacho"],
      }),
    });
    await event("materialReceipts", "receipt", {
      status: "Aguardando inspeção",
      materialId: "materials",
      supplierId: "suppliers",
      unit: "quilograma",
      quantity: 3.25,
    });
    await event("inspections", "inspection", {
      receiptId: "receipt",
      status: "Aprovado",
      unit: "quilograma",
      quantity: 1.25,
      approved: 1.25,
    });
    expect(
      (await getDoc(doc(as(a), p, "materialReceipts", "receipt"))).get(
        "inspectedScaled",
      ),
    ).toBe(1250);
    await expect(
      event("inspections", "over", {
        receiptId: "receipt",
        status: "Aprovado",
        unit: "quilograma",
        quantity: 3,
        approved: 3,
      }),
    ).rejects.toThrow(/excede/);
    await event("modeling", "release", { status: "Liberada" });
    await assertFails(
      updateDoc(doc(as(owner), p), { modelingStatus: "Bloqueada" }),
    );
  });

  it("mantém saldo, lançamento e fila juntos; rejeita duplicidade e saldo negativo", async () => {
    const send = {
      thirdPartyId: "thirdParties",
      stage: "costura",
      dueOn: "2026-12-01",
    };
    await movement("cut", "cut", 50);
    await expect(movement("cut", "cut", 50)).resolves.toMatchObject({
      duplicate: true,
    });
    await expect(movement("cut", "cut", 51)).rejects.toThrow(/utilizado/);
    await expect(movement("send", "negative", 51, send)).rejects.toThrow(
      /Saldo/,
    );
    const competing = await Promise.allSettled([
      movement("send", "send-a", 35, send),
      movement("send", "send-b", 35, send),
    ]);
    expect(competing.map((x) => x.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    await movement("receive", "partial", 15, { ...send, defective: 2 });
    expect((await getDoc(lot())).get("balances")).toMatchObject({
      "costura:thirdParties": 20,
      "costura-pronta": 13,
      quarentena: 2,
    });
    await movement("reverse", "reverse", 15, {
      reverses: "partial",
      reason: "Correção de teste",
    });
    expect((await getDoc(lot())).get("balances")).toMatchObject({
      "costura:thirdParties": 35,
      "costura-pronta": 0,
      quarentena: 0,
    });
    await expect(
      movement("reverse", "reverse-again", 15, {
        reverses: "partial",
        reason: "Correção de teste",
      }),
    ).rejects.toThrow(/já estornado/);
    await movement("receive", "full", 35, send);
    await movement("transfer", "pack-a", 20, {
      source: "costura-pronta",
      destination: "embalagem",
    });
    await movement("transfer", "pack-b", 20, {
      source: "embalagem",
      destination: "embalado",
    });
    await movement("dispatch", "dispatch", 15, { recipient: "Destinatário" });
    await movement("loss", "loss", 2, {
      source: "embalado",
      reason: "Perda teste",
    });
    await assertFails(updateDoc(lot(), { balances: { corte: 1e6 } }));
    await assertFails(updateDoc(doc(as(a), p), { balances: { corte: -1 } }));
    const ledger = doc(as(a), p, "productionMovements", "cut");
    await assertFails(updateDoc(ledger, { quantity: 1 }));
    await assertFails(deleteDoc(ledger));
    const batch = writeBatch(as(a));
    batch.update(doc(as(a), p), {
      cut: 0,
      sparkMovementId: "cut",
      updatedAt: serverTimestamp(),
    });
    batch.update(lot(), { balances: { corte: 0 }, sparkMovementId: "cut" });
    await assertFails(batch.commit());
    await call("assignLotInspector", {
      companyId,
      projectId,
      lotId: "lot1",
      inspectorUid: b,
    });
    expect((await getDoc(lot())).get("inspectorUid")).toBe(b);
    actor = owner;
    await expect(
      call("reportPage", { companyId, kind: "productionMovements" }),
    ).resolves.toMatchObject({
      rows: expect.arrayContaining([
        expect.objectContaining({ id: "dispatch", quantity: 15 }),
      ]),
    });
    actor = a;
  });
});
