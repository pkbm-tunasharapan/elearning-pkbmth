// ============================================================
// TAHUN AJARAN, SEMESTER & SESI (meniru mesin sesi Master Control)
// ------------------------------------------------------------
// Aturan (dari Master Control V1, dengan satu perbedaan yang diminta pemilik):
//  - Tahun ajaran mulai pada hari SENIN (default 27 Juli 2026). Dari satu tanggal itu semua tanggal sesi dihitung.
//  - 1 sesi = 7 hari. Mulai Senin pukul JAM_TAYANG (00:01), berakhir Minggu pukul JAM_BATAS (23:59).
//  - 1 tahun = 2 semester x 18 sesi. Tiap semester dimulai dari Sesi 1 (Master Control menomori terus 1-36).
//  - Sesi UTS (default Sesi 9) dan UAS (default Sesi 18) KHUSUS ujian: tidak ada materi/diskusi, dan ujian
//    hanya boleh ditaruh di sesi UTS/UAS.
//  - Siswa hanya melihat sesi yang sudah dimulai. Diskusi/ujian pada sesi yang sudah berakhir TERKUNCI
//    kecuali tutor pengampu membukanya untuk siswa itu dengan alasan tertulis (sheet "Buka Sesi").
// Konfigurasi disimpan di Script Properties (kunci TA_KONFIG). Bila belum pernah diatur, dipakai bawaan di TA.DEFAULT.
// ============================================================

var TA = {
  PROP: 'TA_KONFIG',
  HARI_PER_SESI: 7,
  JUMLAH_SEMESTER: 2,
  DEFAULT: { label: '2026/2027', mulai: '2026-07-27', sesiPerSemester: 18, uts: 9, uas: 18, jamTayang: '00:01', jamBatas: '23:59', masaBukaHari: 7 },
  SHEET_BUKA: 'Buka Sesi',
  HEADERS_BUKA: ['ID', 'Waktu', 'ID Rombel', 'Nama Siswa', 'ID Mapel', 'Semester', 'Sesi', 'Alasan', 'Dibuka Oleh', 'Berlaku Sampai', 'Dicabut'],
  MIN_ALASAN: 15,
  MAKS_ALASAN: 300,
  TOLERANSI_KIRIM_MENIT: 30,
  BULAN: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
};

var TA_MEMO_ = null;

// ---------- konfigurasi ----------
function taBaca_() {
  if (TA_MEMO_) return TA_MEMO_;
  var cfg = {}, k;
  for (k in TA.DEFAULT) cfg[k] = TA.DEFAULT[k];
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(TA.PROP);
    if (raw) {
      var j = JSON.parse(raw);
      for (k in TA.DEFAULT) if (j[k] !== undefined && j[k] !== null && j[k] !== '') cfg[k] = j[k];
    }
  } catch (e) {}
  cfg.sesiPerSemester = parseInt(cfg.sesiPerSemester, 10) || TA.DEFAULT.sesiPerSemester;
  cfg.uts = parseInt(cfg.uts, 10) || TA.DEFAULT.uts;
  cfg.uas = parseInt(cfg.uas, 10) || TA.DEFAULT.uas;
  cfg.masaBukaHari = parseInt(cfg.masaBukaHari, 10) || TA.DEFAULT.masaBukaHari;
  cfg.jumlahSemester = TA.JUMLAH_SEMESTER;
  TA_MEMO_ = cfg;
  return cfg;
}

// ---------- tanggal ----------
// Sengaja tidak memakai new Date('yyyy-MM-dd'): bentuk itu dibaca sebagai UTC dan di zona WIB tanggalnya mundur sehari.
function taTgl_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return null;
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

function taJam_(hhmm) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  var h = Number(m[1]), mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return [h, mm];
}

function taIso_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function taTeksTgl_(d) { return d.getDate() + ' ' + TA.BULAN[d.getMonth()] + ' ' + d.getFullYear(); }

function taTeksRentang_(a, b) {
  var awal = a.getDate() + ' ' + TA.BULAN[a.getMonth()];
  if (a.getFullYear() !== b.getFullYear()) awal += ' ' + a.getFullYear();
  return awal + ' – ' + taTeksTgl_(b);
}

// ---------- sesi ----------
function taNama_(smt, n) { return 'Semester ' + smt + ' - Sesi ' + n; }

