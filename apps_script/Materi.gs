// ============================================
// PENGELOLAAN MATERI/DISKUSI/ABSENSI/UJIAN
// ============================================
// Tutor mengisi sheet 'Materi' LANGSUNG (seperti mengisi Bank_Soal di sistem
// produksi) - bukan lewat form/dialog. Kolom ID Materi dan Dibuat Pada diisi
// OTOMATIS oleh pastikanIdMateri_(), dipanggil setiap kali Web App diakses
// siswa dan lewat menu "Pastikan ID Materi Terisi".
//
// Satu baris Materi selalu milik SATU Mapel (kolom "ID Mapel") - dan lewat
// mapel itu otomatis milik satu Rombel juga (ID Rombel ada di sheet Mapel).

function materiCols_() {
  var headers = CONFIG.HEADERS.MATERI;
  var col = {};
  headers.forEach(function(h, i) { col[h] = i + 1; }); // 1-based
  return {
    id: col['ID Materi'], idMapel: col['ID Mapel'], jenis: col['Jenis'],
    judul: col['Judul'], konten: col['Konten/Instruksi'],
    youtube: col['Link YouTube (opsional)'], file: col['Link File (opsional)'],
    opsiA: col['Opsi A'], opsiB: col['Opsi B'], opsiC: col['Opsi C'],
    opsiD: col['Opsi D'], opsiE: col['Opsi E'],
    kunci: col['Kunci Jawaban (A/B/C/D/E)'], poin: col['Poin'],
    batasWaktu: col['Batas Waktu (opsional)'], status: col['Status'],
    dibuatPada: col['Dibuat Pada'], sesi: col['Sesi'],
    durasiMenit: col['Durasi Menit (opsional, khusus Ujian)']
  };
}

function generateId_(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
}

// Mengisi ID Materi + Dibuat Pada untuk baris yang statusnya Aktif/Selesai
// tapi ID Materi-nya masih kosong. Baris berstatus Draft (atau kosong)
// sengaja dibiarkan tanpa ID - supaya tutor bisa menyiapkan draft tanpa
// langsung "terikat" ID sebelum yakin mau dipakai.
function pastikanIdMateri_() {
  var sheet = getSheet(CONFIG.SHEETS.MATERI);
  var values = sheet.getDataRange().getValues();
  var cols = materiCols_();
  var diisi = 0;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var status = row[cols.status - 1];
    var sudahAdaId = row[cols.id - 1];
    var judul = row[cols.judul - 1];
    if (!judul) continue; // baris kosong, lewati
    if ((status === 'Aktif' || status === 'Selesai') && !sudahAdaId) {
      sheet.getRange(i + 1, cols.id).setValue(generateId_('M-'));
      if (!row[cols.dibuatPada - 1]) {
        sheet.getRange(i + 1, cols.dibuatPada).setValue(new Date());
      }
      diisi++;
    }
  }
  return diisi;
}

function doPastikanIdMateri() {
  var jumlah = pastikanIdMateri_();
  return {
    tone: 'success', icon: '✅', title: 'ID Materi Diperbarui',
    message: jumlah > 0
      ? jumlah + ' baris materi baru diberi ID otomatis.'
      : 'Tidak ada baris baru yang perlu diberi ID (semua yang Aktif/Selesai sudah punya ID).'
  };
}

