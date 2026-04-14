/**
 * Google Apps Script Backend - Laboratorio Odontotecnico Roso Marcello
 * Gestisce l'automazione dei fogli di calcolo e la ricezione dei dati.
 */

// --- CONFIGURAZIONE MANUALE (Lasciare vuoto se le proprietà sono gestite in 'Impostazioni progetto > Proprietà script') ---
const CONFIG = {
  ADMIN_TOKEN: "",
  TELEGRAM_TOKEN: "",
  TELEGRAM_CHAT_ID: ""
};

// Configurazione Telegram è gestita in PropertiesService per mantenere i segreti fuori dal codice
const SHEET_NAMES = {
  APPUNTAMENTO: "appuntamento",
  PREVENTIVO: "preventivo"
};

// Intestazioni standard per i fogli di lavoro
const HEADERS = ["ID", "Data", "Nome", "Telefono", "Email", "Motivo", "Messaggio", "Stato", "TelegramChatId", "TelegramMessageId"];

const VALID_REQUEST_TYPES = ["preventivo", "appuntamento"];

function getSecretProperty(key) {
  // 1. Prova a leggere dalle Proprietà dello Script (Database interno sicuro)
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (value && String(value).trim() !== "") {
    return String(value).trim();
  }

  // 2. Fallback: Prova a leggere dall'oggetto CONFIG (utile se le Proprietà Script non sono ancora propagate)
  if (CONFIG[key] && String(CONFIG[key]).trim() !== "") {
    return String(CONFIG[key]).trim();
  }

  throw new Error("Proprietà mancante: " + key + ". Assicurati di averla inserita in 'Impostazioni progetto > Proprietà script' o nel blocco CONFIG all'inizio del file.");
}

function getAdminToken() {
  return getSecretProperty("ADMIN_TOKEN");
}

function getTelegramToken() {
  return getSecretProperty("TELEGRAM_TOKEN");
}

function getTelegramChatId() {
  return getSecretProperty("TELEGRAM_CHAT_ID");
}

function isValidAdminRequest(params) {
  return params && String(params.admin_token || "").trim() === getAdminToken();
}

function sanitizeText(str) {
  return str ? String(str).replace(/<[^>]*>/g, "").trim() : "";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

/**
 * Verifica se i fogli necessari esistono. In caso contrario, li crea con le intestazioni.
 */
function checkAndCreateSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  Object.values(SHEET_NAMES).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(HEADERS);
      
      // Formattazione professionale dell'intestazione
      const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
      headerRange.setFontWeight("bold")
                 .setBackground("#005f8d") // Deep Medical Blue dal brand
                 .setFontColor("#ffffff")
                 .setHorizontalAlignment("center");
      
      sheet.setFrozenRows(1); // Blocca la prima riga
      sheet.autoResizeColumns(1, HEADERS.length);
    }
  });
}

/**
 * Gestisce le richieste POST (Invio form dal sito)
 */
