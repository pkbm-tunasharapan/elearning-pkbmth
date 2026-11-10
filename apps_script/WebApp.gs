// ============================================
// WEB APP UNTUK SISWA (pengganti Google Classroom)
// ============================================
// doGet() menyajikan Login.html - satu halaman (SPA sederhana) yang
// menangani: masukkan Nama + Tanggal Lahir -> sistem otomatis menemukan
// rombel siswa -> tampil "kelas virtual pribadi" dengan sidebar berisi
// semua mapel milik rombel itu + tab Chatroom rombel -> pilih mapel ->
// lihat materi/diskusi/absensi/ujian aktif -> kirim jawaban (kode akses
// diminta di sini, sebagai lapisan kedua). Semua komunikasi klien<->server
// lewat google.script.run (lihat fungsi-fungsi di bawah, dan Chat.gs untuk
// bagian chatroom/status online).
//
// CATATAN KEAMANAN (penting untuk didokumentasikan ke pengguna):
// Login memakai Nama + Tanggal Lahir - ini SETARA dengan "konfirmasi
// identitas" ringan, BUKAN password rahasia (tanggal lahir relatif mudah
// diketahui teman sekelas). Karena itu Kode Akses (rahasia, hanya diketahui
// siswa & tutor) tetap wajib dicek ULANG setiap kali siswa mengirim jawaban
// Diskusi/Absensi/Ujian - supaya nilai tidak bisa dipalsukan orang lain
// hanya bermodal nama+tanggal lahir. Cukup untuk kebutuhan internal PKBM,
// tapi jangan dipakai untuk data yang sifatnya sensitif/rahasia.
//
// Deploy: Deploy > New deployment > Web app > Execute as "Me", Who has
// access "Anyone" (siswa tidak perlu akun Google sama sekali).

