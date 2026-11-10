// ============================================
// KONFIGURASI SISTEM STANDALONE (TANPA GOOGLE CLASSROOM)
// ============================================
// Sistem ini TERPISAH dari "master control classroom v1" - tidak menyentuh
// data atau kode di spreadsheet produksi. Tidak ada panggilan Classroom API
// sama sekali di seluruh kit ini.
//
// MODEL DATA (v2 - Rombel/Mapel dipisah):
// Sebelumnya satu "Kelas" flat menggabungkan rombongan belajar (rombel) dan
// mata pelajaran (mapel) jadi satu, contoh "B9-MTK" = Kelas 9 + Matematika.
// Ini membuat siswa harus memilih kombinasi rombel+mapel secara langsung
// setiap kali masuk, dan tidak ada konsep "kelas virtual pribadi".
//
// Sekarang dipisah:
//   Rombel  = rombongan belajar siswa (mis. "Kelas 9") - SATU siswa hanya
//             terdaftar di SATU rombel.
//   Mapel   = mata pelajaran di dalam satu rombel (mis. "Matematika",
//             "IPA") - SATU rombel bisa punya BANYAK mapel.
// Siswa login sekali (identitas pribadi), sistem otomatis tahu rombelnya,
// lalu semua mapel milik rombel itu tersaji sebagai daftar/sidebar - siswa
// tidak perlu memilih mapel di layar login.
//
// Kode Akses TIDAK LAGI dipakai untuk login (diganti konfirmasi Tanggal
// Lahir). Kode Akses tetap ada sebagai lapisan keamanan KEDUA, dicek ulang
// khusus saat siswa mengirim jawaban Ujian (UTS/UAS) saja.

