// ============================================================================
// PENILAIAN OTOMATIS & KINERJA TUTOR (aplikasi 1.27)
// - Khusus Admin/Superadmin: jawaban diskusi yang belum dinilai lebih dari N hari (bawaan 7) diberi nilai = KKM,
//   tanpa komentar untuk siswa. Penilai tercatat "Sistem".
// - Keterangan internal ("Waktu penilaian telah habis, sistem telah memberikan nilai otomatis.") disimpan di tab
//   CATATAN NILAI INTERNAL: hanya dibaca KS, Admin, Koordinator, Superadmin, dan tutor pengampu (tidak pernah ke siswa).
// - Kinerja tutor: -1 per diskusi yang diselesaikan sistem, untuk setiap tutor pengampu mapel itu (tab KINERJA TUTOR).
//   Mapel tanpa pengampu: tetap dinilai, poin 0.
// - Bisa dijalankan manual atau otomatis harian (pemicu pemicuOtoNilai).
// ============================================================================
var ON = {
  TAB_KINERJA: 'KINERJA TUTOR',
  HDR_KINERJA: ['ID', 'WAKTU', 'TANGGAL', 'TUTOR', 'ID MAPEL', 'MAPEL', 'ROMBEL', 'ID MATERI', 'JUDUL', 'JUMLAH JAWABAN', 'POIN', 'KETERANGAN', 'DIJALANKAN OLEH'],
  TAB_CATATAN: 'CATATAN NILAI INTERNAL',
  HDR_CATATAN: ['WAKTU', 'ID MAPEL', 'ID MATERI', 'NAMA SISWA', 'NILAI', 'KETERANGAN', 'DINILAI OLEH'],
  KET: 'Waktu penilaian telah habis, sistem telah memberikan nilai otomatis.',
  PENILAI: 'Sistem',
  PROP_HARI: 'OTONILAI_HARI',
  PROP_AKTIF: 'OTONILAI_OTOMATIS',
  PEMICU: 'pemicuOtoNilai',
  JAM_PEMICU: 2,
  PERAN_JALANKAN: ['Admin', 'Superadmin'],
  PERAN_LIHAT: ['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum']
};

function onSheet_(nama, hdr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nama);
  if (!sh) {
    sh = ss.insertSheet(nama);
    sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function onAturan_() {
  var pr = PropertiesService.getScriptProperties();
  var hari = parseInt(pr.getProperty(ON.PROP_HARI), 10);
  var kkm = 75;
  try { kkm = Number((nilAturan_() || {}).kkm) || 75; } catch (e) {}
  return {
    hari: hari >= 1 && hari <= 60 ? hari : 7,
    otomatis: pr.getProperty(ON.PROP_AKTIF) === '1' && ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === ON.PEMICU; }),
    kkm: kkm
  };
}

function onWajib_(token, peran) {
  var p = stafDariToken_(token);
  if (peran.indexOf(p.peran) < 0) throw new Error('Fitur ini hanya untuk ' + peran.join(', ') + '.');
  return p;
}

