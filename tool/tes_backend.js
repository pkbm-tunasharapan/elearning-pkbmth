// Tes otomatis backend Apps Script (dijalankan di GitHub Actions sebelum build, juga bisa lokal:
//   node tool/tes_backend.js
// Seluruh apps_script/*.gs dimuat ke satu konteks Node dengan tiruan layanan Google, lalu rumus inti diuji.
// Bila ada tes gagal, proses keluar dengan kode 1 sehingga APK tidak dibuat.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const akar = path.resolve(__dirname, '..');
const dir = path.join(akar, 'apps_script');

// ---------- tiruan layanan Google ----------
function tokoKunci() {
  const m = new Map();
  return {
    getProperty: (k) => (m.has(k) ? m.get(k) : null),
    setProperty: (k, v) => { m.set(k, String(v)); },
    setProperties: (o) => { Object.keys(o).forEach((k) => m.set(k, String(o[k]))); },
    deleteProperty: (k) => { m.delete(k); },
    _peta: m,
  };
}
const props = tokoKunci();
const cache = (() => {
  const m = new Map();
  return { get: (k) => (m.has(k) ? m.get(k) : null), put: (k, v) => { m.set(k, String(v)); }, remove: (k) => { m.delete(k); } };
})();
const pad = (n) => String(n).padStart(2, '0');
const Utilities = {
  formatDate: (d, tz, f) => {
    const x = new Date(d.getTime() + 7 * 3600000); // WIB
    return f.replace('yyyy', x.getUTCFullYear()).replace('MM', pad(x.getUTCMonth() + 1)).replace('dd', pad(x.getUTCDate()))
      .replace('HH', pad(x.getUTCHours())).replace('mm', pad(x.getUTCMinutes())).replace('ss', pad(x.getUTCSeconds()));
  },
  getUuid: () => crypto.randomUUID(),
  computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()).map((b) => (b > 127 ? b - 256 : b)),
  base64Encode: (b) => Buffer.from(b).toString('base64'),
  base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
  computeDigest: (alg, v) => Array.from(crypto.createHash('sha256').update(String(v), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
  DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
};
const tolak = (nama) => new Proxy({}, { get: (_, p) => () => { throw new Error('Layanan ' + nama + '.' + String(p) + ' tidak tersedia di tes'); } });
const konteks = {
  console, Utilities,
  Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
  PropertiesService: { getScriptProperties: () => props },
  CacheService: { getScriptCache: () => cache },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
  Logger: { log() {} },
  SpreadsheetApp: tolak('SpreadsheetApp'), DriveApp: tolak('DriveApp'), ScriptApp: tolak('ScriptApp'), UrlFetchApp: tolak('UrlFetchApp'),
  MailApp: tolak('MailApp'), HtmlService: tolak('HtmlService'), ContentService: tolak('ContentService'),
};
konteks.globalThis = konteks;
vm.createContext(konteks);

// ---------- muat semua .gs ----------
const berkas = fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).sort();
for (const f of berkas) {
  const isi = fs.readFileSync(path.join(dir, f), 'utf8');
  try {
    vm.runInContext(isi, konteks, { filename: f });
  } catch (e) {
    console.error('GAGAL memuat ' + f + ': ' + e.message);
    process.exit(1);
  }
}

// ---------- kerangka tes ----------
let lulus = 0, gagal = 0;
function tes(nama, fn) {
  try { fn(); lulus++; console.log('  ok   ' + nama); }
  catch (e) { gagal++; console.log('  GAGAL ' + nama + '\n        ' + e.message); }
}
function sama(a, b, pesan) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error((pesan || '') + ' diharapkan ' + y + ', didapat ' + x);
}
const g = konteks;

console.log('Tes backend (' + berkas.length + ' berkas .gs dimuat)');

// 1. pembanding versi
tes('rlsBanding_: urutan versi', () => {
  sama(g.rlsBanding_('1.38.0', '1.37.0') > 0, true);
  sama(g.rlsBanding_('1.10.0', '1.9.0') > 0, true);
  sama(g.rlsBanding_('1.38.4', '1.38.4'), 0);
  sama(g.rlsBanding_('1.38.4', '') > 0, true);
  sama(g.rlsBanding_('1.37.9', '1.38.0') < 0, true);
});

// 2. rumus nilai akhir
const aturan = { bobot: { diskusi: 40, uts: 30, uas: 30 }, kkm: 70, predikatA: 90, predikatB: 80 };
tes('nilAkhir_: lengkap', () => {
  const h = g.nilAkhir_(aturan, 80, 70, 90);
  sama([h.akhir, h.predikat, h.lengkap, h.tuntas], [80, 'B', true, true]);
});
tes('nilAkhir_: sementara (UAS belum ada)', () => {
  const h = g.nilAkhir_(aturan, 80, 70, null);
  sama([h.akhir, h.lengkap], [76, false]);
});
tes('nilAkhir_: belum ada komponen', () => sama(g.nilAkhir_(aturan, null, null, null).akhir, null));
tes('nilPredikat_: batas', () => sama([90, 89, 80, 70, 69].map((n) => g.nilPredikat_(aturan, n)), ['A', 'B', 'B', 'C', 'D']));

// 3. kehadiran gabungan
const lewat = {}; for (let n = 1; n <= 10; n++) lewat['1|' + n] = true;
const on = { aktif: true, lewat: 10, wajibLewat: lewat, wajibMulai: { '1|11': true }, hadir: { 'MP1|budi santoso': { '1|1': true, '1|2': true, '1|3': true, '1|11': true } } };
const bm = [{ idMapel: 'MP1', idRombel: 'R1' }];
tes('hdrGabung_: online + tatap muka', () => { const x = g.hdrGabung_(on, 3, 4, bm, 'Budi  Santoso'); sama([x.hadir, x.total, x.persen], [7, 15, 46.7]); });
tes('hdrGabung_: tanpa tatap muka, pembagi hanya TH.E-Course', () => { const x = g.hdrGabung_(on, 0, 0, bm, 'Budi Santoso'); sama([x.hadir, x.total], [4, 11]); });
tes('hdrGabung_: tidak terhubung e-learning', () => { const x = g.hdrGabung_(on, 3, 4, bm, ''); sama([x.hadir, x.total, x.persen], [3, 4, 75]); });
tes('hdrGabung_: tanpa data', () => sama(g.hdrGabung_({ aktif: false }, 0, 0, bm, 'x').persen, null));

// 4. pemetaan nama e-learning -> Data Induk
tes('absNormNama_: rombel & mapel', () => {
  sama(g.absNormNama_('Kelas A5'), g.absNormNama_('A5'));
  sama(g.absNormNama_('Ilmu Pengetahuan Alam dan Sosial (IPAS)'), g.absNormNama_('Ilmu Pengetahuan Alam dan Sosial'));
  sama(g.absNormNama_('Pendidikan Jasmani Olahraga dan Kesehatan (PJOK)'), g.absNormNama_('Pendidikan Jasmani, Olahraga, dan Kesehatan'));
});

