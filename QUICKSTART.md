# 🚀 QUICK START - 3 STEP PER ANDARE LIVE

**Tempo totale:** ~15 minuti

---

## STEP 1: Google Apps Script (5 min)

### A. Aggiungi SECRET
1. https://script.google.com → Seleziona progetto
2. ⚙️ Project Settings → Script Properties
3. "Add property" → `SECRET` = `FfHzEnYpmg32cIPuS7YZJvQEpoqrZuYFkw6GSvha-RI`
4. Salva

### B. Crea Trigger Backup Automatico
1. ⏰ Triggers (nella stessa pagina)
2. "Create trigger" → 
   - Function: `backupSheets`
   - Type: Weekly
   - Day: Monday
   - Time: 2:00 AM
3. Salva → Backup partirà automaticamente ogni lunedì!

### C. Rideploy Script
1. Deploy → New Deployment → Web app

---

## STEP 2: GitHub Push (5 min)

```bash
cd "c:\Users\maulu\Desktop\Nuova cartella (2)\Prova-Marcello-"
git add -A
git commit -m "production: security hardening + backup automation"
git push
```

✅ Render auto-deployerà

---

## STEP 3: Render Environment (5 min)

1. https://dashboard.render.com → Seleziona servizio
2. Settings → Environment
3. Copia tutte le variabili dal file `.env` locale:

```
TELEGRAM_TOKEN=<your-token>
TELEGRAM_CHAT_ID=<your-chat-id>
TELEGRAM_SECRET=<your-secret>
GOOGLE_SCRIPT_URL=<your-url>
GOOGLE_SCRIPT_SECRET=<your-secret>
BREVO_API_KEY=<your-api-key>
BREVO_ADMIN_RECIPIENT=<your-email>
BREVO_SENDER_EMAIL=<your-sender-email>
ALLOWED_ORIGIN=https://hehetzu.github.io
```

⚠️ **Copia i valori REALI dal file `.env` (non commitarlo su GitHub!)**

---

## ✅ VERIFICA

1. **Sito attivo?** https://marcello-bot.onrender.com/ 
   → Dovrebbe mostrare "Bot Telegram attivo ✅"

2. **Form funziona?** https://hehetzu.github.io
   → Compila form contatti
   → Ricevi email + Telegram?

3. **Rate limiting funziona?** Invia 6 form velocemente
   → Primo 5: ✅ Accettati
   → 6+: ❌ Error 429 (Rate limited - corretto!)

---

## 💾 BACKUP AUTOMATICO

- **Crea:** Ogni lunedì alle 2:00 AM (UTC)
- **Dove:** Google Drive folder "Backup_LaboratorioRoso"
- **Conserva:** Ultimi 12 backup
- **Contiene:** Copie di tutte le sheet (Appuntamenti, Preventivi, etc.)

---

## 🎉 FATTO!

Sito è **LIVE**, **100% SICURO**, e **BACKUP ATTIVATO**!

**URL Sito:** https://marcello-bot.onrender.com

---

**Info aggiuntive in:** `DEPLOYMENT_GUIDE.md` e `SECURITY_FIXES.md`