function taJenis_(cfg, n) { return n === cfg.uts ? 'UTS' : (n === cfg.uas ? 'UAS' : 'Biasa'); }

// Teks sesi di sheet -> { smt, n } atau null. Bentuk baku: "Semester 1 - Sesi 3".
// Bentuk lama "Sesi N" tetap dikenali (N > sesi per semester dibaca berurutan seperti Master Control).
function taParse_(cfg, teks) {
  var t = String(teks === null || teks === undefined ? '' : teks).trim();
  var m = /^semester\s*(\d+)\s*[-–·]\s*sesi\s*(\d+)$/i.exec(t);
  var smt, n;
  if (m) { smt = Number(m[1]); n = Number(m[2]); }
  else {
    m = /^sesi\s*(\d+)$/i.exec(t);
    if (!m) return null;
    var x = Number(m[1]);
    if (x < 1) return null;
    smt = Math.floor((x - 1) / cfg.sesiPerSemester) + 1;
    n = ((x - 1) % cfg.sesiPerSemester) + 1;
  }
  if (smt < 1 || smt > cfg.jumlahSemester || n < 1 || n > cfg.sesiPerSemester) return null;
  return { smt: smt, n: n };
}

function taRentang_(cfg, smt, n) {
  var g = (smt - 1) * cfg.sesiPerSemester + (n - 1);
  var awal = taTgl_(cfg.mulai);
  var jt = taJam_(cfg.jamTayang) || [0, 1];
  var jb = taJam_(cfg.jamBatas) || [23, 59];
  var mulai = new Date(awal.getFullYear(), awal.getMonth(), awal.getDate() + g * TA.HARI_PER_SESI, jt[0], jt[1], 0, 0);
  var selesai = new Date(awal.getFullYear(), awal.getMonth(), awal.getDate() + g * TA.HARI_PER_SESI + (TA.HARI_PER_SESI - 1), jb[0], jb[1], 59, 0);
  return { mulai: mulai, selesai: selesai, mulaiMs: mulai.getTime(), selesaiMs: selesai.getTime() };
}

// Ringkasan satu sesi untuk dikirim ke browser (tanpa objek Date).
function taInfo_(cfg, smt, n, nowMs) {
  var r = taRentang_(cfg, smt, n);
  var jenis = taJenis_(cfg, n);
  var status = nowMs < r.mulaiMs ? 'mendatang' : (nowMs > r.selesaiMs ? 'lewat' : 'berjalan');
  var label = 'Semester ' + smt + ' · Sesi ' + n + ' · ' + taTeksRentang_(r.mulai, r.selesai) + (jenis !== 'Biasa' ? ' · ' + jenis : '');
  return {
    nama: taNama_(smt, n), smt: smt, n: n, jenis: jenis, status: status,
    mulaiIso: taIso_(r.mulai), selesaiIso: taIso_(r.selesai), mulaiMs: r.mulaiMs, selesaiMs: r.selesaiMs,
    rentang: taTeksRentang_(r.mulai, r.selesai), label: label
  };
}

function taDaftar_(cfg, nowMs) {
  var out = [];
  for (var s = 1; s <= cfg.jumlahSemester; s++) {
    for (var n = 1; n <= cfg.sesiPerSemester; n++) out.push(taInfo_(cfg, s, n, nowMs));
  }
  return out;
}

function taPaket_(cfg, nowMs) {
  var daftar = taDaftar_(cfg, nowMs);
  var kini = null, depan = null, akhir = daftar[daftar.length - 1];
  for (var i = 0; i < daftar.length; i++) {
    if (daftar[i].status === 'berjalan') { kini = daftar[i]; break; }
    if (daftar[i].status === 'mendatang' && !depan) depan = daftar[i];
  }
  var awal = taTgl_(cfg.mulai);
  var tahunAkhir = new Date(daftar[daftar.length - 1].selesaiMs);
  return {
    label: cfg.label, mulai: cfg.mulai, sesiPerSemester: cfg.sesiPerSemester, jumlahSemester: cfg.jumlahSemester,
    uts: cfg.uts, uas: cfg.uas, jamTayang: cfg.jamTayang, jamBatas: cfg.jamBatas, masaBukaHari: cfg.masaBukaHari,
    rentangTahun: taTeksTgl_(awal) + ' – ' + taTeksTgl_(tahunAkhir),
    sekarang: kini ? kini.nama : '', terdekat: (kini || depan || akhir).nama,
    sesi: daftar
  };
}

