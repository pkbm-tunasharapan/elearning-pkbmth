// ============================================
// MENU SPREADSHEET (SISI TUTOR/ADMIN)
// ============================================

function onOpen() {
  pastikanSemuaSheetAda();
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('📖 Belajar Mandiri (Standalone)')
    .addSubMenu(ui.createMenu('🔐 Peran & Akses (Admin/Tutor)')
      .addItem('⚙️ Siapkan Tab Pengguna & Enrollment', 'menuSiapkanPeran')
      .addItem('🔑 Lengkapi ID & Kode Akses Pengguna', 'menuLengkapiPengguna')
      .addItem('🔗 Alamat Halaman Tutor/Admin', 'menuAlamatHalamanStaf')
      .addItem('✉️ Setujui Izin Pendaftaran (email & master control)', 'menuSetujuiIzinPendaftaran'))
    .addSubMenu(ui.createMenu('🏫 Rombel & Mapel')
      .addItem('✅ Validasi Data Rombel', 'menuValidasiRombel')
      .addItem('✅ Validasi Data Mapel', 'menuValidasiMapel'))
    .addSubMenu(ui.createMenu('👤 Siswa')
      .addItem('🔑 Generate Kode Akses untuk Siswa Baru', 'menuGenerateKodeAkses'))
    .addSubMenu(ui.createMenu('📚 Materi/Diskusi/Absensi/Ujian')
      .addItem('🔄 Pastikan ID Materi Terisi', 'menuPastikanIdMateri')
      .addItem('✅ Validasi Data Materi', 'menuValidasiMateri')
      .addItem('📋 Panduan Mengisi Sheet Materi', 'menuPanduanMateri'))
    .addSubMenu(ui.createMenu('📝 Soal Ujian (multi-soal)')
      .addItem('🔄 Pastikan ID Soal Terisi', 'menuPastikanIdSoal')
      .addItem('✅ Validasi Data Soal Ujian', 'menuValidasiSoalUjian')
      .addItem('📋 Panduan Mengisi Sheet Soal Ujian', 'menuPanduanSoalUjian')
      .addItem('↪️ Migrasi Ujian Lama (soal tunggal) ke Soal Ujian', 'menuMigrasiUjianLama')
      .addItem('🔓 Buka Kunci Ujian Siswa (setelah 3x pindah tab)', 'menuBukaKunciUjian'))
    .addSubMenu(ui.createMenu('🖨️ Laporan')
      .addItem('Cetak Rekap Nilai per Mapel', 'showRekapNilaiPanel'))
    .addSeparator()
    .addItem('🌐 Cara Deploy & Bagikan Link Web App', 'menuPanduanDeploy')
    .addItem('🛠️ Cek & Buat Sheet yang Kurang', 'menuCekSheet')
    .addToUi();
}

function menuValidasiRombel() { showDialog_(doValidasiRombel()); }
function menuValidasiMapel() { showDialog_(doValidasiMapel()); }
function menuValidasiMateri() { showDialog_(doValidasiMateri()); }
function menuGenerateKodeAkses() { showDialog_(doGenerateKodeAkses()); }
function menuPastikanIdMateri() { showDialog_(doPastikanIdMateri()); }
function menuPastikanIdSoal() { showDialog_(doPastikanIdSoal()); }
function menuValidasiSoalUjian() { showDialog_(doValidasiSoalUjian()); }
function menuMigrasiUjianLama() { showDialog_(doMigrasiUjianLama()); }

function menuPanduanSoalUjian() {
  showDialog_({
    tone: 'info', icon: '📝', title: 'Panduan Mengisi Sheet Soal Ujian', width: 560,
    message: 'Ujian sekarang bisa berisi BANYAK soal (dinavigasi satu-satu lewat overlay di Web App siswa). Isi di sheet "Soal Ujian", satu baris per SOAL:\n\n' +
      '• ID Ujian: harus sama persis dengan ID Materi dari baris di sheet "Materi" yang Jenis-nya "Ujian" (isi ID Materi dulu lewat menu Pastikan ID Materi Terisi kalau belum ada).\n' +
      '• Satu Ujian boleh punya berapa pun baris soal di sini - semuanya akan ditampilkan (urutan diacak otomatis, beda tiap siswa & tiap dia membuka ulang).\n' +
      '• Isi Opsi A-E dan Kunci Jawaban seperti biasa. Poin per soal dijumlah jadi Nilai Total ujian.\n' +
      '• Kolom ID Soal JANGAN diisi manual - otomatis terisi lewat menu "Pastikan ID Soal Terisi" (atau otomatis saat siswa buka ujian).\n' +
      '• Untuk UTS/UAS: kembali ke baris ujiannya di sheet "Materi", isi kolom "Durasi Menit (opsional, khusus Ujian)" (mis. 45) supaya siswa diberi timer countdown yang otomatis mengirim jawaban begitu waktu habis. Kosongkan untuk ujian harian tanpa batas waktu.\n' +
      '• Kalau siswa ketahuan pindah tab (mis. mencari jawaban di Google/AI) 3x saat mengerjakan, ujian itu otomatis terkunci untuknya - buka kuncinya lewat menu "🔓 Buka Kunci Ujian Siswa" di bawah menu Soal Ujian.'
  });
}

