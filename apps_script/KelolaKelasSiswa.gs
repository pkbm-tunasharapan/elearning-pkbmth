// ============================================
// PENGELOLAAN ROMBEL, MAPEL & SISWA (pengganti roster Google Classroom)
// ============================================
// Tutor mengisi sheet 'Rombel', 'Mapel' dan 'Siswa' LANGSUNG.
// Kode Akses siswa diisi OTOMATIS oleh menu "Generate Kode Akses untuk
// Siswa Baru" - jangan diisi manual supaya tidak ada kode yang sama persis.
//
// ALUR LOGIN BARU (lihat WebApp.gs -> waLogin):
// Siswa HANYA mengetik Nama + Tanggal Lahir (tanpa memilih rombel/kelas
// dulu) - sistem yang mencari sendiri siswa itu terdaftar di rombel mana
// (lihat cariRombelSiswa_). Kode Akses TIDAK dipakai untuk login, hanya
// dicek ulang saat siswa mengirim jawaban Ujian (UTS/UAS) saja
// (lihat cekKodeAksesSiswa_ & waSubmitJawaban di WebApp.gs).

// ---- Rombel ----

function daftarIdRombelValid_() {
  var sheet = getSheet(CONFIG.SHEETS.ROMBEL);
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (values[i][0]) out.push(String(values[i][0]));
  }
  return out;
}

function doValidasiRombel() {
  var sheet = getSheet(CONFIG.SHEETS.ROMBEL);
  var values = sheet.getDataRange().getValues();
  var errors = [];
  var seen = {};
  var total = 0;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var id = row[0];
    if (!id && !row[1]) continue;
    total++;
    var baris = 'Baris ' + (i + 1);
    if (!id) { errors.push(baris + ': ID Rombel kosong.'); continue; }
    if (seen[id]) { errors.push(baris + ': ID Rombel "' + id + '" duplikat (sudah dipakai baris lain).'); }
    seen[id] = true;
    if (!row[1]) errors.push(baris + ' ("' + id + '"): Nama Rombel kosong.');
    if (CONFIG.STATUS_ROMBEL.indexOf(row[3]) === -1) {
      errors.push(baris + ' ("' + id + '"): Status "' + row[3] + '" harus salah satu dari ' + CONFIG.STATUS_ROMBEL.join(', ') + '.');
    }
  }
  return {
    tone: errors.length ? 'warning' : 'success',
    icon: errors.length ? '⚠️' : '✅',
    title: 'Validasi Rombel',
    message: errors.length ? 'Ditemukan ' + errors.length + ' masalah dari ' + total + ' baris rombel.' : 'Semua ' + total + ' baris rombel valid.',
    details: errors.length ? errors : null,
    detailsLabel: 'Rincian masalah'
  };
}

// ---- Mapel ----

function daftarIdMapelValid_() {
  var sheet = getSheet(CONFIG.SHEETS.MAPEL);
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (values[i][0]) out.push(String(values[i][0]));
  }
  return out;
}

function doValidasiMapel() {
  var sheet = getSheet(CONFIG.SHEETS.MAPEL);
  var values = sheet.getDataRange().getValues();
  var rombelValid = daftarIdRombelValid_();
  var errors = [];
  var seen = {};
  var total = 0;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var id = row[0], idRombel = row[1];
    if (!id && !row[2]) continue;
    total++;
    var baris = 'Baris ' + (i + 1);
    if (!id) { errors.push(baris + ': ID Mapel kosong.'); continue; }
    if (seen[id]) { errors.push(baris + ': ID Mapel "' + id + '" duplikat (sudah dipakai baris lain).'); }
    seen[id] = true;
    if (!row[2]) errors.push(baris + ' ("' + id + '"): Nama Mata Pelajaran kosong.');
    if (!idRombel || rombelValid.indexOf(String(idRombel)) === -1) {
      errors.push(baris + ' ("' + id + '"): ID Rombel "' + idRombel + '" tidak ditemukan di sheet Rombel.');
    }
    if (CONFIG.STATUS_MAPEL.indexOf(row[4]) === -1) {
      errors.push(baris + ' ("' + id + '"): Status "' + row[4] + '" harus salah satu dari ' + CONFIG.STATUS_MAPEL.join(', ') + '.');
    }
  }
  return {
    tone: errors.length ? 'warning' : 'success',
    icon: errors.length ? '⚠️' : '✅',
    title: 'Validasi Mapel',
    message: errors.length ? 'Ditemukan ' + errors.length + ' masalah dari ' + total + ' baris mapel.' : 'Semua ' + total + ' baris mapel valid.',
    details: errors.length ? errors : null,
    detailsLabel: 'Rincian masalah'
  };
}