// 5. format nilai xlsx: tulis -> baca
tes('nxlSheetXml_ -> dpkBacaSheet_ pulang-pergi', () => {
  const baris = [[{ v: 'Kode format', s: 2 }, { v: 'NILAIv1|UAS|R1|MTK|2026/2027|Ganjil|ABC' }], [], [{ v: 'ID WB' }, { v: 'NISN' }, { v: 'NAMA' }, { v: 'NILAI UAS' }],
    [{ v: 'WB-1' }, { v: '0081234567' }, { v: "Siti 'A\" & <B>" }, { v: 87.5, n: true }]];
  const r = g.dpkBacaSheet_(g.nxlSheetXml_(baris, [10, 10, 10, 10], []), []);
  sama([r[0][1], r[3][0], r[3][1], r[3][2], r[3][3]], ['NILAIv1|UAS|R1|MTK|2026/2027|Ganjil|ABC', 'WB-1', '0081234567', "Siti 'A\" & <B>", '87.5']);
});
tes('nxlKode_: tanda tangan berbeda per jenis & tahan ubah', () => {
  const kelas = { idRombel: 'R1', kodeMapel: 'MTK' }, per = { tahun: '2026/2027', semester: 'Ganjil' };
  const uts = g.nxlKode_('UTS', kelas, per), uas = g.nxlKode_('UAS', kelas, per);
  const bU = uts.split('|'), bA = uas.split('|');
  sama(bU[6] !== bA[6], true, 'tanda tangan UTS = UAS');
  sama(g.nxlTandaTangan_(bU.slice(0, 6)), bU[6], 'verifikasi UTS');
  const ubah = bU.slice(0, 6); ubah[1] = 'UAS';
  sama(g.nxlTandaTangan_(ubah) === bU[6], false, 'kode diubah lolos');
});

// 6. rilis uji -> resmi
function aturRilis(o) { props._peta.clear(); Object.keys(o).forEach((k) => props.setProperty(k, o[k])); }
g.catat_ = () => {};
g.absWaktu_ = () => '2026-11-10 10:00:00';
tes('rlsCekNaik_: lolos (2 penguji, 13 jam, 0 galat)', () => {
  aturRilis({ APP_VERSI_TERBARU: '1.38.5', RILIS_UJI_VERSI: '1.38.6', RILIS_UJI_MS: String(Date.now() - 13 * 3600000), RILIS_UJI_PAKAI: '["U1","U2"]', RILIS_UJI_GALAT: '0', RILIS_UJI_URL: 'u' });
  sama(g.rlsCekNaik_(), '1.38.6');
  sama([props.getProperty('APP_VERSI_TERBARU'), props.getProperty('APP_WAJIB'), props.getProperty('RILIS_SEBELUM_VERSI'), props.getProperty('RILIS_UJI_VERSI')], ['1.38.6', '1', '1.38.5', null]);
});
tes('rlsCekNaik_: tertahan bila ada galat / penguji kurang / belum 12 jam', () => {
  aturRilis({ APP_VERSI_TERBARU: '1.38.5', RILIS_UJI_VERSI: '1.38.6', RILIS_UJI_MS: String(Date.now() - 13 * 3600000), RILIS_UJI_PAKAI: '["U1","U2"]', RILIS_UJI_GALAT: '1' });
  sama(g.rlsCekNaik_(), '');
  props.setProperty('RILIS_UJI_GALAT', '0'); props.setProperty('RILIS_UJI_PAKAI', '["U1"]');
  sama(g.rlsCekNaik_(), '');
  props.setProperty('RILIS_UJI_PAKAI', '["U1","U2"]'); props.setProperty('RILIS_UJI_MS', String(Date.now() - 2 * 3600000));
  sama(g.rlsCekNaik_(), '');
  sama(props.getProperty('APP_VERSI_TERBARU'), '1.38.5');
});
tes('rlsUntuk_: penguji dapat rilis uji (tidak wajib), lainnya rilis resmi (wajib)', () => {
  aturRilis({ APP_VERSI_TERBARU: '1.38.5', APP_URL_UNDUH: 'resmi', RILIS_UJI_VERSI: '1.38.6', RILIS_UJI_URL: 'uji', RILIS_UJI_MS: String(Date.now()), RILIS_UJI_PAKAI: '[]', RILIS_UJI_GALAT: '0', RILIS_PENGUJI: '["T9"]' });
  g.stafDariToken_ = (t) => ({ A: { id: 'A1', peran: 'Admin' }, T: { id: 'T9', peran: 'Tutor' }, X: { id: 'T2', peran: 'Tutor' } }[t]);
  const a = g.rlsUntuk_('A'), t = g.rlsUntuk_('T'), x = g.rlsUntuk_('X'), s = g.rlsUntuk_('');
  sama([a.versi, a.wajib, a.uji], ['1.38.6', false, true], 'admin');
  sama([t.versi, t.uji], ['1.38.6', true], 'penguji');
  sama([x.versi, x.wajib, x.uji], ['1.38.5', true, false], 'bukan penguji');
  sama([s.versi, s.wajib], ['1.38.5', true], 'tanpa token');
});
tes('rlsCekNaik_: resmi lama (< 1.38.5, tanpa tombol Resmikan) -> rilis uji langsung resmi', () => {
  aturRilis({ APP_VERSI_TERBARU: '1.38.4', RILIS_UJI_VERSI: '1.38.8', RILIS_UJI_MS: String(Date.now()), RILIS_UJI_PAKAI: '[]', RILIS_UJI_GALAT: '0', RILIS_UJI_URL: 'u' });
  sama(g.rlsCekNaik_(), '1.38.8');
  sama([props.getProperty('APP_VERSI_TERBARU'), props.getProperty('RILIS_UJI_VERSI')], ['1.38.8', null]);
});
tes('rlsCatatGalat_: galat jaringan diabaikan, galat aplikasi dihitung', () => {
  aturRilis({ RILIS_UJI_VERSI: '1.38.5', RILIS_UJI_GALAT: '0' });
  g.rlsCatatGalat_('aplikasi', '[E101-ABC] Tidak dapat terhubung', '1.38.5');
  g.rlsCatatGalat_('aplikasi', 'Null check operator', '1.38.4');
  sama(props.getProperty('RILIS_UJI_GALAT'), '0');
  g.rlsCatatGalat_('aplikasi', '[E900-XYZ] Null check operator', '1.38.5 web');
  sama(props.getProperty('RILIS_UJI_GALAT'), '1');
});

