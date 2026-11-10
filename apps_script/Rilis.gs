// ============================================================================
// RILIS APK OTOMATIS (aplikasi 1.19): APK terbaru dari GitHub Releases disalin ke folder Google Drive,
// dibuka untuk "siapa saja yang memiliki link", lalu Versi Aplikasi diisi otomatis sehingga semua
// pengguna ditawari pembaruan.
// - Token GitHub (fine-grained, izin Contents: Read-only untuk repo ini) disimpan di Script Properties
//   lewat menu Pemeliharaan Sistem; token tidak pernah dikirim balik ke aplikasi.
// - Pemicu tiap jam (opsional) memeriksa rilis terbaru; APK hanya diunduh bila tag rilis berubah.
// - Batas UrlFetchApp 50 MB: workflow membuat APK per arsitektur (arm64 ~ sepertiga APK universal).
// ============================================================================
var RLS = {
  REPO: 'pkbm-tunasharapan/elearning-pkbmth',
  FOLDER_BAWAAN: '1F03EUa-ZROII7Sv4YVE_uveAWOZGV7h_',
  POLA_ASET: [/arm64-v8a.*\.apk$/i, /\.apk$/i],
  PEMICU: 'pemicuRilisApk',
  MAKS_BYTE: 49 * 1048576
};

function rlsProp_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

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

// paksa = true: unduh ulang walau tag sama. Mengembalikan ringkasan.
function rlsTarik_(paksa) {
  var token = rlsProp_('GITHUB_TOKEN');
  if (!token) throw new Error('Token GitHub belum diisi.');
  var rilis = JSON.parse(rlsGithub_('https://api.github.com/repos/' + RLS.REPO + '/releases/latest', token, false).getContentText());
  var tag = String(rilis.tag_name || '');
  if (!paksa && tag && tag === rlsProp_('RILIS_TAG')) {
    // v1.38: bila Versi Aplikasi sempat diturunkan manual, pulihkan versi & tautan rilis terbaru (tanpa unduh ulang).
    var vRilis = ((/v?(\d+\.\d+\.\d+)/.exec(String(rilis.name || '')) || [])[1]) || '', idBerkas = rlsProp_('RILIS_BERKAS');
    if (vRilis && idBerkas && rlsBanding_(vRilis, rlsProp_('APP_VERSI_TERBARU')) > 0) {
      var urlPulih = DriveApp.getFileById(idBerkas).getUrl();
      PropertiesService.getScriptProperties().setProperties({ APP_VERSI_TERBARU: vRilis, APP_URL_UNDUH: urlPulih, RILIS_VERSI: vRilis, APP_WAJIB: '1' });
      try { catat_('Sistem', '', 'Rilis otomatis', 'Pulihkan versi aplikasi', vRilis + ' (' + tag + ')', 'OK'); } catch (e0) {}
      return { baru: false, dipulihkan: true, tag: tag, versi: vRilis, url: urlPulih };
    }
    return { baru: false, tag: tag, versi: rlsProp_('APP_VERSI_TERBARU'), url: rlsProp_('APP_URL_UNDUH') };
  }
  var aset = null;
  RLS.POLA_ASET.some(function(pola) { aset = (rilis.assets || []).filter(function(a) { return pola.test(a.name); })[0] || null; return !!aset; });
  if (!aset) throw new Error('Rilis ' + tag + ' tidak berisi berkas APK.');
  if (aset.size > RLS.MAKS_BYTE) throw new Error('APK ' + aset.name + ' berukuran ' + Math.round(aset.size / 1048576) + ' MB, melebihi batas 49 MB. Gunakan build per arsitektur (split-per-abi).');
  var versi = ((/v?(\d+\.\d+\.\d+)/.exec(String(rilis.name || '')) || [])[1]) || '';
  if (!versi) throw new Error('Nama rilis "' + rilis.name + '" tidak memuat nomor versi (mis. v1.19.0).');
  var blob = rlsGithub_(aset.url, token, true).getBlob().setName('TH-ECourse-' + versi + '-' + tag + '.apk').setContentType('application/vnd.android.package-archive');
  var folder = DriveApp.getFolderById(rlsProp_('RILIS_FOLDER') || RLS.FOLDER_BAWAAN);
  var berkas = folder.createFile(blob);
  try { berkas.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {
    throw new Error('APK tersimpan di Drive, tetapi gagal dibuka untuk "siapa saja yang memiliki link": ' + (e && e.message || e));
  }
  var catatan = String(rilis.body || '').replace(/\r/g, '').trim().slice(0, 500);
  PropertiesService.getScriptProperties().setProperties({
    APP_VERSI_TERBARU: versi, APP_URL_UNDUH: berkas.getUrl(), APP_CATATAN: catatan, APP_WAJIB: '1',
    RILIS_TAG: tag, RILIS_WAKTU: absWaktu_(), RILIS_BERKAS: berkas.getId(), RILIS_VERSI: versi
  });
  try { catat_('Sistem', '', 'Rilis otomatis', 'Rilis APK', versi + ' (' + tag + ') -> Drive', 'OK'); } catch (e2) {}
  return { baru: true, tag: tag, versi: versi, url: berkas.getUrl(), nama: berkas.getName(), ukuranMb: Math.round(aset.size / 104857.6) / 10 };
}

function rlsJadwalAktif_() {
  return ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === RLS.PEMICU; });
}