function doGet(e) {
  if (mtAktif_() && !(e && e.parameter && e.parameter.halaman === 'staf')) return mtHalaman_();
  pastikanSemuaSheetAda();
  if (e && e.parameter && e.parameter.halaman === 'staf') {
    pastikanSheetPeran_();
    return HtmlService.createHtmlOutputFromFile('Staf')
      .setTitle('PKBM Tunas Harapan - Tutor & Admin')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  if (e && e.parameter && e.parameter.halaman === 'daftartutor') {
    pastikanSheetPeran_();
    pastikanSheetPengajuan_();
    pastikanSheetAktivitas_();
    return dtHalaman_();
  }
  if (e && e.parameter && e.parameter.halaman === 'daftar') {
    pastikanSheetPendaftaran_();
    pastikanSheetAktivitas_();
    return HtmlService.createHtmlOutputFromFile('Daftar')
      .setTitle('PKBM Tunas Harapan - Daftar Siswa Baru')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createTemplateFromFile('Login')
    .evaluate()
    .setTitle('PKBM Tunas Harapan - Belajar Mandiri')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---- Dipanggil dari Login.html lewat google.script.run ----

// Login HANYA dengan Nama + Tanggal Lahir (TIDAK ada pilih rombel/kelas
// dulu) - sistem otomatis menemukan rombel siswa tsb lewat cariRombelSiswa_
// (lihat KelolaKelasSiswa.gs), lalu langsung mengembalikan nama rombel +
// daftar mapel rombel itu supaya klien bisa langsung menampilkan sidebar
// "kelas virtual pribadi" tanpa RPC tambahan.
function waLoginAsli_(nama, tanggalLahir) {
  if (mtAktif_()) return { sukses: false, pesan: 'Under maintenance, will be back soon!' };
  var ditemukan = cariRombelSiswa_(nama, tanggalLahir);
  if (!ditemukan) {
    return { sukses: false, pesan: 'Nama atau tanggal lahir tidak cocok dengan data yang terdaftar. Periksa kembali, atau tanyakan ke tutor.' };
  }
  var idRombel = ditemukan.idRombel;
  return {
    sukses: true,
    idRombel: idRombel,
    namaRombel: getNamaRombel_(idRombel),
    nama: ditemukan.nama, // ejaan persis dari sheet Siswa
    daftarMapel: getMapelAktifUntukRombel_(idRombel)
  };
}

function waGetMateri(idMapel) {
  var daftar = taFilterMateriSiswa_(getMateriAktifUntukMapel_(idMapel));
  daftar.forEach(function(x) { if (x.judul) x.judul = bersihCite_(x.judul); if (x.konten) x.konten = bersihCite_(x.konten); });
  daftar = (typeof ujTandaiMateri_ === 'function') ? ujTandaiMateri_(daftar) : daftar;
  try { if (typeof abSisipItem_ === 'function') daftar = abSisipItem_(idMapel, daftar); } catch (e) {}
  return daftar;
}

// Nilai sel yang dikirim ke klien harus primitif: objek Date di dalam hasil google.script.run membuat SELURUH hasil menjadi null di klien.
function riwayatPrim_(x) {
  if (x instanceof Date) return Utilities.formatDate(x, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  if (Object.prototype.toString.call(x) === '[object Date]') return String(x);
  return x === null || x === undefined ? '' : x;
}

function waGetRiwayatJawaban(idMapel, nama) {
  var sheet = getSheet(CONFIG.SHEETS.JAWABAN);
  var values = sheet.getDataRange().getValues();
  var out = {};
  var hdR = values.length ? values[0].map(function(x) { return String(x).trim(); }) : [];
  var kKom = hdR.indexOf('Komentar Tutor'), kPen = hdR.indexOf('Dinilai Oleh'), kWkt = hdR.indexOf('Waktu Dinilai');
  // Kolom Jawaban: ID Rombel(0), ID Mapel(1), Nama Mapel(2), ID Materi(3),
  // Judul Materi(4), Jenis(5), Nama Siswa(6), Jawaban(7), Nilai(8), Waktu Kirim(9)
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[1]) === String(idMapel) && row[6] === nama) {
      var item = { jawaban: riwayatPrim_(row[7]), nilai: riwayatPrim_(row[8]), waktu: riwayatPrim_(row[9]), waktuMs: (row[9] instanceof Date ? row[9].getTime() : 0) };
      // balasan tutor hanya dikirim bila jawaban sudah bernilai
      if (kKom >= 0 && String(row[8]).trim() !== '') {
        item.komentar = riwayatPrim_(row[kKom]);
        item.penilai = kPen >= 0 ? riwayatPrim_(row[kPen]) : '';
        item.waktuNilai = kWkt >= 0 ? riwayatPrim_(row[kWkt]) : '';
      }
      out[String(row[3])] = item;
    }
  }
  try { if (typeof abRiwayatSiswa_ === 'function') { var ab = abRiwayatSiswa_(idMapel, nama); Object.keys(ab).forEach(function(k) { out[k] = ab[k]; }); } } catch (e) {}
  out.__buka = taDibukaUntuk_(idMapel, nama);
  out.__sekarang = new Date().getTime();
  return out;
}

// payload: { idRombel, idMapel, nama, kodeAkses, idMateri, jawaban }
// Kode akses (lapisan keamanan KEDUA, bukan saat login) hanya dicek untuk jenis
// Ujian (UTS/UAS), supaya jawaban ujian tidak bisa dipalsukan lewat console
// browser walau login (nama+tanggal lahir) berhasil ditebak orang lain.
// Diskusi dan Absensi tidak memerlukan kode akses.
function waSubmitJawabanAsli_(payload) {
  var idRombel = payload.idRombel, idMapel = payload.idMapel, nama = payload.nama, idMateri = payload.idMateri;
  var found = getMateriById_(idMateri);
  if (!found) {
    return { sukses: false, pesan: 'Materi tidak ditemukan (mungkin sudah dihapus/diubah tutor).' };
  }
  var cols = found.cols, row = found.row;
  if (String(row[cols.idMapel - 1]) !== String(idMapel)) {
    return { sukses: false, pesan: 'Materi ini bukan untuk mata pelajaran Anda.' };
  }
  if (row[cols.status - 1] !== 'Aktif') {
    return { sukses: false, pesan: 'Materi ini sudah tidak aktif (tutor mungkin sudah menutupnya).' };
  }
  var jenis = row[cols.jenis - 1];
  // Kode akses HANYA diwajibkan untuk Ujian (UTS/UAS). Diskusi dan Absensi tidak memakainya.
  if (jenis === 'Ujian' && !cekKodeAksesSiswa_(idRombel, nama, payload.kodeAkses)) {
    return { sukses: false, pesan: 'Kode akses salah. Kode akses berbeda dari tanggal lahir - tanyakan ke tutor kalau lupa.' };
  }
  var judul = row[cols.judul - 1];
  var jawabanTeks = String(payload.jawaban || '');
  var nilai = '';

  if (CONFIG.JENIS_PILIHAN_GANDA.indexOf(jenis) !== -1) {
    var kunci = String(row[cols.kunci - 1] || '').trim().toUpperCase();
    var dipilih = jawabanTeks.trim().toUpperCase();
    if (['A', 'B', 'C', 'D', 'E'].indexOf(dipilih) === -1) {
      return { sukses: false, pesan: 'Pilih salah satu opsi jawaban.' };
    }
    var poin = Number(row[cols.poin - 1]) || 100;
    nilai = (dipilih === kunci) ? poin : 0;
    jawabanTeks = dipilih;
  } else if (jenis === 'Diskusi') {
    if (!jawabanTeks.trim()) {
      return { sukses: false, pesan: 'Jawaban tidak boleh kosong.' };
    }
  } else {
    return { sukses: false, pesan: 'Jenis materi ini tidak memerlukan jawaban.' };
  }

  var namaMapel = getNamaMapel_(idMapel);
  var jawabanSheet = getSheet(CONFIG.SHEETS.JAWABAN);

  // Cegah duplikasi: kalau siswa sudah pernah submit untuk materi yang sama,
  // TIMPA baris lama (dianggap perbaikan jawaban) alih-alih menambah baris baru.
  var existing = jawabanSheet.getDataRange().getValues();
  for (var i = 1; i < existing.length; i++) {
    var r = existing[i];
    if (String(r[3]) === String(idMateri) && r[6] === nama) {
      jawabanSheet.getRange(i + 1, 1, 1, 10).setValues([[idRombel, idMapel, namaMapel, idMateri, judul, jenis, nama, jawabanTeks, nilai, (jenis === 'Diskusi' && r[9] ? r[9] : new Date())]]);
      return { sukses: true, pesan: 'Jawaban diperbarui.', nilai: nilai, jenis: jenis };
    }
  }
  jawabanSheet.appendRow([idRombel, idMapel, namaMapel, idMateri, judul, jenis, nama, jawabanTeks, nilai, new Date()]);
  return { sukses: true, pesan: 'Jawaban terkirim.', nilai: nilai, jenis: jenis };
}

// ---- Ujian multi-soal: mulai/lapor-pindah-tab/submit (implementasi di
// SesiUjian.gs) - waStatusUjian, waMulaiUjian, waLaporPindahTab,
// waSubmitUjian sudah didefinisikan langsung di sana (dipanggil klien
// lewat google.script.run seperti fungsi wa* lain di file ini). ----

// ---- Chatroom & status online per rombel (implementasi di Chat.gs) ----

function waKirimChat(idRombel, nama, pesan) {
  return waKirimChat_(idRombel, nama, pesan);
}

function waPollRombel(idRombel, nama, sejakMs) {
  return waPollRombel_(idRombel, nama, sejakMs);
}

// Dipakai HtmlService untuk menyisipkan file HTML lain jika suatu saat
// Login.html dipecah jadi beberapa berkas (saat ini semua sudah satu berkas).
function include_(namaBerkas) {
  return HtmlService.createHtmlOutputFromFile(namaBerkas).getContent();
}


// ---------- draft jawaban diskusi (siswa menyimpan dulu, mengirim nanti) ----------
// Satu baris per (rombel, materi, siswa). Draft dihapus otomatis saat jawaban berhasil dikirim.
var DRAFT = {
  SHEET: 'Draft Diskusi',
  HEADERS: ['ID Rombel', 'ID Mapel', 'ID Materi', 'Nama Siswa', 'Draft', 'Diperbarui'],
  MAKS: 10000
};

function pastikanSheetDraft_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DRAFT.SHEET);
  if (!sh) {
    sh = ss.insertSheet(DRAFT.SHEET);
    sh.getRange(1, 1, 1, DRAFT.HEADERS.length).setValues([DRAFT.HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Mengembalikan baris (1-based) draft siswa untuk materi itu, atau 0.
function draftCariBaris_(sh, idRombel, idMateri, nama) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var v = sh.getRange(2, 1, last - 1, 4).getValues();
  var n = normNama_(nama);
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]).trim() === String(idRombel).trim() && String(v[i][2]).trim() === String(idMateri).trim() && normNama_(v[i][3]) === n) return i + 2;
  }
  return 0;
}