function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    let params = e.parameter || {};
    let isTelegram = false;
    let callbackQueryId = null;

    // Rileva se la richiesta arriva da un pulsante Telegram (Update di tipo callback_query)
    if (e.postData && e.postData.contents) {
      try {
        const contents = JSON.parse(e.postData.contents);
        
        // Gestione Callback Query (Pulsanti Telegram)
        if (contents && contents.callback_query) {
          console.log("Rilevata Callback Query da Telegram:", contents.callback_query.data);
          isTelegram = true;
          callbackQueryId = contents.callback_query.id;
          const data = String(contents.callback_query.data || ""); // Formato inviato: accept_UUID o reject_UUID
          const [actionKey, ...rest] = data.split("_");
          const requestId = rest.join("_");
          const action = actionKey === "accept" ? "acceptRequest" : actionKey === "reject" ? "rejectRequest" : null;

          params = {
            action: action,
            id: requestId,
            telegram_chat_id: contents.callback_query.message ? contents.callback_query.message.chat.id : contents.callback_query.from.id,
            telegram_message_id: contents.callback_query.message ? contents.callback_query.message.message_id : null
          };

          if (!params.action || !params.id) {
            throw new Error("Callback Telegram non valido.");
          }
        }
      } catch (err) {
        // Non è un JSON o non è un callback di Telegram, procedi normalmente
      }
    }

    // Anti-spam honeypot
    if (!isTelegram && params.honeypot && String(params.honeypot).trim() !== "") {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Spam rilevato." }))
        .setMimeType(ContentService.MimeType.TEXT);
    }

    if (params.action) {
      // Sicurezza: Verifica il Token Admin (Sito) o il Chat ID (Telegram)
      if (isTelegram) {
        const authorizedChatId = String(getTelegramChatId()).trim();
        const incomingChatId = String(params.telegram_chat_id).trim();
        
        if (incomingChatId !== authorizedChatId) {
          throw new Error("Chat ID non autorizzato.");
        }
      } else if (!isValidAdminRequest(params)) {
        Utilities.sleep(2000); // Ritardo di 2 secondi per rallentare eventuali attacchi brute-force
        return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Token amministratore non valido." }))
          .setMimeType(ContentService.MimeType.TEXT);
      }

      const lock = LockService.getScriptLock();

      if (params.action === "getRequests") {
        let allData = [];
        [SHEET_NAMES.APPUNTAMENTO, SHEET_NAMES.PREVENTIVO].forEach(name => {
          const sheet = ss.getSheetByName(name);
          const rows = sheet.getDataRange().getValues();
          if (rows.length <= 1) return;
          
          rows.shift(); // Rimuovi intestazioni

          rows.forEach(row => {
            if (!row[0]) return; // Salta righe vuote
            allData.push({
              id: row[0], date: row[1], name: row[2], phone: row[3],
              email: row[4], reason: row[5], notes: row[6], status: row[7],
              type: name
            });
          });
        });

        return ContentService.createTextOutput(JSON.stringify(allData))
          .setMimeType(ContentService.MimeType.TEXT);
      }

      if (params.action === "acceptRequest" || params.action === "rejectRequest") {
        const requestId = sanitizeText(params.id);
        if (!requestId) throw new Error("ID richiesta mancante.");

        checkAndCreateSheets();
        
        // Acquisiamo il lock solo per la fase di ricerca e scrittura sul foglio
        lock.waitLock(20000); 
        const newStatus = params.action === "acceptRequest" ? "ACCETTATO" : "RIFIUTATO";
        let updateData = null;

        [SHEET_NAMES.APPUNTAMENTO, SHEET_NAMES.PREVENTIVO].forEach(name => {
          if (updateData) return;
          const sheet = ss.getSheetByName(name);
          const data = sheet.getDataRange().getValues();

          for (let i = 1; i < data.length; i++) {
            // Confronto ID (UUID) ignorando maiuscole/minuscole e spazi
            if (String(data[i][0]).trim() === String(requestId).trim()) {
              const statusCol = 8; // Colonna "Stato"
              sheet.getRange(i + 1, statusCol).setValue(newStatus);
              
              // Salviamo i dati necessari per Telegram prima di chiudere il lock
              updateData = {
                chatId: isTelegram ? params.telegram_chat_id : data[i][8],
                msgId: isTelegram ? params.telegram_message_id : data[i][9],
                rowData: data[i],
                type: name,
                status: newStatus
              };
              break;
            }
          }
        });
        
        lock.releaseLock(); // Rilasciamo il lock PRIMA di chiamare le API di Telegram (che sono lente)

        if (updateData && updateData.chatId && updateData.msgId) {
          editTelegramMessage(updateData.chatId, updateData.msgId, updateData.status, updateData.rowData, updateData.type);
        }

        if (isTelegram) {
          if (callbackQueryId) {
            answerTelegramCallback(callbackQueryId, updateData ? `Richiesta ${newStatus}` : "Errore: ID non trovato");
          }
          if (!updateData) {
            // Se non trovato, invia un messaggio di avviso
            UrlFetchApp.fetch(`https://api.telegram.org/bot${getTelegramToken()}/sendMessage`, {
              method: "post",
              contentType: "application/json",
              payload: JSON.stringify({ chat_id: params.telegram_chat_id, text: "⚠️ Impossibile aggiornare: ID non trovato nel foglio." })
            });
          }
        }

        return ContentService.createTextOutput(JSON.stringify({ status: updateData ? "success" : "error" }))
          .setMimeType(ContentService.MimeType.TEXT);
      }

      if (lock.hasLock()) lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Azione non supportata." }))
        .setMimeType(ContentService.MimeType.TEXT);
    }

    const requestType = sanitizeText(params.request_type);
    if (!VALID_REQUEST_TYPES.includes(requestType)) throw new Error("Tipo di richiesta non valido.");

    const name = sanitizeText(params.name);
    const phone = sanitizeText(params.phone);
    const email = sanitizeText(params.email);
    const reason = sanitizeText(params.reason);
    const notes = sanitizeText(params.notes || "");
    const date = sanitizeText(params.date || "");

    if (!name) throw new Error("Il nome è obbligatorio.");
    if (!email || !isValidEmail(email)) throw new Error("Email non valida.");
    if (!phone) throw new Error("Il telefono è obbligatorio.");
    if (!reason) throw new Error("Il motivo è obbligatorio.");
    if (requestType === "appuntamento" && !date) throw new Error("La data è obbligatoria per gli appuntamenti.");

    checkAndCreateSheets();
    const targetSheetName = requestType === "preventivo" ? SHEET_NAMES.PREVENTIVO : SHEET_NAMES.APPUNTAMENTO;
    const requestId = Utilities.getUuid();

    const telegramMessageInfo = sendTelegramNotification({
      name: name,
      request_type: requestType,
      phone: phone,
      reason: reason,
      date: date,
      notes: notes
    }, requestId);

    const rowData = [
      requestId,
      date || new Date().toLocaleString('it-IT'),
      name,
      phone,
      email,
      reason,
      notes,
      "PENDENTE",
      telegramMessageInfo ? String(telegramMessageInfo.chat_id) : "",
      telegramMessageInfo ? String(telegramMessageInfo.message_id) : ""
    ];

    const lock = LockService.getScriptLock();
    lock.waitLock(20000); // Lock solo per l'append finale
    const sheet = ss.getSheetByName(targetSheetName);
    sheet.appendRow(rowData);
    lock.releaseLock();
    
    const response = {
      status: "success",
      result: "success",
      id: requestId
    };

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.TEXT);
      
  } catch (error) {
    try { LockService.getScriptLock().releaseLock(); } catch(e) {}
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * Invia una notifica a Telegram
 */
function sendTelegramNotification(params, requestId) {
  const escapeHTML = (str) => str ? str.toString().replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m])) : '';

  const name = escapeHTML(params.name);
  const type = escapeHTML(params.request_type || "Richiesta").toUpperCase();
  const phone = escapeHTML(params.phone);
  const reason = escapeHTML(params.reason);
  const date = escapeHTML(params.date || "N/A");
  const notes = escapeHTML(params.notes || "Nessuna");

  const message = `<b>🔔 Nuova Richiesta: ${type}</b>\n\n` +
                  `👤 <b>Cliente:</b> ${name}\n` +
                  `📞 <b>Tel:</b> ${phone}\n` +
                  `🛠 <b>Motivo:</b> ${reason}\n` +
                  `📅 <b>Data/Ora:</b> ${date}\n` +
                  `📝 <b>Note:</b> ${notes}`;

  const payload = {
    chat_id: getTelegramChatId(),
    text: message,
    parse_mode: "HTML"
  };

  if (params.request_type === "appuntamento") {
    payload.reply_markup = {
      inline_keyboard: [[
        { text: "✅ Accetta", callback_data: `accept_${requestId}` },
        { text: "❌ Rifiuta", callback_data: `reject_${requestId}` }
      ]]
    };
  }

  try {
    const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${getTelegramToken()}/sendMessage`, {
      method: "post", contentType: "application/json", payload: JSON.stringify(payload)
    });
    const res = JSON.parse(response.getContentText());
    return { chat_id: res.result.chat.id, message_id: res.result.message_id };
  } catch (e) { return null; }
}

/**
 * Aggiorna il messaggio Telegram esistente
 */
function editTelegramMessage(chatId, messageId, newStatus, rowData, type) {
  const statusIcon = newStatus === "ACCETTATO" ? "✅" : "❌";
  const escapeHTML = (str) => str ? str.toString().replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m])) : '';

  if (!rowData || rowData.length < 7) return; // Evita errori se rowData è incompleto

  const text = `<b>🔔 Richiesta: ${type.toUpperCase()}</b>\n\n` +
               `👤 <b>Cliente:</b> ${escapeHTML(rowData[2])}\n` + 
               `📞 <b>Tel:</b> ${escapeHTML(rowData[3])}\n` +   
               `🛠 <b>Motivo:</b> ${escapeHTML(rowData[5])}\n` + 
               `📅 <b>Data:</b> ${escapeHTML(rowData[1])}\n` +
               `📝 <b>Note:</b> ${escapeHTML(rowData[6])}\n\n` + 
               `<b>Stato:</b> ${statusIcon} ${newStatus}`;

  try {
    UrlFetchApp.fetch(`https://api.telegram.org/bot${getTelegramToken()}/editMessageText`, {
      method: "post", contentType: "application/json",
      payload: JSON.stringify({
        chat_id: chatId, message_id: messageId, text: text, parse_mode: "HTML", reply_markup: { inline_keyboard: [] }
      })
    });
  } catch (e) {}
}

