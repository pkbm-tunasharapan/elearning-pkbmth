// ============================================================================
// FORMAT NILAI XLSX: unduh format -> isi -> unggah (v1.38.3)
// ----------------------------------------------------------------------------
// Tutor mengunduh format nilai UTS / UAS / Ujian Lainnya untuk satu kelas (rombel x mapel),
// mengisinya di Excel/Google Sheets, lalu mengunggahnya kembali.
//
// Pengaman salah kirim (mis. nilai UTS masuk sebagai UAS):
//  1. "Kode format" di dalam file memuat jenis, rombel, mapel, dan periode, ditandatangani HMAC
//     dengan kunci rahasia server. Diubah sedikit saja -> ditolak.
//  2. Saat mengunggah, tutor memilih jenis nilai; harus SAMA dengan jenis di dalam file.
//  3. Rombel, mapel, dan periode file harus sama dengan kelas & semester berjalan.
//  4. Lembar terkunci kecuali kolom NILAI/KETERANGAN; judul, nama lembar, dan warna berbeda per jenis.
//  5. Unggah = PRATINJAU dulu (nilai lama -> baru). Yang disimpan persis isi pratinjau (disimpan sementara di cache).
// File dibuat dan dibaca tanpa layanan tambahan (zip + XML), memakai pembaca xlsx di Dapodik.gs.
// ============================================================================

var NXL = {
  JENIS: ['UTS', 'UAS', 'Lainnya'],
  LABEL: { UTS: 'UTS (Ujian Tengah Semester)', UAS: 'UAS (Ujian Akhir Semester)', Lainnya: 'Ujian Lainnya' },
  WARNA: { UTS: 'FF2563EB', UAS: 'FFEA580C', Lainnya: 'FF16A34A' },
  PROP_RAHASIA: 'NILAI_XLSX_RAHASIA',
  VERSI: 'NILAIv1',
  MAKS_BYTE: 4 * 1048576,
  CACHE_DETIK: 1200
};

function nxlRahasia_() {
  var sp = PropertiesService.getScriptProperties(), r = sp.getProperty(NXL.PROP_RAHASIA);
  if (!r) { r = Utilities.getUuid() + Utilities.getUuid(); sp.setProperty(NXL.PROP_RAHASIA, r); }
  return r;
}
function nxlTandaTangan_(bagian) {
  var b = Utilities.computeHmacSha256Signature(bagian.join('|'), nxlRahasia_());
  return b.slice(0, 6).map(function(x) { return ('0' + ((x + 256) % 256).toString(16)).slice(-2); }).join('').toUpperCase();
}
function nxlKode_(jenis, kelas, per) {
  var bagian = [NXL.VERSI, jenis, kelas.idRombel, kelas.kodeMapel, per.tahun, per.semester];
  return bagian.join('|') + '|' + nxlTandaTangan_(bagian);
}
function nxlJenis_(j) {
  j = String(j || '').trim();
  if (NXL.JENIS.indexOf(j) < 0) throw new Error('Jenis nilai harus UTS, UAS, atau Ujian Lainnya.');
  return j;
}
// Kelas yang boleh diinput nilai oleh staf ini.
function nxlKelas_(p, idRombel, kodeMapel) {
  if (!nilPeran_(p).input) throw new Error('Peran Anda tidak dapat menginput nilai.');
  var kelas = absKelasCek_(nilKelasBoleh_(p), idRombel, kodeMapel);
  if (!kelas) throw new Error('Kelas tidak ditemukan atau bukan kelas Anda.');
  return kelas;
}
// { idWb: {nilai, ket} } nilai tersimpan untuk kelas, jenis, dan periode ini.
function nxlNilaiAda_(kelas, jenis, per) {
  var t = absBaca_(NIL.TAB_NILAI, NIL.HDR_NILAI), out = {};
  for (var i = 1; i < t.v.length; i++) {
    var x = t.v[i];
    if (sTeks_(absNilai_(t, x, 'TAHUN PELAJARAN')).trim() !== per.tahun || sTeks_(absNilai_(t, x, 'SEMESTER')).trim() !== per.semester) continue;
    if (sTeks_(absNilai_(t, x, 'ROMBEL')).trim() !== kelas.idRombel || sTeks_(absNilai_(t, x, 'MAPEL')).trim() !== kelas.kodeMapel) continue;
    if (sTeks_(absNilai_(t, x, 'JENIS ASESMEN')).trim() !== jenis) continue;
    out[sTeks_(absNilai_(t, x, 'WARGA BELAJAR')).trim()] = { nilai: sTeks_(absNilai_(t, x, 'NILAI')).trim(), ket: sTeks_(absNilai_(t, x, 'KETERANGAN')) };
  }
  return out;
}

