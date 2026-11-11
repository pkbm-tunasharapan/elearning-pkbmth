// ============================================================================
// RILIS APK OTOMATIS dengan jalur UJI -> RESMI (v1.38.5)
// ----------------------------------------------------------------------------
// - Pemicu tiap jam (selalu aktif bila token GitHub ada) memeriksa GitHub Releases. APK baru diunduh ke
//   folder Drive sekolah dan menjadi RILIS UJI: hanya ditawarkan (tidak wajib) ke akun PENGUJI
//   (semua Admin + akun yang ditandai). Versi resmi untuk pengguna lain TIDAK berubah.
// - Rilis uji naik menjadi RESMI (wajib untuk semua) bila:
//     a) admin menekan "Resmikan", atau
//     b) otomatis: minimal RLS.MIN_PENGUJI akun penguji berhasil memakai versi itu, sudah lewat
//        RLS.JAM_UJI jam sejak rilis uji, dan tidak ada galat aplikasi baru dari versi itu.
// - "Tarik": rilis uji/resmi berhenti ditawarkan. Catatan: Android tidak bisa memasang versi yang lebih
//   rendah di atas versi lebih tinggi, jadi HP yang sudah memasang versi bermasalah butuh rilis perbaikan.
// - Token GitHub (fine-grained, Contents: Read-only) di Script Properties; tidak pernah dikirim ke aplikasi.
// - Batas UrlFetchApp 50 MB: workflow membuat APK per arsitektur (arm64).
// ============================================================================
var RLS = {
  REPO: 'pkbm-tunasharapan/elearning-pkbmth',
  FOLDER_BAWAAN: '1F03EUa-ZROII7Sv4YVE_uveAWOZGV7h_',
  POLA_ASET: [/arm64-v8a.*\.apk$/i, /\.apk$/i],
  PEMICU: 'pemicuRilisApk',
  MAKS_BYTE: 49 * 1048576,
  MIN_PENGUJI: 2,
  JAM_UJI: 12,
  // galat yang bukan kesalahan aplikasi (jaringan/kuota) tidak menghalangi kenaikan rilis
  GALAT_ABAI: /\[(E10[1-5]|E20[1-3]|E23[0-2])-/,
  // Versi pertama yang punya tombol Resmikan & mengirim token saat cek versi. Bila rilis resmi masih di bawah ini,
  // tidak ada HP yang bisa menguji/meresmikan rilis uji -> rilis uji langsung diresmikan (v1.38.9).
  VERSI_UJI_MIN: '1.38.5'
};

function rlsProp_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function rlsSetel_(o) { PropertiesService.getScriptProperties().setProperties(o); }
function rlsJson_(k, bawaan) { try { return JSON.parse(rlsProp_(k) || 'null') || bawaan; } catch (e) { return bawaan; } }

// Bandingkan versi "1.38.0" vs "1.37.0": >0 bila a lebih baru, 0 sama, <0 lebih lama (kosong = 0.0.0).
function rlsBanding_(a, b) {
  var x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
  for (var i = 0; i < 3; i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}

function rlsGithub_(url, token, octet) {
  var res = UrlFetchApp.fetch(url, {
    method: 'get', muteHttpExceptions: true, followRedirects: !octet,
    headers: { Authorization: 'Bearer ' + token, Accept: octet ? 'application/octet-stream' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  });
  var kode = res.getResponseCode();
  if (octet && (kode === 301 || kode === 302 || kode === 307)) {
    var h = res.getAllHeaders(), lokasi = h.Location || h.location;
    if (!lokasi) throw new Error('GitHub tidak memberi alamat unduh APK.');
    var aset = UrlFetchApp.fetch(lokasi, { method: 'get', muteHttpExceptions: true }); // tanpa token: alamat sudah bertanda tangan
    if (aset.getResponseCode() !== 200) throw new Error('Gagal mengunduh APK (kode ' + aset.getResponseCode() + ').');
    return aset;
  }
  if (kode === 401 || kode === 403) throw new Error('Token GitHub ditolak (kode ' + kode + '). Periksa masa berlaku dan izin Contents: Read-only untuk repo ' + RLS.REPO + '.');
  if (kode === 404) throw new Error('Rilis tidak ditemukan. Pastikan token punya akses ke repo ' + RLS.REPO + '.');
  if (kode !== 200) throw new Error('GitHub mengembalikan kode ' + kode + '.');
  return res;
}

// ---------- status rilis ----------
function rlsUji_() {
  var v = rlsProp_('RILIS_UJI_VERSI');
  if (!v) return null;
  var pakai = rlsJson_('RILIS_UJI_PAKAI', []);
  return {
    versi: v, url: rlsProp_('RILIS_UJI_URL'), tag: rlsProp_('RILIS_UJI_TAG'), catatan: rlsProp_('RILIS_UJI_CATATAN'),
    waktu: rlsProp_('RILIS_UJI_WAKTU'), waktuMs: Number(rlsProp_('RILIS_UJI_MS')) || 0, berkas: rlsProp_('RILIS_UJI_BERKAS'),
    pakai: pakai, galat: Number(rlsProp_('RILIS_UJI_GALAT')) || 0
  };
}
function rlsResmi_() {
  return { versi: rlsProp_('APP_VERSI_TERBARU'), url: rlsProp_('APP_URL_UNDUH'), catatan: rlsProp_('APP_CATATAN'), tag: rlsProp_('RILIS_RESMI_TAG') || rlsProp_('RILIS_TAG'), waktu: rlsProp_('RILIS_RESMI_WAKTU') || rlsProp_('RILIS_WAKTU') };
}
// Akun penguji: semua Admin + id pengguna di RILIS_PENGUJI.
function rlsPenguji_(p) {
  if (!p) return false;
  if (p.peran === 'Admin' || p.peran === 'Superadmin') return true;
  return rlsJson_('RILIS_PENGUJI', []).indexOf(String(p.id)) >= 0;
}
function rlsHapusUji_() {
  ['RILIS_UJI_VERSI', 'RILIS_UJI_URL', 'RILIS_UJI_TAG', 'RILIS_UJI_CATATAN', 'RILIS_UJI_WAKTU', 'RILIS_UJI_MS', 'RILIS_UJI_BERKAS', 'RILIS_UJI_PAKAI', 'RILIS_UJI_GALAT']
    .forEach(function(k) { PropertiesService.getScriptProperties().deleteProperty(k); });
  try { CacheService.getScriptCache().remove('rls_uji_v'); } catch (e) {}
}

// Jadikan rilis uji sebagai rilis resmi (wajib untuk semua).
function rlsResmikan_(oleh, alasan) {
  var u = rlsUji_();
  if (!u) throw new Error('Tidak ada rilis uji.');
  var r = rlsResmi_();
  rlsSetel_({
    RILIS_SEBELUM_VERSI: r.versi || '', RILIS_SEBELUM_URL: r.url || '', RILIS_SEBELUM_CATATAN: r.catatan || '', RILIS_SEBELUM_TAG: r.tag || '',
    APP_VERSI_TERBARU: u.versi, APP_URL_UNDUH: u.url, APP_CATATAN: u.catatan, APP_WAJIB: '1',
    RILIS_RESMI_TAG: u.tag, RILIS_RESMI_WAKTU: absWaktu_(), RILIS_VERSI: u.versi, RILIS_BERKAS: u.berkas
  });
  rlsHapusUji_();
  try { CacheService.getScriptCache().remove('upd_terbaru'); } catch (e) {}
  try { catat_('Sistem', '', oleh || 'Rilis otomatis', 'Resmikan rilis APK', u.versi + ' (' + u.tag + ') · ' + (alasan || ''), 'OK'); } catch (e2) {}
  return u.versi;
}

// Naik otomatis bila syarat terpenuhi. Mengembalikan versi yang diresmikan atau ''.
function rlsCekNaik_() {
  var u = rlsUji_();
  if (!u) return '';
  if (rlsBanding_(rlsProp_('APP_VERSI_TERBARU'), RLS.VERSI_UJI_MIN) < 0) {
    return rlsResmikan_('Rilis otomatis', 'versi resmi ' + (rlsProp_('APP_VERSI_TERBARU') || '-') + ' belum mendukung rilis uji');
  }
  var jam = (new Date().getTime() - u.waktuMs) / 3600000;
  if (u.pakai.length >= RLS.MIN_PENGUJI && jam >= RLS.JAM_UJI && u.galat === 0) {
    return rlsResmikan_('Rilis otomatis', u.pakai.length + ' penguji, ' + Math.floor(jam) + ' jam tanpa galat');
  }
  return '';
}

// Dipanggil doPost setiap panggilan berhasil: catat akun penguji yang memakai versi uji.
function rlsCatatPakai_(fn, args, body) {
  try {
    if (!body || !body.v) return;
    var c = CacheService.getScriptCache(), uv = c.get('rls_uji_v');
    if (uv === null) { uv = rlsProp_('RILIS_UJI_VERSI'); c.put('rls_uji_v', uv, 300); }
    if (!uv || String(body.v) !== uv) return;
    var token = Array.isArray(args) && typeof args[0] === 'string' ? args[0] : '';
    var id = token ? CacheService.getScriptCache().get('staf_' + token) : null;
    if (!id) return;
    var pakai = rlsJson_('RILIS_UJI_PAKAI', []);
    if (pakai.indexOf(String(id)) >= 0) return;
    pakai.push(String(id));
    rlsSetel_({ RILIS_UJI_PAKAI: JSON.stringify(pakai.slice(0, 50)) });
  } catch (e) {}
}

// Dipanggil pmlCatatGalat_: hitung galat aplikasi dari versi uji (kecuali galat jaringan/kuota).
function rlsCatatGalat_(sumber, pesan, versi) {
  try {
    var uv = rlsProp_('RILIS_UJI_VERSI');
    if (!uv || sumber !== 'aplikasi' || String(versi || '').split(' ')[0] !== uv) return;
    if (RLS.GALAT_ABAI.test(String(pesan || ''))) return;
    rlsSetel_({ RILIS_UJI_GALAT: String((Number(rlsProp_('RILIS_UJI_GALAT')) || 0) + 1) });
  } catch (e) {}
}

// ---------- ambil rilis dari GitHub ----------
// paksa = true: unduh ulang walau tag sama.
function rlsTarik_(paksa) {
  var token = rlsProp_('GITHUB_TOKEN');
  if (!token) throw new Error('Token GitHub belum diisi.');
  var rilis = JSON.parse(rlsGithub_('https://api.github.com/repos/' + RLS.REPO + '/releases/latest', token, false).getContentText());
  var tag = String(rilis.tag_name || '');
  if (!paksa && tag && tag === rlsProp_('RILIS_TAG')) {
    var naik = rlsCekNaik_();
    var tertunda = naik ? '' : rlsProp_('RILIS_UJI_VERSI');
    return { baru: false, tag: tag, versi: naik || tertunda || rlsProp_('APP_VERSI_TERBARU'), naik: naik, ujiTertunda: tertunda, resmi: rlsProp_('APP_VERSI_TERBARU') };
  }
  var versi = ((/v?(\d+\.\d+\.\d+)/.exec(String(rilis.name || '')) || [])[1]) || '';
  if (!versi) throw new Error('Nama rilis "' + rilis.name + '" tidak memuat nomor versi (mis. v1.19.0).');
  if (rlsBanding_(versi, rlsProp_('APP_VERSI_TERBARU')) < 0) {
    rlsSetel_({ RILIS_TAG: tag });
    return { baru: false, tag: tag, versi: versi, lewat: 'Versi ' + versi + ' lebih rendah dari rilis resmi; dilewati.' };
  }
  var aset = null;
  RLS.POLA_ASET.some(function(pola) { aset = (rilis.assets || []).filter(function(a) { return pola.test(a.name); })[0] || null; return !!aset; });
  if (!aset) throw new Error('Rilis ' + tag + ' tidak berisi berkas APK.');
  if (aset.size > RLS.MAKS_BYTE) throw new Error('APK ' + aset.name + ' berukuran ' + Math.round(aset.size / 1048576) + ' MB, melebihi batas 49 MB. Gunakan build per arsitektur (split-per-abi).');
  var blob = rlsGithub_(aset.url, token, true).getBlob().setName('TH-ECourse-' + versi + '-' + tag + '.apk').setContentType('application/vnd.android.package-archive');
  var folder = DriveApp.getFolderById(rlsProp_('RILIS_FOLDER') || RLS.FOLDER_BAWAAN);
  var berkas = folder.createFile(blob);
  try { berkas.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {
    throw new Error('APK tersimpan di Drive, tetapi gagal dibuka untuk "siapa saja yang memiliki link": ' + (e && e.message || e));
  }
  var catatan = String(rilis.body || '').replace(/\r/g, '').trim().slice(0, 500);
  rlsHapusUji_();
  rlsSetel_({
    RILIS_UJI_VERSI: versi, RILIS_UJI_URL: berkas.getUrl(), RILIS_UJI_TAG: tag, RILIS_UJI_CATATAN: catatan,
    RILIS_UJI_WAKTU: absWaktu_(), RILIS_UJI_MS: String(new Date().getTime()), RILIS_UJI_BERKAS: berkas.getId(),
    RILIS_UJI_PAKAI: '[]', RILIS_UJI_GALAT: '0', RILIS_TAG: tag, RILIS_WAKTU: absWaktu_()
  });
  try { CacheService.getScriptCache().put('rls_uji_v', versi, 300); } catch (e3) {}
  try { catat_('Sistem', '', 'Rilis otomatis', 'Rilis APK (uji)', versi + ' (' + tag + ') -> Drive, menunggu uji', 'OK'); } catch (e2) {}
  return { baru: true, uji: true, tag: tag, versi: versi, url: berkas.getUrl(), nama: berkas.getName(), ukuranMb: Math.round(aset.size / 104857.6) / 10 };
}

function rlsJadwalAktif_() {
  return ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === RLS.PEMICU; });
}

// Pemeriksaan tiap jam SELALU aktif (tanpa sakelar). Dipanggil dari endpoint rilis dan waStafVersiApp;
// pemeriksaan pemicu di-cache 6 jam agar ringan. Sekaligus memastikan pemicu cadangan mingguan.
function rlsPastikanPemicu_(paksaCek) {
  var c = CacheService.getScriptCache();
  if (!paksaCek && c.get('rls_pemicu_ok')) return true;
  var ada = {};
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var h = t.getHandlerFunction();
    if (h !== RLS.PEMICU && h !== CDG.PEMICU && h !== ARS.PEMICU_HARIAN) return;
    if (ada[h]) ScriptApp.deleteTrigger(t); else ada[h] = true;   // buang pemicu ganda
  });
  if (!ada[RLS.PEMICU] && rlsProp_('GITHUB_TOKEN')) {
    ScriptApp.newTrigger(RLS.PEMICU).timeBased().everyHours(1).create();
    try { catat_('Sistem', '', 'Rilis otomatis', 'Pasang pemicu rilis', 'tiap jam', 'OK'); } catch (e) {}
  }
  if (!ada[CDG.PEMICU]) {
    ScriptApp.newTrigger(CDG.PEMICU).timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();
    try { catat_('Sistem', '', 'Cadangan', 'Pasang pemicu cadangan', 'tiap Minggu pukul 02.00', 'OK'); } catch (e1) {}
  }
  if (!ada[ARS.PEMICU_HARIAN]) {
    ScriptApp.newTrigger(ARS.PEMICU_HARIAN).timeBased().everyDays(1).atHour(1).create();
    try { catat_('Sistem', '', 'Arsip', 'Pasang pemicu arsip', 'tiap hari pukul 01.00', 'OK'); } catch (e3) {}
  }
  try { c.put('rls_pemicu_ok', '1', 21600); } catch (e2) {}
  return true;
}

