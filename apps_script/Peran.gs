// ============================================================
// PERAN & AKSES: Admin, Tutor, Siswa
// ------------------------------------------------------------
// Siswa  : masuk lewat halaman utama (Nama + Tanggal Lahir) - tidak berubah.
// Tutor  : masuk lewat halaman staf (?halaman=staf) dengan Nama + Kode Akses.
//          Hanya melihat mapel yang di-enroll admin. Belum di-enroll = halaman kosong.
// Admin  : masuk lewat halaman staf yang sama. Mengelola tutor dan enrollment,
//          serta bisa melihat semua mapel.
//
// Tab baru di spreadsheet:
//   "Pengguna"         -> daftar admin & tutor (nama, peran, kode akses, status)
//   "Enrollment Tutor" -> tutor mana mengampu mapel mana (mapel sudah terikat ke satu kelas/rombel)
//
// Keamanan: setiap fungsi wa* untuk staf menerima token sesi (disimpan di
// CacheService, 6 jam) dan SELALU diperiksa ulang di server. Menyembunyikan
// tombol di layar tidak dipakai sebagai satu-satunya pengaman.
// ============================================================

var PERAN = {
  SHEET_PENGGUNA: 'Pengguna',
  SHEET_ENROLLMENT: 'Enrollment Tutor',
  HEADERS_PENGGUNA: ['ID Pengguna', 'Nama', 'Peran (Admin/Tutor)', 'Kode Akses', 'Email/No. HP (opsional)', 'Status', 'Dibuat Pada'],
  HEADERS_ENROLLMENT: ['ID Pengguna', 'Nama Tutor', 'ID Mapel', 'Nama Mapel', 'Kelas/Rombel', 'Tanggal Enroll'],
  DURASI_SESI_DETIK: 21600,
  BATAS_GAGAL_LOGIN: 5,
  KUNCI_GAGAL_DETIK: 600
};

// ---------- utilitas kecil ----------
function sTeks_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  return v === null || v === undefined ? '' : String(v);
}

function normNama_(t) {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normPeran_(v) {
  var t = String(v || '').trim().toLowerCase();
  if (t === 'admin') return 'Admin';
  if (t === 'tutor') return 'Tutor';
  if (t === 'kepala sekolah') return 'Kepala Sekolah';
  if (t === 'koordinator kurikulum') return 'Koordinator Kurikulum';
  if (t === 'superadmin' || t === 'ketua yayasan') return 'Superadmin';
  if (t === 'front office' || t === 'fo') return 'Front Office';
  if (t === 'bendahara') return 'Bendahara';
  if (t === 'dinas pendidikan' || t === 'dinas') return 'Dinas Pendidikan';
  return '';
}

function waktuSekarang_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

function buatKodeStaf_() {
  var huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var out = '';
  for (var i = 0; i < 8; i++) out += huruf.charAt(Math.floor(Math.random() * huruf.length));
  return out;
}

function buatIdPengguna_() {
  return 'USR-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
}

// ---------- penyiapan sheet ----------
function pastikanSheetPeran_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dibuat = [];
  [[PERAN.SHEET_PENGGUNA, PERAN.HEADERS_PENGGUNA], [PERAN.SHEET_ENROLLMENT, PERAN.HEADERS_ENROLLMENT]].forEach(function(d) {
    var sh = ss.getSheetByName(d[0]);
    if (!sh) {
      sh = ss.insertSheet(d[0]);
      sh.getRange(1, 1, 1, d[1].length).setValues([d[1]]).setFontWeight('bold');
      sh.setFrozenRows(1);
      if (d[0] === PERAN.SHEET_PENGGUNA) {
        sh.getRange(2, 1, 500, 7).setNumberFormat('@');
        var aturan = SpreadsheetApp.newDataValidation().requireValueInList(['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Front Office', 'Bendahara', 'Dinas Pendidikan'], true).setAllowInvalid(false).build();
        sh.getRange(2, 3, 500, 1).setDataValidation(aturan);
        var aturanStatus = SpreadsheetApp.newDataValidation().requireValueInList(['Aktif', 'Nonaktif'], true).setAllowInvalid(false).build();
        sh.getRange(2, 6, 500, 1).setDataValidation(aturanStatus);
      }
      dibuat.push(d[0]);
    }
  });
  var sp = ss.getSheetByName(PERAN.SHEET_PENGGUNA);
  if (sp.getLastRow() < 2) {
    sp.getRange(2, 1, 1, 7).setValues([[buatIdPengguna_(), 'Administrator', 'Admin', buatKodeStaf_(), '', 'Aktif', waktuSekarang_()]]);
  }
  return dibuat;
}

// ---------- baca data ----------
function bacaPengguna_() {
  var v = getSheetData(PERAN.SHEET_PENGGUNA);
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (!String(r[1]).trim()) continue;
    out.push({
      baris: i + 1,
      id: sTeks_(r[0]).trim() || ('BARIS' + (i + 1)),
      nama: sTeks_(r[1]).trim(),
      peran: normPeran_(r[2]) || (function() { var k = typeof izPeranKustom_ === 'function' ? izPeranKustom_(r[2]) : null; return k ? k.dasar : ''; })(),
      peranKustom: normPeran_(r[2]) ? '' : (function() { var k = typeof izPeranKustom_ === 'function' ? izPeranKustom_(r[2]) : null; return k ? k.nama : ''; })(),
      kode: sTeks_(r[3]).trim(),
      hp: sTeks_(r[4]),
      status: sTeks_(r[5]).trim() || 'Aktif',
      dibuat: sTeks_(r[6])
    });
  }
  return out;
}

function bacaEnrollment_() {
  var v = getSheetData(PERAN.SHEET_ENROLLMENT);
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (!String(r[0]).trim() || !String(r[2]).trim()) continue;
    out.push({ idPengguna: sTeks_(r[0]).trim(), idMapel: sTeks_(r[2]).trim() });
  }
  return out;
}

function mapelAktifSemua_(semua) {
  var rombel = {};
  getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(r, i) {
    if (i === 0 || !String(r[0]).trim()) return;
    if (sTeks_(r[3]).trim() !== 'Aktif') return;
    rombel[sTeks_(r[0]).trim()] = sTeks_(r[1]).trim();
  });
  var out = [];
  getSheetData(CONFIG.SHEETS.MAPEL).forEach(function(r, i) {
    if (i === 0 || !String(r[0]).trim()) return;
    if (!semua && sTeks_(r[4]).trim() !== 'Aktif') return;
    var idRombel = sTeks_(r[1]).trim();
    if (!rombel.hasOwnProperty(idRombel)) return;
    out.push({
      idMapel: sTeks_(r[0]).trim(),
      idRombel: idRombel,
      namaRombel: rombel[idRombel],
      namaMapel: sTeks_(r[2]).trim(),
      tutorTeks: sTeks_(r[3]).trim(),
      statusMapel: sTeks_(r[4]).trim()
    });
  });
  return out;
}

