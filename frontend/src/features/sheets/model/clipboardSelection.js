/** Sheet order determines output order; empty and multiline cells remain explicit. */
export function buildClipboardSelection(rows, columns, selected, format = 'tsv') {
  const chosenRows = rows.filter((row) => columns.some((column) => selected.has(`${row.row_number}:${column.key}`)));
  const quote = (value) => (/[\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const values = chosenRows.map((row) =>
    columns.map((column) =>
      selected.has(`${row.row_number}:${column.key}`) ? String(row.cells[column.index] ?? '') : ''
    )
  );
  return {
    rowCount: chosenRows.length,
    text: values
      .map((cells) => cells.map((cell) => (format === 'tsv' ? quote(cell) : cell)).join(format === 'tsv' ? '\t' : '\n'))
      .join('\n'),
    columns: columns.map((column) => column.label),
  };
}
