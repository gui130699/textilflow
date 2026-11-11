"use client";
import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  startAfter,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Field } from "@/config/catalogs";
import { UseFormRegister, FieldValues } from "react-hook-form";
const optionLabels: Record<string, string> = {
  projects: "Produção por projeto",
  productionMovements: "Histórico de movimentações",
  inspections: "Inspeções de qualidade",
  productionBalances: "Saldos atuais por terceiro e lote",
  cutDaily: "Cortes líquidos por dia",
  lateProjects: "Projetos atrasados",
  owner: "Proprietário · somente leitura",
  inspector: "Inspetor · acesso operacional",
  "costura-pronta": "Costurado pronto",
  embalado: "Embalado",
  embalagem: "Em embalagem",
  recebimento: "Recebimento",
  inspecao: "Inspeção",
  modelagem: "Modelagem",
  corte: "Corte",
  estamparia: "Estamparia",
  costura: "Costura",
  despacho: "Produto despachado",
};
export function FormField({
  field,
  register,
  companyId,
  defaultValue,
}: {
  field: Field;
  register: UseFormRegister<FieldValues>;
  companyId?: string;
  defaultValue?: unknown;
}) {
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]),
    [search, setSearch] = useState(""),
    [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null),
    [hasMore, setHasMore] = useState(false);
  useEffect(() => {
    if (!field.collection || !companyId) return;
    let valid = true;
    const s = search.toLowerCase();
    getDocs(
      query(
        collection(db, `companies/${companyId}/${field.collection}`),
        where("active", "==", true),
        orderBy("searchName"),
        ...(s
          ? [
              where("searchName", ">=", s),
              where("searchName", "<=", s + "\uf8ff"),
            ]
          : []),
        limit(50),
      ),
    )
      .then((r) => {
        if (valid) {
          setOptions(r.docs.map((d) => ({ id: d.id, name: d.get("name") })));
          setCursor(r.docs.at(-1) ?? null);
          setHasMore(r.size === 50);
        }
      })
      .catch(() => setOptions([]));
    return () => {
      valid = false;
    };
  }, [field.collection, companyId, search]);
  const loadMore = async () => {
    if (!cursor) return;
    const r = await getDocs(
      query(
        collection(db, `companies/${companyId}/${field.collection}`),
        where("active", "==", true),
        orderBy("searchName"),
        ...(search
          ? [
              where("searchName", ">=", search.toLowerCase()),
              where("searchName", "<=", search.toLowerCase() + "\uf8ff"),
            ]
          : []),
        startAfter(cursor),
        limit(50),
      ),
    );
    setOptions((old) => [
      ...old,
      ...r.docs.map((d) => ({ id: d.id, name: d.get("name") })),
    ]);
    setCursor(r.docs.at(-1) ?? null);
    setHasMore(r.size === 50);
  };
  const props = register(field.key, {
    required: field.required,
    valueAsNumber: field.type === "number",
  });
  return (
    <div className={field.type === "textarea" ? "field wide" : "field"}>
      <label htmlFor={field.key}>
        {field.label}
        {field.required && <span className="required"> *</span>}
      </label>
      {field.collection && (
        <input
          aria-label={`Pesquisar ${field.label}`}
          placeholder="Pesquisar opções…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="option-search"
        />
      )}
      {field.type === "textarea" ? (
        <textarea id={field.key} rows={3} {...props} />
      ) : field.type === "select" || field.type === "multi" ? (
        <select id={field.key} multiple={field.type === "multi"} {...props}>
          <option value="">Selecione</option>
          {typeof defaultValue === "string" &&
            defaultValue &&
            !options.some((o) => o.id === defaultValue) &&
            !field.options?.includes(defaultValue) && (
              <option value={defaultValue}>{defaultValue}</option>
            )}
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {optionLabels[o] ?? o}
            </option>
          ))}
          {options.map((o) => (
            <option
              key={o.id}
              value={
                field.key.endsWith("Id") || field.key.endsWith("Ids")
                  ? o.id
                  : o.name
              }
            >
              {o.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={field.key}
          type={field.type ?? "text"}
          step={field.type === "number" ? "0.001" : undefined}
          {...props}
        />
      )}
      {hasMore && (
        <button type="button" className="text-link" onClick={loadMore}>
          Carregar mais opções
        </button>
      )}
    </div>
  );
}