// ---------- sesi & otorisasi ----------
// ---------- MODE MAINTENANCE ----------
// Saat aktif: halaman siswa, pendaftaran, dan login tutor/kepala sekolah menampilkan halaman "Under maintenance". Admin tetap bisa masuk.
function mtAktif_() {
  try {
    var c = CacheService.getScriptCache().get('mt_flag');
    if (c !== null) return c === '1';
    var a = PropertiesService.getScriptProperties().getProperty('MODE_MAINTENANCE') === '1';
    CacheService.getScriptCache().put('mt_flag', a ? '1' : '0', 21600);
    return a;
  } catch (e) { return false; }
}
function mtPesan_() {
  try { return PropertiesService.getScriptProperties().getProperty('MODE_MAINTENANCE_PESAN') || ''; } catch (e) { return ''; }
}
function mtHalaman_() {
  var pesan = String(mtPesan_() || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  var html = '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Under Maintenance</title><style>' +
    '*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Poppins,Segoe UI,Roboto,Arial,sans-serif;color:#fff;background:linear-gradient(135deg,#2a2a72 0%,#0b78d1 100%)}' +
    '.k{max-width:520px;width:100%;text-align:center;padding:40px 28px;border-radius:24px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);box-shadow:0 8px 32px rgba(0,0,0,.18);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)}' +
    '.i{font-size:56px;margin-bottom:8px}h1{margin:0 0 8px;font-size:28px}p{margin:6px 0;font-size:16px;opacity:.92;line-height:1.5}.c{margin-top:14px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.14);font-size:15px}' +
    'button{margin-top:22px;border:0;border-radius:14px;padding:12px 22px;font:inherit;font-weight:600;color:#fff;background:#0066ff;cursor:pointer}' +
    '</style></head><body><div class="k"><div class="i">&#128736;</div><h1>Under Maintenance</h1><p>Will be back soon!</p>' +
    '<p>Sistem sedang dalam pemeliharaan. Mohon coba lagi beberapa saat lagi.</p>' + (pesan ? '<div class="c">' + pesan + '</div>' : '') +
    '<button onclick="top.location.reload()">Muat ulang</button></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Under Maintenance - PKBM Tunas Harapan')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function waStafMaintenanceBaca(token) {
  wajibAdmin_(token);
  return { aktif: mtAktif_(), pesan: mtPesan_() };
}
function waStafMaintenanceAtur(token, aktif, pesan) {
  var p = wajibAdmin_(token);
  var on = aktif === true || aktif === 'true' || aktif === 1;
  var sp = PropertiesService.getScriptProperties();
  sp.setProperty('MODE_MAINTENANCE', on ? '1' : '0');
  sp.setProperty('MODE_MAINTENANCE_PESAN', String(pesan || '').slice(0, 300));
  try { CacheService.getScriptCache().put('mt_flag', on ? '1' : '0', 21600); } catch (e) {}
  try { catat_(p.peran, p.id, p.nama, 'Maintenance', on ? 'ON' : 'OFF', 'OK'); } catch (e2) {}
  return { aktif: on, pesan: mtPesan_() };
}

function stafDariToken_(token) {
  if (!token) throw new Error('SESI_HABIS');
  var id = CacheService.getScriptCache().get('staf_' + token);
  if (!id) throw new Error('SESI_HABIS');
  var daftar = typeof penggunaCache_ === 'function' ? penggunaCache_() : bacaPengguna_();
  for (var i = 0; i < daftar.length; i++) {
    if (daftar[i].id === id && daftar[i].status === 'Aktif' && daftar[i].peran) {
      // Sesi diperpanjang tiap ada aktivitas (6 jam sejak aktivitas terakhir, bukan sejak masuk).
      try { CacheService.getScriptCache().put('staf_' + token, id, PERAN.DURASI_SESI_DETIK); } catch (e) {}
      if (daftar[i].peran !== 'Admin' && mtAktif_()) throw new Error('MAINTENANCE');
      var hasilU = (daftar[i].peran === 'Dinas Pendidikan' && typeof dinasSaring_ === 'function') ? dinasSaring_(daftar[i]) : daftar[i];
      if (typeof izPeriksa_ === 'function') izPeriksa_(hasilU);   // v1.41.0: izin per fitur (Peran & Izin)
      return hasilU;
    }
  }
  throw new Error('SESI_HABIS');
}

function wajibAdmin_(token) {
  var p = stafDariToken_(token);
  if (p.peran !== 'Admin') throw new Error('Fitur ini khusus admin.');
  return p;
}

// Mengembalikan {p, m}. Tutor hanya boleh mapel yang di-enroll; admin boleh semua mapel aktif.
function wajibMapel_(token, idMapel) {
  var p = stafDariToken_(token);
  var m = null;
  mapelAktifSemua_().forEach(function(x) { if (x.idMapel === String(idMapel)) m = x; });
  if (!m) throw new Error('Mapel tidak ditemukan atau sudah tidak aktif.');
  if (p.peran !== 'Admin' && !pimpinanBolehBaca_(p)) {
    var boleh = false;
    bacaEnrollment_().forEach(function(e) {
      if (e.idPengguna === p.id && e.idMapel === m.idMapel) boleh = true;
    });
    if (!boleh) throw new Error('Anda tidak mengampu mapel ini.');
  }
  return { p: p, m: m };
}

// ---------- login / profil ----------
function waUrlStaf() {
  var url = ScriptApp.getService().getUrl();
  return { staf: url + '?halaman=staf', siswa: url, daftar: url + '?halaman=daftar', gate: SSO_GATE_URL };
}

function waStafLogin(nama, kode) {
  pastikanSheetPeran_();
  var cache = CacheService.getScriptCache();
  var kunciGagal = 'gagal_' + normNama_(nama).replace(/[^a-z0-9]/g, '').slice(0, 60);
  var gagal = parseInt(cache.get(kunciGagal) || '0', 10);
  if (gagal >= PERAN.BATAS_GAGAL_LOGIN) {
    catat_('Staf', '', nama, 'Masuk', 'Diblokir sementara karena terlalu banyak salah', 'GAGAL');
    return { sukses: false, pesan: 'Terlalu banyak percobaan yang salah. Tunggu 10 menit lalu coba lagi.' };
  }
  var cocok = null;
  var kodeInput = String(kode || '').trim().toUpperCase();
  bacaPengguna_().forEach(function(p) {
    if (normNama_(p.nama) === normNama_(nama) && p.kode && p.kode.toUpperCase() === kodeInput && p.peran && p.status === 'Aktif') cocok = p;
  });
  if (!cocok) {
    cache.put(kunciGagal, String(gagal + 1), PERAN.KUNCI_GAGAL_DETIK);
    catat_('Staf', '', nama, 'Masuk', 'Nama atau kode akses tidak cocok', 'GAGAL');
    return { sukses: false, pesan: 'Nama atau kode akses tidak cocok, atau akun belum aktif. Hubungi admin.' };
  }
  cache.remove(kunciGagal);
  if (cocok.peran !== 'Admin' && mtAktif_()) return { sukses: false, maintenance: true, pesan: mtPesan_() };
  var token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('staf_' + token, cocok.id, PERAN.DURASI_SESI_DETIK);
  catat_(cocok.peran, cocok.id, cocok.nama, 'Masuk', '', 'OK');
  return { sukses: true, token: token, nama: cocok.nama, peran: cocok.peran };
}

function waStafKeluar(token) {
  if (token) {
    var cache = CacheService.getScriptCache();
    var id = cache.get('staf_' + token);
    cache.remove('staf_' + token);
    if (id) {
      bacaPengguna_().forEach(function(p) {
        if (p.id === id) catat_(p.peran, p.id, p.nama, 'Keluar', '', 'OK');
      });
    }
  }
  return true;
}

// Tutor yang belum di-enroll mendapat mapel: [] -> halaman kosong.
function waStafProfilAsliDt_(token) {
  var p = stafDariToken_(token);
  var semua = mapelAktifSemua_();
  var boleh = {};
  bacaEnrollment_().forEach(function(e) { if (e.idPengguna === p.id) boleh[e.idMapel] = true; });
  var mapel = semua.filter(function(m) { return p.peran === 'Admin' || boleh[m.idMapel] === true; });
  return {
    nama: p.nama,
    peran: p.peran,
    mapel: mapel.map(function(m) {
      return { idMapel: m.idMapel, namaMapel: m.namaMapel, idRombel: m.idRombel, namaRombel: m.namaRombel };
    })
  };
}

// ---------- data per mapel (tutor & admin) ----------
function waStafMateri(token, idMapel) {
  wajibMapel_(token, idMapel);
  var h = CONFIG.HEADERS.MATERI;
  var iId = h.indexOf('ID Materi'), iMapel = h.indexOf('ID Mapel'), iJenis = h.indexOf('Jenis'),
      iJudul = h.indexOf('Judul'), iStatus = h.indexOf('Status'), iSesi = h.indexOf('Sesi'),
      iDibuat = h.indexOf('Dibuat Pada');
  var v = getSheetData(CONFIG.SHEETS.MATERI);
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][iMapel]).trim() !== String(idMapel)) continue;
    out.push({
      id: sTeks_(v[i][iId]),
      jenis: sTeks_(v[i][iJenis]),
      judul: sTeks_(v[i][iJudul]),
      status: sTeks_(v[i][iStatus]),
      sesi: sTeks_(v[i][iSesi]) || 'Sesi 1',
      dibuat: sTeks_(v[i][iDibuat])
    });
  }
  return out;
}

function waStafSiswa(token, idMapel) {
  var ctx = wajibMapel_(token, idMapel);
  var v = getSheetData(CONFIG.SHEETS.SISWA);
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][0]).trim() !== ctx.m.idRombel) continue;
    if (!String(v[i][1]).trim()) continue;
    out.push(sTeks_(v[i][1]).trim());
  }
  out.sort();
  return out;
}

function waStafNilai(token, idMapel) {
  wajibMapel_(token, idMapel);
  var v = getSheetData(CONFIG.SHEETS.JAWABAN);
  if (v.length < 2) return [];
  var hd = v[0].map(function(x) { return String(x).trim(); });
  var iMapel = hd.indexOf('ID Mapel'), iJudul = hd.indexOf('Judul Materi'), iJenis = hd.indexOf('Jenis'),
      iSiswa = hd.indexOf('Nama Siswa'), iNilai = hd.indexOf('Nilai'), iWaktu = hd.indexOf('Waktu Kirim');
  if (iMapel < 0 || iSiswa < 0) return [];
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][iMapel]).trim() !== String(idMapel)) continue;
    out.push({
      siswa: sTeks_(v[i][iSiswa]),
      judul: iJudul >= 0 ? sTeks_(v[i][iJudul]) : '',
      jenis: iJenis >= 0 ? sTeks_(v[i][iJenis]) : '',
      nilai: iNilai >= 0 ? sTeks_(v[i][iNilai]) : '',
      waktu: iWaktu >= 0 ? sTeks_(v[i][iWaktu]) : ''
    });
  }
  out.reverse();
  return out.slice(0, 500);
}

function idUjianUntukMapel_(idMapel) {
  var h = CONFIG.HEADERS.MATERI;
  var iId = h.indexOf('ID Materi'), iMapel = h.indexOf('ID Mapel'), iJenis = h.indexOf('Jenis'), iJudul = h.indexOf('Judul');
  var peta = {};
  var v = getSheetData(CONFIG.SHEETS.MATERI);
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][iMapel]).trim() === String(idMapel) && sTeks_(v[i][iJenis]).trim() === 'Ujian') {
      peta[sTeks_(v[i][iId]).trim()] = sTeks_(v[i][iJudul]);
    }
  }
  return peta;
}

function waStafUjianTerkunci(token, idMapel) {
  var ctx = wajibMapel_(token, idMapel);
  var peta = idUjianUntukMapel_(idMapel);
  var cols = sesiCols_();
  var v = getSheetData(CONFIG.SHEETS.PERCOBAAN_UJIAN);
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (r[cols.terkunci - 1] !== true) continue;
    var idUjian = sTeks_(r[cols.idUjian - 1]).trim();
    if (!peta.hasOwnProperty(idUjian)) continue;
    if (sTeks_(r[cols.idRombel - 1]).trim() !== ctx.m.idRombel) continue;
    out.push({
      idUjian: idUjian,
      judul: peta[idUjian],
      nama: sTeks_(r[cols.nama - 1]),
      percobaan: sTeks_(r[cols.percobaan - 1])
    });
  }
  return out;
}

function waStafBukaKunci(token, idMapel, idUjian, nama) {
  var ctx = wajibMapel_(token, idMapel);
  var peta = idUjianUntukMapel_(idMapel);
  if (!peta.hasOwnProperty(String(idUjian))) throw new Error('Ujian ini bukan milik mapel yang Anda ampu.');
  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  try {
    var baris = cariBarisSesiUjian_(idUjian, ctx.m.idRombel, nama);
    if (!baris) throw new Error('Data percobaan ujian siswa tidak ditemukan.');
    baris.sheet.getRange(baris.rowIndex, baris.cols.terkunci).setValue(false);
    baris.sheet.getRange(baris.rowIndex, baris.cols.percobaan).setValue(0);
  } finally {
    kunci.releaseLock();
  }
  catat_(ctx.p.peran, ctx.p.id, ctx.p.nama, 'Buka kunci ujian siswa', nama + ' (ujian ' + idUjian + ')', 'OK');
  return true;
}

