# Gestione Piazzale

Applicazione web per la gestione del piazzale con funzionalità di ricerca e modifica dei dati.

## Requisiti

- Node.js (versione 14 o superiore)
- npm (versione 6 o superiore)

## Installazione

1. Clona il repository
2. Installa le dipendenze:
```bash
npm install
```

## Avvio dell'applicazione

1. Avvia il server backend:
```bash
node server.js
```

2. In un nuovo terminale, avvia l'applicazione React:
```bash
npm start
```

L'applicazione sarà disponibile all'indirizzo http://localhost:3000

## Funzionalità

- Visualizzazione di 10 celle orizzontali
- Barra di ricerca
- Card modificabili per ogni cella con campi:
  - ID
  - N
  - TR
  - Note
- Salvataggio automatico delle modifiche nel database SQLite 