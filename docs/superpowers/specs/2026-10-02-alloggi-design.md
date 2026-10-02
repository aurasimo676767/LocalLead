# Alloggi (B&B e case vacanza) e punteggio più accurato

Data: 2026-10-02 · Stato: approvato a voce, in revisione scritta

## Obiettivo

Trovare B&B e case vacanza senza un sito proprio e proporre loro un sito,
in una sezione **separata** da quella dei locali. Nello stesso lavoro il
punteggio dei lead diventa più accurato, per locali e alloggi.

Vincoli dati dall'utente:

- Dentro "Alloggi" compaiono **solo** alloggi, anche scorrendo con le
  frecce Precedente/Successivo nella scheda del lead. I locali non mostrano
  mai alloggi. Le due liste non si mescolano mai.
- Il canale principale resta WhatsApp, più Instagram e Facebook.
- Gli hotel sono fuori da questo lavoro.

Vincoli del progetto (AGENTS.md) che restano validi: nessun invio
automatico, punteggio positivo e messaggi solo con evidenze attribuibili,
un telefono pubblico non prova WhatsApp, la modalità demo non chiama
provider, opt-out e alias di deduplica preservati.

## 1. Dati e pagine

- Nuove categorie: `B&B` e `Casa vacanza`.
- Il settore si ricava dalla categoria con `sectorOf(category)`:
  `"alloggi"` per B&B e Casa vacanza, `"locali"` per tutto il resto.
  Nessuna colonna e nessuna migrazione: `category` è già testo libero nel
  database.
- Nuova voce di menu **Alloggi**:
  - `/alloggi`: lista degli alloggi, con gli stessi filtri della lista
    locali (città, stato, canale). "Contattati" e "Archivio" degli alloggi
    sono filtri di stato dentro questa pagina.
  - `/alloggi/cerca`: ricerca con città e categorie B&B / Casa vacanza.
- Le pagine dei locali (lista, Contattati, Archivio, Dashboard, ricerca)
  escludono gli alloggi. La ricerca dei locali non offre le categorie
  alloggio.
- La scheda del lead resta `/leads/[id]` per tutti, ma:
  - Precedente/Successivo scorrono solo i lead dello stesso settore del lead
    aperto (anche nella coda di una ricerca);
  - "Torna alla lista" porta a `/alloggi` per un alloggio;
  - nel menu resta evidenziata la voce del settore del lead.
- "Cerca numero", opt-out, deduplica e cronologia restano condivisi.
- La dashboard, se mostra conteggi, li mostra per i soli locali.

## 2. Ricerca e analisi

- Frasi di ricerca su Google Places:
  - B&B: "bed and breakfast", "b&b", "affittacamere";
  - Casa vacanza: "casa vacanze", "casa vacanza", "appartamento vacanze".
- Per gli alloggi si tengono solo i risultati il cui `types` di Google
  contiene almeno uno tra `bed_and_breakfast`, `guest_house`, `lodging`,
  `cottage`, `private_guest_room`, `farmstay`, `inn`. Si scartano quelli
  con `hotel`, `resort_hotel`, `motel`, `hostel` o `campground` tra i tipi
  (gli hotel sono fuori da questo lavoro). Un posto di ristorazione che si
  chiama "B&B" non entra.
- Resta il filtro attuale: si scartano i risultati senza telefono o con solo
  numero fisso.
- Nuovo riconoscimento **portale**: se il sito indicato da Google è Booking,
  Airbnb, Vrbo, Expedia, Hotels.com, Agoda, Tripadvisor, Subito o simili,
  il lead è `external_page_only` con evidenza
  "Su Google Maps il sito indicato è una pagina Booking" (stesso meccanismo
  già usato per Facebook e Linktree). Vale per tutti i settori.
- Se Google non indica alcun sito non si afferma che l'alloggio sia su
  Booking: il motivo resta "non ho trovato un sito".

## 3. Punteggio (locali e alloggi)

Il punteggio 0–100 diventa la somma di tre voci con un tetto ciascuna. Ogni
voce positiva cita le evidenze o la fonte Google Places da cui viene.

**Bisogno di un sito (max 50)**: conta solo il motivo più forte, non la
somma.

| situazione | punti |
|---|---|
| nessun sito verificato, oppure sito = portale (Booking, Airbnb…) | 50 |
| sito = Facebook / Instagram / Linktree | 45 |
| sito che non si apre (errore verificato) | 40 |
| sito datato o scarno | 30 |
| menu su piattaforma con pubblicità (solo locali) | 25 |
| serate reali senza sezione eventi (solo locali) | 20 |
| Google non indica un sito ma non è verificato | 35 |
| sito buono / ottimo | 0 |