// ---------- validasi untuk simpan materi/diskusi/ujian ----------
// Mengembalikan teks sesi baku, atau melempar galat bila sesi tidak sah / jenis tidak cocok dengan jenis sesi.
function taValidasiSesiItem_(jenis, sesiTeks) {
  var cfg = taBaca_();
  var p = taParse_(cfg, sesiTeks);
  if (!p) throw new Error('Pilih sesi dari daftar (Semester dan nomor sesi).');
  var js = taJenis_(cfg, p.n);
  if (jenis === 'Ujian' && js === 'Biasa') {
    throw new Error('Ujian hanya bisa ditempatkan pada sesi UTS (Sesi ' + cfg.uts + ') atau UAS (Sesi ' + cfg.uas + ').');
  }
  if (jenis !== 'Ujian' && js !== 'Biasa') {
    throw new Error('Sesi ' + js + ' khusus ujian. Materi dan diskusi tidak dibuat pada sesi ini.');
  }
  return taNama_(p.smt, p.n);
}

// ---------- sisi siswa ----------
// Menyaring daftar materi aktif: sesi yang belum dimulai disembunyikan; sisanya diberi label baku dan penanda kunci.
function taFilterMateriSiswa_(daftar) {
  var cfg = taBaca_();
  var nowMs = new Date().getTime();
  var urut = [];
  (daftar || []).forEach(function(m, idx) {
    var p = taParse_(cfg, m.sesi);
    if (!p) { urut.push({ m: m, smt: 99, n: 999, idx: idx }); return; }
    var info = taInfo_(cfg, p.smt, p.n, nowMs);
    if (info.status === 'mendatang') return;
    var salin = {};
    Object.keys(m).forEach(function(k) { salin[k] = m[k]; });
    salin.sesiKey = info.nama;
    salin.sesi = info.label + (info.status === 'berjalan' ? ' · berjalan' : ' · berakhir');
    salin.jenisSesi = info.jenis;
    salin.sesiBerakhirMs = info.selesaiMs;
    salin.terkunciSesi = (m.jenis === 'Diskusi' || m.jenis === 'Ujian') && info.status === 'lewat';
    if (m.jenis === 'Diskusi' || m.jenis === 'Ujian') salin.batasWaktu = taIso_(new Date(info.selesaiMs)) + ' 23:59';
    urut.push({ m: salin, smt: p.smt, n: p.n, idx: idx });
  });
  urut.sort(function(a, b) { return (a.smt - b.smt) || (a.n - b.n) || (a.idx - b.idx); });
  return urut.map(function(x) { return x.m; });
}

function taSheetBuka_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TA.SHEET_BUKA);
  if (!sh) {
    sh = ss.insertSheet(TA.SHEET_BUKA);
    sh.getRange(1, 1, 1, TA.HEADERS_BUKA.length).setValues([TA.HEADERS_BUKA]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function taWaktuTeks_(ms) { return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }

function taWaktuMs_(v) {
  if (v instanceof Date) return v.getTime();
  var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(v || '').trim());
  if (!m) return 0;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime();
}

function taBacaBuka_() {
  var sh = taSheetBuka_();
  var v = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (!String(r[0] || '').trim()) continue;
    out.push({
      baris: i + 1, id: String(r[0]), waktu: String(r[1] instanceof Date ? taWaktuTeks_(r[1].getTime()) : r[1]),
      idRombel: String(r[2] || ''), nama: String(r[3] || ''), idMapel: String(r[4] || ''),
      sesi: taNama_(Number(r[5]) || 1, Number(r[6]) || 1), alasan: String(r[7] || ''), oleh: String(r[8] || ''),
      berlakuMs: taWaktuMs_(r[9]), dicabut: !!String(r[10] || '').trim()
    });
  }
  return out;
}

function taAdaBuka_(idMapel, nama, namaSesi, nowMs) {
  var kunciNama = normNama_(nama);
  var daftar = taBacaBuka_();
  for (var i = 0; i < daftar.length; i++) {
    var b = daftar[i];
    if (b.idMapel === String(idMapel) && normNama_(b.nama) === kunciNama && b.sesi === namaSesi && !b.dicabut && b.berlakuMs > nowMs) return b;
  }
  // v1.37: masa susulan massal dari admin (SusulanMassal.gs)
  try { return ssmBuka_(idMapel, namaSesi, nowMs); } catch (e) { return null; }
}

