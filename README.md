# Laboratorio Odontotecnico Roso Marcello - Backend

Questo repository contiene il backend Flask per la gestione delle prenotazioni e dei contatti del Laboratorio Odontotecnico Roso Marcello. Il sistema integra diverse API per automatizzare il flusso di lavoro, dalla ricezione della richiesta sul sito web alla notifica immediata via Telegram e conferma tramite email.

## 🚀 Funzionalità principali

- **Gestione Appuntamenti:** Integrazione con un calendario frontend (Flatpickr) per la selezione di date e orari.
- **Verifica Disponibilità:** Controllo in tempo reale degli slot liberi tramite Google Sheets.
- **Notifiche Telegram:** Invio automatico di dettagli sulla prenotazione a un bot Telegram dedicato, con pulsanti integrati per confermare o rifiutare l'appuntamento direttamente dalla chat.
- **Email Marketing & Transazionali:** Invio di email di conferma a clienti e amministratori tramite l'API di **Brevo** (ex Sendinblue).
- **Database Google Sheets:** Salvataggio automatico di ogni richiesta di contatto e tracciamento delle visite tramite Google Apps Script.
- **Sicurezza:** Implementazione di Rate Limiting (Flask-Limiter) e validazione dei token segreti per i webhook di Telegram.

## 🛠️ Tecnologie utilizzate

- **Linguaggio:** Python 3.x
- **Framework:** Flask
- **Sicurezza:** Flask-CORS, Flask-Limiter
- **Integrazioni:**
  - Telegram Bot API (Webhook)
  - Brevo API v3 (SMTP/Email)
  - Google Apps Script (Database/Disponibilità)

## 📋 Requisiti

- Python 3.8+
- Un account Brevo per le chiavi API.
- Un Bot Telegram creato tramite [@BotFather](https://t.me/botfather).
- Uno script Google Apps Script configurato per interagire con un foglio Google.

## ⚙️ Configurazione

Crea un file `.env` nella root del progetto e aggiungi le seguenti variabili:

```env
TELEGRAM_TOKEN=il_tuo_token_bot
TELEGRAM_CHAT_ID=il_tuo_chat_id
TELEGRAM_SECRET=un_token_segreto_per_il_webhook
BREVO_API_KEY=la_tua_chiave_api_brevo
BREVO_SENDER_EMAIL=email_mittente@esempio.com
BREVO_ADMIN_RECIPIENT=email_destinatario_admin@esempio.com
GOOGLE_SCRIPT_URL=url_del_tuo_google_apps_script
GOOGLE_SCRIPT_SECRET=chiave_segreta_per_lo_script
ALLOWED_ORIGIN=https://tuo-frontend.github.io
```

## 📦 Installazione Locale

1. Clona il repository:
   ```bash
   git clone https://github.com/hehetzu/Prova-Marcello-.git
   cd Prova-Marcello-
   ```

2. Crea un ambiente virtuale e attivalo:
   ```bash
   python -m venv venv
   # Su Windows:
   venv\Scripts\activate
   ```

3. Installa le dipendenze:
   ```bash
   pip install -r requirements.txt
   ```

4. Avvia il server:
   ```bash
   python app.py
   ```

## 🧪 Testing

È disponibile uno script di test (`test_backend.py`) per verificare il corretto funzionamento di tutte le rotte API (Contatti, Appuntamenti, Disponibilità, Webhook Telegram) senza dover utilizzare il frontend.

## 🌐 Deploy

Il progetto è configurato per essere ospitato facilmente su **Render**, **Heroku** o servizi simili. Ricordati di impostare le variabili d'ambiente nel pannello di controllo dell'hosting scelto.