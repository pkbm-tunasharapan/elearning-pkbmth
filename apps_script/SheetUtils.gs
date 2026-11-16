// ============================================
// SHEET UTILITIES
// ============================================

// v1.88.4: memo baca sheet selama SATU permintaan yang hanya membaca (diaktifkan doPost lewat memoBolehFn_).
// Banyak fungsi kecil membaca sheet yang sama berulang kali dalam satu permintaan (mis. Siswa dibaca untuk cek sesi,
// lalu dibaca lagi untuk profil). Dengan memo, sheet cukup dibaca sekali; setiap pemanggil menerima salinan sendiri.
// Pengaman: getSheet(name) (jalur yang dipakai untuk menulis) membuang memo sheet itu, dan memo tidak aktif untuk
// fungsi yang menulis maupun pemicu terjadwal.
var SHEET_MEMO_ = null;

// Pola nama fungsi yang menulis/berefek (sama dengan daftar "tulis" di aplikasi, lib/api.dart). Fungsi yang cocok
// berjalan tanpa memo, persis seperti sebelumnya.
var SHEET_MEMO_TULIS = new RegExp('(Simpan|Hapus|Tetapkan|Batal|Catat|Ajukan|Setujui|Tolak|Putus|Sahkan|Impor|Terapkan|Reset|Buka|Tambah|Ubah|Kirim|Atur|Izin|' +
  'Unggah|Upload|Proses|Lapor|Token|Login|Masuk|Keluar|Detak|Minta|Submit|Mulai|Tandai|Bayar|Verifikasi|Buat|Pindah|Selesai|Nonaktif|Aktifkan|' +
  'Kunci|Naskah|Pdf|Ekspor|Templat|Undang|Hangatkan|Ganti|Pulih|Draft|Ucapkan|Akhiri|Putar|Jalankan|Isi$|Samakan|Sinkron|' +
  'Cabut|Lanjut|Tarik|Sekarang|Abaikan|Gabung|Ai$|Ai[A-Z]|Uji$|Bersihkan|Otomatis|Tes$|Resmikan|Set[A-Z]|Keputusan|Disposisi|Perbaiki|Pindai|Beri$|' +
  'Setor|Generate|Rakit|Terbit|Massal|Status$|Input|Verif|Order|Foto|CekData|Hitung|Cari)');
function memoBolehFn_(fn) { return !!fn && !SHEET_MEMO_TULIS.test(String(fn)); }

function getSheet(name) {
  if (SHEET_MEMO_) delete SHEET_MEMO_[name];   // sheet diambil langsung (mungkin akan ditulis) -> memo-nya tidak dipakai lagi
  return getSheetMentah_(name);
}

function getSheetMentah_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function getSheetData(name) {
  if (!SHEET_MEMO_) return getSheetMentah_(name).getDataRange().getValues();
  var v = SHEET_MEMO_[name];
  if (!v) v = SHEET_MEMO_[name] = getSheetMentah_(name).getDataRange().getValues();
  return v.map(function(r) { return r.slice(); });   // salinan: pemanggil boleh mengubah isinya tanpa memengaruhi yang lain
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