// Pemicu tiap jam. Galat dicatat ke Log Galat, tidak menghentikan pemicu.
function pemicuRilisApk() {
  try { rlsTarik_(false); } catch (e) { pmlCatatGalat_('pemicu', RLS.PEMICU, String(e && e.message || e), e && e.stack, '', ''); }
}

// Versi yang ditawarkan ke aplikasi: penguji -> rilis uji (tidak wajib); lainnya -> rilis resmi (wajib).
function rlsUntuk_(token) {
  try { rlsCekNaik_(); } catch (e0) {}
  var r = rlsResmi_(), u = rlsUji_(), p = null;
  if (u && token) { try { p = stafDariToken_(token); } catch (e) { p = null; } }
  if (u && rlsPenguji_(p) && rlsBanding_(u.versi, r.versi) > 0) {
    return { versi: u.versi, url: u.url, catatan: '[RILIS UJI] Anda terdaftar sebagai penguji. ' + (u.catatan || ''), wajib: false, uji: true };
  }
  return { versi: r.versi, url: r.url, catatan: r.catatan, wajib: !!r.versi, uji: false };
}

// ---------- endpoint admin ----------
function waAdminRilisStatus(token) {
  wajibAdmin_(token);
  try { rlsPastikanPemicu_(true); } catch (e) {}
  var folder = rlsProp_('RILIS_FOLDER') || RLS.FOLDER_BAWAAN, u = rlsUji_(), nama = {};
  var penguji = rlsJson_('RILIS_PENGUJI', []), staf = [];
  try {
    bacaPengguna_().forEach(function(x) {
      nama[x.id] = x.nama;
      if (x.status === 'Aktif' && x.peran !== 'Admin' && x.peran !== 'Superadmin') staf.push({ id: x.id, nama: x.nama, peran: x.peran, penguji: penguji.indexOf(String(x.id)) >= 0 });
    });
  } catch (e2) {}
  staf.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  return {
    adaToken: !!rlsProp_('GITHUB_TOKEN'), otomatis: rlsJadwalAktif_(), repo: RLS.REPO, folderUrl: 'https://drive.google.com/drive/folders/' + folder,
    resmi: rlsResmi_(),
    uji: u ? { versi: u.versi, tag: u.tag, waktu: u.waktu, galat: u.galat, pakai: u.pakai.map(function(id) { return nama[id] || id; }),
      syarat: { penguji: RLS.MIN_PENGUJI, jam: RLS.JAM_UJI }, jam: Math.floor((new Date().getTime() - u.waktuMs) / 3600000) } : null,
    sebelum: rlsProp_('RILIS_SEBELUM_VERSI'), staf: staf,
    cadangan: { terakhir: rlsProp_('CADANGAN_TERAKHIR'), jumlah: CDG.SIMPAN }
  };
}

