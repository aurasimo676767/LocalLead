# Anteprima automatica del sito

Data: 2026-10-07 · Stato: approvato a voce dall'utente ("fai tutto")

## Obiettivo

Molti locali rispondono "sentiamoci con calma, magari di presenza" e poi
spariscono quando Simone propone una chiamata. Per ogni lead l'app crea da sola
un'anteprima del sito, con i dati veri del locale e testi alla mano, a un link
segreto. Il link entra nel primo messaggio. Il locale vede il proprio sito in
10 secondi e risponde con un tocco dal pulsante "Mi interessa".

Decisioni dell'utente:

- foto vere da Google Maps;
- link già nel primo messaggio, preceduto da "intanto ve l'ho già preparato
  in anteprima, date un'occhiata" e **senza emoji prima del link**;
- indirizzo neutro su Vercel (niente "clientiai" nel link);
- barra in basso con prezzo (200 € fisso, una volta sola) e pulsante WhatsApp
  verso Simone;
- testi scritti dall'AI ma alla mano e simpatici, come fatti a mano, mai da
  agenzia;
- niente risposte pronte.

Vincoli del progetto (AGENTS.md): niente chiave service-role, le chiamate al
database usano la sessione e le RLS; nessun invio automatico; niente dati
inventati; la demo funziona senza credenziali e senza chiamare provider.

## 1. Dati

Nuova migrazione `supabase/migrations/003_site_previews.sql`, da eseguire una
volta nell'editor SQL di Supabase dopo 001 e 002.

```
site_previews(
  slug text primary key  -- 12 caratteri [a-z0-9] casuali, solo il server li genera
  lead_id uuid unique -> leads(id) on delete cascade
  user_id uuid -> auth.users(id)
  content jsonb          -- copia dei soli dati pubblici + testi
  views int default 0, last_viewed_at timestamptz,
  created_at, expires_at default now() + 60 giorni
)
```

- RLS: il proprietario legge e scrive le proprie righe (`user_id = auth.uid()`
  e il lead è suo).
- Lettura pubblica solo con la funzione `public.site_preview(p_slug, p_count)`
  (security definer, eseguibile da `anon` e `authenticated`). Restituisce
  `null` se il link è scaduto, il lead è "non contattare" o è chiuso. Altrimenti
  restituisce `content`, il `place_id` del lead (per le foto dal vivo) e i dati
  del mittente presi dal profilo: nome, numero WhatsApp, prezzo. Se
  `p_count` è vero e chi guarda non è il proprietario, incrementa le visite e
  aggiorna `last_viewed_at`.
- `content` contiene solo: nome, categoria, settore, città, indirizzo,
  telefono del locale, orari, link a mappa, menu, Facebook e Instagram, e i
  testi. Niente note, punteggi, messaggi o evidenze.
- I lead caricati dall'app hanno un campo facoltativo `preview`
  (`slug`, `views`, `last_viewed_at`, `expires_at`). Viene letto con una query
  separata e tollerante: se la migrazione 003 non è ancora stata eseguita, le
  anteprime risultano semplicemente assenti e il resto dell'app funziona come
  prima.

## 2. Creazione

- Quando l'app scrive la bozza di un lead contattabile con un motivo
  verificato, il server crea l'anteprima se manca. Se esiste, aggiorna i dati
  e tiene link e testi.
- Una sola anteprima per lead. Il link non cambia rigenerando la bozza.
- Se la creazione fallisce (tabella assente, errore di rete), la bozza esce
  senza link, come oggi.

## 3. Testi

- Quattro testi brevi: titolo, presentazione, riquadro menu (per gli alloggi:
  camere) e invito a contattare. Li scrive `gpt-5.6-luna` una volta, alla
  creazione (circa 0,1 centesimi). Parlano con la voce del locale ("noi"),
  in minuscolo e maiuscolo normali, alla mano e simpatici, mai da agenzia.
- Niente fatti inventati: niente anni, numeri, superlativi ("il migliore",
  "il più buono"), tradizioni, ingredienti, forni, viste, distanze, premi,
  recensioni. Un controllo scarta i testi che li contengono, e l'AI ritenta
  con le correzioni.
