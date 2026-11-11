import { expect, it } from "vitest";
import { dailyCut, thirdPartyBalances } from "../../src/lib/reports";
it("agrega cortes e estornos sem contar transferências como produção", () => {
  expect(
    dailyCut([
      {
        id: "1",
        projectId: "p",
        projectName: "Projeto",
        occurredOn: "2026-11-10",
        cutDelta: 100,
      },
      {
        id: "2",
        projectId: "p",
        projectName: "Projeto",
        occurredOn: "2026-11-10",
        cutDelta: -20,
      },
      {
        id: "3",
        projectId: "p",
        projectName: "Projeto",
        occurredOn: "2026-11-10",
        cutDelta: 0,
        quantity: 50,
      },
    ])[0].quantity,
  ).toBe(80);
});
it("relatório de terceiros preserva lote, variante e saldo físico", () => {
  const rows = [
    {
      id: "lot1",
      lotId: "lot1",
      colorId: "blue",
      sizeId: "M",
      projectId: "p",
      balances: { "estamparia:a": 40, "costura:b": 20, despachado: 30 },
    },
    {
      id: "lot2",
      lotId: "lot2",
      colorId: "red",
      sizeId: "P",
      projectId: "p",
      balances: { "estamparia:a": 10 },
    },
  ];
  const result = thirdPartyBalances(rows, "a", "estamparia");
  expect(result.map((r) => r.quantity)).toEqual([40, 10]);
  expect(result.map((r) => r.colorId)).toEqual(["blue", "red"]);
});
