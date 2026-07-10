// Vendored tiny CSV parser (T24: tiny utilities live here, never installed).
// Handles: header row, quoted fields, embedded commas/newlines, escaped quotes, CRLF, blank lines.
// G1: runtime-agnostic.

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      // swallow; \n handles the row break
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  const [header, ...data] = rows;
  if (!header) return [];
  return data.map((cells) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h.trim()] = cells[idx] ?? "";
    });
    return obj;
  });
}
