"use client";

import { useState } from "react";
import Link from "next/link";
import { useCollection } from "@/hooks/use-collection";
import { useLabels } from "@/hooks/use-labels";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
import { SectorSequence } from "@/components/sector-sequence";
import { cancelOf, editOfSectors } from "@/services/spark/orders";
import { errorMessage, number } from "@/lib/utils";
import { Grade } from "./grade";
import { gradeSlots, total, type Manufacturing } from "./model";

export function OfDetails({
  id,
  of,
  clientId,
  productId,
  modelId,
  editable,
  cancelled,
}: {
  id: string;
  of: Manufacturing;
  clientId: string;
  productId: string;
  modelId: string;
  editable: boolean;
  cancelled: boolean;
}) {
  const { company, user } = useSession();
  const sectors = useCollection(
    company ? `companies/${company.id}/sectors` : null,
  );
  const label = useLabels(company?.id, [
    ["clients", clientId],
    ["products", productId],
    ["models", modelId],
    ...of.colors.map((id) => ["colors", id] as [string, string]),
    ...of.sizes.map((id) => ["sizes", id] as [string, string]),
    ...of.sectorIds.map((id) => ["sectors", id] as [string, string]),
  ]);
  const [editing, setEditing] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rows = of.colors
    .map((color, i) => ({
      color,
      qty: of.quantities.slice(i * of.sizes.length, (i + 1) * of.sizes.length),
      leaves: of.leaves[i],
    }))
    .filter((row) => total(row.qty) || row.leaves);
  async function update(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setEditing(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel p-5 mb-5 space-y-4">
      <h2>Ordem de fabricação</h2>
      <p>
        Pedido{" "}
        <Link className="text-link" href={`/pedidos?id=${of.orderId}`}>
          {of.orderNumber}
        </Link>
      </p>
      <p>
        {label("clients", clientId)} · {label("products", productId)}
        {modelId && ` · ${label("models", modelId)}`}
      </p>
      <h3>Grade da OF · {number(total(of.quantities))} peças</h3>
      <Grade
        colors={rows.map((r) => r.color)}
        sizes={of.sizes}
        quantities={rows.flatMap((r) => r.qty).slice(0, gradeSlots)}
        leaves={rows.map((r) => r.leaves)}
        colorName={(id) => label("colors", id)}
        sizeName={(id) => label("sizes", id)}
      />
      <h3>Sequência de setores</h3>
      {editing ? (
        <fieldset disabled={busy}>
          <SectorSequence
            options={sectors.rows}
            value={editing}
            onChange={setEditing}
            label="Editar sequência"
          />
          {sectors.more && (
            <Button variant="outline" onClick={() => void sectors.next()}>
              Carregar setores
            </Button>
          )}
          <div className="form-actions">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Fechar
            </Button>
            <Button
              onClick={() =>
                void update(() =>
                  editOfSectors(company!.id, id, user!.uid, editing),
                )
              }
            >
              Salvar setores
            </Button>
          </div>
        </fieldset>
      ) : (
        <p>
          {of.sectorIds.map((id) => label("sectors", id)).join(" → ") ||
            "Sem fluxo definido."}
        </p>
      )}
      {editable && !cancelled && !editing && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setEditing(of.sectorIds)}
          >
            Ajustar setores
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Cancelar a OF e devolver as peças ao saldo do pedido?",
                )
              )
                void update(() => cancelOf(company!.id, id, user!.uid));
            }}
          >
            Cancelar OF
          </Button>
        </div>
      )}
      <Feedback error={error || sectors.error} />
    </section>
  );
}
