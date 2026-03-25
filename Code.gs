var SHEET_APPUNTAMENTI = "Appuntamenti";
var SHEET_PREVENTIVI = "Preventivi";

function doGet(e) {
  var params = e.parameter;
  
  if (params.date) {
    return checkAvailability(params.date);
  }
  
  return ContentService.createTextOutput(JSON.stringify({status: "alive", message: "Google Script attivo"}))
    .setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  // VALIDATE SECRET TOKEN
  var storedSecret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!storedSecret || e.parameter.secret !== storedSecret) {
    return ContentService.createTextOutput('Unauthorized').setMimeType(ContentService.MimeType.TEXT);
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return responseJSON("error", "Server occupato, riprova tra qualche secondo.");
  }

  try {
    var data;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (e.postData && e.postData.type == "application/json") {
      try {
        data = JSON.parse(e.postData.contents);
      } catch(err) {
        data = e.parameter; // Fallback
      }
    } else {
      data = e.parameter;
    }

    if (data.action == "track_visit") {
      var sheetVisite = ss.getSheetByName("Visite");
      if (!sheetVisite) {
        sheetVisite = ss.insertSheet("Visite");
        sheetVisite.getRange("A1").setValue("TOTALE VISITE:");
        sheetVisite.getRange("B1").setValue(0);
        sheetVisite.getRange("A1:B1").setFontWeight("bold").setFontSize(14);
      }
      
      var cell = sheetVisite.getRange("B1");
      cell.setValue((Number(cell.getValue()) || 0) + 1);
      
      return responseJSON("success", "Visita contata");
    }

    var sheetApp = ss.getSheetByName(SHEET_APPUNTAMENTI);
    var sheetPrev = ss.getSheetByName(SHEET_PREVENTIVI);

    if (!sheetApp) {
      sheetApp = ss.insertSheet(SHEET_APPUNTAMENTI);
      sheetApp.appendRow(["Timestamp", "Nome", "Email", "Telefono", "Data", "Ora", "Stato", "Messaggio", "Tipo"]);
    }
    if (!sheetPrev) {
      sheetPrev = ss.insertSheet(SHEET_PREVENTIVI);
      sheetPrev.appendRow(["Timestamp", "Nome", "Email", "Telefono", "Messaggio", "Tipo"]);
    }

    if (data.action == "delete_row") {
      return deleteRow(sheetApp, data.date, data.time);
    }

    if (data.action == "update_status") {
      return updateStatus(sheetApp, data.date, data.time, data.status);
    }

    var tipo = data.tipo_richiesta || "preventivo";

    if (tipo == "appuntamento") {
      var date = data.data_appuntamento;
      var time = data.ora_appuntamento;

      if (isBooked(sheetApp, date, time)) {
        return responseJSON("error", "Orario " + time + " del " + date + " già occupato.");
      }

      sheetApp.appendRow([
        new Date(),
        data.name,
        data.email,
        data.phone || data.telefono,
        "'" + date, 
        "'" + time,
        "In Attesa",
        data.message,
        tipo
      ]);

      return responseJSON("success", "Appuntamento richiesto con successo");

    } else {
      sheetPrev.appendRow([
        new Date(),
        data.name,
        data.email,
        data.phone || data.telefono,
        data.message,
        tipo
      ]);
      return responseJSON("success", "Richiesta preventivo salvata");
    }

  } catch (err) {
    return responseJSON("error", "Errore interno script: " + err.toString());
  } finally {
    lock.releaseLock();
  }
}