// { "Semester 1 - Sesi 3": true, ... } untuk siswa ini pada mapel ini (dipakai klien untuk membuka kunci tampilan).
function taDibukaUntuk_(idMapel, nama) {
  var out = {};
  try {
    var kunciNama = normNama_(nama), now = new Date().getTime();
    taBacaBuka_().forEach(function(b) {
      if (b.idMapel === String(idMapel) && normNama_(b.nama) === kunciNama && !b.dicabut && b.berlakuMs > now) out[b.sesi] = true;
    });
  } catch (e) {}
  try { ssmTandaiDibuka_(idMapel, out, new Date().getTime()); } catch (e2) {}
  return out;
}

// Gerbang sisi server untuk diskusi/ujian. Mengembalikan '' bila boleh, selain itu pesan untuk siswa.
// toleransiMenit: kelonggaran setelah sesi berakhir (dipakai saat MENGIRIM ujian yang sudah dimulai tepat waktu).
function taGerbang_(idMapel, idMateri, nama, toleransiMenit) {
  var found = null;
  try { found = getMateriById_(idMateri); } catch (e) { found = null; }
  if (!found) return '';
  var c = found.cols, row = found.row;
  if (String(row[c.idMapel - 1]) !== String(idMapel)) return '';
  var jenis = String(row[c.jenis - 1] || '').trim();
  if (jenis !== 'Diskusi' && jenis !== 'Ujian') return '';
  var cfg = taBaca_();
  var p = taParse_(cfg, row[c.sesi - 1]);
  if (!p) return '';
  var now = new Date().getTime();
  var info = taInfo_(cfg, p.smt, p.n, now);
  if (now < info.mulaiMs) return 'Sesi ini belum dibuka. Dibuka pada ' + info.mulaiIso.split('-').reverse().join('/') + '.';
  if (now <= info.selesaiMs + (toleransiMenit || 0) * 60000) return '';
  if (taAdaBuka_(idMapel, nama, info.nama, now)) return '';
  return 'Sesi ini sudah berakhir pada ' + info.selesaiIso.split('-').reverse().join('/') + ', jadi pengerjaan ditutup. ' +
    'Bila Anda berhalangan, minta tutor pengampu untuk membukakan sesi ini.';
}

// ---------- endpoint staf ----------
function waStafSesiDaftar(token) {
  stafDariToken_(token);
  return taPaket_(taBaca_(), new Date().getTime());
}

function waAdminTaBaca(token) {
  wajibAdmin_(token);
  return taPaket_(taBaca_(), new Date().getTime());
}

function waAdminTaSimpan(token, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  var label = String(d.label === undefined || d.label === null ? '' : d.label).trim();
  if (!/^[0-9A-Za-z\/\- ]{3,30}$/.test(label)) throw new Error('Nama tahun ajaran 3-30 karakter, mis. 2026/2027.');
  var tgl = taTgl_(d.mulai);
  if (!tgl) throw new Error('Tanggal mulai tidak valid.');
  if (tgl.getDay() !== 1) throw new Error('Tanggal mulai harus hari Senin (awal pekan), supaya sesi berjalan Senin sampai Minggu.');
  var per = parseInt(d.sesiPerSemester, 10);
  if (!(per >= 4 && per <= 30)) throw new Error('Jumlah sesi per semester antara 4 dan 30.');
  var uts = parseInt(d.uts, 10), uas = parseInt(d.uas, 10);
  if (!(uts >= 1 && uts <= per) || !(uas >= 1 && uas <= per)) throw new Error('Sesi UTS dan UAS harus berada di antara 1 dan ' + per + '.');
  if (uts === uas) throw new Error('Sesi UTS dan UAS tidak boleh sama.');
  var jt = taJam_(d.jamTayang), jb = taJam_(d.jamBatas);
  if (!jt || !jb) throw new Error('Jam tayang dan jam batas harus berformat HH:MM.');
  var masa = parseInt(d.masaBukaHari, 10);
  if (!(masa >= 1 && masa <= 30)) throw new Error('Lama sesi yang dibuka tutor antara 1 dan 30 hari.');
  var simpan = {
    label: label, mulai: taIso_(tgl), sesiPerSemester: per, uts: uts, uas: uas,
    jamTayang: ('0' + jt[0]).slice(-2) + ':' + ('0' + jt[1]).slice(-2), jamBatas: ('0' + jb[0]).slice(-2) + ':' + ('0' + jb[1]).slice(-2), masaBukaHari: masa
  };
  PropertiesService.getScriptProperties().setProperty(TA.PROP, JSON.stringify(simpan));
  TA_MEMO_ = null;
  try { catat_(p.peran, '', p.nama, 'Atur tahun ajaran', simpan.label + ', mulai ' + simpan.mulai + ', ' + per + ' sesi/semester, UTS ' + uts + ', UAS ' + uas, 'OK'); } catch (e) {}
  return taPaket_(taBaca_(), new Date().getTime());
}

