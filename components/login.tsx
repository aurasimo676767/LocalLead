"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sprout, ArrowRight } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Field, ErrorText } from "./ui";
export function Login({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  return (
    <div className="login-page">
      <div className="login-story">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">
            <Sprout size={24} />
          </span>
          locallead.
        </Link>
        <div>
          <p className="eyebrow">LE PERSONE, PRIMA DEI NUMERI.</p>
          <h1>
            Un buon motivo
            <br />
            per dire ciao.
          </h1>
          <p>
            Scopri le attività della tua zona.
            <br />
            Riconosci le opportunità. Inizia una conversazione.
          </p>
        </div>
        <span>Il tuo prossimo progetto potrebbe essere dietro l’angolo.</span>
      </div>
      <div className="login-form">
        <h2>{signup ? "Crea il tuo spazio." : "Bentornato."}</h2>
        <p className="muted">
          {demo
            ? "La modalità demo è pronta, anche senza account."
            : "Accedi al tuo workspace personale."}
        </p>
        {demo ? (
          <Link className="button full" href="/dashboard">
            Entra nella demo <ArrowRight size={18} />
          </Link>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              setNotice("");
              try {
                const db = supabaseBrowser();
                const result = signup
                  ? await db.auth.signUp({
                      email,
                      password,
                      options: {
                        emailRedirectTo: `${window.location.origin}/auth/callback`,
                      },
                    })
                  : await db.auth.signInWithPassword({ email, password });
                if (result.error) throw result.error;
                if (signup && !result.data.session)
                  setNotice(
                    "Controlla la tua email e conferma la registrazione.",
                  );
                else {
                  router.push("/dashboard");
                  router.refresh();
                }
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Accesso non riuscito",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Email">
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <ErrorText text={error} />
            {notice && <div className="note">{notice}</div>}
            <button className="button full" disabled={busy}>
              {busy ? "Attendi…" : signup ? "Registrati" : "Accedi"}
              <ArrowRight size={17} />
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setSignup(!signup);
                setError("");
                setNotice("");
              }}
            >
              {signup
                ? "Hai già un account? Accedi"
                : "Prima volta? Crea un account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
