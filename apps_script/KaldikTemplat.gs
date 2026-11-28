// ============================================================================
// TEMPLAT KALENDER AKADEMIK (v1.95.0)
// - Unduh: waAdminTaKaldikTemplat -> xlsx: lembar KALDIK (diisi; terisi data tersimpan bila ada), PETUNJUK, CONTOH
//   (kaldik Jawa Barat 2026/2027). Kolom: NO | SEMESTER | TANGGAL MULAI | TANGGAL SELESAI | KEGIATAN | KATEGORI | KETERANGAN.
//   SEMESTER & KATEGORI berupa dropdown. KATEGORI kosong = ditebak dari kata kunci kegiatan.
// - Unggah: waAdminTaKaldikUnggah(token, b64, opsi) -> periksa per baris, susun kaldik, pratinjau minggu.
//   opsi.simpan = true -> simpan (taKaldikTulis_); opsi.gantiMulai = true -> hari pertama semester yang sudah berjalan
//   ikut diganti (bawaan: dipertahankan supaya sesi yang sudah lewat tidak bergeser); opsi.label = tahun ajaran tujuan
//   (wizard tahun baru: tanpa simpan, kaldik dikembalikan).
// ============================================================================
var KT = {
  LEMBAR: 'KALDIK', KOLOM: ['NO', 'SEMESTER', 'TANGGAL MULAI', 'TANGGAL SELESAI', 'KEGIATAN', 'KATEGORI', 'KETERANGAN'],
  KAT: { 'Hari pertama masuk': 'mulai', 'Libur': 'libur', 'UTS': 'uts', 'UAS': 'uas', 'Pembagian rapor': 'rapor', 'Ujian jenjang': 'ujianJenjang', 'Kegiatan': 'kegiatan' },
  WARNA: 'FF0F766E', BARIS_KOSONG: 150,
  BULAN: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
  // kaldik Jawa Barat 2026/2027 (Kep. Kadisdik Jabar No. 30234/PK.02.01.05/PSMA) - lembar CONTOH
  CONTOH: [
    [1, '2026-07-15', '', 'Hari pertama masuk sekolah', 'Hari pertama masuk'],
    [1, '2026-07-15', '2026-07-21', 'Pengenalan Lingkungan Sekolah (15-17, 20-21 Juli)', 'Kegiatan'],
    [1, '2026-08-17', '', 'Libur hari Proklamasi Kemerdekaan RI', 'Libur'],
    [1, '2026-08-25', '', 'Libur Maulid Nabi Muhammad SAW', 'Libur'],
    [1, '2026-11-25', '', 'Hari Guru Nasional', 'Kegiatan'],
    [1, '2026-11-30', '2026-12-11', 'Asesmen sumatif akhir semester', 'UAS'],
    [1, '2026-12-23', '', 'Pembagian rapor semester 1', 'Pembagian rapor'],
    [1, '2026-12-24', '', 'Cuti bersama Hari Natal', 'Libur'],
    [1, '2026-12-25', '', 'Libur Hari Natal', 'Libur'],
    [1, '2026-12-28', '2027-01-08', 'Libur semester 1', 'Libur'],
    [2, '2027-01-01', '', 'Libur Tahun Baru Masehi', 'Libur'],
    [2, '2027-01-05', '', "Perkiraan libur Isra Mi'raj", 'Libur'],
    [2, '2027-01-11', '', 'Hari pertama masuk sekolah', 'Hari pertama masuk'],
    [2, '2027-02-06', '', 'Perkiraan libur Tahun Baru Imlek', 'Libur'],
    [2, '2027-02-08', '2027-02-12', 'Perkiraan libur awal Ramadan 1448 H', 'Libur'],
    [2, '2027-02-15', '2027-03-05', 'Kegiatan Penumbuhan Budi Pekerti/Pesantren Ramadhan', 'Kegiatan'],
    [2, '2027-03-08', '2027-03-19', 'Perkiraan libur hari raya Idul Fitri 1448 H', 'Libur'],
    [2, '2027-03-09', '', 'Perkiraan libur Hari Raya Nyepi', 'Libur'],
    [2, '2027-04-05', '2027-04-16', 'Perkiraan Tes Kemampuan Akademik Paket B', 'Ujian jenjang'],
    [2, '2027-04-19', '2027-04-30', 'Perkiraan Tes Kemampuan Akademik Paket A', 'Ujian jenjang'],
    [2, '2027-04-26', '', 'Perkiraan libur wafat Isa Almasih', 'Libur'],
    [2, '2027-05-01', '', 'Libur Hari Buruh', 'Libur'],
    [2, '2027-05-02', '', 'Hari Pendidikan Nasional', 'Kegiatan'],
    [2, '2027-05-06', '', 'Kenaikan Isa Almasih', 'Libur'],
    [2, '2027-05-16', '', 'Perkiraan libur Hari Raya Waisak', 'Libur'],
    [2, '2027-05-17', '', 'Perkiraan hari raya Idul Adha 1448 H', 'Libur'],
    [2, '2027-06-01', '', 'Libur hari lahir Pancasila', 'Libur'],
    [2, '2027-06-06', '', 'Perkiraan Tahun Baru Islam', 'Libur'],
    [2, '2027-06-07', '2027-06-18', 'Perkiraan asesmen sumatif akhir tahun', 'UAS'],
    [2, '2027-06-25', '', 'Pembagian rapor semester 2', 'Pembagian rapor'],
    [2, '2027-06-28', '2027-07-09', 'Libur akhir tahun ajaran', 'Libur']
  ]
};

