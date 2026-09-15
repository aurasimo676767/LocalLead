# Verifica V1 — 15 settembre 2026

Ambiente: Windows, Node.js 24.18.0, pnpm 11.22.0; Next.js 16.3.5, TypeScript 6.0.3.

## Controlli eseguiti

- `pnpm lint`: superato, nessun errore o warning applicativo; include `tsc --noEmit`.
- `pnpm test`: **75 test superati**, 4 file.
- `pnpm build`: superato, build Next.js di produzione con tutte le pagine e API.
- `pnpm test:browser`: **3 test end-to-end superati** con Chromium headless sulla build di produzione.

Copertura: normalizzazione telefoni; URL e DNS pubblici/privati; dedup ordinata; scoring con evidenze; eventi e messaggi; classificazione HTML/menu; provider Google/Brave con risposte simulate; fallback senza chiavi; invalidazione della cache; conservazione dei campi nei PATCH; import CSV; migrazione SQL reale su Postgres embedded, isolamento tra due utenti e rate limit condiviso.

I test browser verificano ricerca e duplicati, esclusione permanente dalle ricerche, modifica e persistenza delle bozze, registrazione del contatto, CSV, mobile senza overflow della pagina e dark mode. Il test WhatsApp verifica la richiesta di conferma e l'URL `wa.me` con testo codificato, senza seguire il link o inviare messaggi. Usa un numero nella serie fittizia statunitense 555-01xx.

Screenshot ispezionati: `test-results/dashboard-desktop.png`, `test-results/dashboard-mobile.png`, `test-results/dashboard-dark.png`. Sono artefatti locali ignorati da Git e vengono rigenerati dai test browser.

## Da verificare con credenziali proprie

Non sono state utilizzate chiavi reali né eseguiti deploy: chiamate live Google Places, Brave, OpenAI e ScreenshotOne e accesso Supabase Auth richiedono la configurazione descritta nel README. I contratti dei provider sono verificati offline; i test Postgres non sostituiscono una prova sul proprio progetto Supabase.

Per Vercel usare la directory principale del repository (Root Directory vuota oppure `.`). Per eseguire i test browser con Chromium già installato in questo ambiente:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE='C:\Users\simoa\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe'
pnpm test:browser
```
