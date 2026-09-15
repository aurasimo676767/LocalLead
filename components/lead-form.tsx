"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { categories, type Lead } from "@/lib/model";
import { inputSchema } from "@/lib/validation";
import { useWorkspace, useTask } from "./workspace";
import { PageHeading, Field, ErrorText } from "./ui";
export function LeadForm({
  lead,
  onSaved,
}: {
  lead?: Lead;
  onSaved?: () => void;
}) {
  const { command, notify } = useWorkspace();
  const router = useRouter();
  const task = useTask();
  const [form, setForm] = useState({
    name: lead?.name || "",
    city: lead?.city || "",
    category: lead?.category || "Pizzeria",
    address: lead?.address || "",
    phone: lead?.phone || "",
    website_url: lead?.is_demo ? "" : lead?.website_url || "",
    facebook_url: lead?.is_demo ? "" : lead?.facebook_url || "",
    instagram_url: lead?.instagram_url || "",
    menu_url: lead?.is_demo ? "" : lead?.menu_url || "",
    notes: lead?.notes || "",
  });
  function field(
    key: keyof typeof form,
    label: string,
    placeholder = "",
    type = "text",
  ) {
    return (
      <Field label={label}>
        <input
          type={type}
          required={key === "name" || key === "city"}
          placeholder={placeholder}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      </Field>
    );
  }
  return (
    <>
      {!lead && (
        <PageHeading
          title="Un nuovo punto di partenza."
          description="Aggiungi un’attività e i link che hai verificato. Puoi completarli in seguito."
        />
      )}
      <form
        className="panel editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(async () => {
            const data = inputSchema.parse(form);
            const result = await command(
              lead ? "patch" : "create",
              data,
              lead?.id,
            );
            if (result.lead) {
              if (result.duplicate) {
                notify("Lead già presente: aperta la scheda esistente");
                router.push(`/leads/${result.lead.id}`);
                return;
              }
              if (!lead) {
                router.push(`/leads/${result.lead.id}`);
                try {
                  await command("analyze", undefined, result.lead.id);
                } catch (err) {
                  notify(
                    err instanceof Error
                      ? err.message
                      : "Analisi da riprovare dalla scheda",
                  );
                }
              } else {
                notify("Informazioni salvate");
                onSaved?.();
              }
            }
          });
        }}
      >
        <div className="form-grid">
          {field("name", "Nome attività", "Es. La tua pizzeria")}
          {field("city", "Città", "Vittoria, RG")}
          <Field label="Categoria">
            <select
              value={form.category}
              onChange={(e) =>
                setForm({
                  ...form,
                  category: e.target.value as Lead["category"],
                })
              }
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          {field("address", "Indirizzo", "Via e numero civico")}
          {field("phone", "Telefono pubblico", "+39 …", "tel")}
          {field("website_url", "Sito ufficiale", "https://…", "url")}
          {field(
            "facebook_url",
            "Pagina Facebook",
            "https://www.facebook.com/…",
            "url",
          )}
          {field(
            "instagram_url",
            "Instagram",
            "https://www.instagram.com/…",
            "url",
          )}
          {field("menu_url", "Menu online", "https://…", "url")}
        </div>
        <Field label="Note">
          <textarea
            rows={4}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        <ErrorText text={task.error} />
        <button className="button" disabled={task.busy}>
          {task.busy
            ? "Salvataggio…"
            : lead
              ? "Salva informazioni"
              : "Analizza lead"}
        </button>
      </form>
    </>
  );
}