// 6b. dasbor: absensi & tugas sesi berjalan (v1.38.9)
tes('dsbOnline_: hitung absen sesi berjalan, belum absensi/tugas, kehadiran semester', () => {
  const simpan = {};
  ['taBaca_', 'taInfo_', 'nilPeriode_', 'abSesiWajib_', 'brdMapelBm_', 'abBaca_', 'getSheetData', 'taParse_', 'hdrOnline_', 'nilSiswaBm_'].forEach((k) => { simpan[k] = g[k]; });
  try {
    g.taBaca_ = () => ({ sesiPerSemester: 3 });
    g.taInfo_ = (c, smt, n) => ({ status: n < 3 ? 'lewat' : 'berjalan' });
    g.nilPeriode_ = () => ({ smt: 1 });
    g.abSesiWajib_ = () => true;
    g.brdMapelBm_ = () => ({ M1: { idRombel: 'R1', rombel: 'Kelas 10', nama: 'MTK' }, M2: { idRombel: 'R1', rombel: 'Kelas 10', nama: 'IPA' } });
    g.abBaca_ = () => [{ smt: 1, n: 3, idMapel: 'M1', kunciNama: g.normNama_('Ani') }, { smt: 1, n: 3, idMapel: 'M2', kunciNama: g.normNama_('Ani') },
      { smt: 1, n: 3, idMapel: 'M1', kunciNama: g.normNama_('Budi') }, { smt: 1, n: 2, idMapel: 'M2', kunciNama: g.normNama_('Budi') }];
    g.getSheetData = (nama) => nama === 'Materi'
      ? [['ID Materi', 'ID Mapel', 'Jenis', 'Status', 'Sesi'], ['D1', 'M1', 'Diskusi', 'Aktif', 'S1-3'], ['D0', 'M1', 'Diskusi', 'Aktif', 'S1-2']]
      : [['ID Rombel', 'ID Materi', 'Nama Siswa'], ['R1', 'D1', 'Ani']];
    g.taParse_ = (c, x) => { const m = /S([0-9])-([0-9])/.exec(String(x)); return m ? { smt: +m[1], n: +m[2] } : null; };
    g.hdrOnline_ = () => ({ aktif: true, lewat: 2, wajibLewat: { '1|1': true, '1|2': true }, hadir: { ['M1|' + g.normNama_('Ani')]: { '1|1': true, '1|3': true } } });
    g.nilSiswaBm_ = () => ({ R1: [{ nama: 'Ani' }, { nama: 'Budi' }, { nama: 'Cici' }] });
    const o = g.dsbOnline_();
    sama([o.adaSesi, o.wb, o.sudahAbsenWb, o.absen, o.wajibAbsen, o.persenAbsen], [true, 3, 2, 3, 6, 50], 'absen');
    sama([o.tugas, o.wajibTugas, o.belumWb, o.belumAbsenWb, o.belumTugasWb], [1, 3, 2, 2, 2], 'belum');
    sama(o.belum.map((x) => x.nama), ['Cici', 'Budi']);
    // semester: Ani M1 hadir 2 dari (2 lewat + 1 berjalan yg diikuti) = 3; sisanya 0 dari 2 (5 pasang) -> 2/13
    sama([o.semHadir, o.semTotal, o.persenSemester], [2, 13, 15]);
  } finally { Object.keys(simpan).forEach((k) => { g[k] = simpan[k]; }); }
});

// 7. tulis-tembus tutor e-learning -> Data Induk (kasus tutor baru seperti Ikman)
function tabelTiruan(baris) {
  const v = baris.map((r) => r.slice());
  const h = {}; v[0].forEach((x, i) => { h[String(x).trim().toUpperCase()] = i; });
  const sh = {
    getLastRow: () => v.length,
    getRange: (r, c, n, m) => ({
      setValue: (x) => { while (v.length < r) v.push(new Array(v[0].length).fill('')); v[r - 1][c - 1] = x; },
      setValues: (xs) => { xs.forEach((row, i) => { v[r - 1 + i] = row.slice(); }); },
      setNumberFormat() { return this; },
    }),
  };
  return { sh, v, h };
}
tes('itSelarasEnroll_: isi kosong, tambah baru, lepas yang dicabut, jangan timpa tutor lain', () => {
  const en = tabelTiruan([
    ['ID ENROLL', 'ROMBEL', 'MAPEL', 'TUTOR', 'AKTIF', 'DICATAT PADA', 'STATUS', 'DIAJUKAN OLEH'],
    ['E1', 'R1', 'MTK', '', true, '', 'Disetujui', ''],          // diampu di e-learning, tutor kosong -> diisi
    ['E2', 'R1', 'GEO', 'TT-IKMAN', true, '', 'Disetujui', ''],  // tidak lagi diampu -> dilepas
    ['E3', 'R3', 'MTK', 'TT-LAIN', true, '', 'Disetujui', ''],   // diampu, tetapi milik tutor lain -> bentrok, tidak ditimpa
  ]);
  g.absBaca_ = (nama) => { if (nama === 'ENROLL MAPEL') return en; throw new Error('tab ' + nama); };
  g.nilPetaBm_ = () => ({ kelas: { 'R1|MTK': [{ idMapel: 'MP1' }], 'R1|GEO': [{ idMapel: 'MP2' }], 'R2|MTK': [{ idMapel: 'MP3' }], 'R3|MTK': [{ idMapel: 'MP4' }] } });
  g.bacaEnrollment_ = () => [{ idPengguna: 'U1', idMapel: 'MP1' }, { idPengguna: 'U1', idMapel: 'MP3' }, { idPengguna: 'U1', idMapel: 'MP4' }, { idPengguna: 'U2', idMapel: 'MP2' }];
  const h = g.itSelarasEnroll_({ id: 'U1', nama: 'Ikman', peran: 'Tutor', status: 'Aktif' }, 'TT-IKMAN');
  sama([h.isi, h.lepas, h.tambah, h.bentrok.length], [1, 1, 1, 1], 'ringkasan');
  sama(en.v[1][3], 'TT-IKMAN', 'E1 diisi');
  sama(en.v[2][3], '', 'E2 dilepas');
  sama(en.v[3][3], 'TT-LAIN', 'E3 tidak ditimpa');
  const baru = en.v[4];
  sama([baru[1], baru[2], baru[3], baru[6]], ['R2', 'MTK', 'TT-IKMAN', 'Disetujui'], 'baris baru R2|MTK');
});
tes('itSelarasEnroll_: tutor nonaktif -> semua penugasannya dilepas', () => {
  const en = tabelTiruan([['ID ENROLL', 'ROMBEL', 'MAPEL', 'TUTOR', 'AKTIF', 'DICATAT PADA', 'STATUS', 'DIAJUKAN OLEH'], ['E1', 'R1', 'MTK', 'TT-X', true, '', 'Disetujui', '']]);
  g.absBaca_ = () => en;
  const h = g.itSelarasEnroll_({ id: 'U1', nama: 'X', peran: 'Tutor', status: 'Nonaktif' }, 'TT-X');
  sama([h.lepas, en.v[1][3]], [1, '']);
});

