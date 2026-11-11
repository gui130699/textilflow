export function csv(headers: string[], rows: unknown[][]) {
  const cell = (v: unknown) => {
    let text = String(v ?? "");
    if (/^[\s]*[=+@\-\t\r]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [headers, ...rows].map((row) => row.map(cell).join(";")).join("\r\n");
}
