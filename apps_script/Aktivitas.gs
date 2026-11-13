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
// v1.74.1: daftar orang dikelompokkan per NAMA (bukan peran + nama). Satu orang yang tercatat dengan beberapa
// peran (mis. Front Office, Siswa, Staf saat login gagal, Sistem untuk proses otomatis) tampil sekali, dengan semua
// perannya. Kunci = 'N|<nama dinormalkan>'; kunci lama 'Peran|nama' tetap dikenali (dicocokkan lewat namanya).
function waAdminLog(token, kunci) {
  wajibAdmin_(token);
  try { aktRapikanCalonSekali_(); } catch (eR) {}
  var sh = pastikanSheetAktivitas_();
  var akhir = sh.getLastRow();
  if (akhir < 2) return { orang: [], riwayat: [], dibatasi: false };
  var mulai = Math.max(2, akhir - AKTIVITAS.BATAS_BACA + 1);
  var data = sh.getRange(mulai, 1, akhir - mulai + 1, 7).getValues();
  var pilih = aktNamaKunci_(kunci);
  var orang = {}, riwayat = [];
  for (var i = data.length - 1; i >= 0; i--) {
    var r = data[i];
    var nama = sTeks_(r[3]).trim();
    if (!nama) continue;
    var nn = normNama_(nama), k = 'N|' + nn, peran = sTeks_(r[1]).trim();
    var o = orang[k] || (orang[k] = { kunci: k, peranHit: {}, nama: nama, jumlah: 0, terakhir: sTeks_(r[0]) });
    o.jumlah++;
    if (peran) o.peranHit[peran] = (o.peranHit[peran] || 0) + 1;
    if ((!pilih || nn === pilih) && riwayat.length < AKTIVITAS.BATAS_TAMPIL) {
      riwayat.push({ waktu: sTeks_(r[0]), peran: peran, kelas: sTeks_(r[2]), nama: nama, aksi: sTeks_(r[4]), detail: sTeks_(r[5]), hasil: sTeks_(r[6]) });
    }
  }
  var daftar = Object.keys(orang).map(function(k) {
    var o = orang[k], ph = o.peranHit;
    o.peran = Object.keys(ph).sort(function(a, b) { return ph[b] - ph[a]; }).join(' · ');
    delete o.peranHit;
    return o;
  });
  daftar.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  return { orang: daftar, riwayat: riwayat, dibatasi: mulai > 2 };
}
// Nama (dinormalkan) dari kunci pilihan: 'N|nama' (baru) atau 'Peran|nama' (lama). '' = semua orang.
function aktNamaKunci_(kunci) {
  var s = String(kunci || '');
  if (!s) return '';
  var i = s.indexOf('|');
  return normNama_(i >= 0 ? s.slice(i + 1) : s);
}

// v1.74.1: catatan pendaftaran berlabel "Calon siswa" milik siswa yang sudah aktif -> "Siswa".
// namaSet: {namaDinormalkan: true}. Hanya kolom Peran yang diubah. Mengembalikan jumlah baris yang diubah.
function aktCalonJadiSiswa_(namaSet) {
  if (!namaSet || !Object.keys(namaSet).length) return 0;
  var sh = pastikanSheetAktivitas_(), akhir = sh.getLastRow();
  if (akhir < 2) return 0;
  var rg = sh.getRange(2, 2, akhir - 1, 3), v = rg.getValues(), ubah = 0;
  for (var i = 0; i < v.length; i++) {
    if (sTeks_(v[i][0]).trim() !== 'Calon siswa' || !namaSet[normNama_(v[i][2])]) continue;
    sh.getRange(i + 2, 2).setValue('Siswa');
    ubah++;
  }
  return ubah;
}
// Sekali jalan untuk catatan lama: siswa yang sudah punya akun (kode akses terisi di tab Siswa).
function aktRapikanCalonSekali_() {
  var sp = PropertiesService.getScriptProperties();
  if (sp.getProperty('AKT_CALON_RAPI') === '1') return 0;
  var aktif = {};
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (i > 0 && sTeks_(r[1]).trim() && sTeks_(r[3]).trim()) aktif[normNama_(r[1])] = true;
  });
  var n = aktCalonJadiSiswa_(aktif);
  sp.setProperty('AKT_CALON_RAPI', '1');
  catat_('Sistem', '', 'Sistem', 'Rapikan log aktivitas', n + ' catatan "Calon siswa" milik siswa aktif diubah menjadi "Siswa"', 'OK');
  return n;
}
