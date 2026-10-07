# Anteprima automatica del sito — Piano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per ogni lead contattabile l'app crea un'anteprima pubblica del sito, a un link segreto (dati veri, foto Google dal vivo, testi AI alla mano, barra con prezzo e "Mi interessa"). Il link entra nel primo messaggio.

**Architecture:** La logica pura sta in `lib/site-preview.ts` (link, contenuto pubblico, testi di riserva, controllo dei testi, bot). La persistenza è una tabella `site_previews` con RLS del proprietario e lettura anonima solo tramite la funzione `site_preview(slug, count)`. Il server crea l'anteprima quando scrive la bozza (`lib/previews.ts`). La pagina pubblica `app/s/[slug]` legge con la funzione e carica le foto da Google dal vivo.

**Tech Stack:** Next.js 16 App Router, Supabase (PGlite nei test), OpenAI Responses (`gpt-5.6-luna`), Google Places API (New), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-anteprima-sito-design.md`

## Global Constraints

- pnpm; dopo ogni task `pnpm lint` e `pnpm test`; alla fine `pnpm build`.
- Nessuna chiave service-role: lettura pubblica solo con la funzione `security definer` `site_preview`.
- Test offline: OpenAI, Google e rete sempre simulati. Prove dal vivo al massimo 2–3, alla fine (costo circa 0,1 centesimi ciascuna).
- Niente fatti inventati nei testi dell'anteprima: niente cifre, anni, superlativi, ingredienti, forni, viste, distanze, premi, recensioni.
- Link nel messaggio: una sola volta, dopo "date un'occhiata", senza emoji prima.
- La demo non chiama database né provider.
- Se la migrazione 003 non è eseguita, l'app funziona come prima, senza anteprime.
- Commenti in inglese, testi utente in italiano, stile del codice esistente.

## Review Focus

1. **Migrazione 003 non ancora eseguita su Supabase:** caricamento lead, bozze e scheda devono funzionare come prima, senza link. Test nel Task 3.
2. **Link scaduto, lead "non contattare" o chiuso:** la pagina pubblica non mostra dati. Test nel Task 2.
3. **Visita del proprietario o del generatore di anteprime di WhatsApp:** non conta. Test nei Task 1 e 2.
4. **Bozza dell'AI senza link, con il link due volte, con un'emoji subito prima o con un link inventato:** scartata. Test nel Task 4.
5. **Testo dell'anteprima con "dal 1985", "la pizza più buona" o "forno a legna":** scartato. Test nel Task 1.

---

### Task 1: Modulo puro dell'anteprima e preferenze

**Files:** Create `lib/site-preview.ts`, `tests/site-preview.test.ts`. Modify `lib/model.ts` (tipo `Lead.preview`, preferenze `sender_phone` e `site_price`).

**Produces:**
- `type SitePreview = { slug: string; views: number; last_viewed_at: string | null; expires_at: string }`
- `Lead.preview?: SitePreview | null`
- `Preferences.sender_phone: string` (default `""`), `Preferences.site_price: number` (default `200`)
- `type SiteCopy = { title: string; intro: string; offer: string; contact: string }`
- `type SiteContent = { name; category; sector; city; address; phone; hours: string[]; maps_url; menu_url; facebook_url; instagram_url; copy: SiteCopy }`
- `newSlug(): string` (12 caratteri `[a-z0-9]` da `crypto.getRandomValues`)
- `previewBase(): string` (`NEXT_PUBLIC_SITE_URL` o `NEXT_PUBLIC_APP_URL`, senza `/` finale)
- `previewUrl(slug: string): string` → `${previewBase()}/s/${slug}`
- `previewLink(lead: Lead, now?: Date): string` (`""` se non c'è anteprima o se è scaduta)
- `siteContent(lead: Lead, copy: SiteCopy): SiteContent`
- `fallbackCopy(lead: Lead, variant?: number): SiteCopy`
- `copyProblems(copy: SiteCopy): string[]`
- `isPreviewBot(userAgent: string): boolean`
- `interestUrl(phone: string, senderName: string, venue: string): string` (`""` senza numero valido)

- [ ] Step 1: test (`tests/site-preview.test.ts`):
  - `newSlug` restituisce 12 caratteri `[a-z0-9]` e non si ripete in 1.000 chiamate.
  - `previewLink` vale `""` senza `preview` e `""` se scaduta; con `NEXT_PUBLIC_SITE_URL=https://simone-siti.vercel.app` restituisce `https://simone-siti.vercel.app/s/<slug>`.
  - `siteContent` contiene solo le chiavi pubbliche: nessuna `notes`, `analysis`, `messages` o `lead_score` in `JSON.stringify`.
  - `copyProblems` scarta "dal 1985", "la pizza più buona della città", "forno a legna", "a due passi dal mare", "4,8 stelle" e un titolo oltre 60 caratteri; accetta un testo alla mano senza fatti.
  - `fallbackCopy` passa `copyProblems` per tutte le `categories` e le varianti 0..5, e per gli alloggi non parla di menu.
  - `isPreviewBot` è vero per `WhatsApp/2.23`, `facebookexternalhit/1.1`, `TelegramBot`, `Twitterbot`, `Slackbot-LinkExpanding`, `Googlebot` e `""`; falso per un Chrome Android.
  - `interestUrl("+393331234567", "Simone", "Pizzeria X")` contiene `api.whatsapp.com/send?phone=393331234567` e il testo codificato; `interestUrl("", ...)` vale `""`.
