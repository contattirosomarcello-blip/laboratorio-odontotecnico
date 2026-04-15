/**
 * Google Apps Script Backend - Laboratorio Odontotecnico Roso Marcello
 * Gestisce l'automazione dei fogli di calcolo e la ricezione dei dati.
 */

// Configurazione Telegram è gestita in PropertiesService per mantenere i segreti fuori dal codice
const SHEET_NAMES = {
  APPUNTAMENTO: "appuntamento",
  PREVENTIVO: "preventivo",
  VISITS: "visite"
};

// Intestazioni standard per i fogli di lavoro
const HEADERS = ["ID", "Data", "Nome", "Telefono", "Email", "Motivo", "Messaggio", "Stato", "TelegramChatId", "TelegramMessageId"];

const VALID_REQUEST_TYPES = ["preventivo", "appuntamento"];

function getSecretProperty(key) {
  // Utilizzo ESCLUSIVO delle Proprietà dello Script (Vault sicuro di Google)
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (value && String(value).trim() !== "") {
    return String(value).trim();
  }

  throw new Error(`Sicurezza: Proprietà '${key}' non configurata nel vault di sistema.`);
}

function getAdminToken() {
  const token = getSecretProperty("ADMIN_TOKEN");
  if (!token || token.length < 8) throw new Error("ADMIN_TOKEN non sicuro o non configurato.");
  return token;
}

function getTelegramToken() {
  return getSecretProperty("TELEGRAM_TOKEN");
}

function getTelegramChatId() {
  return getSecretProperty("TELEGRAM_CHAT_ID");
}

function isValidAdminRequest(params) {
  const tokenReceived = params ? params.admin_token : null;
  
  if (!tokenReceived) {
    console.warn("[Auth] Token mancante nella richiesta (params.admin_token è nullo).");
    return false;
  }

  // Normalizzazione rigorosa: rimuove spazi, tabulazioni e newline
  const received = String(tokenReceived).replace(/\s+/g, '');
  const expected = String(getAdminToken()).replace(/\s+/g, '');
  
  if (received !== expected) {
    console.warn(`[Auth] Mismatch - Ricevuto (len: ${received.length}), Atteso (len: ${expected.length})`);
    return false;
  }
  return true;
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
      
      // Se è il foglio visite, usiamo intestazioni diverse
      const isVisits = name === SHEET_NAMES.VISITS;
      const currentHeaders = isVisits ? ["Data e Ora", "Tipo Evento", "Dettagli"] : HEADERS;
      
      sheet.appendRow(currentHeaders);
      
      // Formattazione professionale dell'intestazione
      const headerRange = sheet.getRange(1, 1, 1, currentHeaders.length);
      headerRange.setFontWeight("bold")
                 .setBackground("#005f8d") // Deep Medical Blue dal brand
                 .setFontColor("#ffffff")
                 .setHorizontalAlignment("center");
      
      sheet.setFrozenRows(1); // Blocca la prima riga
      sheet.autoResizeColumns(1, currentHeaders.length);
      
      // Imposta il formato delle colonne Telefono e ID come "Testo" per evitare errori di formattazione
      if (!isVisits) {
        sheet.getRange("A:A").setNumberFormat("@"); // ID
        sheet.getRange("D:D").setNumberFormat("@"); // Telefono
      }
    }
  });
}

/**
 * Trigger che si attiva al momento dell'invio di un Google Form collegato.
 */