// ---------- khusus admin ----------
// Samakan SEMUA tutor/admin aktif di SIM SETARA ke tab Pengguna (tidak menunggu login Google pertama).
// Dibatasi 1x per 5 menit kecuali paksa = true. Tutor tanpa email di SIM tidak bisa dicocokkan: namanya dikembalikan di tanpaEmail.
function ssoSelaraskanSemua_(paksa) {
  var cache = CacheService.getScriptCache();
  if (!paksa && cache.get('sso_semua')) return null;
  var ss = simSs_();
  var daftar = [], tanpaEmail = [], i;
  var sh = simTab_('PENGGUNA');
  if (sh && sh.getLastRow() > 1) {
    var v = sh.getDataRange().getValues();
    var iE = ssoIndeks_(v[0], 'EMAIL'), iN = ssoIndeks_(v[0], 'NAMA'), iP = ssoIndeks_(v[0], 'PERAN'), iA = ssoIndeks_(v[0], 'AKTIF');
    for (i = 1; i < v.length; i++) {
      if (iE < 0) break;
      var em = String(v[i][iE]).trim().toLowerCase();
      if (!em) continue;
      if (iA >= 0 && !ssoAktif_(v[i][iA])) continue;
      var pr = normPeran_(iP >= 0 ? v[i][iP] : '');
      if (pr) daftar.push({ email: em, nama: sTeks_(v[i][iN]).trim() || em, peran: pr });
    }
  }
  var st = simTab_('TUTOR');
  if (st && st.getLastRow() > 1) {
    var w = st.getDataRange().getValues();
    var tE = ssoIndeks_(w[0], 'EMAIL'), tN = ssoIndeks_(w[0], 'NAMA TUTOR'), tA = ssoIndeks_(w[0], 'AKTIF');
    for (i = 1; i < w.length; i++) {
      var nm = tN >= 0 ? sTeks_(w[i][tN]).trim() : '';
      if (!nm) continue;
      if (tA >= 0 && !ssoAktif_(w[i][tA])) continue;
      var e2 = tE >= 0 ? String(w[i][tE]).trim().toLowerCase() : '';
      if (!e2) { tanpaEmail.push(nm); continue; }
      daftar.push({ email: e2, nama: nm, peran: 'Tutor' });
    }
  }
  var sudah = {}, proses = 0;
  daftar.forEach(function(d) {
    if (sudah[d.email]) return;
    sudah[d.email] = true;
    try { ssoSelaraskan_(d.email, { nama: d.nama, peran: d.peran }); proses++; } catch (e) {}
  });
  cache.put('sso_semua', '1', 300);
  return { diproses: proses, tanpaEmail: tanpaEmail };
}

function waAdminDaftar(token) {
  wajibAdmin_(token);
  try { ssoSelaraskanSemua_(false); } catch (e) {}
  var enr = bacaEnrollment_();
  var jumlah = {};
  enr.forEach(function(e) { jumlah[e.idPengguna] = (jumlah[e.idPengguna] || 0) + 1; });
  return {
    pengguna: bacaPengguna_().map(function(p) {
      return { id: p.id, nama: p.nama, peran: p.peranKustom || p.peran, peranDasar: p.peran, kode: p.kode, hp: p.hp, status: p.status, jumlahMapel: jumlah[p.id] || 0 };
    }),
    peranTersedia: (function() { try { return izRingkasPeran_().filter(function(r) { return r.status !== 'Nonaktif'; }).map(function(r) { return { nama: r.nama, dasar: r.dasar, bawaan: r.bawaan }; }); } catch (e) { return []; } })(),
    mapel: mapelAktifSemua_().map(function(m) {
      return { idMapel: m.idMapel, namaMapel: m.namaMapel, idRombel: m.idRombel, namaRombel: m.namaRombel };
    }),
    enrollment: enr
  };
}

function jumlahAdminAktif_(kecualiId) {
  var n = 0;
  bacaPengguna_().forEach(function(p) {
    if (p.peran === 'Admin' && p.status === 'Aktif' && p.id !== kecualiId) n++;
  });
  return n;
}

function waAdminSimpanPengguna(token, data) {
  var me = wajibAdmin_(token);
  var nama = String(data.nama || '').trim();
  var peran = normPeran_(data.peran), kustom = peran ? null : izPeranKustom_(data.peran);
  if (kustom) peran = kustom.nama;                                   // v1.41.0: peran kustom (Peran & Izin)
  var dasarP = kustom ? kustom.dasar : peran;
  var status = data.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
  if (!nama) throw new Error('Nama wajib diisi.');
  if (!peran) throw new Error('Peran tidak dikenal. Pilih peran bawaan atau peran yang dibuat di menu Peran & Izin.');
  var kunci = LockService.getScriptLock(), idBaru = '';
  kunci.waitLock(15000);
  try {
    var daftar = bacaPengguna_();
    // nama tidak diubah: tidak dicek kembar, agar data lama yang kembar tetap bisa diedit
    var namaTakBerubah_ = false;
    daftar.forEach(function(p) { if (data.id && p.id === data.id && normNama_(p.nama) === normNama_(nama)) namaTakBerubah_ = true; });
    for (var i = 0; i < daftar.length; i++) {
      if (!namaTakBerubah_ && normNama_(daftar[i].nama) === normNama_(nama) && daftar[i].id !== data.id) {
        throw new Error('Sudah ada pengguna dengan nama yang sama. Beri pembeda (mis. tambah inisial).');
      }
    }
    var sheet = getSheet(PERAN.SHEET_PENGGUNA);
    if (data.id) {
      var ada = null;
      daftar.forEach(function(p) { if (p.id === data.id) ada = p; });
      if (!ada) throw new Error('Pengguna tidak ditemukan.');
      var tetapAdmin = peran === 'Admin' && status === 'Aktif';   // hanya Admin bawaan yang dihitung sebagai admin utama
      if (ada.peran === 'Admin' && ada.status === 'Aktif' && !tetapAdmin && jumlahAdminAktif_(ada.id) === 0) {
        throw new Error('Tidak bisa: ini satu-satunya admin aktif. Tambahkan admin lain dulu.');
      }
      sheet.getRange(ada.baris, 2).setValue(nama);
      sheet.getRange(ada.baris, 3).setValue(peran);
      sheet.getRange(ada.baris, 5).setValue(String(data.hp || ''));
      sheet.getRange(ada.baris, 6).setValue(status);
      if (!ada.kode) sheet.getRange(ada.baris, 4).setValue(buatKodeStaf_());
      if (dasarP !== 'Tutor' || status !== 'Aktif') hapusEnrollmentPengguna_(ada.id);
      else segarkanNamaEnrollment_(ada.id, nama);
    } else {
      var baris = sheet.getLastRow() + 1;
      idBaru = buatIdPengguna_();
      sheet.getRange(baris, 1, 1, 7).setNumberFormat('@');
      sheet.getRange(baris, 1, 1, 7).setValues([[idBaru, nama, peran, buatKodeStaf_(), String(data.hp || ''), status, waktuSekarang_()]]);
    }
  } finally {
    kunci.releaseLock();
  }
  catat_('Admin', me.id, me.nama, data.id ? 'Ubah pengguna' : 'Tambah pengguna', nama + ' (' + peran + ', ' + status + ')', 'OK');
  // v1.38.5: tutor yang dibuat/diubah di e-learning langsung tercatat di Data Induk (IndukTutor.gs)
  if (dasarP === 'Tutor') indukSelarasTutor_(data.id || idBaru);
  return true;
}

function waAdminResetKode(token, idPengguna) {
  var adm = wajibAdmin_(token);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  try {
    var ada = null;
    bacaPengguna_().forEach(function(p) { if (p.id === idPengguna) ada = p; });
    if (!ada) throw new Error('Pengguna tidak ditemukan.');
    var kodeBaru = buatKodeStaf_();
    getSheet(PERAN.SHEET_PENGGUNA).getRange(ada.baris, 4).setValue(kodeBaru);
    catat_('Admin', adm.id, adm.nama, 'Reset kode akses staf', ada.nama, 'OK');
    return kodeBaru;
  } finally {
    kunci.releaseLock();
  }
}

function hapusEnrollmentPengguna_(idPengguna) {
  var sheet = getSheet(PERAN.SHEET_ENROLLMENT);
  var v = sheet.getDataRange().getValues();
  var terdampak = [];
  for (var i = v.length - 1; i >= 1; i--) {
    if (sTeks_(v[i][0]).trim() === idPengguna) {
      terdampak.push(sTeks_(v[i][2]).trim());
      sheet.deleteRow(i + 1);
    }
  }
  segarkanKolomTutorMapel_(terdampak);
}

function segarkanNamaEnrollment_(idPengguna, namaBaru) {
  var sheet = getSheet(PERAN.SHEET_ENROLLMENT);
  var v = sheet.getDataRange().getValues();
  var terdampak = [];
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][0]).trim() === idPengguna) {
      sheet.getRange(i + 1, 2).setValue(namaBaru);
      terdampak.push(sTeks_(v[i][2]).trim());
    }
  }
  segarkanKolomTutorMapel_(terdampak);
}

// Menjaga kolom "Tutor" (teks bebas) di sheet Mapel tetap sama dengan data enrollment.
// Mapel yang tidak punya enrollment tidak disentuh (teks lama dibiarkan).
function segarkanKolomTutorMapel_(daftarIdMapel) {
  if (!daftarIdMapel || !daftarIdMapel.length) return;
  var pengguna = {};
  bacaPengguna_().forEach(function(p) { pengguna[p.id] = p; });
  var namaPerMapel = {};
  bacaEnrollment_().forEach(function(e) {
    var p = pengguna[e.idPengguna];
    if (!p || p.status !== 'Aktif' || p.peran !== 'Tutor') return;
    if (!namaPerMapel[e.idMapel]) namaPerMapel[e.idMapel] = [];
    namaPerMapel[e.idMapel].push(p.nama);
  });
  var sheet = getSheet(CONFIG.SHEETS.MAPEL);
  var v = sheet.getDataRange().getValues();
  var butuh = {};
  daftarIdMapel.forEach(function(x) { butuh[x] = true; });
  for (var i = 1; i < v.length; i++) {
    var id = sTeks_(v[i][0]).trim();
    if (butuh[id] && namaPerMapel[id]) sheet.getRange(i + 1, 4).setValue(namaPerMapel[id].join(', '));
  }
}