- [ ] Step 2: verifica che fallisca (modulo assente).
- [ ] Step 3: implementa.
  - Banned regex di `copyProblems`: `/\d|\b(?:migliore|migliori|più buon|il top|numero uno|unic[oa] in|da generazioni|tradizion|dal \w+|anni di|forno a legna|a legna|vista mare|sul mare|due passi|centro storico|premiat|recension|stelle|famos|rinomat|artigianal|km zero|biologic|ingredienti|selezionat|eccellenz)/i`; più lunghezze massime (titolo 60, intro 220, offer 200, contact 160) e minime (titolo 8, gli altri 20).
  - Testi di riserva: pool di 3 frasi per campo, per locali e per alloggi. `{city}` e il nome della categoria vengono dai dati.
- [ ] Step 4: test verdi, `pnpm lint`, commit "Add the site preview core: links, public content, friendly copy".

### Task 2: Migrazione 003 e funzione pubblica

**Files:** Create `supabase/migrations/003_site_previews.sql`. Modify `tests/database.test.ts` (eseguire la 003 e aggiungere un `describe`).

- [ ] Step 1: test PGlite:
  - il proprietario inserisce un'anteprima per il suo lead; Bob non la vede con `select`;
  - come `anon`, `select` diretto sulla tabella è negato, mentre `site_preview(slug,true)` restituisce il contenuto con nome, numero e prezzo del mittente (dalle preferenze) e incrementa `views`;
  - chiamata del proprietario con `count=true`: `views` invariato;
  - scaduta oppure lead `do_not_contact`: `null`;
  - slug che non rispetta `^[a-z0-9]{10,32}$`: insert rifiutato.
