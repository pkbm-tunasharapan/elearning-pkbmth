// ============================================================================
// ARSIP PER SEMESTER (v1.40.0)
// ----------------------------------------------------------------------------
// Struktur Google Drive:
//   Arsip TH.E-Course / 2026-2027 / Semester Ganjil / [Data Semester Ganjil 2026-2027 (spreadsheet)]
//                                                     / A1 … C12 / Rapor | Foto | Lainnya
// Jenis arsip:
//   Reguler - dibuat otomatis setelah semester berganti (pemicu harian) atau tombol admin. Data semester itu disalin
//             ke spreadsheet arsip, nilai & kehadiran DIBEKUKAN ke tab NILAI / KEHADIRAN OFFLINE, rapor PDF dibuat.
//             Setelah semesternya lewat, baris semester itu DIHAPUS dari tab transaksi (Jawaban, Absensi, Chat, ...)
//             agar aplikasi hanya membaca semester berjalan. Hapus hanya setelah salinan diperiksa sama jumlahnya.
//   Offline - dibuat/diperbarui otomatis setelah admin mengunggah data hardcopy (DataOffline.gs).
// Proses berjalan bertahap (batas 6 menit Apps Script) lewat pemicu sekali-jalan; progres tersimpan di "Indeks Arsip".
// Membuka arsip: Admin & Kepala Sekolah, HANYA BACA. Mengubah isi arsip butuh KODE AKSES yang dibuat admin
// (per arsip, berbatas waktu, boleh untuk satu pengguna). Semua tindakan tercatat di tab "Log Arsip".
// ============================================================================
var ARS = {
  ROOT: 'Arsip TH.E-Course', PROP_ROOT: 'ARSIP_FOLDER',
  TAB_INDEKS: 'Indeks Arsip',
  HDR_INDEKS: ['ID', 'TAHUN PELAJARAN', 'SEMESTER', 'JENIS', 'STATUS', 'ID FOLDER', 'ID DATA', 'PROGRES', 'DIBUAT OLEH', 'DIBUAT PADA', 'SELESAI PADA', 'DIBERSIHKAN PADA', 'CATATAN'],
  TAB_LOG: 'Log Arsip', HDR_LOG: ['WAKTU', 'PENGGUNA', 'PERAN', 'AKSI', 'ARSIP', 'DETAIL', 'SEBELUM', 'SESUDAH'],
  TAB_KODE: 'Kode Arsip', HDR_KODE: ['ID', 'ARSIP', 'HASH', 'GARAM', 'BERLAKU SAMPAI', 'BERLAKU MS', 'UNTUK', 'NAMA UNTUK', 'DIBUAT OLEH', 'DIBUAT PADA', 'STATUS'],
  PEMICU_HARIAN: 'pemicuArsipHarian', PEMICU_LANJUT: 'pemicuArsipLanjut',
  MULAI: '2026/2027|Ganjil',          // periode pertama sistem (arsip reguler otomatis mulai dari sini)
  BATAS_MS: 270000, UBAH_DETIK: 7200, MAKS_SALAH: 5,
  // [tab, kolom tanggal]; '*SESI' = mengikuti ID sesi di SESI BELAJAR
  DATA: [['Jawaban', 'Waktu Kirim'], ['Absensi', 'Waktu Absen'], ['Hasil Ujian', 'Waktu'], ['Percobaan Ujian', 'Waktu Mulai'], ['Penilaian Diskusi', 'Waktu'],
    ['Chat', 'Waktu'], ['Notifikasi', 'Waktu'], ['Baca Materi', 'Terakhir Dibuka'], ['Log Aktivitas', 'Waktu'],
    ['PRESENSI HARIAN', 'TANGGAL'], ['SESI BELAJAR', 'TANGGAL'], ['PRESENSI WB', '*SESI'], ['PRESENSI KS', 'TANGGAL']],
  INDUK: ['WARGA BELAJAR', 'ROMBEL', 'MAPEL', 'ENROLL MAPEL', 'BIODATA WB', 'TUTOR'],
  // tab yang dibersihkan dari database utama setelah semesternya lewat (PRESENSI KS tetap untuk rekap honor)
  BERSIH: ['Jawaban', 'Absensi', 'Hasil Ujian', 'Percobaan Ujian', 'Penilaian Diskusi', 'Chat', 'Notifikasi', 'Baca Materi', 'Log Aktivitas', 'PRESENSI HARIAN', 'PRESENSI WB', 'SESI BELAJAR'],
  KET_BEKU: 'Dibekukan saat arsip (nilai sistem)'
};

// ---------- utilitas ----------
function arsNamaPer_(per) { return 'Semester ' + per.semester + ' ' + per.tahun; }
function arsTa_(tahun) { return String(tahun).replace('/', '-'); }
function arsKunciPer_(per) { return per.tahun + '|' + per.semester; }
function arsSebelum_(per) {
  var y = nilAwalTahun_(per.tahun);
  return per.semester === 'Genap' ? { tahun: y + '/' + (y + 1), semester: 'Ganjil' } : { tahun: (y - 1) + '/' + y, semester: 'Genap' };
}
function arsBoleh_(p) { return p.peran === 'Admin' || p.peran === 'Kepala Sekolah'; }
function arsWajib_(token) {
  var p = stafDariToken_(token);
  if (!arsBoleh_(p)) throw new Error('Arsip hanya dapat dibuka Admin dan Kepala Sekolah.');
  return p;
}
function arsLog_(p, aksi, arsip, detail, sebelum, sesudah) {
  try {
    var t = absBaca_(ARS.TAB_LOG, ARS.HDR_LOG);
    t.sh.appendRow(absBaris_(t, { 'WAKTU': absWaktu_(), 'PENGGUNA': p ? p.nama : 'Sistem', 'PERAN': p ? (p.peranAsli || p.peran) : 'Sistem', 'AKSI': aksi, 'ARSIP': arsip || '',
      'DETAIL': String(detail || '').slice(0, 500), 'SEBELUM': String(sebelum === undefined ? '' : sebelum).slice(0, 500), 'SESUDAH': String(sesudah === undefined ? '' : sesudah).slice(0, 500) }));
  } catch (e) {}
  try { catat_(p ? p.peran : 'Sistem', '', p ? p.nama : 'Sistem', 'Arsip: ' + aksi, (arsip ? arsip + ' · ' : '') + String(detail || '').slice(0, 200), 'OK'); } catch (e2) {}
}
function arsWaktuHabis_(mulai) { return new Date().getTime() - mulai > ARS.BATAS_MS; }

function arsRoot_() {
  var sp = PropertiesService.getScriptProperties(), id = sp.getProperty(ARS.PROP_ROOT);
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  var berkas = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  var induk = berkas.getParents().hasNext() ? berkas.getParents().next() : DriveApp.getRootFolder();
  var ada = induk.getFoldersByName(ARS.ROOT), root = ada.hasNext() ? ada.next() : induk.createFolder(ARS.ROOT);
  sp.setProperty(ARS.PROP_ROOT, root.getId());
  return root;
}
function arsSub_(induk, nama) { var it = induk.getFoldersByName(nama); return it.hasNext() ? it.next() : induk.createFolder(nama); }
function arsFolderRombel_(folderSmt, nama) {
  var f = arsSub_(folderSmt, nama);
  ['Rapor', 'Foto', 'Lainnya'].forEach(function(s) { arsSub_(f, s); });
  return f;
}
function arsTulisBerkas_(folder, blob) {
  var it = folder.getFilesByName(blob.getName());
  while (it.hasNext()) { try { it.next().setTrashed(true); } catch (e) {} }
  return folder.createFile(blob);
}

