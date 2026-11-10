// ============================================
// SOAL UJIAN (multi-soal per Ujian)
// ============================================
// Satu baris Materi berjenis 'Ujian' adalah "wadah" ujian (Judul, Instruksi,
// Durasi Menit, dst). Soal-soal di dalamnya (bisa banyak) diisi TERPISAH di
// sini, satu baris = satu soal, dihubungkan lewat "ID Ujian" = ID Materi
// wadahnya. Tutor mengisi sheet ini LANGSUNG, sama seperti sheet Materi.
//
// Kunci Jawaban di sini TIDAK PERNAH dikirim ke klien (lihat
// getSoalUntukUjian_ vs getSoalLengkapUntukUjian_) - penilaian selalu
// dilakukan di server (SesiUjian.gs) supaya kunci jawaban tidak bisa dilihat
// siswa lewat console browser.

function soalCols_() {
  var headers = CONFIG.HEADERS.SOAL_UJIAN;
  var col = {};
  headers.forEach(function(h, i) { col[h] = i + 1; }); // 1-based
  return {
    id: col['ID Soal'], idUjian: col['ID Ujian'], pertanyaan: col['Pertanyaan'],
    opsiA: col['Opsi A'], opsiB: col['Opsi B'], opsiC: col['Opsi C'],
    opsiD: col['Opsi D'], opsiE: col['Opsi E'],
    kunci: col['Kunci Jawaban (A/B/C/D/E)'], poin: col['Poin']
  };
}

// Mengisi ID Soal untuk baris yang Pertanyaan-nya sudah diisi tapi ID Soal
// masih kosong - sama seperti pastikanIdMateri_() di Materi.gs.
function pastikanIdSoal_() {
  var sheet = getSheet(CONFIG.SHEETS.SOAL_UJIAN);
  var values = sheet.getDataRange().getValues();
  var cols = soalCols_();
  var diisi = 0;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[cols.pertanyaan - 1]) continue; // baris kosong, lewati
    if (!row[cols.id - 1]) {
      sheet.getRange(i + 1, cols.id).setValue(generateId_('SOAL-'));
      diisi++;
    }
  }
  return diisi;
}

function doPastikanIdSoal() {
  var jumlah = pastikanIdSoal_();
  return {
    tone: 'success', icon: '✅', title: 'ID Soal Diperbarui',
    message: jumlah > 0
      ? jumlah + ' baris soal baru diberi ID otomatis.'
      : 'Tidak ada baris soal baru yang perlu diberi ID.'
  };
}

// Semua soal milik satu Ujian, TANPA kunci jawaban - aman dikirim ke klien.
// Urutan sesuai urutan baris di sheet; pengacakan urutan & opsi dilakukan
// di KLIEN tiap kali ujian dibuka/diulang (lihat Login.html), jadi tidak
// perlu disimpan di server.
function getSoalUntukUjian_(idUjian) {
  pastikanIdSoal_();
  var sheet = getSheet(CONFIG.SHEETS.SOAL_UJIAN);
  var values = sheet.getDataRange().getValues();
  var cols = soalCols_();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[cols.idUjian - 1]) !== String(idUjian)) continue;
    if (!row[cols.id - 1]) continue;
    var opsi = {};
    ['A', 'B', 'C', 'D', 'E'].forEach(function(huruf) {
      var val = row[cols['opsi' + huruf] - 1];
      if (val) opsi[huruf] = val;
    });
    out.push({
      id: row[cols.id - 1],
      pertanyaan: row[cols.pertanyaan - 1] || '',
      opsi: opsi,
      poin: Number(row[cols.poin - 1]) || 100
    });
  }
  return out;
}

// Versi LENGKAP (dengan kunci jawaban) - hanya dipakai server-side saat
// menilai submission (lihat SesiUjian.gs). JANGAN PERNAH dikirim ke klien.
function getSoalLengkapUntukUjian_(idUjian) {
  var sheet = getSheet(CONFIG.SHEETS.SOAL_UJIAN);
  var values = sheet.getDataRange().getValues();
  var cols = soalCols_();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[cols.idUjian - 1]) !== String(idUjian)) continue;
    if (!row[cols.id - 1]) continue;
    out.push({
      id: row[cols.id - 1],
      poin: Number(row[cols.poin - 1]) || 100,
      kunci: String(row[cols.kunci - 1] || '').trim().toUpperCase()
    });
  }
  return out;
}

function hitungJumlahSoalUjian_(idUjian) {
  if (!idUjian) return 0;
  var sheet = getSheet(CONFIG.SHEETS.SOAL_UJIAN);
  var values = sheet.getDataRange().getValues();
  var cols = soalCols_();
  var jumlah = 0;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][cols.idUjian - 1]) === String(idUjian) && values[i][cols.pertanyaan - 1]) jumlah++;
  }
  return jumlah;
}