- L'indirizzo e gli orari non stanno nei testi: la pagina li mostra a parte
  dai dati veri.
- Senza AI (demo, chiave assente, errore) si usano testi di riserva scritti a
  mano, con varianti per categoria e settore.

## 4. Pagina pubblica `/s/[slug]`

- Fuori dall'area riservata, senza menu dell'app, pensata per il telefono,
  `noindex`. Il titolo del link (anteprima di WhatsApp) è
  "Nome · Categoria a Città".
- In alto: la prima foto grande, il nome, "Pizzeria a Vittoria", titolo e
  presentazione, pulsanti **Chiama** (se c'è il telefono) e **Indicazioni**
  (link Google Maps).
- Locali: galleria, menu (link al loro menu se esiste, altrimenti un riquadro
  "qui va il vostro menu"), orari, contatti e social.
- Alloggi: galleria, camere (riquadro "qui vanno le vostre camere"),
  posizione (indicazioni), contatti e "chiedi disponibilità".
- Foto: fino a 5 dal vivo da Google (elenco foto gratuito, ogni foto rientra
  nelle 1.000 gratuite al mese, poi circa 0,7 centesimi), con il nome
  dell'autore e "Foto da Google Maps". Non vengono salvate. Senza foto, i
  riquadri mostrano un colore della categoria e "qui vanno le vostre foto".
- Barra fissa in basso: "Anteprima creata da {nome mittente} · il sito
  completo a {prezzo} €, una volta sola" e il pulsante **Mi interessa**, che
  apre WhatsApp verso il numero del mittente con "Ciao {nome mittente}, ho
  visto l'anteprima del sito per {nome locale}". Senza numero nelle
  impostazioni, il pulsante non c'è.
- Visite: non si contano quelle dei bot (WhatsApp, Facebook, Telegram e altri
  generatori di anteprime link) né quelle del proprietario loggato.
- Link scaduto o sconosciuto: pagina "anteprima non disponibile", senza dati.
- Demo: `/s/demo-N` mostra il lead demo N con testi di riserva e senza foto,
  senza chiamare database o provider.

## 5. Messaggio

- Se il lead ha un'anteprima valida, la bozza la contiene una volta sola,
  alla fine della quarta riga: "…, intanto ve l'ho già preparato in anteprima,
  date un'occhiata {link}". Nessuna emoji subito prima del link.
- Il controllo della bozza: il link esatto deve esserci una volta; nessuna
  emoji subito prima; senza anteprima nessun link. I controlli di
  punteggiatura, codici e nome del locale ignorano il link.
- L'AI riceve il link nel payload e l'istruzione di usarlo così.
- I testi di riserva aggiungono la stessa frase.

## 6. Scheda del lead e impostazioni

- Riquadro "Anteprima sito": link, **Apri**, **Copia**, "aperta N volte,
  ultima il …" oppure "non ancora aperta", scadenza.
- Impostazioni: **il tuo numero WhatsApp** (per "Mi interessa") e **prezzo
  del sito** (predefinito 200 €).

## 7. Indirizzo

- I link usano `NEXT_PUBLIC_SITE_URL`, oppure `NEXT_PUBLIC_APP_URL` se non è
  impostato.
- Su Vercel si aggiunge al progetto un dominio `.vercel.app` neutro (per
  esempio `simone-siti.vercel.app`) e lo si imposta in
  `NEXT_PUBLIC_SITE_URL`. L'app continua a funzionare anche dal vecchio
  indirizzo.

## 8. Test

- Migrazione con PGlite: proprietario e altri utenti, lettura anonima solo
  tramite la funzione, scadenza, opt-out, conteggio visite escluso il
  proprietario.
- Testi: il controllo scarta numeri, superlativi e fatti inventati; i testi di
  riserva lo superano per tutte le categorie.
- Messaggi: link presente una volta, niente emoji prima, niente link senza
  anteprima, testi di riserva validi con il link.
- Bot: riconoscimento degli user agent delle anteprime link.
- Pagina: costruzione del contenuto dai dati del lead senza campi privati.

## Fuori da questo lavoro

Risposte pronte, dominio a pagamento, modifica dei testi dall'app,
statistiche aggregate delle visite.