function onFormSubmit(e) {
  const namedValues = e.namedValues;
  const requestData = {
    name: namedValues['Nome'][0] || namedValues['Nome Studio Dentistico / Dottore'][0],
    email: namedValues['Email'][0] || namedValues['Email Professionale'][0],
    phone: namedValues['Telefono'][0],
    reason: namedValues['Motivo'][0] || namedValues['Tipo di intervento / Motivo'][0],
    notes: namedValues['Messaggio'][0] || namedValues['Note aggiuntive (opzionale)'][0],
    type: namedValues['Tipo'][0] || "appuntamento",
    date: namedValues['Data'][0] || ""
  };
  
  return processNewRequest(requestData);
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
        } else if (contents.message || contents.edited_message) {
          // Ignora messaggi testuali o modifiche ai messaggi per evitare errori nei log
          return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Update Telegram ignorato (non è una callback)" }))
            .setMimeType(ContentService.MimeType.TEXT);
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

    // Gestione Tracking Visita Pubblica (Sito Web)
    if (params.action === "trackPageVisit") {
      recordVisit("Visita Sito", params.details || "Home Page");
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
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
          if (!sheet) return;
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

        // Calcolo conteggio visite
        let visitCount = 0;
        const visitSheet = ss.getSheetByName(SHEET_NAMES.VISITS);
        if (visitSheet) {
          visitCount = Math.max(0, visitSheet.getLastRow() - 1);
        }

        const response = {
          requests: allData,
          stats: { visits: visitCount }
        };

        return ContentService.createTextOutput(JSON.stringify(response))
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

        // BUG FIX: Spostata notifica email fuori dal blocco Telegram per funzionare anche da Admin Hub Web
        const clientEmail = updateData && updateData.rowData ? String(updateData.rowData[4] || "").trim() : "";
        if (clientEmail && isValidEmail(clientEmail) && clientEmail.toLowerCase() !== "undefined") {
          sendEmailNotification({
            id: requestId,
            name: updateData.rowData[2],
            email: updateData.rowData[4],
            status: newStatus,
            type: updateData.type,
            reason: updateData.rowData[5],
            date: updateData.rowData[1],
            phone: updateData.rowData[3],
            notes: updateData.rowData[6]
          }, "STATUS_UPDATE");
        }

        if (isTelegram) {
          if (callbackQueryId) {
            answerTelegramCallback(callbackQueryId, updateData ? `✅ Richiesta ${newStatus}` : "⚠️ Errore: ID non trovato");
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

    const result = processNewRequest({
      name: sanitizeText(params.name),
      phone: sanitizeText(params.phone),
      email: sanitizeText(params.email),
      reason: sanitizeText(params.reason),
      notes: sanitizeText(params.notes),
      type: requestType,
      date: sanitizeText(params.date)
    });

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.TEXT);
      
  } catch (error) {
    try { LockService.getScriptLock().releaseLock(); } catch(e) {}
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * Logica centralizzata per elaborare una nuova richiesta
 */
function processNewRequest(data) {
  if (!data.name) throw new Error("Il nome è obbligatorio.");
  if (!data.email || !isValidEmail(data.email)) throw new Error("Email non valida.");
  if (!data.phone) throw new Error("Il telefono è obbligatorio.");

  checkAndCreateSheets();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheetName = data.type === "preventivo" ? SHEET_NAMES.PREVENTIVO : SHEET_NAMES.APPUNTAMENTO;
  const requestId = Utilities.getUuid();

  const telegramInfo = sendTelegramNotification({
    name: data.name,
    request_type: data.type,
    phone: data.phone,
    reason: data.reason,
    date: data.date,
    notes: data.notes
  }, requestId);

  try {
    sendEmailNotification({
      id: requestId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      reason: data.reason,
      date: data.date,
      notes: data.notes,
      type: data.type
    }, "NEW_REQUEST");
  } catch (e) {
    console.error("Errore invio email: " + e.message);
  }

  const rowData = [
    requestId,
    data.date || new Date().toLocaleString('it-IT'),
    data.name,
    data.phone,
    data.email,
    data.reason,
    data.notes,
    "PENDENTE",
    telegramInfo ? String(telegramInfo.chat_id) : "",
    telegramInfo ? String(telegramInfo.message_id) : ""
  ];

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  const sheet = ss.getSheetByName(targetSheetName);
  sheet.appendRow(rowData);
  SpreadsheetApp.flush();
  lock.releaseLock();

  return { status: "success", result: "success", id: requestId };
}

/**
 * Invia una notifica a Telegram
 */
function sendTelegramNotification(params, requestId) {
  const escapeHTML = (str) => str ? str.toString().replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m])) : '';

  if (!params) {
    console.warn("sendTelegramNotification: params è undefined. Verifica di non aver eseguito la funzione manualmente.");
    return null;
  }

  const name = escapeHTML(params.name);
  const type = escapeHTML(params.request_type || "Richiesta").toUpperCase();
  const phone = escapeHTML(params.phone);
  const reason = escapeHTML(params.reason);
  const date = escapeHTML(params.date || "N/A");
  const notes = escapeHTML(params.notes || "Nessuna");
  
  const cleanPhone = params.phone ? params.phone.replace(/\D/g, '') : "";
  const whatsappLink = cleanPhone ? `\n\n💬 <a href="https://wa.me/39${cleanPhone}">Apri chat WhatsApp</a>` : "";

  const message = `<b>🔔 Nuova Richiesta: ${type}</b>\n\n` + 
                  `👤 <b>Cliente:</b> ${name}\n` +
                  `📞 <b>Tel:</b> ${phone}\n` +
                  `🛠 <b>Motivo:</b> ${reason}\n` +
                  `📅 <b>Data/Ora:</b> ${date}\n` +
                  `📝 <b>Note:</b> ${notes}${whatsappLink}`;

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

  const cleanPhone = rowData[3] ? String(rowData[3]).replace(/\D/g, '') : "";
  const whatsappLink = cleanPhone ? `\n\n💬 <a href="https://wa.me/39${cleanPhone}">Apri chat WhatsApp</a>` : "";

  const text = `<b>🔔 Richiesta: ${type.toUpperCase()}</b>\n\n` +
               `👤 <b>Cliente:</b> ${escapeHTML(rowData[2])}\n` + 
               `📞 <b>Tel:</b> ${escapeHTML(rowData[3])}\n` +   
               `🛠 <b>Motivo:</b> ${escapeHTML(rowData[5])}\n` + 
               `📅 <b>Data:</b> ${escapeHTML(rowData[1])}\n` +
               `📝 <b>Note:</b> ${escapeHTML(rowData[6])}${whatsappLink}\n\n` + 
               `<b>Stato:</b> ${statusIcon} ${newStatus}`;

  try {
    UrlFetchApp.fetch(`https://api.telegram.org/bot${getTelegramToken()}/editMessageText`, {
      method: "post", contentType: "application/json",
      payload: JSON.stringify({
        chat_id: chatId, message_id: messageId, text: text, parse_mode: "HTML", reply_markup: { inline_keyboard: [] }
      })
    });
  } catch (e) {
    console.error("Errore modifica messaggio Telegram:", e.toString());
  }
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
  } catch (e) {
    console.error("Errore risposta callback Telegram:", e.toString());
  }
}