function responseJSON(result, message, extra) {
  var payload = {
    result: result,
    message: message
  };
  if (extra) {
    for (var key in extra) {
      payload[key] = extra[key];
    }
  }
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function isBooked(sheet, dateStr, timeStr) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  
  var data = sheet.getRange(2, 5, lastRow - 1, 3).getValues(); 
  
  for (var i = 0; i < data.length; i++) {
    var rowDate = String(data[i][0]).replace(/'/g, "").trim();
    var rowTime = String(data[i][1]).replace(/'/g, "").trim();
    var rowStatus = String(data[i][2]);

    if (rowDate == dateStr && rowTime == timeStr && rowStatus != "Rifiutato") {
      return true;
    }
  }
  return false;
}

function updateStatus(sheet, dateStr, timeStr, newStatus) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return responseJSON("error", "Nessun dato trovato");

  var range = sheet.getRange(2, 5, lastRow - 1, 3);
  var allDataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  var allData = allDataRange.getValues();

  for (var i = 0; i < allData.length; i++) {
    var rowDate = String(allData[i][4]).replace(/'/g, "").trim();
    var rowTime = String(allData[i][5]).replace(/'/g, "").trim();

    if (rowDate == dateStr && rowTime == timeStr) {
      sheet.getRange(i + 2, 7).setValue(newStatus);
      
      var clientName = allData[i][1];
      var clientEmail = allData[i][2];

      return responseJSON("success", "Stato aggiornato a " + newStatus, {
        clientName: clientName,
        clientEmail: clientEmail
      });
    }
  }

  return responseJSON("error", "Prenotazione non trovata per " + dateStr + " " + timeStr);
}

function deleteRow(sheet, dateStr, timeStr) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return responseJSON("success", "Foglio già vuoto");

  var data = sheet.getRange(2, 5, lastRow - 1, 2).getValues();
  var deleted = false;
  
  for (var i = data.length - 1; i >= 0; i--) {
    var rowDate = String(data[i][0]).replace(/'/g, "").trim();
    var rowTime = String(data[i][1]).replace(/'/g, "").trim();
    
    var normalizedRowDate = rowDate.replace(/^0/, "").replace(/\/0/g, "/");
    var normalizedInputDate = dateStr.replace(/^0/, "").replace(/\/0/g, "/");

    if ((rowDate == dateStr || normalizedRowDate == normalizedInputDate) && rowTime == timeStr) {
      sheet.deleteRow(i + 2);
      deleted = true;
    }
  }
  
  return responseJSON("success", deleted ? "Riga eliminata" : "Nessuna riga trovata da eliminare");
}

function checkAvailability(dateStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_APPUNTAMENTI);
  if (!sheet) return responseJSON("success", "Sheet not found", {bookedSlots: []});

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return responseJSON("success", "Empty", {bookedSlots: []});

  var data = sheet.getRange(2, 5, lastRow - 1, 3).getValues();
  var booked = [];

  for (var i = 0; i < data.length; i++) {
    var rowDate = String(data[i][0]).replace(/'/g, "").trim();
    var rowTime = String(data[i][1]).replace(/'/g, "").trim();
    var rowStatus = String(data[i][2]);

    if (rowDate == dateStr && rowStatus != "Rifiutato") {
      booked.push({
        time: rowTime,
        status: (rowStatus == "Confermato" ? "confirmed" : "pending")
      });
    }
  }
  
  return responseJSON("success", "Slots retrieved", {bookedSlots: booked});
}

// BACKUP FUNCTION - Triggered weekly (Monday 2 AM)
function backupSheets() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var spreadsheetId = ss.getId();
    var fileName = "Backup_" + new Date().toISOString().split('T')[0] + "_" + Utilities.getUuid().substring(0, 8);
    
    // Get or create backup folder
    var folders = DriveApp.getFoldersByName("Backup_LaboratorioRoso");
    var backupFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder("Backup_LaboratorioRoso");
    
    // Copy entire spreadsheet
    var copiedFile = DriveApp.getFileById(spreadsheetId).makeCopy(fileName, backupFolder);
    
    // Delete backups older than 12 weeks (keep last 12)
    var files = backupFolder.getFilesByName(RegExp("^Backup_"));
    var fileList = [];
    while (files.hasNext()) {
      fileList.push(files.next());
    }
    
    if (fileList.length > 12) {
      fileList.sort((a, b) => a.getLastUpdated() - b.getLastUpdated());
      for (var i = 0; i < fileList.length - 12; i++) {
        fileList[i].setTrashed(true);
      }
    }
    
    Logger.log("✅ Backup created: " + fileName);
    return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Backup created"}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    Logger.log("❌ Backup error: " + err);
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}