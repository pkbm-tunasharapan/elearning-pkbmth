// ============================================
// SHEET UTILITIES
// ============================================

function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function getSheetData(name) {
  var sheet = getSheet(name);
  return sheet.getDataRange().getValues();
}

function getSheetHeaders(name) {
  var data = getSheetData(name);
  return data.length > 0 ? data[0] : [];
}

function clearSheetData(name) {
  var sheet = getSheet(name);
  sheet.clear();
  return sheet;
}

function saveToSheet(name, data, headers) {
  var sheet = clearSheetData(name);
  
  if (headers) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  
  if (data && data.length > 0) {
    var startRow = headers ? 2 : 1;
    var range = sheet.getRange(startRow, 1, data.length, data[0].length);
    range.clearDataValidations();
    range.setValues(data);
    sheet.autoResizeColumns(1, data[0].length);
  }
  
  return sheet;
}

function appendToSheet(name, data) {
  var sheet = getSheet(name);
  sheet.appendRow(data);
}

function clearValidations(name) {
  var sheet = getSheet(name);
  var lastRow = sheet.getMaxRows();
  var lastCol = sheet.getMaxColumns();
  if (lastRow > 0 && lastCol > 0) {
    sheet.getRange(1, 1, lastRow, lastCol).clearDataValidations();
  }
}