// ---------- indeks ----------
function arsIndeks_() { return absBaca_(ARS.TAB_INDEKS, ARS.HDR_INDEKS); }
function arsObj_(t, r, i) {
  var g = function(k) { return sTeks_(absNilai_(t, r, k)); };
  var pr = {};
  try { pr = JSON.parse(g('PROGRES') || '{}'); } catch (e) {}
  return { baris: i + 1, id: g('ID').trim(), tahun: g('TAHUN PELAJARAN').trim(), semester: g('SEMESTER').trim(), jenis: g('JENIS').trim(), status: g('STATUS').trim(),
    folder: g('ID FOLDER').trim(), data: g('ID DATA').trim(), progres: pr, oleh: g('DIBUAT OLEH'), dibuat: g('DIBUAT PADA'), selesai: g('SELESAI PADA'),
    bersih: g('DIBERSIHKAN PADA'), catatan: g('CATATAN') };
}
function arsSemua_() {
  var t = arsIndeks_(), out = [];
  for (var i = 1; i < t.v.length; i++) { var o = arsObj_(t, t.v[i], i); if (o.id) out.push(o); }
  return out;
}
function arsCari_(fn) { return arsSemua_().filter(fn)[0] || null; }
function arsSimpan_(a, ubah) {
  var t = arsIndeks_(), peta = { status: 'STATUS', folder: 'ID FOLDER', data: 'ID DATA', selesai: 'SELESAI PADA', bersih: 'DIBERSIHKAN PADA', catatan: 'CATATAN', jenis: 'JENIS' };
  Object.keys(ubah).forEach(function(k) {
    if (k === 'progres') { t.sh.getRange(a.baris, absCol_(t, 'PROGRES') + 1).setValue(JSON.stringify(ubah.progres)); a.progres = ubah.progres; return; }
    if (peta[k]) { t.sh.getRange(a.baris, absCol_(t, peta[k]) + 1).setValue(ubah[k]); a[k] = ubah[k]; }
  });
}

// Memulai (atau mengulang) pembuatan arsip satu periode. jenis: 'Reguler' | 'Offline'.
function arsMulai_(per, jenis, oleh) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var a;
  try {
    a = arsCari_(function(x) { return x.tahun === per.tahun && x.semester === per.semester; });
    var progres = { langkah: 'siapkan', i: 0, wb: 0, rombel: [], tab: 0 };
    if (a) {
      if (a.status === 'Proses') return { id: a.id, status: a.status, sudahBerjalan: true };
      arsSimpan_(a, { status: 'Proses', progres: progres, jenis: a.jenis === 'Reguler' ? 'Reguler' : jenis, catatan: '' });
    } else {
      var t = arsIndeks_();
      var id = 'ARS-' + arsTa_(per.tahun) + '-' + per.semester;
      t.sh.appendRow(absBaris_(t, { 'ID': id, 'TAHUN PELAJARAN': per.tahun, 'SEMESTER': per.semester, 'JENIS': jenis, 'STATUS': 'Proses',
        'PROGRES': JSON.stringify(progres), 'DIBUAT OLEH': oleh || 'Sistem', 'DIBUAT PADA': absWaktu_() }));
      a = arsCari_(function(x) { return x.id === id; });
    }
  } finally { lock.releaseLock(); }
  arsLog_({ nama: oleh || 'Sistem', peran: 'Sistem' }, 'Mulai arsip ' + (a.jenis || jenis), arsNamaPer_(per), '', '', '');
  arsJadwalLanjut_();
  return { id: a.id, status: 'Proses' };
}

function arsJadwalLanjut_() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === ARS.PEMICU_LANJUT) ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger(ARS.PEMICU_LANJUT).timeBased().after(60 * 1000).create();
  } catch (e) {}
}

// Pemicu sekali-jalan: lanjutkan arsip yang sedang diproses.
function pemicuArsipLanjut() {
  try { arsKerjakan_(); } catch (e) { pmlCatatGalat_('pemicu', ARS.PEMICU_LANJUT, String(e && e.message || e), e && e.stack, '', ''); }
}

// Pemicu harian: arsipkan semester yang baru lewat, lanjutkan proses, bersihkan arsip reguler yang semesternya sudah lewat.
function pemicuArsipHarian() {
  try {
    var kini = nilPeriode_(), lalu = arsSebelum_(kini), awal = ARS.MULAI.split('|');
    if (nilUrutPer_(lalu) >= nilUrutPer_({ tahun: awal[0], semester: awal[1] })) {
      var ada = arsCari_(function(x) { return x.tahun === lalu.tahun && x.semester === lalu.semester; });
      if (!ada) arsMulai_(lalu, 'Reguler', 'Otomatis (semester berganti)');
    }
    arsSemua_().forEach(function(a) {
      if (a.status === 'Selesai' && a.jenis === 'Reguler' && !a.bersih && nilUrutPer_({ tahun: a.tahun, semester: a.semester }) < nilUrutPer_(kini)) {
        // jalankan ulang seluruh tahap (data & rapor final, bekukan nilai) lalu pindahkan baris dari database utama
        arsSimpan_(a, { status: 'Proses', progres: { langkah: 'siapkan', i: 0, wb: 0, tab: 0, rombel: [] } });
      }
    });
    if (arsCari_(function(x) { return x.status === 'Proses'; })) arsKerjakan_();
  } catch (e) { pmlCatatGalat_('pemicu', ARS.PEMICU_HARIAN, String(e && e.message || e), e && e.stack, '', ''); }
}

