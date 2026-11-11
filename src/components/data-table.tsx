"use client";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Row } from "@/types";
export function DataTable({
  rows,
  columns,
  onRow,
}: {
  rows: Row[];
  columns: ColumnDef<Row>[];
  onRow?: (row: Row) => void;
}) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <div className="table-scroll">
      <table>
        <thead>
          {table.getHeaderGroups().map((g) => (
            <tr key={g.id}>
              {g.headers.map((h) => (
                <th key={h.id}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id}>
              {r.getVisibleCells().map((c, i) => (
                <td key={c.id}>
                  {i === 0 && onRow ? (
                    <button
                      className="table-link"
                      onClick={() => onRow(r.original)}
                    >
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </button>
                  ) : (
                    flexRender(c.column.columnDef.cell, c.getContext())
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty">
          <strong>Nenhum registro encontrado</strong>
          <p>Cadastre o primeiro registro ou ajuste os filtros.</p>
        </div>
      )}
    </div>
  );
}
