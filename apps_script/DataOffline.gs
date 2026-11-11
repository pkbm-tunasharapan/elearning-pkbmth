// ============================================================================
// DATA OFFLINE (HARDCOPY) SEMESTER LAMPAU (v1.40.0)
// ----------------------------------------------------------------------------
// Sebelum sistem ini diterapkan (sebelum Ganjil 2026/2027) nilai, absensi, dan jawaban diskusi hanya ada di
// berkas kertas. Admin mengunduh TEMPLATE XLSX per rombel per semester lampau, tutor mengisi NILAI AKHIR dari
// hardcopy (tugas/diskusi, UTS, UAS, atau langsung nilai akhir rapor), rekap kehadiran, dan keputusan
// kenaikan; admin mengunggah kembali (pratinjau -> terapkan).
// - Nilai disimpan di tab NILAI dengan KETERANGAN OFL.KET; rekap kehadiran di tab KEHADIRAN OFFLINE;
//   keputusan di tab KENAIKAN KELAS.
// - Jawaban diskusi TIDAK dibuat: rapor/arsip menampilkan catatan OFL.CATATAN.
// - Setelah diterapkan, arsip semester itu (folder Drive + rapor PDF) dibuat/diperbarui otomatis (Arsip.gs).
// - Pengaman: kode format bertanda tangan HMAC (rombel + periode), kolom identitas terkunci, nilai 0-100.
// ============================================================================
var OFL = {
  VERSI: 'OFFv1',
  TAB_HADIR: 'KEHADIRAN OFFLINE',
  HDR_HADIR: ['ID', 'TAHUN PELAJARAN', 'SEMESTER', 'ROMBEL', 'WARGA BELAJAR', 'NAMA', 'PERTEMUAN', 'HADIR', 'IZIN', 'SAKIT', 'ALPA', 'KETERANGAN', 'DICATAT OLEH', 'DICATAT PADA'],
  KET: 'Data offline (hardcopy) - sebelum sistem TH.E-Course diterapkan',
  KET_HADIR: 'Rekap kehadiran offline (hardcopy)',
  CATATAN: 'Jawaban diskusi dan tugas tersimpan dalam bentuk hardcopy. Nilai diambil dari data offline sebelum sistem ini diterapkan.',
  JENIS: [['TUGAS/DISKUSI', 'Tugas'], ['UTS', 'UTS'], ['UAS', 'UAS'], ['NILAI AKHIR', 'Akhir']],
  WARNA: 'FF7C3AED',
  CACHE_DETIK: 1200
};

// Rekap kehadiran offline/beku untuk satu periode: idWb -> {Hadir, Izin, Sakit, Alpa, pertemuan}
function oflHadir_(per) {
  var t = absBaca_(OFL.TAB_HADIR, OFL.HDR_HADIR), out = {};
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (sTeks_(absNilai_(t, r, 'TAHUN PELAJARAN')).trim() !== per.tahun || sTeks_(absNilai_(t, r, 'SEMESTER')).trim() !== per.semester) continue;
    var n = function(k) { return Number(sTeks_(absNilai_(t, r, k)).replace(/[^\d.]/g, '')) || 0; };
    out[sTeks_(absNilai_(t, r, 'WARGA BELAJAR')).trim()] = { Hadir: n('HADIR'), Izin: n('IZIN'), Sakit: n('SAKIT'), Alpa: n('ALPA'), pertemuan: n('PERTEMUAN'),
      ket: sTeks_(absNilai_(t, r, 'KETERANGAN')) };
  }
  return out;
}

