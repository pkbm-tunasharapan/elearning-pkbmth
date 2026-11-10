// ============================================================================
// BUKA SUSULAN MASSAL (v1.37.0)
// ----------------------------------------------------------------------------
// Admin membuka SEKALIGUS semua absensi, diskusi, dan ujian yang sudah terlewat,
// agar siswa bisa memperbaiki yang tertinggal. Durasi bebas (sampai tanggal/jam tertentu).
//
// Cara kerja (tanpa menulis ribuan baris "Buka Sesi"):
//  - Absensi, diskusi, dan ujian per sesi memakai gerbang taAdaBuka_ (TahunAjaran.gs).
//    Selama masa susulan aktif, gerbang itu menganggap sesi yang SUDAH BERAKHIR SEBELUM
//    masa susulan dimulai sebagai "dibuka" untuk siswa di rombel cakupan.
//  - Ujian terjadwal (Jadwal Ujian, UTS/UAS terpusat mode APK) memakai baris "Akses Ujian"
//    berjenis Susulan, sama seperti alur susulan yang sudah ada, untuk siswa yang belum
//    punya hasil. Saat masa susulan diakhiri, akses yang belum dipakai dicabut.
// Konfigurasi di Script Property TA_SUSULAN_MASSAL (satu masa susulan pada satu waktu).
// ============================================================================

var SSM = {
  PROP: 'TA_SUSULAN_MASSAL',
  MAKS_HARI: 60,
  AWALAN: 'SUSULAN-MASSAL-'
};

var SSM_MEMO_ = { cfg: undefined, mapelRombel: null };

function ssmBaca_() {
  if (SSM_MEMO_.cfg !== undefined) return SSM_MEMO_.cfg;
  var s = null;
  try { s = JSON.parse(PropertiesService.getScriptProperties().getProperty(SSM.PROP) || 'null'); } catch (e) { s = null; }
  SSM_MEMO_.cfg = s;
  return s;
}
function ssmSimpan_(s) {
  PropertiesService.getScriptProperties().setProperty(SSM.PROP, JSON.stringify(s));
  SSM_MEMO_.cfg = s;
}
function ssmAktif_(nowMs) {
  var s = ssmBaca_();
  if (!s || s.diakhiri || !(nowMs >= s.dariMs && nowMs <= s.sampaiMs)) return null;
  return s;
}
// ID Mapel e-learning -> ID Rombel e-learning
function ssmRombelMapel_(idMapel) {
  if (!SSM_MEMO_.mapelRombel) {
    var peta = {};
    getSheetData(CONFIG.SHEETS.MAPEL).forEach(function(r, i) { if (i > 0 && String(r[0]).trim()) peta[sTeks_(r[0]).trim()] = sTeks_(r[1]).trim(); });
    SSM_MEMO_.mapelRombel = peta;
  }
  return SSM_MEMO_.mapelRombel[String(idMapel)] || '';
}
function ssmRombelMasuk_(s, idRombel) {
  return !s.rombel || !s.rombel.length || s.rombel.indexOf(String(idRombel)) >= 0;
}

// Dipanggil taAdaBuka_: objek "buka" semu bila sesi ini tercakup masa susulan, selain itu null.
function ssmBuka_(idMapel, namaSesi, nowMs) {
  var s = ssmAktif_(nowMs);
  if (!s) return null;
  if (!ssmRombelMasuk_(s, ssmRombelMapel_(idMapel))) return null;
  var cfg = taBaca_(), p = taParse_(cfg, namaSesi);
  if (!p) return null;
  var info = taInfo_(cfg, p.smt, p.n, nowMs);
  if (info.selesaiMs > s.dariMs) return null;   // hanya sesi yang sudah berakhir saat masa susulan dibuka
  return { sumber: 'susulan', id: s.id, berlakuMs: s.sampaiMs, oleh: s.oleh, alasan: s.alasan, sesi: info.nama };
}