- [ ] Step 2: verifica che fallisca (file assente).
- [ ] Step 3: migrazione con tabella, check, RLS `site_previews_owner` (`user_id = auth.uid()` e lead dell'utente), grant `select,insert,update,delete` ad `authenticated`, revoke da `anon`, funzione `site_preview(p_slug text, p_count boolean default true) returns jsonb` `security definer set search_path = ''`, `revoke all ... from public`, `grant execute ... to anon, authenticated`. Il join usa `public.profiles` per `sender_name`, `sender_phone`, `site_price` (default 200).
- [ ] Step 4: test verdi, commit "Store site previews with owner-only access and a public read function".

### Task 3: Creazione dal server, testi AI e caricamento tollerante

**Files:** Create `lib/previews.ts` (server-only), `lib/ai/site-copy.ts`, `tests/previews.test.ts`. Modify `lib/supabase/repository.ts` (allega `preview` ai lead con una query separata tollerante).

**Produces:**
- `generateSiteCopy(lead: Lead): Promise<SiteCopy>` (luna, al massimo 2 tentativi con il feedback, poi `fallbackCopy`; demo o chiave assente → `fallbackCopy` senza chiamate)
- `ensurePreview(db, lead): Promise<SitePreview | null>` (esistente → aggiorna `content` tenendo `copy` e `slug`; nuova → slug, testi, insert; qualunque errore → `null`)
- `attachPreviews(db, leads: Lead[]): Promise<void>` (errore → nessuna anteprima, nessuna eccezione)

- [ ] Step 1: test con `openai` simulato e db finto:
  - `generateSiteCopy` usa `gpt-5.6-luna`; se il primo testo contiene "forno a legna" ritenta con il feedback nelle istruzioni; se fallisce due volte usa `fallbackCopy`; senza chiave nessuna chiamata;
  - `ensurePreview` con db finto senza riga inserisce slug e contenuto; con riga esistente aggiorna senza cambiare slug né `copy`; se il db restituisce un errore (tabella assente) restituisce `null`;
  - `attachPreviews` con errore lascia i lead invariati, senza eccezioni.
- [ ] Step 2: verifica che fallisca.
- [ ] Step 3: implementa; `allLeads` e `getLead` chiamano `attachPreviews`.
- [ ] Step 4: test verdi, commit "Create previews on the server with friendly AI copy".

### Task 4: Link nella bozza

**Files:** Modify `lib/messaging/index.ts` (`fallbackMessage`, `messageProblems`), `lib/messaging/validation.ts` (payload `previewUrl`), `lib/messaging/prompt.ts` (istruzione), `lib/ai/index.ts` (link nel payload), `app/api/workspace/route.ts` (azione `message`: `ensurePreview` prima di generare). Test: `tests/preview-message.test.ts`.

- [ ] Step 1: test:
  - `fallbackMessage` di un lead con anteprima contiene il link una volta, preceduto da "date un'occhiata ", senza emoji prima, ed è valido; senza anteprima non contiene `http`;
  - la validazione scarta: link assente, link due volte, `🙂 https://…`, un link diverso, un link con lead senza anteprima;
  - un link con la parola `demo` nello slug non fa scattare la regola "demo gratuita"; i punti dell'URL non contano nella punteggiatura;
  - le istruzioni dell'AI con anteprima contengono il link esatto e "senza emoji prima del link".
- [ ] Step 2: verifica che fallisca.
- [ ] Step 3: implementa. In `messageProblems` calcola `link = previewLink(lead)` e `plain = trimmed` con il link rimosso, e usa `plain` per i controlli su codici, nome, punteggiatura e demo.
- [ ] Step 4: test verdi, commit "Put the site preview link in the first message".

### Task 5: Pagina pubblica e foto

**Files:** Create `app/s/[slug]/page.tsx`, `app/s/[slug]/preview.module.css`, `components/site-preview.tsx`, `lib/providers/places/photos.ts`. Modify `lib/demo.ts` (anteprime demo `demo-N`). Test: `tests/site-photos.test.ts`, `tests/site-preview.test.ts` (demo).

**Produces:** `placePhotos(placeId: string, max = 5): Promise<{ url: string; author: string; authorUrl: string }[]>`, cioè dettagli con field mask `photos`, poi `.../media?maxWidthPx=1200&skipHttpRedirect=true` per ogni foto. Restituisce `[]` senza chiave o in caso di errore.

- [ ] Step 1: test:
  - `placePhotos` (con `providerJson` simulato) chiama i dettagli con field mask `photos`, poi i media con `skipHttpRedirect=true`; restituisce url e autore; si ferma a 5; senza chiave nessuna chiamata;
  - `demoPreview("demo-0")` restituisce il contenuto del lead demo 0 con testi di riserva; uno slug sconosciuto restituisce `null`.
- [ ] Step 2: verifica che fallisca.
- [ ] Step 3: implementa la pagina:
  - server component, `robots noindex`, `generateMetadata` con "Nome · Categoria a Città";
  - legge lo user agent con `headers()`, chiama `site_preview(slug, !isPreviewBot(ua))` via `supabaseServer()`; in demo usa `demoPreview`;
  - pagina "non disponibile" se `null`;
  - `components/site-preview.tsx` presentazionale: hero, galleria, riquadri, orari, contatti, barra in basso.
- [ ] Step 4: test verdi, `pnpm build`, commit "Serve public site previews with live Google photos".

### Task 6: Scheda del lead e impostazioni

**Files:** Modify `components/lead-detail.tsx` (riquadro "Anteprima sito"), `components/settings.tsx` (numero WhatsApp, prezzo), `lib/validation.ts` se le preferenze passano da lì. Test: `tests/site-preview.test.ts` (`previewSummary` per il testo delle visite).

**Produces:** `previewSummary(p: SitePreview, now?: Date): string`, cioè "non ancora aperta" oppure "aperta 3 volte, ultima il 05/10".

- [ ] Step 1: test di `previewSummary` e validazione delle preferenze (numero normalizzato, prezzo tra 0 e 10.000).
- [ ] Step 2: verifica che fallisca.
- [ ] Step 3: implementa la UI (Apri, Copia, testo visite, scadenza) e i campi delle impostazioni.
- [ ] Step 4: test verdi, commit "Show the preview on the lead page and add price and number settings".

### Task 7: Dominio, variabili, deploy

- [ ] Installa Vercel CLI (`npm i -g vercel`); l'utente esegue `! vercel login`; `vercel link` al progetto `clientiai2`.
- [ ] Aggiungi un dominio `.vercel.app` neutro libero (`simone-siti`, `siti-simone` o `simonesiti`) al progetto; imposta `NEXT_PUBLIC_SITE_URL` in produzione.
- [ ] Prova dal vivo 1–2 testi con luna (circa 0,1 centesimi l'una).
- [ ] Merge su `main`, push, controllo del deploy. Ricorda all'utente di eseguire la migrazione 003 nell'editor SQL di Supabase.