// v1.38.2: pemeriksaan tiap jam SELALU aktif (tidak ada sakelar). Dipanggil dari endpoint rilis dan dari
// waStafVersiApp (tiap aplikasi dibuka); pemeriksaan pemicu di-cache 6 jam agar ringan.
function rlsPastikanPemicu_(paksaCek) {
  if (!rlsProp_('GITHUB_TOKEN')) return false;
  var c = CacheService.getScriptCache();
  if (!paksaCek && c.get('rls_pemicu_ok')) return true;
  var ada = false;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() !== RLS.PEMICU) return;
    if (ada) ScriptApp.deleteTrigger(t); else ada = true;   // buang pemicu ganda
  });
  if (!ada) {
    ScriptApp.newTrigger(RLS.PEMICU).timeBased().everyHours(1).create();
    try { catat_('Sistem', '', 'Rilis otomatis', 'Pasang pemicu rilis', 'tiap jam', 'OK'); } catch (e) {}
  }
  try { c.put('rls_pemicu_ok', '1', 21600); } catch (e2) {}
  return true;
}

// Pemicu tiap jam. Galat dicatat ke Log Galat, tidak menghentikan pemicu.
function pemicuRilisApk() {
  try { rlsTarik_(false); } catch (e) { pmlCatatGalat_('pemicu', RLS.PEMICU, String(e && e.message || e), e && e.stack, '', ''); }
}

function waAdminRilisStatus(token) {
  wajibAdmin_(token);
  try { rlsPastikanPemicu_(true); } catch (e) {}
  var folder = rlsProp_('RILIS_FOLDER') || RLS.FOLDER_BAWAAN;
  return {
    adaToken: !!rlsProp_('GITHUB_TOKEN'), otomatis: rlsJadwalAktif_(), tag: rlsProp_('RILIS_TAG'), waktu: rlsProp_('RILIS_WAKTU'),
    versi: rlsProp_('APP_VERSI_TERBARU'), url: rlsProp_('APP_URL_UNDUH'),
    folderUrl: 'https://drive.google.com/drive/folders/' + folder, repo: RLS.REPO
  };
}

// d: {githubToken: string ( = hapus)}. Versi aplikasi tidak bisa diatur manual lagi; semuanya dari rilis GitHub.
function waAdminRilisAtur(token, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  var sp = PropertiesService.getScriptProperties();
  if (d.githubToken !== undefined && d.githubToken !== null) {
    var t = String(d.githubToken).trim();
    if (t && !/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) throw new Error('Format token GitHub tidak dikenali (diawali github_pat_ atau ghp_).');
    if (t) sp.setProperty('GITHUB_TOKEN', t); else sp.deleteProperty('GITHUB_TOKEN');
  }
  try { catat_(p.peran, '', p.nama, 'Atur rilis otomatis', 'token diperbarui', 'OK'); } catch (e) {}
  return waAdminRilisStatus(token);
}

function waAdminRilisTarik(token, paksa) {
  var p = wajibAdmin_(token);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    var h = rlsTarik_(paksa === true);
    try { rlsPastikanPemicu_(true); } catch (e0) {}
    try { catat_(p.peran, '', p.nama, 'Ambil rilis APK', h.versi + ' (' + h.tag + ')' + (h.baru ? '' : ' sudah terbaru'), 'OK'); } catch (e) {}
    return h;
  } finally { kunci.releaseLock(); }
}