function ktLabelKat_(kode) { var o = ''; Object.keys(KT.KAT).forEach(function(k) { if (KT.KAT[k] === kode) o = k; }); return o; }
// Kategori dari kata kunci kegiatan (sama dengan pengurai di aplikasi, lib/kaldik_parser.dart).
function ktKategori_(kegiatan) {
  var k = String(kegiatan || '').toLowerCase();
  if (k.indexOf('hari pertama') >= 0 && (k.indexOf('masuk') >= 0 || k.indexOf('sekolah') >= 0)) return 'mulai';
  if (k.indexOf('pembagian rapor') >= 0 || k.indexOf('pembagian raport') >= 0) return 'rapor';
  if (/asesmen sumatif akhir (semester|tahun)|sumatif akhir tahun|sumatif akhir fase|penilaian akhir (semester|tahun)|ujian akhir semester/.test(k)) return 'uas';
  if (/asesmen sumatif tengah semester|penilaian tengah semester|ujian tengah semester|\buts\b|\bpts\b/.test(k)) return 'uts';
  if (k.indexOf('akhir jenjang') >= 0 || (/tes (kemampuan|kompetensi) akademik/.test(k) && k.indexOf('paket') >= 0)) return 'ujianJenjang';
  if (/^(perkiraan )?(hari (guru|pendidikan|disabilitas|anak|kartini|pahlawan|santri|ibu))/.test(k) || k.indexOf('pramuka') >= 0) return 'kegiatan';
  if (/\blibur\b|cuti bersama|hari raya|tahun baru (islam|imlek|masehi|hijriah)|\bnatal\b|wafat isa|kenaikan isa|waisak|waisyak|nyepi|isra|maulid|idul (fitri|adha)|kemerdekaan|lahir pancasila|hari buruh/.test(k)) return 'libur';
  return 'kegiatan';
}
function ktTeksTgl_(dari, sampai) {
  var f = function(iso) { var p = String(iso).split('-'); return Number(p[2]) + ' ' + KT.BULAN[Number(p[1]) - 1] + ' ' + p[0]; };
  return !sampai || sampai === dari ? f(dari) : f(dari) + ' - ' + f(sampai);
}
function ktSenin_(iso) { return taIso_(taSenin_(taTgl_(iso))); }
function ktMinggu_(iso) { return taIso_(taHari_(taSenin_(taTgl_(iso)), 6)); }