// Mengganti seluruh daftar mapel yang diampu satu tutor.
// Mapel otomatis Aktif selama ada tutor yang di-enroll; kembali Nonaktif kalau tidak ada pengampu lagi.
function aktifkanMapelSesuaiEnrollment_(ids) {
  if (!ids || !ids.length) return;
  var enr = getSheet(PERAN.SHEET_ENROLLMENT).getDataRange().getValues();
  var punya = {}, i;
  for (i = 1; i < enr.length; i++) {
    var idm = sTeks_(enr[i][2]).trim();
    if (idm) punya[idm] = true;
  }
  var ada = {};
  ids.forEach(function(x) { ada[String(x).trim()] = true; });
  var sh = getSheet(CONFIG.SHEETS.MAPEL);
  var d = sh.getDataRange().getValues();
  for (i = 1; i < d.length; i++) {
    var id2 = sTeks_(d[i][0]).trim();
    if (!ada[id2]) continue;
    var tujuan = punya[id2] ? 'Aktif' : 'Nonaktif';
    if (sTeks_(d[i][4]).trim() !== tujuan) sh.getRange(i + 1, 5).setValue(tujuan);
  }
}

function waAdminSetEnrollment(token, idPengguna, daftarIdMapel) {
  var adm = wajibAdmin_(token);
  var namaTutorLog = '', jumlahLog = 0;
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var tutor = null;
    bacaPengguna_().forEach(function(p) { if (p.id === idPengguna) tutor = p; });
    if (!tutor) throw new Error('Pengguna tidak ditemukan.');
    if (tutor.peran !== 'Tutor') throw new Error('Enrollment hanya untuk pengguna berperan Tutor.');
    if (tutor.status !== 'Aktif') throw new Error('Pengguna ini nonaktif. Aktifkan dulu.');

    var peta = {};
    mapelAktifSemua_().forEach(function(m) { peta[m.idMapel] = m; });
    var baru = [];
    var terlihat = {};
    (daftarIdMapel || []).forEach(function(id) {
      id = String(id);
      if (peta[id] && !terlihat[id]) { terlihat[id] = true; baru.push(id); }
    });

    var sheet = getSheet(PERAN.SHEET_ENROLLMENT);
    var v = sheet.getDataRange().getValues();
    var terdampak = baru.slice();
    for (var i = v.length - 1; i >= 1; i--) {
      if (sTeks_(v[i][0]).trim() === idPengguna) {
        terdampak.push(sTeks_(v[i][2]).trim());
        sheet.deleteRow(i + 1);
      }
    }
    if (baru.length) {
      var tgl = waktuSekarang_();
      var baris = baru.map(function(id) {
        return [idPengguna, tutor.nama, id, peta[id].namaMapel, peta[id].namaRombel, tgl];
      });
      var awal = sheet.getLastRow() + 1;
      sheet.getRange(awal, 1, baris.length, 6).setNumberFormat('@');
      sheet.getRange(awal, 1, baris.length, 6).setValues(baris);
    }
    segarkanKolomTutorMapel_(terdampak);
    /* status mapel diatur admin di Kelola Mata Pelajaran */
    namaTutorLog = tutor.nama; jumlahLog = baru.length;
  } finally {
    kunci.releaseLock();
  }
  catat_('Admin', adm.id, adm.nama, 'Atur enrollment tutor', namaTutorLog + ': ' + jumlahLog + ' mapel', 'OK');
  indukSelarasTutor_(idPengguna);   // v1.38.5: penugasan ikut tercatat di Data Induk (ENROLL MAPEL)
  return true;
}

// ---------- menu spreadsheet ----------
function menuSiapkanPeran() {
  var dibuat = pastikanSheetPeran_();
  showDialog_({
    tone: 'success', icon: '🔐', title: 'Peran & Akses Siap',
    message: (dibuat.length ? 'Tab dibuat: ' + dibuat.join(', ') + '. ' : 'Tab Pengguna dan Enrollment Tutor sudah ada. ') +
      'Buka tab "Pengguna" untuk melihat nama dan kode akses admin. Tutor dan enrollment sebaiknya diatur lewat halaman staf (menu: Alamat Halaman Staf).'
  });
}

function menuLengkapiPengguna() {
  pastikanSheetPeran_();
  var sheet = getSheet(PERAN.SHEET_PENGGUNA);
  var v = sheet.getDataRange().getValues();
  var diisi = 0;
  for (var i = 1; i < v.length; i++) {
    if (!String(v[i][1]).trim()) continue;
    var ubah = false;
    if (!String(v[i][0]).trim()) { sheet.getRange(i + 1, 1).setNumberFormat('@').setValue(buatIdPengguna_()); ubah = true; }
    if (!String(v[i][3]).trim()) { sheet.getRange(i + 1, 4).setNumberFormat('@').setValue(buatKodeStaf_()); ubah = true; }
    if (!String(v[i][5]).trim()) { sheet.getRange(i + 1, 6).setValue('Aktif'); ubah = true; }
    if (!String(v[i][6]).trim()) { sheet.getRange(i + 1, 7).setNumberFormat('@').setValue(waktuSekarang_()); ubah = true; }
    if (ubah) diisi++;
  }
  showDialog_({
    tone: 'success', icon: '✅', title: 'Selesai',
    message: diisi + ' baris pengguna dilengkapi (ID, kode akses, status).'
  });
}

function menuAlamatHalamanStaf() {
  var u = waUrlStaf();
  showDialog_({
    tone: 'success', icon: '🔗', title: 'Alamat Halaman Staf',
    message: 'Halaman admin/tutor: ' + u.staf + '  |  Halaman siswa: ' + u.siswa +
      '  (alamat ini hanya benar setelah aplikasi web di-deploy)'
  });
}

// ---------- khusus admin: kelola mata pelajaran ----------
// Mapel selalu milik satu kelas (rombel). Kelas dipilih saat mapel dibuat dan tidak
// diubah sesudahnya, supaya materi, siswa, dan nilai yang sudah terkait tidak yatim.
function singkatanMapel_(nama) {
  var t = String(nama || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return t.slice(0, 4) || 'MAPEL';
}

function buatIdMapel_(nama, idRombel, sudahAda) {
  var akhiran = String(idRombel).toUpperCase().replace(/^ROM-?/, '').replace(/[^A-Z0-9]/g, '');
  var dasar = 'MP-' + singkatanMapel_(nama) + (akhiran ? '-' + akhiran : '');
  var id = dasar, n = 2;
  while (sudahAda[id]) { id = dasar + '-' + n; n++; }
  return id;
}

function waAdminDaftarMapel(token) {
  wajibAdmin_(token);
  var rombel = [], namaRombel = {};
  getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(r, i) {
    if (i === 0 || !String(r[0]).trim()) return;
    var id = sTeks_(r[0]).trim();
    namaRombel[id] = sTeks_(r[1]).trim();
    if (sTeks_(r[3]).trim() === 'Aktif') rombel.push({ id: id, nama: namaRombel[id] });
  });
  var iMateriMapel = CONFIG.HEADERS.MATERI.indexOf('ID Mapel');
  var jumlahMateri = {};
  getSheetData(CONFIG.SHEETS.MATERI).forEach(function(r, i) {
    if (i === 0) return;
    var k = sTeks_(r[iMateriMapel]).trim();
    if (k) jumlahMateri[k] = (jumlahMateri[k] || 0) + 1;
  });
  var mapel = [];
  getSheetData(CONFIG.SHEETS.MAPEL).forEach(function(r, i) {
    if (i === 0 || !String(r[0]).trim()) return;
    var id = sTeks_(r[0]).trim();
    var idR = sTeks_(r[1]).trim();
    mapel.push({
      idMapel: id,
      idRombel: idR,
      namaRombel: namaRombel[idR] || ('(kelas ' + idR + ' tidak ditemukan)'),
      namaMapel: sTeks_(r[2]).trim(),
      tutor: sTeks_(r[3]).trim(),
      status: sTeks_(r[4]).trim() === 'Aktif' ? 'Aktif' : 'Nonaktif',
      jumlahMateri: jumlahMateri[id] || 0
    });
  });
  return { rombel: rombel, mapel: mapel };
}

function segarkanNamaMapelEnrollment_(idMapel, namaBaru) {
  var sheet = getSheet(PERAN.SHEET_ENROLLMENT);
  var v = sheet.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][2]).trim() === idMapel) sheet.getRange(i + 1, 4).setValue(namaBaru);
  }
}

// data: { idMapel (kosong = mapel baru), idRombel (wajib untuk mapel baru), nama, status }
function waAdminSimpanMapel(token, data) {
  var adm = wajibAdmin_(token);
  var nama = String(data.nama || '').trim().replace(/\s+/g, ' ');
  if (!nama) throw new Error('Nama mata pelajaran wajib diisi.');
  if (nama.length > 80) throw new Error('Nama mata pelajaran terlalu panjang (maksimal 80 huruf).');
  var status = data.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  try {
    var sheet = getSheet(CONFIG.SHEETS.MAPEL);
    var v = sheet.getDataRange().getValues();
    var baris = -1, idRombel = String(data.idRombel || '').trim(), sudahAda = {};
    for (var i = 1; i < v.length; i++) {
      var idI = sTeks_(v[i][0]).trim();
      if (idI) sudahAda[idI] = true;
      if (data.idMapel && idI === String(data.idMapel)) { baris = i + 1; idRombel = sTeks_(v[i][1]).trim(); }
    }
    if (data.idMapel && baris < 0) throw new Error('Mata pelajaran tidak ditemukan.');
    if (!data.idMapel) {
      var rombelOk = false;
      getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(r, i) {
        if (i > 0 && sTeks_(r[0]).trim() === idRombel && sTeks_(r[3]).trim() === 'Aktif') rombelOk = true;
      });
      if (!rombelOk) throw new Error('Pilih kelas yang aktif untuk mata pelajaran ini.');
    }
    for (var j = 1; j < v.length; j++) {
      if (sTeks_(v[j][1]).trim() === idRombel && normNama_(v[j][2]) === normNama_(nama) && sTeks_(v[j][0]).trim() !== String(data.idMapel || '')) {
        throw new Error('Kelas ini sudah punya mata pelajaran dengan nama yang sama' +
          (sTeks_(v[j][4]).trim() === 'Aktif' ? '.' : ' (statusnya Nonaktif, aktifkan saja yang lama).'));
      }
    }
    if (baris > 0) {
      sheet.getRange(baris, 3).setValue(nama);
      sheet.getRange(baris, 5).setValue(status);
      segarkanNamaMapelEnrollment_(String(data.idMapel), nama);
      catat_('Admin', adm.id, adm.nama, 'Ubah mapel', nama + ' (' + status + ')', 'OK');
      return { idMapel: String(data.idMapel) };
    }
    var idBaru = buatIdMapel_(nama, idRombel, sudahAda);
    var awal = sheet.getLastRow() + 1;
    sheet.getRange(awal, 1, 1, 5).setNumberFormat('@');
    sheet.getRange(awal, 1, 1, 5).setValues([[idBaru, idRombel, nama, '', status]]);
    catat_('Admin', adm.id, adm.nama, 'Tambah mapel', nama + ' (' + idRombel + ')', 'OK');
    return { idMapel: idBaru };
  } finally {
    kunci.releaseLock();
  }
}

