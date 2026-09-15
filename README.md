# LocalLead — V1

Workspace personale per trovare attività food locali, analizzare la presenza online con evidenze, assegnare priorità, preparare una bozza italiana e seguire ogni conversazione. L'invio avviene **esclusivamente a mano in WhatsApp/Facebook**. Non ci sono API di invio, messaggi massivi o automazioni di account social.

## Avvio immediato (senza chiavi)

Requisiti: Node.js 22+ (testato con 24), pnpm 11.22+. Da questa cartella:

```powershell
pnpm install
pnpm dev
```

Apri http://localhost:3000. In assenza di Supabase si attiva la demo. Non serve un account. LocalLead è un progetto indipendente: esegui i comandi dalla sua directory principale.

Per fissare esplicitamente la configurazione, copia `.env.example` in `.env.local`. Non committare `.env.local`.

## Cosa funziona

- Dashboard, ricerca per città/categorie, elenco filtrabile, scheda lead, CRM, contattati e archivio.
- CRUD tramite inserimento, modifica e archiviazione; “Non mostrare più” mantiene l'identità esclusa, senza cancellarla.
- Google Places ufficiale (New), ricerca testuale e dettagli, paginazione e limiti; fallback alle fixture se la chiave manca.
- Enrichment Brave Search opzionale; i candidati non verificati non diventano automaticamente account ufficiali.
- Analisi server-side HTML: metadati, viewport, HTTPS, contenuti, immagini, menu, social, contatti, footer, tecnologie e segnali eventi. Le evidenze e le fonti rimangono visibili.
- Score deterministico spiegabile; cache per lead e utente (72 ore di default).
- Analisi OpenAI con Structured Outputs; il riepilogo usa soltanto ID e testi delle evidenze ammesse.
- Messaggi AI o fallback locale, ultimi 10 messaggi come contesto, similarity e un tentativo di rigenerazione; modifica e cronologia delle bozze.
- WhatsApp `wa.me` con conferma e testo codificato, Facebook con copia negli appunti, registrazione manuale di stato/canale/note.
- CSV con anteprima, validazione riga per riga e dedup (massimo 200 righe/1 MB). L'import salva: l'analisi viene avviata dalla scheda, per controllare i costi.
- Preferenze persistenti, dark mode, responsive, backup JSON.

## Demo mode

`DEMO_MODE=true`, oppure Supabase non configurato: il workspace completo è persistito in `localStorage`, chiave `locallead.workspace.v1`. Niente API esterne o chiavi utilizzate in questa modalità. I dati restano tra ricaricamenti e riavvii, nello stesso browser/origine. Non sono condivisi tra dispositivi. Esporta periodicamente un backup dalle impostazioni; cancellare i dati del browser elimina questa copia.

Otto lead iniziali: pizzeria senza sito, menu con pubblicità, cocktail bar con serate, panificio senza sito, pasticceria con sito scarno, ristorante con sito ottimo, locale chiuso e lead già contattato. Due ulteriori fixture sono scopribili. Nomi, evidenze e URL `example.com` sono esplicitamente fittizi. Nessun numero reale inventato: le fixture non aprono canali esterni. Puoi provare il link WhatsApp aggiungendo un lead manuale con un numero reale da te verificato, fonte pubblica e nota. L'app apre solamente una bozza.

La ricerca demo restituisce il dataset di Vittoria (non inventa altre attività in base alla città digitata); rispetta categorie e limiti. Ripetere la ricerca mostra “Lead già presente” con lo stato; i lead `do_not_contact` non ricompaiono.

Con Supabase attivo ma senza Google, il CRM è reale e la ricerca restituisce fixture marcate demo. L'inserimento manuale e l'analisi di lead reali funzionano comunque.

## Supabase e autenticazione

1. Crea un progetto Supabase.
2. Esegui integralmente `supabase/migrations/001_locallead.sql` nell'SQL Editor (oppure con Supabase CLI su un database vuoto).
3. Inserisci URL e anon key in `.env.local`; imposta `DEMO_MODE=false`.
4. In Auth → URL Configuration imposta Site URL all'origine dell'app e autorizza `http://localhost:3000/auth/callback` e `https://tuo-dominio/auth/callback` nelle Redirect URLs.
5. Abilita Email/Password; registra l'account da `/login`, conferma l'email e accedi. Per uso personale puoi disabilitare nuove registrazioni dopo aver creato il tuo account.

