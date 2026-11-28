export interface ExportRow {
  id: string;
  title: string;
  status: string;
  reason: string;
  url?: string;
}
const headers: (keyof ExportRow)[] = ['id', 'title', 'status', 'reason', 'url'];
export function resultsCsv(rows: ExportRow[]): string {
  const cell = (value: string) => {
    // Neutralize spreadsheet formulas, including leading whitespace/control characters.
    const firstVisible = Array.from(value).find((ch) => ch.charCodeAt(0) > 32 && !/\s/.test(ch));
    const safe = firstVisible && ['=', '+', '@', '-'].includes(firstVisible) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return (
    '\ufeff' +
    [headers.map(cell).join(','), ...rows.map((row) => headers.map((key) => cell(row[key] || '')).join(','))].join(
      '\r\n'
    )
  );
}
export function downloadResults(filename: string, rows: ExportRow[], format: 'csv' | 'json') {
  const content = format === 'csv' ? resultsCsv(rows) : JSON.stringify(rows, null, 2);
  const url = URL.createObjectURL(
    new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' })
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename.replace(/[^\w-]/g, '_')}.${format}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
