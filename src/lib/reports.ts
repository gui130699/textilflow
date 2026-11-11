import type { Row } from "@/types";

export function dailyCut(rows: Row[]): Row[] {
  const days = new Map<string, Row>();
  for (const row of rows) {
    if (!row.cutDelta) continue;
    const key = `${row.projectId}/${row.occurredOn}`;
    const previous = days.get(key);
    days.set(key, {
      id: key,
      projectName: row.projectName,
      occurredOn: row.occurredOn,
      quantity: Number(previous?.quantity ?? 0) + Number(row.cutDelta),
    });
  }
  return [...days.values()];
}

export function thirdPartyBalances(
  rows: Row[],
  thirdPartyId = "",
  stage = "",
): Row[] {
  return rows.flatMap((row) =>
    Object.entries((row.balances ?? {}) as Record<string, number>)
      .filter(
        ([account, quantity]) =>
          account.includes(":") &&
          quantity > 0 &&
          (!thirdPartyId || account.split(":")[1] === thirdPartyId) &&
          (!stage || account.split(":")[0] === stage),
      )
      .map(([account, quantity]) => ({
        id: `${row.projectId}/${row.id}/${account}`,
        projectName: row.projectName,
        lotId: row.lotId,
        colorId: row.colorId,
        sizeId: row.sizeId,
        updatedOn: row.updatedOn,
        stage: account.split(":")[0],
        thirdPartyId: account.split(":")[1],
        quantity,
      })),
  );
}

export const operationNames: Record<string, string> = {
  cut: "Corte",
  send: "Envio a terceiro",
  receive: "Retorno de terceiro",
  transfer: "Transferência",
  loss: "Perda",
  dispatch: "Despacho",
  reverse: "Estorno",
  corte: "Corte pronto",
  estamparia: "Estamparia",
  costura: "Costura",
  "estampa-pronta": "Estampado pronto",
  "costura-pronta": "Costurado pronto",
  embalagem: "Em embalagem",
  embalado: "Embalado",
  despachado: "Despachado",
  perdas: "Perdas",
};