// ---- Kode Akses (lapisan keamanan KEDUA, dicek saat submit jawaban) ----

function buatKodeAkses_(panjang) {
  var karakter = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa I/O/0/1 - hindari salah baca
  var kode = '';
  for (var i = 0; i < panjang; i++) {
    kode += karakter.charAt(Math.floor(Math.random() * karakter.length));
  }
  return kode;
}

// Mengisi Kode Akses untuk baris siswa baru (Nama Siswa terisi, Kode Akses
// masih kosong). Kode dijamin tidak bentrok dengan kode yang sudah ada di
// sheet, sekaligus mencatat waktu pendaftaran. Baris yang belum diisi
// Tanggal Lahir diberi peringatan terpisah karena siswa itu TIDAK akan bisa
// login (Tanggal Lahir wajib untuk login, Kode Akses hanya untuk submit).
function doGenerateKodeAkses() {
  var sheet = getSheet(CONFIG.SHEETS.SISWA);
  var values = sheet.getDataRange().getValues();
  var kodeDipakai = {};
  values.forEach(function(row) { if (row[3]) kodeDipakai[String(row[3]).toUpperCase()] = true; });

  var rombelValid = daftarIdRombelValid_();
  var diisi = 0;
  var peringatan = [];
  var tanpaTanggalLahir = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var idRombel = row[0], nama = row[1], tanggalLahir = row[2], kode = row[3];
    if (!nama) continue;
    if (!idRombel || rombelValid.indexOf(String(idRombel)) === -1) {
      peringatan.push('Baris ' + (i + 1) + ' ("' + nama + '"): ID Rombel "' + idRombel + '" tidak ditemukan di sheet Rombel - kode akses TIDAK dibuat.');
      continue;
    }
    if (!tanggalLahir) {
      tanpaTanggalLahir.push('Baris ' + (i + 1) + ' ("' + nama + '"): Tanggal Lahir kosong - siswa ini tidak akan bisa login sampai diisi.');
    }
    if (kode) continue; // sudah punya kode
    var baru;
    do { baru = buatKodeAkses_(CONFIG.PANJANG_KODE_AKSES); } while (kodeDipakai[baru]);
    kodeDipakai[baru] = true;
    sheet.getRange(i + 1, 4).setValue(baru);
    sheet.getRange(i + 1, 6).setValue(new Date());
    diisi++;
  }
  var semuaPeringatan = peringatan.concat(tanpaTanggalLahir);
  return {
    tone: semuaPeringatan.length ? 'warning' : 'success',
    icon: semuaPeringatan.length ? '⚠️' : '✅',
    title: 'Generate Kode Akses',
    message: diisi + ' siswa baru diberi kode akses.' +
      (peringatan.length ? ' ' + peringatan.length + ' baris dilewati karena ID Rombel tidak valid.' : '') +
      (tanpaTanggalLahir.length ? ' ' + tanpaTanggalLahir.length + ' baris belum ada Tanggal Lahir.' : ''),
    details: semuaPeringatan.length ? semuaPeringatan : null,
    detailsLabel: 'Rincian'
  };
}

// ============================================
// DIPANGGIL DARI WEB APP (lihat WebApp.gs)
// ============================================

function getDaftarRombelAktif_() {
  var sheet = getSheet(CONFIG.SHEETS.ROMBEL);
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[0] || row[3] !== 'Aktif') continue;
    out.push({ id: row[0], nama: row[1] });
  }
  return out;
}