// ---------- pembuat xlsx minimal ----------
function nxlEsc_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}
function nxlKol_(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
// sel: {v, s (indeks gaya), n (angka?)}
function nxlSheetXml_(baris, lebar, gabung) {
  var x = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="8" topLeftCell="A9" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
    '<cols>'];
  lebar.forEach(function(w, i) { x.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'); });
  x.push('</cols><sheetData>');
  baris.forEach(function(r, i) {
    var no = i + 1;
    x.push('<row r="' + no + '">');
    r.forEach(function(c, j) {
      if (!c) return;
      var ref = nxlKol_(j) + no, st = c.s ? ' s="' + c.s + '"' : '';
      if (c.v === '' || c.v === null || c.v === undefined) x.push('<c r="' + ref + '"' + st + '/>');
      else if (c.n) x.push('<c r="' + ref + '"' + st + '><v>' + Number(c.v) + '</v></c>');
      else x.push('<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + nxlEsc_(c.v) + '</t></is></c>');
    });
    x.push('</row>');
  });
  x.push('</sheetData>');
  x.push('<sheetProtection sheet="1" objects="1" scenarios="1" formatColumns="0" formatRows="0" sort="0" autoFilter="0"/>');
  if (gabung && gabung.length) { x.push('<mergeCells count="' + gabung.length + '">'); gabung.forEach(function(g) { x.push('<mergeCell ref="' + g + '"/>'); }); x.push('</mergeCells>'); }
  x.push('</worksheet>');
  return x.join('');
}
function nxlStylesXml_(warna) {
  // gaya: 0 biasa, 1 judul (putih tebal di atas warna jenis), 2 label tebal, 3 kepala tabel, 4 data terkunci,
  //       5 isian (kuning, tidak terkunci), 6 teks kecil miring, 7 isian angka (kuning, tidak terkunci)
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF555555"/><name val="Calibri"/></font></fonts>' +
    '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="' + warna + '"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF7CC"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FF999999"/></left><right style="thin"><color rgb="FF999999"/></right><top style="thin"><color rgb="FF999999"/></top><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="8">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="49" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}
function nxlZip_(namaLembar, sheetXml, stylesXml, namaBerkas) {
  var b = function(nama, isi) { return Utilities.newBlob(isi, 'application/xml', nama); };
  var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="' + nxlEsc_(namaLembar) + '" sheetId="1" r:id="rId1"/></sheets></workbook>';
  var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  return Utilities.zip([b('[Content_Types].xml', ct), b('_rels/.rels', rels), b('xl/workbook.xml', wb), b('xl/_rels/workbook.xml.rels', wbRels),
    b('xl/worksheets/sheet1.xml', sheetXml), b('xl/styles.xml', stylesXml)], namaBerkas);
}

// ---------- endpoint: unduh format ----------
// d: {idRombel, kodeMapel, jenis}
function waStafNilaiFormat(token, d) {
  var p = stafDariToken_(token);
  d = d || {};
  var jenis = nxlJenis_(d.jenis), kelas = nxlKelas_(p, d.idRombel, d.kodeMapel), per = nilPeriode_();
  var ada = nxlNilaiAda_(kelas, jenis, per), wbs = absWbRombel_(kelas.idRombel);
  var label = NXL.LABEL[jenis], judulNilai = jenis === 'Lainnya' ? 'NILAI UJIAN LAINNYA' : 'NILAI ' + jenis;
  var baris = [
    [{ v: 'FORMAT ' + judulNilai + ' — hanya untuk ' + label, s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }],
    [{ v: 'Mata pelajaran', s: 2 }, { v: kelas.namaMapel }, null, { v: 'Rombel', s: 2 }, { v: kelas.namaRombel }],
    [{ v: 'Periode', s: 2 }, { v: 'Semester ' + per.semester + ' ' + per.tahun }, null, { v: 'Jenis nilai', s: 2 }, { v: label }],
    [{ v: 'Kode format', s: 2 }, { v: nxlKode_(jenis, kelas, per) }],
    [{ v: 'Isi kolom NILAI (0–100, kuning). Kosongkan bila tidak ingin mengubah nilai siswa itu. Jangan ubah ID WB, baris 1–8, atau nama lembar.', s: 6 }],
    [{ v: 'Saat mengunggah, pilih jenis "' + label + '". Bila jenis yang dipilih berbeda dengan file ini, unggahan ditolak.', s: 6 }],
    [],
    [{ v: 'NO', s: 3 }, { v: 'ID WB', s: 3 }, { v: 'NISN', s: 3 }, { v: 'NAMA', s: 3 }, { v: judulNilai, s: 3 }, { v: 'KETERANGAN', s: 3 }]
  ];
  wbs.forEach(function(w, i) {
    var a = ada[w.id] || {}, n = String(a.nilai || '').trim();
    baris.push([{ v: i + 1, n: true, s: 4 }, { v: w.id, s: 4 }, { v: w.nisn, s: 4 }, { v: w.nama, s: 4 },
      n !== '' && !isNaN(Number(n)) ? { v: Number(n), n: true, s: 7 } : { v: '', s: 7 }, { v: a.ket || '', s: 5 }]);
  });
  var namaLembar = (jenis === 'Lainnya' ? 'NILAI UJIAN LAINNYA' : 'NILAI ' + jenis);
  var aman = function(s) { return String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); };
  var nama = 'Nilai_' + (jenis === 'Lainnya' ? 'UjianLainnya' : jenis) + '_' + aman(kelas.namaMapel) + '_' + aman(kelas.namaRombel) + '_' + per.semester + '_' + per.tahun.replace('/', '-') + '.xlsx';
  var blob = nxlZip_(namaLembar, nxlSheetXml_(baris, [5, 14, 14, 34, 16, 30], ['A1:F1']), nxlStylesXml_(NXL.WARNA[jenis]), nama);
  try { catat_(p.peran, kelas.idRombel, p.nama, 'Unduh format nilai ' + jenis, kelas.namaMapel + ' ' + kelas.namaRombel, 'OK'); } catch (e) {}
  return { nama: nama, b64: Utilities.base64Encode(blob.getBytes()), jumlah: wbs.length };
}

// ---------- endpoint: unggah -> pratinjau ----------
// d: {idRombel, kodeMapel, jenis (dipilih tutor), b64}
function waStafNilaiUnggahPratinjau(token, d) {
  var p = stafDariToken_(token);
  d = d || {};
  var jenis = nxlJenis_(d.jenis), kelas = nxlKelas_(p, d.idRombel, d.kodeMapel), per = nilPeriode_();
  var bytes = Utilities.base64Decode(String(d.b64 || ''));
  if (!bytes.length) throw new Error('File kosong.');
  if (bytes.length > NXL.MAKS_BYTE) throw new Error('File terlalu besar (maksimal 4 MB).');
  var isi;
  try { isi = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip', 'nilai.zip')); }
  catch (e) { throw new Error('File bukan .xlsx yang valid. Pakai format yang diunduh dari aplikasi, simpan sebagai .xlsx.'); }
  var peta = {};
  isi.forEach(function(b) { peta[b.getName()] = b; });
  var namaSheet = peta['xl/worksheets/sheet1.xml'] ? 'xl/worksheets/sheet1.xml' : Object.keys(peta).filter(function(n) { return /^xl\/worksheets\/[^\/]+\.xml$/.test(n); }).sort()[0];
  if (!namaSheet) throw new Error('Lembar kerja tidak ditemukan di file.');
  var ss = peta['xl/sharedStrings.xml'] ? dpkSharedStrings_(peta['xl/sharedStrings.xml'].getDataAsString('UTF-8')) : [];
  var baris = dpkBacaSheet_(peta[namaSheet].getDataAsString('UTF-8'), ss);

  // 1) kode format + tanda tangan
  var kode = '';
  for (var i = 0; i < Math.min(baris.length, 12); i++) {
    var r = baris[i] || [];
    for (var j = 0; j < r.length - 1; j++) if (String(r[j]).trim().toUpperCase() === 'KODE FORMAT') { kode = String(r[j + 1] || '').trim(); break; }
    if (kode) break;
  }
  if (!kode) throw new Error('Kode format tidak ditemukan. Pakai format yang diunduh dari aplikasi (tombol "Unduh format"), jangan file buatan sendiri.');
  var b = kode.split('|');
  if (b.length !== 7 || b[0] !== NXL.VERSI || nxlTandaTangan_(b.slice(0, 6)) !== b[6]) {
    throw new Error('Kode format di file ini tidak sah atau sudah diubah. Unduh ulang format dari aplikasi.');
  }
  var fJenis = b[1], fRombel = b[2], fMapel = b[3], fTahun = b[4], fSmt = b[5];
  // 2) jenis pilihan tutor harus sama dengan jenis di file
  if (fJenis !== jenis) {
    throw new Error('SALAH JENIS: file ini adalah format ' + NXL.LABEL[fJenis] + ', tetapi Anda memilih ' + NXL.LABEL[jenis] +
      '. Tidak ada nilai yang disimpan. Pilih jenis yang sesuai dengan file, atau unduh format ' + NXL.LABEL[jenis] + '.');
  }
  // 3) kelas & periode
  if (fRombel !== kelas.idRombel || fMapel !== kelas.kodeMapel) {
    throw new Error('File ini untuk kelas lain (bukan ' + kelas.namaMapel + ' · ' + kelas.namaRombel + '). Tidak ada nilai yang disimpan.');
  }
  if (fTahun !== per.tahun || fSmt !== per.semester) {
    throw new Error('File ini untuk Semester ' + fSmt + ' ' + fTahun + ', bukan semester berjalan (' + per.semester + ' ' + per.tahun + '). Unduh format terbaru.');
  }
  // 4) tabel nilai
  var hdr = -1, kId = -1, kNilai = -1, kKet = -1;
  for (var h = 0; h < Math.min(baris.length, 20); h++) {
    var rr = (baris[h] || []).map(function(x) { return String(x).trim().toUpperCase(); });
    if (rr.indexOf('ID WB') >= 0) {
      hdr = h; kId = rr.indexOf('ID WB'); kKet = rr.indexOf('KETERANGAN');
      rr.forEach(function(x, k) { if (kNilai < 0 && /^NILAI\b/.test(x)) kNilai = k; });
      break;
    }
  }
  if (hdr < 0 || kNilai < 0) throw new Error('Tabel nilai (kolom ID WB dan NILAI) tidak ditemukan di file.');
  var wbs = {}, urut = [];
  absWbRombel_(kelas.idRombel).forEach(function(w) { wbs[w.id] = w; urut.push(w.id); });
  var ada = nxlNilaiAda_(kelas, jenis, per), at = nilAturan_();
  var hk = (jenis !== 'Lainnya') ? nilHadirKelas_(per, kelas.idRombel + '|' + kelas.kodeMapel) : { total: 0, hadir: {} };
  var dis = nilDisBaca_(per);
  var ubah = [], sama = 0, kosong = 0, ditolak = [], dilihat = {};
  for (var x = hdr + 1; x < baris.length; x++) {
    var row = baris[x] || [], id = String(row[kId] || '').trim();
    if (!id) continue;
    var w = wbs[id];
    if (!w) { ditolak.push('Baris ' + (x + 1) + ': ID ' + id + ' bukan warga belajar aktif di rombel ini'); continue; }
    if (dilihat[id]) { ditolak.push('Baris ' + (x + 1) + ': ' + w.nama + ' muncul dua kali'); continue; }
    dilihat[id] = true;
    var s = String(row[kNilai] === undefined ? '' : row[kNilai]).trim().replace(',', '.');
    if (s === '') { kosong++; continue; }
    var n = Number(s);
    if (isNaN(n) || n < 0 || n > 100) { ditolak.push(w.nama + ': nilai "' + row[kNilai] + '" tidak sah (harus 0–100)'); continue; }
    if (jenis !== 'Lainnya' && at.blokir && hk.total) {
      var ps = (hk.hadir[w.id] || 0) * 100 / hk.total;
      if (ps < at.syaratHadir && !nilDisCari_(dis, w.id, kelas.idRombel, kelas.kodeMapel, jenis)) { ditolak.push(w.nama + ': kehadiran ' + nilBulat_(ps) + '% di bawah syarat'); continue; }
    }
    var nb = String(nilBulat_(n)), lama = (ada[id] || {}).nilai || '', ket = kKet >= 0 ? String(row[kKet] || '').slice(0, 200) : '';
    if (lama !== '' && Number(lama) === Number(nb) && ((ada[id] || {}).ket || '') === ket) { sama++; continue; }
    ubah.push({ idWb: id, nama: w.nama, lama: lama, baru: nb, ket: ket });
  }
  var kunci = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('nxl_' + kunci, JSON.stringify({ oleh: p.id, idRombel: kelas.idRombel, kodeMapel: kelas.kodeMapel, jenis: jenis, tahun: per.tahun, semester: per.semester, ubah: ubah }), NXL.CACHE_DETIK);
  return {
    kunci: kunci, jenis: jenis, label: NXL.LABEL[jenis], mapel: kelas.namaMapel, rombel: kelas.namaRombel, periode: 'Semester ' + per.semester + ' ' + per.tahun,
    ubah: ubah, timpa: ubah.filter(function(u) { return u.lama !== ''; }).length, sama: sama, kosong: kosong, ditolak: ditolak
  };
}

// ---------- endpoint: terapkan hasil pratinjau ----------
function waStafNilaiUnggahTerapkan(token, kunci) {
  var p = stafDariToken_(token);
  var c = CacheService.getScriptCache(), mentah = c.get('nxl_' + String(kunci || ''));
  if (!mentah) throw new Error('Pratinjau sudah kedaluwarsa (lebih dari 20 menit). Unggah ulang file nilainya.');
  var d = JSON.parse(mentah);
  if (d.oleh !== p.id) throw new Error('Pratinjau ini dibuat oleh akun lain.');
  var per = nilPeriode_();
  if (d.tahun !== per.tahun || d.semester !== per.semester) throw new Error('Semester berjalan sudah berganti. Unggah ulang file nilainya.');
  if (!d.ubah.length) return { sukses: true, tersimpan: 0, ditolak: [] };
  var h = waStafNilaiInput(token, { idRombel: d.idRombel, kodeMapel: d.kodeMapel, jenis: d.jenis, nilai: d.ubah.map(function(u) { return { idWb: u.idWb, nilai: u.baru, ket: u.ket }; }) });
  c.remove('nxl_' + String(kunci));
  try { catat_(p.peran, d.idRombel, p.nama, 'Unggah nilai ' + d.jenis + ' (xlsx)', d.kodeMapel + ': ' + h.tersimpan + ' nilai', 'OK'); } catch (e) {}
  return h;
}