// d: {githubToken: string ('' = hapus)}
function waAdminRilisAtur(token, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  if (d.githubToken !== undefined && d.githubToken !== null) {
    var t = String(d.githubToken).trim();
    if (t && !/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) throw new Error('Format token GitHub tidak dikenali (diawali github_pat_ atau ghp_).');
    if (t) PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', t); else PropertiesService.getScriptProperties().deleteProperty('GITHUB_TOKEN');
    try { catat_(p.peran, '', p.nama, 'Atur rilis otomatis', 'token diperbarui', 'OK'); } catch (e) {}
  }
  return waAdminRilisStatus(token);
}

// ids: daftar id pengguna (selain Admin) yang menjadi penguji rilis.
function waAdminRilisPenguji(token, ids) {
  var p = wajibAdmin_(token);
  var bersih = (Array.isArray(ids) ? ids : []).map(String).filter(function(x) { return x; }).slice(0, 30);
  rlsSetel_({ RILIS_PENGUJI: JSON.stringify(bersih) });
  try { catat_(p.peran, '', p.nama, 'Atur penguji rilis', bersih.length + ' akun', 'OK'); } catch (e) {}
  return waAdminRilisStatus(token);
}

function waAdminRilisTarik(token, paksa) {
  var p = wajibAdmin_(token);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    var h = rlsTarik_(paksa === true);
    try { rlsPastikanPemicu_(true); } catch (e0) {}
    try { catat_(p.peran, '', p.nama, 'Ambil rilis APK', h.versi + ' (' + h.tag + ')' + (h.baru ? ' sebagai rilis uji' : ' sudah terbaru'), 'OK'); } catch (e) {}
    return h;
  } finally { kunci.releaseLock(); }
}

