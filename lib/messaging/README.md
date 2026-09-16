# Messaggi personalizzati

Il prompt attivo è in `prompt.ts`. `index.ts` contiene le bozze locali, i fatti
utilizzabili e i controlli sui messaggi; `../ai/index.ts` gestisce generazione,
verifica delle fonti e ripiego locale.

## Indicazioni recuperate dal repository

Ricostruite dalle modifiche Git, non dalla conversazione originale con Luna:

- `f611a19`: DM italiani naturali, apertura con ciao, paragrafi brevi, niente
  saluti formali o tono da agenzia, presentazione breve e chiusura tranquilla.
- `3803444`: menu, drink list o prodotti aggiornabili; QR quando pertinente.
- `805cfc7` e `af1a0c0`: distinguere sito non raggiungibile da sito da rifare.
- `8cd9be1`: niente complimenti costruiti o linguaggio pubblicitario.

Le vecchie istruzioni sul saluto e sulla lunghezza si contraddicevano. Ora c'è
un solo prompt: obiettivo 140–380 caratteri, limite 420, 2–3 righe.

## Comportamento

- Una sola osservazione documentata, collegata a un'idea concreta.
- Il messaggio non contiene il nome del locale, UUID o altri ID interni.
- Recensioni, stelle e popolarità non vengono passate all'AI né usate nel testo.
- Fonti con affidabilità almeno 70%; niente visite, foto o menu visti inventati.
- Un link mancante su Google non dimostra che il sito non esista.
- Un controllo fallito non dimostra un'interruzione per tutti: si chiede se il
  problema è temporaneo, senza presumere un ripristino o un restyling.
- Tono, riferimento alla zona, eventi, QR, restyling e demo seguono le preferenze.
- Senza fonti utilizzabili, la bozza locale fa una domanda senza diagnosticare
  problemi. Senza chiave AI o in demo non si chiama il provider.
- Le bozze locali passano gli stessi controlli prima di essere restituite dal
  generatore server. Le versioni salvate rimangono in cronologia.

I test verificano le regole e i contratti con risposte AI simulate. La qualità
dello stile richiede anche la lettura di risultati reali e il confronto con
esempi scritti dall'utente; i controlli testuali non sono una verifica semantica
completa di ogni possibile frase.