/**
 * Gestisce l'invio delle email (Nuova richiesta e aggiornamento stato)
 * Utilizza i template HTML se presenti nel progetto Google Apps Script.
 */
function sendEmailNotification(data, triggerType) {
  // Recupero esplicito dell'email dalle proprietà o fallback
  let adminEmail = PropertiesService.getScriptProperties().getProperty("ADMIN_EMAIL");
  
  try {
    if (!adminEmail || adminEmail.trim() === "") {
      adminEmail = Session.getEffectiveUser().getEmail();
    }
  } catch (e) {
    adminEmail = "contatti.rosomarcello@gmail.com";
  }

  // Fallback finale se tutto il resto fallisce
  if (!adminEmail || !adminEmail.includes("@")) {
    adminEmail = "contatti.rosomarcello@gmail.com";
  }
  
  console.log(`[Email Debug] Trigger: ${triggerType} | Admin Dest: ${adminEmail} | Cliente Dest: ${data.email}`);

  // Arricchiamo l'oggetto data con link utili per i template HTML
  if (data.phone && String(data.phone).trim() !== "") {
    const cleanPhone = String(data.phone).replace(/^\+/, '').replace(/\D/g, '');
    data.whatsappUrl = "https://wa.me/39" + cleanPhone;
    data.telUrl = "tel:" + cleanPhone;
  }

  if (triggerType === "NEW_REQUEST") {
    // 1. Email per il Laboratorio (Admin)
    if (isValidEmail(adminEmail) && adminEmail.toLowerCase() !== "undefined") {
      const adminTemplate = data.type === "preventivo" ? "preview_admin_preventivo" : "preview_admin_appuntamento";
      sendTemplatedEmail(adminEmail, `Nuova richiesta ${data.type}: ${data.name}`, adminTemplate, data);
    } else {
      console.warn("Email amministratore non trovata. Notifica admin saltata.");
    }

    // 2. Email di conferma per il Cliente (Ricevuta)
    const clientEmail = String(data.email || "").trim();
    if (isValidEmail(clientEmail) && clientEmail.toLowerCase() !== "undefined") {
      const clientTemplate = data.type === "preventivo" ? "preview_cliente_preventivo" : "preview_cliente_appuntamento";
      sendTemplatedEmail(clientEmail, `Ricezione richiesta - Laboratorio Roso Marcello`, clientTemplate, data);
    }

  } else if (triggerType === "STATUS_UPDATE") {
    // Email di esito per il Cliente
    const clientEmail = String(data.email || "").trim();
    if (!isValidEmail(clientEmail) || clientEmail.toLowerCase() === "undefined" || clientEmail === "") {
      console.warn("[Email] Aggiornamento stato annullato: email cliente non valida.");
      return;
    }

    const isAccepted = data.status === "ACCETTATO";
    const statusTemplate = isAccepted ? "preview_cliente_conferma" : "preview_cliente_rifiuto";
    sendTemplatedEmail(clientEmail, `Aggiornamento richiesta: ${data.status} - Laboratorio Roso Marcello`, statusTemplate, data);
  }
}