// Baris templat dari kaldik tersimpan (arsip keterangan bertanggal, atau isian terstruktur).
function ktBarisDariKaldik_(k) {
  var out = [];
  ['s1', 's2'].forEach(function(sx, i) {
    var s = (k || {})[sx];
    if (!s) return;
    var ket = (s.keterangan || []).filter(function(r) { return r.dari; });
    if (ket.length) {
      ket.forEach(function(r) { out.push([i + 1, r.dari, r.sampai && r.sampai !== r.dari ? r.sampai : '', r.kegiatan, ktLabelKat_(r.kategori) || 'Kegiatan', r.ket || '']); });
      return;
    }
    if (s.mulai) out.push([i + 1, s.mulai, '', 'Hari pertama masuk', 'Hari pertama masuk', '']);
    (s.libur || []).forEach(function(l) { out.push([i + 1, l.dari, l.sampai !== l.dari ? l.sampai : '', l.nama, 'Libur', '']); });
    var cfg = taBaca_();
    Object.keys(s.tetap || {}).forEach(function(n) {
      var t = s.tetap[n], kat = Number(n) === cfg.uas ? 'UAS' : (Number(n) === cfg.uts ? 'UTS' : '');
      if (kat) out.push([i + 1, t.dari, t.sampai, t.ket || kat, kat, 'Sesi ' + n]);
    });
    if (s.rapor) out.push([i + 1, s.rapor, '', 'Pembagian rapor', 'Pembagian rapor', '']);
  });
  return out.sort(function(a, b) { return (a[0] - b[0]) || String(a[1]).localeCompare(String(b[1])); });
}

