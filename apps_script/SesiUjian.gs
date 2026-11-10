// ============================================
// SESI PENGERJAAN UJIAN: status, kunci anti-pindah-tab, penilaian
// ============================================
// Satu baris di sheet "Percobaan Ujian" per (Ujian, Rombel, Siswa) - dibuat
// otomatis saat siswa pertama kali menekan "Mulai Ujian" (waMulaiUjian),
// diperbarui tiap kali dia ketahuan pindah tab (waLaporPindahTab) dan saat
// dia submit (waSubmitUjian).
//
// KENAPA overlay + deteksi pindah tab? Supaya siswa tidak diam-diam buka
// tab lain untuk mencari jawaban lewat Google/AI saat mengerjakan Ujian.
// Begitu dia pindah tab, browser memicu event "visibilitychange" (lihat
// Login.html) - klien langsung menutup overlay dan melapor ke sini lewat
// waLaporPindahTab. 3x kejadian (CONFIG.BATAS_PERCOBAAN_PINDAH_TAB) =
// terkunci, tidak bisa buka ujian itu lagi sampai tutor membuka kuncinya
// manual di sheet "Percobaan Ujian" (ubah kolom Terkunci jadi FALSE).
//
// Kode Akses diminta di LAYAR MULAI (bukan di akhir seperti jenis lain) -
// supaya kode yang sama bisa dipakai ulang untuk auto-submit kalau timer
// UTS/UAS habis sementara siswa tidak sempat mengonfirmasi apa-apa lagi.

function sesiCols_() {
  var headers = CONFIG.HEADERS.PERCOBAAN_UJIAN;
  var col = {};
  headers.forEach(function(h, i) { col[h] = i + 1; }); // 1-based
  return {
    idUjian: col['ID Ujian'], idRombel: col['ID Rombel'], nama: col['Nama Siswa'],
    status: col['Status'], percobaan: col['Percobaan Pindah Tab'], terkunci: col['Terkunci'],
    nilaiTotal: col['Nilai Total'], waktuMulai: col['Waktu Mulai'], waktuSelesai: col['Waktu Selesai']
  };
}

function cariBarisSesiUjian_(idUjian, idRombel, nama) {
  var sheet = getSheet(CONFIG.SHEETS.PERCOBAAN_UJIAN);
  var values = sheet.getDataRange().getValues();
  var cols = sesiCols_();
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[cols.idUjian - 1]) === String(idUjian) && String(row[cols.idRombel - 1]) === String(idRombel) && row[cols.nama - 1] === nama) {
      return { sheet: sheet, cols: cols, rowIndex: i + 1, row: row };
    }
  }
  return null;
}

// Baca-saja, TIDAK mengubah apa pun - dipakai saat siswa baru membuka
// (klik) item Ujian di tree, sebelum dia menekan "Mulai Ujian". Kalau
// dipanggil pakai waMulaiUjian di titik ini, Waktu Mulai/timer akan
// ke-reset padahal dia belum tentu jadi mulai.
function waStatusUjianAsli_(idUjian, idRombel, idMapel, nama) {
  var found = getMateriById_(idUjian);
  if (!found || found.row[found.cols.jenis - 1] !== 'Ujian') {
    return { sukses: false, pesan: 'Ujian tidak ditemukan (mungkin sudah dihapus/diubah tutor).' };
  }
  var mRow = found.row, mCols = found.cols;
  var jumlahSoal = hitungJumlahSoalUjian_(idUjian);
  var durasiMenit = (mCols.durasiMenit && mRow[mCols.durasiMenit - 1]) ? Number(mRow[mCols.durasiMenit - 1]) : 0;

  var out = {
    sukses: true, judul: mRow[mCols.judul - 1], konten: mRow[mCols.konten - 1] || '',
    jumlahSoal: jumlahSoal, durasiMenit: durasiMenit,
    aktif: mRow[mCols.status - 1] === 'Aktif',
    terkunci: false, percobaan: 0, batasPercobaan: CONFIG.BATAS_PERCOBAAN_PINDAH_TAB,
    selesai: false, nilaiTotal: '', nilaiMaks: 0
  };

  var soalLengkap = getSoalLengkapUntukUjian_(idUjian);
  soalLengkap.forEach(function(s) { out.nilaiMaks += s.poin; });

  var sesi = cariBarisSesiUjian_(idUjian, idRombel, nama);
  if (sesi) {
    var cols = sesi.cols, row = sesi.row;
    out.percobaan = Number(row[cols.percobaan - 1]) || 0;
    out.terkunci = row[cols.terkunci - 1] === true;
    out.selesai = row[cols.status - 1] === 'Selesai';
    out.nilaiTotal = row[cols.nilaiTotal - 1];
  }
  return out;
}