// 8. pemulihan sesi siswa (token 6 jam habis -> kunci perangkat)
tes('waPulihSesiSiswa: token berlaku, token habis + kunci perangkat, kunci tidak sah', () => {
  g.getSheetData = (nama) => (nama === 'Siswa' ? [['ID Rombel', 'Nama Siswa'], ['ROM-C10', 'Alisya Dwi Andita']] : []);
  g.getNamaRombel_ = () => 'Kelas C10';
  g.getMapelAktifUntukRombel_ = () => [{ id: 'MP-C04', nama: 'Matematika' }];
  g.bcAudiens_ = (k) => ({ KUNCI_SISWA: { jenis: 'siswa', nama: 'ALISYA DWI ANDITA', rombel: 'ROM-C10' }, KUNCI_STAF: { jenis: 'staf', nama: 'X' } }[k] || null);
  cache.put('sis_' + 'T'.repeat(64), JSON.stringify({ nama: 'Alisya Dwi Andita', idRombel: 'ROM-C10' }));
  const a = g.waPulihSesiSiswa('T'.repeat(64), '');
  sama([a.sukses, a.sesi, a.daftarMapel.length], [true, 'T'.repeat(64), 1], 'token berlaku');
  const b = g.waPulihSesiSiswa('HABIS'.repeat(10), 'KUNCI_SISWA');
  sama([b.sukses, b.sesi.length >= 40, b.sesi !== 'HABIS'.repeat(10)], [true, true, true], 'token baru dari kunci');
  sama(g.waPulihSesiSiswa('HABIS'.repeat(10), 'KUNCI_STAF').sukses, false, 'kunci staf');
  sama(g.waPulihSesiSiswa('', 'KUNCI_PALSU').sukses, false, 'kunci palsu');
  g.getSheetData = () => [['ID Rombel', 'Nama Siswa']];
  sama(g.waPulihSesiSiswa('', 'KUNCI_SISWA').sukses, false, 'siswa sudah tidak terdaftar');
});

// 8. PIN warga belajar (v1.39.0)
function lembarTiruan(kepala) {
  const v = [kepala.slice()];
  const rentang = (r, c, nr, nc) => ({
    setNumberFormat() { return this; },
    setValues(x) { for (let i = 0; i < nr; i++) { while (v.length < r + i) v.push(new Array(kepala.length).fill('')); v[r + i - 1] = x[i].slice(); } return this; },
    getValues() { return v.slice(r - 1, r - 1 + nr).map((b) => b.slice(c - 1, c - 1 + nc)); },
  });
  return { v, getDataRange: () => ({ getValues: () => v.map((b) => b.slice()) }), getLastRow: () => v.length, getRange: rentang };
}
function siapPin() {
  const lembar = lembarTiruan(g.PIN.H);
  g.pinSheet_ = () => lembar;
  cache.remove(g.PIN.CK_PETA);
  ['gagalpin_ani', 'gagalpin_budi'].forEach((k) => cache.remove(k));
  g.getSheetData = (nama) => (nama === 'Siswa'
    ? [['ID Rombel', 'Nama Siswa', 'Tanggal Lahir'], ['ROM-C10', 'Ani', '2009-03-03'], ['ROM-C12', 'Budi', '2008-07-15']] : []);
  g.waLoginAsli_ = (nama, tgl) => {
    const r = { Ani: ['ROM-C10', '2009-03-03'], Budi: ['ROM-C12', '2008-07-15'] }[nama];
    return r && r[1] === tgl ? { sukses: true, nama, idRombel: r[0], namaRombel: 'X', daftarMapel: [] } : { sukses: false, pesan: 'tidak cocok' };
  };
  g.absHariIni_ = () => '2026-11-10';
  g.catat_ = () => {};
  g.__API_V = '1.39.0';
  return lembar;
}
tes('pinLemah_: tolak angka berulang, berurutan, tanggal lahir', () => {
  const t = '2009-03-03';
  sama(g.pinLemah_('12345', t) !== '', true, 'kurang dari 6');
  ['111111', '121212', '123123', '123456', '654321', '030309', '090303'].forEach((p) => sama(g.pinLemah_(p, t) !== '', true, p));
  sama(g.pinLemah_('583920', t), '', 'PIN wajar');
});
tes('PIN: tenggang 7 hari, buat, masuk dengan PIN, TH- ditolak, ujian minta PIN', () => {
  siapPin();
  g.__API_V = '1.38.8';
  const lama = g.pinStatus_('Budi', 'ROM-C12', true);
  sama([lama.tercatat, lama.wajib, g.pinPengingat_({ jenis: 'siswa', nama: 'Budi', rombel: 'ROM-C12' })], [false, false, null], 'aplikasi lama: tenggang belum mulai');
  g.__API_V = '1.39.0';
  const st = g.pinStatus_('Ani', 'ROM-C10', true);
  sama([st.ada, st.perlu, st.wajib, st.tenggat, st.sisaHari], [false, true, false, '2026-11-17', 7], 'tenggang');
  g.absHariIni_ = () => '2026-11-18';
  sama(g.pinStatus_('Ani', 'ROM-C10', true).wajib, true, 'lewat tenggang -> wajib');
  const tok = 'P'.repeat(64);
  cache.put('sis_' + tok, JSON.stringify({ nama: 'Ani', idRombel: 'ROM-C10' }));
  g.siswaTerdaftar_ = () => true;
  sama(g.waSiswaPinBuat(tok, '111111').sukses, false, 'PIN lemah ditolak');
  sama(g.waSiswaPinBuat(tok, '583920').sukses, true, 'buat PIN');
  sama(g.pinStatus_('Ani', 'ROM-C10', false).ada, true, 'status ada');
  sama(g.waLogin('Ani', '583920').sukses, true, 'masuk dengan PIN');
  sama(g.waLogin('Ani', 'TH-03032009').sukses, false, 'TH- ditolak setelah punya PIN');
  sama(g.waSiswaPinBuat(tok, '904817', '000000').sukses, false, 'ganti PIN butuh PIN lama');
  cache.remove('gagalpin_ani');
  sama(g.waSiswaPinBuat(tok, '904817', '583920').sukses, true, 'ganti PIN');
  sama(g.waLogin('Ani', '583920').sukses, false, 'PIN lama tidak berlaku');
  cache.remove('gagalpin_ani');
  g.ujJadwalDariUjian_ = () => ({ idUjian: 'U1' });
  g.cariBarisSesiUjian_ = () => null;
  g.nilGerbangUjian_ = () => '';
  g.ujGerbangMulai_ = () => ({ pesan: 'LANJUT' });
  sama(/PIN/.test(g.waMulaiUjian('U1', 'ROM-C10', 'M1', 'Ani', 'KODE').pesan), true, 'ujian tanpa PIN ditolak');
  sama(/salah/.test(g.waMulaiUjian('U1', 'ROM-C10', 'M1', 'Ani', 'KODE', '111222').pesan), true, 'ujian PIN salah');
  sama(g.waMulaiUjian('U1', 'ROM-C10', 'M1', 'Ani', 'KODE', '904817').pesan, 'LANJUT', 'ujian PIN benar lanjut');
});
tes('PIN: salah 5x dikunci, reset oleh tutor rombel, siswa lain tidak terpengaruh', () => {
  siapPin();
  const tok = 'Q'.repeat(64);
  cache.put('sis_' + tok, JSON.stringify({ nama: 'Ani', idRombel: 'ROM-C10' }));
  g.siswaTerdaftar_ = () => true;
  g.waSiswaPinBuat(tok, '583920');
  for (let i = 0; i < 5; i++) g.waLogin('Ani', '000001');
  sama(/30 menit/.test(g.waLogin('Ani', '583920').pesan), true, 'terkunci walau PIN benar');
  sama(g.waLogin('Budi', 'TH-15072008').sukses, true, 'siswa lain tetap bisa (belum punya PIN)');
  g.stafDariToken_ = (t) => ({ TUTOR: { id: 'U7', nama: 'Pak T', peran: 'Tutor' }, LAIN: { id: 'U8', nama: 'Bu L', peran: 'Tutor' } }[t]);
  g.mapelAktifSemua_ = () => [{ idMapel: 'M1', idRombel: 'ROM-C10' }];
  g.bacaEnrollment_ = () => [{ idPengguna: 'U7', idMapel: 'M1' }];
  let galat = '';
  try { g.waStafPinReset('LAIN', 'ROM-C10', 'Ani'); } catch (e) { galat = e.message; }
  sama(/Reset PIN hanya/.test(galat), true, 'tutor rombel lain ditolak');
  sama(g.waStafPinReset('TUTOR', 'ROM-C10', 'Ani').sukses, true, 'tutor rombel me-reset');
  const st = g.pinStatus_('Ani', 'ROM-C10', false);
  sama([st.ada, st.wajib, st.reset], [false, true, true], 'setelah reset wajib buat ulang');
  sama(g.waLogin('Ani', 'TH-03032009').sukses, true, 'masuk lagi dengan TH- setelah reset');
  sama(g.pinPengingat_({ jenis: 'siswa', nama: 'Budi', rombel: 'ROM-C12' }).id, 'PIN-2026-11-10', 'pengingat harian');
});