// Validasi ringan: kunci jawaban wajib ada untuk Absensi/Ujian, ID Mapel
// harus merujuk ke Mapel yang terdaftar, Jenis harus salah satu yang dikenal.
function doValidasiMateri() {
  var sheet = getSheet(CONFIG.SHEETS.MATERI);
  var values = sheet.getDataRange().getValues();
  var cols = materiCols_();
  var mapelValid = daftarIdMapelValid_();
  var errors = [];
  var total = 0;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var judul = row[cols.judul - 1];
    if (!judul) continue;
    total++;
    var baris = 'Baris ' + (i + 1) + ' ("' + judul + '")';
    var jenis = row[cols.jenis - 1];
    var idMapel = row[cols.idMapel - 1];
    if (CONFIG.JENIS_MATERI.indexOf(jenis) === -1) {
      errors.push(baris + ': Jenis "' + jenis + '" tidak dikenal (harus salah satu dari ' + CONFIG.JENIS_MATERI.join(', ') + ').');
    }
    if (!idMapel || mapelValid.indexOf(String(idMapel)) === -1) {
      errors.push(baris + ': ID Mapel "' + idMapel + '" tidak ditemukan di sheet Mapel.');
    }
    if (jenis === 'Absensi') {
      var kunci = String(row[cols.kunci - 1] || '').trim().toUpperCase();
      if (['A', 'B', 'C', 'D', 'E'].indexOf(kunci) === -1) {
        errors.push(baris + ': Kunci Jawaban wajib diisi A/B/C/D/E untuk jenis Absensi.');
      }
    }
    if (jenis === 'Ujian' && row[cols.status - 1] === 'Aktif') {
      if (hitungJumlahSoalUjian_(row[cols.id - 1]) < 1) {
        errors.push(baris + ': Ujian berstatus Aktif tapi belum punya soal di sheet "Soal Ujian" (isi ID Ujian = "' + (row[cols.id - 1] || '(ID Materi baris ini, isi dulu lewat menu Pastikan ID Materi Terisi)') + '" di sana).');
      }
    }
  }
  return {
    tone: errors.length ? 'warning' : 'success',
    icon: errors.length ? '⚠️' : '✅',
    title: 'Validasi Materi',
    message: errors.length ? 'Ditemukan ' + errors.length + ' masalah dari ' + total + ' baris materi.' : 'Semua ' + total + ' baris materi valid.',
    details: errors.length ? errors : null,
    detailsLabel: 'Rincian masalah'
  };
}

// ============================================
// DIPANGGIL DARI WEB APP (lihat WebApp.gs)
// ============================================

function getMateriAktifUntukMapel_(idMapel) {
  pastikanIdMateri_();
  var sheet = getSheet(CONFIG.SHEETS.MATERI);
  var values = sheet.getDataRange().getValues();
  var cols = materiCols_();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[cols.idMapel - 1]) !== String(idMapel)) continue;
    if (row[cols.status - 1] !== 'Aktif') continue;
    if (!row[cols.id - 1]) continue;
    var jenis = row[cols.jenis - 1];
    // 'Ujian' sekarang bisa berisi banyak soal (lihat SoalUjian.gs) - jadi
    // Opsi A-E pada baris Materi TIDAK dipakai lagi untuk jenis ini.
    // 'Absensi' masih satu-soal-per-baris seperti sebelumnya.
    var isPgSatuSoal = jenis === 'Absensi';
    var item = {
      id: row[cols.id - 1],
      jenis: jenis,
      judul: row[cols.judul - 1],
      konten: row[cols.konten - 1] || '',
      youtube: row[cols.youtube - 1] || '',
      file: row[cols.file - 1] || '',
      poin: row[cols.poin - 1] || '',
      batasWaktu: row[cols.batasWaktu - 1] ? String(row[cols.batasWaktu - 1]) : '',
      sesi: (cols.sesi && row[cols.sesi - 1]) ? String(row[cols.sesi - 1]) : 'Sesi 1'
    };
    if (isPgSatuSoal) {
      item.opsi = {};
      ['A', 'B', 'C', 'D', 'E'].forEach(function(huruf) {
        var val = row[cols['opsi' + huruf] - 1];
        if (val) item.opsi[huruf] = val;
      });
    }
    if (jenis === 'Ujian') {
      item.durasiMenit = (cols.durasiMenit && row[cols.durasiMenit - 1]) ? Number(row[cols.durasiMenit - 1]) : 0;
      item.jumlahSoal = hitungJumlahSoalUjian_(item.id);
    }
    out.push(item);
  }
  return out;
}

function getMateriById_(idMateri) {
  var sheet = getSheet(CONFIG.SHEETS.MATERI);
  var values = sheet.getDataRange().getValues();
  var cols = materiCols_();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][cols.id - 1]) === String(idMateri)) {
      return { row: values[i], cols: cols };
    }
  }
  return null;
}
