// ============================================================================
// BROADCAST / PEMBERITAHUAN (v1.37.0)
// ----------------------------------------------------------------------------
// Admin mengirim pemberitahuan ke siswa dan/atau staf (bisa disaring per rombel / peran).
// Berbeda dengan popup promosi (hanya saat aplikasi dibuka):
//  - Saat aplikasi terbuka, aplikasi memeriksa tiap ~30 detik -> dialog + notifikasi ponsel.
//  - Saat aplikasi tertutup, Android (WorkManager) memeriksa tiap ~15 menit -> notifikasi ponsel.
// Pemeriksaan latar belakang memakai KUNCI PERANGKAT jangka panjang (token sesi berumur pendek),
// dibuat saat login lewat waNotifDaftar dan disimpan di tab "Perangkat Notif".
// ============================================================================

var BC = {
  SH: 'Broadcast',
  H: ['ID', 'WAKTU', 'WAKTU MS', 'JUDUL', 'ISI', 'SASARAN', 'DIKIRIM OLEH', 'BERLAKU SAMPAI', 'BERLAKU MS', 'STATUS', 'DITARIK OLEH'],
  SH_PR: 'Perangkat Notif',
  H_PR: ['KUNCI', 'JENIS', 'ID', 'NAMA', 'ROMBEL', 'PERAN', 'PLATFORM', 'TERDAFTAR'],
  CACHE: 'bc_aktif_v1',
  HARI_TAMPIL: 7,          // broadcast lebih lama dari ini tidak dikirim ke perangkat lagi
  MAKS_HARI: 30,
  PERAN: ['Admin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Front Office', 'Bendahara', 'Superadmin', 'Koordinator Unit', 'Dinas Pendidikan']
};

function bcSheet_(nama, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nama);
  if (!sh) {
    sh = ss.insertSheet(nama);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function bcBacaSemua_() {
  var sh = bcSheet_(BC.SH, BC.H), v = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (!String(r[0]).trim()) continue;
    var sas = {};
    try { sas = JSON.parse(String(r[5] || '{}')); } catch (e) { sas = {}; }
    out.push({
      baris: i + 1, id: String(r[0]), waktu: sTeks_(r[1]), waktuMs: Number(r[2]) || 0, judul: sTeks_(r[3]), isi: sTeks_(r[4]),
      sasaran: sas, oleh: sTeks_(r[6]), berlaku: sTeks_(r[7]), berlakuMs: Number(r[8]) || 0, status: sTeks_(r[9]) || 'Aktif', ditarikOleh: sTeks_(r[10])
    });
  }
  return out;
}

// Broadcast aktif terbaru (di-cache 60 detik; dibaca semua perangkat).
function bcAktif_() {
  var c = CacheService.getScriptCache();
  try { var lama = c.get(BC.CACHE); if (lama) return JSON.parse(lama); } catch (e) {}
  var now = new Date().getTime(), batas = now - BC.HARI_TAMPIL * 86400000;
  var a = bcBacaSemua_().filter(function(b) { return b.status === 'Aktif' && b.berlakuMs > now && b.waktuMs >= batas; })
    .sort(function(x, y) { return y.waktuMs - x.waktuMs; }).slice(0, 30)
    .map(function(b) { return { id: b.id, waktu: b.waktu, waktuMs: b.waktuMs, judul: b.judul, isi: b.isi, sasaran: b.sasaran, berlakuMs: b.berlakuMs, oleh: b.oleh }; });
  try { c.put(BC.CACHE, JSON.stringify(a), 60); } catch (e2) {}
  return a;
}
function bcLupakan_() { try { CacheService.getScriptCache().remove(BC.CACHE); } catch (e) {} }

function bcCocok_(b, a) {
  var s = b.sasaran || {};
  if (a.jenis === 'siswa') return !!s.siswa && (!s.rombel || !s.rombel.length || s.rombel.indexOf(String(a.rombel)) >= 0);
  if (a.jenis === 'staf') return !!s.staf && (!s.peran || !s.peran.length || s.peran.indexOf(String(a.peran)) >= 0);
  return false;
}

