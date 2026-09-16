"use client";
import { useState } from "react";
import Papa from "papaparse";
import Link from "next/link";
import { Upload } from "lucide-react";
import { csvRows } from "@/lib/lead-actions";
import { newLead, type Lead } from "@/lib/model";
import { duplicate } from "@/lib/utils";
import { useWorkspace, useTask } from "./workspace";
import { PageHeading, ErrorText } from "./ui";
type Preview = ReturnType<typeof csvRows>[number] & { existing?: Lead };
export function CsvImport() {
  const { leads, command } = useWorkspace();
  const task = useTask();
  const [rows, setRows] = useState<Preview[]>([]);
  const [done, setDone] = useState<
    Record<number, { ok: boolean; message: string }>
  >({});
  const [progress, setProgress] = useState("");
  return (
    <>
      <PageHeading
        title="Porta qui la tua lista."
        description="Controlla l’anteprima prima di importare. I duplicati vengono riconosciuti automaticamente."
      />
      <div className="panel">
        <label className="upload-zone">
          <Upload size={32} />
          <strong>Scegli un file CSV</strong>
          <span>
            Massimo 200 righe · 1 MB · separatore virgola o punto e virgola
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={task.busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setRows([]);
              setDone({});
              setProgress("");
              void task.run(async () => {
                if (file.size > 1_000_000)
                  throw new Error("File troppo grande (massimo 1 MB)");
                const text = await file.text();
                const parsed = Papa.parse<Record<string, string>>(text, {
                  header: true,
                  skipEmptyLines: "greedy",
                  transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
                });
                if (parsed.errors.length)
                  throw new Error(
                    `CSV non valido: ${parsed.errors[0].message}`,
                  );
                if (parsed.data.length > 200)
                  throw new Error("Massimo 200 righe per import");
                const seen = [...leads];
                setRows(
                  csvRows(parsed.data).map((row) => {
                    if (!row.data) return row;
                    const lead = newLead(row.data);
                    const existing = duplicate(lead, seen);
                    seen.push(lead);
                    return { ...row, existing };
                  }),
                );
              });
            }}
          />
        </label>
        <p className="muted">
          Colonne:{" "}
          <code>
            name, city, category, phone, website_url, facebook_url,
            instagram_url, menu_url, notes
          </code>
          . Nome, città e categoria sono obbligatori.
        </p>
        <a href="/example-leads.csv" download className="text-link">
          Scarica CSV di esempio
        </a>
        <ErrorText text={task.error} />
        {rows.length > 0 && (
          <>
            <div className="section-heading">
              <h2>Anteprima · {rows.length} righe</h2>
              <span>{rows.filter((r) => !r.data).length} errori</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Riga</th>
                    <th>Nome</th>
                    <th>Città</th>
                    <th>Esito</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.data?.name || "—"}</td>
                      <td>{r.data?.city || "—"}</td>
                      <td>
                        {r.error ||
                          (r.existing
                            ? `Lead già presente · ${r.existing.status}`
                            : "Pronto")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <button
                disabled={
                  task.busy ||
                  rows.some((r) => !r.data) ||
                  rows.every((r) => done[r.row]?.ok)
                }
                className="button"
                onClick={() =>
                  void task.run(async () => {
                    const report = { ...done };
                    const pending = rows.filter(
                      (row) => row.data && !done[row.row]?.ok,
                    );
                    for (let i = 0; i < pending.length; i += 10) {
                      const batch = pending.slice(i, i + 10);
                      setProgress(
                        `Import ${Math.min(i + 10, pending.length)}/${pending.length}`,
                      );
                      try {
                        const result = await command(
                          "import",
                          batch.map((row) => row.data),
                        );
                        let successIndex = 0;
                        batch.forEach((row, index) => {
                          const error = result.importErrors?.find(
                            (item) => item.index === index,
                          );
                          const saved = error
                            ? undefined
                            : result.results?.[successIndex++];
                          report[row.row] = {
                            ok: !!saved,
                            message: `${row.data!.name}: ${error?.error || (saved ? (saved.duplicate ? "già presente" : "importato") : "Salvataggio non confermato")}`,
                          };
                        });
                      } catch (e) {
                        for (const row of batch)
                          report[row.row] = {
                            ok: false,
                            message: `${row.data!.name}: ${e instanceof Error ? e.message : "errore"}`,
                          };
                        // Keep unattempted rows available for the next click.
                        setDone({ ...report });
                        break;
                      }
                      setDone({ ...report });
                    }
                    const saved = Object.values(report).filter(
                      (row) => row.ok,
                    ).length;
                    setProgress(
                      saved === rows.length
                        ? "Import completato. Apri le schede per analizzare i siti."
                        : `${saved} righe completate su ${rows.length}. Puoi riprovare le righe rimanenti.`,
                    );
                  })
                }
              >
                {task.busy
                  ? progress
                  : Object.keys(done).length
                    ? "Riprova righe rimanenti"
                    : "Conferma import"}
              </button>
              <span className="muted">
                Correggi gli errori nel CSV prima di confermare.
              </span>
            </div>
          </>
        )}
        {Object.keys(done).length > 0 && (
          <div className="note" aria-live="polite">
            <strong>{progress}</strong>
            <ul>
              {Object.values(done).map((d, i) => (
                <li key={i}>{d.message}</li>
              ))}
            </ul>
            <Link href="/leads">Vai ai lead →</Link>
          </div>
        )}
      </div>
    </>
  );
}