var CONFIG = {
  SHEETS: {
    ROMBEL: 'Rombel',
    MAPEL: 'Mapel',
    SISWA: 'Siswa',
    MATERI: 'Materi',
    JAWABAN: 'Jawaban',
    CHAT: 'Chat',
    KEHADIRAN: 'Kehadiran',
    IDENTITAS_SEKOLAH: 'Identitas_Sekolah',
    // Ujian sekarang bisa berisi BANYAK soal (bukan cuma 1 seperti
    // Absensi) - satu baris Materi berjenis 'Ujian' jadi "wadah" ujian,
    // soal-soalnya sendiri disimpan terpisah di sini, satu baris = satu
    // soal, dihubungkan lewat ID Ujian (= ID Materi wadahnya).
    SOAL_UJIAN: 'Soal Ujian',
    // Melacak status pengerjaan tiap (Ujian, Siswa): berapa kali pindah
    // tab (dicurigai mencari jawaban), apakah sudah terkunci, dan hasil
    // akhir kalau sudah selesai. Lihat SesiUjian.gs.
    PERCOBAAN_UJIAN: 'Percobaan Ujian'
  },
  HEADERS: {
    // ID Rombel: kode singkat buatan tutor, contoh "R9". Satu baris = satu
    // rombongan belajar (mis. "Kelas 9").
    ROMBEL: ['ID Rombel', 'Nama Rombel', 'Wali Kelas (opsional)', 'Status'],

    // ID Mapel: kode singkat, contoh "R9-MTK". ID Rombel menghubungkan mapel
    // ini ke rombelnya - satu rombel boleh punya banyak baris Mapel.
    MAPEL: ['ID Mapel', 'ID Rombel', 'Nama Mata Pelajaran', 'Tutor', 'Status'],

    // Tanggal Lahir dipakai sebagai "kata sandi" login (format tanggal apa
    // saja yang bisa dibaca Google Sheets sebagai tanggal). Kode Akses
    // TETAP diisi (lewat menu Generate Kode Akses seperti sebelumnya) tapi
    // sekarang hanya dipakai saat siswa mengirim jawaban, bukan saat login.
    SISWA: ['ID Rombel', 'Nama Siswa', 'Tanggal Lahir', 'Kode Akses', 'Email/No. HP (opsional)', 'Terdaftar Pada'],

    // Jenis: 'Materi' (bacaan saja, tanpa jawaban), 'Diskusi' (esai bebas),
    // 'Absensi'/'Ujian' (pilihan ganda, dinilai otomatis saat submit).
    // ID Kelas lama menjadi ID Mapel - satu materi/diskusi/ujian selalu
    // milik satu mapel tertentu (yang otomatis berarti milik satu rombel,
    // lewat mapel itu).
    // 'Sesi' (mis. "Sesi 1", "Sesi 2") dipakai untuk mengelompokkan
    // Materi/Diskusi/Ujian di sidebar siswa jadi bagian yang bisa
    // di-collapse/expand per sesi pertemuan. Ditambahkan sebagai kolom
    // PALING AKHIR supaya kolom-kolom lama yang sudah ada di sheet tidak
    // perlu digeser posisinya.
    // 'Durasi Menit (opsional, khusus Ujian)' - HANYA dipakai untuk jenis
    // 'Ujian'. Kosongkan untuk ujian harian biasa (tanpa batas waktu). Isi
    // angka menit (mis. 45 untuk UTS/UAS) supaya siswa diberi timer
    // countdown yang otomatis submit begitu waktu habis. Ditambahkan
    // sebagai kolom PALING AKHIR supaya kolom lama tidak bergeser.
    //
    // CATATAN UNTUK JENIS 'Ujian': Opsi A-E / Kunci Jawaban / Poin pada
    // baris Materi jenis Ujian TIDAK dipakai lagi mulai versi ini - soal
    // ujian (bisa banyak per ujian) sekarang diisi di sheet terpisah
    // "Soal Ujian" (lihat CONFIG.SHEETS.SOAL_UJIAN), dihubungkan lewat
    // "ID Ujian" = ID Materi baris ini. Untuk jenis 'Absensi', Opsi A-E /
    // Kunci Jawaban / Poin pada baris ini MASIH dipakai seperti biasa
    // (satu soal langsung di baris Materi).
    MATERI: ['ID Materi', 'ID Mapel', 'Jenis', 'Judul', 'Konten/Instruksi',
      'Link YouTube (opsional)', 'Link File (opsional)',
      'Opsi A', 'Opsi B', 'Opsi C', 'Opsi D', 'Opsi E',
      'Kunci Jawaban (A/B/C/D/E)', 'Poin', 'Batas Waktu (opsional)',
      'Status', 'Dibuat Pada', 'Sesi', 'Durasi Menit (opsional, khusus Ujian)'],

    // Satu baris = satu soal milik satu Ujian (ID Ujian = ID Materi wadah
    // ujiannya di sheet Materi). ID Soal diisi otomatis seperti ID Materi.
    // Poin per soal dijumlah jadi Nilai Total ujian saat siswa submit.
    SOAL_UJIAN: ['ID Soal', 'ID Ujian', 'Pertanyaan',
      'Opsi A', 'Opsi B', 'Opsi C', 'Opsi D', 'Opsi E',
      'Kunci Jawaban (A/B/C/D/E)', 'Poin'],

    // Diisi/diperbarui OTOMATIS oleh Web App - satu baris per (Ujian,
    // Rombel, Siswa). "Percobaan Pindah Tab" bertambah tiap kali siswa
    // ketahuan pindah tab saat mengerjakan (lihat waLaporPindahTab di
    // SesiUjian.gs) - begitu mencapai CONFIG.BATAS_PERCOBAAN_PINDAH_TAB,
    // "Terkunci" otomatis diisi TRUE dan siswa tidak bisa membuka ujian
    // itu lagi. Tutor membuka kunci dengan mengosongkan/mencentang-ulang
    // kolom "Terkunci" jadi FALSE langsung di sheet ini (tidak perlu kode
    // akses baru yang terpisah - Kode Akses siswa yang biasa dipakai lagi
    // begitu Terkunci di-set FALSE).
    PERCOBAAN_UJIAN: ['ID Ujian', 'ID Rombel', 'Nama Siswa', 'Status',
      'Percobaan Pindah Tab', 'Terkunci', 'Nilai Total', 'Waktu Mulai', 'Waktu Selesai'],

    // Diisi OTOMATIS oleh Web App saat siswa submit. ID Rombel ikut dicatat
    // supaya rekap nilai bisa dikelompokkan per rombel meskipun nama siswa
    // kebetulan sama di rombel lain. Untuk jenis 'Ujian' (multi-soal), ID
    // Materi di sini adalah ID Ujian (wadahnya), Jawaban berisi ringkasan
    // "X dari Y soal benar", dan Nilai adalah total poin dari semua soal.
    JAWABAN: ['ID Rombel', 'ID Mapel', 'Nama Mapel', 'ID Materi', 'Judul Materi', 'Jenis',
      'Nama Siswa', 'Jawaban', 'Nilai', 'Waktu Kirim'],

    // Chatroom per-rombel - siswa satu rombel bisa saling melihat pesan.
    // TIDAK ada chat lintas rombel.
    CHAT: ['ID Rombel', 'Nama Siswa', 'Pesan', 'Waktu'],

    // "Kehadiran online" - satu baris per (Rombel, Siswa), Waktu Terakhir
    // Aktif diperbarui tiap kali klien melakukan polling. Siswa dianggap
    // online kalau baris ini diperbarui dalam beberapa detik terakhir -
    // lihat AMBANG_ONLINE_MS di bawah.
    KEHADIRAN: ['ID Rombel', 'Nama Siswa', 'Waktu Terakhir Aktif'],

    IDENTITAS_SEKOLAH: ['Kunci', 'Nilai', 'Keterangan']
  },
  JENIS_MATERI: ['Materi', 'Diskusi', 'Absensi', 'Ujian'],
  JENIS_PILIHAN_GANDA: ['Absensi', 'Ujian'], // dinilai otomatis
  STATUS_ROMBEL: ['Aktif', 'Nonaktif'],
  STATUS_MAPEL: ['Aktif', 'Nonaktif'],
  STATUS_MATERI: ['Draft', 'Aktif', 'Selesai'],
  PANJANG_KODE_AKSES: 6,
  // Siswa dianggap "online" kalau Kehadiran-nya diperbarui dalam rentang
  // ini. Klien polling tiap ~4 detik, jadi 20 detik memberi jeda aman kalau
  // ada 1-2 polling yang telat/gagal tanpa langsung dianggap offline.
  AMBANG_ONLINE_MS: 20000,
  // Berapa kali siswa boleh ketahuan pindah tab saat mengerjakan Ujian
  // sebelum ujian itu terkunci untuknya (lihat SesiUjian.gs).
  BATAS_PERCOBAAN_PINDAH_TAB: 3
};