// ---------- mesin bertahap ----------
function arsKerjakan_() {
  var mulai = new Date().getTime();
  // penanda "sedang berjalan" (bukan kunci skrip, agar simpan data pengguna lain tidak tertahan beberapa menit)
  var c = CacheService.getScriptCache();
  if (c.get('ars_jalan')) { arsJadwalLanjut_(); return; }
  c.put('ars_jalan', '1', 330);
  try {
    var a = arsCari_(function(x) { return x.status === 'Proses'; });
    if (!a) return;
    var per = nilPeriode_({ tahun: a.tahun, semester: a.semester }), kini = nilPeriode_(), pr = a.progres || {};
    var lampau = nilUrutPer_(per) < nilUrutPer_(kini);
    try {
      while (!arsWaktuHabis_(mulai)) {
        if (pr.langkah === 'siapkan') {
          var root = arsRoot_(), fTa = arsSub_(root, arsTa_(per.tahun)), fSmt = arsSub_(fTa, 'Semester ' + per.semester);
          var dataId = a.data, ss = null;
          if (dataId) { try { ss = SpreadsheetApp.openById(dataId); } catch (e) { ss = null; } }
          if (!ss) {
            ss = SpreadsheetApp.create('Data ' + arsNamaPer_(per).replace('/', '-'));
            DriveApp.getFileById(ss.getId()).moveTo(fSmt);
          }
          var rb = absBaca_('ROMBEL');
          pr.rombel = [];
          for (var i = 1; i < rb.v.length; i++) {
            var idR = sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim(), ak = String(absNilai_(rb, rb.v[i], 'AKTIF')).toUpperCase();
            if (idR && ak !== 'FALSE') pr.rombel.push({ kini: idR, nama: sTeks_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL')).trim() });
          }
          pr.rombel.sort(function(x, y) { return x.nama.localeCompare(y.nama, 'id', { numeric: true }); });
          arsSimpan_(a, { folder: fSmt.getId(), data: ss.getId() });
          pr.langkah = 'data'; pr.tab = 0;
        } else if (pr.langkah === 'data') {
          var daftarTab = arsDaftarSalin_();
          if (pr.tab >= daftarTab.length) { pr.langkah = a.jenis === 'Reguler' && lampau ? 'beku' : 'rapor'; pr.i = 0; pr.wb = 0; continue; }
          arsSalinTab_(SpreadsheetApp.openById(a.data), daftarTab[pr.tab], per);
          pr.tab++;
        } else if (pr.langkah === 'beku') {
          if (pr.i >= pr.rombel.length) { pr.langkah = 'rapor'; pr.i = 0; pr.wb = 0; continue; }
          arsBeku_(pr.rombel[pr.i].kini, per, kini, lampau);
          pr.i++;
        } else if (pr.langkah === 'rapor') {
          if (pr.i >= pr.rombel.length) { pr.langkah = a.jenis === 'Reguler' ? 'foto' : 'catatan'; pr.i = 0; continue; }
          var selesai = arsRaporRombel_(a, pr, per, kini, lampau, mulai);
          if (selesai) { pr.i++; pr.wb = 0; }
        } else if (pr.langkah === 'foto') {
          if (pr.i >= pr.rombel.length) { pr.langkah = 'catatan'; continue; }
          arsFoto_(a, pr.rombel[pr.i]);
          pr.i++;
        } else if (pr.langkah === 'catatan') {
          arsCatatan_(SpreadsheetApp.openById(a.data), a, per);
          var bersihkan = a.jenis === 'Reguler' && lampau && !a.bersih;
          arsSimpan_(a, { status: bersihkan ? 'Proses' : 'Selesai', selesai: absWaktu_() });
          arsLog_(null, 'Arsip selesai dibuat', arsNamaPer_(per), a.jenis, '', '');
          if (!bersihkan) { pr.langkah = 'selesai'; break; }
          pr.langkah = 'bersih'; pr.tab = 0;
        } else if (pr.langkah === 'bersih') {
          if (pr.tab >= ARS.BERSIH.length) {
            arsSimpan_(a, { status: 'Selesai', bersih: absWaktu_() });
            arsLog_(null, 'Database utama dibersihkan', arsNamaPer_(per), 'Baris ' + arsNamaPer_(per) + ' dipindah ke arsip', '', '');
            pr.langkah = 'selesai'; break;
          }
          arsBersihTab_(SpreadsheetApp.openById(a.data), ARS.BERSIH[pr.tab], per, a);
          pr.tab++;
        } else break;
        arsSimpan_(a, { progres: pr });
      }
      arsSimpan_(a, { progres: pr });
      if (pr.langkah !== 'selesai') arsJadwalLanjut_();
    } catch (e) {
      arsSimpan_(a, { status: 'Gagal', catatan: String(e && e.message || e).slice(0, 400), progres: pr });
      arsLog_(null, 'Arsip gagal', arsNamaPer_(per), String(e && e.message || e), '', '');
      throw e;
    }
  } finally { c.remove('ars_jalan'); }
}

// ---------- salin data ----------
function arsDaftarSalin_() {
  var out = ARS.DATA.map(function(d) { return { tab: d[0], tgl: d[1] }; });
  ARS.INDUK.forEach(function(n) { out.push({ tab: n, induk: true }); });
  out.push({ tab: NIL.TAB_NILAI, nilai: true });
  out.push({ tab: OFL.TAB_HADIR, nilai: true });
  out.push({ tab: KNK.TAB, naik: true });
  return out;
}
function arsBacaTab_(nama) {
  var sh = simTab_(nama);
  if (!sh) return null;
  return { sh: sh, v: sh.getDataRange().getValues() };
}
// Baris (indeks 1..) sebuah tab yang termasuk periode per.
function arsBarisPeriode_(t, d, per) {
  var hd = (t.v[0] || []).map(function(x) { return String(x).trim().toUpperCase(); }), out = [];
  if (d.nilai || d.naik) {
    var kT = hd.indexOf(d.naik ? 'TAHUN' : 'TAHUN PELAJARAN'), kS = hd.indexOf('SEMESTER');
    for (var i = 1; i < t.v.length; i++) {
      if (kT < 0 || sTeks_(t.v[i][kT]).trim() !== per.tahun) continue;
      if (!d.naik && kS >= 0 && sTeks_(t.v[i][kS]).trim() !== per.semester) continue;
      out.push(i);
    }
    return out;
  }
  if (d.tgl === '*SESI') {
    var sesi = {}, ts = arsBacaTab_('SESI BELAJAR');
    if (ts) {
      var hs = ts.v[0].map(function(x) { return String(x).trim().toUpperCase(); }), kId = hs.indexOf('ID SESI'), kTg = hs.indexOf('TANGGAL');
      for (var a = 1; a < ts.v.length; a++) { var tg = absTgl_(ts.v[a][kTg]); if (tg && tg >= per.dari && tg <= per.sampai) sesi[sTeks_(ts.v[a][kId]).trim()] = true; }
    }
    var kJ = hd.indexOf('JADWAL');
    for (var b = 1; b < t.v.length; b++) if (kJ >= 0 && sesi[sTeks_(t.v[b][kJ]).trim()]) out.push(b);
    return out;
  }
  var k = hd.indexOf(String(d.tgl).toUpperCase());
  if (k < 0) return out;
  for (var c = 1; c < t.v.length; c++) {
    var tgl = absTgl_(t.v[c][k]);
    if (tgl && tgl >= per.dari && tgl <= per.sampai) out.push(c);
  }
  return out;
}
function arsTulisTab_(ss, nama, baris) {
  var sh = ss.getSheetByName(nama) || ss.insertSheet(nama);
  sh.clear();
  if (!baris.length) return sh;
  var lebar = baris.reduce(function(m, r) { return Math.max(m, r.length); }, 1);
  var isi = baris.map(function(r) { var x = r.slice(); while (x.length < lebar) x.push(''); return x.map(function(v) { return typeof v === 'string' && v.length > 49000 ? v.slice(0, 49000) : v; }); });
  for (var i = 0; i < isi.length; i += 2000) sh.getRange(i + 1, 1, Math.min(2000, isi.length - i), lebar).setValues(isi.slice(i, i + 2000));
  sh.setFrozenRows(1);
  try { sh.getRange(1, 1, 1, lebar).setFontWeight('bold'); } catch (e) {}
  return sh;
}
function arsSalinTab_(ss, d, per) {
  var t = arsBacaTab_(d.tab);
  if (!t || !t.v.length) return 0;
  var baris = d.induk ? t.v : [t.v[0]].concat(arsBarisPeriode_(t, d, per).map(function(i) { return t.v[i]; }));
  arsTulisTab_(ss, d.tab, baris);
  try { var b0 = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1'); if (b0 && ss.getSheets().length > 1) ss.deleteSheet(b0); } catch (e) {}
  return baris.length - 1;
}

// ---------- bekukan nilai & kehadiran sistem (arsip reguler) ----------
function arsBeku_(idKini, per, kini, lampau) {
  var data = [];
  try {
    if (lampau) {
      var h = nilHitungLampau_(idKini, per, kini);
      h.rekap.forEach(function(z) { data.push({ g: z.g, kl: z.kl, x: z.x }); });
      data.k = h.k;
    } else {
      var k = nilKtx_(per), kelas = nilKelasRombel_(idKini, k);
      kelas.forEach(function(kl) { nilRekapKelas_(k, kl).forEach(function(x) { data.push({ g: idKini, kl: kl, x: x }); }); });
      data.k = k;
    }
  } catch (e) { return; }
  if (!data.length) return;
  var t = absBaca_(NIL.TAB_NILAI, NIL.HDR_NILAI), ada = {}, baru = [], hari = absHariIni_();
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (sTeks_(absNilai_(t, r, 'TAHUN PELAJARAN')).trim() !== per.tahun || sTeks_(absNilai_(t, r, 'SEMESTER')).trim() !== per.semester) continue;
    var kunciN = [sTeks_(absNilai_(t, r, 'WARGA BELAJAR')).trim(), sTeks_(absNilai_(t, r, 'ROMBEL')).trim(), sTeks_(absNilai_(t, r, 'MAPEL')).trim(), sTeks_(absNilai_(t, r, 'JENIS ASESMEN')).trim()].join('|');
    if (sTeks_(absNilai_(t, r, 'KETERANGAN')).trim() === ARS.KET_BEKU) ada[kunciN] = i + 1;          // beku lama: diperbarui
    else if (sTeks_(absNilai_(t, r, 'NILAI')).trim() !== '') ada[kunciN] = true;                       // nilai guru/offline: dibiarkan
  }
  var cNil = absCol_(t, 'NILAI');
  var tambah = function(z, jenis, nilai) {
    var kk = [z.x.idWb, z.g, z.kl.kodeMapel, jenis].join('|');
    if (nilai === null || nilai === undefined || ada[kk] === true) return;
    if (typeof ada[kk] === 'number') { t.sh.getRange(ada[kk], cNil + 1).setValue(String(nilai)); ada[kk] = true; return; }
    ada[kk] = true;
    baru.push(absBaris_(t, { 'ID NILAI': absId_(), 'TANGGAL': hari, 'ROMBEL': z.g, 'MAPEL': z.kl.kodeMapel, 'JENIS ASESMEN': jenis, 'WARGA BELAJAR': z.x.idWb,
      'NILAI': String(nilai), 'KETERANGAN': ARS.KET_BEKU, 'TUTOR': z.kl.idTutor || '', 'TAHUN PELAJARAN': per.tahun, 'SEMESTER': per.semester, 'DICATAT OLEH': 'Sistem (arsip)' }));
  };
  data.forEach(function(z) {
    if (z.x.jmlDiskusi > 0) tambah(z, 'Tugas', z.x.diskusi);
    if (z.x.uts.online !== null) tambah(z, 'UTS', z.x.uts.online);
    if (z.x.uas.online !== null) tambah(z, 'UAS', z.x.uas.online);
  });
  // rekap kehadiran tatap muka per WB (bila belum ada rekap offline/beku)
  var k2 = data.k, th = absBaca_(OFL.TAB_HADIR, OFL.HDR_HADIR), baruH = [], waktu = absWaktu_(), sudah = {};
  data.forEach(function(z) {
    var id = z.x.idWb;
    if (sudah[id] || (k2.hadirOffline && k2.hadirOffline[id])) return;
    sudah[id] = true;
    var hd = k2.rekapHadir[id];
    if (!hd) return;
    var jml = (hd.Hadir || 0) + (hd.Izin || 0) + (hd.Sakit || 0) + (hd.Alpa || 0);
    if (!jml) return;
    baruH.push(absBaris_(th, { 'ID': absId_(), 'TAHUN PELAJARAN': per.tahun, 'SEMESTER': per.semester, 'ROMBEL': z.g, 'WARGA BELAJAR': id, 'NAMA': z.x.nama,
      'PERTEMUAN': jml, 'HADIR': hd.Hadir || 0, 'IZIN': hd.Izin || 0, 'SAKIT': hd.Sakit || 0, 'ALPA': hd.Alpa || 0, 'KETERANGAN': ARS.KET_BEKU, 'DICATAT OLEH': 'Sistem (arsip)', 'DICATAT PADA': waktu }));
  });
  if (baru.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, baru.length, baru[0].length).setValues(baru);
  if (baruH.length) th.sh.getRange(th.sh.getLastRow() + 1, 1, baruH.length, baruH[0].length).setValues(baruH);
}

// ---------- rapor PDF per rombel ----------
// Mengembalikan true bila rombel ini selesai (false = waktu habis, dilanjutkan dari pr.wb).
function arsRaporRombel_(a, pr, per, kini, lampau, mulai) {
  var r = pr.rombel[pr.i], leger;
  try {
    leger = lampau ? nilLegerLampau_(r.kini, per, kini, false) : nilLegerKini_(r.kini, per);
  } catch (e) { r.lewati = String(e && e.message || e).slice(0, 120); return true; }
  if (!lampau && per.semester === 'Genap') leger.kenaikan = arsKenaikanKini_(leger);
  var wbs = leger.wb;
  if (a.jenis === 'Offline') {
    wbs = wbs.filter(function(w) { var hd = w.kehadiran || {}; return w.n > 0 || (hd.Hadir || 0) + (hd.Izin || 0) + (hd.Sakit || 0) + (hd.Alpa || 0) > 0; });
  }
  if (!wbs.length) { r.lewati = 'tidak ada data'; return true; }
  var fSmt = DriveApp.getFolderById(a.folder), fRb = arsFolderRombel_(fSmt, leger.rombel.nama);
  r.periode = leger.rombel.nama; r.folder = fRb.getId();
  var fRapor = arsSub_(fRb, 'Rapor'), fLain = arsSub_(fRb, 'Lainnya'), akhiran = '_' + per.semester + '_' + arsTa_(per.tahun);
  if (!pr.wb) {
    arsTulisBerkas_(fLain, Utilities.newBlob(arsLegerHtml_(leger), 'text/html', 'leger.html').getAs('application/pdf').setName('Leger_' + leger.rombel.nama + akhiran + '.pdf'));
    try { arsTulisTab_(SpreadsheetApp.openById(a.data), 'LEGER ' + leger.rombel.nama, arsLegerBaris_(leger)); } catch (e1) {}
  }
  for (var j = pr.wb || 0; j < wbs.length; j++) {
    if (arsWaktuHabis_(mulai)) { pr.wb = j; return false; }
    var w = wbs[j], nm = String(w.nama).replace(/[^A-Za-z0-9]+/g, '_');
    arsTulisBerkas_(fRapor, Utilities.newBlob(arsRaporHtml_(leger, [w]), 'text/html', 'rapor.html').getAs('application/pdf').setName('Rapor_' + nm + akhiran + '.pdf'));
  }
  r.rapor = wbs.length;
  return true;
}
// Keputusan kenaikan semester Genap berjalan (tercatat di KENAIKAN KELAS).
function arsKenaikanKini_(leger) {
  try {
    var t = knkBaca_(), kep = {};
    for (var i = 1; i < t.v.length; i++) {
      var r = t.v[i];
      if (sTeks_(absNilai_(t, r, 'TAHUN')).trim() !== leger.periode.tahun || sTeks_(absNilai_(t, r, 'ID ROMBEL')).trim() !== leger.rombel.id) continue;
      kep[sTeks_(absNilai_(t, r, 'ID WB')).trim()] = sTeks_(absNilai_(t, r, 'KEPUTUSAN')).trim();
    }
    return { info: knkInfoRombel_(leger.rombel.id), tahun: leger.periode.tahun, keputusan: kep };
  } catch (e) { return null; }
}
function arsLegerBaris_(leger) {
  var kol = ['NO', 'ID WB', 'NISN', 'NAMA'].concat(leger.mapel.map(function(m) { return m.kode; })).concat(['RATA-RATA', 'PERINGKAT', 'HADIR', 'IZIN', 'SAKIT', 'ALPA']);
  var out = [kol];
  leger.wb.forEach(function(w, i) {
    var hd = w.kehadiran || {};
    out.push([i + 1, w.idWb, "'" + (w.nisn || ''), w.nama].concat(leger.mapel.map(function(m) { var v = w.nilai[m.kode]; return v === null || v === undefined ? '' : v; }))
      .concat([w.rata === null || w.rata === undefined ? '' : w.rata, w.peringkat || '', hd.Hadir || 0, hd.Izin || 0, hd.Sakit || 0, hd.Alpa || 0]));
  });
  return out;
}

// ---------- foto profil WB (arsip reguler) ----------
function arsFoto_(a, r) {
  if (!r.folder) return;
  try {
    var peta = nilPetaBm_(), elRombel = Object.keys((peta.rombel || {})[r.kini] || {});
    if (!elRombel.length) return;
    var fFoto = arsSub_(DriveApp.getFolderById(r.folder), 'Foto');
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Profil Akun');
    if (!sh) return;
    var v = sh.getDataRange().getValues(), n = 0;
    for (var i = 1; i < v.length; i++) {
      var kunci = String(v[i][0] || ''), foto = String(v[i][5] || '');
      if (kunci.indexOf('S|') !== 0 || foto.indexOf('data:image') !== 0) continue;
      var bag = kunci.split('|');
      if (elRombel.indexOf(bag[1]) < 0) continue;
      var m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(foto);
      if (!m) continue;
      var nama = String(v[i][2] || bag[2] || 'siswa').replace(/[^A-Za-z0-9]+/g, '_') + (m[1] === 'image/png' ? '.png' : '.jpg');
      arsTulisBerkas_(fFoto, Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], nama));
      n++;
    }
    r.foto = n;
  } catch (e) {}
}

