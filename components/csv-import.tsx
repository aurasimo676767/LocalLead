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
  const [done, setDone] = useState<string[]>([]);
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
              setDone([]);
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
                  task.busy || rows.some((r) => !r.data) || done.length > 0
                }
                className="button"
                onClick={() =>
                  void task.run(async () => {
                    const report: string[] = [];
                    for (let i = 0; i < rows.length; i++) {
                      const r = rows[i];
                      if (!r.data) continue;
                      setProgress(`Import ${i + 1}/${rows.length}`);
                      try {
                        const result = await command("create", r.data);
                        report.push(
                          `${r.data.name}: ${result.duplicate ? "già presente" : "importato"}`,
                        );
                      } catch (e) {
                        report.push(
                          `${r.data.name}: ${e instanceof Error ? e.message : "errore"}`,
                        );
                      }
                      setDone([...report]);
                    }
                    setProgress(
                      "Import completato. Apri le schede per analizzare i siti.",
                    );
                  })
                }
              >
                {task.busy ? progress : "Conferma import"}
              </button>
              <span className="muted">
                Correggi gli errori nel CSV prima di confermare.
              </span>
            </div>
          </>
        )}
        {done.length > 0 && (
          <div className="note">
            <strong>{progress}</strong>
            <ul>
              {done.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
            <Link href="/leads">Vai ai lead →</Link>
          </div>
        )}
      </div>
    </>
  );
}