function waAdminTaKaldikTemplat(token) {
  var p = wajibAdmin_(token), cfg = taBaca_();
  var kepala = function(judul) {
    var j = [{ v: judul, s: 1 }];
    for (var i = 1; i < KT.KOLOM.length; i++) j.push({ v: '', s: 1 });
    return j;
  };
  var petunjuk = [
    'Satu baris = satu kegiatan dari tabel KETERANGAN kaldik dinas. TANGGAL ditulis TTTT-BB-HH (mis. 2027-01-11) atau format tanggal Excel. TANGGAL SELESAI kosong = satu hari.',
    'KATEGORI (pilih dari daftar): Hari pertama masuk (wajib 1 per semester), Libur, UTS, UAS, Pembagian rapor, Ujian jenjang (info), Kegiatan (diabaikan). Kosong = ditebak dari nama kegiatan.',
    'Libur >= 3 hari (Senin-Sabtu) dalam satu minggu = minggu itu tidak dipakai untuk sesi. Libur 1-2 hari hanya meniadakan tatap muka. SEMESTER kosong = ditentukan dari tanggal.'
  ];
  var b = [kepala('TEMPLAT KALENDER AKADEMIK ' + cfg.label), [{ v: 'Tahun ajaran', s: 2 }, { v: cfg.label }],
    [{ v: 'Diunduh', s: 2 }, { v: absWaktu_() + ' oleh ' + p.nama }], [{ v: 'Sumber kaldik', s: 2 }, { v: '', s: 5 }],
    [{ v: petunjuk[0], s: 6 }], [{ v: petunjuk[1], s: 6 }], [{ v: petunjuk[2], s: 6 }],
    KT.KOLOM.map(function(k) { return { v: k, s: 3 }; })];
  var isi = ktBarisDariKaldik_(cfg.kaldik);
  for (var n = 0; n < Math.max(KT.BARIS_KOSONG, isi.length + 40); n++) {
    var r = isi[n] || ['', '', '', '', '', ''];
    b.push([{ v: n + 1, n: true, s: 4 }].concat(r.map(function(x) { return { v: x === undefined ? '' : x, s: 5 }; })));
  }
  var akhir = 8 + Math.max(KT.BARIS_KOSONG, isi.length + 40);
  var dv = '<dataValidations count="2">' +
    '<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="B9:B' + akhir + '"><formula1>"1,2"</formula1></dataValidation>' +
    '<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="F9:F' + akhir + '"><formula1>"' + Object.keys(KT.KAT).join(',') + '"</formula1></dataValidation></dataValidations>';
  var xmlKaldik = nxlSheetXml_(b, [5, 11, 15, 15, 48, 20, 24], ['A1:G1']).replace('</worksheet>', dv + '</worksheet>');
  var c = [kepala('CONTOH: KALDIK JAWA BARAT 2026/2027'), [{ v: 'Sumber', s: 2 }, { v: 'Kep. Kadisdik Jabar No. 30234/PK.02.01.05/PSMA' }], [], [], [], [], [],
    KT.KOLOM.map(function(k) { return { v: k, s: 3 }; })];
  KT.CONTOH.forEach(function(r, i) { c.push([{ v: i + 1, n: true, s: 4 }].concat(r.map(function(x) { return { v: x, s: 4 }; })).concat([{ v: '', s: 4 }])); });
  var pt = [kepala('PETUNJUK'), [], [], [], [], [], [], [{ v: 'Langkah', s: 3 }]];
  ['1. Buka kaldik dari dinas. Di bawah kalender tiap semester ada tabel KETERANGAN (Tanggal | Kegiatan).',
    '2. Salin tiap baris ke lembar KALDIK: tanggal mulai, tanggal selesai (bila rentang), nama kegiatan, lalu pilih KATEGORI.',
    '3. Minimal isi: Hari pertama masuk (semester 1 dan 2), semua Libur, UAS (asesmen sumatif akhir semester/tahun), Pembagian rapor.',
    '4. UTS boleh kosong (otomatis di sesi ' + cfg.uts + '). UAS dibulatkan ke minggu penuh (Senin-Minggu).',
    '5. Libur khusus lembaga (libur desa, kegiatan yayasan) boleh ditambahkan sebagai Libur dengan KETERANGAN.',
    '6. Simpan sebagai .xlsx lalu unggah di aplikasi: Tahun Ajaran > Kalender akademik > Unggah templat. Periksa pratinjau, lalu simpan.',
    '7. Lihat lembar CONTOH untuk kaldik Jawa Barat 2026/2027 yang sudah terisi.'].forEach(function(t) { pt.push([{ v: t }]); });
  var nama = 'Templat_Kaldik_' + String(cfg.label).replace(/\//g, '-') + '.xlsx';
  var blob = oflZip_([{ nama: KT.LEMBAR, xml: xmlKaldik }, { nama: 'PETUNJUK', xml: nxlSheetXml_(pt, [110], ['A1:G1']) },
    { nama: 'CONTOH', xml: nxlSheetXml_(c, [5, 11, 15, 15, 48, 20, 24], ['A1:G1']) }], nxlStylesXml_(KT.WARNA), nama);
  catat_(p.peran, '', p.nama, 'Unduh templat kaldik', cfg.label, 'OK');
  return { nama: nama, b64: Utilities.base64Encode(blob.getBytes()) };
}

// Baca baris lembar KALDIK -> {baris: [...], galat: [...]}
function ktBaca_(b64) {
  var lembar = oflBacaXlsx_(b64), v = lembar[KT.LEMBAR] || lembar[Object.keys(lembar)[0]];
  if (!v) throw new Error('Lembar KALDIK tidak ditemukan. Pakai templat yang diunduh dari aplikasi.');
  var hdr = -1;
  for (var i = 0; i < Math.min(v.length, 30); i++) {
    var r = (v[i] || []).map(function(x) { return String(x || '').trim().toUpperCase(); });
    if (r.indexOf('KEGIATAN') >= 0 && r.indexOf('TANGGAL MULAI') >= 0) { hdr = i; break; }
  }
  if (hdr < 0) throw new Error('Kepala tabel (TANGGAL MULAI, KEGIATAN) tidak ditemukan. Pakai templat dari aplikasi.');
  var h = {};
  (v[hdr] || []).forEach(function(x, j) { h[String(x || '').trim().toUpperCase()] = j; });
  var ambil = function(r, k) { var j = h[k]; return j === undefined ? '' : String(r[j] === null || r[j] === undefined ? '' : r[j]).trim(); };
  var out = [], galat = [];
  for (var a = hdr + 1; a < v.length; a++) {
    var r0 = v[a] || [], no = a + 1;
    var keg = ambil(r0, 'KEGIATAN'), tm = ambil(r0, 'TANGGAL MULAI'), ts = ambil(r0, 'TANGGAL SELESAI'), sm = ambil(r0, 'SEMESTER'), kt = ambil(r0, 'KATEGORI');
    if (!keg && !tm && !ts && !kt) continue;
    var dari = jimTgl_(tm), sampai = ts ? jimTgl_(ts) : dari;
    if (!dari) { galat.push('Baris ' + no + ': TANGGAL MULAI "' + tm + '" tidak terbaca (tulis TTTT-BB-HH).'); continue; }
    if (!sampai) { galat.push('Baris ' + no + ': TANGGAL SELESAI "' + ts + '" tidak terbaca.'); continue; }
    if (sampai < dari) { galat.push('Baris ' + no + ': tanggal selesai sebelum tanggal mulai.'); continue; }
    if (!keg) { galat.push('Baris ' + no + ': KEGIATAN kosong.'); continue; }
    var kode = kt ? KT.KAT[Object.keys(KT.KAT).filter(function(x) { return x.toLowerCase() === kt.toLowerCase(); })[0]] : ktKategori_(keg);
    if (!kode) { galat.push('Baris ' + no + ': KATEGORI "' + kt + '" tidak dikenal (pilih dari daftar).'); continue; }
    var smt = /^[12]$/.test(sm) ? Number(sm) : 0;
    if (sm && !smt) { galat.push('Baris ' + no + ': SEMESTER harus 1 atau 2.'); continue; }
    out.push({ no: no, smt: smt, dari: dari, sampai: sampai, kegiatan: keg.slice(0, 200), kategori: kode, ket: ambil(r0, 'KETERANGAN').slice(0, 120), otomatis: !kt });
  }
  return { baris: out, galat: galat };
}

// Susun kaldik dari baris templat. Hasil {kaldik, galat, info}
function ktSusun_(baris, cfg, opsi) {
  var galat = [], info = [], lama = cfg.kaldik || {};
  // semester kosong -> dari tanggal (>= hari pertama semester 2 = semester 2; tanpa itu: Jul-Des = 1, Jan-Jun = 2)
  var s2 = baris.filter(function(b) { return b.kategori === 'mulai' && b.smt === 2; })[0] || baris.filter(function(b) { return b.kategori === 'mulai' && !b.smt && Number(b.dari.slice(5, 7)) <= 6; })[0];
  var mulai2 = s2 ? s2.dari : ((lama.s2 || {}).mulai || '');
  baris.forEach(function(b) {
    if (b.smt) return;
    b.smt = mulai2 ? (b.dari >= mulai2 ? 2 : 1) : (Number(b.dari.slice(5, 7)) >= 7 ? 1 : 2);
  });
  var hasil = {}, kini = taIsoLokal_(new Date());
  [1, 2].forEach(function(s) {
    var bs = baris.filter(function(b) { return b.smt === s; });
    if (!bs.length) return;
    var ls = lama['s' + s] || {}, o = { mulai: '', rapor: '', libur: [], tetap: {}, keterangan: [] };
    Object.keys(ls.tetap || {}).forEach(function(n) { o.tetap[n] = ls.tetap[n]; });
    var m = bs.filter(function(b) { return b.kategori === 'mulai'; });
    if (m.length !== 1) galat.push('Semester ' + s + ': harus ada tepat 1 baris "Hari pertama masuk" (ditemukan ' + m.length + ').');
    o.mulai = m.length ? m[0].dari : '';
    ['uts', 'uas'].forEach(function(jn) {
      var x = bs.filter(function(b) { return b.kategori === jn; });
      if (x.length > 1) galat.push('Semester ' + s + ': ' + jn.toUpperCase() + ' lebih dari 1 baris (baris ' + x.map(function(b) { return b.no; }).join(', ') + ').');
      if (x.length) {
        var n = jn === 'uts' ? cfg.uts : cfg.uas;
        o.tetap[n] = { dari: ktSenin_(x[0].dari), sampai: ktMinggu_(x[0].sampai), ket: x[0].kegiatan.replace(/^perkiraan\s+/i, '').slice(0, 60) };
      }
    });
    var rp = bs.filter(function(b) { return b.kategori === 'rapor'; });
    if (rp.length) o.rapor = rp[rp.length - 1].sampai;
    var ada = {};
    bs.filter(function(b) { return b.kategori === 'libur'; }).forEach(function(b) {
      var k = b.dari + '|' + b.sampai;
      if (ada[k]) return;
      ada[k] = true;
      o.libur.push({ dari: b.dari, sampai: b.sampai, nama: b.kegiatan.replace(/^perkiraan\s+/i, '').slice(0, 80) });
    });
    o.keterangan = bs.map(function(b) { return { tanggal: ktTeksTgl_(b.dari, b.sampai), kegiatan: b.kegiatan, kategori: b.kategori, dari: b.dari, sampai: b.sampai, ket: b.ket }; });
    // semester yang sudah berjalan: hari pertama dipertahankan (sesi yang lewat tidak bergeser) kecuali diminta
    if (ls.mulai && ls.mulai <= kini && o.mulai && o.mulai !== ls.mulai && !(opsi || {}).gantiMulai && !(opsi || {}).label) {
      info.push('Semester ' + s + ' sudah berjalan: hari pertama tetap ' + ls.mulai + ' (templat: ' + o.mulai + ').');
      o.mulai = ls.mulai;
    }
    hasil['s' + s] = o;
  });
  if (!hasil.s1) galat.push('Belum ada baris Semester 1.');
  return { kaldik: hasil, galat: galat, info: info };
}

// opsi: {simpan, gantiMulai, label}
function waAdminTaKaldikUnggah(token, b64, opsi) {
  var p = wajibAdmin_(token);
  opsi = opsi || {};
  var cfg = taBaca_(), r = ktBaca_(b64);
  var s = r.baris.length ? ktSusun_(r.baris, cfg, opsi) : { kaldik: {}, galat: ['Tidak ada baris kegiatan yang terisi.'], info: [] };
  var galat = r.galat.concat(s.galat), kaldik = null;
  if (!galat.length) {
    try { kaldik = taKaldikBersih_(s.kaldik, cfg.sesiPerSemester); } catch (e) { galat.push(e.message); }
  }
  var out = { galat: galat, info: s.info, jumlah: r.baris.length, otomatis: r.baris.filter(function(b) { return b.otomatis; }).length,
    ringkas: [1, 2].map(function(x) {
      var k = (s.kaldik || {})['s' + x];
      if (!k) return null;
      return { smt: x, mulai: k.mulai, rapor: k.rapor, libur: k.libur.length, uts: k.tetap[cfg.uts] || null, uas: k.tetap[cfg.uas] || null,
        jenjang: k.keterangan.filter(function(b) { return b.kategori === 'ujianJenjang'; }).map(function(b) { return b.kegiatan + ' (' + b.tanggal + ')'; }) };
    }).filter(Boolean) };
  if (galat.length) return out;
  // pratinjau tanpa menyimpan
  var uji = {};
  Object.keys(cfg).forEach(function(k) { uji[k] = cfg[k]; });
  uji.kaldik = kaldik;
  if (opsi.label) uji.label = String(opsi.label);
  var j = taJadwal_(uji);
  TA_JADWAL_MEMO_ = null;
  out.kaldik = kaldik;
  out.uts = cfg.uts; out.uas = cfg.uas; out.upk = cfg.upk;
  out.minggu = j ? j.minggu : null;
  out.peringatan = j ? j.peringatan : [];
  if (opsi.simpan === true && !opsi.label) {
    out.paket = taKaldikTulis_(kaldik, p);
    out.tersimpan = true;
  }
  return out;
}