// 9. Dinas Pendidikan khusus-lihat (v1.39.1)
tes('Dinas: baca tab mapel boleh, tulis ditolak, rapor semester berjalan, konten tanpa tombol ubah', () => {
  const p = { id: 'D1', nama: 'Bidang PNF', peran: 'Dinas Pendidikan' };
  const coba = (fn, args) => { g.__API_FN = fn; g.__API_ARGS = args || []; try { return g.dinasSaring_(p); } catch (e) { return e.message; } };
  ['waStafAbsensi', 'waStafNilai', 'waStafUjianInfo', 'waNotifDaftar', 'waStafRombelSiswa'].forEach((fn) => sama(coba(fn).peran, 'Kepala Sekolah', fn));
  ['waStafMateriSimpan', 'waStafMateriStatus', 'waStafMateriHapus', 'waStafPinReset', 'waStafNilaiInput', 'waStafAbsenWbCatat'].forEach((fn) => sama(/tidak diizinkan/.test(coba(fn)), true, fn));
  const q = { idRombel: 'R1', tahun: '2024/2025', semester: 'Genap' };
  coba('waStafLeger', ['TOKEN', q]);
  sama([q.idRombel, q.tahun, q.semester], ['R1', undefined, undefined], 'leger dipaksa semester berjalan');
  g.__API_FN = 'waStafMateriLengkap';
  const d = g.dinasRapikan_({ items: [{ id: 'M1', boleh: true, bolehNilai: true }], bolehTambah: true });
  sama([d.items[0].boleh, d.items[0].bolehNilai, d.bolehTambah, d.hanyaBaca], [false, false, false, true]);
  g.__API_FN = '';
});

// 10. rapor semester lampau & nilai otomatis (v1.39.2)
function rkTiruan() {
  const rombel = {}, perKelas = {};
  [['a10', 'C10', 'C', 10], ['a11', 'C11', 'C', 11], ['a12', 'C12', 'C', 12], ['b9', 'B9', 'B', 9], ['b8', 'B8', 'B', 8]].forEach(([id, nama, pk, k]) => {
    rombel[id] = { id, nama, paket: pk, kelas: k, program: 'PKT-' + pk };
    (perKelas[pk + k] = perKelas[pk + k] || []).push(id);
    (perKelas['*' + k] = perKelas['*' + k] || []).push(id);
  });
  return { rombel, perKelas, nilai: {}, naik: {} };
}
tes('nilRombelPeriode_: kelas pada semester lampau (C12 kini -> C11 tahun lalu -> C10 -> B9)', () => {
  const rk = rkTiruan(), kini = { tahun: '2026/2027', semester: 'Ganjil' };
  sama(g.nilRombelPeriode_(rk, 'W1', 'a12', { tahun: '2025/2026', semester: 'Genap' }, kini), 'a11', 'Genap 25/26');
  sama(g.nilRombelPeriode_(rk, 'W1', 'a12', { tahun: '2025/2026', semester: 'Ganjil' }, kini), 'a11', 'Ganjil 25/26');
  sama(g.nilRombelPeriode_(rk, 'W1', 'a12', { tahun: '2024/2025', semester: 'Genap' }, kini), 'a10', '24/25');
  sama(g.nilRombelPeriode_(rk, 'W1', 'a12', { tahun: '2023/2024', semester: 'Genap' }, kini), 'b9', 'lintas paket');
  sama(g.nilRombelPeriode_(rk, 'W1', 'a12', kini, kini), 'a12', 'semester berjalan');
  sama(g.nilRombelPeriode_(rk, 'W1', 'a12', { tahun: '2026/2027', semester: 'Ganjil' }, { tahun: '2026/2027', semester: 'Genap' }), 'a12', 'Ganjil tahun yang sama');
  // tinggal kelas: tercatat di KENAIKAN KELAS tahun lalu di C12 -> rapor tahun lalu tetap C12
  rk.naik['W2|2025/2026'] = { idRombel: 'a12', keputusan: 'Tinggal' };
  sama(g.nilRombelPeriode_(rk, 'W2', 'a12', { tahun: '2025/2026', semester: 'Genap' }, kini), 'a12', 'tinggal kelas');
  // nilai tahun lalu tercatat di rombel tertentu -> dipakai lebih dulu
  rk.nilai['W3|2025/2026|Ganjil'] = { a11: 4, a10: 1 };
  sama(g.nilRombelPeriode_(rk, 'W3', 'a12', { tahun: '2025/2026', semester: 'Ganjil' }, kini), 'a11', 'dari NILAI');
});
tes('nilKeputusanLampau_: naik 11->12 disimpulkan, kelulusan kelas akhir, catatan tercatat menang', () => {
  const simpan = g.knkInfoRombel_;
  try {
    g.knkInfoRombel_ = (id) => ({ a11: { kelas: 11, akhir: false }, a12: { kelas: 12, akhir: true } }[id]);
    const rk = rkTiruan();
    rk.naik['W9|2025/2026'] = { idRombel: 'a11', keputusan: 'Tinggal' };
    const h = { rk, utama: 'a11', grup: { a11: [{ id: 'W1' }, { id: 'W9' }] } };
    const k = g.nilKeputusanLampau_(h, 'a12', { tahun: '2025/2026', semester: 'Genap' });
    sama([k.keputusan.W1, k.otomatis.W1, k.keputusan.W9, !!k.otomatis.W9, k.info.kelas], ['Naik', true, 'Tinggal', false, 11]);
    // kelas akhir C12 Genap lampau, WB kini masih di C12 -> Tidak Lulus; kini di kelas lebih tinggi tidak mungkin -> Lulus hanya bila naik
    const h2 = { rk, utama: 'a12', grup: { a12: [{ id: 'W5' }] } };
    sama(g.nilKeputusanLampau_(h2, 'a12', { tahun: '2025/2026', semester: 'Genap' }).keputusan.W5, 'Tidak Lulus');
  } finally { g.knkInfoRombel_ = simpan; }
});
tes('nilAcak_: dari KKM sampai 85, tidak sama semua', () => {
  const at = { kkm: 70 }, isi = new Set();
  for (let i = 0; i < 300; i++) { const n = g.nilAcak_(at); if (n < 70 || n > 85 || n !== Math.round(n)) throw new Error('di luar rentang: ' + n); isi.add(n); }
  sama(isi.size > 8, true, 'bervariasi');
  sama(g.nilAcak_({ kkm: 90 }), 90, 'KKM di atas 85');
});
tes('nilUrutPer_: urutan semester', () => {
  sama(g.nilUrutPer_({ tahun: '2025/2026', semester: 'Genap' }) < g.nilUrutPer_({ tahun: '2026/2027', semester: 'Ganjil' }), true);
  sama(g.nilUrutPer_({ tahun: '2026/2027', semester: 'Ganjil' }) < g.nilUrutPer_({ tahun: '2026/2027', semester: 'Genap' }), true);
});