/**
 * Invia un'email utilizzando un template HTML se esiste, altrimenti fallback a testo semplice.
 */
function sendTemplatedEmail(to, subject, templateName, data) {
  if (!to || to.trim() === "" || !to.includes("@")) {
    console.error(`[Email] Destinatario non valido o mancante: "${to}". Invio annullato.`);
    return;
  }
  
  let htmlBody = "";
  console.log(`[Email Debug] Generazione corpo per: ${to} usando template: ${templateName}`);
  
  try {
    // 1. Prova a caricare il template HTML
    const htmlTemplate = HtmlService.createTemplateFromFile(templateName);
    htmlTemplate.data = data;
    htmlBody = htmlTemplate.evaluate().getContent();
  } catch (err) {
    const statusMsg = data.status ? `Stato richiesta: ${data.status}\n\n` : "";
    htmlBody = `Gentile ${data.name},<br><br>` +
               `${statusMsg.replace(/\n/g, '<br>')}` +
               `Dettagli della richiesta:<br>` +
               `- Tipo: ${data.type}<br>` +
               `- Motivo: ${data.reason}<br>` +
               `- Data: ${data.date || "N/A"}<br>` +
               `- Note: ${data.notes || "Nessuna"}<br><br>` +
               `Cordiali saluti,<br>` +
               `Laboratorio Odontotecnico Roso Marcello`;
  }

  try {
    // Passiamo a Brevo per massima affidabilità e invio "No-Reply"
    sendViaBrevo(to, subject, htmlBody);
  } catch (e) {
    console.error(`[Email Error] Fallimento invio a ${to}: ${e.message}`);
  }
}

/**
 * Invia l'email tramite le API di Brevo
 * Molto più stabile per sistemi automatizzati
 */