// Validasi: tiap baris soal wajib ID Ujian yang cocok dengan baris Materi
// jenis Ujian, kunci jawaban A-E wajib, minimal 2 opsi terisi.
function doValidasiSoalUjian() {
  var sheet = getSheet(CONFIG.SHEETS.SOAL_UJIAN);
  var values = sheet.getDataRange().getValues();
  var cols = soalCols_();
  var idUjianValid = daftarIdUjianValid_();
  var errors = [];
  var total = 0;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[cols.pertanyaan - 1]) continue;
    total++;
    var baris = 'Baris ' + (i + 1) + ' ("' + String(row[cols.pertanyaan - 1]).substring(0, 40) + '...")';
    var idUjian = row[cols.idUjian - 1];
    if (!idUjian || idUjianValid.indexOf(String(idUjian)) === -1) {
      errors.push(baris + ': ID Ujian "' + idUjian + '" tidak ditemukan di sheet Materi (harus ID Materi baris berjenis Ujian).');
    }
    var kunci = String(row[cols.kunci - 1] || '').trim().toUpperCase();
    if (['A', 'B', 'C', 'D', 'E'].indexOf(kunci) === -1) {
      errors.push(baris + ': Kunci Jawaban wajib diisi A/B/C/D/E.');
    } else if (!row[cols['opsi' + kunci] - 1]) {
      errors.push(baris + ': Kunci Jawaban "' + kunci + '" tapi Opsi ' + kunci + ' kosong.');
    }
  }
  return {
    tone: errors.length ? 'warning' : 'success',
    icon: errors.length ? '⚠️' : '✅',
    title: 'Validasi Soal Ujian',
    message: errors.length ? 'Ditemukan ' + errors.length + ' masalah dari ' + total + ' baris soal.' : 'Semua ' + total + ' baris soal valid.',
    details: errors.length ? errors : null,
    detailsLabel: 'Rincian masalah'
  };
}

function daftarIdUjianValid_() {
  var sheet = getSheet(CONFIG.SHEETS.MATERI);
  var values = sheet.getDataRange().getValues();
  var cols = materiCols_();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row[cols.jenis - 1] === 'Ujian' && row[cols.id - 1]) out.push(String(row[cols.id - 1]));
  }
  return out;
}

// ---- Migrasi satu-kali: ujian lama (satu soal langsung di baris Materi)
// dipindah ke sheet Soal Ujian sebagai soal pertamanya. Aman dijalankan
// berulang - baris yang Opsi/Kunci-nya sudah kosong (sudah pernah
// dimigrasi) dilewati begitu saja.
function migrasiUjianLamaKeSoalUjian_() {
  var mSheet = getSheet(CONFIG.SHEETS.MATERI);
  var mValues = mSheet.getDataRange().getValues();
  var mCols = materiCols_();
  var sSheet = getSheet(CONFIG.SHEETS.SOAL_UJIAN);
  var dipindah = 0;
  for (var i = 1; i < mValues.length; i++) {
    var row = mValues[i];
    if (row[mCols.jenis - 1] !== 'Ujian') continue;
    var idUjian = row[mCols.id - 1];
    if (!idUjian) continue;
    var kunciLama = String(row[mCols.kunci - 1] || '').trim().toUpperCase();
    if (['A', 'B', 'C', 'D', 'E'].indexOf(kunciLama) === -1) continue; // tidak ada soal lama di baris ini
    if (hitungJumlahSoalUjian_(idUjian) > 0) continue; // sudah ada soal di sheet baru, jangan dobel

    sSheet.appendRow([
      generateId_('SOAL-'), idUjian, row[mCols.konten - 1] || row[mCols.judul - 1],
      row[mCols.opsiA - 1] || '', row[mCols.opsiB - 1] || '', row[mCols.opsiC - 1] || '',
      row[mCols.opsiD - 1] || '', row[mCols.opsiE - 1] || '',
      kunciLama, row[mCols.poin - 1] || 100
    ]);
    // Kosongkan kolom lama di baris Materi supaya tidak membingungkan tutor
    // (sudah pindah ke sheet Soal Ujian, tidak dipakai lagi untuk Ujian).
    mSheet.getRange(i + 1, mCols.opsiA, 1, 5).clearContent();
    mSheet.getRange(i + 1, mCols.kunci).clearContent();
    dipindah++;
  }
  return dipindah;
}

function doMigrasiUjianLama() {
  var jumlah = migrasiUjianLamaKeSoalUjian_();
  return {
    tone: 'success', icon: '✅', title: 'Migrasi Soal Ujian Selesai',
    message: jumlah > 0
      ? jumlah + ' ujian lama (soal tunggal di baris Materi) berhasil dipindah jadi soal pertama di sheet "Soal Ujian".'
      : 'Tidak ada ujian lama yang perlu dimigrasi (semua ujian sudah punya soal di sheet "Soal Ujian", atau belum ada ujian sama sekali).'
  };
}