// Dipanggil taDibukaUntuk_: tambahkan semua sesi yang tercakup ke peta { namaSesi: true }.
function ssmTandaiDibuka_(idMapel, out, nowMs) {
  var s = ssmAktif_(nowMs);
  if (!s || !ssmRombelMasuk_(s, ssmRombelMapel_(idMapel))) return out;
  taDaftar_(taBaca_(), nowMs).forEach(function(x) { if (x.selesaiMs <= s.dariMs) out[x.nama] = true; });
  return out;
}

function ssmRingkas_(s, nowMs) {
  if (!s) return null;
  var status = s.diakhiri ? 'Diakhiri' : (nowMs > s.sampaiMs ? 'Selesai' : (nowMs < s.dariMs ? 'Menunggu' : 'Aktif'));
  return {
    id: s.id, status: status, aktif: status === 'Aktif', dari: taWaktuTeks_(s.dariMs), sampai: taWaktuTeks_(s.sampaiMs),
    rombel: s.rombel || [], namaRombel: s.namaRombel || [], alasan: s.alasan || '', oleh: s.oleh || '', aksesUjian: s.aksesUjian || 0,
    diakhiri: s.diakhiri ? taWaktuTeks_(s.diakhiri) : '', diakhiriOleh: s.diakhiriOleh || ''
  };
}

function ssmRombelAktif_() {
  var out = [];
  getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(r, i) {
    if (i === 0 || !String(r[0]).trim() || sTeks_(r[3]).trim() !== 'Aktif') return;
    out.push({ id: sTeks_(r[0]).trim(), nama: sTeks_(r[1]).trim() });
  });
  out.sort(function(a, b) { return a.nama.localeCompare(b.nama, 'id', { numeric: true }); });
  return out;
}

// Cabut akses ujian massal yang belum dipakai.
function ssmCabutAkses_(idMassal) {
  var n = 0;
  ujBaca_('AKSES').forEach(function(a) {
    if (a['ID Permohonan'] === idMassal && a['Status'] === 'Terbuka') { ujUbah_('AKSES', a._baris, { 'Status': 'Dicabut' }); n++; }
  });
  return n;
}

// Buat akses susulan untuk ujian terjadwal (mode APK) yang waktu masuknya sudah lewat, bagi siswa tanpa hasil.
function ssmBuatAksesUjian_(s, p, nowMs) {
  var cakup = {};
  ujJadwalSemua_().forEach(function(j) {
    if (j.mode === 'Kertas' || !j.idUjian || !(j.masukSampaiMs > 0) || j.masukSampaiMs > s.dariMs) return;
    var idR = ssmRombelMapel_(j.idMapel);
    if (!idR || !ssmRombelMasuk_(s, idR)) return;
    cakup[j.idUjian] = { j: j, idRombel: idR };
  });
  var idUjian = Object.keys(cakup);
  if (!idUjian.length) return 0;
  var siswa = {};
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (i === 0) return;
    var idR = sTeks_(r[0]).trim(), nm = sTeks_(r[1]).trim();
    if (idR && nm) (siswa[idR] = siswa[idR] || []).push(nm);
  });
  var punyaHasil = {}, punyaAkses = {};
  ujBaca_('HASIL').forEach(function(h) { punyaHasil[h['ID Ujian'] + '|' + h['ID Rombel'] + '|' + normNama_(h['Nama Siswa'])] = true; });
  ujBaca_('AKSES').forEach(function(a) {
    if (a['Status'] === 'Terbuka' && ujMsTeks_(a['Selesai']) > nowMs) punyaAkses[a['ID Ujian'] + '|' + a['ID Rombel'] + '|' + normNama_(a['Nama Siswa'])] = true;
  });
  var tm = ujFmt_(nowMs, 'yyyy-MM-dd HH:mm'), ts = ujFmt_(s.sampaiMs, 'yyyy-MM-dd HH:mm'), kini = ujNow_();
  var baris = [];
  idUjian.forEach(function(id) {
    var c = cakup[id];
    (siswa[c.idRombel] || []).forEach(function(nm) {
      var kunci = id + '|' + c.idRombel + '|' + normNama_(nm);
      if (punyaHasil[kunci] || punyaAkses[kunci]) return;
      var o = { 'ID': generateId_('AKS-'), 'ID Ujian': id, 'ID Rombel': c.idRombel, 'Nama Siswa': nm, 'Jenis': 'Susulan', 'Mulai': tm, 'Selesai': ts,
        'Status': 'Terbuka', 'ID Permohonan': s.id, 'Dibuka Oleh': p.nama, 'Waktu Dibuka': kini, 'Ronde': '' };
      baris.push(UJ.H.AKSES.map(function(h) { return o[h] === undefined ? '' : o[h]; }));
    });
  });
  if (baris.length) {
    var sh = ujTabel_('AKSES'), r0 = sh.getLastRow() + 1;
    sh.getRange(r0, 1, baris.length, UJ.H.AKSES.length).setNumberFormat('@');
    sh.getRange(r0, 1, baris.length, UJ.H.AKSES.length).setValues(baris);
  }
  return baris.length;
}

