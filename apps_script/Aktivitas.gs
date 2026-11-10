// ============================================================
// LOG AKTIVITAS PER ORANG
// ------------------------------------------------------------
// Satu tab "Log Aktivitas" mencatat apa yang dilakukan tiap orang (siswa, tutor,
// admin): masuk/keluar, mendaftar, OTP, mengirim jawaban, ujian, perubahan data.
// Admin melihat riwayat satu orang lewat dashboard (tab Log Aktivitas), jadi
// tiap orang punya jejak sendiri yang terpisah dari orang lain.
//
// catat_() tidak pernah melempar galat: kegagalan mencatat tidak boleh
// menggagalkan login, ujian, atau pengiriman jawaban siswa. Tidak memakai
// LockService (appendRow sudah aman dipakai bersamaan) supaya tidak bentrok
// dengan kunci yang sedang dipegang fungsi pemanggil.
// ============================================================

var AKTIVITAS = {
  SHEET: 'Log Aktivitas',
  HEADERS: ['Waktu', 'Peran', 'ID/Kelas', 'Nama', 'Aksi', 'Detail', 'Hasil'],
  BATAS_BACA: 20000,
  BATAS_TAMPIL: 200
};

function pastikanSheetAktivitas_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(AKTIVITAS.SHEET);
  if (!sh) {
    sh = ss.insertSheet(AKTIVITAS.SHEET);
    sh.getRange(1, 1, 1, AKTIVITAS.HEADERS.length).setValues([AKTIVITAS.HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function potongTeks_(t, maks) {
  t = String(t === null || t === undefined ? '' : t);
  return t.length > maks ? t.slice(0, maks - 1) + '…' : t;
}

// peran: 'Siswa' | 'Tutor' | 'Admin' | 'Staf' ; hasil: 'OK' | 'GAGAL'
function catat_(peran, idKelas, nama, aksi, detail, hasil) {
  try {
    var sh = pastikanSheetAktivitas_();
    var waktu = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    var baris = sh.getLastRow() + 1;
    sh.getRange(baris, 1, 1, 7).setNumberFormat('@');
    sh.getRange(baris, 1, 1, 7).setValues([[
      waktu, potongTeks_(peran, 20), potongTeks_(idKelas, 40), potongTeks_(nama, 80),
      potongTeks_(aksi, 60), potongTeks_(detail, 300), hasil === 'GAGAL' ? 'GAGAL' : 'OK'
    ]]);
  } catch (e) {
    // sengaja diabaikan
  }
}

function kunciOrang_(peran, nama) {
  return String(peran) + '|' + normNama_(nama);
}

// Mengembalikan daftar orang (dari log) dan riwayat satu orang (kunci = "Peran|nama").
// kunci kosong -> riwayat terbaru dari semua orang.
function waAdminLog(token, kunci) {
  wajibAdmin_(token);
  var sh = pastikanSheetAktivitas_();
  var akhir = sh.getLastRow();
  if (akhir < 2) return { orang: [], riwayat: [], dibatasi: false };
  var mulai = Math.max(2, akhir - AKTIVITAS.BATAS_BACA + 1);
  var data = sh.getRange(mulai, 1, akhir - mulai + 1, 7).getValues();
  var orang = {}, riwayat = [];
  for (var i = data.length - 1; i >= 0; i--) {
    var r = data[i];
    var nama = sTeks_(r[3]).trim();
    if (!nama) continue;
    var k = kunciOrang_(sTeks_(r[1]), nama);
    if (!orang[k]) orang[k] = { kunci: k, peran: sTeks_(r[1]), nama: nama, jumlah: 0, terakhir: sTeks_(r[0]) };
    orang[k].jumlah++;
    if ((!kunci || k === kunci) && riwayat.length < AKTIVITAS.BATAS_TAMPIL) {
      riwayat.push({ waktu: sTeks_(r[0]), peran: sTeks_(r[1]), kelas: sTeks_(r[2]), nama: nama, aksi: sTeks_(r[4]), detail: sTeks_(r[5]), hasil: sTeks_(r[6]) });
    }
  }
  var daftar = Object.keys(orang).map(function(k) { return orang[k]; });
  daftar.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  return { orang: daftar, riwayat: riwayat, dibatasi: mulai > 2 };
}