// Memastikan siswa sah, materi adalah Diskusi milik mapel rombelnya, dan sesinya sedang bisa dikerjakan.
function draftPeriksa_(idRombel, idMapel, idMateri, nama) {
  nama = String(nama || '').trim();
  if (!nama || !idRombel || !idMateri) throw new Error('Data draft tidak lengkap.');
  if (!siswaTerdaftar_(nama, idRombel)) throw new Error('Siswa tidak dikenali.');
  var found = getMateriById_(idMateri);
  if (!found) throw new Error('Materi tidak ditemukan.');
  var c = found.cols, row = found.row;
  if (String(row[c.idMapel - 1]) !== String(idMapel) || !mapelMilikRombel_(idMapel, idRombel)) throw new Error('Materi ini bukan untuk kelas Anda.');
  if (String(row[c.jenis - 1] || '').trim() !== 'Diskusi') throw new Error('Draft hanya untuk jawaban Diskusi.');
  return nama;
}

function waSimpanDraftDiskusi(payload) {
  payload = payload || {};
  var idRombel = String(payload.idRombel || '').trim(), idMapel = String(payload.idMapel || '').trim(), idMateri = String(payload.idMateri || '').trim();
  var nama = draftPeriksa_(idRombel, idMapel, idMateri, payload.nama);
  var gerbang = taGerbang_(idMapel, idMateri, nama, 0);
  if (gerbang) return { sukses: false, pesan: gerbang };
  var teks = String(payload.teks === null || payload.teks === undefined ? '' : payload.teks);
  if (!teks.trim()) return { sukses: false, pesan: 'Tulis sesuatu dulu sebelum menyimpan draft.' };
  if (teks.length > DRAFT.MAKS) return { sukses: false, pesan: 'Draft terlalu panjang (maksimal ' + DRAFT.MAKS + ' karakter).' };
  if (hitung_('drf|' + normNama_(nama), 10) > 6) return { sukses: false, pesan: 'Terlalu cepat. Tunggu sebentar lalu simpan lagi.' };
  var kunci = LockService.getScriptLock();
  kunci.waitLock(10000);
  try {
    var sh = pastikanSheetDraft_();
    var baris = draftCariBaris_(sh, idRombel, idMateri, nama);
    var now = new Date();
    var isi = [idRombel, idMapel, idMateri, nama, teks, now];
    if (baris) sh.getRange(baris, 1, 1, isi.length).setValues([isi]);
    else sh.appendRow(isi);
    return { sukses: true, waktu: now.getTime() };
  } finally {
    kunci.releaseLock();
  }
}

function waGetDraftDiskusi(idRombel, idMapel, idMateri, nama) {
  nama = draftPeriksa_(String(idRombel || '').trim(), String(idMapel || '').trim(), String(idMateri || '').trim(), nama);
  var sh = pastikanSheetDraft_();
  var baris = draftCariBaris_(sh, String(idRombel).trim(), idMateri, nama);
  if (!baris) return { ada: false, teks: '', waktu: 0 };
  var r = sh.getRange(baris, 5, 1, 2).getValues()[0];
  return { ada: true, teks: String(r[0] || ''), waktu: msDariSel_(r[1]) };
}

function draftHapus_(idRombel, idMateri, nama) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(10000);
  try {
    var sh = pastikanSheetDraft_();
    var baris = draftCariBaris_(sh, idRombel, idMateri, nama);
    if (baris) sh.deleteRow(baris);
  } finally {
    kunci.releaseLock();
  }
}
