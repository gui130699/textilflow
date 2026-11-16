"use client";

import { number } from "@/lib/utils";
import { skuIndex, total } from "./model";

export function Grade({
  colors,
  sizes,
  quantities,
  leaves,
  available,
  hiddenColors = [],
  onChange,
  colorName,
  sizeName,
}: {
  colors: string[];
  sizes: string[];
  quantities: number[];
  leaves: number[];
  available?: number[];
  onChange?: (quantities: number[], leaves: number[]) => void;
  hiddenColors?: string[];
  colorName: (id: string) => string;
  sizeName: (id: string) => string;
}) {
  if (!colors.length || !sizes.length)
    return <p className="muted">Selecione a grade e as cores do item.</p>;
  const input = (
    value: number,
    label: string,
    change: (n: number) => void,
    max = 10000000,
  ) => (
    <input
      className="min-w-20"
      type="number"
      step={1}
      min={0}
      max={max}
      aria-label={label}
      value={value}
      onChange={(e) => change(Number(e.target.value))}
    />
  );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Cor</th>
            {sizes.map((id) => (
              <th scope="col" key={id}>
                {sizeName(id)}
              </th>
            ))}
            <th scope="col">Peças</th>
            <th scope="col">Folhas</th>
          </tr>
        </thead>
        <tbody>
          {colors.map((id, row) =>
            hiddenColors.includes(id) ? null : (
              <tr key={id}>
                <th scope="row">{colorName(id)}</th>
                {sizes.map((size, col) => {
                  const i = skuIndex(row, col, sizes);
                  return (
                    <td key={size}>
                      {onChange ? (
                        <>
                          {input(
                            quantities[i],
                            `Peças ${colorName(id)} ${sizeName(size)}`,
                            (n) => onChange(quantities.with(i, n), leaves),
                            available?.[i],
                          )}
                          {available && (
                            <small className="muted block">
                              {number(available[i])} disponíveis
                            </small>
                          )}
                        </>
                      ) : (
                        number(quantities[i])
                      )}
                    </td>
                  );
                })}
                <td>
                  {number(
                    total(
                      quantities.slice(
                        row * sizes.length,
                        (row + 1) * sizes.length,
                      ),
                    ),
                  )}
                </td>
                <td>
                  {onChange
                    ? input(leaves[row], `Folhas ${colorName(id)}`, (n) =>
                        onChange(quantities, leaves.with(row, n)),
                      )
                    : number(leaves[row])}
                </td>
              </tr>
            ),
          )}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            {sizes.map((id, col) => (
              <td key={id}>
                {number(
                  total(
                    colors.map((color, row) =>
                      hiddenColors.includes(color)
                        ? 0
                        : quantities[skuIndex(row, col, sizes)],
                    ),
                  ),
                )}
              </td>
            ))}
            <td>
              {number(
                total(
                  quantities.filter(
                    (_, i) =>
                      !hiddenColors.includes(
                        colors[Math.floor(i / sizes.length)],
                      ),
                  ),
                ),
              )}
            </td>
            <td>
              {number(
                total(
                  leaves.filter((_, i) => !hiddenColors.includes(colors[i])),
                ),
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