// Dipanggil saat siswa benar-benar menekan tombol "Mulai Ujian" (Kode Akses
// dicek DI SINI, lapisan keamanan kedua seperti jenis materi lain). Kalau
// sukses, mengembalikan daftar soal (TANPA kunci jawaban) - urutan soal dan
// opsi diacak di KLIEN.
function waMulaiUjianAsli_(idUjian, idRombel, idMapel, nama, kodeAkses) {
  if (!cekKodeAksesSiswa_(idRombel, nama, kodeAkses)) {
    return { sukses: false, pesan: 'Kode akses salah. Kode akses berbeda dari tanggal lahir - tanyakan ke tutor kalau lupa.' };
  }
  var found = getMateriById_(idUjian);
  if (!found || found.row[found.cols.jenis - 1] !== 'Ujian') {
    return { sukses: false, pesan: 'Ujian tidak ditemukan (mungkin sudah dihapus/diubah tutor).' };
  }
  var mRow = found.row, mCols = found.cols;
  if (mRow[mCols.status - 1] !== 'Aktif') {
    return { sukses: false, pesan: 'Ujian ini sudah tidak aktif (tutor mungkin sudah menutupnya).' };
  }
  if (String(mRow[mCols.idMapel - 1]) !== String(idMapel)) {
    return { sukses: false, pesan: 'Ujian ini bukan untuk mata pelajaran Anda.' };
  }
  var soal = ujSoalSiswa_(idUjian, idRombel, nama, false);
  if (!soal.length) {
    return { sukses: false, pesan: 'Ujian ini belum ada soalnya - tanyakan ke tutor.' };
  }

  var sesi = cariBarisSesiUjian_(idUjian, idRombel, nama);
  if (sesi) {
    var cols = sesi.cols;
    if (sesi.row[cols.terkunci - 1] === true) {
      return { sukses: false, terkunci: true, pesan: 'Ujian ini terkunci karena Anda ketahuan pindah tab ' + CONFIG.BATAS_PERCOBAAN_PINDAH_TAB + 'x saat mengerjakan. Hubungi tutor untuk membuka kuncinya.' };
    }
    if (sesi.row[cols.status - 1] === 'Selesai') {
      return { sukses: false, selesai: true, pesan: 'Ujian ini sudah pernah Anda selesaikan dan tidak bisa dikerjakan ulang.' };
    }
  }

  var now = new Date();
  if (sesi) {
    sesi.sheet.getRange(sesi.rowIndex, sesi.cols.status).setValue('Berlangsung');
    sesi.sheet.getRange(sesi.rowIndex, sesi.cols.waktuMulai).setValue(now);
  } else {
    var sheet = getSheet(CONFIG.SHEETS.PERCOBAAN_UJIAN);
    // Urutan kolom HARUS sama persis dengan CONFIG.HEADERS.PERCOBAAN_UJIAN.
    sheet.appendRow([idUjian, idRombel, nama, 'Berlangsung', 0, false, '', now, '']);
  }

  return {
    sukses: true, soal: soal, durasiMenit: (mCols.durasiMenit && mRow[mCols.durasiMenit - 1]) ? Number(mRow[mCols.durasiMenit - 1]) : 0,
    waktuMulaiMs: now.getTime()
  };
}

// Dipanggil klien SEGERA setelah overlay ujian ditutup karena siswa pindah
// tab (document.visibilitychange). Menambah hitungan percobaan; mengunci
// begitu mencapai batas.
function waLaporPindahTabAsli_(idUjian, idRombel, nama) {
  var sesi = cariBarisSesiUjian_(idUjian, idRombel, nama);
  var sheet = getSheet(CONFIG.SHEETS.PERCOBAAN_UJIAN);
  var percobaanBaru, terkunciBaru;
  if (sesi) {
    percobaanBaru = (Number(sesi.row[sesi.cols.percobaan - 1]) || 0) + 1;
    terkunciBaru = percobaanBaru >= CONFIG.BATAS_PERCOBAAN_PINDAH_TAB;
    sheet.getRange(sesi.rowIndex, sesi.cols.percobaan).setValue(percobaanBaru);
    if (terkunciBaru) sheet.getRange(sesi.rowIndex, sesi.cols.terkunci).setValue(true);
  } else {
    // Jarang terjadi (biasanya sesi sudah ada dari waMulaiUjian), tapi jaga-jaga.
    percobaanBaru = 1;
    terkunciBaru = false;
    sheet.appendRow([idUjian, idRombel, nama, 'Berlangsung', percobaanBaru, false, '', new Date(), '']);
  }
  return { percobaan: percobaanBaru, terkunci: terkunciBaru, batasPercobaan: CONFIG.BATAS_PERCOBAAN_PINDAH_TAB };
}

