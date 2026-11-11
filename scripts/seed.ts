import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
if (
  process.env.GCLOUD_PROJECT &&
  process.env.GCLOUD_PROJECT !== "demo-textilflow"
)
  throw Error("Seed permitido somente em demo-textilflow.");
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "demo-textilflow";
if (!getApps().length) initializeApp({ projectId: "demo-textilflow" });
const db = getFirestore(),
  auth = getAuth(),
  password = randomBytes(24).toString("base64url");
async function seed() {
  for (const [uid, email, inspector] of [
    ["inspector-demo", "inspetor@textilflow.test", true],
    ["owner-demo", "proprietario@textilflow.test", false],
  ] as const) {
    await auth
      .getUser(uid)
      .then(() => auth.updateUser(uid, { password }))
      .catch(() =>
        auth.createUser({
          uid,
          email,
          password,
          emailVerified: true,
          displayName: inspector
            ? "Inspetor de demonstração"
            : "Proprietário de demonstração",
        }),
      );
    await auth.setCustomUserClaims(uid, { inspector });
    await db.doc(`companies/demo-company/members/${uid}`).set({
      role: inspector ? "inspector" : "owner",
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    await db
      .doc(`users/${uid}/companies/demo-company`)
      .set({ companyId: "demo-company" });
  }
  const stamp = {
    companyId: "demo-company",
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: "inspector-demo",
    updatedBy: "inspector-demo",
  };
  await db.doc("companies/demo-company").set({
    ...stamp,
    name: "Confecção Exemplo Ltda.",
    tradeName: "Confecção Exemplo",
    searchName: "confecção exemplo ltda.",
  });
  const catalogs: Record<string, string[]> = {
    clients: ["Cliente Demonstração"],
    thirdParties: ["Estamparia A", "Estamparia B", "Oficina de Costura C"],
    suppliers: ["Fornecedor Demonstração"],
    materials: ["Malha", "Ribana"],
    products: ["Camiseta manga curta", "Regata", "Calça", "Bermuda", "Moletom"],
    models: ["Camiseta básica"],
    sizes: ["PP", "P", "M", "G", "GG", "XG", "U"],
    colors: ["Branco", "Preto"],
    modules: [
      "Recebimento",
      "Inspeção",
      "Modelagem",
      "Corte",
      "Estamparia",
      "Costura",
      "Embalagem",
      "Produto despachado",
    ],
  };
  for (const [kind, names] of Object.entries(catalogs))
    for (const [i, name] of names.entries())
      await db.doc(`companies/demo-company/${kind}/demo-${i}`).set({
        ...stamp,
        name,
        searchName: name.toLowerCase(),
        ...(kind === "models" ? { productId: "demo-0" } : {}),
      });
  const project = db.doc("companies/demo-company/projects/itaborai");
  if (!(await project.get()).exists) {
    await project.set({
      ...stamp,
      name: "Itaboraí",
      searchName: "itaboraí",
      clientId: "demo-0",
      productId: "demo-0",
      modelId: "demo-0",
      planned: 5000,
      cut: 3000,
      shipped: 500,
      printing: 1000,
      sewing: 900,
      packing: 300,
      packed: 0,
      status: "Em produção",
      unit: "unidade",
      openedOn: "2026-11-01",
      startsOn: "2026-11-01",
      dueOn: "2026-12-01",
      responsible: "Inspetor de demonstração",
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
      moduleIds: [],
      materialIds: ["demo-0", "demo-1"],
      supplierIds: ["demo-0"],
      thirdPartyIds: ["demo-0", "demo-1", "demo-2"],
      modelingStatus: "Liberada",
      reconciliationOk: true,
      notes: "Dados exclusivos do emulador.",
      balances: {
        corte: 300,
        "estamparia:demo-0": 600,
        "estamparia:demo-1": 400,
        "costura:demo-2": 900,
        embalagem: 300,
        despachado: 500,
      },
    });
    const sequences: [string, string, number][] = [
      ["", "corte", 3000],
      ["corte", "estamparia:demo-0", 2300],
      ["estamparia:demo-0", "estampa-pronta", 1700],
      ["corte", "estamparia:demo-1", 400],
      ["estampa-pronta", "costura:demo-2", 1700],
      ["costura:demo-2", "costura-pronta", 800],
      ["costura-pronta", "embalagem", 800],
      ["embalagem", "embalado", 500],
      ["embalado", "despachado", 500],
    ];
    for (const [i, [source, destination, quantity]] of sequences.entries())
      await project
        .collection("productionMovements")
        .doc(`seed-${i}`)
        .set({
          companyId: "demo-company",
          projectId: "itaborai",
          projectName: "Itaboraí",
          clientId: "demo-0",
          productId: "demo-0",
          operationId: `seed-${i}`,
          lotId: "principal",
          kind: i === 0 ? "cut" : "transfer",
          quantity,
          source,
          destination,
          deltas: [
            ...(source ? [{ account: source, quantity: -quantity }] : []),
            { account: destination, quantity },
          ],
          cutDelta: i === 0 ? quantity : 0,
          unit: "unidade",
          occurredOn: "2026-11-05",
          createdBy: "inspector-demo",
          recordedAt: FieldValue.serverTimestamp(),
        });
    await project
      .collection("productionBalances")
      .doc("principal")
      .set({
        companyId: "demo-company",
        projectId: "itaborai",
        lotId: "principal",
        colorId: "",
        sizeId: "",
        projectName: "Itaboraí",
        nextDueOn: "2026-12-01",
        clientId: "demo-0",
        productId: "demo-0",
        updatedOn: "2026-11-05",
        externalQueues: {
          "estamparia:demo-0": [
            { operationId: "seed-1", quantity: 600, dueOn: "2026-12-01" },
          ],
          "estamparia:demo-1": [
            { operationId: "seed-3", quantity: 400, dueOn: "2026-12-01" },
          ],
          "costura:demo-2": [
            { operationId: "seed-4", quantity: 900, dueOn: "2026-12-01" },
          ],
        },
        balances: {
          corte: 300,
          "estamparia:demo-0": 600,
          "estamparia:demo-1": 400,
          "costura:demo-2": 900,
          embalagem: 300,
          despachado: 500,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
  }
  writeFileSync(
    ".emulator-credentials.json",
    JSON.stringify({
      email: "inspetor@textilflow.test",
      ownerEmail: "proprietario@textilflow.test",
      password,
    }),
  );
  console.log(
    "Seed concluído somente no emulador. Credenciais locais geradas em arquivo ignorado pelo Git.",
  );
}
seed().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