// 11. arsip per semester & data offline (v1.40.0)
tes('arsSebelum_ & kode template offline', () => {
  sama(g.arsSebelum_({ tahun: '2026/2027', semester: 'Ganjil' }), { tahun: '2025/2026', semester: 'Genap' });
  sama(g.arsSebelum_({ tahun: '2026/2027', semester: 'Genap' }), { tahun: '2026/2027', semester: 'Ganjil' });
  const kode = g.oflKode_('a12', { tahun: '2025/2026', semester: 'Genap' }), b = kode.split('|');
  sama([b.length, b[0], g.nxlTandaTangan_(b.slice(0, 4)) === b[4]], [5, 'OFFv1', true]);
  sama(g.nxlTandaTangan_(['OFFv1', 'a11', '2025/2026', 'Genap']) === b[4], false, 'rombel diubah -> tanda tangan beda');
});
tes('arsBarisPeriode_: tanggal, sesi tatap muka, nilai per periode', () => {
  const per = { tahun: '2026/2027', semester: 'Ganjil', dari: '2026-07-01', sampai: '2026-12-31' };
  const t = { v: [['ID Rombel', 'Waktu Kirim'], ['R', '2026-08-01 10:00'], ['R', '2027-01-05 09:00'], ['R', ''], ['R', '2026-12-31 23:00']] };
  sama(g.arsBarisPeriode_(t, { tab: 'Jawaban', tgl: 'Waktu Kirim' }, per), [1, 4]);
  const simpan = g.arsBacaTab_;
  try {
    g.arsBacaTab_ = () => ({ v: [['ID SESI', 'TANGGAL'], ['S1', '2026-09-01'], ['S2', '2027-02-01']] });
    const pw = { v: [['ID PRESENSI', 'JADWAL'], ['p1', 'S1'], ['p2', 'S2'], ['p3', 'S1']] };
    sama(g.arsBarisPeriode_(pw, { tab: 'PRESENSI WB', tgl: '*SESI' }, per), [1, 3]);
  } finally { g.arsBacaTab_ = simpan; }
  const n = { v: [['ID NILAI', 'TAHUN PELAJARAN', 'SEMESTER'], ['a', '2026/2027', 'Ganjil'], ['b', '2026/2027', 'Genap'], ['c', '2025/2026', 'Ganjil']] };
  sama(g.arsBarisPeriode_(n, { tab: 'NILAI', nilai: true }, per), [1]);
  const k = { v: [['TAHUN', 'ID ROMBEL'], ['2026/2027', 'x'], ['2025/2026', 'y']] };
  sama(g.arsBarisPeriode_(k, { tab: 'KENAIKAN KELAS', naik: true }, per), [1]);
});
tes('arsRaporHtml_: kelas saat itu, keputusan naik, catatan data offline', () => {
  const d = { lembaga: { nama: 'PKBM TH', npsn: '1', alamat: 'Jl. X, Kab. Bandung', kepala: 'Bu KS' }, rombel: { nama: 'C11', program: 'PKT-C' },
    periode: { tahun: '2025/2026', semester: 'Genap', sampai: '2026-06-30' }, aturan: { kkm: 70 }, wali: { nama: 'Pak Wali' }, offline: true,
    mapel: [{ kode: 'MTK', nama: 'Matematika' }], wb: [{ idWb: 'W1', nama: 'Ani', nisn: '123', nilai: { MTK: 82 }, predikat: { MTK: 'B' }, rata: 82, peringkat: 1, kehadiran: { Sakit: 1, Izin: 0, Alpa: 2 } }],
    kenaikan: { info: { kelas: 11, akhir: false, kelasBerikut: 12, tingkatRomawi: 'V', tingkatBerikutRomawi: 'VI' }, keputusan: { W1: 'Naik' } } };
  const h = g.arsRaporHtml_(d, d.wb);
  sama(/Rombel<\/td><td>: C11/.test(h), true, 'rombel C11');
  sama(/<b>NAIK<\/b> ke kelas 12/.test(h), true, 'naik ke 12');
  sama(h.includes('30 Juni 2026'), true, 'tanggal akhir semester');
  sama(h.includes('hardcopy'), true, 'catatan offline');
  sama(h.includes('size:215mm 330mm'), true, 'kertas F4 tegak');
  sama(g.arsLegerHtml_(d).includes('size:330mm 215mm'), true, 'leger F4 mendatar');
  d.kenaikan = { info: { kelas: 12, akhir: true }, keputusan: { W1: 'Lulus' } };
  sama(/<b>LULUS<\/b>/.test(g.arsRaporHtml_(d, d.wb)), true, 'kelulusan');
});
tes('kode akses arsip: dibuat admin, salah ditolak, benar membuka mode ubah, khusus pengguna tertentu', () => {
  const simpan = {};
  ['absBaca_', 'wajibAdmin_', 'arsWajib_', 'arsAmbil_', 'arsLog_', 'bacaPengguna_'].forEach((k) => { simpan[k] = g[k]; });
  try {
    const lembar = lembarTiruan(g.ARS.HDR_KODE);
    lembar.appendRow = (r) => lembar.v.push(r.slice());
    g.absBaca_ = (nama) => {
      const v = lembar.v, h = {};
      v[0].forEach((x, i) => { h[String(x).trim().toUpperCase()] = i; });
      return { sh: { appendRow: (r) => v.push(r.slice()), getRange: (r, c) => ({ setValue: (x) => { v[r - 1][c - 1] = x; } }) }, v: v.map((b) => b.slice()), h };
    };
    const admin = { id: 'A1', nama: 'Admin', peran: 'Admin' }, ks = { id: 'K1', nama: 'Bu KS', peran: 'Kepala Sekolah' };
    g.wajibAdmin_ = () => admin;
    g.arsWajib_ = (tok) => (tok === 'TA' ? admin : ks);
    g.arsAmbil_ = () => ({ id: 'ARS-2025-2026-Genap', tahun: '2025/2026', semester: 'Genap' });
    g.arsLog_ = () => {};
    g.bacaPengguna_ = () => [{ id: 'K1', nama: 'Bu KS', peran: 'Kepala Sekolah', status: 'Aktif' }];
    ['arsgagal_K1', 'arsgagal_A1'].forEach((k) => cache.remove(k));
    const k1 = g.waAdminArsipKodeBuat('TA', 'ARS-2025-2026-Genap', { jam: 2, untuk: 'K1' });
    sama([k1.kode.length, /^[A-Z2-9]{8}$/.test(k1.kode)], [8, true]);
    let galat = '';
    try { g.waStafArsipBukaUbah('TK', 'x', 'SALAH123'); } catch (e) { galat = e.message; }
    sama(/salah/.test(galat), true, 'kode salah');
    try { g.waStafArsipBukaUbah('TA', 'x', k1.kode); galat = ''; } catch (e) { galat = e.message; }
    sama(/bukan untuk Anda/.test(galat), true, 'kode khusus KS tidak berlaku untuk admin');
    sama(g.waStafArsipBukaUbah('TK', 'x', k1.kode.toLowerCase()).sukses, true, 'kode benar (huruf kecil pun)');
    sama(g.arsBolehUbah_('TK', { id: 'ARS-2025-2026-Genap' }), true, 'mode ubah terbuka');
    sama(g.arsBolehUbah_('TX', { id: 'ARS-2025-2026-Genap' }), false, 'sesi lain tetap hanya baca');
  } finally { Object.keys(simpan).forEach((k) => { g[k] = simpan[k]; }); }
});

