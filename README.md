# Laboratorio Odontotecnico Roso Marcello - Backend Bridge

Questo repository contiene il sistema di gestione per le prenotazioni e i preventivi del Laboratorio Roso Marcello. Utilizza un'architettura bridge tra il sito web, Google Sheets e Telegram.

## Funzionamento
1. **Frontend**: Gestito in HTML/JS con integrazione Flatpickr per il calendario.
2. **Backend Bridge (Render)**: Server Node.js/Express che gestisce il traffico e risolve i problemi di CORS.
3. **Database (Google Sheets)**: Google Apps Script riceve i dati filtrati dal bridge e li salva sui fogli di calcolo.
4. **Notifiche (Telegram)**: Il sistema invia notifiche in tempo reale per accettare o rifiutare gli appuntamenti.

## Configurazione
### Variabili d'Ambiente (da impostare su Render)
- `GAS_URL`: L'URL pubblico della Web App di Google Apps Script.
- `ADMIN_TOKEN`: Token di sicurezza per le operazioni amministrative.

### Installazione Locale
Se desideri testare il bridge in locale:
```bash
npm install
npm start
```

## Autore
Laboratorio Roso Marcello