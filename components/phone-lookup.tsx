"use client";
import { useState } from "react";
import Link from "next/link";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import { useWorkspace } from "./workspace";
import { PageHeading, Score, Status } from "./ui";
import { findByPhone, phoneQueryDigits } from "@/lib/utils";
import { statusLabels } from "@/lib/model";

const date = (value: string) =>
  new Date(value).toLocaleString("it-IT", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Who wrote back? Type the number, see which venue it was. */
export function PhoneLookup() {
  const { leads } = useWorkspace();
  const [value, setValue] = useState("");
  const found = findByPhone(value, leads);
  const exact = found.filter(
    (l) => l.phone.replace(/\D/g, "") === phoneQueryDigits(value),
  );
  return (
    <>
      <PageHeading
        title="Chi ti ha risposto?"
        description="Scrivi il numero da cui ti hanno scritto e trovi subito il locale, la città e cosa gli avevi mandato."
      />
      <label className="phone-search">
        <span className="phone-prefix">
          <Phone size={18} /> +39
        </span>
        <input
          autoFocus
          type="tel"
          inputMode="tel"
          aria-label="Numero di telefono"
          placeholder="333 123 4567"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      {phoneQueryDigits(value).length >= 5 && (
        <p className="result-count">
          {!found.length
            ? "Nessun locale con questo numero tra i tuoi lead."
            : exact.length
              ? exact.length === 1
                ? "Trovato."
                : `${exact.length} locali con questo numero.`
              : `${found.length} ${found.length === 1 ? "numero contiene" : "numeri contengono"} queste cifre.`}
        </p>
      )}
      <div className="phone-results">
        {found.slice(0, 20).map((l) => {
          const contact = [...l.events]
            .reverse()
            .find((e) => e.event_type === "contacted");
          const message = l.messages.at(-1);
          return (
            <article className="panel phone-result" key={l.id}>
              <div className="phone-result-head">
                <Score value={l.lead_score} />
                <div>
                  <h2>
                    <Link href={`/leads/${l.id}`}>{l.name}</Link>
                  </h2>
                  <p>
                    <strong>{l.category}</strong> a <strong>{l.city}</strong>
                    {l.address && (
                      <>
                        <br />
                        <MapPin size={13} /> {l.address}
                      </>
                    )}
                  </p>
                </div>
                <Status lead={l} />
              </div>
              <dl className="phone-facts">
                <div>
                  <dt>Numero</dt>
                  <dd>{l.phone}</dd>
                </div>
                <div>
                  <dt>Contattato</dt>
                  <dd>
                    {contact
                      ? `${date(contact.created_at)}${contact.channel ? ` su ${contact.channel}` : ""}`
                      : l.status === "new"
                        ? "Non ancora"
                        : statusLabels[l.status]}
                  </dd>
                </div>
                <div>
                  <dt>Motivo</dt>
                  <dd>{l.main_problem}</dd>
                </div>
              </dl>
              {message && (
                <div className="phone-message">
                  <small>
                    <MessageCircle size={13} /> Ultimo messaggio preparato,{" "}
                    {date(message.created_at)}
                  </small>
                  <p>{message.text}</p>
                </div>
              )}
              {contact?.notes && <p className="muted">Note: {contact.notes}</p>}
              <Link className="button" href={`/leads/${l.id}`}>
                Apri la scheda del locale
              </Link>
            </article>
          );
        })}
      </div>
    </>
  );
}