// Jawaban diskusi yang belum dinilai dan sudah menunggu lebih dari N hari, dikelompokkan per diskusi.
function onKandidat_(hari) {
  var sh = getSheet(CONFIG.SHEETS.JAWABAN);
  var v = sh.getDataRange().getValues();
  var out = { sh: sh, k: null, grup: [], baris: 0 };
  if (v.length < 2) return out;
  var hd = v[0].map(function(x) { return String(x).trim(); });
  var k = {
    mapel: hd.indexOf('ID Mapel'), materi: hd.indexOf('ID Materi'), judul: hd.indexOf('Judul Materi'), jenis: hd.indexOf('Jenis'),
    siswa: hd.indexOf('Nama Siswa'), jawaban: hd.indexOf('Jawaban'), nilai: hd.indexOf('Nilai'), waktu: hd.indexOf('Waktu Kirim'),
    rombel: hd.indexOf('ID Rombel'), penilai: hd.indexOf('Dinilai Oleh'), waktuNilai: hd.indexOf('Waktu Dinilai')
  };
  if (k.mapel < 0 || k.materi < 0 || k.jenis < 0 || k.siswa < 0 || k.jawaban < 0 || k.nilai < 0 || k.waktu < 0) {
    throw new Error('Susunan kolom sheet Jawaban tidak dikenali.');
  }
  out.k = k;
  var batas = Date.now() - hari * 86400000;
  var mapel = {};
  mapelAktifSemua_().forEach(function(m) { mapel[m.idMapel] = m; });
  var grup = {};
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][k.jenis]).trim() !== 'Diskusi') continue;
    if (!sTeks_(v[i][k.jawaban]).trim() || sTeks_(v[i][k.nilai]).trim() !== '') continue;
    var ms = rbMs_(v[i][k.waktu]);
    if (!ms || ms > batas) continue; // waktu kirim tidak jelas atau belum lewat batas: tidak disentuh
    var idM = sTeks_(v[i][k.mapel]).trim();
    if (!mapel[idM]) continue; // mapel tidak aktif
    var idT = sTeks_(v[i][k.materi]).trim(), kunci = idM + '|' + idT;
    var g = grup[kunci];
    if (!g) {
      g = grup[kunci] = {
        idMapel: idM, idMateri: idT, mapel: mapel[idM].namaMapel, rombel: mapel[idM].namaRombel, idRombel: mapel[idM].idRombel,
        judul: k.judul >= 0 ? sTeks_(v[i][k.judul]).trim() : '', baris: [], terlamaMs: ms
      };
      out.grup.push(g);
    }
    g.baris.push({ baris: i + 1, siswa: sTeks_(v[i][k.siswa]).trim(), rombel: k.rombel >= 0 ? sTeks_(v[i][k.rombel]).trim() : g.idRombel });
    if (ms < g.terlamaMs) g.terlamaMs = ms;
    out.baris++;
  }
  var pg = ndPetaPengampu_();
  out.grup.forEach(function(g) { g.tutor = pg[g.idMapel] || []; });
  out.grup.sort(function(a, b) { return a.terlamaMs - b.terlamaMs; });
  return out;
}

function onRingkas_(c) {
  var perTutor = {};
  var diskusi = c.grup.map(function(g) {
    (g.tutor.length ? g.tutor : ['(tanpa pengampu)']).forEach(function(t) {
      var x = perTutor[t] || (perTutor[t] = { tutor: t, diskusi: 0, jawaban: 0, poin: 0 });
      x.diskusi++; x.jawaban += g.baris.length; if (g.tutor.length) x.poin -= 1;
    });
    return {
      idMapel: g.idMapel, idMateri: g.idMateri, mapel: g.mapel, rombel: g.rombel, judul: g.judul, jumlah: g.baris.length,
      tutor: g.tutor, terlama: Utilities.formatDate(new Date(g.terlamaMs), absTz_(), 'yyyy-MM-dd HH:mm')
    };
  });
  return { diskusi: diskusi, perTutor: Object.keys(perTutor).map(function(t) { return perTutor[t]; }).sort(function(a, b) { return a.poin - b.poin; }) };
}

// ---------- API: pratinjau, jalankan, atur ----------
function waAdminOtoNilaiPratinjau(token) {
  onWajib_(token, ON.PERAN_JALANKAN);
  var a = onAturan_();
  var c = onKandidat_(a.hari);
  var r = onRingkas_(c);
  return { hari: a.hari, kkm: a.kkm, otomatis: a.otomatis, jam: ON.JAM_PEMICU, total: c.baris, jumlahDiskusi: c.grup.length, diskusi: r.diskusi, perTutor: r.perTutor, keterangan: ON.KET };
}

function waAdminOtoNilaiJalankan(token) {
  var p = onWajib_(token, ON.PERAN_JALANKAN);
  return onJalankan_(p.nama + ' (' + p.peran + ')');
}

