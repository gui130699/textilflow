"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { catalogs } from "@/config/catalogs";

const groups = [
  ["Pessoas e empresas", ["companies", "clients", "suppliers", "thirdParties"]],
  ["Ficha técnica", ["products", "materials", "models"]],
  ["Produção", ["sectors", "flows", "grades", "colors", "sizes"]],
  [
    "Cadastros auxiliares",
    ["units", "categories", "rejectionReasons", "inspectionTypes"],
  ],
] as const;

export default function Catalogs() {
  const [search, setSearch] = useState("");
  const normalize = (s: string) =>
    s
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  const term = normalize(search.trim());
  const sections = groups
    .map(([title, keys]) => ({
      title,
      keys: keys.filter((key) =>
        normalize(
          catalogs[key].label + " " + catalogs[key].description,
        ).includes(term),
      ),
    }))
    .filter(({ keys }) => keys.length);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Cadastros</h1>
          <p>Organize os dados usados nos pedidos e na produção.</p>
        </div>
      </div>
      <div className="search mb-6">
        <Search size={17} />
        <input
          aria-label="Buscar cadastros"
          placeholder="Buscar cadastros…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {sections.map(({ title, keys }) => {
        const cards = (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {keys.map((key) => (
              <Link
                key={key}
                href={`/cadastros/${key}`}
                className="panel flex min-h-28 items-start justify-between gap-3 p-5 hover:border-blue-500"
              >
                <div>
                  <strong>{catalogs[key].label}</strong>
                  <p className="muted mt-2">{catalogs[key].description}</p>
                </div>
                <ArrowUpRight size={17} />
              </Link>
            ))}
          </div>
        );
        return title === "Cadastros auxiliares" ? (
          <details className="mb-5" key={title} open={term ? true : undefined}>
            <summary className="mb-3 cursor-pointer font-semibold">
              {title}
            </summary>
            {cards}
          </details>
        ) : (
          <section className="mb-5" key={title}>
            <h2 className="mb-3">{title}</h2>
            {cards}
          </section>
        );
      })}
      {!sections.length && (
        <p className="panel p-5">Nenhum cadastro encontrado.</p>
      )}
    </>
  );
}
