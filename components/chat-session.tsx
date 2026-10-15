"use client";
import { useCallback, useRef, useState } from "react";
import { Check, MessageCircle, X } from "lucide-react";
import { useWorkspace, useTask } from "./workspace";
import { useOverlay } from "./use-overlay";
import { ErrorText, Field } from "./ui";
import type { Lead } from "@/lib/model";
import { chatQueue, type Chat } from "@/lib/send-session";
import { runEach } from "@/lib/job-runner";

// WhatsApp needs a moment to switch chat before the next link arrives.
const settle = 1500;
/**
 * Prepares a batch of chats in the WhatsApp app: each click opens the next
 * lead with its draft typed in, and WhatsApp keeps every draft. The user then
 * goes through the chats and presses send. Nothing is sent from here.
 */
export function ChatSession({
  leads,
  onClose,
}: {
  leads: Lead[];
  onClose: () => void;
}) {
  const { command, notify } = useWorkspace();
  const task = useTask();
  const [size, setSize] = useState(20);
  // Fixed when the session starts: later edits to the list do not move it.
  const [queue, setQueue] = useState<Chat[] | null>(null);
  const [opened, setOpened] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    if (!task.busy) onClose();
  }, [task.busy, onClose]);
  useOverlay(true, dialog, close);
  const available = chatQueue(leads, Infinity).length;
  const next = queue?.[opened];
  const done = queue?.slice(0, opened) || [];
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-session-title"
        className="modal chat-session"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          data-overlay-close
          className="icon-btn modal-close"
          onClick={close}
          aria-label="Chiudi"
        >
          <X size={20} />
        </button>
        <MessageCircle size={30} />
        <h2 id="chat-session-title">Prepara le chat su WhatsApp.</h2>
        {!queue ? (
          <>
            <p>
              Ogni clic apre nell’app WhatsApp la chat del locale successivo,
              col messaggio già scritto. WhatsApp tiene la bozza in ogni chat:
              alla fine le scorri dalla lista e premi solo invio.
            </p>
            <Field label="Quante chat preparare">
              <select
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              >
                {[5, 10, 15, 20].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Field>
            <div className="note">
              Sono {available} i locali con bozza pronta e un cellulare, mai
              contattati. Tanti messaggi a sconosciuti in poco tempo possono
              far limitare il numero: meglio non superare 20–30 al giorno.
            </div>
            <div className="button-row">
              <button className="button secondary" onClick={close}>
                Annulla
              </button>
              <button
                className="button whatsapp"
                disabled={!available}
                onClick={() => setQueue(chatQueue(leads, size))}
              >
                <MessageCircle size={16} /> Inizia
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              {next
                ? `Chat ${opened + 1} di ${queue.length}. La prima volta il browser chiede se aprire WhatsApp: spunta “consenti sempre”.`
                : "Tutte le chat sono pronte su WhatsApp. Inviale, poi segna qui quelle che hai mandato."}
            </p>
            {next && (
              <a
                className={`button whatsapp full${waiting ? " disabled-link" : ""}`}
                href={next.url}
                aria-disabled={waiting}
                onClick={(event) => {
                  if (waiting) {
                    event.preventDefault();
                    return;
                  }
                  setOpened((n) => n + 1);
                  setSent((ids) => [...ids, next.id]);
                  setWaiting(true);
                  setTimeout(() => setWaiting(false), settle);
                }}
              >
                <MessageCircle size={16} /> Apri chat: {next.name}
              </a>
            )}
            {done.length > 0 && (
              <ul className="chat-session-list">
                {done.map((chat) => (
                  <li key={chat.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={sent.includes(chat.id)}
                        onChange={(e) =>
                          setSent((ids) =>
                            e.target.checked
                              ? [...ids, chat.id]
                              : ids.filter((id) => id !== chat.id),
                          )
                        }
                      />
                      {chat.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <ErrorText text={task.error} />
            <div className="button-row">
              <button className="button secondary" onClick={close}>
                Chiudi
              </button>
              <button
                className="button"
                disabled={!sent.length || task.busy}
                onClick={() =>
                  void task.run(async () => {
                    const failures = await runEach(sent, async (id) => {
                      await command(
                        "patch",
                        { status: "contacted", channel: "WhatsApp" },
                        id,
                      );
                    });
                    if (failures.length) {
                      // Only the ones still to mark stay ticked for a retry.
                      setSent(failures.map((f) => f.id));
                      throw new Error(
                        `${failures.length} non segnati: ${failures[0].error}`,
                      );
                    }
                    notify(
                      sent.length === 1
                        ? "1 locale segnato come contattato"
                        : `${sent.length} locali segnati come contattati`,
                    );
                    onClose();
                  })
                }
              >
                {task.busy ? <span className="spinner" /> : <Check size={16} />}
                Segna {sent.length} come contattati
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