// ============================================
// DAFTAR SHEET WAJIB
// ============================================
// Dipakai oleh pastikanSemuaSheetAda() saat instalasi pertama kali / menu
// "Cek & Buat Sheet yang Kurang" - membuat sheet yang belum ada beserta
// judul kolomnya, tanpa mengubah sheet yang sudah berisi data.
var REQUIRED_SHEETS = [
  { name: CONFIG.SHEETS.ROMBEL, headers: CONFIG.HEADERS.ROMBEL },
  { name: CONFIG.SHEETS.MAPEL, headers: CONFIG.HEADERS.MAPEL },
  { name: CONFIG.SHEETS.SISWA, headers: CONFIG.HEADERS.SISWA },
  { name: CONFIG.SHEETS.MATERI, headers: CONFIG.HEADERS.MATERI },
  { name: CONFIG.SHEETS.SOAL_UJIAN, headers: CONFIG.HEADERS.SOAL_UJIAN },
  { name: CONFIG.SHEETS.PERCOBAAN_UJIAN, headers: CONFIG.HEADERS.PERCOBAAN_UJIAN },
  { name: CONFIG.SHEETS.JAWABAN, headers: CONFIG.HEADERS.JAWABAN },
  { name: CONFIG.SHEETS.CHAT, headers: CONFIG.HEADERS.CHAT },
  { name: CONFIG.SHEETS.KEHADIRAN, headers: CONFIG.HEADERS.KEHADIRAN },
  { name: CONFIG.SHEETS.IDENTITAS_SEKOLAH, headers: CONFIG.HEADERS.IDENTITAS_SEKOLAH }
];

function pastikanSemuaSheetAda() {
  var dibuat = [];
  REQUIRED_SHEETS.forEach(function(def) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
      sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
      dibuat.push(def.name);
    }
  });
  return dibuat;
}
