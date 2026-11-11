import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-textilflow",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: readFileSync("storage.rules", "utf8"),
    },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const c of ["security-a", "security-b"]) {
      await setDoc(doc(db, `companies/${c}`), { active: true });
      await setDoc(doc(db, `companies/${c}/projects/p`), {
        name: c,
        searchName: c,
        planned: 100,
        active: true,
      });
    }
    for (const [user, role, active] of [
      ["rules-inspector", "inspector", true],
      ["rules-owner", "owner", true],
      ["rules-revoked", "owner", false],
    ] as const)
      await setDoc(doc(db, `companies/security-a/members/${user}`), {
        role,
        active,
      });
    await setDoc(doc(db, "users/rules-inspector"), {
      email: "private@example.test",
    });
    for (const visible of [true, false])
      await setDoc(
        doc(
          db,
          `companies/security-a/projects/p/attachments/${visible ? "public" : "private"}`,
        ),
        { ownerVisible: visible, createdAt: new Date() },
      );
  });
});
afterAll(() => env?.cleanup());
describe("Isolamento multiempresa e menor privilégio", () => {
  it("nega leitura anônima", () =>
    assertFails(
      getDoc(
        doc(
          env.unauthenticatedContext().firestore(),
          "companies/security-a/projects/p",
        ),
      ),
    ));
  it("nega listagem pública", () =>
    assertFails(
      getDocs(
        collection(
          env.unauthenticatedContext().firestore(),
          "companies/security-a/projects",
        ),
      ),
    ));
  it("permite leitura do proprietário vinculado", () =>
    assertSucceeds(
      getDoc(
        doc(
          env.authenticatedContext("rules-owner").firestore(),
          "companies/security-a/projects/p",
        ),
      ),
    ));
  it("nega outra empresa", () =>
    assertFails(
      getDoc(
        doc(
          env.authenticatedContext("rules-owner").firestore(),
          "companies/security-b/projects/p",
        ),
      ),
    ));
  it("nega vínculo revogado", () =>
    assertFails(
      getDoc(
        doc(
          env.authenticatedContext("rules-revoked").firestore(),
          "companies/security-a/projects/p",
        ),
      ),
    ));
  it("permite a consulta paginada usada pela aplicação", () =>
    assertSucceeds(
      getDocs(
        query(
          collection(
            env.authenticatedContext("rules-owner").firestore(),
            "companies/security-a/projects",
          ),
          orderBy("searchName"),
          limit(25),
        ),
      ),
    ));
  it.each(["rules-owner", "rules-inspector"])(
    "bloqueia alteração direta de saldo por %s",
    (uid) =>
      assertFails(
        setDoc(
          doc(
            env.authenticatedContext(uid).firestore(),
            "companies/security-a/projects/p/productionBalances/principal",
          ),
          { balances: { corte: 999 } },
        ),
      ),
  );
  it("bloqueia criação de administrador", () =>
    assertFails(
      setDoc(
        doc(
          env.authenticatedContext("rules-owner").firestore(),
          "companies/security-a/members/rules-owner",
        ),
        { active: true, role: "inspector" },
      ),
    ));
  it("bloqueia alteração de vínculo alheio", () =>
    assertFails(
      updateDoc(
        doc(
          env.authenticatedContext("rules-owner").firestore(),
          "companies/security-a/members/rules-inspector",
        ),
        { active: false },
      ),
    ));
  it("bloqueia apagar histórico", () =>
    assertFails(
      deleteDoc(
        doc(
          env.authenticatedContext("rules-inspector").firestore(),
          "companies/security-a/projects/p/productionMovements/x",
        ),
      ),
    ));
  it("nega dados privados de outro usuário", () =>
    assertFails(
      getDoc(
        doc(
          env.authenticatedContext("rules-owner").firestore(),
          "users/rules-inspector",
        ),
      ),
    ));
  it("nega autopromoção no perfil", () =>
    assertFails(
      setDoc(
        doc(
          env.authenticatedContext("rules-owner").firestore(),
          "users/rules-owner",
        ),
        { inspector: true },
      ),
    ));
  it("nega subcoleção órfã", () =>
    assertFails(
      getDoc(
        doc(
          env.authenticatedContext("rules-owner").firestore(),
          "companies/security-a/projects/missing/productionMovements/x",
        ),
      ),
    ));
  it("nega convites privados", () =>
    assertFails(
      getDoc(
        doc(
          env.authenticatedContext("rules-owner").firestore(),
          "invites/token",
        ),
      ),
    ));
  it("nega anexo interno ao proprietário", () =>
    assertFails(
      getDoc(
        doc(
          env.authenticatedContext("rules-owner").firestore(),
          "companies/security-a/projects/p/attachments/private",
        ),
      ),
    ));
  it("permite anexo autorizado", () =>
    assertSucceeds(
      getDoc(
        doc(
          env.authenticatedContext("rules-owner").firestore(),
          "companies/security-a/projects/p/attachments/public",
        ),
      ),
    ));
  it("permite consulta de anexos visíveis", () =>
    assertSucceeds(
      getDocs(
        query(
          collection(
            env.authenticatedContext("rules-owner").firestore(),
            "companies/security-a/projects/p/attachments",
          ),
          where("ownerVisible", "==", true),
          orderBy("createdAt", "desc"),
          limit(25),
        ),
      ),
    ));
  it("nega consulta irrestrita de anexos por proprietário", () =>
    assertFails(
      getDocs(
        collection(
          env.authenticatedContext("rules-owner").firestore(),
          "companies/security-a/projects/p/attachments",
        ),
      ),
    ));
  it("nega upload pelo proprietário", () =>
    assertFails(
      uploadBytes(
        ref(
          env.authenticatedContext("rules-owner").storage(),
          "companies/security-a/projects/p/owner-upload",
        ),
        new Uint8Array([1]),
        { contentType: "image/png" },
      ),
    ));
  it("nega extensão executável e SVG", () =>
    assertFails(
      uploadBytes(
        ref(
          env.authenticatedContext("rules-inspector").storage(),
          "companies/security-a/projects/p/bad-file",
        ),
        new Uint8Array([1]),
        { contentType: "image/svg+xml" },
      ),
    ));
  it("nega upload acima de 10 MB", () =>
    assertFails(
      uploadBytes(
        ref(
          env.authenticatedContext("rules-inspector").storage(),
          "companies/security-a/projects/p/huge",
        ),
        new Uint8Array(10 * 1024 * 1024 + 1),
        { contentType: "image/png" },
      ),
    ));
  it("permite upload de imagem pelo inspetor", () =>
    assertSucceeds(
      uploadBytes(
        ref(
          env.authenticatedContext("rules-inspector").storage(),
          "companies/security-a/projects/p/valid",
        ),
        new Uint8Array([137, 80, 78, 71]),
        { contentType: "image/png" },
      ),
    ));
  it("nega arquivo de outra empresa", () =>
    assertFails(
      getBytes(
        ref(
          env.authenticatedContext("rules-owner").storage(),
          "companies/security-b/projects/p/valid",
        ),
      ),
    ));
  it("nega campos arbitrários e timestamps manipulados", () =>
    assertFails(
      setDoc(
        doc(
          env.authenticatedContext("rules-inspector").firestore(),
          "companies/security-a/clients/malicious",
        ),
        { name: "a".repeat(10000), createdAt: "1900", admin: true },
      ),
    ));
  it("nenhum caminho público foi permitido", () =>
    expect(readFileSync("firestore.rules", "utf8")).not.toMatch(
      /allow\s+(read|write).*if\s+true/,
    ));
});

it("nega imagem de catálogo enviada pelo proprietário", () =>
  assertFails(
    uploadBytes(
      ref(
        env.authenticatedContext("rules-owner").storage(),
        "companies/security-a/assets/forbidden",
      ),
      new Uint8Array([137, 80, 78, 71]),
      { contentType: "image/png" },
    ),
  ));
it("nega vincular imagem externa diretamente ao catálogo", () =>
  assertFails(
    setDoc(
      doc(
        env.authenticatedContext("rules-inspector").firestore(),
        "companies/security-a/assets/fake",
      ),
      { path: "companies/security-b/assets/file" },
    ),
  ));