// d: {hari, otomatis}
function waAdminOtoNilaiAtur(token, d) {
  var p = onWajib_(token, ON.PERAN_JALANKAN);
  d = d || {};
  var pr = PropertiesService.getScriptProperties();
  if (d.hari !== undefined) {
    var h = parseInt(d.hari, 10);
    if (!(h >= 1 && h <= 60)) throw new Error('Batas waktu harus 1 sampai 60 hari.');
    pr.setProperty(ON.PROP_HARI, String(h));
  }
  if (d.otomatis !== undefined) {
    ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === ON.PEMICU) ScriptApp.deleteTrigger(t); });
    if (d.otomatis === true) {
      ScriptApp.newTrigger(ON.PEMICU).timeBased().everyDays(1).atHour(ON.JAM_PEMICU).create();
      pr.setProperty(ON.PROP_AKTIF, '1');
    } else {
      pr.deleteProperty(ON.PROP_AKTIF);
    }
  }
  try { catat_(p.peran, '', p.nama, 'Atur penilaian otomatis', JSON.stringify(onAturan_()), 'OK'); } catch (e) {}
  return onAturan_();
}

// Pemicu harian (bila dinyalakan).
function pemicuOtoNilai() {
  if (PropertiesService.getScriptProperties().getProperty(ON.PROP_AKTIF) !== '1') return;
  try { onJalankan_('Sistem (jadwal harian)'); } catch (e) {
    try { pmlCatatGalat_('server', 'pemicuOtoNilai', String(e && e.message || e), String(e && e.stack || ''), '', 'Sistem'); } catch (e2) {}
  }
}

function onJalankan_(oleh) {
  var a = onAturan_();
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    ndPastikanKolom_(getSheet(CONFIG.SHEETS.JAWABAN));
    var c = onKandidat_(a.hari);
    if (!c.baris) return { dinilai: 0, diskusi: 0, poin: 0, kkm: a.kkm, hari: a.hari };
    var k = c.k, sh = c.sh;
    // kolom penilai/waktu bisa baru dibuat oleh ndPastikanKolom_: baca ulang header
    var hd = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(x) { return String(x).trim(); });
    k.penilai = hd.indexOf('Dinilai Oleh'); k.waktuNilai = hd.indexOf('Waktu Dinilai');
    var kini = new Date();
    var waktu = Utilities.formatDate(kini, absTz_(), 'yyyy-MM-dd HH:mm:ss');
    var tanggal = Utilities.formatDate(kini, absTz_(), 'yyyy-MM-dd');
    var catatan = [], kinerja = [], kabar = [], log = [], poin = 0;
    c.grup.forEach(function(g) {
      g.baris.forEach(function(b) {
        sh.getRange(b.baris, k.nilai + 1).setValue(a.kkm);
        if (k.penilai >= 0) sh.getRange(b.baris, k.penilai + 1).setValue(ON.PENILAI);
        if (k.waktuNilai >= 0) sh.getRange(b.baris, k.waktuNilai + 1).setValue(kini);
        catatan.push([waktu, g.idMapel, g.idMateri, b.siswa, a.kkm, ON.KET, oleh]);
        log.push([waktu, g.idMapel, g.idMateri, b.siswa, '', a.kkm, ON.KET, ON.PENILAI]);
        kabar.push({ rombel: b.rombel, idMapel: g.idMapel, mapel: g.mapel, idMateri: g.idMateri, judul: g.judul, siswa: b.siswa, nilai: a.kkm, oleh: ON.PENILAI });
      });
      var ket = ON.KET + ' ' + g.baris.length + ' jawaban belum dinilai lebih dari ' + a.hari + ' hari.';
      if (g.tutor.length) {
        g.tutor.forEach(function(t) {
          kinerja.push([absId_(), waktu, tanggal, t, g.idMapel, g.mapel, g.rombel, g.idMateri, g.judul, g.baris.length, -1, ket, oleh]);
          poin--;
        });
      } else {
        kinerja.push([absId_(), waktu, tanggal, '(tanpa pengampu)', g.idMapel, g.mapel, g.rombel, g.idMateri, g.judul, g.baris.length, 0, ket + ' Mapel belum punya tutor pengampu.', oleh]);
      }
    });
    var shC = onSheet_(ON.TAB_CATATAN, ON.HDR_CATATAN);
    shC.getRange(shC.getLastRow() + 1, 1, catatan.length, ON.HDR_CATATAN.length).setValues(catatan);
    var shK = onSheet_(ON.TAB_KINERJA, ON.HDR_KINERJA);
    shK.getRange(shK.getLastRow() + 1, 1, kinerja.length, ON.HDR_KINERJA.length).setValues(kinerja);
    try {
      var shL = ndSheetLog_();
      shL.getRange(shL.getLastRow() + 1, 1, log.length, ND.HEADERS_LOG.length).setValues(log);
    } catch (eL) {}
    nvTulis_('NILAI', kabar);
    try { catat_('Sistem', '', oleh, 'Penilaian otomatis', c.baris + ' jawaban · ' + c.grup.length + ' diskusi · nilai ' + a.kkm + ' · kinerja ' + poin, 'OK'); } catch (eC) {}
    return { dinilai: c.baris, diskusi: c.grup.length, poin: poin, kkm: a.kkm, hari: a.hari };
  } finally { kunci.releaseLock(); }
}