function sendViaBrevo(to, subject, htmlContent) {
  const apiKey = getSecretProperty("BREVO_API_KEY");
  if (!apiKey) {
    throw new Error("BREVO_API_KEY non configurata nelle proprietà dello script.");
  }

  // Recupera mittente e nome dalle proprietà per una gestione dinamica senza toccare il codice
  const senderEmail = PropertiesService.getScriptProperties().getProperty("SENDER_EMAIL") || "contatti.rosomarcello@gmail.com";
  const senderName = PropertiesService.getScriptProperties().getProperty("SENDER_NAME") || "Laboratorio Roso Marcello";

  const payload = {
    "sender": { "name": senderName, "email": senderEmail },
    "to": [{ "email": to }],
    "subject": subject,
    "htmlContent": htmlContent
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": { "api-key": apiKey },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  const response = UrlFetchApp.fetch("https://api.brevo.com/v3/smtp/email", options);

  if (response.getResponseCode() !== 201 && response.getResponseCode() !== 200) {
    throw new Error("Errore API Brevo: " + response.getContentText());
  }
  console.log(`[Brevo] Successo: Email inviata a ${to}`);
}

/**
 * Registra una visita o un evento nel foglio 'visite'
 */
function recordVisit(eventType, details = "") {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.VISITS);
    if (sheet) {
      sheet.appendRow([new Date().toLocaleString('it-IT'), eventType, details]);
      SpreadsheetApp.flush();
    }
  } catch (e) {
    console.error("Errore registrazione visita: " + e.toString());
  }
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
  Logger.log("📡 Telegram Webhook impostato correttamente su: " + url);
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
  recordVisit("Accesso Diretto URL", e.queryString || "Senza parametri");
  return ContentService.createTextOutput("Backend Laboratorio Roso Attivo").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * 1. Seleziona 'inizializzazioneUnaTantum' nel menu in alto.
 * 2. Clicca su 'Esegui'.
 * NOTA: Se usi Render, usa 'setWebhookRender' invece di 'setTelegramWebhook' standard.
 */
function setWebhookRender() {
  try {
    checkAndCreateSheets();
    const renderUrl = "https://laboratorio-odontotecnico.onrender.com/api/telegram-webhook";
    setTelegramWebhook(renderUrl); 
    Logger.log("🚀 Webhook configurato per passare attraverso il Bridge di Render: " + renderUrl);
  } catch (e) {
    Logger.log("❌ Errore critico durante la configurazione del Webhook: " + e.message);
    throw e;
  }
}

/**
 * Funzione di TEST per verificare l'invio delle email.
 * Invia una simulazione di nuova richiesta sia all'admin che all'email specificata.
 */
function testInvioEmail() {
  const miaEmail = Session.getEffectiveUser().getEmail();
  const mockData = {
    id: "TEST-UUID-12345",
    name: "Mario Rossi (Test)",
    email: miaEmail, // Inviamo a noi stessi anche come "cliente" per il test
    phone: "3331234567",
    reason: "Controllo Protesi Flessibile",
    date: "Venerdì 24 Maggio alle ore 10:30",
    notes: "Questa è una mail di test per verificare la grafica e l'invio doppio.",
    type: "appuntamento"
  };

  Logger.log("Avvio test invio email...");
  sendEmailNotification(mockData, "NEW_REQUEST");
  
  Logger.log("Avvio test notifica Telegram...");
  try {
    const telRes = sendTelegramNotification({
      name: mockData.name,
      request_type: mockData.type,
      phone: mockData.phone,
      reason: mockData.reason,
      date: mockData.date,
      notes: mockData.notes
    }, "TEST-ID-123");
    Logger.log(telRes ? "Notifica Telegram inviata!" : "Notifica Telegram fallita (controlla i log).");
  } catch (e) {
    Logger.log("Errore durante il test Telegram: " + e.message);
  }

  Logger.log("Test completato. Controlla Gmail e Telegram.");
}