function arsCatatan_(ss, a, per) {
  var baris = [['KETERANGAN', 'ISI'],
    ['Arsip', arsNamaPer_(per)], ['Jenis', a.jenis], ['Dibuat oleh', a.oleh], ['Dibuat pada', a.dibuat], ['Diperbarui', absWaktu_()],
    ['Sifat', 'HANYA BACA. Perubahan hanya lewat aplikasi (menu Arsip Data) dengan kode akses dari admin; setiap perubahan tercatat di Log Arsip.']];
  if (a.jenis === 'Offline') baris.push(['Data offline', OFL.CATATAN]);
  else baris.push(['Nilai', 'Nilai sistem (tugas/diskusi online, UTS/UAS online) dan rekap kehadiran dibekukan ke tab NILAI dan KEHADIRAN OFFLINE dengan keterangan "' + ARS.KET_BEKU + '".']);
  var sh = arsTulisTab_(ss, 'CATATAN', baris);
  try { ss.setActiveSheet(sh); ss.moveActiveSheet(1); } catch (e) {}
}

// ---------- bersihkan database utama (arsip reguler, semester sudah lewat) ----------
function arsBersihTab_(ss, nama, per, a) {
  var d = null;
  arsDaftarSalin_().forEach(function(x) { if (x.tab === nama) d = x; });
  if (!d) return;
  var t = arsBacaTab_(nama);
  if (!t || t.v.length < 2) return;
  var idx = arsBarisPeriode_(t, d, per);
  if (!idx.length) return;
  // salin ulang yang terbaru, periksa jumlah, baru hapus
  var baris = [t.v[0]].concat(idx.map(function(i) { return t.v[i]; }));
  var sh = arsTulisTab_(ss, nama, baris);
  SpreadsheetApp.flush();
  if (sh.getLastRow() - 1 !== idx.length) { arsLog_(null, 'Bersihkan dilewati', arsNamaPer_(per), nama + ': jumlah salinan tidak sama', idx.length, sh.getLastRow() - 1); return; }
  // hapus dari bawah ke atas per blok baris berurutan (baris baru di bawah tidak menggeser indeks)
  var blok = [], awal = idx[0], akhir = idx[0];
  for (var k = 1; k < idx.length; k++) {
    if (idx[k] === akhir + 1) akhir = idx[k]; else { blok.push([awal, akhir]); awal = akhir = idx[k]; }
  }
  blok.push([awal, akhir]);
  for (var b = blok.length - 1; b >= 0; b--) t.sh.deleteRows(blok[b][0] + 1, blok[b][1] - blok[b][0] + 1);
  arsLog_(null, 'Pindah ke arsip', arsNamaPer_(per), nama + ': ' + idx.length + ' baris', '', '');
}