function getNamaRombel_(idRombel) {
  var sheet = getSheet(CONFIG.SHEETS.ROMBEL);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(idRombel)) return values[i][1];
  }
  return idRombel;
}

function getMapelAktifUntukRombel_(idRombel) {
  var sheet = getSheet(CONFIG.SHEETS.MAPEL);
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[0] || row[4] !== 'Aktif') continue;
    if (String(row[1]) !== String(idRombel)) continue;
    out.push({ id: row[0], nama: row[2], tutor: row[3] || '' });
  }
  return out;
}

function getNamaMapel_(idMapel) {
  var sheet = getSheet(CONFIG.SHEETS.MAPEL);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(idMapel)) return values[i][2];
  }
  return idMapel;
}

// Dipakai LaporanNilai.gs untuk daftar nama siswa satu rombel.
function getDaftarSiswaUntukRombel_(idRombel) {
  var sheet = getSheet(CONFIG.SHEETS.SISWA);
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[0]) === String(idRombel) && row[1]) {
      out.push(row[1]);
    }
  }
  out.sort();
  return out;
}

// Menyamakan format tanggal supaya "1 Januari 2015", "2015-01-01", atau
// objek Date bawaan Sheets bisa dibandingkan apa adanya (semua dijadikan
// 'yyyy-MM-dd').
function formatTanggalUntukBanding_(nilai) {
  var tz = Session.getScriptTimeZone() || 'GMT+7';
  if (Object.prototype.toString.call(nilai) === '[object Date]' && !isNaN(nilai.getTime())) {
    return Utilities.formatDate(nilai, tz, 'yyyy-MM-dd');
  }
  var s = String(nilai == null ? '' : nilai).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  }
  return s;
}

// Login siswa: HANYA Nama + Tanggal Lahir, TANPA memilih rombel dulu.
// Mencari ke SELURUH sheet Siswa (lintas rombel) dan mengembalikan rombel
// tempat siswa itu terdaftar begitu ditemukan kecocokan Nama+Tanggal Lahir.
// Kalau ada dua siswa dengan nama SAMA PERSIS di rombel berbeda dan
// kebetulan tanggal lahirnya juga sama, baris yang ditemukan LEBIH DULU
// (dari atas) yang dipakai - kasus ini sangat jarang tapi tutor sebaiknya
// diberi tahu untuk menghindari nama+tanggal lahir kembar lintas rombel.
function cariRombelSiswa_(nama, tanggalLahir) {
  var sheet = getSheet(CONFIG.SHEETS.SISWA);
  var values = sheet.getDataRange().getValues();
  var namaCari = String(nama || '').trim();
  var tglCari = formatTanggalUntukBanding_(tanggalLahir);
  if (!namaCari || !tglCari) return null;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[1]) continue;
    if (String(row[1]).trim().toLowerCase() !== namaCari.toLowerCase()) continue;
    var tglAsli = formatTanggalUntukBanding_(row[2]);
    if (tglAsli && tglAsli === tglCari) {
      return { idRombel: row[0], nama: row[1] };
    }
  }
  return null;
}

// Lapisan keamanan KEDUA - dicek ulang setiap kali siswa mengirim jawaban
// Ujian (UTS/UAS) saja (lihat waSubmitJawaban di WebApp.gs), BUKAN saat
// login. Ini mencegah orang lain mengirim jawaban atas nama siswa hanya
// dengan menebak/tahu nama dan tanggal lahirnya (yang relatif mudah
// diketahui teman sekelas).
function cekKodeAksesSiswa_(idRombel, nama, kodeAkses) {
  var sheet = getSheet(CONFIG.SHEETS.SISWA);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[0]) === String(idRombel) && row[1] === nama) {
      var kodeAsli = String(row[3] || '').trim().toUpperCase();
      if (kodeAsli === '') continue; // baris ganda tanpa kode akses: cari baris lain dengan nama & rombel yang sama
      return kodeAsli === String(kodeAkses || '').trim().toUpperCase();
    }
  }
  return false;
}