function menuBukaKunciUjian() {
  var sheet = getSheet(CONFIG.SHEETS.PERCOBAAN_UJIAN);
  var values = sheet.getDataRange().getValues();
  var cols = sesiCols_();
  var terkunci = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row[cols.terkunci - 1] === true) {
      var found = getMateriById_(row[cols.idUjian - 1]);
      var judul = found ? found.row[found.cols.judul - 1] : row[cols.idUjian - 1];
      terkunci.push({
        rowIndex: i + 1,
        label: row[cols.nama - 1] + ' - ' + judul + ' (percobaan pindah tab: ' + row[cols.percobaan - 1] + ')'
      });
    }
  }
  if (!terkunci.length) {
    showDialog_({ tone: 'success', icon: '🔓', title: 'Tidak Ada Ujian Terkunci', message: 'Saat ini tidak ada siswa yang ujiannya sedang terkunci.' });
    return;
  }
  showDialog_({
    tone: 'question', icon: '🔓', title: 'Buka Kunci Ujian Siswa', width: 480,
    message: 'Pilih siswa+ujian yang ingin dibuka kuncinya. Setelah dibuka, siswa bisa memakai Kode Akses-nya seperti biasa (tidak perlu kode baru).',
    inputs: [{
      key: 'rowIndex', label: 'Siswa & Ujian Terkunci', type: 'select', required: true,
      options: terkunci.map(function(t) { return { value: String(t.rowIndex), label: t.label }; })
    }],
    action: 'bukaKunciUjianBaris', confirmLabel: 'Buka Kunci'
  });
}

function bukaKunciUjianBaris(inputs) {
  var rowIndex = Number(inputs.rowIndex);
  var sheet = getSheet(CONFIG.SHEETS.PERCOBAAN_UJIAN);
  var cols = sesiCols_();
  sheet.getRange(rowIndex, cols.terkunci).setValue(false);
  sheet.getRange(rowIndex, cols.percobaan).setValue(0);
  return { tone: 'success', icon: '✅', title: 'Kunci Dibuka', message: 'Ujian untuk siswa ini sudah dibuka lagi dan hitungan pindah tab direset ke 0.' };
}

function menuCekSheet() {
  var dibuat = pastikanSemuaSheetAda();
  showDialog_({
    tone: 'success', icon: '✅', title: 'Cek Sheet Selesai',
    message: dibuat.length ? 'Sheet dibuat: ' + dibuat.join(', ') : 'Semua sheet yang diperlukan sudah ada.'
  });
}

function menuPanduanMateri() {
  showDialog_({
    tone: 'info', icon: '📋', title: 'Panduan Mengisi Sheet Materi', width: 560,
    message: 'Isi langsung di sheet "Materi", satu baris per materi/diskusi/absensi/ujian:\n\n' +
      '• ID Mapel: harus sama persis dengan salah satu ID Mapel di sheet "Mapel" - satu materi selalu milik satu mapel (dan otomatis satu rombel, lewat mapel itu).\n' +
      '• Jenis: Materi (bacaan, tanpa jawaban) / Diskusi (esai bebas) / Absensi (satu soal pilihan ganda langsung di baris ini) / Ujian (BISA BANYAK SOAL, diisi terpisah - lihat menu "📝 Soal Ujian").\n' +
      '• Untuk Absensi: isi Opsi A-E dan Kunci Jawaban di baris ini juga. Dinilai OTOMATIS saat siswa kirim.\n' +
      '• Untuk Ujian: Opsi A-E/Kunci Jawaban di baris INI TIDAK dipakai - isi soal-soalnya di sheet "Soal Ujian" (baris ini cuma jadi "wadah": Judul, Instruksi, dan opsional Durasi Menit untuk timer UTS/UAS).\n' +
      '• Poin: nilai maksimal kalau benar (default 100 jika kosong).\n' +
      '• Kolom ID Materi dan Dibuat Pada JANGAN diisi manual - otomatis terisi begitu Status diubah ke "Aktif" (lewat menu "Pastikan ID Materi Terisi", atau otomatis saat siswa buka Web App).\n' +
      '• Set Status ke "Aktif" supaya muncul di Web App siswa. "Draft" = belum tampil, "Selesai" = sudah ditutup (siswa yang belum jawab tidak bisa jawab lagi, tapi baris tetap tersimpan sebagai riwayat).'
  });
}

function menuPanduanDeploy() {
  var url = getWebAppUrlTersimpan_();
  showDialog_({
    tone: 'info', icon: '🌐', title: 'Deploy Web App untuk Siswa', width: 560,
    message: 'Langkah sekali di awal (lakukan dari editor Apps Script, menu Extensions > Apps Script):\n\n' +
      '1. Klik Deploy > New deployment.\n' +
      '2. Klik ikon gerigi di samping "Select type", pilih "Web app".\n' +
      '3. Execute as: "Me". Who has access: "Anyone" (siswa tidak perlu akun Google).\n' +
      '4. Klik Deploy, salin URL yang muncul, lalu bagikan ke siswa (bisa lewat WhatsApp/grup kelas).\n\n' +
      'Kalau kode di kit ini diperbarui nanti, gunakan Deploy > Manage deployments > ikon pensil > New version supaya URL tetap sama.' +
      (url ? '\n\nLink tersimpan terakhir: ' + url : ''),
    links: url ? [{ label: 'Buka Link Web App', url: url }] : null,
    inputs: [{ key: 'url', label: 'Simpan/perbarui link Web App di sini (opsional)', type: 'text', value: url || '', placeholder: 'https://script.google.com/macros/s/.../exec' }],
    action: 'simpanUrlWebApp', confirmLabel: 'Simpan Link'
  });
}

function simpanUrlWebApp(inputs) {
  var url = (inputs && inputs.url || '').trim();
  if (url) PropertiesService.getScriptProperties().setProperty('WEBAPP_URL', url);
  return {
    tone: 'success', icon: '✅', title: 'Tersimpan',
    message: url ? 'Link Web App disimpan: ' + url : 'Tidak ada link yang disimpan.'
  };
}

function getWebAppUrlTersimpan_() {
  return PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
}