// payload: { idRombel, idMapel, idUjian, nama, kodeAkses, jawaban: {idSoal: 'A'/'B'/...} }
// jawaban BOLEH tidak lengkap (dipakai juga untuk auto-submit saat timer
// UTS/UAS habis) - soal yang tidak terjawab otomatis dianggap salah (0
// poin). Pembatasan "tidak bisa submit kalau belum lengkap" untuk submit
// manual/sukarela dilakukan di KLIEN (tombol Kirim baru aktif kalau semua
// terjawab) - lihat Login.html.
function waSubmitUjianAsli_(payload) {
  var idRombel = payload.idRombel, idMapel = payload.idMapel, idUjian = payload.idUjian, nama = payload.nama;
  if (!cekKodeAksesSiswa_(idRombel, nama, payload.kodeAkses)) {
    return { sukses: false, pesan: 'Kode akses salah. Kode akses berbeda dari tanggal lahir - tanyakan ke tutor kalau lupa.' };
  }
  var found = getMateriById_(idUjian);
  if (!found || found.row[found.cols.jenis - 1] !== 'Ujian') {
    return { sukses: false, pesan: 'Ujian tidak ditemukan (mungkin sudah dihapus/diubah tutor).' };
  }
  var mRow = found.row, mCols = found.cols;
  if (String(mRow[mCols.idMapel - 1]) !== String(idMapel)) {
    return { sukses: false, pesan: 'Ujian ini bukan untuk mata pelajaran Anda.' };
  }

  var sesi = cariBarisSesiUjian_(idUjian, idRombel, nama);
  if (sesi && sesi.row[sesi.cols.terkunci - 1] === true) {
    return { sukses: false, terkunci: true, pesan: 'Ujian ini terkunci - tidak bisa mengirim jawaban. Hubungi tutor untuk membuka kuncinya.' };
  }
  if (sesi && sesi.row[sesi.cols.status - 1] === 'Selesai') {
    return { sukses: false, selesai: true, pesan: 'Ujian ini sudah pernah Anda selesaikan.' };
  }

  // Pengiriman hanya sah bila ujian sudah dimulai lewat tombol Mulai, dan belum melewati durasi (+ toleransi jaringan 3 menit).
  if (!sesi) {
    return { sukses: false, pesan: 'Ujian ini belum dimulai. Tekan Mulai Ujian terlebih dahulu.' };
  }
  var durasiMenitSrv = (mCols.durasiMenit && mRow[mCols.durasiMenit - 1]) ? Number(mRow[mCols.durasiMenit - 1]) : 0;
  if (durasiMenitSrv > 0) {
    var mulaiSrv = sesi.row[sesi.cols.waktuMulai - 1];
    var mulaiMsSrv = mulaiSrv instanceof Date ? mulaiSrv.getTime() : new Date(mulaiSrv).getTime();
    if (mulaiMsSrv && Date.now() > mulaiMsSrv + (durasiMenitSrv + 3) * 60000) {
      return { sukses: false, pesan: 'Waktu pengerjaan ujian sudah habis, jawaban tidak dapat dikirim. Hubungi tutor.' };
    }
  }

  var soalLengkap = ujSoalSiswa_(idUjian, idRombel, nama, true);
  if (!soalLengkap.length) {
    return { sukses: false, pesan: 'Ujian ini belum ada soalnya - tanyakan ke tutor.' };
  }
  var jawabanMasuk = payload.jawaban || {};
  var nilaiTotal = 0, nilaiMaks = 0, jumlahBenar = 0;
  soalLengkap.forEach(function(s) {
    nilaiMaks += s.poin;
    var dipilih = String(jawabanMasuk[s.id] || '').trim().toUpperCase();
    if (dipilih && dipilih === s.kunci) {
      nilaiTotal += s.poin;
      jumlahBenar++;
    }
  });

  var namaMapel = getNamaMapel_(idMapel);
  var judul = mRow[mCols.judul - 1];
  var ringkasan = jumlahBenar + ' dari ' + soalLengkap.length + ' soal benar';
  var now = new Date();

  // Ringkasan hasil ditulis ke sheet Jawaban yang SAMA seperti jenis materi
  // lain (ID Materi = ID Ujian) - supaya tanda "✓ Selesai" di tree siswa
  // dan rekap nilai tutor otomatis ikut bekerja tanpa perlu logika baru.
  var jawabanSheet = getSheet(CONFIG.SHEETS.JAWABAN);
  var existing = jawabanSheet.getDataRange().getValues();
  var sudahAda = false;
  for (var i = 1; i < existing.length; i++) {
    var r = existing[i];
    if (String(r[3]) === String(idUjian) && r[6] === nama) {
      jawabanSheet.getRange(i + 1, 1, 1, 10).setValues([[idRombel, idMapel, namaMapel, idUjian, judul, 'Ujian', nama, ringkasan, nilaiTotal, now]]);
      sudahAda = true;
      break;
    }
  }
  if (!sudahAda) {
    jawabanSheet.appendRow([idRombel, idMapel, namaMapel, idUjian, judul, 'Ujian', nama, ringkasan, nilaiTotal, now]);
  }

  var sheet = getSheet(CONFIG.SHEETS.PERCOBAAN_UJIAN);
  if (sesi) {
    sheet.getRange(sesi.rowIndex, sesi.cols.status).setValue('Selesai');
    sheet.getRange(sesi.rowIndex, sesi.cols.nilaiTotal).setValue(nilaiTotal);
    sheet.getRange(sesi.rowIndex, sesi.cols.waktuSelesai).setValue(now);
  } else {
    sheet.appendRow([idUjian, idRombel, nama, 'Selesai', 0, false, nilaiTotal, now, now]);
  }

  return { sukses: true, nilaiTotal: nilaiTotal, nilaiMaks: nilaiMaks, jumlahBenar: jumlahBenar, totalSoal: soalLengkap.length };
}