// ---------- HTML rapor & leger (sama dengan aplikasi) ----------
var ARS_CSS = '.kop{text-align:center;border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:8px}.lb{font-size:15pt;font-weight:bold}' +
  'h2{text-align:center;font-size:12pt;margin:6px 0 10px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:4px 5px;font-size:9.5pt}' +
  'th{background:#eee}.c{text-align:center}.id td{border:none;padding:1px 4px}.ttd{width:100%;margin-top:24px}.ttd td{border:none;text-align:center;vertical-align:top;font-size:10pt}' +
  '.hal{page-break-after:always}.hal:last-child{page-break-after:auto}.kecil{font-size:8.5pt;color:#444}';
function arsEsc_(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function arsNilT_(v) { if (v === null || v === undefined || v === '' || isNaN(Number(v))) return '–'; var n = Number(v); return n === Math.round(n) ? String(n) : n.toFixed(1); }
function arsDok_(html, lanskap) {
  return '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:' + (lanskap ? '330mm 215mm' : '215mm 330mm') + ';margin:10mm}' +
    'body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:10pt;line-height:1.35}' + ARS_CSS + '</style></head><body>' + html + '</body></html>';
}
function arsKop_(l, judul) { return '<div class="kop"><div class="lb">' + arsEsc_(l.nama || 'PKBM') + '</div><div>NPSN ' + arsEsc_(l.npsn) + ' · ' + arsEsc_(l.alamat) + '</div></div><h2>' + judul + '</h2>'; }
function arsProgram_(p) { return { 'PKT-A': 'Paket A (setara SD)', 'PKT-B': 'Paket B (setara SMP)', 'PKT-C': 'Paket C (setara SMA)' }[String(p).toUpperCase()] || p; }
function arsKota_(alamat) { var b = String(alamat || '').split(',').map(function(x) { return x.trim(); }).filter(function(x) { return x; }); return b.length ? b[b.length - 1].replace(/^(Kab\.?|Kabupaten|Kota)\s*/i, '') : ''; }
function arsTglPanjang_(iso) {
  var bl = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'], p = String(iso).split('-');
  return p.length === 3 ? Number(p[2]) + ' ' + bl[Number(p[1]) - 1] + ' ' + p[0] : iso;
}
function arsKelasTeks_(k, t) {
  var kata = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas', 'dua belas'];
  k = Number(k) || 0;
  if (!k) return '.........';
  return 'kelas ' + k + (kata[k] ? ' (' + kata[k] + ')' : '') + (t ? ' (Tingkatan ' + t + ')' : '');
}
function arsDeskripsi_(nama, p) {
  return { A: 'Menunjukkan penguasaan kompetensi ' + nama + ' dengan sangat baik.', B: 'Menunjukkan penguasaan kompetensi ' + nama + ' dengan baik.',
    C: 'Menunjukkan penguasaan kompetensi ' + nama + ' dengan cukup.', D: 'Perlu bimbingan lebih lanjut dalam mencapai kompetensi ' + nama + '.' }[p] || 'Nilai belum lengkap.';
}
function arsRaporHtml_(d, wbs) {
  var l = d.lembaga || {}, rb = d.rombel || {}, per = d.periode || {}, at = d.aturan || {}, kota = arsKota_(l.alamat);
  var kn = per.semester === 'Genap' && d.kenaikan ? d.kenaikan : null, b = [];
  // tanggal rapor = akhir semester itu (bukan hari ini) agar sesuai periodenya
  var tgl = arsTglPanjang_(per.sampai || absHariIni_());
  wbs.forEach(function(w) {
    var h = w.kehadiran || {};
    b.push('<div class="hal">' + arsKop_(l, 'LAPORAN HASIL BELAJAR'));
    b.push('<table class="id"><tr><td>Nama</td><td>: <b>' + arsEsc_(w.nama) + '</b></td><td>Program</td><td>: ' + arsEsc_(arsProgram_(rb.program)) + '</td></tr>' +
      '<tr><td>NISN</td><td>: ' + arsEsc_(w.nisn || '-') + '</td><td>Rombel</td><td>: ' + arsEsc_(rb.nama) + '</td></tr>' +
      '<tr><td>Lembaga</td><td>: ' + arsEsc_(l.nama) + '</td><td>Semester</td><td>: ' + arsEsc_(per.semester) + ' ' + arsEsc_(per.tahun) + '</td></tr></table><br>');
    b.push('<table><tr><th>No</th><th>Mata Pelajaran</th><th>KKM</th><th>Nilai</th><th>Predikat</th><th>Deskripsi</th></tr>');
    d.mapel.forEach(function(m, i) {
      var n = w.nilai[m.kode], p = w.predikat[m.kode] || '';
      b.push('<tr><td class="c">' + (i + 1) + '</td><td>' + arsEsc_(m.nama) + '</td><td class="c">' + arsNilT_(at.kkm) + '</td><td class="c"><b>' + arsNilT_(n) + '</b></td><td class="c">' + arsEsc_(p) + '</td><td>' + arsEsc_(arsDeskripsi_(m.nama, p)) + '</td></tr>');
    });
    b.push('<tr><td colspan="3" class="c"><b>Rata-rata</b></td><td class="c"><b>' + arsNilT_(w.rata) + '</b></td><td colspan="2">Peringkat ' + (w.peringkat || '–') + ' dari ' + d.wb.length + '</td></tr></table><br>');
    b.push('<table style="width:55%"><tr><th colspan="2">Ketidakhadiran tatap muka</th></tr><tr><td>Sakit</td><td class="c">' + (h.Sakit || 0) + ' hari</td></tr>' +
      '<tr><td>Izin</td><td class="c">' + (h.Izin || 0) + ' hari</td></tr><tr><td>Tanpa keterangan</td><td class="c">' + (h.Alpa || 0) + ' hari</td></tr></table>');
    if (kn && kn.info) {
      var info = kn.info, kep = (kn.keputusan || {})[w.idWb] || '', isi;
      var ini = arsKelasTeks_(info.kelas, info.tingkatRomawi), lanjut = arsKelasTeks_(info.kelasBerikut, info.tingkatBerikutRomawi);
      if (info.akhir) isi = kep === 'Lulus' ? '<b>LULUS</b>' : kep === 'Tidak Lulus' ? '<b>TIDAK LULUS</b>' : '<b>LULUS / TIDAK LULUS</b>*';
      else isi = kep === 'Naik' ? '<b>NAIK</b> ke ' + arsEsc_(lanjut) : kep === 'Tinggal' ? '<b>TINGGAL</b> di ' + arsEsc_(ini) : '<b>NAIK</b> ke ' + arsEsc_(lanjut) + ' / <b>TINGGAL</b> di ' + arsEsc_(ini) + '*';
      b.push('<table style="width:100%;margin-top:8px"><tr><th style="text-align:left">Keputusan</th></tr><tr><td style="padding:6px 8px">Berdasarkan pencapaian seluruh kompetensi, peserta didik dinyatakan:<br><span style="font-size:11.5pt">' + isi + '</span>' +
        (kep ? '' : '<br><span style="font-size:8pt">*coret yang tidak perlu</span>') + '</td></tr></table>');
    }
    if (d.offline) b.push('<p class="kecil">' + arsEsc_(OFL.CATATAN) + '</p>');
    b.push('<table class="ttd"><tr><td>Orang Tua/Wali<br><br><br><br><br>(..............................)</td>' +
      '<td>' + arsEsc_(kota) + (kota ? ', ' : '') + arsEsc_(tgl) + '<br>Wali Kelas<br><br><br><br><b><u>' + arsEsc_((d.wali && d.wali.nama) || '..............................') + '</u></b></td></tr>' +
      '<tr><td colspan="2" style="padding-top:14px">Mengetahui,<br>Kepala ' + arsEsc_(l.nama || 'PKBM') + '<br><br><br><br><b><u>' + arsEsc_(l.kepala || '..............................') + '</u></b></td></tr></table></div>');
  });
  return arsDok_(b.join(''), false);
}
function arsLegerHtml_(d) {
  var rb = d.rombel || {}, per = d.periode || {}, b = [arsKop_(d.lembaga || {}, 'LEGER NILAI ' + arsEsc_(String(rb.nama).toUpperCase()))];
  b.push('<p>' + arsEsc_(arsProgram_(rb.program)) + ' · Semester ' + arsEsc_(per.semester) + ' ' + arsEsc_(per.tahun) + ' · KKM ' + arsNilT_((d.aturan || {}).kkm) + '</p>');
  b.push('<table><tr><th>No</th><th>NISN</th><th>Nama</th>' + d.mapel.map(function(m) { return '<th>' + arsEsc_(m.kode) + '</th>'; }).join('') + '<th>Rata-rata</th><th>Peringkat</th><th>S</th><th>I</th><th>A</th></tr>');
  d.wb.forEach(function(w, i) {
    var h = w.kehadiran || {};
    b.push('<tr><td class="c">' + (i + 1) + '</td><td>' + arsEsc_(w.nisn) + '</td><td>' + arsEsc_(w.nama) + '</td>' + d.mapel.map(function(m) { return '<td class="c">' + arsNilT_(w.nilai[m.kode]) + '</td>'; }).join('') +
      '<td class="c">' + arsNilT_(w.rata) + '</td><td class="c">' + (w.peringkat || '–') + '</td><td class="c">' + (h.Sakit || 0) + '</td><td class="c">' + (h.Izin || 0) + '</td><td class="c">' + (h.Alpa || 0) + '</td></tr>');
  });
  b.push('</table><p class="kecil">Keterangan mapel: ' + d.mapel.map(function(m) { return arsEsc_(m.kode) + ' = ' + arsEsc_(m.nama); }).join('; ') + '</p>');
  if (d.offline) b.push('<p class="kecil">' + arsEsc_(OFL.CATATAN) + '</p>');
  return arsDok_(b.join(''), true);
}

// ============================================================================
// ENDPOINT
// ============================================================================
function arsRingkas_(a) {
  var langkah = { siapkan: 'Menyiapkan folder', data: 'Menyalin data', beku: 'Membekukan nilai', rapor: 'Membuat rapor PDF', foto: 'Menyalin foto', catatan: 'Menyelesaikan', bersih: 'Memindahkan data dari database utama', selesai: 'Selesai' };
  var pr = a.progres || {}, rb = pr.rombel || [];
  var teks = a.status === 'Proses' ? (langkah[pr.langkah] || pr.langkah) + (pr.langkah === 'rapor' || pr.langkah === 'beku' || pr.langkah === 'foto' ? ' (' + Math.min(pr.i || 0, rb.length) + '/' + rb.length + ' rombel)' : '') : '';
  return { id: a.id, tahun: a.tahun, semester: a.semester, jenis: a.jenis, status: a.status, progres: teks, oleh: a.oleh, dibuat: a.dibuat, selesai: a.selesai, bersih: a.bersih, catatan: a.catatan,
    rombel: rb.filter(function(r) { return r.folder; }).map(function(r) { return { nama: r.periode || r.nama, rapor: r.rapor || 0 }; }) };
}

function waStafArsipDaftar(token) {
  var p = arsWajib_(token), admin = p.peran === 'Admin', kini = nilPeriode_();
  try { rlsPastikanPemicu_(false); } catch (e0) {}
  try { rlsPastikanPemicu_(admin); } catch (e1) {}
  var out = { admin: admin, periodeKini: kini, arsip: arsSemua_().sort(function(x, y) { return nilUrutPer_(y) - nilUrutPer_(x); }).map(arsRingkas_) };
  // pilihan semester: semester berjalan dan 6 semester sebelumnya
  var pil = [], q = kini;
  for (var i = 0; i < 7; i++) { pil.push({ tahun: q.tahun, semester: q.semester, kini: i === 0 }); q = arsSebelum_(q); }
  out.pilihan = pil;
  if (admin) {
    var rb = absBaca_('ROMBEL'), rombel = [];
    for (var b = 1; b < rb.v.length; b++) {
      var idR = sTeks_(absNilai_(rb, rb.v[b], 'ID ROMBEL')).trim();
      if (idR && String(absNilai_(rb, rb.v[b], 'AKTIF')).toUpperCase() !== 'FALSE') rombel.push({ id: idR, nama: sTeks_(absNilai_(rb, rb.v[b], 'NAMA ROMBEL')).trim() });
    }
    out.rombel = rombel.sort(function(x, y) { return x.nama.localeCompare(y.nama, 'id', { numeric: true }); });
    var t = absBaca_(ARS.TAB_KODE, ARS.HDR_KODE), now = new Date().getTime(), kode = [];
    for (var j = t.v.length - 1; j >= 1 && kode.length < 30; j--) {
      var r = t.v[j], ms = Number(absNilai_(t, r, 'BERLAKU MS')) || 0, st = sTeks_(absNilai_(t, r, 'STATUS'));
      kode.push({ id: sTeks_(absNilai_(t, r, 'ID')), arsip: sTeks_(absNilai_(t, r, 'ARSIP')), berlaku: sTeks_(absNilai_(t, r, 'BERLAKU SAMPAI')),
        untuk: sTeks_(absNilai_(t, r, 'NAMA UNTUK')) || 'Semua (Admin & Kepala Sekolah)', oleh: sTeks_(absNilai_(t, r, 'DIBUAT OLEH')),
        status: st === 'Aktif' && ms < now ? 'Kedaluwarsa' : st });
    }
    out.kode = kode;
    out.pengguna = bacaPengguna_().filter(function(x) { return x.status === 'Aktif' && (x.peran === 'Admin' || x.peran === 'Kepala Sekolah'); }).map(function(x) { return { id: x.id, nama: x.nama, peran: x.peran }; });
  }
  return out;
}

// d: {tahun, semester}
function waAdminArsipMulai(token, d) {
  var p = wajibAdmin_(token), per = nilPeriode_(d || {});
  if (nilUrutPer_(per) > nilUrutPer_(nilPeriode_())) throw new Error('Semester itu belum berjalan.');
  var h = arsMulai_(per, 'Reguler', p.nama);
  arsLog_(p, 'Arsipkan semester (manual)', arsNamaPer_(per), h.sudahBerjalan ? 'sudah berjalan' : 'dimulai', '', '');
  return h;
}
function waAdminArsipLanjut(token) {
  var p = wajibAdmin_(token);
  var a = arsCari_(function(x) { return x.status === 'Gagal' || x.status === 'Proses'; });
  if (!a) return { sukses: false, pesan: 'Tidak ada arsip yang perlu dilanjutkan.' };
  if (a.status === 'Gagal') arsSimpan_(a, { status: 'Proses', catatan: '' });
  arsLog_(p, 'Lanjutkan arsip', arsNamaPer_(a), '', '', '');
  arsJadwalLanjut_();
  return { sukses: true };
}

function arsAmbil_(id) {
  var a = arsCari_(function(x) { return x.id === String(id || ''); });
  if (!a) throw new Error('Arsip tidak ditemukan.');
  if (!a.data) throw new Error('Arsip ini belum selesai disiapkan.');
  return a;
}
function arsTercatatBuka_(p, a) {
  var c = CacheService.getScriptCache(), k = 'arsbuka_' + p.id + '_' + a.id;
  if (c.get(k)) return;
  c.put(k, '1', 1800);
  arsLog_(p, 'Buka arsip (hanya baca)', arsNamaPer_(a), '', '', '');
}
function arsBolehUbah_(token, a) { return !!CacheService.getScriptCache().get('arsubah_' + token + '|' + a.id); }

// Ringkasan isi arsip: tab data + rombel (rapor PDF).
function waStafArsipIsi(token, id) {
  var p = arsWajib_(token), a = arsAmbil_(id);
  arsTercatatBuka_(p, a);
  var ss = SpreadsheetApp.openById(a.data), tab = ss.getSheets().map(function(sh) { return { nama: sh.getName(), baris: Math.max(0, sh.getLastRow() - 1) }; });
  var rombel = [];
  try {
    var fSmt = DriveApp.getFolderById(a.folder), it = fSmt.getFolders();
    while (it.hasNext()) {
      var f = it.next(), berkas = [];
      ['Rapor', 'Lainnya', 'Foto'].forEach(function(s) {
        var sub = f.getFoldersByName(s);
        if (!sub.hasNext()) return;
        var fi = sub.next().getFiles();
        while (fi.hasNext()) { var x = fi.next(); if (!x.isTrashed()) berkas.push({ id: x.getId(), nama: x.getName(), jenis: s, mime: x.getMimeType() }); }
      });
      berkas.sort(function(x, y) { return x.jenis.localeCompare(y.jenis) || x.nama.localeCompare(y.nama); });
      rombel.push({ nama: f.getName(), berkas: berkas });
    }
  } catch (e) {}
  rombel.sort(function(x, y) { return x.nama.localeCompare(y.nama, 'id', { numeric: true }); });
  return { arsip: arsRingkas_(a), tab: tab, rombel: rombel, bolehUbah: arsBolehUbah_(token, a), catatanOffline: a.jenis === 'Offline' ? OFL.CATATAN : '' };
}

// Baca satu tab arsip (berhalaman). q: {tab, mulai, jumlah, cari}
function waStafArsipTab(token, id, q) {
  var p = arsWajib_(token), a = arsAmbil_(id);
  q = q || {};
  arsTercatatBuka_(p, a);
  var sh = SpreadsheetApp.openById(a.data).getSheetByName(String(q.tab || ''));
  if (!sh) throw new Error('Tab tidak ditemukan di arsip.');
  var v = sh.getDataRange().getDisplayValues(), hd = v[0] || [], cari = String(q.cari || '').trim().toLowerCase(), baris = [];
  for (var i = 1; i < v.length; i++) {
    if (cari && v[i].join(' ').toLowerCase().indexOf(cari) < 0) continue;
    baris.push({ no: i + 1, isi: v[i].map(function(x) { return x.length > 300 ? x.slice(0, 300) + '…' : x; }) });
  }
  var mulai = Math.max(0, Number(q.mulai) || 0), jml = Math.min(200, Math.max(1, Number(q.jumlah) || 100));
  return { kepala: hd, total: baris.length, mulai: mulai, baris: baris.slice(mulai, mulai + jml), bolehUbah: arsBolehUbah_(token, a) };
}

// Berkas (PDF/foto) dari folder arsip -> base64 (hanya berkas di dalam folder arsip itu).
function waStafArsipBerkas(token, id, idBerkas) {
  var p = arsWajib_(token), a = arsAmbil_(id), f = DriveApp.getFileById(String(idBerkas || '')), dalam = false;
  var ortu = f.getParents();
  while (ortu.hasNext() && !dalam) {
    var x = ortu.next();
    for (var n = 0; n < 4 && x && !dalam; n++) {
      if (x.getId() === a.folder) dalam = true;
      var atas = x.getParents();
      x = atas.hasNext() ? atas.next() : null;
    }
  }
  if (!dalam) throw new Error('Berkas bukan bagian dari arsip ini.');
  arsLog_(p, 'Lihat berkas arsip', arsNamaPer_(a), f.getName(), '', '');
  return { nama: f.getName(), mime: f.getMimeType(), b64: Utilities.base64Encode(f.getBlob().getBytes()) };
}

// ---------- kode akses ubah ----------
function arsHashKode_(kode, garam) { return sha256_(pepper_() + ':arsip:' + garam + ':' + String(kode).trim().toUpperCase()); }
// d: {jam (1-168), untuk (id pengguna, opsional)}
function waAdminArsipKodeBuat(token, id, d) {
  var p = wajibAdmin_(token), a = arsAmbil_(id);
  d = d || {};
  var jam = Math.min(168, Math.max(1, Number(d.jam) || 24)), untuk = String(d.untuk || ''), namaUntuk = '';
  if (untuk) {
    var u = bacaPengguna_().filter(function(x) { return x.id === untuk; })[0];
    if (!u || (u.peran !== 'Admin' && u.peran !== 'Kepala Sekolah')) throw new Error('Kode hanya dapat diberikan untuk Admin atau Kepala Sekolah.');
    namaUntuk = u.nama + ' (' + u.peran + ')';
  }
  var huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', kode = '';
  var acak = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  for (var i = 0; i < 8; i++) kode += huruf[parseInt(acak.substr(i * 2, 2), 16) % huruf.length];
  var garam = Utilities.getUuid(), ms = new Date().getTime() + jam * 3600000;
  var t = absBaca_(ARS.TAB_KODE, ARS.HDR_KODE), idK = 'KA-' + absId_();
  t.sh.appendRow(absBaris_(t, { 'ID': idK, 'ARSIP': a.id, 'HASH': arsHashKode_(kode, garam), 'GARAM': garam,
    'BERLAKU SAMPAI': Utilities.formatDate(new Date(ms), absTz_(), 'yyyy-MM-dd HH:mm'), 'BERLAKU MS': ms, 'UNTUK': untuk, 'NAMA UNTUK': namaUntuk,
    'DIBUAT OLEH': p.nama, 'DIBUAT PADA': absWaktu_(), 'STATUS': 'Aktif' }));
  arsLog_(p, 'Buat kode akses arsip', arsNamaPer_(a), idK + ' · berlaku ' + jam + ' jam' + (namaUntuk ? ' · untuk ' + namaUntuk : ' · semua Admin/KS'), '', '');
  return { kode: kode, id: idK, berlaku: Utilities.formatDate(new Date(ms), absTz_(), 'yyyy-MM-dd HH:mm'), untuk: namaUntuk || 'Semua Admin & Kepala Sekolah' };
}
function waAdminArsipKodeCabut(token, idKode) {
  var p = wajibAdmin_(token), t = absBaca_(ARS.TAB_KODE, ARS.HDR_KODE);
  for (var i = 1; i < t.v.length; i++) {
    if (sTeks_(absNilai_(t, t.v[i], 'ID')) !== String(idKode)) continue;
    t.sh.getRange(i + 1, absCol_(t, 'STATUS') + 1).setValue('Dicabut');
    arsLog_(p, 'Cabut kode akses arsip', sTeks_(absNilai_(t, t.v[i], 'ARSIP')), String(idKode), 'Aktif', 'Dicabut');
    return { sukses: true };
  }
  throw new Error('Kode tidak ditemukan.');
}
function waStafArsipBukaUbah(token, id, kode) {
  var p = arsWajib_(token), a = arsAmbil_(id), kg = 'arsgagal_' + p.id;
  if (bacaHitung_(kg) >= ARS.MAKS_SALAH) {
    arsLog_(p, 'Kode akses ditolak (terkunci)', arsNamaPer_(a), '', '', '');
    throw new Error('Terlalu banyak kode salah. Tunggu 30 menit.');
  }
  var t = absBaca_(ARS.TAB_KODE, ARS.HDR_KODE), now = new Date().getTime(), cocok = null;
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (sTeks_(absNilai_(t, r, 'ARSIP')) !== a.id || sTeks_(absNilai_(t, r, 'STATUS')) !== 'Aktif') continue;
    var ms = Number(absNilai_(t, r, 'BERLAKU MS')) || 0, untuk = sTeks_(absNilai_(t, r, 'UNTUK'));
    if (ms < now || (untuk && untuk !== p.id)) continue;
    if (arsHashKode_(kode, sTeks_(absNilai_(t, r, 'GARAM'))) === sTeks_(absNilai_(t, r, 'HASH'))) { cocok = { id: sTeks_(absNilai_(t, r, 'ID')), ms: ms }; break; }
  }
  if (!cocok) {
    var n = hitung_(kg, 1800);
    arsLog_(p, 'Kode akses salah', arsNamaPer_(a), 'percobaan ke-' + n, '', '');
    throw new Error('Kode akses salah, kedaluwarsa, atau bukan untuk Anda.' + (n < ARS.MAKS_SALAH ? ' Sisa ' + (ARS.MAKS_SALAH - n) + ' kali.' : ' Dikunci 30 menit.'));
  }
  var detik = Math.max(60, Math.min(ARS.UBAH_DETIK, Math.floor((cocok.ms - now) / 1000)));
  CacheService.getScriptCache().put('arsubah_' + token + '|' + a.id, cocok.id, detik);
  CacheService.getScriptCache().remove(kg);
  arsLog_(p, 'Mode ubah arsip dibuka', arsNamaPer_(a), 'kode ' + cocok.id + ' · ' + Math.round(detik / 60) + ' menit', '', '');
  return { sukses: true, menit: Math.round(detik / 60) };
}
function waStafArsipTutupUbah(token, id) {
  var p = arsWajib_(token), a = arsAmbil_(id);
  CacheService.getScriptCache().remove('arsubah_' + token + '|' + a.id);
  arsLog_(p, 'Mode ubah arsip ditutup', arsNamaPer_(a), '', '', '');
  return { sukses: true };
}
// Ubah satu sel arsip. baris = nomor baris di tab arsip (2..), kolom = indeks kolom (0..).
function waStafArsipUbah(token, id, tab, baris, kolom, nilai) {
  var p = arsWajib_(token), a = arsAmbil_(id), idKode = CacheService.getScriptCache().get('arsubah_' + token + '|' + a.id);
  if (!idKode) throw new Error('Arsip hanya baca. Masukkan kode akses dari admin untuk mengubah.');
  if (tab === 'CATATAN') throw new Error('Tab CATATAN tidak dapat diubah.');
  var ss = SpreadsheetApp.openById(a.data), sh = ss.getSheetByName(String(tab || ''));
  if (!sh) throw new Error('Tab tidak ditemukan.');
  baris = Number(baris); kolom = Number(kolom);
  if (!(baris >= 2 && baris <= sh.getLastRow() && kolom >= 0 && kolom < sh.getLastColumn())) throw new Error('Sel di luar tabel.');
  var hd = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0], sel = sh.getRange(baris, kolom + 1), lama = sel.getDisplayValue();
  nilai = String(nilai === null || nilai === undefined ? '' : nilai).slice(0, 5000);
  sel.setValue(nilai);
  var cerminan = '';
  // tab NILAI: ikut perbarui database utama (sumber rapor) lewat ID NILAI
  if (tab === NIL.TAB_NILAI) {
    var kId = hd.indexOf('ID NILAI'), idN = kId >= 0 ? sh.getRange(baris, kId + 1).getDisplayValue() : '';
    if (idN) {
      var t = absBaca_(NIL.TAB_NILAI, NIL.HDR_NILAI), col = absCol_(t, String(hd[kolom]).trim().toUpperCase());
      for (var i = 1; i < t.v.length && col >= 0; i++) {
        if (sTeks_(absNilai_(t, t.v[i], 'ID NILAI')) === idN) { t.sh.getRange(i + 1, col + 1).setValue(nilai); cerminan = ' · database utama ikut diperbarui'; break; }
      }
    }
  }
  arsLog_(p, 'Ubah data arsip', arsNamaPer_(a), tab + ' baris ' + baris + ' kolom ' + hd[kolom] + ' · kode ' + idKode + cerminan, lama, nilai);
  return { sukses: true, lama: lama, baru: nilai };
}
function waStafArsipLog(token, id) {
  var p = arsWajib_(token), a = arsAmbil_(id), t = absBaca_(ARS.TAB_LOG, ARS.HDR_LOG), nama = arsNamaPer_(a), out = [];
  for (var i = t.v.length - 1; i >= 1 && out.length < 300; i--) {
    var r = t.v[i];
    if (sTeks_(absNilai_(t, r, 'ARSIP')) !== nama && sTeks_(absNilai_(t, r, 'ARSIP')) !== a.id) continue;
    out.push({ waktu: sTeks_(absNilai_(t, r, 'WAKTU')), pengguna: sTeks_(absNilai_(t, r, 'PENGGUNA')), aksi: sTeks_(absNilai_(t, r, 'AKSI')),
      detail: sTeks_(absNilai_(t, r, 'DETAIL')), sebelum: sTeks_(absNilai_(t, r, 'SEBELUM')), sesudah: sTeks_(absNilai_(t, r, 'SESUDAH')) });
  }
  return { log: out };
}