// 12. cegah data ganda siswa (v1.40.2)
tes('idsMirip_/idsSama_/idsSamar_: kasus Yogi (spasi bergeser), salah huruf, urutan kata', () => {
  sama(g.idsSama_('Yogi Janui Saputra', 'YOGI JANU ISAPUTRA'), true, 'spasi bergeser = sama');
  sama(g.idsMirip_('Yogi Janui Saputra', 'YOGI JANU ISAPUTRA'), true);
  sama(g.idsMirip_('Muhamad Ridho', 'MUHAMMAD RIDHO'), true, 'salah 1 huruf');
  sama(g.idsMirip_('Saputra Yogi', 'Yogi Saputra'), true, 'urutan kata');
  sama(g.idsMirip_('Ahmad Faisal', 'Ahmad Naufal'), false, 'orang lain');
  sama(g.idsSamar_('YOGI JANU ISAPUTRA'), 'YOGI J*** I*******');
});
tes('idsSaranLogin_: hanya bila tanggal lahir cocok dan tepat satu nama mirip', () => {
  const simpan = g.getSheetData;
  try {
    g.getSheetData = () => [['ID Rombel', 'Nama Siswa', 'Tanggal Lahir'], ['ROM-KELASC11', 'YOGI JANU ISAPUTRA', '2008-01-11'], ['ROM-KELASC12', 'Ari Setiawan', '1999-06-13']];
    sama(g.idsSaranLogin_('Yogi Janui Saputra', '2008-01-11'), 'YOGI JANU ISAPUTRA');
    sama(g.idsSaranLogin_('Yogi Janui Saputra', '2008-01-12'), '', 'tanggal lahir salah -> tanpa saran');
    sama(g.idsSaranLogin_('Budi', '2008-01-11'), '', 'nama jauh -> tanpa saran');
  } finally { g.getSheetData = simpan; }
});
tes('waDaftarCekIdentitas: NISN/NIK + tanggal lahir harus cocok, nama disamarkan', () => {
  const simpan = {};
  ['sswBacaMenu_', 'idsElRombel_', 'cariSiswa_', 'sswBacaBm_', 'catat_'].forEach((k) => { simpan[k] = g[k]; });
  try {
    g.sswBacaMenu_ = () => ({ wb: [{ id: 'W1', nama: 'YOGI JANU ISAPUTRA', nisn: '0081234567', nik: '3209011101080001', tgl: '2008-01-11', namaRombel: 'C11', status: 'Aktif' }] });
    g.idsElRombel_ = () => 'ROM-KELASC11';
    g.cariSiswa_ = () => null;
    g.sswBacaBm_ = () => ({ rows: [] });
    g.catat_ = () => {};
    cache.remove('idsglobal');
    const a = g.waDaftarCekIdentitas({ nomor: '0081234567', tanggalLahir: '2008-01-11' });
    sama([a.ada, a.namaSamar, a.rombel, a.kelasSiap, a.sudahAkun], [true, 'YOGI J*** I*******', 'C11', true, false]);
    sama(g.idsAmbilKunci_(a.kunci).nama, 'YOGI JANU ISAPUTRA', 'identitas tersimpan di server');
    sama(g.waDaftarCekIdentitas({ nomor: '3209011101080001', tanggalLahir: '2008-01-11' }).ada, true, 'lewat NIK');
    sama(g.waDaftarCekIdentitas({ nomor: '0081234567', tanggalLahir: '2008-01-12' }).ada, false, 'tanggal lahir salah');
    sama(g.waDaftarCekIdentitas({ nomor: '0081234567', tanggalLahir: '2008-01-12' }).namaSamar, undefined, 'tidak membocorkan nama');
  } finally { Object.keys(simpan).forEach((k) => { g[k] = simpan[k]; }); }
});
tes('idsIdentitasTerbaru_: sesi lama ikut ganti nama / pindah rombel (kasus Nadin)', () => {
  const simpan = { gsd: g.getSheetData, st: g.siswaTerdaftar_ };
  try {
    g.getSheetData = () => [['ID Rombel', 'Nama Siswa'], ['ROM-KELASB7', 'Nadin'], ['ROM-KELASC11', 'YOGI JANU ISAPUTRA']];
    g.siswaTerdaftar_ = (n, r) => (r === 'ROM-KELASC11' && n === 'YOGI JANU ISAPUTRA') || (r === 'ROM-KELASB7' && n === 'Nadin');
    sama(g.idsIdentitasTerbaru_('Nadin', 'ROM-KELASB8'), { nama: 'Nadin', idRombel: 'ROM-KELASB7' }, 'pindah rombel, nama unik');
    props.deleteProperty(g.IDS.PROP_GANTI);
    g.idsCatatGanti_({ nama: 'Yogi Janui Saputra', rombel: 'ROM-KELASC11' }, { nama: 'YOGI JANU ISAPUTRA', rombel: 'ROM-KELASC11' });
    sama(g.idsIdentitasTerbaru_('Yogi Janui Saputra', 'ROM-KELASC11'), { nama: 'YOGI JANU ISAPUTRA', idRombel: 'ROM-KELASC11' }, 'peta ganti nama');
    sama(g.idsIdentitasTerbaru_('Orang Lain', 'ROM-KELASB7'), null);
  } finally { g.getSheetData = simpan.gsd; g.siswaTerdaftar_ = simpan.st; }
});