function taSiswaMapel_(ctx) {
  var v = getSheetData(CONFIG.SHEETS.SISWA);
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][0]).trim() !== ctx.m.idRombel) continue;
    var n = sTeks_(v[i][1]).trim();
    if (n) out.push(n);
  }
  out.sort();
  return out;
}

function taTugasPerSesi_(idMapel) {
  var m = kmMateri_();
  var v = m.sheet.getDataRange().getValues();
  var cfg = taBaca_(), peta = {};
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][m.c.idMapel - 1]).trim() !== String(idMapel)) continue;
    var jenis = sTeks_(v[i][m.c.jenis - 1]).trim();
    if (jenis !== 'Diskusi' && jenis !== 'Ujian') continue;
    if (sTeks_(v[i][m.c.status - 1]).trim() !== 'Aktif') continue;
    var p = taParse_(cfg, v[i][m.c.sesi - 1]);
    if (p) peta[taNama_(p.smt, p.n)] = true;
  }
  return peta;
}

function taRingkasBuka_(idMapel, nowMs) {
  var out = [];
  taBacaBuka_().forEach(function(b) {
    if (b.idMapel !== String(idMapel)) return;
    out.push({ id: b.id, waktu: b.waktu, nama: b.nama, sesi: b.sesi, alasan: b.alasan, oleh: b.oleh,
      berlaku: taWaktuTeks_(b.berlakuMs), status: b.dicabut ? 'Dicabut' : (b.berlakuMs > nowMs ? 'Aktif' : 'Kedaluwarsa') });
  });
  out.reverse();
  return out.slice(0, 60);
}

function waStafBukaSesiDaftar(token, idMapel) {
  var ctx = wajibMapel_(token, idMapel);
  var cfg = taBaca_(), now = new Date().getTime();
  var tugas = taTugasPerSesi_(idMapel);
  var lewat = taDaftar_(cfg, now).filter(function(s) { return s.status === 'lewat' && tugas[s.nama]; }).reverse();
  return {
    mapel: ctx.m.namaMapel, rombel: ctx.m.namaRombel, masaBukaHari: cfg.masaBukaHari, minAlasan: TA.MIN_ALASAN,
    siswa: taSiswaMapel_(ctx), sesi: lewat, riwayat: taRingkasBuka_(idMapel, now)
  };
}

function waStafBukaSesi(token, idMapel, nama, namaSesi, alasan) {
  var ctx = wajibMapel_(token, idMapel);
  var cfg = taBaca_();
  var now = new Date().getTime();
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var siswa = null;
    taSiswaMapel_(ctx).forEach(function(s) { if (normNama_(s) === normNama_(nama)) siswa = s; });
    if (!siswa) throw new Error('Siswa tidak ditemukan di kelas ini.');
    var p = taParse_(cfg, namaSesi);
    if (!p) throw new Error('Sesi tidak dikenal.');
    var info = taInfo_(cfg, p.smt, p.n, now);
    if (info.status !== 'lewat') throw new Error(info.status === 'berjalan' ? 'Sesi ini masih berjalan, siswa masih bisa mengerjakan.' : 'Sesi ini belum dimulai.');
    if (!taTugasPerSesi_(idMapel)[info.nama]) throw new Error('Sesi ini tidak memiliki diskusi/ujian aktif untuk mapel ini.');
    var alasanBersih = kmBersih_(alasan, TA.MAKS_ALASAN).replace(/\s+/g, ' ').trim();
    if (alasanBersih.length < TA.MIN_ALASAN) throw new Error('Tulis alasan yang jelas (minimal ' + TA.MIN_ALASAN + ' karakter), misalnya siswa sakit atau kendala jaringan, karena akan tercatat.');
    var ada = taAdaBuka_(idMapel, siswa, info.nama, now);
    if (ada) throw new Error('Sesi ini sudah dibuka untuk ' + siswa + ' sampai ' + taWaktuTeks_(ada.berlakuMs) + '.');
    var berlaku = now + cfg.masaBukaHari * 24 * 3600 * 1000;
    taSheetBuka_().appendRow([
      generateId_('BKS-'), taWaktuTeks_(now), ctx.m.idRombel, siswa, String(idMapel), p.smt, p.n,
      alasanBersih, ctx.p.nama, taWaktuTeks_(berlaku), ''
    ]);
    kmCatat_(ctx.p, idMapel, 'Buka sesi siswa', siswa + ' · ' + info.nama + ' · ' + alasanBersih, 'OK');
    return { riwayat: taRingkasBuka_(idMapel, now), berlaku: taWaktuTeks_(berlaku) };
  } finally {
    kunci.releaseLock();
  }
}