// ---------- xlsx beberapa lembar ----------
function oflZip_(lembar, stylesXml, namaBerkas) {
  var b = function(nama, isi) { return Utilities.newBlob(isi, 'application/xml', nama); };
  var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    lembar.map(function(l, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    lembar.map(function(l, i) { return '<sheet name="' + nxlEsc_(l.nama) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>';
  var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    lembar.map(function(l, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
    '<Relationship Id="rId' + (lembar.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  var berkas = [b('[Content_Types].xml', ct), b('_rels/.rels', rels), b('xl/workbook.xml', wb), b('xl/_rels/workbook.xml.rels', wbRels), b('xl/styles.xml', stylesXml)];
  lembar.forEach(function(l, i) { berkas.push(b('xl/worksheets/sheet' + (i + 1) + '.xml', l.xml)); });
  return Utilities.zip(berkas, namaBerkas);
}

// Membaca semua lembar xlsx: {namaLembar: [[sel...]...]} (urutan lembar dari workbook.xml).
function oflBacaXlsx_(b64) {
  var bytes = Utilities.base64Decode(String(b64 || ''));
  if (!bytes.length) throw new Error('File kosong.');
  if (bytes.length > NXL.MAKS_BYTE) throw new Error('File terlalu besar (maksimal 4 MB).');
  var isi;
  try { isi = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip', 'offline.zip')); }
  catch (e) { throw new Error('File bukan .xlsx yang valid. Pakai template yang diunduh dari aplikasi, simpan sebagai .xlsx.'); }
  var peta = {};
  isi.forEach(function(x) { peta[x.getName()] = x; });
  var ss = peta['xl/sharedStrings.xml'] ? dpkSharedStrings_(peta['xl/sharedStrings.xml'].getDataAsString('UTF-8')) : [];
  var out = {}, wb = peta['xl/workbook.xml'] ? peta['xl/workbook.xml'].getDataAsString('UTF-8') : '';
  var rels = peta['xl/_rels/workbook.xml.rels'] ? peta['xl/_rels/workbook.xml.rels'].getDataAsString('UTF-8') : '', target = {};
  rels.replace(/<Relationship\b[^>]*>/g, function(tag) {
    var id = (/\bId="([^"]+)"/.exec(tag) || [])[1], tg = (/\bTarget="([^"]+)"/.exec(tag) || [])[1];
    if (id && tg) target[id] = tg.replace(/^\/?(xl\/)?/, 'xl/');
    return tag;
  });
  wb.replace(/<sheet\b[^>]*>/g, function(tag) {
    var nm = (/\bname="([^"]+)"/.exec(tag) || [])[1], rid = (/\br:id="([^"]+)"/.exec(tag) || [])[1];
    var jalur = rid && target[rid];
    if (nm && jalur && peta[jalur]) out[nm.replace(/&amp;/g, '&').trim().toUpperCase()] = dpkBacaSheet_(peta[jalur].getDataAsString('UTF-8'), ss);
    return tag;
  });
  if (!Object.keys(out).length) throw new Error('Lembar kerja tidak ditemukan di file.');
  return out;
}

function oflKode_(idRombel, per) {
  var bagian = [OFL.VERSI, idRombel, per.tahun, per.semester];
  return bagian.join('|') + '|' + nxlTandaTangan_(bagian);
}

// Baris kepala lembar (1-8). Baris 8 = kepala tabel.
function oflKepala_(judul, rbTeks, per, kode, petunjuk, kolom) {
  var isiJudul = [{ v: judul, s: 1 }];
  for (var i = 1; i < kolom.length; i++) isiJudul.push({ v: '', s: 1 });
  return [
    isiJudul,
    [{ v: 'Rombel saat itu', s: 2 }, { v: rbTeks }],
    [{ v: 'Periode', s: 2 }, { v: 'Semester ' + per.semester + ' ' + per.tahun }],
    [{ v: 'Kode format', s: 2 }, { v: kode }],
    [{ v: petunjuk, s: 6 }],
    [{ v: 'Isi hanya sel KUNING. Jangan ubah ID WB, KODE MAPEL, baris 1–8, atau nama lembar. Kosongkan bila tidak ada datanya.', s: 6 }],
    [],
    kolom.map(function(k) { return { v: k, s: 3 }; })
  ];
}
function oflSelAngka_(v) { var s = String(v === null || v === undefined ? '' : v).trim(); return s !== '' && !isNaN(Number(s)) ? { v: Number(s), n: true, s: 7 } : { v: '', s: 7 }; }

// ---------- endpoint: unduh template ----------
// q: {idRombel (rombel SEKARANG), tahun, semester}
function waAdminOfflineFormat(token, q) {
  var p = wajibAdmin_(token);
  q = q || {};
  var kini = nilPeriode_(), per = nilPeriode_(q);
  if (nilUrutPer_(per) >= nilUrutPer_(kini)) throw new Error('Template data offline hanya untuk semester sebelum semester berjalan (' + kini.semester + ' ' + kini.tahun + ').');
  var idKini = String(q.idRombel || '');
  var h = nilHitungLampau_(idKini, per, kini), k = h.k, hadir = oflHadir_(per);
  var nmRb = function(g) { return (h.rk.rombel[g] || {}).nama || g; };
  var kode = oflKode_(idKini, per);
  var rbTeks = Object.keys(h.grup).filter(function(g) { return g; }).map(nmRb).join(', ') + ' (sekarang ' + nmRb(idKini) + ')';
  var kolomN = ['NO', 'ID WB', 'NISN', 'NAMA', 'ROMBEL SAAT ITU', 'KODE MAPEL', 'MATA PELAJARAN', 'TUGAS/DISKUSI', 'UTS', 'UAS', 'NILAI AKHIR', 'KETERANGAN'];
  var bN = oflKepala_('DATA OFFLINE: NILAI AKHIR DARI HARDCOPY', rbTeks, per, kode,
    'Isi nilai 0–100 dari berkas kertas. Bila hardcopy hanya berisi nilai akhir rapor, isi NILAI AKHIR saja (komponen boleh kosong).', kolomN);
  var kolomH = ['NO', 'ID WB', 'NISN', 'NAMA', 'ROMBEL SAAT ITU', 'JUMLAH PERTEMUAN', 'HADIR', 'IZIN', 'SAKIT', 'ALPA'];
  var bH = oflKepala_('DATA OFFLINE: REKAP KEHADIRAN', rbTeks, per, kode, 'Isi jumlah (bukan tanggal) dari buku absensi semester itu.', kolomH);
  var genap = per.semester === 'Genap';
  var kolomK = ['NO', 'ID WB', 'NISN', 'NAMA', 'ROMBEL SAAT ITU', 'KEPUTUSAN'];
  var bK = genap ? oflKepala_('DATA OFFLINE: KENAIKAN / KELULUSAN', rbTeks, per, kode, 'Tulis Naik atau Tinggal (kelas akhir: Lulus atau Tidak Lulus).', kolomK) : null;
  var kep = genap ? nilKeputusanLampau_(h, idKini, per).keputusan : {};
  var no = 0, noH = 0;
  Object.keys(h.grup).forEach(function(g) {
    if (!g) return;
    var kelas = h.kelasPer[g] || [];
    h.grup[g].forEach(function(w) {
      kelas.forEach(function(kl) {
        var kk = w.id + '|' + g + '|' + kl.kodeMapel, m = function(j) { var x = k.manual[kk + '|' + j]; return x ? x.nilai : ''; };
        no++;
        bN.push([{ v: no, n: true, s: 4 }, { v: w.id, s: 4 }, { v: w.nisn, s: 4 }, { v: w.nama, s: 4 }, { v: nmRb(g), s: 4 }, { v: kl.kodeMapel, s: 4 }, { v: kl.namaMapel, s: 4 },
          oflSelAngka_(m('Tugas')), oflSelAngka_(m('UTS')), oflSelAngka_(m('UAS')), oflSelAngka_(m('Akhir')), { v: '', s: 5 }]);
      });
      noH++;
      var hd = hadir[w.id] || {};
      bH.push([{ v: noH, n: true, s: 4 }, { v: w.id, s: 4 }, { v: w.nisn, s: 4 }, { v: w.nama, s: 4 }, { v: nmRb(g), s: 4 },
        oflSelAngka_(hd.pertemuan), oflSelAngka_(hd.Hadir), oflSelAngka_(hd.Izin), oflSelAngka_(hd.Sakit), oflSelAngka_(hd.Alpa)]);
      if (bK) bK.push([{ v: noH, n: true, s: 4 }, { v: w.id, s: 4 }, { v: w.nisn, s: 4 }, { v: w.nama, s: 4 }, { v: nmRb(g), s: 4 }, { v: kep[w.id] || '', s: 5 }]);
    });
  });
  var akhirKol = function(n) { return nxlKol_(n - 1); };
  var lembar = [
    { nama: 'NILAI', xml: nxlSheetXml_(bN, [5, 12, 13, 30, 12, 12, 26, 14, 9, 9, 13, 26], ['A1:' + akhirKol(kolomN.length) + '1']) },
    { nama: 'KEHADIRAN', xml: nxlSheetXml_(bH, [5, 12, 13, 30, 12, 18, 9, 9, 9, 9], ['A1:' + akhirKol(kolomH.length) + '1']) }
  ];
  if (bK) lembar.push({ nama: 'KENAIKAN', xml: nxlSheetXml_(bK, [5, 12, 13, 30, 12, 18], ['A1:' + akhirKol(kolomK.length) + '1']) });
  var aman = function(s) { return String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); };
  var nama = 'Data_Offline_' + aman(nmRb(h.utama)) + '_' + per.semester + '_' + per.tahun.replace('/', '-') + '.xlsx';
  var blob = oflZip_(lembar, nxlStylesXml_(OFL.WARNA), nama);
  try { arsLog_(p, 'Unduh template data offline', arsNamaPer_(per), nmRb(h.utama) + ' (sekarang ' + nmRb(idKini) + ')', '', ''); } catch (e) {}
  return { nama: nama, b64: Utilities.base64Encode(blob.getBytes()), jumlah: noH };
}

// ---------- endpoint: unggah -> pratinjau ----------
function waAdminOfflinePratinjau(token, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  var lembar = oflBacaXlsx_(d.b64), nilaiL = lembar['NILAI'];
  if (!nilaiL) throw new Error('Lembar NILAI tidak ditemukan. Pakai template data offline dari aplikasi.');
  var kode = '';
  for (var i = 0; i < Math.min(nilaiL.length, 10) && !kode; i++) {
    var r0 = nilaiL[i] || [];
    for (var j = 0; j < r0.length - 1; j++) if (String(r0[j]).trim().toUpperCase() === 'KODE FORMAT') { kode = String(r0[j + 1] || '').trim(); break; }
  }
  var b = kode.split('|');
  if (b.length !== 5 || b[0] !== OFL.VERSI || nxlTandaTangan_(b.slice(0, 4)) !== b[4]) throw new Error('Kode format tidak sah atau sudah diubah. Unduh ulang template data offline dari aplikasi.');
  var idKini = b[1], per = nilPeriode_({ tahun: b[2], semester: b[3] }), kini = nilPeriode_();
  if (nilUrutPer_(per) >= nilUrutPer_(kini)) throw new Error('Template ini untuk semester yang bukan semester lampau.');
  var h = nilHitungLampau_(idKini, per, kini), at = h.k.at, wbG = {}, nmWb = {}, kelasG = {};
  Object.keys(h.grup).forEach(function(g) {
    if (!g) return;
    kelasG[g] = {};
    (h.kelasPer[g] || []).forEach(function(kl) { kelasG[g][kl.kodeMapel] = kl; });
    h.grup[g].forEach(function(w) { wbG[w.id] = g; nmWb[w.id] = w.nama; });
  });
  var kolom = function(baris, nama) {
    for (var x = 0; x < Math.min(baris.length, 20); x++) {
      var rr = (baris[x] || []).map(function(v) { return String(v).trim().toUpperCase(); });
      if (rr.indexOf('ID WB') >= 0) { var o = { _hdr: x }; rr.forEach(function(v, k2) { o[v] = k2; }); return o; }
    }
    throw new Error('Tabel di lembar ' + nama + ' tidak dikenali (kolom ID WB tidak ada).');
  };
  var angkaSah = function(v, maks) {
    var s = String(v === null || v === undefined ? '' : v).trim().replace(',', '.');
    if (s === '') return '';
    var n = Number(s);
    return isNaN(n) || n < 0 || (maks && n > maks) ? null : n;
  };
  var nilai = [], hadir = [], naik = [], ditolak = [];
  var kn = kolom(nilaiL, 'NILAI');
  for (var x = kn._hdr + 1; x < nilaiL.length; x++) {
    var r = nilaiL[x] || [], id = String(r[kn['ID WB']] || '').trim(), km = String(r[kn['KODE MAPEL']] || '').trim();
    if (!id) continue;
    var g = wbG[id];
    if (!g) { ditolak.push('NILAI baris ' + (x + 1) + ': ID ' + id + ' tidak dikenal untuk rombel/semester ini'); continue; }
    if (!kelasG[g][km]) { ditolak.push('NILAI baris ' + (x + 1) + ': mapel ' + km + ' bukan mapel ' + (h.rk.rombel[g] || {}).nama); continue; }
    var ket = kn['KETERANGAN'] !== undefined ? String(r[kn['KETERANGAN']] || '').slice(0, 150) : '';
    OFL.JENIS.forEach(function(j) {
      if (kn[j[0]] === undefined) return;
      var v = angkaSah(r[kn[j[0]]], 100);
      if (v === '') return;
      if (v === null) { ditolak.push(nmWb[id] + ' · ' + kelasG[g][km].namaMapel + ': ' + j[0] + ' "' + r[kn[j[0]]] + '" tidak sah (0–100)'); return; }
      nilai.push({ idWb: id, nama: nmWb[id], g: g, kode: km, mapel: kelasG[g][km].namaMapel, idTutor: kelasG[g][km].idTutor || '', jenis: j[1], nilai: nilBulat_(v), ket: ket });
    });
  }
  if (lembar['KEHADIRAN']) {
    var hl = lembar['KEHADIRAN'], kh = kolom(hl, 'KEHADIRAN');
    for (var y = kh._hdr + 1; y < hl.length; y++) {
      var rh = hl[y] || [], idh = String(rh[kh['ID WB']] || '').trim();
      if (!idh) continue;
      if (!wbG[idh]) { ditolak.push('KEHADIRAN baris ' + (y + 1) + ': ID ' + idh + ' tidak dikenal'); continue; }
      var o = {}, salah = false, ada = false;
      [['JUMLAH PERTEMUAN', 'pertemuan'], ['HADIR', 'Hadir'], ['IZIN', 'Izin'], ['SAKIT', 'Sakit'], ['ALPA', 'Alpa']].forEach(function(c) {
        var v = kh[c[0]] === undefined ? '' : angkaSah(rh[kh[c[0]]], 400);
        if (v === null) salah = true; else if (v !== '') { o[c[1]] = Math.round(v); ada = true; } else o[c[1]] = 0;
      });
      if (salah) { ditolak.push(nmWb[idh] + ': angka kehadiran tidak sah'); continue; }
      if (!ada) continue;
      var jml = o.Hadir + o.Izin + o.Sakit + o.Alpa;
      if (!o.pertemuan) o.pertemuan = jml;
      if (jml > o.pertemuan) { ditolak.push(nmWb[idh] + ': hadir+izin+sakit+alpa (' + jml + ') melebihi jumlah pertemuan (' + o.pertemuan + ')'); continue; }
      o.idWb = idh; o.nama = nmWb[idh]; o.g = wbG[idh];
      hadir.push(o);
    }
  }
  if (lembar['KENAIKAN'] && per.semester === 'Genap') {
    var nl = lembar['KENAIKAN'], kk2 = kolom(nl, 'KENAIKAN');
    for (var z = kk2._hdr + 1; z < nl.length; z++) {
      var rk2 = nl[z] || [], idk = String(rk2[kk2['ID WB']] || '').trim(), kp = String(rk2[kk2['KEPUTUSAN']] || '').trim();
      if (!idk || !kp) continue;
      if (!wbG[idk]) { ditolak.push('KENAIKAN baris ' + (z + 1) + ': ID ' + idk + ' tidak dikenal'); continue; }
      var info = h.rk.rombel[wbG[idk]] || {}, akhir = !!(info.kelas && info.paket && KNK.AKHIR[info.paket] === info.kelas);
      var sah = akhir ? { 'LULUS': 'Lulus', 'TIDAK LULUS': 'Tidak Lulus' } : { 'NAIK': 'Naik', 'TINGGAL': 'Tinggal' };
      var kpb = sah[kp.toUpperCase()];
      if (!kpb) { ditolak.push(nmWb[idk] + ': keputusan "' + kp + '" tidak sah (' + Object.keys(sah).map(function(s) { return sah[s]; }).join('/') + ')'); continue; }
      naik.push({ idWb: idk, nama: nmWb[idk], g: wbG[idk], keputusan: kpb });
    }
  }
  var kunci = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('ofl_' + kunci, JSON.stringify({ oleh: p.id, idKini: idKini, tahun: per.tahun, semester: per.semester, nilai: nilai, hadir: hadir, naik: naik }), OFL.CACHE_DETIK);
  var rb = Object.keys(h.grup).filter(function(g2) { return g2; }).map(function(g2) { return (h.rk.rombel[g2] || {}).nama; }).join(', ');
  return { kunci: kunci, periode: 'Semester ' + per.semester + ' ' + per.tahun, rombel: rb, nilai: nilai.length, hadir: hadir.length, naik: naik.length,
    wb: Object.keys(nmWb).length, ditolak: ditolak.slice(0, 80), contoh: nilai.slice(0, 12).map(function(n) { return n.nama + ' · ' + n.mapel + ' · ' + n.jenis + ' ' + n.nilai; }) };
}

// ---------- endpoint: terapkan ----------
function waAdminOfflineTerapkan(token, kunci) {
  var p = wajibAdmin_(token);
  var c = CacheService.getScriptCache(), mentah = c.get('ofl_' + String(kunci || ''));
  if (!mentah) throw new Error('Pratinjau sudah kedaluwarsa (lebih dari 20 menit). Unggah ulang file.');
  var d = JSON.parse(mentah);
  if (d.oleh !== p.id) throw new Error('Pratinjau ini dibuat oleh akun lain.');
  var per = nilPeriode_({ tahun: d.tahun, semester: d.semester }), hari = absHariIni_(), waktu = absWaktu_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // 1) NILAI (upsert per WB|rombel|mapel|jenis untuk periode ini)
    var t = absBaca_(NIL.TAB_NILAI, NIL.HDR_NILAI), ada = {}, baru = [];
    for (var i = 1; i < t.v.length; i++) {
      var x = t.v[i];
      if (sTeks_(absNilai_(t, x, 'TAHUN PELAJARAN')).trim() !== per.tahun || sTeks_(absNilai_(t, x, 'SEMESTER')).trim() !== per.semester) continue;
      ada[[sTeks_(absNilai_(t, x, 'WARGA BELAJAR')).trim(), sTeks_(absNilai_(t, x, 'ROMBEL')).trim(), sTeks_(absNilai_(t, x, 'MAPEL')).trim(), sTeks_(absNilai_(t, x, 'JENIS ASESMEN')).trim()].join('|')] = i + 1;
    }
    var cN = absCol_(t, 'NILAI'), cK = absCol_(t, 'KETERANGAN'), cO = absCol_(t, 'DICATAT OLEH'), cT = absCol_(t, 'TANGGAL');
    d.nilai.forEach(function(n) {
      var ket = OFL.KET + (n.ket ? ' · ' + n.ket : ''), kk = [n.idWb, n.g, n.kode, n.jenis].join('|');
      if (ada[kk]) {
        t.sh.getRange(ada[kk], cN + 1).setValue(String(n.nilai));
        if (cK >= 0) t.sh.getRange(ada[kk], cK + 1).setValue(ket);
        if (cO >= 0) t.sh.getRange(ada[kk], cO + 1).setValue(p.nama);
        if (cT >= 0) t.sh.getRange(ada[kk], cT + 1).setValue(hari);
        return;
      }
      baru.push(absBaris_(t, { 'ID NILAI': absId_(), 'TANGGAL': hari, 'ROMBEL': n.g, 'MAPEL': n.kode, 'JENIS ASESMEN': n.jenis, 'WARGA BELAJAR': n.idWb,
        'NILAI': String(n.nilai), 'KETERANGAN': ket, 'TUTOR': n.idTutor, 'TAHUN PELAJARAN': per.tahun, 'SEMESTER': per.semester, 'DICATAT OLEH': p.nama }));
    });
    if (baru.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, baru.length, baru[0].length).setValues(baru);
    // 2) KEHADIRAN OFFLINE (upsert per WB untuk periode ini)
    var th = absBaca_(OFL.TAB_HADIR, OFL.HDR_HADIR), adaH = {}, baruH = [];
    for (var j = 1; j < th.v.length; j++) {
      var y = th.v[j];
      if (sTeks_(absNilai_(th, y, 'TAHUN PELAJARAN')).trim() === per.tahun && sTeks_(absNilai_(th, y, 'SEMESTER')).trim() === per.semester) adaH[sTeks_(absNilai_(th, y, 'WARGA BELAJAR')).trim()] = j + 1;
    }
    d.hadir.forEach(function(o) {
      var row = absBaris_(th, { 'ID': absId_(), 'TAHUN PELAJARAN': per.tahun, 'SEMESTER': per.semester, 'ROMBEL': o.g, 'WARGA BELAJAR': o.idWb, 'NAMA': o.nama,
        'PERTEMUAN': o.pertemuan, 'HADIR': o.Hadir, 'IZIN': o.Izin, 'SAKIT': o.Sakit, 'ALPA': o.Alpa, 'KETERANGAN': OFL.KET_HADIR, 'DICATAT OLEH': p.nama, 'DICATAT PADA': waktu });
      if (adaH[o.idWb]) th.sh.getRange(adaH[o.idWb], 1, 1, row.length).setValues([row]); else baruH.push(row);
    });
    if (baruH.length) th.sh.getRange(th.sh.getLastRow() + 1, 1, baruH.length, baruH[0].length).setValues(baruH);
    // 3) KENAIKAN KELAS (upsert per tahun|rombel|WB)
    if (d.naik.length) {
      var tk = knkBaca_(), adaK = {}, baruK = [], lebar = tk.v[0].length;
      for (var m = 1; m < tk.v.length; m++) {
        var z = tk.v[m];
        if (sTeks_(absNilai_(tk, z, 'TAHUN')).trim() === per.tahun) adaK[sTeks_(absNilai_(tk, z, 'ID ROMBEL')).trim() + '|' + sTeks_(absNilai_(tk, z, 'ID WB')).trim()] = m + 1;
      }
      d.naik.forEach(function(o) {
        var row = absBaris_(tk, { 'TAHUN': per.tahun, 'ID ROMBEL': o.g, 'ID WB': o.idWb, 'NAMA': bioTeks_(o.nama), 'KEPUTUSAN': o.keputusan, 'DIUBAH OLEH': p.nama + ' (data offline)', 'DIUBAH PADA': waktu });
        var kk2 = o.g + '|' + o.idWb;
        if (adaK[kk2]) tk.sh.getRange(adaK[kk2], 1, 1, lebar).setNumberFormat('@').setValues([row]); else baruK.push(row);
      });
      if (baruK.length) tk.sh.getRange(tk.sh.getLastRow() + 1, 1, baruK.length, lebar).setNumberFormat('@').setValues(baruK);
    }
  } finally { lock.releaseLock(); }
  c.remove('ofl_' + String(kunci));
  try { arsLog_(p, 'Unggah data offline', arsNamaPer_(per), d.nilai.length + ' nilai, ' + d.hadir.length + ' rekap kehadiran, ' + d.naik.length + ' keputusan', '', ''); } catch (e) {}
  // arsip semester itu dibuat / diperbarui otomatis
  var arsip = null;
  try { arsip = arsMulai_(per, 'Offline', p.nama); } catch (e2) { arsip = { galat: String(e2 && e2.message || e2) }; }
  return { sukses: true, nilai: d.nilai.length, hadir: d.hadir.length, naik: d.naik.length, arsip: arsip };
}