// ---------- catatan internal (KS, Admin, Koordinator, Superadmin, pengampu) ----------
function waStafCatatanNilai(token, idMapel, idMateri) {
  var p = stafDariToken_(token);
  if (ON.PERAN_LIHAT.indexOf(p.peran) < 0 && !ndAdalahPengampu_(p, idMapel)) return { catatan: {} };
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ON.TAB_CATATAN);
  var out = {};
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, ON.HDR_CATATAN.length).getDisplayValues().forEach(function(r) {
      if (String(r[1]).trim() !== String(idMapel) || String(r[2]).trim() !== String(idMateri)) return;
      out[String(r[3]).trim()] = { waktu: r[0], nilai: r[4], keterangan: r[5], oleh: r[6] };
    });
  }
  return { catatan: out };
}

// ---------- rekap kinerja ----------
// q: {dari, sampai} (yyyy-mm-dd). Tutor hanya melihat catatan miliknya.
function waStafKinerjaTutor(token, q) {
  var p = stafDariToken_(token);
  var semua = ON.PERAN_LIHAT.indexOf(p.peran) >= 0;
  if (!semua && p.peran !== 'Tutor') throw new Error('Rekap kinerja hanya untuk Kepala Sekolah, Admin, Koordinator, dan tutor.');
  q = q || {};
  var dari = String(q.dari || '0000-00-00'), sampai = String(q.sampai || '9999-12-31');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ON.TAB_KINERJA);
  var baris = [], rekap = {};
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, ON.HDR_KINERJA.length).getDisplayValues().forEach(function(r) {
      var tgl = String(r[2]).slice(0, 10);
      if (tgl < dari || tgl > sampai) return;
      var tutor = String(r[3]);
      if (!semua && normNama_(tutor) !== normNama_(p.nama)) return;
      var poin = Number(r[10]) || 0;
      baris.push({ id: r[0], waktu: r[1], tanggal: tgl, tutor: tutor, mapel: r[5], rombel: r[6], judul: r[8], jawaban: Number(r[9]) || 0, poin: poin, keterangan: r[11], oleh: r[12] });
      var x = rekap[tutor] || (rekap[tutor] = { tutor: tutor, poin: 0, kejadian: 0, jawaban: 0 });
      x.poin += poin; x.kejadian++; x.jawaban += Number(r[9]) || 0;
    });
  }
  baris.reverse();
  return {
    semua: semua, dari: q.dari || '', sampai: q.sampai || '',
    rekap: Object.keys(rekap).map(function(t) { return rekap[t]; }).sort(function(a, b) { return a.poin - b.poin || b.jawaban - a.jawaban; }),
    baris: baris.slice(0, 500), total: baris.length
  };
}