// ---------- perangkat ----------
function bcAudiens_(kunci) {
  kunci = String(kunci || '');
  if (kunci.length < 40) return null;
  var c = CacheService.getScriptCache(), ck = 'pn_' + kunci.slice(0, 60);
  try { var lama = c.get(ck); if (lama) return lama === '-' ? null : JSON.parse(lama); } catch (e) {}
  var sh = bcSheet_(BC.SH_PR, BC.H_PR), a = null;
  var f = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 1).createTextFinder(kunci).matchEntireCell(true).findNext();
  if (f && f.getRow() > 1) {
    var r = sh.getRange(f.getRow(), 1, 1, BC.H_PR.length).getValues()[0];
    a = { jenis: sTeks_(r[1]), id: sTeks_(r[2]), nama: sTeks_(r[3]), rombel: sTeks_(r[4]), peran: sTeks_(r[5]) };
  }
  try { c.put(ck, a ? JSON.stringify(a) : '-', 21600); } catch (e2) {}
  return bcPeranKini_(a);
}
// v1.76.1: peran staf diambil dari akun SEKARANG (bukan peran saat perangkat didaftarkan), supaya pergantian peran
// (mis. Admin -> Bendahara) langsung berlaku untuk notifikasi tanpa harus keluar-masuk. Akun nonaktif: tanpa notifikasi.
function bcPeranKini_(a) {
  if (!a || a.jenis !== 'staf' || !a.id) return a;
  try {
    var daftar = typeof penggunaCache_ === 'function' ? penggunaCache_() : bacaPengguna_();
    for (var i = 0; i < daftar.length; i++) {
      var u = daftar[i];
      if (String(u.id) !== String(a.id)) continue;
      if (u.status !== 'Aktif' || !u.peran) return null;
      var b = {};
      Object.keys(a).forEach(function(k) { b[k] = a[k]; });
      b.peran = u.peran; b.peranKustom = u.peranKustom || '';
      return b;
    }
  } catch (e) {}
  return a;
}

