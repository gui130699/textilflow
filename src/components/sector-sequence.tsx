"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Row } from "@/types";

export function SectorSequence({
  options,
  value,
  onChange,
  label = "Sequência de setores",
}: {
  options: Row[];
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
}) {
  const [selected, setSelected] = useState("");
  const name = (id: string) =>
    String(options.find((row) => row.id === id)?.name ?? id);
  function move(index: number, offset: number) {
    const next = [...value];
    const target = index + offset;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  return (
    <div className="wide space-y-2">
      <h3>{label}</h3>
      {value.length > 0 && (
        <ol className="space-y-2">
          {value.map((id, index) => (
            <li key={id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-32">
                {index + 1}. {name(id)}
              </span>
              <Button
                size="sm"
                variant="outline"
                type="button"
                aria-label={`Subir ${name(id)}`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                aria-label={`Descer ${name(id)}`}
                disabled={index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => onChange(value.filter((entry) => entry !== id))}
              >
                Remover {name(id)}
              </Button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Setor para adicionar"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Selecione um setor</option>
          {options
            .filter((row) => row.active && !value.includes(row.id))
            .map((row) => (
              <option key={row.id} value={row.id}>
                {name(row.id)}
              </option>
            ))}
        </select>
        <Button
          type="button"
          variant="outline"
          disabled={!selected || value.includes(selected) || value.length >= 12}
          onClick={() => {
            onChange([...value, selected]);
            setSelected("");
          }}
        >
          Adicionar setor
        </Button>
      </div>
    </div>
  );
}