// ---------- kode akses siswa: tutor dapat membuat (generate) ulang kapan saja ----------
// Kode Akses hanya diminta siswa saat memulai dan mengirim UTS/UAS. Kode tidak tetap:
// tutor mapel (atau admin) membuat kode baru per siswa atau untuk seluruh kelas, dan kode lama langsung tidak berlaku.
function kaDaftar_(idRombel) {
  var v = getSheetData(CONFIG.SHEETS.SISWA), out = [];
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][0]).trim() !== String(idRombel)) continue;
    var nama = sTeks_(v[i][1]).trim();
    if (!nama) continue;
    out.push({ nama: nama, kode: sTeks_(v[i][3]).trim().toUpperCase() });
  }
  out.sort(function(a, b) { return a.nama < b.nama ? -1 : (a.nama > b.nama ? 1 : 0); });
  return out;
}

function waStafKodeAksesDaftar(token, idMapel) {
  var ctx = wajibMapel_(token, idMapel);
  return { siswa: kaDaftar_(ctx.m.idRombel), panjang: CONFIG.PANJANG_KODE_AKSES };
}

// opsi: { nama: 'satu siswa' } atau { semua: true } atau { hanyaKosong: true }
function waStafKodeAksesGenerate(token, idMapel, opsi) {
  var ctx = wajibMapel_(token, idMapel);
  opsi = opsi || {};
  var mode = opsi.semua ? 'semua' : (opsi.hanyaKosong ? 'kosong' : 'satu');
  var target = String(opsi.nama || '').trim().toLowerCase();
  if (mode === 'satu' && !target) throw new Error('Pilih satu siswa, atau buat kode untuk seluruh kelas.');
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var sheet = getSheet(CONFIG.SHEETS.SISWA);
    var v = sheet.getDataRange().getValues();
    var dipakai = {};
    for (var a = 1; a < v.length; a++) { if (v[a][3]) dipakai[String(v[a][3]).trim().toUpperCase()] = true; }
    var diubah = 0;
    for (var i = 1; i < v.length; i++) {
      if (sTeks_(v[i][0]).trim() !== String(ctx.m.idRombel)) continue;
      var nama = sTeks_(v[i][1]).trim();
      if (!nama) continue;
      var lama = String(v[i][3] || '').trim();
      if (mode === 'satu' && nama.toLowerCase() !== target) continue;
      if (mode === 'kosong' && lama) continue;
      var baru = '', coba = 0;
      do { baru = buatKodeAkses_(CONFIG.PANJANG_KODE_AKSES); coba++; } while (dipakai[baru] && coba < 500);
      if (dipakai[baru]) throw new Error('Gagal membuat kode yang unik. Coba lagi.');
      dipakai[baru] = true;
      sheet.getRange(i + 1, 4).setValue(baru);
      diubah++;
    }
    if (!diubah) throw new Error(mode === 'satu' ? 'Siswa itu tidak ditemukan di kelas ini.' : (mode === 'kosong' ? 'Semua siswa sudah punya kode akses.' : 'Belum ada siswa di kelas ini.'));
    kmCatat_(ctx.p, idMapel, 'Generate kode akses', (mode === 'satu' ? 'satu siswa' : (mode === 'kosong' ? 'siswa tanpa kode' : 'seluruh kelas')) + ' · ' + diubah + ' kode baru', 'OK');
    return { diubah: diubah, siswa: kaDaftar_(ctx.m.idRombel) };
  } finally {
    kunci.releaseLock();
  }
}

// ---------- Masuk dengan Google (SSO staf) ----------
// Pintu masuk Google ada di proyek terpisah 'Masuk Google Staf PKBM'. Pintu itu membaca email akun Google
// lalu menerbitkan tiket bertanda tangan (HMAC) berlaku 2 menit. Di sini tiket diperiksa, email dicocokkan
// dengan tab PENGGUNA (atau TUTOR) di SIM SETARA, dan sesi staf dibuat. Siswa tidak memakai jalur ini.
var SSO_RAHASIA = '268c2b759eb08a0f1213ecc0fe5e5ab81ec912a0aba830c9';
var SSO_GATE_URL = 'https://script.google.com/macros/s/AKfycbwHQsJ00YpWu-_XFCoPGZ4dtg_8j6ltARoQ9Baw8sq79Mcg89iCaniawyWlz5yDIBEX/exec';

function ssoGagal_(pesan) { return { sukses: false, pesan: pesan }; }

function ssoAktif_(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }

function ssoIndeks_(header, nama) {
  for (var i = 0; i < header.length; i++) { if (String(header[i]).trim().toUpperCase() === nama) return i; }
  return -1;
}

// Cari email di SIM SETARA: tab PENGGUNA (EMAIL, NAMA, PERAN, AKTIF), lalu tab TUTOR (EMAIL, NAMA TUTOR, AKTIF).
function ssoCariDiSim_(email) {
  var ss = simSs_();
  var sh = simTab_('PENGGUNA');
  if (sh && sh.getLastRow() > 1) {
    var v = sh.getDataRange().getValues();
    var iE = ssoIndeks_(v[0], 'EMAIL'), iN = ssoIndeks_(v[0], 'NAMA'), iP = ssoIndeks_(v[0], 'PERAN'), iA = ssoIndeks_(v[0], 'AKTIF');
    for (var i = 1; i < v.length; i++) {
      if (iE < 0 || String(v[i][iE]).trim().toLowerCase() !== email) continue;
      if (iA >= 0 && !ssoAktif_(v[i][iA])) continue;
      var peran = normPeran_(iP >= 0 ? v[i][iP] : '');
      if (peran) return { nama: sTeks_(v[i][iN]).trim() || email, peran: peran };
    }
  }
  var st = simTab_('TUTOR');
  if (st && st.getLastRow() > 1) {
    var w = st.getDataRange().getValues();
    var tE = ssoIndeks_(w[0], 'EMAIL'), tN = ssoIndeks_(w[0], 'NAMA TUTOR'), tA = ssoIndeks_(w[0], 'AKTIF');
    for (var j = 1; j < w.length; j++) {
      if (tE < 0 || String(w[j][tE]).trim().toLowerCase() !== email) continue;
      if (tA >= 0 && !ssoAktif_(w[j][tA])) continue;
      return { nama: sTeks_(w[j][tN]).trim() || email, peran: 'Tutor' };
    }
  }
  return null;
}

// Samakan tab Pengguna Belajar Mandiri dengan SIM SETARA: cocokkan lewat email; kalau belum ada, pakai baris lama
// bernama sama yang emailnya masih kosong; kalau tidak ada juga, buat baris baru (kode akses tetap dibuat sebagai cadangan).
function ssoSelaraskan_(email, sim) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  try {
    var sheet = getSheet(PERAN.SHEET_PENGGUNA);
    var v = sheet.getDataRange().getValues();
    var baris = -1, i;
    for (i = 1; i < v.length; i++) {
      if (String(v[i][4]).trim().toLowerCase() === email) { baris = i + 1; break; }
    }
    if (baris < 0) {
      for (i = 1; i < v.length; i++) {
        if (!String(v[i][4]).trim() && String(v[i][1]).trim() && normNama_(v[i][1]) === normNama_(sim.nama)) { baris = i + 1; break; }
      }
    }
    if (baris < 0) {
      var idBaru = buatIdPengguna_();
      sheet.appendRow([idBaru, sim.nama, sim.peran, buatKodeStaf_(), email, 'Aktif', waktuSekarang_()]);
      return { id: idBaru, nama: sim.nama, peran: sim.peran };
    }
    var r = v[baris - 1];
    var id = String(r[0]).trim() || ('BARIS' + baris);
    sheet.getRange(baris, 3).setValue(sim.peran);
    sheet.getRange(baris, 5).setValue(email);
    sheet.getRange(baris, 6).setValue('Aktif');
    return { id: id, nama: String(r[1]).trim() || sim.nama, peran: sim.peran };
  } finally {
    kunci.releaseLock();
  }
}

function waStafMasukSso(tiket) {
  var bag = String(tiket || '').split('.');
  if (bag.length !== 2) return ssoGagal_('Tiket masuk tidak valid. Ulangi dengan tombol Masuk dengan Google.');
  var isi;
  try { isi = Utilities.newBlob(Utilities.base64DecodeWebSafe(bag[0])).getDataAsString(); }
  catch (e) { return ssoGagal_('Tiket masuk tidak valid. Ulangi dengan tombol Masuk dengan Google.'); }
  var tanda = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(isi, SSO_RAHASIA));
  if (tanda !== bag[1]) return ssoGagal_('Tiket masuk tidak valid. Ulangi dengan tombol Masuk dengan Google.');
  var p = isi.split('|');
  var email = String(p[0] || '').trim().toLowerCase();
  if (!email || !(Number(p[1]) > Date.now())) return ssoGagal_('Tiket masuk sudah kedaluwarsa. Ulangi dengan tombol Masuk dengan Google.');
  var cache = CacheService.getScriptCache();
  if (cache.get('sso_' + p[2])) return ssoGagal_('Tiket masuk sudah dipakai. Ulangi dengan tombol Masuk dengan Google.');
  cache.put('sso_' + p[2], '1', 600);
  var sim = ssoCariDiSim_(email);
  if (!sim) {
    catat_('Staf', '', email, 'Masuk', 'Google: email belum terdaftar di Data Induk', 'GAGAL');
    return ssoGagal_('Akun Google ' + email + ' belum terdaftar sebagai pengguna aktif di Data Induk. Hubungi admin untuk didaftarkan.');
  }
  pastikanSheetPeran_();
  var u = ssoSelaraskan_(email, sim);
  if (u.peran !== 'Admin' && mtAktif_()) return { sukses: false, maintenance: true, pesan: mtPesan_() };
  try { ssoSelarasEnroll_(email, u); } catch (errEnroll) { catat_('Staf', u.id, u.nama, 'Sinkron enroll', String(errEnroll && errEnroll.message || errEnroll).slice(0, 150), 'GAGAL'); }
  var token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('staf_' + token, u.id, PERAN.DURASI_SESI_DETIK);
  catat_(u.peran, u.id, u.nama, 'Masuk', 'Google', 'OK');
  return { sukses: true, token: token, nama: u.nama, peran: u.peran };
}