Tabelle: `profiles`, `leads`, `lead_sources`, `messages`, `lead_events`; tabelle tecniche `lead_keys` (identità storiche/dedup) e `rate_limits`. Ogni tabella usa RLS; le fonti e la cronologia sono accessibili solo tramite il proprietario del lead. Il profilo viene creato da un trigger Auth. Nessuna service-role key è necessaria al runtime.

`save_lead` salva scheda, fonti, messaggi ed eventi in una transazione, con lock per utente, dedup e controllo della versione per evitare sovrascritture concorrenti. Le vecchie identità rimangono associate al lead. Dedup ordinata: place ID → telefono internazionale → dominio proprietario → nome+indirizzo → nome+città. Social e piattaforme condivise non sono considerati domini proprietari.

Le policy SQL e la migrazione sono verificate automaticamente su Postgres embedded (PGlite), inclusi isolamento fra due utenti, transazioni, versioni e rate limit. Senza un progetto/credenziali non è possibile verificare una sessione Auth live o il database remoto. Prima dell'uso live puoi eseguire anche `supabase/tests/rls.sql` in un database di sviluppo dopo la migrazione.

## Variabili d'ambiente

| Variabile                                                   | Utilizzo                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Database e Auth. La anon key è pubblica per progetto: le autorizzazioni dipendono da RLS e sessione. |
| `SUPABASE_SERVICE_ROLE_KEY`                                 | Prevista nel template, **non utilizzata**. Lasciarla vuota.                                          |
| `DEMO_MODE`                                                 | `true` per demo completamente locale; `false` per Supabase.                                          |
| `NEXT_PUBLIC_APP_URL`                                       | Origine esatta dell'app, inclusa porta in locale; usata anche per il controllo Origin.               |
| `GOOGLE_PLACES_API_KEY`                                     | Abilita Places API (New) con billing nel progetto Google Cloud. Restrizione alla sola API richiesta. |
| `SEARCH_PROVIDER`                                           | `brave` oppure `none`.                                                                               |
| `SEARCH_API_KEY`                                            | Token Brave Search. Senza token: inserimento manuale.                                                |
| `OPENAI_API_KEY`                                            | Server only. Senza chiave: analisi oggettiva e messaggi locali.                                      |
| `OPENAI_MODEL`                                              | Default `gpt-4.1-mini`, configurabile con un modello che supporti Structured Outputs.                |
| `SCREENSHOT_PROVIDER`                                       | `screenshotone` oppure `none`.                                                                       |
| `SCREENSHOT_API_KEY`                                        | ScreenshotOne. Immagine richiamata su richiesta dalla scheda, con sessione, mai chiave nel browser.  |
| `ANALYSIS_CACHE_HOURS`                                      | Default `72`. Modificare i link invalida l'analisi.                                                  |

Imposta anche un budget/spend limit presso i provider. I limiti applicativi sono per utente/minuto: 120 letture, 90 scritture, 60 operazioni costose; vengono conservati in Postgres e funzionano con più istanze Vercel. Il limite consente una ricerca con 50 analisi, mantenendo un budget finito.

## Provider e scelte V1

Google Places: nessuno scraping Maps. `lib/providers/places` espone `searchBusinesses` e `getBusinessDetails`; i dati mostrano attribuzione a Google Maps e link alla scheda. Un telefono Google non conferma WhatsApp. Un sito mancante nel risultato rimane `unknown`, finché non viene verificato manualmente.

Brave: salva URL, snippet, fonte e confidence. La corrispondenza testuale produce candidati da verificare, evitando false associazioni. I link social espliciti sul sito indicato come ufficiale possono essere aggiunti automaticamente. Nessuna lettura di pagine protette da login o bypass anti-bot.

