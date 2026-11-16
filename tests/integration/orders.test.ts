import { beforeAll, afterAll, expect, it, vi } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { catalogSchema } from "../../functions/src/domain";
import { blankGrade } from "../../src/features/orders/model";

const company = "orders-test",
  inspector = "orders-inspector",
  owner = "orders-owner";
let environment: RulesTestEnvironment;
let db: ReturnType<
  ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]
>;

import {
  cancelOf,
  editOfSectors,
  generateOf,
  saveOrder,
} from "../../src/services/spark/orders";
import { callFirestore } from "../../src/services/spark/api";

const ref = `companies/${company}`;
const vector = (...values: number[]) => [
  ...values,
  ...blankGrade().slice(values.length),
];
const colorIds = ["black", "navy", "white"],
  sizes = ["p", "m", "g", "gg"],
  sectors = ["cut", "sew", "inspect", "pack", "ship"];
const order = {
  number: "PED-1042",
  clientId: "client",
  dueOn: "2027-02-28",
  flowId: "flow",
  sectorIds: sectors,
};
const item = {
  productId: "product",
  gradeId: "grade",
  colors: colorIds.slice(0, 2),
  sizes,
  ordered: vector(20, 50, 40, 10, 20, 50, 40, 10),
  leaves: vector(30, 30),
};
const of = {
  number: "OF-0087",
  itemId: "item",
  quantities: vector(20, 50, 40, 10, 10, 25, 20, 5),
  leaves: vector(30, 15),
  sectorIds: sectors,
};
function as(uid: string) {
  return environment
    .authenticatedContext(uid, { email_verified: true })
    .firestore();
}

vi.mock("../../src/lib/firebase", () => ({
  get db() {
    return db;
  },
  auth: {
    get currentUser() {
      return { uid: inspector, email: "orders@example.test" };
    },
  },
}));

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-textilflow",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  db = as(inspector);
  await environment.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    const records: Record<string, object> = {
      [ref]: { active: true },
      [ref + "/members/" + inspector]: { active: true, role: "inspector" },
      [ref + "/members/" + owner]: { active: true, role: "owner" },
      [ref + "/clients/client"]: { active: true },
      [ref + "/products/product"]: { active: true, colorIds, materialIds: [] },
      [ref + "/grades/grade"]: { active: true, sizeIds: sizes },
      [ref + "/flows/flow"]: { active: true, sectorIds: sectors },
      [ref + "/suppliers/alfa"]: { active: true },
      [ref + "/suppliers/beta"]: { active: true },
    };
    sectors.forEach((id) => {
      records[ref + "/sectors/" + id] = { active: true, operationalType: id };
    });
    await Promise.all(
      Object.entries(records).map(([path, value]) =>
        setDoc(doc(admin, path), value),
      ),
    );
  });
});
afterAll(async () => environment?.cleanup());

it("grava composição própria e dois fornecedores no material", async () => {
  await callFirestore("saveCatalog", {
    companyId: company,
    kind: "materials",
    id: "material",
    data: catalogSchema.parse({
      name: "Malha",
      reference: "MAT-001",
      composition: "100% algodão",
      unit: "quilograma",
      supplierId: "alfa",
      supplierIds: ["alfa", "beta"],
    }),
  });
  expect(
    (await getDoc(doc(db, ref + "/materials/material"))).get("supplierIds"),
  ).toEqual(["alfa", "beta"]);
});

it("cria pedido multicolor, preserva a grade e reserva OFs concorrentes de forma atômica", async () => {
  await saveOrder(company, "ped", inspector, order, [
    { id: "item", data: item },
  ]);
  await generateOf(company, "ped", "of-0087", inspector, of);
  expect(
    (await getDoc(doc(db, ref + "/projects/of-0087"))).get("planned"),
  ).toBe(180);
  await expect(
    generateOf(company, "ped", "of-0087", inspector, of),
  ).resolves.toBe("of-0087");
  await expect(
    saveOrder(company, "ped", inspector, order, [
      {
        id: "item",
        data: { ...item, ordered: vector(19, 50, 40, 10, 20, 50, 40, 10) },
      },
    ]),
  ).rejects.toThrow(/cobrir/);
  const rest = {
    ...of,
    number: "OF parcial",
    quantities: vector(0, 0, 0, 0, 10, 25, 20, 5),
    leaves: vector(0, 15),
  };
  const results = await Promise.allSettled([
    generateOf(company, "ped", "partial-a", inspector, rest),
    generateOf(company, "ped", "partial-b", inspector, rest),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([
    "fulfilled",
    "rejected",
  ]);
  const valid = results.find(
    (r) => r.status === "fulfilled",
  ) as PromiseFulfilledResult<string>;
  await expect(
    generateOf(company, "ped", "over", inspector, rest),
  ).rejects.toThrow(/excede/);
  await cancelOf(company, valid.value, inspector);
  const itemRef = doc(db, ref + "/orders/ped/items/item");
  expect((await getDoc(itemRef)).get("allocated")).toEqual(of.quantities);
  await assertFails(updateDoc(itemRef, { allocated: blankGrade() }));
  await editOfSectors(company, "of-0087", inspector, [...sectors].reverse());
  expect(
    (await getDoc(doc(db, ref + "/projects/of-0087"))).get(
      "manufacturing.sectorIds",
    ),
  ).toEqual([...sectors].reverse());
  expect((await getDoc(doc(db, ref + "/orders/ped"))).get("sectorIds")).toEqual(
    sectors,
  );
  await assertSucceeds(getDoc(doc(as(owner), ref + "/orders/ped/items/item")));
  await assertFails(
    updateDoc(doc(as(owner), ref + "/orders/ped"), { number: "Burlado" }),
  );
  await assertFails(getDoc(doc(as("outsider"), ref + "/orders/ped")));
});

it("valida a última posição em uma grade de 12 combinações", async () => {
  const fullColors = ["black", "navy", "white"];
  await environment.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), ref + "/products/product"), {
      colorIds: fullColors,
    });
  });
  await saveOrder(company, "ped-max", inspector, order, [
    {
      id: "item",
      data: {
        ...item,
        colors: fullColors,
        ordered: vector(...Array(12).fill(10)),
        leaves: blankGrade(),
      },
    },
  ]);
  await generateOf(company, "ped-max", "of-max", inspector, {
    ...of,
    quantities: vector(...Array(12).fill(8)),
    leaves: blankGrade(),
  });
  const itemRef = doc(db, ref + "/orders/ped-max/items/item");
  expect((await getDoc(itemRef)).get("allocated")[11]).toBe(8);
  await expect(
    generateOf(company, "ped-max", "of-over", inspector, {
      ...of,
      quantities: blankGrade().with(11, 3),
      leaves: blankGrade(),
    }),
  ).rejects.toThrow(/excede/);
});