// Salin penugasan mapel tutor dari SIM SETARA ke tab Enrollment Tutor (hanya menambah, tidak menghapus).
// Sumber: ENROLL MAPEL (TUTOR = ID TUTOR, AKTIF, STATUS Disetujui). Kelas dan mapel dicocokkan lewat nama
// (mengabaikan awalan 'Kelas' dan tanda kurung), sehingga kelas/mapel lama tetap dipakai.
function ssoSelarasEnroll_(email, u) {
  var ss = simSs_();
  var st = simTab_('TUTOR'), se = simTab_('ENROLL MAPEL'), sr = simTab_('ROMBEL'), sm = simTab_('MAPEL');
  if (!st || !se || !sr || !sm || st.getLastRow() < 2 || se.getLastRow() < 2) return 0;
  var w = st.getDataRange().getValues();
  var tI = ssoIndeks_(w[0], 'ID TUTOR'), tE = ssoIndeks_(w[0], 'EMAIL'), idTutor = '', j;
  for (j = 1; j < w.length; j++) {
    if (tE >= 0 && tI >= 0 && String(w[j][tE]).trim().toLowerCase() === email) { idTutor = String(w[j][tI]).trim(); break; }
  }
  if (!idTutor) return 0;
  var simRombel = {}, simMapel = {}, v;
  v = sr.getDataRange().getValues();
  var rI = ssoIndeks_(v[0], 'ID ROMBEL'), rN = ssoIndeks_(v[0], 'NAMA ROMBEL');
  for (j = 1; j < v.length; j++) simRombel[String(v[j][rI]).trim()] = String(v[j][rN]).trim();
  v = sm.getDataRange().getValues();
  var mK = ssoIndeks_(v[0], 'KODE MAPEL'), mN = ssoIndeks_(v[0], 'NAMA MAPEL');
  for (j = 1; j < v.length; j++) simMapel[String(v[j][mK]).trim()] = String(v[j][mN]).trim();
  var bmRombel = {};
  getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function (r, i) {
    if (i === 0 || !String(r[0]).trim()) return;
    bmRombel[kunciKelas_(r[1])] = String(r[0]).trim();
  });
  var bmMapel = [];
  getSheetData(CONFIG.SHEETS.MAPEL).forEach(function (r, i) {
    if (i === 0 || !String(r[0]).trim()) return;
    bmMapel.push({ id: String(r[0]).trim(), idRombel: String(r[1]).trim(), nama: String(r[2]).trim(), kunci: kunciMapel_(r[2]), baris: i + 1, tutor: String(r[3] || '').trim() });
  });
  var sudah = {};
  bacaEnrollment_().forEach(function (e) { if (e.idPengguna === u.id) sudah[e.idMapel] = true; });
  var baru = [], teks = [];
  var d = se.getDataRange().getValues();
  var eR = ssoIndeks_(d[0], 'ROMBEL'), eM = ssoIndeks_(d[0], 'MAPEL'), eT = ssoIndeks_(d[0], 'TUTOR'), eA = ssoIndeks_(d[0], 'AKTIF'), eS = ssoIndeks_(d[0], 'STATUS');
  for (j = 1; j < d.length; j++) {
    if (String(d[j][eT]).trim() !== idTutor || !ssoAktif_(d[j][eA])) continue;
    if (eS >= 0 && String(d[j][eS]).trim().toLowerCase() !== 'disetujui') continue;
    var namaR = simRombel[String(d[j][eR]).trim()], namaM = simMapel[String(d[j][eM]).trim()];
    if (!namaR || !namaM) continue;
    var idR = bmRombel[kunciKelas_(namaR)];
    if (!idR) continue;
    var km = kunciMapel_(namaM);
    for (var q = 0; q < bmMapel.length; q++) {
      var b = bmMapel[q];
      if (b.idRombel !== idR || b.kunci !== km) continue;
      if (!sudah[b.id]) { sudah[b.id] = true; baru.push([u.id, u.nama, b.id, b.nama, namaR, waktuSekarang_()]); }
      if (normNama_(b.tutor).indexOf(normNama_(u.nama)) < 0) teks.push({ baris: b.baris, nilai: b.tutor ? (b.tutor + ', ' + u.nama) : u.nama });
      break;
    }
  }
  if (!baru.length && !teks.length) return 0;
  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  try {
    if (baru.length) {
      var enr = getSheet(PERAN.SHEET_ENROLLMENT);
      enr.getRange(enr.getLastRow() + 1, 1, baru.length, 6).setValues(baru);
    }
    if (teks.length) {
      var sh = getSheet(CONFIG.SHEETS.MAPEL);
      teks.forEach(function (x) { sh.getRange(x.baris, 4).setValue(x.nilai); });
    }
  } finally {
    kunci.releaseLock();
  }
  return baru.length;
}


// ===== Sinkron otomatis SIM SETARA -> Belajar Mandiri (dijalankan pemicu waktu) =====
function sinkronSimSetara() { jalankanSinkron_(false); }

// Tombol 'Sinkron dengan SIM SETARA' di panel admin: menjalankan sinkron lengkap sekarang juga.
function waAdminSinkronSekarang(token) {
  var adm = wajibAdmin_(token);
  try { ssoSelaraskanSemua_(true); } catch (e) {}
  var h = jalankanSinkron_(true);
  catat_('Admin', adm.id, adm.nama, 'Sinkron manual', h.perubahan.length ? h.perubahan.join(', ') : 'Tidak ada perubahan', 'OK');
  return h;
}

function jalankanSinkron_(manual) {
  var kunci = LockService.getScriptLock();
  if (!kunci.tryLock(manual ? 28000 : 20000)) {
    if (manual) throw new Error('Sinkron lain sedang berjalan. Coba lagi sebentar lagi.');
    return null;
  }
  var ringkas = [];
  try {
    pastikanSheetPeran_();
    var r = rencanaImpor_();
    if (r.kelasBaru.length) {
      var shR = getSheet(CONFIG.SHEETS.ROMBEL);
      var barisR = r.kelasBaru.map(function(k) { return [k.idRombel, k.nama, '', 'Aktif']; });
      var awalR = shR.getLastRow() + 1;
      shR.getRange(awalR, 1, barisR.length, 4).setNumberFormat('@');
      shR.getRange(awalR, 1, barisR.length, 4).setValues(barisR);
      ringkas.push(r.kelasBaru.length + ' kelas baru');
    }
    if (r.mapelBaru.length) {
      var shM = getSheet(CONFIG.SHEETS.MAPEL);
      var barisM = r.mapelBaru.map(function(x) { return [x.idMapel, x.idRombel, x.nama, x.tutor, 'Aktif']; });
      var awalM = shM.getLastRow() + 1;
      shM.getRange(awalM, 1, barisM.length, 5).setNumberFormat('@');
      shM.getRange(awalM, 1, barisM.length, 5).setValues(barisM);
      ringkas.push(r.mapelBaru.length + ' mapel baru');
    }
    var rs = siswaRencana_();
    if (rs.baru.length) {
      var shS = getSheet(CONFIG.SHEETS.SISWA);
      var barisS = rs.baru.map(function(x) { return [x.idRombel, x.nama, x.tgl, '', '', '']; });
      var awalS = shS.getLastRow() + 1;
      shS.getRange(awalS, 1, barisS.length, 6).setNumberFormat('@');
      shS.getRange(awalS, 1, barisS.length, 6).setValues(barisS);
      ringkas.push(barisS.length + ' siswa baru');
    }
    // sinkron dua arah: saling melengkapi kolom kosong (SinkronSiswa.gs)
    try { sinkronSiswaDuaArah_().forEach(function(s) { ringkas.push(s); }); } catch (eS) { ringkas.push('Sinkron dua arah siswa gagal: ' + String(eS && eS.message || eS).slice(0, 120)); }
    var e = sinkronTutorSemua_();
    if (e.pengguna) ringkas.push(e.pengguna + ' akun pengguna baru');
    if (e.nonaktif) ringkas.push(e.nonaktif + ' akun pengguna dinonaktifkan');
    if (e.aktif) ringkas.push(e.aktif + ' akun pengguna diaktifkan lagi');
    if (e.tambah) ringkas.push(e.tambah + ' penugasan ditambah');
    if (e.hapus) ringkas.push(e.hapus + ' penugasan dicabut');
    try { var nGanda = analisaDataGanda(); if (nGanda) ringkas.push(nGanda + ' indikasi data siswa ganda (lihat tab Analisa Ganda)'); } catch (eG) {}
    if (ringkas.length) catat_('Sistem', '', 'Sistem', 'Sinkron Data Induk', ringkas.join(', '), 'OK');
    PropertiesService.getScriptProperties().setProperty('SINKRON_TERAKHIR', waktuSekarang_());
    return { perubahan: ringkas, waktu: waktuSekarang_() };
  } catch (err) {
    try { catat_('Sistem', '', 'Sistem', 'Sinkron Data Induk', String(err && err.message || err).slice(0, 200), 'GAGAL'); } catch (x) {}
    if (manual) throw err;
  } finally {
    kunci.releaseLock();
  }
}