// Dipanggil aplikasi setelah login. jenis: 'staf' (token staf) | 'siswa' (token sesi siswa).
function waNotifDaftar(jenis, token, platform) {
  var a;
  if (jenis === 'staf') {
    var p = stafDariToken_(token);
    a = { jenis: 'staf', id: String(p.id || ''), nama: String(p.nama || ''), rombel: '', peran: String(p.peran || '') };
  } else if (jenis === 'siswa') {
    var s = siswaDariSesi_(token);
    a = { jenis: 'siswa', id: '', nama: String(s.nama || ''), rombel: String(s.idRombel || ''), peran: '' };
  } else {
    throw new Error('Jenis akun tidak dikenal.');
  }
  var kunci = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var sh = bcSheet_(BC.SH_PR, BC.H_PR), r0 = sh.getLastRow() + 1;
  sh.getRange(r0, 1, 1, BC.H_PR.length).setNumberFormat('@');
  sh.getRange(r0, 1, 1, BC.H_PR.length).setValues([[kunci, a.jenis, a.id, a.nama, a.rombel, a.peran, String(platform || '').slice(0, 20), Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')]]);
  try { CacheService.getScriptCache().put('pn_' + kunci.slice(0, 60), JSON.stringify(a), 21600); } catch (e) {}
  return { kunci: kunci };
}

// Dipanggil aplikasi (terbuka) dan pemeriksa latar belakang Android.
function waNotifCek(kunci) {
  var now = new Date().getTime();
  var a = bcAudiens_(kunci);
  if (!a) return { sah: false, pesan: [], sekarangMs: now };
  var pesan = bcAktif_().filter(function(b) { return b.berlakuMs > now && bcCocok_(b, a); }).slice(0, 20)
    .map(function(b) { return { id: b.id, judul: b.judul, isi: b.isi, waktu: b.waktu, oleh: b.oleh, sekali: !!(b.sasaran && b.sasaran.sekali) }; });
  // v1.39.0: pengingat harian membuat PIN untuk WB yang belum punya PIN
  try { var ingat = pinPengingat_(a); if (ingat) pesan.unshift(ingat); } catch (eP) {}
  try { pesan = pesan.concat(npUntuk_(a)); } catch (eN) {}   // v1.50.0: notifikasi per peran (tagihan, keuangan, honor, ...)
  return { sah: true, pesan: pesan, sekarangMs: now };
}

// Dipanggil saat keluar: perangkat tidak menerima pemberitahuan lagi.
function waNotifKeluar(kunci) {
  kunci = String(kunci || '');
  if (kunci.length < 40) return { sukses: false };
  try { CacheService.getScriptCache().put('pn_' + kunci.slice(0, 60), '-', 21600); } catch (e) {}
  var sh = bcSheet_(BC.SH_PR, BC.H_PR);
  var f = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 1).createTextFinder(kunci).matchEntireCell(true).findNext();
  if (f && f.getRow() > 1) sh.deleteRow(f.getRow());
  return { sukses: true };
}

// ---------- endpoint admin ----------
function bcRingkas_(b, now) {
  var s = b.sasaran || {}, bag = [];
  if (s.siswa) bag.push('Siswa' + (s.rombel && s.rombel.length ? ' (' + (s.namaRombel || s.rombel).join(', ') + ')' : ''));
  if (s.staf) bag.push('Staf' + (s.peran && s.peran.length ? ' (' + s.peran.join(', ') + ')' : ''));
  if (s.sekali) bag.push('tampil sekali');
  return {
    id: b.id, waktu: b.waktu, judul: b.judul, isi: b.isi, penerima: bag.join(' · '), oleh: b.oleh, berlaku: b.berlaku,
    status: b.status !== 'Aktif' ? b.status : (b.berlakuMs <= now ? 'Kedaluwarsa' : 'Aktif'), ditarikOleh: b.ditarikOleh,
    // v1.70.1: untuk "Ulangi" (isi form dari riwayat)
    siswa: !!s.siswa, staf: !!s.staf, rombel: s.rombel || [], peran: s.peran || [], sekali: !!s.sekali,
    hari: b.waktuMs && b.berlakuMs ? Math.max(1, Math.round((b.berlakuMs - b.waktuMs) / 86400000)) : 7
  };
}

function waAdminBroadcastDaftar(token) {
  wajibAdmin_(token);
  var now = new Date().getTime();
  var pesan = bcBacaSemua_().sort(function(x, y) { return y.waktuMs - x.waktuMs; }).slice(0, 50).map(function(b) { return bcRingkas_(b, now); });
  var hitung = { siswa: 0, staf: 0 };
  try {
    var v = bcSheet_(BC.SH_PR, BC.H_PR).getDataRange().getValues();
    for (var i = 1; i < v.length; i++) { var j = String(v[i][1]); if (hitung[j] !== undefined) hitung[j]++; }
  } catch (e) {}
  return { pesan: pesan, rombel: ssmRombelAktif_(), peran: BC.PERAN, perangkat: hitung, maksHari: BC.MAKS_HARI };
}

// d: { judul, isi, siswa: bool, staf: bool, rombel: [idRombel e-learning], peran: [..], hari }
function waAdminBroadcastKirim(token, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  var judul = String(d.judul || '').replace(/\s+/g, ' ').trim(), isi = String(d.isi || '').replace(/\r/g, '').trim();
  if (judul.length < 3) throw new Error('Judul minimal 3 karakter.');
  if (judul.length > 100) throw new Error('Judul maksimal 100 karakter.');
  if (!isi) throw new Error('Isi pemberitahuan wajib diisi.');
  if (isi.length > 1000) throw new Error('Isi maksimal 1000 karakter.');
  var siswa = d.siswa === true, staf = d.staf === true;
  if (!siswa && !staf) throw new Error('Pilih penerima: siswa, staf, atau keduanya.');
  var hari = Math.round(Number(d.hari) || 7);
  if (!(hari >= 1 && hari <= BC.MAKS_HARI)) throw new Error('Masa tampil 1 sampai ' + BC.MAKS_HARI + ' hari.');
  var semuaRb = ssmRombelAktif_(), namaRb = {};
  semuaRb.forEach(function(r) { namaRb[r.id] = r.nama; });
  var rombel = siswa && Array.isArray(d.rombel) ? d.rombel.map(String).filter(function(x) { return namaRb[x]; }) : [];
  if (rombel.length === semuaRb.length) rombel = [];
  var peran = staf && Array.isArray(d.peran) ? d.peran.map(String).filter(function(x) { return BC.PERAN.indexOf(x) >= 0; }) : [];
  if (peran.length === BC.PERAN.length) peran = [];
  var now = new Date().getTime(), berlakuMs = now + hari * 86400000, tz = Session.getScriptTimeZone();
  var sas = { siswa: siswa, staf: staf, rombel: rombel, namaRombel: rombel.map(function(x) { return namaRb[x]; }), peran: peran };
  if (d.sekali === true) sas.sekali = true;   // v1.70.1: tiap penerima hanya melihat sekali; sesudah dibuka hilang dari kotak masuk
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var sh = bcSheet_(BC.SH, BC.H), r0 = sh.getLastRow() + 1, id = generateId_('BC-');
    sh.getRange(r0, 1, 1, BC.H.length).setNumberFormat('@');
    sh.getRange(r0, 1, 1, BC.H.length).setValues([[id, Utilities.formatDate(new Date(now), tz, 'yyyy-MM-dd HH:mm'), String(now), judul, isi, JSON.stringify(sas), p.nama,
      Utilities.formatDate(new Date(berlakuMs), tz, 'yyyy-MM-dd HH:mm'), String(berlakuMs), 'Aktif', '']]);
    bcLupakan_();
    try { catat_(p.peran, '', p.nama, 'Kirim broadcast', judul + ' · ' + bcRingkas_({ sasaran: sas }, now).penerima, 'OK'); } catch (e) {}
  } finally {
    kunci.releaseLock();
  }
  return waAdminBroadcastDaftar(token);
}

function waAdminBroadcastTarik(token, id) {
  var p = wajibAdmin_(token);
  var b = bcBacaSemua_().filter(function(x) { return x.id === String(id); })[0];
  if (!b) throw new Error('Pemberitahuan tidak ditemukan.');
  var sh = bcSheet_(BC.SH, BC.H);
  sh.getRange(b.baris, 10, 1, 2).setValues([['Ditarik', p.nama + ' · ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')]]);
  bcLupakan_();
  try { catat_(p.peran, '', p.nama, 'Tarik broadcast', b.judul, 'OK'); } catch (e) {}
  return waAdminBroadcastDaftar(token);
}
