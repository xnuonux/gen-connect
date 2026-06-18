import { type ReactNode } from "react";

// a small, dependency-free markdown renderer tuned for what gen actually emits:
// gfm tables (the draft scorecards), bold/italic/code, headings, hr, lists, and
// paragraphs ... all styled to the lunari tokens so a gen reply reads like the
// product, not raw "| name | role |" text. resilient to partial input (mid-stream
// a half-formed table just renders as text until its separator row arrives).

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(
        <strong key={`${keyBase}-b${k}`} className="font-semibold text-lunari-cream">
          {m[2]}
        </strong>,
      );
    } else if (m[3] !== undefined) {
      nodes.push(
        <code
          key={`${keyBase}-c${k}`}
          className="rounded bg-lunari-surface-elevated px-1 py-0.5 font-mono text-[12px] text-lunari-cream/90"
        >
          {m[3]}
        </code>,
      );
    } else if (m[4] !== undefined) {
      nodes.push(
        <em key={`${keyBase}-i${k}`} className="italic text-lunari-cream/90">
          {m[4]}
        </em>,
      );
    }
    last = re.lastIndex;
    k += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const isTableLine = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l: string) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes("-");
const isHr = (l: string) => /^\s*(-{3,}|\.{3,}|\*{3,}|_{3,})\s*$/.test(l);
const headingOf = (l: string) => /^(#{1,4})\s+(.*)$/.exec(l);
const bulletOf = (l: string) => /^\s*[-*+]\s+(.*)$/.exec(l);
const orderedOf = (l: string) => /^\s*\d+\.\s+(.*)$/.exec(l);

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // blank line ... skip.
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // code fence.
    if (/^\s*```/.test(line)) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i] ?? "")) {
        buf.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // closing fence
      blocks.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-md border border-lunari-surface-elevated bg-lunari-black/50 px-3 py-2 font-mono text-[12px] leading-relaxed text-lunari-cream/90"
        >
          {buf.join("\n")}
        </pre>,
      );
      continue;
    }

    // table ... a pipe row immediately followed by a separator row.
    if (isTableLine(line) && i + 1 < lines.length && isTableSep(lines[i + 1] ?? "")) {
      const header = splitRow(line);
      i += 2; // header + separator
      const rows: string[][] = [];
      while (i < lines.length && isTableLine(lines[i] ?? "")) {
        rows.push(splitRow(lines[i] ?? ""));
        i += 1;
      }
      blocks.push(
        <div
          key={key++}
          className="overflow-x-auto rounded-md border border-lunari-surface-elevated"
        >
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {header.map((h, hi) => (
                  <th
                    key={hi}
                    className="border-b border-lunari-surface-elevated bg-lunari-surface/60 px-2.5 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-lunari-neutral-400"
                  >
                    {renderInline(h, `th${key}-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-lunari-surface-elevated/50 last:border-0">
                  {r.map((c, ci) => (
                    <td
                      key={ci}
                      className="px-2.5 py-1.5 align-top text-lunari-cream/85"
                    >
                      {renderInline(c, `td${key}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // horizontal rule.
    if (isHr(line)) {
      blocks.push(
        <hr key={key++} className="border-0 border-t border-lunari-surface-elevated" />,
      );
      i += 1;
      continue;
    }

    // heading.
    const h = headingOf(line);
    if (h) {
      const level = (h[1] ?? "#").length;
      const content = h[2] ?? "";
      blocks.push(
        <div
          key={key++}
          className={
            level <= 2
              ? "text-sm font-semibold text-lunari-cream"
              : "font-mono text-[11px] uppercase tracking-[0.15em] text-lunari-neutral-400"
          }
        >
          {renderInline(content, `h${key}`)}
        </div>,
      );
      i += 1;
      continue;
    }

    // list (unordered or ordered) ... collect the run.
    if (bulletOf(line) || orderedOf(line)) {
      const items: string[] = [];
      const ordered = !!orderedOf(line);
      while (i < lines.length) {
        const b = bulletOf(lines[i] ?? "");
        const o = orderedOf(lines[i] ?? "");
        if (!b && !o) break;
        items.push((b?.[1] ?? o?.[1]) ?? "");
        i += 1;
      }
      blocks.push(
        <ul key={key++} className="space-y-1 pl-1">
          {items.map((it, ii) => (
            <li key={ii} className="flex gap-2 text-lunari-cream/90">
              <span className="mt-[2px] shrink-0 font-mono text-[11px] text-lunari-neutral-500">
                {ordered ? `${ii + 1}.` : "·"}
              </span>
              <span>{renderInline(it, `li${key}-${ii}`)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // paragraph ... collect consecutive plain lines.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (
        l.trim() === "" ||
        /^\s*```/.test(l) ||
        isHr(l) ||
        headingOf(l) ||
        bulletOf(l) ||
        orderedOf(l) ||
        (isTableLine(l) && isTableSep(lines[i + 1] ?? ""))
      ) {
        break;
      }
      para.push(l);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="leading-relaxed text-lunari-cream/90">
        {renderInline(para.join("\n"), `p${key}`)}
      </p>,
    );
  }

  return <div className="space-y-2.5 text-sm">{blocks}</div>;
}
