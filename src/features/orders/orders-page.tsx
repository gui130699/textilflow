"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useSession } from "@/hooks/use-session";
import { useCollection } from "@/hooks/use-collection";
import { db } from "@/lib/firebase";
import { projectUrl } from "@/lib/project-url";
import { errorMessage, formatDate, number, today } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Feedback, Loading } from "@/components/feedback";
import { DataTable } from "@/components/data-table";
import { SectorSequence } from "@/components/sector-sequence";
import { generateOf, saveOrder } from "@/services/spark/orders";
import type { Row } from "@/types";
import { Grade } from "./grade";
import {
  blankGrade,
  gradeSlots,
  total,
  type Order,
  type OrderItem,
} from "./model";

function useCatalog(company: string, kind: string) {
  return useCollection(`companies/${company}/${kind}`);
}

function useRows(path: string, orderId?: string) {
  const [rows, setRows] = useState<Row[]>();
  const [error, setError] = useState("");
  useEffect(
    () =>
      onSnapshot(
        orderId
          ? query(
              collection(db, path),
              where("manufacturing.orderId", "==", orderId),
            )
          : collection(db, path),
        (result) =>
          setRows(result.docs.map((d) => ({ ...d.data(), id: d.id }))),
        (error) => setError(errorMessage(error)),
      ),
    [path, orderId],
  );
  return { rows, error };
}

function options(rows: Row[], selected = "") {
  return (
    <>
      <option value="">Selecione</option>
      {rows
        .filter((r) => r.active || r.id === selected)
        .map((r) => (
          <option value={r.id} key={r.id}>
            {String(r.reference ? r.reference + " — " : "")}
            {String(r.name)}
          </option>
        ))}
    </>
  );
}

const freshItem = (): OrderItem => ({
  id: crypto.randomUUID(),
  productId: "",
  gradeId: "",
  colors: [],
  sizes: [],
  ordered: blankGrade(),
  leaves: blankGrade(),
  allocated: blankGrade(),
  lastOf: "",
});

export function OrdersPage() {
  const id = useSearchParams().get("id");
  const { company, user } = useSession();
  if (!company || !user) return <Loading />;
  const props = {
    company: company.id,
    uid: user.uid,
    writable: company.role === "inspector",
  };
  if (id === "novo" && props.writable)
    return <OrderEditor key="new" {...props} />;
  if (id && /^[A-Za-z0-9_-]{1,128}$/.test(id))
    return <OrderDetail key={id} id={id} {...props} />;
  return <OrderList {...props} />;
}

