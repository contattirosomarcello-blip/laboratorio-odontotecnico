# Laboratorio Odontotecnico Roso Marcello - Backend Bridge

Repository: [https://github.com/contattirosomarcello-blip/laboratorio-odontotecnico](https://github.com/contattirosomarcello-blip/laboratorio-odontotecnico)

Questo repository contiene il sistema di gestione per le prenotazioni e i preventivi del Laboratorio Roso Marcello. Utilizza un'architettura bridge tra il sito web, Google Sheets e Telegram.

## Funzionamento
1. **Frontend**: Gestito in HTML/JS con integrazione Flatpickr per il calendario.
2. **Backend Bridge (Render)**: Server Node.js/Express che gestisce il traffico e risolve i problemi di CORS.
3. **Database (Google Sheets)**: Google Apps Script riceve i dati filtrati dal bridge e li salva sui fogli di calcolo.
4. **Notifiche (Telegram)**: Il sistema invia notifiche in tempo reale per accettare o rifiutare gli appuntamenti.

## 🛠 Setup Rapido

1. **Google**: Distribuisci `codice.gs` come Web App (Accesso: Chiunque).
2. **GitHub**: Carica i file escludendo i segreti tramite `.gitignore`.
3. **Render**: Crea un Web Service, collega GitHub e imposta `GAS_URL` e `ADMIN_TOKEN` nell'Environment.
4. **Telegram**: Configura il Webhook puntando all'endpoint di Render.

Per i dettagli tecnici sui parametri, consulta il file CONFIGURAZIONE_FINALE.md.

### Installazione Locale
Se desideri testare il bridge in locale:
```bash
npm install
npm start
```

## Autore
Laboratorio Roso Marcello