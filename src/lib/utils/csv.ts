// a small, dependency-free CSV parser (RFC4180-ish). handles quoted fields with
// commas + newlines inside them, "" escaped quotes, and CRLF/CR line endings.
// pure + deterministic, fixture-tested. used by the pipeline csv import.

function parseRecords(text: string): string[][] {
  const out: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // flush a trailing field/row when the text doesn't end in a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  return out;
}

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

// parse to a header row + an array of {header: value} objects. blank lines are
// skipped. ragged rows are tolerated (missing cells = "").
export function parseCsv(text: string): ParsedCsv {
  const records = parseRecords(text);
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = (records[0] ?? []).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < records.length; i++) {
    const rec = records[i] ?? [];
    // skip a fully-blank line
    if (rec.length === 0 || (rec.length === 1 && (rec[0] ?? "").trim() === "")) {
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = (rec[j] ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

// guess which header maps to each contact field. case-insensitive substring
// match on the header name. returns the best header per field, or "" if none.
export type ColumnMap = {
  name: string;
  email: string;
  company: string;
  title: string;
};

export function autoMapColumns(headers: string[]): ColumnMap {
  const find = (res: RegExp[]): string =>
    headers.find((h) => res.some((re) => re.test(h))) ?? "";
  return {
    email: find([/e-?mail/i]),
    name: find([/full.?name/i, /^name$/i, /contact|person/i, /name/i]),
    company: find([/company|organization|organisation|employer|account/i]),
    title: find([/title|role|position|job/i]),
  };
}
