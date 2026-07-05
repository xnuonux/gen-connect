"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, X, Loader2, FileUp } from "lucide-react";
import {
  parseCsv,
  autoMapColumns,
  type ColumnMap,
} from "@/lib/utils/csv";
import { importContactsAction } from "@/app/actions/import";

type Parsed = { headers: string[]; rows: Record<string, string>[] };

const FIELDS: { key: keyof ColumnMap; label: string; required: boolean }[] = [
  { key: "email", label: "email", required: true },
  { key: "name", label: "name", required: true },
  { key: "company", label: "company", required: false },
  { key: "title", label: "title", required: false },
];

export function CsvImportDialog() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [importing, setImporting] = useState(false);

  function reset() {
    setParsed(null);
    setMap(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }
  function close() {
    setOpen(false);
    reset();
  }

  async function onFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("that file's over 10mb ... trim it down and try again.");
      return;
    }
    try {
      const text = await file.text();
      const p = parseCsv(text);
      if (p.headers.length === 0 || p.rows.length === 0) {
        toast.error("couldn't find any rows in that csv.");
        return;
      }
      setFileName(file.name);
      setParsed(p);
      setMap(autoMapColumns(p.headers));
    } catch {
      toast.error("couldn't read that file ... is it a csv?");
    }
  }

  async function runImport() {
    if (!parsed || !map || !map.email || !map.name) return;
    setImporting(true);
    const rows = parsed.rows.map((r) => ({
      name: map.name ? r[map.name] : "",
      email: map.email ? r[map.email] : "",
      company_name: map.company ? r[map.company] : null,
      title: map.title ? r[map.title] : null,
    }));
    const res = await importContactsAction({ rows });
    setImporting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      `loaded ${res.loaded} into cold${res.skipped ? ` ... ${res.skipped} skipped (dupes or missing email)` : ""}.`,
    );
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
    router.refresh();
    close();
  }

  const preview = parsed && map?.name && map?.email ? parsed.rows.slice(0, 3) : [];
  const canImport = !!(parsed && map?.email && map?.name) && !importing;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="planetarium inline-flex items-center gap-1.5 rounded-md border border-lunari-surface-elevated bg-lunari-surface px-3 py-1.5 text-xs text-lunari-cream/80 hover:bg-lunari-surface-elevated hover:text-lunari-cream"
      >
        <Upload className="h-4 w-4 stroke-[1.25]" />
        <span>import csv</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            aria-label="close"
            onClick={close}
            className="absolute inset-0 cursor-default bg-lunari-black/60"
          />
          <div className="planetarium relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-lunari-surface-elevated bg-lunari-surface shadow-2xl shadow-black/70">
            <header className="flex items-center justify-between border-b border-lunari-surface-elevated px-5 py-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
                import csv
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="close"
                className="planetarium flex h-7 w-7 items-center justify-center rounded-md text-lunari-neutral-400 hover:bg-lunari-surface-elevated hover:text-lunari-cream"
              >
                <X className="h-4 w-4 stroke-[1.25]" />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />

              {!parsed ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="planetarium flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-lunari-surface-elevated px-4 py-10 text-center hover:border-gen-accent/50 hover:bg-lunari-surface-elevated/40"
                >
                  <FileUp className="h-6 w-6 stroke-[1.25] text-lunari-neutral-400" />
                  <span className="text-sm text-lunari-cream">
                    choose a csv to import
                  </span>
                  <span className="text-xs text-lunari-neutral-500">
                    name + email required ... they land cold, ready to enrich.
                  </span>
                </button>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-lunari-cream/80">{fileName}</span>
                    <button
                      type="button"
                      onClick={reset}
                      className="text-lunari-neutral-500 hover:text-lunari-cream"
                    >
                      pick another
                    </button>
                  </div>

                  <div className="space-y-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
                      map columns
                    </span>
                    {FIELDS.map((f) => (
                      <div key={f.key} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-xs text-lunari-cream/80">
                          {f.label}
                          {f.required ? (
                            <span className="text-gen-accent"> *</span>
                          ) : null}
                        </span>
                        <select
                          value={map?.[f.key] ?? ""}
                          onChange={(e) =>
                            setMap((m) =>
                              m ? { ...m, [f.key]: e.target.value } : m,
                            )
                          }
                          className="min-w-0 flex-1 rounded-md border border-lunari-surface-elevated bg-lunari-black px-2 py-1.5 text-xs text-lunari-cream/90 focus:outline-none"
                        >
                          <option value="">(none)</option>
                          {parsed.headers.map((h) => (
                            <option key={h} value={h} className="bg-lunari-surface">
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md border border-lunari-surface-elevated bg-lunari-black/40 px-3 py-2.5">
                    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-500">
                      {parsed.rows.length} rows · preview
                    </div>
                    {preview.length > 0 && map ? (
                      <ul className="space-y-0.5 text-xs text-lunari-cream/80">
                        {preview.map((r, i) => (
                          <li key={i} className="truncate">
                            {(map.name && r[map.name]) || "?"}{" "}
                            <span className="text-lunari-neutral-500">
                              {(map.email && r[map.email]) || "no email"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-lunari-neutral-500">
                        map name + email to preview.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {parsed ? (
              <footer className="border-t border-lunari-surface-elevated p-4">
                <button
                  type="button"
                  disabled={!canImport}
                  onClick={() => void runImport()}
                  className="planetarium flex w-full items-center justify-center gap-1.5 rounded-md border border-gen-accent/40 bg-gen-accent-soft px-3 py-2 text-sm font-medium text-gen-accent hover:bg-gen-accent/20 disabled:opacity-50"
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin stroke-[1.5]" />
                  ) : (
                    <Upload className="h-4 w-4 stroke-[1.25]" />
                  )}
                  <span>
                    {importing
                      ? "importing ..."
                      : `import ${parsed.rows.length} contacts`}
                  </span>
                </button>
              </footer>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