function waStafBukaSesiCabut(token, idMapel, idBuka) {
  var ctx = wajibMapel_(token, idMapel);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var daftar = taBacaBuka_();
    for (var i = 0; i < daftar.length; i++) {
      var b = daftar[i];
      if (b.id !== String(idBuka)) continue;
      if (b.idMapel !== String(idMapel)) throw new Error('Catatan ini bukan milik mapel yang dipilih.');
      taSheetBuka_().getRange(b.baris, TA.HEADERS_BUKA.length).setValue('Dicabut ' + taWaktuTeks_(new Date().getTime()) + ' oleh ' + ctx.p.nama);
      kmCatat_(ctx.p, idMapel, 'Cabut buka sesi', b.nama + ' · ' + b.sesi, 'OK');
      return { riwayat: taRingkasBuka_(idMapel, new Date().getTime()) };
    }
    throw new Error('Catatan tidak ditemukan.');
  } finally {
    kunci.releaseLock();
  }
}

// ---------- tahun ajaran baru: naik kelas, arsip data tahun lama, atur ulang ----------
// Alur: pratinjau -> salinan seluruh spreadsheet di Drive -> arsip data tahun lama -> siswa naik/lulus -> materi kembali Draft -> tahun ajaran baru.
// Tidak ada data yang dihapus permanen: yang dipindahkan masuk ke sheet "Arsip ..." dan "Siswa_Lulusan".
function tbSheetArsip_() {
  return [CONFIG.SHEETS.JAWABAN, CONFIG.SHEETS.CHAT, CONFIG.SHEETS.PERCOBAAN_UJIAN,
    UJ.SH.JADWAL, UJ.SH.AJU, UJ.SH.PERM, UJ.SH.AKSES, UJ.SH.HASIL, TA.SHEET_BUKA];
}

function tbBarisIsi_(sh) {
  if (!sh) return 0;
  var lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 2 || lc < 1) return 0;
  return sh.getRange(2, 1, lr - 1, lc).getValues().filter(function(r) { return r.some(function(c) { return String(c) !== ''; }); }).length;
}

function tbRombel_() {
  return getSheetData(CONFIG.SHEETS.ROMBEL).slice(1).map(function(r) {
    return { id: sTeks_(r[0]).trim(), nama: sTeks_(r[1]).trim(), status: sTeks_(r[3]).trim() };
  }).filter(function(r) { return r.id; });
}

// Tujuan bawaan: rombel dengan nama sama tetapi angka akhir +1; tanpa itu = lulus; tanpa angka = tetap.
function tbTujuanBawaan_(rom) {
  var idx = {};
  rom.forEach(function(r) {
    var m = /^(.*?)(\d+)\s*$/.exec(r.nama);
    if (m) idx[m[1].trim().toLowerCase() + '|' + parseInt(m[2], 10)] = r.id;
  });
  var out = {};
  rom.forEach(function(r) {
    var m = /^(.*?)(\d+)\s*$/.exec(r.nama);
    if (!m) { out[r.id] = 'TETAP'; return; }
    out[r.id] = idx[m[1].trim().toLowerCase() + '|' + (parseInt(m[2], 10) + 1)] || 'LULUS';
  });
  return out;
}