HTML: fetch con DNS controllato e indirizzo IP fissato alla connessione; indirizzi privati, loopback, link-local, schemi non HTTP(S), credenziali e porte alternative sono rifiutati. Ogni redirect viene nuovamente verificato. Limite di dimensione, timeout e User-Agent identificabile. Nessun JavaScript remoto eseguito. Le pagine che dipendono da JavaScript rimangono `unknown`, i timeout non dimostrano che il sito sia rotto. L'assenza di un link nella homepage non significa che la pagina non esista. Non si deduce che un sito sia vecchio dalla data del footer. “Excellent” richiede una valutazione manuale/visiva; il classificatore HTML al massimo assegna “good”.

Menu: una piattaforma esterna non è automaticamente un difetto. Il bonus “pubblicità” richiede almeno tre marcatori pubblicitari riconoscibili. Le osservazioni sui social curati o attivi non vengono inventate.

ScreenshotOne: adattatore sostituibile in `lib/providers/screenshot`. Su click acquisisce un'immagine per revisione umana; fallback all'HTML. Nessun Chromium obbligatorio sul server Vercel; lo screenshot non genera automaticamente giudizi estetici.

OpenAI: i testi delle pagine sono ridotti a feature ed evidenze; nessun HTML completo inviato. API Responses con `store:false`, output Zod, timeout, fallback e contesto limitato agli ultimi 10 messaggi. Le istruzioni nelle fonti sono trattate come contenuto non attendibile. Ogni bozza richiede revisione umana: la validazione dello schema non certifica la verità di ogni frase del modello.

## Sviluppo e controlli

```powershell
pnpm lint
pnpm test
pnpm build
pnpm start
```

TypeScript 6 è fissato perché la toolchain ESLint installata non supporta TypeScript 7. Next.js è fissato alla versione stabile verificata al momento dello sviluppo; il lockfile rende l'installazione riproducibile.

Test browser (usa la build di produzione, demo senza chiavi):

```powershell
pnpm exec playwright install chromium
pnpm test:browser
```

Puoi usare `PLAYWRIGHT_CHROMIUM_EXECUTABLE` per un Chromium già installato. Screenshot dei test in `test-results/`. I test non aprono/inviano messaggi commerciali. I provider a pagamento non vengono chiamati dalla suite offline.

## Deploy Vercel

1. Importa il repository in un **nuovo progetto Vercel**.
2. Usa la directory principale del repository come **Root Directory** (campo vuoto oppure `.`), framework Next.js, Node.js 24, package manager pnpm; build `pnpm build`.
3. Per demo non servono chiavi. Per live configura Supabase e le altre variabili desiderate, `DEMO_MODE=false`, `NEXT_PUBLIC_APP_URL=https://dominio-esatto`.
4. Configura le Redirect URLs Supabase per quel dominio e deploya.

Nessun deploy viene eseguito dagli script del progetto. La ricerca salva i risultati e l'interfaccia richiede le analisi una per volta, con progressi ed errori per lead: se interrompi la pagina, puoi riprendere dalle schede già salvate. Verifica che il piano Vercel consenta la durata delle funzioni impostata (60 secondi).

## File principali

`app/(workspace)/` pagine; `components/` UI e stato demo; `app/api/workspace/route.ts` operazioni autenticate; `lib/supabase/` persistenza; `lib/providers/` integrazioni; `lib/enrichment/` analisi HTML; `lib/scoring/` pesi; `lib/ai/` AI; `lib/messaging/` regole e similarity; `lib/lead-actions.ts` verifiche/CRM; `supabase/migrations/` schema; `tests/` test.

## Limiti e V2

- Analisi multipagina completa, valutazione visiva AI e comparazione foto/social approfondita: V2. La V1 raccoglie la homepage e, se esterno, il menu.
- Coda di lavoro persistente per scansioni lunghe, cache condivisa per dominio tra lead, follow-up e report evoluti: V2. La V1 usa richieste per singolo lead e cache per utente/lead.
- Enrichment con conferma automatica dell'identità più avanzata: V2. La V1 conserva i candidati e propone la verifica manuale.
- Ripristino JSON guidato e sincronizzazione della demo verso Supabase: V2. Disponibili backup JSON e import CSV; le due modalità conservano archivi separati.
- L'elenco CRM è caricato nel workspace personale; la query legge tutte le pagine Supabase. Dataset molto grandi richiederanno filtri/paginazione server-side.

Documentazione usata: [Next.js](https://nextjs.org/docs/app), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Google Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), [Brave Search](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