// Resmikan rilis uji sekarang (tanpa menunggu syarat otomatis).
function waAdminRilisResmikan(token) {
  var p = wajibAdmin_(token);
  var u = rlsUji_();
  if (!u) throw new Error('Tidak ada rilis uji untuk diresmikan.');
  rlsResmikan_(p.nama, 'diresmikan admin' + (u.galat ? ' (' + u.galat + ' galat tercatat)' : ''));
  return waAdminRilisStatus(token);
}

// Tarik rilis: 'uji' = hentikan rilis uji; 'resmi' = kembalikan versi resmi sebelumnya (berhenti menawarkan versi bermasalah).
function waAdminRilisBatal(token, jenis) {
  var p = wajibAdmin_(token);
  if (jenis === 'uji') {
    var u = rlsUji_();
    if (!u) throw new Error('Tidak ada rilis uji.');
    rlsHapusUji_();
    try { catat_(p.peran, '', p.nama, 'Tarik rilis uji', u.versi + ' (' + u.tag + ')', 'OK'); } catch (e) {}
  } else if (jenis === 'resmi') {
    var v = rlsProp_('RILIS_SEBELUM_VERSI');
    if (!v) throw new Error('Tidak ada rilis resmi sebelumnya yang tersimpan.');
    var kini = rlsResmi_().versi;
    rlsSetel_({ APP_VERSI_TERBARU: v, APP_URL_UNDUH: rlsProp_('RILIS_SEBELUM_URL'), APP_CATATAN: rlsProp_('RILIS_SEBELUM_CATATAN'), RILIS_RESMI_TAG: rlsProp_('RILIS_SEBELUM_TAG'),
      RILIS_RESMI_WAKTU: absWaktu_(), RILIS_VERSI: v, RILIS_SEBELUM_VERSI: '' });
    try { CacheService.getScriptCache().remove('upd_terbaru'); } catch (e1) {}
    try { catat_(p.peran, '', p.nama, 'Tarik rilis resmi', kini + ' -> kembali ke ' + v, 'OK'); } catch (e2) {}
  } else {
    throw new Error('Jenis tidak dikenal.');
  }
  return waAdminRilisStatus(token);
}