// 13. peran & izin (v1.41.0)
tes('izin: setiap fungsi staf/admin punya fitur; fungsi baca Dinas tetap "lihat"', () => {
  const nama = Object.keys(g).filter((k) => /^wa(Staf|Admin)[A-Za-z0-9]+$/.test(k) && typeof g[k] === 'function');
  sama(nama.length > 250, true, 'fungsi termuat');
  const tanpa = nama.filter((n) => !g.izFitur_(n));
  sama(tanpa, [], 'fungsi tanpa fitur (tambahkan polanya di IZN.FITUR)');
  const dinasUbah = Object.keys(g.DINAS.BACA).filter((n) => g.izFitur_(n) !== 'umum' && g.izAksi_(n) !== 'lihat');
  sama(dinasUbah, [], 'fungsi baca Dinas tergolong ubah');
  sama([g.izAksi_('waStafMateriSimpan'), g.izAksi_('waStafMateriLengkap'), g.izAksi_('waStafMateriStatus')], ['ubah', 'lihat', 'ubah']);
});
tes('izin: peran kustom dibatasi di bawah peran dasar, Admin bawaan selalu penuh', () => {
  const simpan = g.izData_;
  try {
    g.izData_ = () => ({ peran: { 'wali kelas': { nama: 'Wali Kelas', dasar: 'Tutor', status: 'Aktif' } }, izin: { 'Wali Kelas': { nilaiRapor: 'lihat', ruangStaf: 'tidak' }, 'Front Office': { kartuQr: 'tidak' } } });
    const p = { id: 'U1', nama: 'Bu Wali', peran: 'Tutor', peranKustom: 'Wali Kelas' };
    const peta = g.izPetaPengguna_(p);
    sama([peta.nilaiRapor, peta.ruangStaf, peta.mapelSaya, peta.keuangan], ['lihat', 'tidak', 'ubah', undefined]);
    const coba = (fn, orang) => { g.__API_FN = fn; g.__IZN_OK = ''; try { g.izPeriksa_(orang); return 'boleh'; } catch (e) { return 'tolak'; } };
    sama([coba('waStafLeger', p), coba('waStafNilaiInput', p), coba('waStafRuangKirim', p), coba('waStafMateriSimpan', p), coba('waStafProfil', p)], ['boleh', 'tolak', 'tolak', 'boleh', 'boleh']);
    sama(coba('waStafKeuSimpan', p), 'boleh', 'fitur di luar peran dasar: diserahkan ke pemeriksaan lama');
    sama(coba('waAdminKartuQr', { id: 'F1', peran: 'Front Office' }), 'tolak', 'peran bawaan pun bisa dibatasi');
    sama(coba('waAdminPeranSimpan', { id: 'A1', peran: 'Admin' }), 'boleh', 'Admin bawaan penuh');
    g.__API_FN = '';
  } finally { g.izData_ = simpan; }
});

tes('izin tahap 2: fitur tambahan di luar peran dasar berjalan dengan peran pelaksana, hanya untuk fitur itu', () => {
  const simpan = g.izData_;
  try {
    g.izData_ = () => ({ peran: {}, izin: { 'Front Office': { dataInduk: 'lihat', laporanHadir: 'ubah', pengguna: 'ubah', siswaRombel: 'ubah' } } });
    const fo = { id: 'F1', nama: 'Mbak FO', peran: 'Front Office' };
    const peta = g.izPetaPengguna_(fo);
    sama([peta.dataInduk, peta.siswaRombel, peta.pengguna, peta.keuangan], ['lihat', 'ubah', undefined, undefined], 'fitur terkunci (pengguna) tidak bisa diberikan');
    const jalan = (fn) => { g.__API_FN = fn; g.__IZN_OK = ''; g.__IZN_PROKSI = null; try { return g.izPeriksa_(fo); } catch (e) { return 'tolak'; } };
    const a = jalan('waStafIndukDaftar');
    sama([a.peran, a.proksi, a.nama], ['Kepala Sekolah', 'dataInduk', 'Mbak FO'], 'lihat Data Induk sebagai pelaksana');
    sama(jalan('waStafIndukSimpan').peran, 'Front Office', 'ubah Data Induk tidak diberikan -> aturan lama (tidak dinaikkan)');
    sama(jalan('waStafPinReset').peran, 'Admin', 'siswaRombel ubah -> pelaksana Admin');
    sama(jalan('waStafKeuSimpan').peran, 'Front Office', 'fitur lain tidak ikut naik');
    sama(jalan('waAdminSimpanPengguna').peran, 'Front Office', 'fitur terkunci tidak pernah dinaikkan');
    // panggilan stafDariToken_ kedua dalam permintaan yang sama tetap memakai pelaksana
    g.__API_FN = 'waStafIndukDaftar'; g.__IZN_OK = ''; g.__IZN_PROKSI = null;
    g.izPeriksa_(fo);
    sama(g.izPeriksa_(fo).peran, 'Kepala Sekolah', 'panggilan kedua');
    g.__API_FN = '';
    const dinas = g.izPetaPeran_('Dinas Pendidikan', 'Dinas Pendidikan');
    sama(dinas.keuangan, undefined, 'Dinas tidak dapat diberi fitur tambahan');
  } finally { g.izData_ = simpan; g.__IZN_PROKSI = null; }
});

console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