type Scope = { company: string; uid: string; writable: boolean };
function OrderList({ company, writable }: Scope) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [client, setClient] = useState("");
  const clients = useCatalog(company, "clients");
  const orders = useCollection(`companies/${company}/orders`, search);
  const names = (id: unknown) =>
    String(clients.rows.find((r) => r.id === id)?.name ?? id);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Pedidos</h1>
          <p>Acompanhe a demanda e programe ordens de fabricação.</p>
        </div>
        {writable && (
          <Button asChild>
            <Link href="/pedidos?id=novo">Novo pedido</Link>
          </Button>
        )}
      </div>
      <Feedback error={orders.error || clients.error} />
      <div className="panel">
        <div className="toolbar">
          <input
            aria-label="Buscar pedidos"
            placeholder="Número do pedido"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Filtrar por cliente"
            value={client}
            onChange={(e) => setClient(e.target.value)}
          >
            {options(clients.rows, client)}
          </select>
        </div>
        <DataTable
          rows={orders.rows.filter((row) => !client || row.clientId === client)}
          onRow={(r) => router.push(`/pedidos?id=${r.id}`)}
          columns={[
            { accessorKey: "number", header: "Pedido" },
            {
              accessorKey: "clientId",
              header: "Cliente",
              cell: (v) => names(v.getValue()),
            },
            {
              accessorKey: "dueOn",
              header: "Entrega",
              cell: (v) => formatDate(v.getValue()),
            },
          ]}
        />
        {(orders.more || clients.more) && (
          <div className="panel-footer">
            <Button
              variant="outline"
              onClick={() => {
                if (orders.more) void orders.next();
                if (clients.more) void clients.next();
              }}
            >
              Carregar mais
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function OrderEditor({
  company,
  uid,
  existing,
  initialItems,
}: Scope & { existing?: Order; initialItems?: OrderItem[] }) {
  const router = useRouter();
  const [order, setOrder] = useState(
    () =>
      existing ?? {
        id: crypto.randomUUID(),
        number: "",
        clientId: "",
        dueOn: today(),
        flowId: "",
        sectorIds: [],
      },
  );
  const [items, setItems] = useState(() => initialItems ?? [freshItem()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const clients = useCatalog(company, "clients");
  const products = useCatalog(company, "products");
  const grades = useCatalog(company, "grades");
  const colors = useCatalog(company, "colors");
  const sizes = useCatalog(company, "sizes");
  const flows = useCatalog(company, "flows");
  const sectors = useCatalog(company, "sectors");
  const label = (rows: Row[], id: string) =>
    String(rows.find((r) => r.id === id)?.name ?? id);
  const patch = (id: string, data: Partial<OrderItem>) =>
    setItems((old) =>
      old.map((item) => (item.id === id ? { ...item, ...data } : item)),
    );
  function pickColor(item: OrderItem, color: string, checked: boolean) {
    const next = checked
      ? [...item.colors, color]
      : item.colors.filter((id) => id !== color);
    if (next.length > 6 || next.length * item.sizes.length > gradeSlots) {
      setError("Use até 6 cores e 12 combinações de cor e tamanho por item.");
      return;
    }
    const ordered = blankGrade(),
      leaves = blankGrade();
    next.forEach((id, row) => {
      const before = item.colors.indexOf(id);
      if (before < 0) return;
      leaves[row] = item.leaves[before];
      item.sizes.forEach((_, col) => {
        ordered[row * item.sizes.length + col] =
          item.ordered[before * item.sizes.length + col];
      });
    });
    patch(item.id, { colors: next, ordered, leaves });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveOrder(
        company,
        order.id,
        uid,
        order,
        items.map((item) => ({ id: item.id, data: item })),
      );
      if (existing) router.replace(`/pedidos?id=${order.id}`);
      else router.push(`/pedidos?id=${order.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="page-heading">
        <div>
          <h1>{existing ? "Editar pedido" : "Novo pedido"}</h1>
        </div>
        <Button asChild variant="outline">
          <Link href={existing ? `/pedidos?id=${existing.id}` : "/pedidos"}>
            Voltar
          </Link>
        </Button>
      </div>
      <fieldset disabled={busy}>
        <div className="panel p-5 form-grid">
          <label>
            Número do pedido
            <input
              required
              maxLength={100}
              value={order.number}
              onChange={(e) => setOrder({ ...order, number: e.target.value })}
            />
          </label>
          <label>
            Cliente
            <select
              required
              disabled={!!existing}
              value={order.clientId}
              onChange={(e) => setOrder({ ...order, clientId: e.target.value })}
            >
              {options(clients.rows, order.clientId)}
            </select>
          </label>
          <label>
            Data de entrega
            <input
              required
              type="date"
              value={order.dueOn}
              onChange={(e) => setOrder({ ...order, dueOn: e.target.value })}
            />
          </label>
          <label>
            Fluxo sugerido
            <select
              value={order.flowId}
              onChange={(e) => {
                const flowId = e.target.value;
                setOrder({
                  ...order,
                  flowId,
                  sectorIds:
                    (flows.rows.find((r) => r.id === flowId)?.sectorIds as
                      string[] | undefined) ?? [],
                });
              }}
            >
              {options(flows.rows, order.flowId)}
            </select>
          </label>
          {!!order.sectorIds.length && (
            <p className="wide">
              {order.sectorIds.map((id) => label(sectors.rows, id)).join(" → ")}
            </p>
          )}
        </div>
        {items.map((item, index) => {
          const allowed =
            (products.rows.find((p) => p.id === item.productId)?.colorIds as
              string[] | undefined) ?? [];
          return (
            <section key={item.id} className="panel mt-4 p-5 space-y-3">
              <h2>Item {index + 1}</h2>
              <div className="form-grid">
                <label>
                  Produto
                  <select
                    required
                    disabled={Boolean(item.lastOf)}
                    value={item.productId}
                    onChange={(e) => {
                      const productId = e.target.value;
                      const product = products.rows.find(
                        (r) => r.id === productId,
                      );
                      const gradeId = String(product?.gradeId ?? "");
                      patch(item.id, {
                        productId,
                        gradeId,
                        sizes:
                          (grades.rows.find((r) => r.id === gradeId)
                            ?.sizeIds as string[]) ?? [],
                        colors: [],
                        ordered: blankGrade(),
                        leaves: blankGrade(),
                      });
                    }}
                  >
                    {options(products.rows, item.productId)}
                  </select>
                </label>
                <label>
                  Grade
                  <select
                    required
                    disabled={Boolean(item.lastOf)}
                    value={item.gradeId}
                    onChange={(e) => {
                      const gradeId = e.target.value;
                      patch(item.id, {
                        gradeId,
                        sizes:
                          (grades.rows.find((r) => r.id === gradeId)
                            ?.sizeIds as string[]) ?? [],
                        colors: [],
                        ordered: blankGrade(),
                        leaves: blankGrade(),
                      });
                    }}
                  >
                    {options(grades.rows, item.gradeId)}
                  </select>
                </label>
              </div>
              <h3>Grade e folhas por cor</h3>
              <div className="flex flex-wrap gap-4">
                {allowed.map((id) => (
                  <label key={id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={Boolean(item.lastOf)}
                      checked={item.colors.includes(id)}
                      onChange={(e) => pickColor(item, id, e.target.checked)}
                    />
                    {label(colors.rows, id)}
                  </label>
                ))}
              </div>
              <Grade
                {...item}
                quantities={item.ordered}
                colorName={(id) => label(colors.rows, id)}
                sizeName={(id) => label(sizes.rows, id)}
                onChange={(ordered, leaves) =>
                  patch(item.id, { ordered, leaves })
                }
              />
              {!initialItems?.some((initial) => initial.id === item.id) &&
                items.length > 1 && (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() =>
                      setItems(items.filter((entry) => entry.id !== item.id))
                    }
                  >
                    Remover item
                  </Button>
                )}
            </section>
          );
        })}
        {[clients, products, grades, colors, sizes, flows, sectors].some(
          (list) => list.more,
        ) && (
          <Button
            className="mt-4"
            type="button"
            variant="outline"
            onClick={() =>
              [
                clients,
                products,
                grades,
                colors,
                sizes,
                flows,
                sectors,
              ].forEach((list) => {
                if (list.more) void list.next();
              })
            }
          >
            Carregar mais opções
          </Button>
        )}
        <Feedback
          error={
            error ||
            clients.error ||
            products.error ||
            grades.error ||
            flows.error ||
            sectors.error
          }
        />
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => setItems([...items, freshItem()])}
          >
            Adicionar item
          </Button>
          <Button>{busy ? "Salvando…" : "Salvar pedido"}</Button>
        </div>
      </fieldset>
    </form>
  );
}

function OrderDetail({ id, ...scope }: Scope & { id: string }) {
  const { company, writable } = scope;
  const path = `companies/${company}/orders/${id}`;
  const [order, setOrder] = useState<Order | null>();
  const [error, setError] = useState("");
  const items = useRows(path + "/items");
  const ofs = useRows(`companies/${company}/projects`, id);
  const clients = useCatalog(company, "clients");
  const products = useCatalog(company, "products");
  const colors = useCatalog(company, "colors");
  const sizes = useCatalog(company, "sizes");
  const sectors = useCatalog(company, "sectors");
  const params = useSearchParams();
  const [generating, setGenerating] = useState("");
  useEffect(
    () =>
      onSnapshot(
        doc(db, path),
        (d) => setOrder(d.exists() ? ({ ...d.data(), id } as Order) : null),
        (e) => setError(errorMessage(e)),
      ),
    [id, path],
  );
  if (error || items.error || ofs.error)
    return <Feedback error={error || items.error || ofs.error} />;
  if (order === null) return <Feedback error="Pedido não encontrado." />;
  if (!order || !items.rows || !ofs.rows) return <Loading />;
  const data = items.rows as unknown as OrderItem[];
  const ordered = data.reduce((sum, item) => sum + total(item.ordered), 0);
  const allocated = data.reduce((sum, item) => sum + total(item.allocated), 0);
  const label = (rows: Row[], id: string) =>
    String(rows.find((r) => r.id === id)?.name ?? id);
  const colorName = (id: string) => label(colors.rows, id);
  const sizeName = (id: string) => label(sizes.rows, id);
  if (params.get("editar") === "1" && writable)
    return <OrderEditor {...scope} existing={order} initialItems={data} />;
  return (
    <>
      <div className="page-heading">
        <div>
          <Link className="text-link" href="/pedidos">
            Voltar a pedidos
          </Link>
          <h1>{order.number}</h1>
          <p>
            {label(clients.rows, order.clientId)} · Entrega{" "}
            {formatDate(order.dueOn)}
          </p>
        </div>
        {writable && (
          <Button asChild variant="outline">
            <Link href={`/pedidos?id=${id}&editar=1`}>Editar pedido</Link>
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Peças pedidas", ordered],
          ["Peças programadas", allocated],
          ["Peças a programar", ordered - allocated],
        ].map(([label, value]) => (
          <div className="panel p-5" key={label}>
            <span>{label}</span>
            <strong className="block text-2xl">{number(value)}</strong>
          </div>
        ))}
      </div>
      {!!order.sectorIds.length && (
        <section className="panel mt-4 p-5">
          <h2>Fluxo sugerido</h2>
          <p>
            {order.sectorIds.map((id) => label(sectors.rows, id)).join(" → ")}
          </p>
        </section>
      )}
      {data.map((item) => (
        <section className="panel mt-4 p-5 space-y-3" key={item.id}>
          <h2>{label(products.rows, item.productId)}</h2>
          <h3>Grade e folhas por cor</h3>
          <Grade
            {...item}
            quantities={item.ordered}
            colorName={colorName}
            sizeName={sizeName}
          />
          <ul>
            {item.colors.map((color, row) => (
              <li key={color}>
                {colorName(color)} ·{" "}
                {number(
                  total(
                    item.sizes.map((_, col) => {
                      const i = row * item.sizes.length + col;
                      return item.ordered[i] - item.allocated[i];
                    }),
                  ),
                )}{" "}
                peças a programar
              </li>
            ))}
          </ul>
          {writable && total(item.ordered) > total(item.allocated) && (
            <Button onClick={() => setGenerating(item.id)}>Gerar OF</Button>
          )}
          {generating === item.id && (
            <OfEditor
              {...scope}
              item={item}
              order={order}
              sectors={sectors.rows}
              colorName={colorName}
              sizeName={sizeName}
              close={() => setGenerating("")}
            />
          )}
        </section>
      ))}
      <section className="panel mt-4 p-5">
        <h2>OFs vinculadas</h2>
        {!ofs.rows.length && <p className="muted">Nenhuma OF gerada.</p>}
        <ul className="space-y-2">
          {ofs.rows.map((row) => (
            <li key={row.id}>
              <Link className="text-link" href={projectUrl(row.id)}>
                {String(row.name)}
              </Link>{" "}
              · {String(row.status)} · {number(row.planned)} peças
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function OfEditor({
  company,
  uid,
  item,
  order,
  sectors,
  colorName,
  sizeName,
  close,
}: Scope & {
  item: OrderItem;
  order: Order;
  sectors: Row[];
  colorName: (id: string) => string;
  sizeName: (id: string) => string;
  close: () => void;
}) {
  const router = useRouter();
  const [id] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [quantities, setQuantities] = useState(blankGrade);
  const [leaves, setLeaves] = useState(blankGrade);
  const [sectorIds, setSectorIds] = useState(order.sectorIds);
  const [selectedColors, setSelectedColors] = useState(item.colors);
  const [thirdPartyIds, setThirdPartyIds] = useState<string[]>([]);
  const thirdParties = useCatalog(company, "thirdParties");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const available = item.ordered.map((n, i) => n - item.allocated[i]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const project = await generateOf(company, order.id, id, uid, {
        number: name,
        itemId: item.id,
        sectorIds,
        thirdPartyIds,
        quantities: quantities.map((n, idx) =>
          selectedColors.includes(
            item.colors[Math.floor(idx / item.sizes.length)],
          )
            ? n
            : 0,
        ),
        leaves: leaves.map((n, idx) =>
          selectedColors.includes(item.colors[idx]) ? n : 0,
        ),
      });
      router.push(projectUrl(project));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Gerar OF"
      >
        <h2>Gerar OF</h2>
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="space-y-4">
            <label>
              Número da OF
              <input
                value={name}
                required
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div
              className="flex flex-wrap gap-3"
              role="group"
              aria-label="Cores a programar"
            >
              {item.colors.map((id) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={selectedColors.includes(id)}
                    onChange={(e) =>
                      setSelectedColors(
                        e.target.checked
                          ? [...selectedColors, id]
                          : selectedColors.filter((value) => value !== id),
                      )
                    }
                  />{" "}
                  {colorName(id)}
                </label>
              ))}
            </div>
            <Grade
              {...item}
              quantities={quantities}
              leaves={leaves}
              available={available}
              hiddenColors={item.colors.filter(
                (id) => !selectedColors.includes(id),
              )}
              colorName={colorName}
              sizeName={sizeName}
              onChange={(qty, folhas) => {
                setQuantities(qty);
                setLeaves(folhas);
              }}
            />
            <label>
              Terceiros de produção
              <select
                multiple
                value={thirdPartyIds}
                onChange={(e) =>
                  setThirdPartyIds(
                    Array.from(
                      e.target.selectedOptions,
                      (option) => option.value,
                    ),
                  )
                }
              >
                {thirdParties.rows
                  .filter((row) => row.active)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {String(row.name)}
                    </option>
                  ))}
              </select>
            </label>
            {thirdParties.more && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void thirdParties.next()}
              >
                Carregar terceiros
              </Button>
            )}
            <SectorSequence
              value={sectorIds}
              options={sectors}
              onChange={setSectorIds}
            />
            <Feedback error={error} />
            <div className="form-actions">
              <Button type="button" variant="outline" onClick={close}>
                Fechar
              </Button>
              <Button>{busy ? "Gerando…" : "Confirmar OF"}</Button>
            </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