// ---------- endpoint admin ----------
function waAdminSusulanBaca(token) {
  wajibAdmin_(token);
  var now = new Date().getTime();
  return { masa: ssmRingkas_(ssmBaca_(), now), rombel: ssmRombelAktif_(), maksHari: SSM.MAKS_HARI, sekarang: taWaktuTeks_(now) };
}

// d: { sampai: 'yyyy-MM-dd HH:mm', rombel: [idRombel e-learning] (kosong = semua), alasan }
function waAdminSusulanMulai(token, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  var now = new Date().getTime();
  var sampaiMs = taWaktuMs_(String(d.sampai || '').trim());
  if (!sampaiMs) throw new Error('Tanggal dan jam berakhir tidak valid.');
  if (sampaiMs <= now + 5 * 60000) throw new Error('Waktu berakhir harus setidaknya 5 menit dari sekarang.');
  if (sampaiMs > now + SSM.MAKS_HARI * 86400000) throw new Error('Masa susulan paling lama ' + SSM.MAKS_HARI + ' hari.');
  var semua = ssmRombelAktif_(), nama = {};
  semua.forEach(function(r) { nama[r.id] = r.nama; });
  var rombel = (Array.isArray(d.rombel) ? d.rombel : []).map(function(x) { return String(x).trim(); }).filter(function(x) { return nama[x]; });
  if (rombel.length === semua.length) rombel = [];
  var alasan = String(d.alasan || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    var lama = ssmBaca_();
    if (lama && !lama.diakhiri && now <= lama.sampaiMs) ssmCabutAkses_(lama.id);
    var s = {
      id: SSM.AWALAN + Utilities.formatDate(new Date(now), Session.getScriptTimeZone(), 'yyyyMMddHHmmss'),
      dariMs: now, sampaiMs: sampaiMs, rombel: rombel, namaRombel: rombel.map(function(x) { return nama[x]; }),
      alasan: alasan, oleh: p.nama, aksesUjian: 0, diakhiri: 0
    };
    ssmSimpan_(s);
    s.aksesUjian = ssmBuatAksesUjian_(s, p, now);
    ssmSimpan_(s);
    try {
      catat_(p.peran, '', p.nama, 'Buka susulan massal',
        (rombel.length ? s.namaRombel.join(', ') : 'Semua rombel') + ' · sampai ' + taWaktuTeks_(sampaiMs) + ' · ' + s.aksesUjian + ' akses ujian' + (alasan ? ' · ' + alasan : ''), 'OK');
    } catch (e) {}
    return waAdminSusulanBaca(token);
  } finally {
    kunci.releaseLock();
  }
}

function waAdminSusulanAkhiri(token) {
  var p = wajibAdmin_(token);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    var s = ssmBaca_();
    if (!s || s.diakhiri) throw new Error('Tidak ada masa susulan yang sedang berjalan.');
    var now = new Date().getTime();
    var dicabut = ssmCabutAkses_(s.id);
    s.diakhiri = now; s.diakhiriOleh = p.nama;
    ssmSimpan_(s);
    try { catat_(p.peran, '', p.nama, 'Akhiri susulan massal', s.id + ' · ' + dicabut + ' akses ujian dicabut', 'OK'); } catch (e) {}
    return waAdminSusulanBaca(token);
  } finally {
    kunci.releaseLock();
  }
}