**Raggiungibilità (max 30)**

| situazione | punti |
|---|---|
| WhatsApp business confermato o probabile | 30 |
| cellulare (WhatsApp da verificare) | 22 |
| solo fisso, ma con Facebook o Instagram | 12 |
| solo fisso | 5 |
| nessun contatto | 0 |

La ricerca da Google scarta già i fissi, quindi gli ultimi tre livelli
riguardano i lead inseriti a mano o importati.

**Attività viva (max 20)**

| situazione | punti |
|---|---|
| 50 o più recensioni su Google | 12 |
| da 10 a 49 recensioni | 8 |
| da 1 a 9 recensioni | 2 |
| social attivi verificati (pagina Facebook attiva) | +4 |
| entro 30 km dal mittente (stessa città o vicino) | +4 |

**Limiti e penalità**

- Chiuso o "non contattare": 0.
- Sito ottimo: massimo 15. Sito buono: massimo 25.
- "Attività poco attiva" (evidenza `inactive`): −20. Fuori target: −50.
- Affidabilità media delle evidenze sotto 60: massimo 39 (come oggi).
- Le recensioni servono solo al punteggio, mai al testo dei messaggi.

**Trasparenza**: nella scheda il punteggio mostra le tre voci, per esempio
"Bisogno 50 · Raggiungibilità 22 · Attività 12 = 84". Le ragioni restano in
`analysis.reasons`, una per voce.

**Ricalcolo**: i lead salvati vengono ricalcolati con i dati che hanno già,
senza nuove chiamate a Google o all'AI, la prima volta che vengono caricati
o salvati.

`worthwhile` e `contactable` mantengono il loro significato: serve almeno un
motivo di bisogno con evidenza.

## 4. Messaggi per gli alloggi

- Stessa voce e stesse regole generali dei locali (presentazione con
  "mi chiamo", Google, niente nome dell'attività, niente invenzioni,
  domanda finale). Modello: `gpt-5.6-luna`.
- Il prompt cambia contenuto per gli alloggi:
  - cosa hai visto: "su Google come sito c'è solo la pagina Booking"
    oppure "non ho trovato un sito vostro";
  - perché conviene: chi vi trova su Google o è già stato da voi può
    scrivervi e prenotare direttamente;
  - cosa metteresti nel sito: foto delle camere e degli spazi, colazione
    se c'è, posizione e cosa c'è vicino, contatti diretti, un modo
    semplice per chiedere disponibilità.
- Regole specifiche alloggi:
  - prenotazione e richiesta di disponibilità diretta ammesse (per i locali
    restano vietate);
  - le commissioni dei portali si possono citare in generale, mai con
    percentuali o cifre;
  - niente menu, niente QR: la validazione non li richiede per gli alloggi.
- Nuovo motivo di contatto `portal_only` con contesto e pattern di
  validazione; `no_website`, `broken_website`, `sparse_website` e
  `poor_website` valgono anche per gli alloggi; `menu_ads`,
  `instagram_menu_only` ed `events_no_website` no.
- Testi di riserva dedicati per B&B e case vacanza (AI non disponibile e
  modalità demo).

## 5. Contatti

- WhatsApp resta il canale principale, con le regole attuali.
- Nuovo pulsante **Instagram**, per locali e alloggi, quando il profilo è
  noto: copia il messaggio e apre il profilo; l'utente incolla nel DM.
  Nessun invio automatico.
- Facebook invariato.

## 6. Demo

Due o tre alloggi fittizi (un B&B con sito Booking, una casa vacanza senza
sito) per provare la sezione senza credenziali e senza chiamare provider.

## 7. Test

- Separazione: la lista `/alloggi` contiene solo alloggi; la lista locali
  nessun alloggio; Precedente/Successivo da un alloggio non raggiungono mai
  un locale e viceversa, anche nella coda di una ricerca.
- Ricerca: le frasi per categoria; un risultato senza tipo di alloggio
  viene scartato; il portale nel campo sito produce `external_page_only`
  con evidenza.
- Punteggio: nessun doppio conteggio; ogni livello delle tre voci; tetti e
  penalità; ricalcolo dei lead esistenti.
- Messaggi: contesto `portal_only`; la validazione accetta un messaggio
  alloggio senza menu/QR e con prenotazione diretta; rifiuta percentuali
  sulle commissioni; i locali continuano a rifiutare "prenotazione"; testi
  di riserva validi per entrambe le categorie.
- Pulsante Instagram presente solo con profilo noto e mai sui demo.

## Fuori da questo lavoro

Hotel, invio di email, invio automatico su qualunque canale, statistiche
separate per settore nella dashboard.