function waStafTahunBaruPratinjau(token) {
  wajibAdmin_(token);
  var cfg = taBaca_();
  var rom = tbRombel_();
  var cnt = {};
  getSheetData(CONFIG.SHEETS.SISWA).slice(1).forEach(function(r) {
    var id = sTeks_(r[0]).trim();
    if (id && sTeks_(r[1]).trim()) cnt[id] = (cnt[id] || 0) + 1;
  });
  var bawaan = tbTujuanBawaan_(rom);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var arsip = tbSheetArsip_().map(function(n) { return { nama: n, baris: tbBarisIsi_(ss.getSheetByName(n)) }; });
  var h = CONFIG.HEADERS.MATERI, iSt = h.indexOf('Status');
  var materi = 0;
  getSheetData(CONFIG.SHEETS.MATERI).slice(1).forEach(function(r) {
    var s = sTeks_(r[iSt]).trim();
    if (s && s !== 'Draft') materi++;
  });
  var saranLabel = cfg.label;
  var mm = /^(\d{4})\s*\/\s*(\d{4})$/.exec(String(cfg.label || ''));
  if (mm) saranLabel = (parseInt(mm[1], 10) + 1) + '/' + (parseInt(mm[2], 10) + 1);
  var saranMulai = cfg.mulai;
  var t = taTgl_(cfg.mulai);
  if (t) { t.setDate(t.getDate() + 364); saranMulai = Utilities.formatDate(t, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
  return {
    labelLama: cfg.label, mulaiLama: cfg.mulai, saranLabel: saranLabel, saranMulai: saranMulai,
    rombel: rom.map(function(r) { return { id: r.id, nama: r.nama, status: r.status, siswa: cnt[r.id] || 0, tujuan: bawaan[r.id] }; }),
    arsip: arsip, materiReset: materi
  };
}

function tbArsipkan_(ss, nama, label) {
  var sh = ss.getSheetByName(nama);
  if (!sh) return 0;
  var lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 2 || lc < 1) return 0;
  var v = sh.getRange(2, 1, lr - 1, lc).getValues().filter(function(r) { return r.some(function(c) { return String(c) !== ''; }); });
  if (!v.length) return 0;
  var namaArsip = ('Arsip ' + String(label).replace(/[\/\\?*\[\]:]/g, '-') + ' ' + nama).slice(0, 99);
  var ar = ss.getSheetByName(namaArsip);
  if (!ar) {
    ar = ss.insertSheet(namaArsip);
    ar.getRange(1, 1, 1, lc).setValues(sh.getRange(1, 1, 1, lc).getValues()).setFontWeight('bold');
    ar.setFrozenRows(1);
  }
  ar.getRange(ar.getLastRow() + 1, 1, v.length, lc).setValues(v);
  sh.getRange(2, 1, lr - 1, lc).clearContent();
  return v.length;
}

function tbPindahSiswa_(ss, peta, labelLama, cap, rom) {
  var sh = ss.getSheetByName(CONFIG.SHEETS.SISWA);
  var lr = sh.getLastRow();
  var lebar = CONFIG.HEADERS.SISWA.length;
  var lc = Math.max(sh.getLastColumn(), lebar);
  var hasil = { naik: 0, lulus: 0, tetap: 0 };
  if (lr < 2) return hasil;
  var namaRombel = {};
  rom.forEach(function(r) { namaRombel[r.id] = r.nama; });
  var v = sh.getRange(2, 1, lr - 1, lc).getValues();
  var baru = [], keluar = [];
  v.forEach(function(r) {
    var id = sTeks_(r[0]).trim(), nama = sTeks_(r[1]).trim();
    if (!id && !nama) return;
    var t = peta[id];
    if (t === 'LULUS') {
      hasil.lulus++;
      keluar.push([labelLama, cap].concat(r.slice(0, lebar)).concat([namaRombel[id] || id]));
      return;
    }
    if (t && t !== 'TETAP' && t !== id) { r[0] = t; hasil.naik++; } else { hasil.tetap++; }
    baru.push(r);
  });
  if (keluar.length) {
    var nm = 'Siswa_Lulusan';
    var ar = ss.getSheetByName(nm);
    var kep = ['Tahun Ajaran', 'Tanggal Arsip'].concat(CONFIG.HEADERS.SISWA).concat(['Kelas Terakhir']);
    if (!ar) { ar = ss.insertSheet(nm); ar.getRange(1, 1, 1, kep.length).setValues([kep]).setFontWeight('bold'); ar.setFrozenRows(1); }
    ar.getRange(ar.getLastRow() + 1, 1, keluar.length, kep.length).setValues(keluar);
  }
  sh.getRange(2, 1, lr - 1, lc).clearContent();
  if (baru.length) sh.getRange(2, 1, baru.length, lc).setValues(baru);
  return hasil;
}

function tbResetMateri_() {
  var m = kmMateri_();
  var lr = m.sheet.getLastRow();
  var h = CONFIG.HEADERS.MATERI;
  var iSt = h.indexOf('Status'), iBw = h.indexOf('Batas Waktu (opsional)');
  if (lr < 2 || iSt < 0) return { draft: 0 };
  var rS = m.sheet.getRange(2, iSt + 1, lr - 1, 1), st = rS.getValues();
  var rB = iBw >= 0 ? m.sheet.getRange(2, iBw + 1, lr - 1, 1) : null, bw = rB ? rB.getValues() : null;
  var ubah = 0;
  st.forEach(function(r, i) {
    var s = sTeks_(r[0]).trim();
    if (s && s !== 'Draft') { r[0] = 'Draft'; ubah++; }
    if (bw && String(bw[i][0]) !== '') bw[i][0] = '';
  });
  rS.setValues(st);
  if (rB) rB.setValues(bw);
  return { draft: ubah };
}

function waStafTahunBaruJalankan(token, rencana) {
  var p = wajibAdmin_(token);
  rencana = rencana || {};
  if (String(rencana.konfirmasi || '').trim().toUpperCase() !== 'NAIK KELAS') throw new Error('Ketik NAIK KELAS pada kotak konfirmasi untuk melanjutkan.');
  var cfg = taBaca_();
  var label = String(rencana.label || '').trim();
  if (!/^[0-9A-Za-z\/\- ]{3,30}$/.test(label)) throw new Error('Nama tahun ajaran 3-30 karakter, mis. 2027/2028.');
  var tgl = taTgl_(rencana.mulai);
  if (!tgl) throw new Error('Tanggal mulai tidak valid.');
  if (tgl.getDay() !== 1) throw new Error('Tanggal mulai harus hari Senin (awal pekan).');
  var rom = tbRombel_();
  var ada = {};
  rom.forEach(function(r) { ada[r.id] = true; });
  var peta = rencana.peta || {};
  Object.keys(peta).forEach(function(k) {
    var t = peta[k];
    if (t !== 'LULUS' && t !== 'TETAP' && !ada[t]) throw new Error('Kelas tujuan tidak dikenal.');
  });
  var kunci = LockService.getScriptLock();
  kunci.waitLock(60000);
  var langkah = 'cadangan', lapor = {};
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var cap = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    var labelLama = cfg.label;
    var salinan = DriveApp.getFileById(ss.getId()).makeCopy('Cadangan sebelum tahun ajaran ' + label + ' (' + cap + ')');
    lapor.cadanganNama = salinan.getName();
    lapor.cadanganUrl = salinan.getUrl();
    if (rencana.arsipData !== false) {
      langkah = 'arsip data tahun lama';
      lapor.arsip = [];
      tbSheetArsip_().forEach(function(n) { lapor.arsip.push({ nama: n, baris: tbArsipkan_(ss, n, labelLama) }); });
    }
    langkah = 'kenaikan kelas siswa';
    lapor.siswa = tbPindahSiswa_(ss, peta, labelLama, cap, rom);
    if (rencana.resetMateri !== false) {
      langkah = 'materi kembali ke Draft';
      lapor.materi = tbResetMateri_();
    }
    langkah = 'pengaturan tahun ajaran';
    waAdminTaSimpan(token, { label: label, mulai: rencana.mulai, sesiPerSemester: cfg.sesiPerSemester, uts: cfg.uts, uas: cfg.uas, jamTayang: cfg.jamTayang, jamBatas: cfg.jamBatas, masaBukaHari: cfg.masaBukaHari });
    try { catat_(p.peran, '', p.nama, 'Tahun ajaran baru', label + ': naik ' + lapor.siswa.naik + ', lulus ' + lapor.siswa.lulus + ', tetap ' + lapor.siswa.tetap, 'OK'); } catch (e) {}
    return { sukses: true, laporan: lapor };
  } catch (err) {
    throw new Error('Proses berhenti pada langkah "' + langkah + '": ' + (err && err.message ? err.message : err) +
      (lapor.cadanganUrl ? ' Salinan cadangan sudah dibuat: ' + lapor.cadanganUrl : ''));
  } finally {
    kunci.releaseLock();
  }
}