function sinkronTutorSemua_() {
  var out = { pengguna: 0, nonaktif: 0, aktif: 0, tambah: 0, hapus: 0 };
  var ss = simSs_();
  var st = simTab_('TUTOR'), se = simTab_('ENROLL MAPEL'), sr = simTab_('ROMBEL'), sm = simTab_('MAPEL');
  if (!st || !se || !sr || !sm) return out;
  var w = st.getDataRange().getValues();
  var tI = ssoIndeks_(w[0], 'ID TUTOR'), tE = ssoIndeks_(w[0], 'EMAIL'), tA = ssoIndeks_(w[0], 'AKTIF');
  if (tI < 0 || tE < 0) return out;
  // v1.38.5: catat dulu ke Data Induk tutor & penugasan yang terlanjur dibuat langsung di e-learning (sekali jalan)
  try { indukSelarasSemuaSekali_(); w = st.getDataRange().getValues(); } catch (eSekali) {}
  var tutor = {}, emailAktif = {}, emailAda = {}, j;
  // v1.38.5: tutor aktif juga dikenali lewat nomor HP / nama (bukan hanya email)
  var tH = ssoIndeks_(w[0], 'NO HP'), tN = ssoIndeks_(w[0], 'NAMA TUTOR'), hpAktif = {}, namaAktif = {};
  var normHp = function(x) { return String(x || '').replace(/\D/g, '').replace(/^62/, '0'); };
  for (j = 1; j < w.length; j++) {
    if (tA >= 0 && !ssoAktif_(w[j][tA])) continue;
    if (tH >= 0 && normHp(w[j][tH]).length >= 9) hpAktif[normHp(w[j][tH])] = true;
    if (tN >= 0 && String(w[j][tN]).trim()) namaAktif[normNama_(w[j][tN])] = true;
  }
  for (j = 1; j < w.length; j++) {
    var em = String(w[j][tE]).trim().toLowerCase();
    var idT = String(w[j][tI]).trim();
    if (!em || !idT) continue;
    var ak = tA < 0 ? true : ssoAktif_(w[j][tA]);
    tutor[idT] = { email: em, aktif: ak };
    emailAda[em] = true;
    if (ak) emailAktif[em] = true;
  }
  // akun semua peran di tab PENGGUNA SIM SETARA (Admin, Kepala Sekolah, Koordinator Kurikulum, Tutor)
  var emailPeng = {}, simP = simTab_('PENGGUNA');
  if (simP && simP.getLastRow() > 1) {
    var wp = simP.getDataRange().getValues();
    var pE = ssoIndeks_(wp[0], 'EMAIL'), pA = ssoIndeks_(wp[0], 'AKTIF');
    for (j = 1; j < wp.length; j++) {
      var e2 = pE >= 0 ? String(wp[j][pE]).trim().toLowerCase() : '';
      if (e2 && (pA < 0 || ssoAktif_(wp[j][pA]))) emailPeng[e2] = true;
    }
  }
  var semuaEmail = {};
  Object.keys(emailAktif).forEach(function(k) { semuaEmail[k] = true; });
  Object.keys(emailPeng).forEach(function(k) { semuaEmail[k] = true; });
  // akun: buat / selaraskan yang aktif
  var sebelum = bacaPengguna_().length;
  var emailU = {};
  Object.keys(semuaEmail).forEach(function(em) {
    try {
      var sim = ssoCariDiSim_(em);
      if (!sim) return;
      var u = ssoSelaraskan_(em, sim);
      if (u && u.id) emailU[em] = u;
    } catch (x) {}
  });
  out.pengguna = Math.max(0, bacaPengguna_().length - sebelum);
  // status akun tutor yang ada
  var shP = getSheet(PERAN.SHEET_PENGGUNA);
  var vp = shP.getDataRange().getValues();
  var kelolaId = {};
  function ada_(e) { try { return !!ssoCariDiSim_(e); } catch (x) { return false; } }
  for (j = 1; j < vp.length; j++) {
    var prP = normPeran_(vp[j][2]);
    if (!String(vp[j][1]).trim() || !prP || prP === 'Admin' || prP === 'Superadmin' || prP === 'Front Office' || prP === 'Bendahara') continue;
    var emP = String(vp[j][4]).trim().toLowerCase();
    var idP = sTeks_(vp[j][0]).trim();
    var sahEmail = !!emP && (emailAktif[emP] || ada_(emP));
    // tertaut lewat HP/nama di Data Induk: tetap aktif, tetapi enrollment-nya tidak dikelola sinkron (tidak dihapus)
    var sahLain = !sahEmail && ((emP.indexOf('@') < 0 && hpAktif[normHp(emP)]) || namaAktif[normNama_(vp[j][1])]);
    var sahP = sahEmail || !!sahLain;
    if (sahEmail || !sahLain) kelolaId[idP] = true;
    var stP = String(vp[j][5]).trim() || 'Aktif';
    if (sahP && stP !== 'Aktif') { shP.getRange(j + 1, 6).setValue('Aktif'); out.aktif++; }
    if (!sahP && stP === 'Aktif') { shP.getRange(j + 1, 6).setValue('Nonaktif'); out.nonaktif++; }
  }
  Object.keys(emailU).forEach(function(em) { if (emailAktif[em]) kelolaId[emailU[em].id] = true; });
  // peta SIM
  var v = sr.getDataRange().getValues(), simRombel = {};
  var rI = ssoIndeks_(v[0], 'ID ROMBEL'), rN = ssoIndeks_(v[0], 'NAMA ROMBEL');
  for (j = 1; j < v.length; j++) simRombel[String(v[j][rI]).trim()] = String(v[j][rN]).trim();
  v = sm.getDataRange().getValues();
  var simMapel = {}, mK = ssoIndeks_(v[0], 'KODE MAPEL'), mN = ssoIndeks_(v[0], 'NAMA MAPEL');
  for (j = 1; j < v.length; j++) simMapel[String(v[j][mK]).trim()] = String(v[j][mN]).trim();
  var bmRombel = {}, bmMapel = [];
  getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(rw, i) {
    if (i === 0 || !String(rw[0]).trim()) return;
    var k = kunciKelas_(rw[1]);
    if (!bmRombel[k]) bmRombel[k] = { id: sTeks_(rw[0]).trim(), nama: sTeks_(rw[1]).trim() };
  });
  getSheetData(CONFIG.SHEETS.MAPEL).forEach(function(rw, i) {
    if (i === 0 || !String(rw[0]).trim()) return;
    bmMapel.push({ id: sTeks_(rw[0]).trim(), idRombel: sTeks_(rw[1]).trim(), nama: sTeks_(rw[2]).trim(), kunci: kunciMapel_(rw[2]) });
  });
  // penugasan yang diinginkan
  var d = se.getDataRange().getValues();
  var eR = ssoIndeks_(d[0], 'ROMBEL'), eM = ssoIndeks_(d[0], 'MAPEL'), eT = ssoIndeks_(d[0], 'TUTOR'), eA = ssoIndeks_(d[0], 'AKTIF'), eS = ssoIndeks_(d[0], 'STATUS');
  var ingin = {}, daftarIngin = [];
  for (j = 1; j < d.length; j++) {
    var t = tutor[String(d[j][eT]).trim()];
    if (!t || !t.aktif || !emailU[t.email]) continue;
    if (eA >= 0 && !ssoAktif_(d[j][eA])) continue;
    if (eS >= 0 && String(d[j][eS]).trim().toLowerCase() !== 'disetujui') continue;
    var namaR = simRombel[String(d[j][eR]).trim()], namaM = simMapel[String(d[j][eM]).trim()];
    if (!namaR || !namaM) continue;
    var rb = bmRombel[kunciKelas_(namaR)];
    if (!rb) continue;
    var km = kunciMapel_(namaM);
    for (var q = 0; q < bmMapel.length; q++) {
      if (bmMapel[q].idRombel === rb.id && bmMapel[q].kunci === km) {
        var u2 = emailU[t.email], kk = u2.id + '|' + bmMapel[q].id;
        if (!ingin[kk]) { ingin[kk] = true; daftarIngin.push({ u: u2, m: bmMapel[q], rombel: rb.nama }); }
        break;
      }
    }
  }
  // bandingkan dengan Enrollment
  var shE = getSheet(PERAN.SHEET_ENROLLMENT);
  var ve = shE.getDataRange().getValues();
  var ada = {}, hapusBaris = [], tersentuh = {};
  for (j = 1; j < ve.length; j++) {
    var idU = sTeks_(ve[j][0]).trim(), idM = sTeks_(ve[j][2]).trim();
    if (!idU || !kelolaId[idU]) { continue; }
    var kk2 = idU + '|' + idM;
    if (ingin[kk2] && !ada[kk2]) ada[kk2] = true;
    else { hapusBaris.push(j + 1); tersentuh[idM] = true; }
  }
  for (var h = hapusBaris.length - 1; h >= 0; h--) shE.deleteRow(hapusBaris[h]);
  out.hapus = hapusBaris.length;
  var baru = [];
  daftarIngin.forEach(function(x) {
    if (ada[x.u.id + '|' + x.m.id]) return;
    baru.push([x.u.id, x.u.nama, x.m.id, x.m.nama, x.rombel, waktuSekarang_()]);
    tersentuh[x.m.id] = true;
  });
  if (baru.length) {
    var aw = shE.getLastRow() + 1;
    shE.getRange(aw, 1, baru.length, 6).setNumberFormat('@');
    shE.getRange(aw, 1, baru.length, 6).setValues(baru);
  }
  out.tambah = baru.length;
  // kolom Tutor pada Mapel mengikuti penugasan
  if (Object.keys(tersentuh).length) {
    var penggunaMap = {};
    bacaPengguna_().forEach(function(p) { penggunaMap[p.id] = p; });
    var namaPer = {};
    bacaEnrollment_().forEach(function(en) {
      var p = penggunaMap[en.idPengguna];
      if (!p || p.status !== 'Aktif' || p.peran !== 'Tutor') return;
      (namaPer[en.idMapel] = namaPer[en.idMapel] || []).push(p.nama);
    });
    var shM2 = getSheet(CONFIG.SHEETS.MAPEL), vm = shM2.getDataRange().getValues();
    for (j = 1; j < vm.length; j++) {
      var idm = sTeks_(vm[j][0]).trim();
      if (tersentuh[idm]) shM2.getRange(j + 1, 4).setValue((namaPer[idm] || []).join(', '));
    }
  }
  return out;
}

// Pasang pemicu waktu (setiap 15 menit). Aman dijalankan berulang.
function pasangSinkronOtomatis() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sinkronSimSetara') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sinkronSimSetara').timeBased().everyMinutes(15).create();
}


// ===== Rapikan data Belajar Mandiri agar sesuai SIM SETARA =====
function auditSimSetara() { return rapikanSimCore_(false); }
function rapikanSesuaiSim() { return rapikanSimCore_(true); }

