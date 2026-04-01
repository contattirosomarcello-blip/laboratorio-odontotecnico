// Codice per Google Apps Script

// CONFIGURAZIONE: Deve corrispondere al GOOGLE_SCRIPT_SECRET nel tuo file .env di Python
const SECRET_KEY = "FfHzEnYpmg32cIPuS7YZJvQEpoqrZuYFkw6GSvha-RI"; 

/**
 * Gestisce le richieste GET (es. controllo disponibilità orari dal frontend)
 */
function doGet(e) {
  const date = e.parameter.date;
  if (!date) return createResponse({ error: "Data non fornita" });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Richieste");
  
  let occupied = [];
  let pending = [];

  if (sheet) {
    const data = sheet.getDataRange().getValues();
    // Struttura colonne ipotizzata: 
    // 0:Timestamp, 1:Nome, 2:Email, 3:Tel, 4:Msg, 5:Tipo, 6:DataApp, 7:OraApp, 8:Stato
    for (let i = 1; i < data.length; i++) {
      const rowDate = String(data[i][6]);
      const rowTime = String(data[i][7]);
      const rowStatus = String(data[i][8]);

      if (rowDate === String(date)) {
        if (rowStatus === "Confermato") {
          occupied.push(rowTime);
        } else if (rowStatus === "Pending") {
          pending.push(rowTime);
        }
      }
    }
  }

  return createResponse({ occupied: occupied, pending: pending });
}

/**
 * Gestisce le richieste POST (salvataggio richieste e aggiornamento stato da Python)
 */
function doPost(e) {
  const params = e.parameter;
  const action = params.action;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Azione: Aggiunta di una nuova richiesta (Contatto o Appuntamento)
  if (action === "add_request" || !action) {
    const sheet = getOrCreateSheet(ss, "Richieste", ["Timestamp", "Nome", "Email", "Telefono", "Messaggio", "Tipo", "Data App", "Ora App", "Stato"]);
    
    sheet.appendRow([
      new Date(),
      params.name || params.nome || "N/A",
      params.email || "N/A",
      params.telefono || params.phone || "N/A",
      params.message || params.messaggio || "",
      params.tipo_richiesta || (params.date ? "appuntamento" : "preventivo"),
      params.data_appuntamento || params.date || "",
      params.ora_appuntamento || params.time || "",
      (params.data_appuntamento || params.date) ? "Pending" : "N/A"
    ]);
    return createResponse({ status: "success" });
  }

  // Azione: Aggiornamento Stato (chiamato dal backend Python/Telegram)
  if (action === "update_status") {
    if (params.secret !== SECRET_KEY) return createResponse({ error: "unauthorized" });
    
    const sheet = ss.getSheetByName("Richieste");
    if (!sheet) return createResponse({ error: "Sheet not found" });
    
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][6]) === String(params.date) && String(data[i][7]) === String(params.time)) {
        sheet.getRange(i + 1, 9).setValue(params.status);
        // Restituisce i dati del cliente per permettere a Python di inviare la notifica Telegram
        return createResponse({
          nome: data[i][1],
          email: data[i][2],
          telefono: data[i][3],
          messaggio: data[i][4]
        });
      }
    }
    return createResponse({ error: "Appuntamento non trovato" });
  }

  // Azione: Tracciamento Visite
  if (action === "track_visit") {
    const sheet = getOrCreateSheet(ss, "Visite", ["Timestamp"]);
    sheet.appendRow([new Date()]);
    return createResponse({ status: "success" });
  }

  return createResponse({ error: "Azione non valida" });
}

/**
 * Helper per creare la risposta JSON corretta
 */
function createResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Helper per recuperare o creare un foglio con intestazioni se non esiste
 */
function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}