/**
 * Notifica a Telegram che il callback è stato processato (toglie il caricamento dai pulsanti)
 */
function answerTelegramCallback(callbackQueryId, text) {
  try {
    UrlFetchApp.fetch(`https://api.telegram.org/bot${getTelegramToken()}/answerCallbackQuery`, {
      method: "post", contentType: "application/json",
      payload: JSON.stringify({ callback_query_id: callbackQueryId, text: text, show_alert: false })
    });
  } catch (e) {}
}

function getPublicWebhookUrl() {
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    throw new Error("Devi prima distribuire lo script come Web App (Nuova Distribuzione).");
  }

  Logger.log("Raw Script URL: " + url);

  let publicUrl = url;
  publicUrl = publicUrl.replace(/\/dev(\?.*)?$/, "/exec$1");
  if (!publicUrl.includes("/exec")) {
    publicUrl = publicUrl.replace(/\/dev/, "/exec");
  }

  Logger.log("Public Webhook URL: " + publicUrl);
  return publicUrl;
}

function setTelegramWebhook(customUrl) {
  const url = customUrl || getPublicWebhookUrl();
  const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${getTelegramToken()}/setWebhook`, {
    method: "post",
    payload: { url: url }
  });
  Logger.log("Webhook impostato su: " + url);
  Logger.log(response.getContentText());
}

function getTelegramWebhookInfo() {
  const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${getTelegramToken()}/getWebhookInfo`);
  const info = JSON.parse(response.getContentText());
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

/**
 * Gestisce le richieste GET (Admin Hub per visualizzare le richieste)
 */
function doGet(e) {
  return ContentService.createTextOutput("Backend Laboratorio Roso Attivo").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * 1. Seleziona 'inizializzazioneUnaTantum' nel menu in alto.
 * 2. Clicca su 'Esegui'.
 * NOTA: Se usi Render, usa 'setWebhookRender' invece di 'setTelegramWebhook' standard.
 */
function setWebhookRender() {
  checkAndCreateSheets();
  const renderUrl = "https://laboratorio-odontotecnico.onrender.com/api/telegram-webhook";
  setTelegramWebhook(renderUrl);
  Logger.log("🚀 Webhook forzato su Render: " + renderUrl);
}