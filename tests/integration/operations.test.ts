import { beforeAll, describe, it, expect } from "vitest";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
if (!getApps().length) initializeApp({ projectId: "demo-textilflow" });
const db = getFirestore();
let token = "",
  ownerToken = "";
const companyId = `test-${randomUUID()}`;
async function invoke<T = Record<string, unknown>>(
  name: string,
  data: unknown,
  auth = token,
): Promise<T> {
  const response = await fetch(
    `http://127.0.0.1:5001/demo-textilflow/southamerica-east1/${name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      body: JSON.stringify({ data }),
    },
  );
  const body = await response.json();
  if (body.error) throw Error(body.error.message);
  return body.result;
}
async function user(role: string, emailVerified = true) {
  const uid = `${role}-${randomUUID()}`,
    email = `${uid}@test.local`,
    password = randomUUID() + randomUUID();
  await getAuth().createUser({ uid, email, password, emailVerified });
  if (role === "inspector")
    await getAuth().setCustomUserClaims(uid, { inspector: true });
  const response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  return { uid, email, token: (await response.json()).idToken as string };
}
const projectData = {
  name: "Projeto de teste",
  clientId: "client",
  productId: "product",
  modelId: "model",
  planned: 5000,
  unit: "unidade",
  openedOn: "2026-11-01",
  startsOn: "2026-11-02",
  dueOn: "2026-12-01",
  responsible: "Inspetor teste",
  stages: [
    "recebimento",
    "inspecao",
    "modelagem",
    "corte",
    "estamparia",
    "costura",
    "embalagem",
    "despacho",
  ],
  thirdPartyIds: ["third"],
  materialIds: ["material"],
  supplierIds: ["supplier"],
};
async function project() {
  const id = randomUUID();
  await invoke("saveProject", { companyId, id, data: projectData });
  return id;
}
async function release(projectId: string) {
  await invoke("recordEvent", {
    companyId,
    projectId,
    operationId: randomUUID(),
    kind: "modeling",
    data: {
      occurredOn: "2026-11-10",
      status: "Liberada",
      responsible: "Inspetor",
    },
  });
}
async function move(
  projectId: string,
  kind: string,
  quantity: number,
  extra: Record<string, unknown> = {},
  auth = token,
) {
  return invoke(
    "productionMovement",
    {
      companyId,
      projectId,
      kind,
      quantity,
      lotId: "main",
      operationId: randomUUID(),
      occurredOn: "2026-11-10",
      ...extra,
    },
    auth,
  );
}
beforeAll(async () => {
  const inspector = await user("inspector"),
    owner = await user("owner");
  token = inspector.token;
  ownerToken = owner.token;
  await invoke("saveCompany", {
    id: companyId,
    data: { name: "Empresa de integração", active: true },
  });
  await db.doc(`companies/${companyId}/members/${owner.uid}`).set({
    active: true,
    role: "owner",
    createdAt: FieldValue.serverTimestamp(),
  });
  for (const [kind, id, name, extra] of [
    ["clients", "client", "Cliente", {}],
    ["thirdParties", "third", "Terceiro", {}],
    ["suppliers", "supplier", "Fornecedor", {}],
    ["materials", "material", "Malha", { supplierId: "supplier" }],
    ["products", "product", "Camiseta", {}],
    ["models", "model", "Modelo", { productId: "product" }],
  ] as const)
    await invoke("saveCatalog", {
      companyId,
      kind,
      id,
      data: { name, active: true, ...extra },
    });
});
describe("Cloud Functions e transações reais no emulador", () => {
  it("exige e-mail confirmado para cadastrar inspetor", async () => {
    const unverified = await user("unverified", false);
    await expect(
      invoke(
        "registerInspector",
        { name: "Inspetor pendente" },
        unverified.token,
      ),
    ).rejects.toThrow(/confirme seu e-mail/i);
  });
  it("reserva CNPJ único e só libera acesso com decisão do primeiro inspetor", async () => {
    const accounts = await Promise.all([user("signup"), user("signup")]);
    const ids = accounts.map(() => randomUUID());
    const taxId = "11222333000181";
    await Promise.all(
      accounts.map((account, i) =>
        invoke("registerInspector", { name: "Inspetor " + i }, account.token),
      ),
    );
    const saves = await Promise.all(
      accounts.map((account, i) =>
        invoke(
          "saveCompany",
          {
            id: ids[i],
            data: { name: "Empresa com CNPJ", taxId, active: true },
          },
          account.token,
        ),
      ),
    );
    expect(saves.map((result) => result.status).sort()).toEqual([
      "pending",
      "saved",
    ]);
    const first = saves.findIndex((result) => result.status === "saved");
    const founder = accounts[first],
      applicant = accounts[1 - first],
      companyId = ids[first];
    expect(
      (await db.collection("companies").where("taxId", "==", taxId).get()).size,
    ).toBe(1);
    const decision = { companyId, requesterId: applicant.uid, approve: true };
    const list = await invoke<{ id: string }[]>(
      "listInspectorRequests",
      { companyId },
      founder.token,
    );
    expect(list.map((request) => request.id)).toEqual([applicant.uid]);
    await expect(
      invoke("decideInspectorRequest", decision, applicant.token),
    ).rejects.toThrow();
    const membership = db.doc(
      `companies/${companyId}/members/${applicant.uid}`,
    );
    expect((await membership.get()).exists).toBe(false);
    await invoke("decideInspectorRequest", decision, founder.token);
    expect((await membership.get()).get("role")).toBe("inspector");
    await expect(
      invoke("decideInspectorRequest", decision, founder.token),
    ).rejects.toThrow(/já foi analisado/i);
  });
  it("atribui lote ao inspetor que criou e valida troca de responsável", async () => {
    const projectId = await project();
    await release(projectId);
    await move(projectId, "cut", 5);
    const lot = db.doc(
      `companies/${companyId}/projects/${projectId}/productionBalances/main`,
    );
    const company = await db.doc(`companies/${companyId}`).get();
    expect((await lot.get()).get("inspectorUid")).toBe(
      company.get("createdBy"),
    );
    const outsider = await user("signup");
    const assign = {
      companyId,
      projectId,
      lotId: "main",
      inspectorUid: outsider.uid,
    };
    await expect(invoke("assignLotInspector", assign)).rejects.toThrow(
      /inspetor ativo/i,
    );
    await db
      .doc(`companies/${companyId}/members/${outsider.uid}`)
      .set({ active: true, role: "inspector", name: "Novo responsável" });
    await invoke("assignLotInspector", assign);
    await move(projectId, "cut", 5);
    expect((await lot.get()).get("inspectorName")).toBe("Novo responsável");
  });
  it("cria empresa e seis cadastros com auditoria", async () => {
    expect(
      (await db.doc(`companies/${companyId}/models/model`).get()).get(
        "productId",
      ),
    ).toBe("product");
    expect(
      (await db.collection(`companies/${companyId}/activityLog`).get()).size,
    ).toBeGreaterThanOrEqual(7);
  });
  it("nega função anônima", () =>
    expect(
      invoke("saveCompany", { id: "no", data: { name: "Nome" } }, ""),
    ).rejects.toThrow());
  it("nega escrita pelo proprietário", () =>
    expect(
      invoke(
        "saveCatalog",
        {
          companyId,
          kind: "clients",
          id: "forbidden",
          data: { name: "Bloqueado" },
        },
        ownerToken,
      ),
    ).rejects.toThrow("permissão"));
  it("nega operação em empresa não vinculada", () =>
    expect(
      invoke("saveCatalog", {
        companyId: "other-company",
        kind: "clients",
        id: "forbidden",
        data: { name: "Bloqueado" },
      }),
    ).rejects.toThrow());
  it("bloqueia corte sem modelagem", async () => {
    const p = await project();
    await expect(move(p, "cut", 100)).rejects.toThrow("modelagem");
  });
  it("valida recebimento, unidade e soma da inspeção", async () => {
    const p = await project(),
      receiptId = randomUUID();
    await invoke("recordEvent", {
      companyId,
      projectId: p,
      operationId: receiptId,
      kind: "materialReceipts",
      data: {
        occurredOn: "2026-11-10",
        materialId: "material",
        supplierId: "supplier",
        quantity: 120,
        unit: "rolo",
        status: "Aguardando inspeção",
      },
    });
    await expect(
      invoke("recordEvent", {
        companyId,
        projectId: p,
        operationId: randomUUID(),
        kind: "inspections",
        data: {
          occurredOn: "2026-11-10",
          receiptId,
          quantity: 100,
          approved: 101,
          rejected: 0,
          unit: "rolo",
          status: "Aprovado",
        },
      }),
    ).rejects.toThrow();
    await invoke("recordEvent", {
      companyId,
      projectId: p,
      operationId: randomUUID(),
      kind: "inspections",
      data: {
        occurredOn: "2026-11-10",
        receiptId,
        quantity: 100,
        approved: 95,
        rejected: 5,
        reason: "Defeito de trama",
        unit: "rolo",
        status: "Aprovado com ressalvas",
      },
    });
    await expect(
      invoke("recordEvent", {
        companyId,
        projectId: p,
        operationId: randomUUID(),
        kind: "inspections",
        data: {
          occurredOn: "2026-11-10",
          receiptId,
          quantity: 21,
          approved: 21,
          rejected: 0,
          unit: "rolo",
          status: "Aprovado",
        },
      }),
    ).rejects.toThrow("excede");
  });
  it("fluxo completo com parciais e conservação de saldo", async () => {
    const p = await project();
    await release(p);
    await move(p, "cut", 1000);
    await move(p, "send", 700, {
      thirdPartyId: "third",
      stage: "estamparia",
      dueOn: "2026-12-01",
    });
    await move(p, "receive", 400, {
      thirdPartyId: "third",
      stage: "estamparia",
      defective: 20,
    });
    await move(p, "send", 300, {
      thirdPartyId: "third",
      stage: "costura",
      dueOn: "2026-12-01",
    });
    await move(p, "receive", 200, { thirdPartyId: "third", stage: "costura" });
    await move(p, "transfer", 200, {
      source: "costura-pronta",
      destination: "embalagem",
    });
    await move(p, "transfer", 150, {
      source: "embalagem",
      destination: "embalado",
    });
    await move(p, "dispatch", 100, { recipient: "Cliente" });
    const s = (
      await db.doc(`companies/${companyId}/projects/${p}`).get()
    ).data()!;
    expect(s.balances).toMatchObject({
      corte: 300,
      "estamparia:third": 300,
      "estampa-pronta": 80,
      "costura:third": 100,
      quarentena: 20,
      embalagem: 50,
      embalado: 50,
      despachado: 100,
    });
    expect(
      Object.values(s.balances).reduce((a: number, b) => a + Number(b), 0),
    ).toBe(1000);
    expect(
      (await invoke("reconcileProduction", { companyId, projectId: p })).valid,
    ).toBe(true);
  });
  it("rejeita excesso de retorno e saldo negativo", async () => {
    const p = await project();
    await release(p);
    await move(p, "cut", 100);
    await expect(
      move(p, "send", 101, { thirdPartyId: "third", dueOn: "2026-12-01" }),
    ).rejects.toThrow("Saldo");
    await move(p, "send", 80, { thirdPartyId: "third", dueOn: "2026-12-01" });
    await expect(
      move(p, "receive", 81, { thirdPartyId: "third" }),
    ).rejects.toThrow("Saldo");
  });
  it("cliques repetidos geram um único movimento", async () => {
    const p = await project();
    await release(p);
    const operationId = randomUUID();
    const responses = await Promise.all([
      move(p, "cut", 100, { operationId }),
      move(p, "cut", 100, { operationId }),
    ]);
    expect(responses.filter((r) => r.duplicate).length).toBe(1);
    expect(
      (await db.doc(`companies/${companyId}/projects/${p}`).get()).get("cut"),
    ).toBe(100);
    await expect(move(p, "cut", 101, { operationId })).rejects.toThrow(
      "Identificador",
    );
  });
  it("duas saídas concorrentes não consomem o mesmo saldo", async () => {
    const p = await project();
    await release(p);
    await move(p, "cut", 100);
    const results = await Promise.allSettled([
      move(p, "send", 80, { thirdPartyId: "third", dueOn: "2026-12-01" }),
      move(p, "send", 80, { thirdPartyId: "third", dueOn: "2026-12-01" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.doc(`companies/${companyId}/projects/${p}`).get()).get(
        "balances.corte",
      ),
    ).toBe(20);
  });
  it("estorno é auditado, único e não apaga a origem", async () => {
    const p = await project();
    await release(p);
    const operationId = randomUUID();
    await move(p, "cut", 100, { operationId });
    await move(p, "reverse", 100, {
      reverses: operationId,
      reason: "Correção de lançamento",
    });
    await expect(
      move(p, "reverse", 100, {
        reverses: operationId,
        reason: "Correção repetida",
      }),
    ).rejects.toThrow();
    expect(
      (
        await db
          .collection(
            `companies/${companyId}/projects/${p}/productionMovements`,
          )
          .get()
      ).size,
    ).toBe(2);
    expect(
      (await invoke("reconcileProduction", { companyId, projectId: p })).valid,
    ).toBe(true);
  });
  it("estorno de corte usado em outra etapa é bloqueado", async () => {
    const p = await project();
    await release(p);
    const operationId = randomUUID();
    await move(p, "cut", 100, { operationId });
    await move(p, "send", 50, { thirdPartyId: "third", dueOn: "2026-12-01" });
    await expect(
      move(p, "reverse", 100, {
        reverses: operationId,
        reason: "Tentativa inválida",
      }),
    ).rejects.toThrow("Saldo");
  });
  it("bloqueia corte acima da meta", async () => {
    const p = await project();
    await release(p);
    await expect(move(p, "cut", 5001)).rejects.toThrow("meta");
  });
  it("exige motivo para ajuste da meta", async () => {
    const p = await project();
    await expect(
      invoke("saveProject", {
        companyId,
        id: p,
        data: { ...projectData, planned: 6000 },
      }),
    ).rejects.toThrow("Justifique");
    await invoke("saveProject", {
      companyId,
      id: p,
      data: { ...projectData, planned: 6000 },
      reason: "Cliente autorizou ampliação",
    });
  });
  it("não mistura cor ou tamanho entre saldos", async () => {
    const p = await project();
    await release(p);
    await move(p, "cut", 100, { colorId: "blue", sizeId: "M" });
    await expect(
      move(p, "send", 50, {
        colorId: "red",
        sizeId: "M",
        thirdPartyId: "third",
        dueOn: "2026-12-01",
      }),
    ).rejects.toThrow("Cor e tamanho");
  });
  it("reconciliação detecta corrupção administrativa", async () => {
    const p = await project();
    await release(p);
    await move(p, "cut", 100);
    await db
      .doc(`companies/${companyId}/projects/${p}/productionBalances/main`)
      .update({ "balances.corte": 99 });
    expect(
      (await invoke("reconcileProduction", { companyId, projectId: p })).valid,
    ).toBe(false);
  });
  it("relatório respeita vínculo e período", async () => {
    const r = await invoke<{ rows: unknown[] }>(
      "reportPage",
      { companyId, kind: "projects", from: "2027-01-01", to: "2027-12-31" },
      ownerToken,
    );
    expect(r.rows).toHaveLength(0);
    await expect(
      invoke(
        "reportPage",
        { companyId: "another", kind: "projects" },
        ownerToken,
      ),
    ).rejects.toThrow();
  });
  it("convite exige e-mail correto, confirmação e uso único", async () => {
    const invited = await user("invited");
    const { token: inviteToken } = await invoke<{ token: string }>(
      "createInvite",
      { companyId, email: invited.email, role: "owner" },
    );
    await expect(
      invoke("acceptInvite", { token: inviteToken }, ownerToken),
    ).rejects.toThrow();
    await invoke("acceptInvite", { token: inviteToken }, invited.token);
    await expect(
      invoke("acceptInvite", { token: inviteToken }, invited.token),
    ).rejects.toThrow();
    expect(
      (await db.doc(`companies/${companyId}/members/${invited.uid}`).get()).get(
        "role",
      ),
    ).toBe("owner");
  });
});

it("preserva prazo dos envios restantes após retorno parcial FIFO", async () => {
  const p = await project();
  await release(p);
  await move(p, "cut", 300);
  const first = randomUUID();
  await move(p, "send", 100, {
    operationId: first,
    thirdPartyId: "third",
    dueOn: "2026-01-01",
  });
  await move(p, "send", 100, { thirdPartyId: "third", dueOn: "2027-01-01" });
  await move(p, "receive", 100, { thirdPartyId: "third" });
  const lot = await db
    .doc(`companies/${companyId}/projects/${p}/productionBalances/main`)
    .get();
  expect(lot.get("nextDueOn")).toBe("2027-01-01");
  await expect(
    move(p, "reverse", 100, {
      reverses: first,
      reason: "Estorno após retorno",
    }),
  ).rejects.toThrow("posteriores");
});
it("nega estorno com quantidade diferente do lançamento original", async () => {
  const p = await project();
  await release(p);
  const operationId = randomUUID();
  await move(p, "cut", 100, { operationId });
  await expect(
    move(p, "reverse", 1, {
      reverses: operationId,
      reason: "Quantidade adulterada",
    }),
  ).rejects.toThrow();
});
it("registra perdas sem perder a reconciliação física", async () => {
  const p = await project();
  await release(p);
  await move(p, "cut", 100);
  await move(p, "loss", 10, { source: "corte", reason: "Dano no tecido" });
  expect(
    (await db.doc(`companies/${companyId}/projects/${p}`).get()).get(
      "balances.perdas",
    ),
  ).toBe(10);
  expect(
    (await invoke("reconcileProduction", { companyId, projectId: p })).valid,
  ).toBe(true);
});
it("dashboard calcula agregações e alerta de divergência", async () => {
  const result = await invoke<{
    summary: Record<string, number>;
    alerts: { kind: string }[];
  }>("dashboard", { companyId });
  expect(result.summary.total).toBeGreaterThan(0);
  expect(result.alerts.some((a) => a.kind === "divergence")).toBe(true);
});
it("relatório consulta saldo por lote e atrasos com autorização do proprietário", async () => {
  const p = await project();
  await release(p);
  await move(p, "cut", 100);
  await move(p, "send", 40, { thirdPartyId: "third", dueOn: "2026-12-01" });
  const balance = await invoke<{
    rows: { balances: Record<string, number> }[];
  }>(
    "reportPage",
    { companyId, kind: "productionBalances", projectId: p },
    ownerToken,
  );
  expect(balance.rows).toHaveLength(1);
  expect(balance.rows[0].balances["estamparia:third"]).toBe(40);
  await invoke("saveProject", {
    companyId,
    id: p,
    data: {
      ...projectData,
      dueOn: "2026-01-01",
      startsOn: "2025-12-01",
      openedOn: "2025-12-01",
      status: "Em produção",
    },
  });
  const late = await invoke<{ rows: { id: string }[] }>(
    "reportPage",
    { companyId, kind: "projects", projectId: p, lateOnly: true },
    ownerToken,
  );
  expect(late.rows.map((r) => r.id)).toContain(p);
});
