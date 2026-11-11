import { describe, it, expect } from "vitest";
import {
  movementSchema,
  planMovement,
  applyDeltas,
  projectSchema,
  sameBalances,
} from "../../functions/src/domain";
import { csv } from "../../src/lib/csv";
const base = {
  companyId: "a",
  projectId: "p",
  operationId: "unique",
  lotId: "main",
  quantity: 100,
  occurredOn: "2026-11-10",
};
describe("Conservação de peças", () => {
  it("cria peças apenas pelo corte", () =>
    expect(
      applyDeltas(
        {},
        planMovement(movementSchema.parse({ ...base, kind: "cut" }), true),
      ),
    ).toEqual({ corte: 100 }));
  it("envia a terceiro sem duplicar o saldo", () => {
    const result = applyDeltas(
      { corte: 100 },
      planMovement(
        movementSchema.parse({
          ...base,
          kind: "send",
          thirdPartyId: "t",
          dueOn: "2026-12-01",
        }),
        true,
      ),
    );
    expect(result).toEqual({ corte: 0, "estamparia:t": 100 });
  });
  it("retorna parcialmente com defeitos separados", () =>
    expect(
      applyDeltas(
        { "estamparia:t": 200 },
        planMovement(
          movementSchema.parse({
            ...base,
            kind: "receive",
            thirdPartyId: "t",
            defective: 10,
          }),
          true,
        ),
      ),
    ).toEqual({ "estamparia:t": 100, "estampa-pronta": 90, quarentena: 10 }));
  it("bloqueia saldo negativo", () =>
    expect(() =>
      applyDeltas({ corte: 99 }, [{ account: "corte", quantity: -100 }]),
    ).toThrow("Saldo insuficiente"));
  it("bloqueia saltar costura", () =>
    expect(() =>
      planMovement(
        movementSchema.parse({
          ...base,
          kind: "transfer",
          source: "corte",
          destination: "embalado",
        }),
        false,
      ),
    ).toThrow());
  it("costura recebe corte quando não há estamparia", () =>
    expect(
      planMovement(
        movementSchema.parse({
          ...base,
          kind: "send",
          stage: "costura",
          thirdPartyId: "t",
          dueOn: "2026-12-01",
        }),
        false,
      )[0].account,
    ).toBe("corte"));
  it("costura exige estampado quando etapa aplicável", () =>
    expect(
      planMovement(
        movementSchema.parse({
          ...base,
          kind: "send",
          stage: "costura",
          thirdPartyId: "t",
          dueOn: "2026-12-01",
        }),
        true,
      )[0].account,
    ).toBe("estampa-pronta"));
  it("bloqueia estamparia não configurada", () =>
    expect(() =>
      planMovement(
        movementSchema.parse({
          ...base,
          kind: "send",
          stage: "estamparia",
          thirdPartyId: "t",
          dueOn: "2026-12-01",
        }),
        false,
      ),
    ).toThrow());
  it.each([0, -1, 0.5, Infinity, NaN, 10_000_001])(
    "rejeita quantidade inválida %s",
    (quantity) =>
      expect(
        movementSchema.safeParse({ ...base, kind: "cut", quantity }).success,
      ).toBe(false),
  );
  it("exige destinatário no despacho", () =>
    expect(() =>
      planMovement(movementSchema.parse({ ...base, kind: "dispatch" }), false),
    ).toThrow());
  it("reconcilia contas zeradas", () =>
    expect(
      sameBalances({ corte: 0, despachado: 100 }, { despachado: 100 }),
    ).toBe(true));
  it("estorno compensatório não apaga o original", () => {
    const d = planMovement(
      movementSchema.parse({ ...base, kind: "cut" }),
      false,
    );
    expect(
      applyDeltas(
        applyDeltas({}, d),
        d.map((v) => ({ ...v, quantity: -v.quantity })),
      ),
    ).toEqual({ corte: 0 });
    expect(d[0].quantity).toBe(100);
  });
  it("rejeita caminhos de outra coleção", () =>
    expect(
      movementSchema.safeParse({ ...base, kind: "cut", lotId: "../other" })
        .success,
    ).toBe(false));
  it("escapa injeção de fórmula e aspas em CSV", () =>
    expect(csv(["A"], [["=1+1"], ['a"b']])).toBe('"A"\r\n"\'=1+1"\r\n"a""b"'));
  it("rejeita projeto com data impossível", () =>
    expect(projectSchema.safeParse({}).success).toBe(false));
});
