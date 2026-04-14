# 📋 Promemoria Configurazione Finale

Segui questa lista per configurare correttamente tutti i componenti del sistema.

---

## 1. Google Apps Script (Database & Automazione)
**Dove:** [script.google.com](https://script.google.com) -> Impostazioni Progetto -> Proprietà Script

| Chiave | Valore | Note |
| :--- | :--- | :--- |
| `ADMIN_TOKEN` | `DentalTech_2024_Safe!#` | Password per l'Admin Hub e comunicazioni sicure |
| `TELEGRAM_TOKEN` | `8026656517:AAEaT7Yah7qQ2JOJ1ozh7lJ-RY7YgvETaIA` | Token univoco del tuo Bot |
| `TELEGRAM_CHAT_ID` | `147586543` | Il tuo ID personale per le notifiche push |

**Importante:** Esegui una "Nuova Distribuzione" come **Applicazione Web**, impostando l'accesso a **"Chiunque"**. Copia l'URL che finisce in `/exec`.

---

## 2. Render (Backend Bridge)
**Dove:** dashboard.render.com -> Tuo Servizio -> Environment

| Chiave | Valore |
| :--- | :--- |
| `GAS_URL` | `https://script.google.com/macros/s/AKfycbw7m4GI69Q3LpzWcdYnlOTX8-6kHW9ejlrVUE0kPiBtq8ZXqoQI-cuIT2d-JsIBRq0Z/exec` |
| `ADMIN_TOKEN` | Lo stesso token inserito su Google |

**Build Command:** `npm install`
**Start Command:** `node server.js`

---

## 3. Webhook Telegram
**Operazione da fare una sola volta:**
Dopo che il servizio su Render è "Live", copia il suo URL (es. `https://laboratorio-odontotecnico.onrender.com`).
In Google Apps Script, apri il file `codice.gs` ed esegui manualmente la funzione:
```javascript
setTelegramWebhook("https://TUO-URL-RENDER.onrender.com/api/telegram-webhook");
```

---

## 4. Frontend (Sito Web)
**File:** `appointments.js`

Assicurati che la variabile `scriptURL` punti al server Render:
```javascript
const scriptURL = 'https://laboratorio-odontotecnico.onrender.com/api/prenotazioni';
```

---

## 5. Admin Hub (Gestione Manuale)
**File:** `admin-hub.html`

Per accedere all'hub e accettare/rifiutare le richieste dal browser, usa l' `ADMIN_TOKEN` come password.