function rapikanSimCore_(terapkan) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    pastikanSheetPeran_();
    var m = bacaMaster_();
    var kelasSah = {}, topikSah = {};
    m.kelas.forEach(function(k) { kelasSah[kunciKelas_(k.nama)] = true; });
    m.topik.forEach(function(t) { topikSah[kunciKelas_(t.kelas) + '|' + kunciMapel_(t.nama)] = true; });

    var shR = getSheet(CONFIG.SHEETS.ROMBEL), shM = getSheet(CONFIG.SHEETS.MAPEL);
    var ss = shR.getParent();
    var vR = shR.getDataRange().getValues(), vM = shM.getDataRange().getValues();
    var vMat = getSheetData(CONFIG.SHEETS.MATERI || 'Materi');
    var vSis = getSheetData(CONFIG.SHEETS.SISWA);

    var materiPerMapel = {};
    vMat.forEach(function(r, i) { if (i === 0) return; var k = sTeks_(r[1]).trim(); if (k) materiPerMapel[k] = (materiPerMapel[k] || 0) + 1; });
    var siswaPerRombel = {};
    vSis.forEach(function(r, i) { if (i === 0) return; var k = sTeks_(r[0]).trim(); if (k && String(r[1]).trim()) siswaPerRombel[k] = (siswaPerRombel[k] || 0) + 1; });

    var rombelKunci = {}, rombelExtra = {}, laporan = [];
    for (var i = 1; i < vR.length; i++) {
      var idR = sTeks_(vR[i][0]).trim(); if (!idR) continue;
      rombelKunci[idR] = kunciKelas_(vR[i][1]);
      if (!kelasSah[rombelKunci[idR]]) rombelExtra[idR] = { baris: i + 1, nama: sTeks_(vR[i][1]).trim() };
    }
    var hapusMapel = [], nonaktifMapel = [], mapelPerRombelExtra = {};
    for (i = 1; i < vM.length; i++) {
      var idM = sTeks_(vM[i][0]).trim(); if (!idM) continue;
      var rid = sTeks_(vM[i][1]).trim();
      var sah = rombelKunci[rid] !== undefined && topikSah[rombelKunci[rid] + '|' + kunciMapel_(vM[i][2])];
      if (sah) continue;
      var jml = materiPerMapel[idM] || 0;
      var alasan = rombelExtra[rid] ? 'Kelas tidak ada di Data Induk' : (rombelKunci[rid] === undefined ? 'Kelas tidak ditemukan' : 'Mapel tidak ada untuk kelas ini di Data Induk');
      if (rombelExtra[rid]) { (mapelPerRombelExtra[rid] = mapelPerRombelExtra[rid] || []).push(jml); }
      if (jml === 0) { hapusMapel.push(i + 1); laporan.push(['Mapel', idM, sTeks_(vM[i][2]), alasan, jml, 'Dihapus']); }
      else { if (sTeks_(vM[i][4]).trim() === 'Aktif') nonaktifMapel.push(i + 1); laporan.push(['Mapel', idM, sTeks_(vM[i][2]), alasan, jml, 'Dinonaktifkan (ada materi)']); }
    }
    var hapusRombel = [], nonaktifRombel = [];
    Object.keys(rombelExtra).forEach(function(id) {
      var adaMateri = (mapelPerRombelExtra[id] || []).some(function(x) { return x > 0; });
      var adaSiswa = (siswaPerRombel[id] || 0) > 0;
      if (!adaMateri && !adaSiswa) { hapusRombel.push(rombelExtra[id].baris); laporan.push(['Kelas', id, rombelExtra[id].nama, 'Tidak ada di Data Induk', 0, 'Dihapus']); }
      else { nonaktifRombel.push(rombelExtra[id].baris); laporan.push(['Kelas', id, rombelExtra[id].nama, 'Tidak ada di Data Induk', (adaSiswa ? siswaPerRombel[id] + ' siswa' : '') , 'Dinonaktifkan (ada data)']); }
    });

    // pengguna tutor yang tidak ada di SIM SETARA
    var st = simTab_('TUTOR');
    var emailAktif = {};
    if (st && st.getLastRow() > 1) {
      var w = st.getDataRange().getValues();
      var tE = ssoIndeks_(w[0], 'EMAIL'), tA = ssoIndeks_(w[0], 'AKTIF');
      for (var j = 1; j < w.length; j++) {
        var em = String(w[j][tE]).trim().toLowerCase();
        if (em && (tA < 0 || ssoAktif_(w[j][tA]))) emailAktif[em] = true;
      }
    }
    var shP = getSheet(PERAN.SHEET_PENGGUNA), vP = shP.getDataRange().getValues();
    var nonaktifTutor = [], idTutorDibuang = {};
    for (i = 1; i < vP.length; i++) {
      if (!String(vP[i][1]).trim() || normPeran_(vP[i][2]) !== 'Tutor') continue;
      var emP = String(vP[i][4]).trim().toLowerCase();
      if (emP && emailAktif[emP]) continue;
      idTutorDibuang[sTeks_(vP[i][0]).trim()] = true;
      if ((String(vP[i][5]).trim() || 'Aktif') === 'Aktif') nonaktifTutor.push(i + 1);
      laporan.push(['Tutor', sTeks_(vP[i][0]).trim(), sTeks_(vP[i][1]), emP ? 'Email tidak aktif di Data Induk' : 'Tidak punya email / tidak ada di Data Induk', '', 'Dinonaktifkan']);
    }
    var shE = getSheet(PERAN.SHEET_ENROLLMENT), vE = shE.getDataRange().getValues(), hapusEnroll = [];
    for (i = 1; i < vE.length; i++) { if (idTutorDibuang[sTeks_(vE[i][0]).trim()]) hapusEnroll.push(i + 1); }
    if (hapusEnroll.length) laporan.push(['Penugasan', '', hapusEnroll.length + ' baris', 'Milik tutor yang tidak ada di Data Induk', '', 'Dihapus']);

    // laporan
    var nl = 'Audit SIM', sh = ss.getSheetByName(nl) || ss.insertSheet(nl);
    sh.clear();
    var isi = [['Jenis', 'ID', 'Nama', 'Alasan', 'Materi/Data', 'Tindakan']].concat(laporan.length ? laporan : [['-', '', 'Semua sudah sesuai Data Induk', '', '', '']]);
    sh.getRange(1, 1, isi.length, 6).setNumberFormat('@').setValues(isi);
    sh.getRange(isi.length + 2, 1).setValue((terapkan ? 'DITERAPKAN ' : 'PRATINJAU (belum diubah) ') + waktuSekarang_());

    if (terapkan && laporan.length) {
      ss.copy('Cadangan sebelum rapikan SIM ' + waktuSekarang_());
      var hapus = function(sheet, baris) { baris.sort(function(a, b) { return b - a; }).forEach(function(b) { sheet.deleteRow(b); }); };
      nonaktifMapel.forEach(function(b) { shM.getRange(b, 5).setValue('Nonaktif'); });
      nonaktifRombel.forEach(function(b) { shR.getRange(b, 4).setValue('Nonaktif'); });
      nonaktifTutor.forEach(function(b) { shP.getRange(b, 6).setValue('Nonaktif'); });
      hapus(shE, hapusEnroll);
      hapus(shM, hapusMapel);
      hapus(shR, hapusRombel);
      catat_('Sistem', '', 'Sistem', 'Rapikan sesuai Data Induk', hapusMapel.length + ' mapel dan ' + hapusRombel.length + ' kelas dihapus; ' + (nonaktifMapel.length + nonaktifRombel.length) + ' dinonaktifkan; ' + nonaktifTutor.length + ' tutor dinonaktifkan', 'OK');
    }
    return { hapusMapel: hapusMapel.length, nonaktifMapel: nonaktifMapel.length, hapusRombel: hapusRombel.length, nonaktifRombel: nonaktifRombel.length, nonaktifTutor: nonaktifTutor.length, hapusEnroll: hapusEnroll.length };
  } finally {
    kunci.releaseLock();
  }
}


// ---------- Siswa per Rombel (Admin, Kepala Sekolah, Tutor) ----------
// Admin: semua rombel aktif. Kepala Sekolah/Tutor: hanya rombel dari mapel yang mereka ampu (enrollment).
function waStafRombelSiswa(token) {
  var p = stafDariToken_(token);
  var boleh = null;
  // v1.39.1: pimpinan (Kepala Sekolah, Koordinator, Superadmin; Dinas = Kepala Sekolah khusus-baca) melihat semua rombel
  if (['Admin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Superadmin'].indexOf(p.peran) < 0) {
    boleh = {};
    bacaEnrollment_().forEach(function(e) { if (e.idPengguna === p.id) boleh[e.idMapel] = true; });
  }
  var rom = {}, urut = [];
  mapelAktifSemua_().forEach(function(m) {
    if (boleh && !boleh[m.idMapel]) return;
    if (!rom[m.idRombel]) { rom[m.idRombel] = { idRombel: m.idRombel, namaRombel: m.namaRombel, mapel: [], siswa: [] }; urut.push(rom[m.idRombel]); }
    rom[m.idRombel].mapel.push(m.namaMapel);
  });
  var tz = Session.getScriptTimeZone() || 'GMT+7';
  var tgl = function(x, pola) {
    if (Object.prototype.toString.call(x) === '[object Date]' && !isNaN(x.getTime())) return Utilities.formatDate(x, tz, pola);
    return String(x === null || x === undefined ? '' : x).trim();
  };
  var v = getSheetData(CONFIG.SHEETS.SISWA), stPin = {};
  try { stPin = pinStatusDaftar_(); } catch (eP) {}
  for (var i = 1; i < v.length; i++) {
    var r = v[i], id = String(r[0] === null || r[0] === undefined ? '' : r[0]).trim();
    if (!rom[id] || !String(r[1]).trim()) continue;
    rom[id].siswa.push({ nama: String(r[1]).trim(), lahir: tgl(r[2], 'dd-MM-yyyy'), kontak: String(r[4] === null || r[4] === undefined ? '' : r[4]).trim(), daftar: tgl(r[5], 'dd-MM-yyyy'),
      pin: stPin[pinKunci_(r[1], formatTanggalUntukBanding_(r[2]))] || 'Belum' });
  }
  urut.forEach(function(r) { r.siswa.sort(function(a, b) { return a.nama.localeCompare(b.nama); }); r.mapel.sort(); });
  urut.sort(function(a, b) { return a.namaRombel.localeCompare(b.namaRombel); });
  return urut;
}
