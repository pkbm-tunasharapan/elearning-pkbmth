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
  return { get: (k) => (m.has(k) ? m.get(k) : null), put: (k, v) => { m.set(k, String(v)); }, remove: (k) => { m.delete(k); }, removeAll: (ks) => { ks.forEach((k) => m.delete(k)); },
    getAll: (ks) => { const o = {}; ks.forEach((k) => { if (m.has(k)) o[k] = m.get(k); }); return o; },
    putAll: (o) => { Object.keys(o).forEach((k) => m.set(k, String(o[k]))); }, _peta: m };
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
  computeDigest: (alg, v) => Array.from(crypto.createHash(alg === 'SHA_512' ? 'sha512' : 'sha256').update(String(v), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
  DigestAlgorithm: { SHA_256: 'SHA_256', SHA_512: 'SHA_512' }, Charset: { UTF_8: 'UTF_8' },
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
  ['taBaca_', 'taInfo_', 'nilPeriode_', 'abSesiWajib_', 'brdMapelBm_', 'abBaca_', 'getSheetData', 'materiTanpaKonten_', 'taParse_', 'hdrOnline_', 'nilSiswaBm_'].forEach((k) => { simpan[k] = g[k]; });
  try {
    g.taBaca_ = () => ({ sesiPerSemester: 3 });
    g.taInfo_ = (c, smt, n) => ({ status: n < 3 ? 'lewat' : 'berjalan' });
    g.nilPeriode_ = () => ({ smt: 1 });
    g.abSesiWajib_ = () => true;
    g.brdMapelBm_ = () => ({ M1: { idRombel: 'R1', rombel: 'Kelas 10', nama: 'MTK' }, M2: { idRombel: 'R1', rombel: 'Kelas 10', nama: 'IPA' } });
    g.abBaca_ = () => [{ smt: 1, n: 3, idMapel: 'M1', kunciNama: g.normNama_('Ani') }, { smt: 1, n: 3, idMapel: 'M2', kunciNama: g.normNama_('Ani') },
      { smt: 1, n: 3, idMapel: 'M1', kunciNama: g.normNama_('Budi') }, { smt: 1, n: 2, idMapel: 'M2', kunciNama: g.normNama_('Budi') }];
    g.materiTanpaKonten_ = () => g.getSheetData('Materi');
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
  } finally { g.izData_ = simpan; g.__IZN_PROKSI = null; }
});

tes('izin tahap 3: Dinas diberi fitur tambahan (hanya lihat), diturunkan admin, cakupan "semua rombel"', () => {
  const simpan = g.izData_;
  try {
    g.izData_ = () => ({
      peran: { 'operator nilai': { nama: 'Operator Nilai', dasar: 'Tutor', status: 'Aktif', cakupan: 'semua' } },
      izin: { 'Dinas Pendidikan': { keuangan: 'ubah', rpp: 'tidak' } }
    });
    const peta = g.izPetaPeran_('Dinas Pendidikan', 'Dinas Pendidikan');
    sama([peta.keuangan, peta.rpp, peta.pengguna], ['lihat', 'tidak', undefined], 'Dinas: tambahan dibatasi lihat; fitur terkunci tidak');
    const pd = { id: 'D1', nama: 'Bidang PNF', peran: 'Dinas Pendidikan' };
    sama([g.izDinasBoleh_('waStafKeuDaftar', pd), g.izDinasBoleh_('waStafKeuSimpan', pd), g.izDinasBoleh_('waAdminDaftar', pd)], [true, false, false], 'Dinas baca keuangan boleh, ubah tidak');
    const coba = (fn, orang) => { g.__API_FN = fn; g.__IZN_OK = ''; g.__IZN_PROKSI = null; try { return g.dinasSaring_(orang); } catch (e) { return 'tolak'; } };
    sama(coba('waStafKeuDaftar', pd).peran, 'Kepala Sekolah', 'lolos saringan Dinas');
    sama(coba('waStafKeuSimpan', pd), 'tolak', 'tulis tetap ditolak');
    // RPP diturunkan ke "tidak": walau ada di daftar baca Dinas, penjaga menolak
    g.__API_FN = 'waStafRppBaca'; g.__IZN_OK = ''; g.__IZN_PROKSI = null;
    let galat = '';
    try { g.izPeriksa_(g.dinasSaring_(pd)); } catch (e) { galat = e.message; }
    sama(/tidak memiliki izin/.test(galat), true, 'fitur Dinas yang diturunkan admin ditolak');
    // cakupan semua: peran Tutor membaca leger semua rombel sebagai Kepala Sekolah, tetapi mengubah tetap sebagai Tutor
    const op = { id: 'U9', nama: 'Bu Op', peran: 'Tutor', peranKustom: 'Operator Nilai' };
    const jalan = (fn) => { g.__API_FN = fn; g.__IZN_OK = ''; g.__IZN_PROKSI = null; return g.izPeriksa_(op); };
    sama([jalan('waStafLeger').peran, jalan('waStafNilaiInput').peran, jalan('waStafMateriLengkap').peran], ['Kepala Sekolah', 'Tutor', 'Kepala Sekolah']);
    g.__API_FN = '';
  } finally { g.izData_ = simpan; g.__IZN_PROKSI = null; }
});

// 14. kecepatan (v1.42.0)
tes('kecepatan: jalur cepat pemeriksaan chat hanya bila pasti tidak ada yang baru', () => {
  ['kcp|chat', 'kcp|nv'].forEach((k) => cache.remove(k));
  sama(g.kcpTakAdaBaru_(1000, 1000), false, 'penanda belum ada -> jalur lengkap');
  g.kcpTanda_('chat', 5000); g.kcpTanda_('nv', 4000);
  sama(g.kcpTakAdaBaru_(6000, 6000), true, 'tidak ada yang baru');
  sama(g.kcpTakAdaBaru_(4000, 6000), false, 'ada chat baru');
  sama(g.kcpTakAdaBaru_(6000, 3000), false, 'ada notifikasi baru');
  sama(g.kcpTakAdaBaru_(0, 6000), false, 'pemeriksaan pertama -> jalur lengkap');
  g.kcpIsiBila_('chat', 1);
  sama(g.kcpAkhir_('chat'), 5000, 'isi-bila tidak menimpa penanda yang ada');
});

// 15. alur keuangan (v1.44.0)
tes('keuangan: status referral pengembalian dana & format rupiah bertanda', () => {
  sama(g.rfStatus_({ 'STATUS BAYAR': 'Pengembalian Diajukan', 'STATUS BERKAS': 'Terverifikasi' }), 'Pengembalian Diajukan', 'diajukan');
  sama(g.rfStatus_({ 'STATUS BAYAR': 'Dikembalikan', 'STATUS BERKAS': 'Ditolak' }), 'Dana Dikembalikan', 'dikembalikan');
  sama(g.rfStatus_({ 'STATUS BAYAR': 'Lunas', 'STATUS BERKAS': 'Terverifikasi' }), 'Selesai', 'selesai tetap');
  sama(g.kalRp_(-150000), '-Rp150.000', 'minus');
  sama(g.kalRp_(2500), 'Rp2.500', 'plus');
  sama(g.kalTglBayar_({ 'VERIF BAYAR PADA': '2026-11-02 10:15' }), '2026-11-02', 'tanggal bayar');
});

// 16. pajak (v1.46.0)
tes('pajak: PPN termasuk harga & PPh dihitung dari DPP', () => {
  const a = g.pjkHitung_(111000, { aktif: true }, null, 'Pengeluaran');
  sama(a.dpp, 100000, 'dpp'); sama(a.ppn, 11000, 'ppn 11%');
  const b = g.pjkHitung_(1000000, null, { jenis: 'PPh 23' }, 'Pengeluaran');
  sama(b.pph, 20000, 'pph 23 2%'); sama(b.ppn, 0, 'tanpa ppn');
  const c = g.pjkHitung_(1110000, { aktif: true }, { jenis: 'PPh 23', tarif: 2 }, 'Pengeluaran');
  sama(c.pph, 20000, 'pph dari dpp');
  sama(g.pjkHitung_(500000, null, { jenis: 'PPh 21' }, 'Pemasukan').pph, 0, 'pemasukan tidak dipotong');
  sama(g.pjkHitung_(500000, null, { jenis: 'PPh 21', tarif: 2.5 }, 'Pengeluaran').pph, 12500, 'pph 21 2,5%');
});

// 17. metode bayar DOKU & biaya admin ditanggung pembayar (v1.49.0)
tes('gateway: katalog metode, paylater disaring, total tetap', () => {
  const cfg = { metodeBayar: 'VIRTUAL_ACCOUNT_BCA | VA BCA | 0 | 4000\nQRIS | QRIS | 0.7 | 0\nPEER_TO_PEER_AKULAKU | Akulaku | 0 | 0\nEMONEY_OVO | OVO | 1,5 | 0' };
  const m = g.gwMetode_(cfg);
  sama(m.map((x) => x.kode).join(','), 'VIRTUAL_ACCOUNT_BCA,QRIS,EMONEY_OVO', 'akulaku disaring');
  sama(g.gwHitungTotal_(25000, m[0]).total, 29000, 'va: tagihan + 4000');
  const q = g.gwHitungTotal_(25000, m[1]);
  sama(q.total, 25177, 'qris gross-up');
  sama(q.total - Math.round(q.total * 0.007) >= 25000, true, 'lembaga terima utuh');
  sama(g.gwBiaya_(29000, 'VIRTUAL_ACCOUNT_BCA', cfg).biaya, 4000, 'biaya doku va');
  sama(g.gwBiaya_(100000, 'EMONEY_OVO', cfg).biaya, 1500, 'biaya doku ovo');
  sama(g.gwMetodeCari_('PEER_TO_PEER_AKULAKU', cfg), null, 'paylater tidak bisa dipilih');
});

// 18. pusat notifikasi per peran (v1.50.0)
tes('notifikasi: sasaran siswa, tutor, dan peran', () => {
  const at = { tagihan_baru: ['Siswa'], honor_dibayar: ['Tutor'], pengeluaran_menunggu: ['Superadmin'], bayar_online_masuk: [] };
  const ev = (jenis, o) => Object.assign({ jenis: jenis, siswa: [], tutor: [], staf: [] }, o || {});
  const ctxS = { wb: () => 'WB-1', tutor: () => '' }, ctxT = { wb: () => '', tutor: () => 'TT-9' };
  const siswa = { jenis: 'siswa' }, sa = { jenis: 'staf', id: 'U1', peran: 'Superadmin' }, tutor = { jenis: 'staf', id: 'U2', peran: 'Tutor' };
  sama(g.npCocok_(ev('tagihan_baru', { siswa: ['WB-1', 'WB-2'] }), siswa, at, ctxS), true, 'siswa sasaran');
  sama(g.npCocok_(ev('tagihan_baru', { siswa: ['WB-3'] }), siswa, at, ctxS), false, 'siswa lain');
  sama(g.npCocok_(ev('tagihan_baru', { siswa: ['WB-1'] }), sa, at, ctxS), false, 'staf tidak menerima notifikasi siswa');
  sama(g.npCocok_(ev('honor_dibayar', { tutor: ['TT-9'] }), tutor, at, ctxT), true, 'tutor sasaran');
  sama(g.npCocok_(ev('pengeluaran_menunggu'), sa, at, ctxS), true, 'peran dicentang');
  sama(g.npCocok_(ev('pengeluaran_menunggu'), tutor, at, ctxT), false, 'peran tidak dicentang');
  sama(g.npCocok_(ev('bayar_online_masuk'), sa, at, ctxS), false, 'jenis dimatikan admin');
});

// 19. masa ujian serentak: cakupan bank soal & kolom jadwal (v1.52.0)
tes('masa ujian: cakupan tryout/lainnya dan kolom Masa', () => {
  sama(g.muJenisPool_('UTS', 'UAS'), 'UTS', 'uts tetap uts');
  sama(g.muJenisPool_('TRYOUT', 'UTS'), 'UTS', 'tryout cakupan uts');
  sama(g.muJenisPool_('LAIN', ''), 'UAS', 'lainnya bawaan seluruh semester');
  sama(g.UJ.H.JADWAL.indexOf('Masa') > 0 && g.UJ.H.JADWAL.indexOf('Cakupan') > 0, true, 'kolom jadwal');
  const j = g.ujJadwalObj_({ 'Jenis': 'TRYOUT', 'Cakupan': 'UTS', 'Masa': 'MU-1', 'Tanggal': '2026-11-16', 'Jam Mulai': '07:30', 'Durasi Menit': 90 });
  sama(j.jenisPool, 'UTS', 'pool jadwal tryout');
  sama(j.masa, 'MU-1', 'masa terbaca');
  sama(g.ujJadwalObj_({ 'Jenis': 'UAS', 'Cakupan': 'UTS' }).jenisPool, 'UAS', 'uas abaikan cakupan');
  sama(g.nilGerbangUjian_({ jenis: 'TRYOUT' }, 'R', 'N'), '', 'tryout tanpa syarat hadir');
});

// 20. pengawas ujian: penugasan efektif, token, slot jadwal (v1.53.0)
tes('pengawas: penugasan per slot menimpa semua slot', () => {
  const t = [
    { SLOT: '*', ROMBEL: 'R1', RUANG: 'Ruang 1', 'ID PENGAWAS': 'U1', 'NAMA PENGAWAS': 'A' },
    { SLOT: 'SL-2', ROMBEL: 'R1', RUANG: '', 'ID PENGAWAS': 'U2', 'NAMA PENGAWAS': 'B' },
  ];
  sama(g.pwEfektif_(t, 'SL-1', 'R1').idPengawas, 'U1', 'bawaan semua slot');
  sama(g.pwEfektif_(t, 'SL-2', 'R1').idPengawas, 'U2', 'khusus slot');
  sama(g.pwEfektif_(t, 'SL-2', 'R1').ruang, 'Ruang 1', 'ruang ikut bawaan');
  sama(g.pwEfektif_(t, 'SL-1', 'R9'), null, 'rombel tanpa pengawas');
  sama(/^[A-HJ-NP-Z2-9]{6}$/.test(g.muTokenBaru_()), true, 'token 6 karakter tanpa O/0/I/1');
  sama(g.ujJadwalObj_({ 'Jenis': 'UTS', 'Catatan': 'Masa ujian X (slot SL-ABC)' }).slot, 'SL-ABC', 'slot dari catatan lama');
  sama(g.ujJadwalObj_({ 'Jenis': 'UTS', 'Slot': 'SL-9' }).slot, 'SL-9', 'kolom slot');
});
tes('notifikasi: pengajuan tutor hanya untuk yang punya akses fitur', () => {
  const at = { tutor_mapel_baru: ['Admin'] };
  const ev = { jenis: 'tutor_mapel_baru', siswa: [], tutor: [], staf: [] };
  const ctx = { wb: () => '', tutor: () => '' };
  sama(g.npCocok_(ev, { jenis: 'staf', id: 'U1', peran: 'Admin' }, at, ctx), true, 'admin');
  sama(g.npCocok_(ev, { jenis: 'staf', id: 'U2', peran: 'Tutor' }, at, ctx), false, 'tutor tidak');
  sama(g.npCocok_(ev, { jenis: 'staf', id: 'U3', peran: 'Admin' }, { tutor_mapel_baru: [] }, ctx), false, 'dimatikan');
});

// 21. satu perangkat per ujian (v1.54.0)
tes('perangkat: aplikasi lama tanpa ID perangkat', () => {
  const u = g.pwUraiPerangkat_('');
  sama(u.id, '', 'tanpa id'); sama(u.sidik, '', 'tanpa sidik');
  sama(g.pwPerangkat_({ masa: 'MU-1', idUjian: 'U1' }, 'R', 'N', '', true), 'Perbarui aplikasi TH.E-Course ke versi terbaru untuk mengikuti ujian ini.', 'masa ujian wajib aplikasi baru');
  sama(g.pwPerangkat_({ masa: '', idUjian: 'U1' }, 'R', 'N', '', true), '', 'ujian biasa tetap boleh');
  sama(g.pwPerangkat_({ masa: 'MU-1', idUjian: 'U1' }, 'R', 'N', '', false), '', 'kirim jawaban dari aplikasi lama tidak diblokir');
  sama(g.pwPerangkat_(null, 'R', 'N', 'x|y', true), '', 'tanpa jadwal');
});

// 22. sanksi bertingkat (v1.55.0)
tes('sanksi: hitungan kunci, berat, dan reset oleh keputusan', () => {
  const L = (w, j) => ({ waktu: '2026-11-16 08:' + w, jenis: j });
  const a = g.pwRingkasSanksi_([L('01', 'Keluar aplikasi'), L('02', 'Keluar aplikasi - ujian terkunci'), L('05', 'Kunci dibuka pengawas'), L('09', 'Keluar aplikasi - ujian terkunci')]);
  sama(a.kunci, 2, 'dua kali terkunci'); sama(a.berat, false, 'belum berat');
  const b = g.pwRingkasSanksi_([L('09', 'Keluar aplikasi - ujian terkunci'), L('10', 'Permintaan buka kunci ke pimpinan')]);
  sama(b.minta, true, 'menunggu pimpinan');
  const c = g.pwRingkasSanksi_([L('09', 'Layar terbagi / jendela mengambang - ujian terkunci'), L('10', 'Pelanggaran berat - perlu ditinjau'), L('20', 'Keputusan pimpinan: susulan 17 Nov'), L('30', 'Keluar aplikasi - ujian terkunci')]);
  sama(c.berat, false, 'keputusan menghapus status berat'); sama(c.kunci, 1, 'hitungan mulai lagi'); sama(c.kunciTotal, 2, 'total tetap');
  const s = g.pwSanksi_();
  sama(s.pimpinanMulai <= s.beratMulai, true, 'urutan aturan');
});

// 23. syarat pembayaran ujian & remedial (v1.57.0)
tes('syarat bayar: konfigurasi masa dan batas 2 hari remedial', () => {
  sama(g.sbMasaBayar_({ syaratBayar: 50000, kategoriBayar: 'UJN', idTagihan: 'TAG-1' }).aktif, true, 'aktif bila nominal > 0');
  sama(g.sbMasaBayar_({ syaratBayar: 0 }).aktif, false, 'nonaktif bila 0');
  sama(g.sbMasaBayar_(null).aktif, false, 'tanpa masa');
  sama(g.sbStatusWb_({ syaratBayar: 0 }, { id: 'W1' }).lunas, true, 'tanpa syarat dianggap lunas');
  sama(g.sbGerbang_({ masa: '' }, 'R', 'N'), '', 'ujian tanpa masa tidak dicek');
  sama(g.sbTertahan_(null, 'R', 'N'), null, 'tanpa jadwal');
  sama(g.SB.REMEDIAL_JAM, 48, 'remedial 2 hari');
  sama(g.sbJamSejak_('bukan tanggal'), 0, 'waktu tidak sah');
});

// 24. laporan kesiapan sistem (v1.58.0)
tes('kesiapan: penggolongan alasan gagal mulai & rentang tanggal', () => {
  sama(g.kuAlasanGagal_('ujian MTR-1 - Token ujian salah. Minta token dari pengawas'), 'Token salah / belum diisi', 'token');
  sama(g.kuAlasanGagal_('ujian MTR-1 - syarat kehadiran'), 'Syarat kehadiran', 'kehadiran');
  sama(g.kuAlasanGagal_('ujian MTR-1 - syarat pembayaran'), 'Syarat pembayaran', 'pembayaran');
  sama(g.kuAlasanGagal_('ujian MTR-1 - perangkat lain'), 'Perangkat lain', 'perangkat');
  sama(g.kuAlasanGagal_('ujian MTR-1 - PIN salah'), 'PIN salah', 'pin');
  sama(g.kuAlasanGagal_('ujian MTR-1 - Ujian belum dibuka. Dijadwalkan'), 'Belum waktunya', 'belum buka');
  sama(g.kuDalam_('2026-11-16 08:00:00', '2026-11-16', '2026-11-20'), true, 'dalam rentang');
  sama(g.kuDalam_('2026-11-21 08:00:00', '2026-11-16', '2026-11-20'), false, 'luar rentang');
  sama(g.KU.FUNGSI.indexOf('waMulaiUjian') >= 0, true, 'fungsi ujian dipantau');
});

// 25. unit belajar & layanan siswa (v1.60.0)
tes('unit belajar: normalisasi layanan & rencana perubahan label', () => {
  sama([g.ubNormLayanan_('flexi'), g.ubNormLayanan_('Setara Reguler'), g.ubNormLayanan_(' REGULER '), g.ubNormLayanan_('')], ['Flexi', 'Reguler', 'Reguler', '']);
  let galat = '';
  try { g.ubNormLayanan_('Paket C'); } catch (e) { galat = e.message; }
  sama(/Reguler atau Flexi/.test(galat), true, 'layanan tak dikenal ditolak');
  sama(g.ubRencana_({ unit: 'U1', layanan: 'Flexi' }, 'U1', null), null, 'tidak ada perubahan');
  sama(g.ubRencana_({ unit: 'U1', layanan: 'Flexi' }, 'U2', null), { unitLama: 'U1', unitBaru: 'U2', layananLama: 'Flexi', layananBaru: 'Flexi' }, 'pindah unit, layanan tetap');
  sama(g.ubRencana_(undefined, null, 'Reguler'), { unitLama: '', unitBaru: '', layananLama: '', layananBaru: 'Reguler' }, 'siswa baru: hanya layanan');
  sama(g.ubRencana_({ unit: 'U1', layanan: 'Reguler' }, '', null), { unitLama: 'U1', unitBaru: '', layananLama: 'Reguler', layananBaru: 'Reguler' }, 'kosongkan unit');
  sama([g.izFitur_('waStafUnitData'), g.izFitur_('waStafUnitTetapkan')], ['unitBelajar', 'unitBelajar'], 'fitur terdaftar');
  sama([g.izAksi_('waStafUnitData'), g.izAksi_('waStafUnitRiwayat'), g.izAksi_('waStafUnitSimpan'), g.izAksi_('waStafUnitTetapkan')], ['lihat', 'lihat', 'ubah', 'ubah']);
  let tolak = '';
  try { g.ubWajib_({ peran: 'Kepala Sekolah' }); } catch (e) { tolak = e.message; }
  sama(/hanya oleh Admin/.test(tolak), true, 'peran lain ditolak');
  g.ubWajib_({ peran: 'Superadmin' });
  let tolakUbah = '';
  try { g.ubWajib_({ peran: 'Superadmin' }, true); } catch (e) { tolakUbah = e.message; }
  sama(/hanya oleh Admin/.test(tolakUbah), true, 'Superadmin hanya melihat');
  g.ubWajib_({ peran: 'Admin' }, true);
});

// 26. koordinator unit (v1.61.0)
tes('koordinator unit: peran, cakupan unit, izin & notifikasi khusus akun', () => {
  sama([g.normPeran_('koordinator unit'), g.normPeran_('Koordinator Unit')], ['Koordinator Unit', 'Koordinator Unit']);
  sama(g.IZN.BAWAAN.indexOf('Koordinator Unit') >= 0 && g.BC.PERAN.indexOf('Koordinator Unit') >= 0, true, 'terdaftar sebagai peran bawaan');
  sama([g.izFitur_('waStafPantauUnit'), g.izAksi_('waStafPantauUnit'), g.izFitur_('waStafUnitSimpan')], ['pantauanUnit', 'lihat', 'unitBelajar']);
  const simpan = g.ubUnit_;
  g.ubUnit_ = () => [
    { id: 'U1', nama: 'Unit 1', aktif: true, koordinator: ['P1'] },
    { id: 'U2', nama: 'Unit 2', aktif: true, koordinator: ['P1', 'P2'] },
    { id: 'U3', nama: 'Unit 3', aktif: false, koordinator: ['P1'] },
  ];
  try {
    sama(g.ubUnitSaya_({ id: 'P1', peran: 'Koordinator Unit' }).map((u) => u.id), ['U1', 'U2'], 'hanya unit aktif yang dipegang');
    sama(g.ubUnitSaya_({ id: 'P2', peran: 'Koordinator Unit' }).map((u) => u.id), ['U2']);
    sama(g.ubUnitSaya_({ id: 'X', peran: 'Kepala Sekolah' }).length, 2, 'KS melihat semua unit aktif');
    sama(g.ubUnitSaya_({ id: 'P1', peran: 'Tutor' }).length, 0, 'tutor tidak');
  } finally { g.ubUnit_ = simpan; }
  const at = g.npAturan_(), ctx = { wb: () => '', tutor: () => '' };
  const e = { jenis: 'unit_mingguan', staf: ['P1'], siswa: [], tutor: [] };
  sama(g.npCocok_(e, { jenis: 'staf', id: 'P1', peran: 'Koordinator Unit' }, at, ctx), true, 'koordinator yang dituju');
  sama(g.npCocok_(e, { jenis: 'staf', id: 'P2', peran: 'Koordinator Unit' }, at, ctx), false, 'koordinator unit lain tidak menerima');
  sama(g.npCocok_(e, { jenis: 'staf', id: 'A1', peran: 'Admin' }, at, ctx), false, 'peran lain tidak menerima');
  sama(g.ubSkor_({ kurang: [1], lewat: 5 }) > g.ubSkor_({ kurang: [], lewat: 5 }), true, 'kurang hadir diurutkan dulu');
});

// 27. impor label unit dari Excel (v1.61.0)
tes('impor label unit: baca baris templat, cocokkan ID/NISN, galat per baris', () => {
  const U1 = { id: 'UNIT-1', nama: 'Unit 1 Cibinong', aktif: true }, U2 = { id: 'UNIT-2', nama: 'Unit 2', aktif: false };
  const unitPeta = { 'unit 1 cibinong': U1, 'UNIT-1': U1, 'unit 2': U2, 'UNIT-2': U2 };
  const wb = { 'WB-1': { id: 'WB-1', nama: 'Ani' }, 'WB-2': { id: 'WB-2', nama: 'Budi' }, 'WB-3': { id: 'WB-3', nama: 'Cici' }, 'WB-4': { id: 'WB-4', nama: 'Dodi' } };
  const nisnKe = { '0012345678': 'WB-3' };
  const lab = { 'WB-2': { unit: 'UNIT-1', layanan: 'Reguler' }, 'WB-4': { unit: 'UNIT-1', layanan: 'Flexi' } };
  const baris = [
    ['LABEL UNIT BELAJAR'], ['Diunduh', 'x'], [], [], [], [], [],
    ['NO', 'ID WB', 'NISN', 'NAMA', 'ROMBEL', 'UNIT', 'LAYANAN'],
    ['1', 'WB-1', '', 'Ani', 'C10', 'UNIT 1  cibinong', 'flexi'],      // baru: unit & layanan
    ['2', 'WB-2', '', 'Budi', 'C10', 'Unit 1 Cibinong', 'Reguler'],   // sama
    ['3', 'SALAH', '0012345678', 'Cici', 'C10', '', 'Setara Reguler'], // cocok lewat NISN, hanya layanan
    ['4', 'WB-4', '', 'Dodi', 'C10', '-', ''],                         // kosongkan unit
    ['5', 'WB-1', '', 'Ani', 'C10', 'Unit 1 Cibinong', ''],            // dobel
    ['6', 'WB-9', '', 'Eko', 'C10', 'Unit 1 Cibinong', ''],            // tidak ada
    ['7', 'WB-2', '', 'Budi', 'C10', 'Unit 2', ''],                    // dobel (WB-2 sudah) -> galat dobel
    ['8', '', '', '', '', '', ''],
    ['9', 'WB-3', '', 'Cici', 'C10', '', ''],                          // kosong -> dilewati (tapi dobel? kosong dulu)
  ];
  const r = g.ubRencanaImpor_(baris, unitPeta, wb, nisnKe, lab);
  sama(r.item, [
    { id: 'WB-1', unit: 'UNIT-1', layanan: 'Flexi' },
    { id: 'WB-3', unit: null, layanan: 'Reguler' },
    { id: 'WB-4', unit: '', layanan: null },
  ], 'rencana perubahan');
  sama([r.sama, r.kosong, r.galat.length], [1, 1, 3], 'sama/kosong/galat');
  sama(r.galat.map((x) => x.baris), [13, 14, 15], 'nomor baris galat');
  const r2 = g.ubRencanaImpor_([['ID WB', 'UNIT', 'LAYANAN'], ['WB-1', 'Unit 2', ''], ['WB-3', 'Unit 9', ''], ['WB-4', '', 'Paket C']], unitPeta, wb, nisnKe, lab);
  sama(r2.galat.map((x) => x.alasan), ['Unit 2 nonaktif', 'unit "Unit 9" tidak dikenal', 'layanan "Paket C" harus Reguler atau Flexi']);
  let galat = '';
  try { g.ubRencanaImpor_([['A', 'B']], unitPeta, wb, nisnKe, lab); } catch (e) { galat = e.message; }
  sama(/judul kolom/.test(galat), true, 'templat salah ditolak');
});

// 28. pemetaan & kehadiran per unit (v1.62.0)
tes('unit: kunci unit, irisan jadwal, bentrok rombel per unit', () => {
  sama([g.ubKunci_(['U2', 'U1', 'U2', '']), g.ubKunci_(' U3 , U1'), g.ubKunci_('')], ['U1,U2', 'U1,U3', '']);
  sama([g.ubIris_('', 'U1'), g.ubIris_('U1,U2', 'U2'), g.ubIris_('U1', 'U2')], [true, true, false]);
  sama([g.ubDalam_('', 'U1'), g.ubDalam_('U1,U2', 'U2'), g.ubDalam_('U1,U12', 'U2'), g.ubDalam_('U1', '')], [true, true, false, false]);
  const pm = [{ id: 'A', aktif: true, hari: 'Senin', mulai: '08:00', selesai: '09:00', idRombel: 'R1', kodeMapel: 'MTK', idTutor: 'T1', unit: 'U1' }];
  const d = { hari: 'Senin', mulai: '08:00', selesai: '09:00', idRombel: 'R1', kodeMapel: 'MTK', idTutor: 'T2' };
  sama(g.jadBentrok_(pm, Object.assign({ unit: 'U2' }, d), '').length, 0, 'unit berbeda tidak bentrok');
  sama(g.jadBentrok_(pm, Object.assign({ unit: 'U1' }, d), '').length, 1, 'unit sama bentrok');
  sama(g.jadBentrok_(pm, Object.assign({ unit: '' }, d), '').length, 1, 'sesi bersama bentrok');
});
tes('unit: kehadiran tatap muka hanya sesi yang berlaku; Flexi tidak dirugikan', () => {
  const simpan = g.ubPetaSiswa_;
  g.ubPetaSiswa_ = () => ({ W1: { unit: 'U1', layanan: 'Reguler' }, W2: { unit: 'U2', layanan: 'Reguler' }, W3: { unit: 'U1', layanan: 'Flexi' } });
  try {
    const perKey = { 'R|M': [{ id: 'S1', unit: '' }, { id: 'S2', unit: 'U1' }, { id: 'S3', unit: 'U2' }, { id: 'S4', unit: 'U1' }] };
    const rec = { 'W1|S2': true, 'W3|S1': true, 'W4|S3': true };
    sama(g.ubTmWb_(perKey, rec, 'R|M', 'W1', 1, 4), { h: 1, t: 3 }, 'unit 1: sesi bersama + 2 sesi unit 1');
    sama(g.ubTmWb_(perKey, rec, 'R|M', 'W2', 0, 4), { h: 0, t: 2 }, 'unit 2: sesi bersama + sesi unit 2');
    sama(g.ubTmWb_(perKey, rec, 'R|M', 'W3', 1, 4), { h: 1, t: 1 }, 'Flexi: hanya sesi tempat ia tercatat');
    sama(g.ubTmWb_(perKey, rec, 'R|M', 'W4', 1, 4), { h: 1, t: 2 }, 'tanpa label: sesi bersama + sesi tempat ia tercatat');
    sama(g.ubTmWb_({}, rec, 'R|M', 'W1', 2, 5), { h: 2, t: 5 }, 'tanpa data sesi: perilaku lama');
  } finally { g.ubPetaSiswa_ = simpan; }
});

// 29. satu pintu ujian: UPK, draf kalender, slot per rombel, ruang per unit (v1.63.0)
tes('ujian: kelas akhir, slot per rombel, mode, kunci ruang unit', () => {
  sama(['A6', 'B9', 'C12', 'Kelas 12 IPS', 'C10', 'B7', 'Paket A Kelas 5'].map(g.ujsKelasAkhir_), [true, true, true, true, false, false, false]);
  sama([g.muSlotKena_({ rombel: [] }, 'R1'), g.muSlotKena_({ rombel: ['R1', 'R2'] }, 'R2'), g.muSlotKena_({ rombel: ['R1'] }, 'R3')], [true, true, false]);
  sama([g.muModeSlot_({ mode: 'Online' }, { mode: '' }), g.muModeSlot_({ mode: 'Offline' }, { mode: '' }), g.muModeSlot_({ mode: 'Offline' }, { mode: 'Online' })], ['Online', 'Offline', 'Online']);
  sama([g.pwUraiRuang_('R1'), g.pwUraiRuang_('R1~UNIT-A'), g.pwUraiRuang_('R1~')], [{ rombel: 'R1', unit: '' }, { rombel: 'R1', unit: 'UNIT-A' }, { rombel: 'R1', unit: '-' }]);
  sama(g.MU.JENIS.indexOf('UPK') >= 0 && /Kesetaraan/.test(g.ujJudul_('UPK', 2)), true, 'jenis UPK');
});
tes('ujian: draf masa dari kalender akademik (UTS/UAS, UPK bila diatur, yang sudah dibuat ditandai)', () => {
  const cfg = { label: '2026/2027', mulai: '2026-07-27', sesiPerSemester: 18, uts: 9, uas: 18, upk: 15, jumlahSemester: 2, jamTayang: '00:01', jamBatas: '23:59' };
  const now = new Date('2026-08-01T03:00:00Z').getTime();
  const d = g.ujsDraf_(cfg, now, [{ jenis: 'UTS', smt: 1, id: 'MU-1' }], ['R12']);
  sama(d.map((x) => x.jenis + x.smt), ['UTS1', 'UAS1', 'UTS2', 'UPK2', 'UAS2'], 'urut tanggal');
  sama(d[0].sudah, 'MU-1', 'UTS 1 sudah dibuat');
  sama([d[0].dari, d[0].sampai >= d[0].dari], ['2026-09-21', true], 'rentang sesi 9 (tanggal akhir bergantung zona waktu mesin tes)');
  sama(d.filter((x) => x.jenis === 'UPK')[0].peserta, { mode: 'rombel', rombel: ['R12'] }, 'UPK kelas akhir');
  sama(g.ujsDraf_(Object.assign({}, cfg, { upk: 0 }), now, [], ['R12']).some((x) => x.jenis === 'UPK'), false, 'UPK belum diatur');
  const nanti = new Date('2026-12-20T03:00:00Z').getTime();
  sama(g.ujsDraf_(cfg, nanti, [], []).map((x) => x.jenis + x.smt), ['UTS2', 'UAS2'], 'yang lewat tidak ditawarkan');
});

// 30. agenda lembaga (v1.64.0)
tes('agenda: sasaran rombel/jenjang/unit dan jadwal tatap muka yang ditiadakan', () => {
  const tka = { dari: '2027-03-01', sampai: '2027-03-03', sasaran: { mode: 'rombel', nilai: ['R12'] }, statusLain: 'Libur', gantiJadwal: true };
  sama([g.agRombelSasaran_(tka, 'R12', 'PKT-C', ''), g.agRombelSasaran_(tka, 'R10', 'PKT-C', '')], ['penuh', '']);
  sama(!!g.agJadwalLibur_([tka], '2027-03-02', 'R12', 'PKT-C', ''), true, 'sasaran: jadwal diganti agenda');
  sama(!!g.agJadwalLibur_([tka], '2027-03-02', 'R10', 'PKT-C', ''), true, 'bukan sasaran: libur');
  sama(!!g.agJadwalLibur_([tka], '2027-03-05', 'R10', 'PKT-C', ''), false, 'di luar tanggal');
  const biasa = Object.assign({}, tka, { statusLain: 'Belajar biasa' });
  sama(!!g.agJadwalLibur_([biasa], '2027-03-02', 'R10', 'PKT-C', ''), false, 'bukan sasaran belajar biasa: jadwal tetap');
  const tetap = Object.assign({}, biasa, { gantiJadwal: false });
  sama(!!g.agJadwalLibur_([tetap], '2027-03-02', 'R12', 'PKT-C', ''), false, 'sasaran tanpa ganti jadwal');
  const jj = { dari: '2027-03-01', sampai: '2027-03-01', sasaran: { mode: 'jenjang', nilai: ['PKT-B'] }, statusLain: 'Belajar mandiri', gantiJadwal: true };
  sama([!!g.agJadwalLibur_([jj], '2027-03-01', 'R8', 'PKT-B', ''), !!g.agJadwalLibur_([jj], '2027-03-01', 'R11', 'PKT-C', '')], [true, true]);
  const un = { dari: '2027-03-01', sampai: '2027-03-01', sasaran: { mode: 'unit', nilai: ['U1'] }, statusLain: 'Belajar biasa', gantiJadwal: true };
  sama([g.agRombelSasaran_(un, 'R1', '', 'U1'), g.agRombelSasaran_(un, 'R1', '', 'U1,U2'), g.agRombelSasaran_(un, 'R1', '', 'U2')], ['penuh', 'sebagian', '']);
  sama([!!g.agJadwalLibur_([un], '2027-03-01', 'R1', '', 'U1'), !!g.agJadwalLibur_([un], '2027-03-01', 'R1', '', 'U2')], [true, false], 'sesi unit 1 diganti, unit 2 tetap');
  sama([g.izFitur_('waStafAgendaSahkan'), g.izAksi_('waStafAgendaData')], ['agendaLembaga', 'lihat']);
});

// 31. unit utama (v1.64.2)
tes('unit utama: siswa tanpa label ikut unit utama; koordinator bawaan KS', () => {
  const sU = g.ubUnit_, sP = g.ubPetaSiswa_, sB = g.bacaPengguna_;
  g.ubUnit_ = () => [{ id: 'U1', nama: 'Pusat', aktif: true, utama: true, koordinator: [] }, { id: 'U2', nama: 'Unit 2', aktif: true, utama: false, koordinator: ['P2'] }];
  g.ubPetaSiswa_ = () => ({ W2: { unit: 'U2', layanan: 'Reguler' } });
  g.bacaPengguna_ = () => [{ id: 'KS1', peran: 'Kepala Sekolah', status: 'Aktif' }, { id: 'KS0', peran: 'Kepala Sekolah', status: 'Nonaktif' }];
  try {
    sama([g.ubUnitEf_('W2'), g.ubUnitEf_('W9')], ['U2', 'U1'], 'tanpa label -> unit utama');
    sama([g.ubKoordEf_(g.ubUnit_()[0]), g.ubKoordEf_(g.ubUnit_()[1])], [['KS1'], ['P2']], 'unit utama tanpa koordinator -> KS aktif');
    const perKey = { k: [{ id: 'S1', unit: 'U1' }, { id: 'S2', unit: 'U2' }] };
    sama(g.ubTmWb_(perKey, {}, 'k', 'W9', 0, 2), { h: 0, t: 1 }, 'siswa tanpa label menghitung sesi unit utama');
    sama(g.ubLuarUnit_('W9', 'U2'), 'Unit 2'.replace('Unit 2', 'Pusat'), 'siswa unit utama ditolak di sesi unit lain');
  } finally { g.ubUnit_ = sU; g.ubPetaSiswa_ = sP; g.bacaPengguna_ = sB; }
});

// 32. input nilai per unit pemetaan jadwal (v1.66.0)
tes('input nilai: tutor unit hanya melihat siswa unit pemetaannya', () => {
  const sv = ['nilPeran_', 'absTutorSaya_', 'jadBacaPm_', 'absHariIni_', 'ubUnit_', 'ubPetaSiswa_'].map((n) => [n, g[n]]);
  const peran = { tutor: { tutor: true, lihatSemua: false }, admin: { tutor: false, lihatSemua: true } };
  let pm = [];
  g.nilPeran_ = (p) => peran[p.r];
  g.absTutorSaya_ = (p) => ({ id: p.t });
  g.jadBacaPm_ = () => ({ data: pm });
  g.absHariIni_ = () => '2026-11-12';
  g.ubUnit_ = () => [{ id: 'U1', nama: 'Sampiran', aktif: true, utama: true, koordinator: [] }, { id: 'U2', nama: 'Losari', aktif: true, utama: false, koordinator: [] }];
  g.ubPetaSiswa_ = () => ({ W1: { unit: 'U1', layanan: 'Reguler' }, W2: { unit: 'U2', layanan: 'Flexi' } });
  try {
    const kelas = { idRombel: 'C12', kodeMapel: 'PPKN' };
    const wb = () => [{ id: 'W1' }, { id: 'W2' }, { id: 'W3' }];
    const ids = (p) => g.ubWbNilai_(p, kelas, wb()).map((w) => w.id);
    // v1.73.0: dasar saringan = Penugasan Online per unit (bukan jadwal)
    const sP = g.pgoPeta_;
    g.pgoPeta_ = () => ({ 'C12|PPKN': { semua: 'LAIN', unit: { U2: 'PAT', U1: 'SIL' }, ada: true }, 'C12|MTK': { semua: 'BUDI', unit: { U2: 'PAT' }, ada: true } });
    try {
      sama(ids({ r: 'tutor', t: 'PAT' }), ['W2'], 'Patimah: hanya siswa Losari');
      sama(ids({ r: 'tutor', t: 'SIL' }), ['W1', 'W3'], 'Silvi: siswa Sampiran + tanpa label (unit utama)');
      sama(ids({ r: 'tutor', t: 'LAIN' }), [], 'bawaan yang semua unitnya ditimpa: tidak ada siswa');
      sama(ids({ r: 'tutor', t: 'X' }), ['W1', 'W2', 'W3'], 'bukan Tutor Online kelas ini: tanpa saringan (akses kelas diatur terpisah)');
      sama(g.ubWbNilai_({ r: 'tutor', t: 'BUDI' }, { idRombel: 'C12', kodeMapel: 'MTK' }, wb()).map((w) => w.id), ['W1', 'W3'], 'bawaan: semua unit kecuali yang ditimpa');
    } finally { g.pgoPeta_ = sP; }
    sama(ids({ r: 'admin', t: 'PAT' }), ['W1', 'W2', 'W3'], 'admin/KS melihat semua');
  } finally { sv.forEach(([n, f]) => { g[n] = f; }); }
});

// 33. izin absensi khusus Front Office (v1.66.1)
tes('izin: Front Office punya fitur absensi sendiri, terpisah dari Tutor', () => {
  const sD = g.izData_;
  let izin = {};
  g.izData_ = () => ({ peran: {}, izin });
  try {
    const fo = { peran: 'Front Office' }, tutor = { peran: 'Tutor' };
    sama([g.izPetaPengguna_(fo).absensi, g.izPetaPengguna_(fo).absensiFo, g.izPetaPengguna_(tutor).absensi, g.izPetaPengguna_(tutor).absensiFo], ['ubah', 'ubah', 'ubah', undefined], 'bawaan');
    izin = { 'Front Office': { absensiFo: 'tidak' } };
    sama([g.izPetaPengguna_(fo).absensi, g.izPetaPengguna_(tutor).absensi], ['tidak', 'ubah'], 'FO dicabut, Tutor tetap');
    izin = { Tutor: { absensi: 'lihat' } };
    sama([g.izPetaPengguna_(fo).absensi, g.izPetaPengguna_(tutor).absensi], ['ubah', 'lihat'], 'Tutor diubah, FO tetap');
    const f = g.IZN.FITUR.filter((x) => x[0] === 'absensi')[0];
    sama(g.izBisaTambah_(f, 'Front Office'), false, 'absensi Tutor tidak lagi muncul sebagai fitur tambahan FO');
    sama(g.izFiturPeran_(g.izFitur_('waStafAbsenWbCatat'), 'Front Office'), 'absensiFo');
  } finally { g.izData_ = sD; }
});

// 34. aktivasi QR kartu siswa (v1.67.0)
tes('aktivasi QR: belum aktif ditolak saat pindai, centang Admin catat tunai sekali, VA lunas aktif otomatis, FO tidak boleh centang', () => {
  const nama = ['absBaca_', 'keuTagCari_', 'keuWbSemua_', 'keuBayarPeta_', 'keuTrxTab_', 'stafDariToken_', 'absSim_', 'kalAkunBawaan_', 'kalAkunSah_', 'catat_', 'npBayarDiterima_', 'npKirim_', 'aqrTagihan_'];
  const simpan = {};
  nama.forEach((k) => { simpan[k] = g[k]; });
  try {
    const v = [g.AQR.HDR.slice()], trx = [['ID TRANSAKSI', 'JENIS', 'WARGA BELAJAR', 'TAGIHAN', 'JUMLAH', 'AKUN KAS']];
    const tab = (isi) => {
      const h = {};
      isi[0].forEach((x, i) => { h[String(x).toUpperCase()] = i; });
      return { v: isi.map((b) => b.slice()), h, sh: { appendRow: (r) => isi.push(r.slice()), getLastRow: () => isi.length,
        getRange: (r, c) => ({ setValue: (x) => { isi[r - 1][c - 1] = x; }, insertCheckboxes: () => { isi[r - 1][c - 1] = false; } }) } };
    };
    const tag = { id: 'TAG-AQR-1', nama: 'Aktivasi QR ID Card', kategori: 'AQR', jumlah: 20000, sasaran: 'Semua', aktif: true };
    const wbs = [{ id: 'W1', nama: 'Ani', idRombel: 'R1', namaRombel: 'A4', aktif: true }, { id: 'W2', nama: 'Budi', idRombel: 'R1', namaRombel: 'A4', aktif: true }];
    props.setProperty(g.AQR.PROP_TAG, tag.id);
    g.absBaca_ = (n) => (n === g.AQR.TAB ? tab(v) : (() => { throw new Error('tab ' + n); })());
    g.keuTrxTab_ = () => tab(trx);
    g.keuTagCari_ = () => tag;
    g.aqrTagihan_ = () => tag;
    g.keuWbSemua_ = () => wbs;
    g.keuBayarPeta_ = () => {
      const bayar = {};
      trx.slice(1).forEach((r) => { const k = r[3] + '|' + r[2]; bayar[k] = (bayar[k] || 0) + r[4]; });
      return { bayar, ker: {} };
    };
    g.absSim_ = () => ({ tahun: '2026/2027' });
    g.kalAkunBawaan_ = (m) => (m === 'tunai' ? 'TUNAI' : 'BANK');
    g.kalAkunSah_ = () => '';
    g.catat_ = () => {}; g.npBayarDiterima_ = () => {};
    const notif = [];
    g.npKirim_ = (j, o) => { notif.push(j); };
    const orang = { TA: { id: 'A', nama: 'Admin', peran: 'Admin' }, TF: { id: 'F', nama: 'Fia', peran: 'Front Office' } };
    g.stafDariToken_ = (t) => orang[t];
    g.AQR_MEMO_ = null;
    let galat = '';
    try { g.aqrWajibAktif_({ id: 'W1' }); } catch (e) { galat = e.message; }
    sama(galat, 'QR Belum diaktifkan, silahkan lakukan aktivasi terlebih dahulu di bagian akademik', 'pesan kunci');
    galat = '';
    try { g.waStafAqrAtur('TF', { idWb: 'W1', aktif: true }); } catch (e) { galat = e.message; }
    sama(/Admin atau Kepala Sekolah/.test(galat), true, 'FO tidak boleh centang');
    sama(g.waStafAqrLapor('TF', { idWb: 'W1', catatan: 'tunai' }).sukses, true, 'FO melapor');
    sama(notif, ['aqr_lapor'], 'notifikasi ke Admin/KS');
    const h = g.waStafAqrAtur('TA', { idWb: 'W1', aktif: true });
    sama([h.jumlah, trx.length - 1, trx[1][5]], [20000, 1, 'TUNAI'], 'tunai tercatat ke arus keuangan');
    g.AQR_MEMO_ = null;
    sama(g.aqrAktif_('W1'), true, 'W1 aktif');
    g.waStafAqrAtur('TA', { idWb: 'W1', aktif: false });
    g.waStafAqrAtur('TA', { idWb: 'W1', aktif: true });
    sama(trx.length - 1, 1, 'centang ulang tidak mencatat dua kali');
    // VA: pembayaran masuk lewat tagihan -> aktif otomatis
    trx.push(['TRX-VA', 'Pemasukan', 'W2', tag.id, 20000, 'PG']);
    sama(g.aqrSetelahBayar_(tag.id, 'W2', 'VA / online', 'TRX-VA'), true, 'VA lunas');
    g.AQR_MEMO_ = null;
    sama([g.aqrAktif_('W2'), g.aqrPeta_().W2.cara], [true, 'VA / online']);
    sama(g.aqrSetelahBayar_('TAG-LAIN', 'W2', 'x', 'y'), false, 'tagihan lain diabaikan');
    sama(g.izFitur_('waStafAqrAtur'), 'aktivasiQr');
    // v1.67.1: jalur manual ikut terkunci
    const src = fs.readFileSync(path.join(dir, 'AbsenHarian.gs'), 'utf8') + fs.readFileSync(path.join(dir, 'ApiFlutter.gs'), 'utf8');
    sama((src.match(/aqrWajibAktif_\(wb\)/g) || []).length, 3, 'pindai harian, manual harian, per mapel (pindai & manual)');
  } finally { nama.forEach((k) => { g[k] = simpan[k]; }); g.AQR_MEMO_ = null; props.deleteProperty(g.AQR.PROP_TAG); }
});

// 35. VA custom (v1.68.0)
tes('VA custom: kode transaksi wajib yang ada, keterangan otomatis, siswa jadi tagihan, umum dicatat sebesar pokok saat lunas', () => {
  const nama = ['absBaca_', 'keuKatPeta_', 'keuWbSemua_', 'gwHpWb_', 'stafDariToken_', 'absSim_', 'catat_', 'npTagihanBaru_', 'npKirim_', 'keuTrxTab_',
    'gwBarisDasar_', 'gwCatatAdminBayar_', 'gwCatatBiaya_', 'gwCatatLain_', 'rfWaktu_'];
  const simpan = {};
  nama.forEach((k) => { simpan[k] = g[k]; });
  try {
    const tab = (isi) => {
      const h = {};
      isi[0].forEach((x, i) => { h[String(x).toUpperCase()] = i; });
      return { v: isi.map((b) => b.slice()), h, sh: { appendRow: (r) => isi.push(r.slice()), getRange: (r, c) => ({ setValue: (x) => { isi[r - 1][c - 1] = x; } }) } };
    };
    const vc = [g.VC.HDR.slice()], tg = [g.KEU.HDR_TAG.slice()], trx = [['ID TRANSAKSI', 'JENIS', 'KATEGORI KEUANGAN', 'JUMLAH', 'PIHAK TERKAIT', 'URAIAN']];
    g.absBaca_ = (n) => (n === g.VC.TAB ? tab(vc) : n === g.KEU.TAB_TAG ? tab(tg) : (() => { throw new Error('tab ' + n); })());
    g.keuTrxTab_ = () => tab(trx);
    g.keuKatPeta_ = () => ({ DAF: { kode: 'DAF', nama: 'Pendaftaran', jenis: 'Pemasukan' }, ATK: { kode: 'ATK', nama: 'Belanja ATK', jenis: 'Pengeluaran' } });
    g.keuWbSemua_ = () => [{ id: 'W1', nama: 'Ani', idRombel: 'R1', namaRombel: 'A4', aktif: true }];
    g.gwHpWb_ = () => ({ hp: '0812', email: '' });
    g.absSim_ = () => ({ tahun: '2026/2027' });
    g.catat_ = () => {}; g.rfWaktu_ = () => '2026-11-12 10:00';
    const tagBaru = [], notif = [];
    g.npTagihanBaru_ = (id) => tagBaru.push(id);
    g.npKirim_ = (j) => notif.push(j);
    g.gwBarisDasar_ = () => ({ 'STATUS': 'Disetujui' });
    g.gwCatatAdminBayar_ = () => 'ADM1'; g.gwCatatBiaya_ = () => 'FEE1';
    g.gwCatatLain_ = () => 'LAIN';
    const orang = { TF: { nama: 'Fia', peran: 'Front Office' }, TB: { nama: 'Bena', peran: 'Bendahara' }, TT: { nama: 'Tono', peran: 'Tutor' } };
    g.stafDariToken_ = (t) => orang[t];
    sama(g.vcKeterangan_('Pendaftaran', 'Budi Santoso', ''), 'Pembayaran Pendaftaran atas nama Budi Santoso');
    sama(g.vcKeterangan_('Biaya Ujian', 'Ani', 'susulan'), 'Biaya Ujian atas nama Ani - susulan');
    let galat = '';
    try { g.waStafVaCustomBuat('TT', { kategori: 'DAF', nama: 'Budi', pokok: 500000 }); } catch (e) { galat = e.message; }
    sama(/Front Office, dan Bendahara/.test(galat), true, 'tutor ditolak');
    galat = '';
    try { g.waStafVaCustomBuat('TF', { kategori: 'BARU', nama: 'Budi', pokok: 500000 }); } catch (e) { galat = e.message; }
    sama(/sudah ada/.test(galat), true, 'kode baru ditolak');
    galat = '';
    try { g.waStafVaCustomBuat('TF', { kategori: 'ATK', nama: 'Budi', pokok: 500000 }); } catch (e) { galat = e.message; }
    sama(/sudah ada/.test(galat), true, 'kategori pengeluaran ditolak');
    const u = g.waStafVaCustomBuat('TF', { kategori: 'DAF', nama: '  Budi   Santoso ', hp: '0812-11', pokok: '500.000' });
    sama([u.siswa, u.keterangan, tg.length, vc.length - 1], [false, 'Pembayaran Pendaftaran atas nama Budi Santoso', 1, 1], 'umum: tanpa tagihan');
    const s = g.waStafVaCustomBuat('TB', { kategori: 'DAF', idWb: 'W1', pokok: 150000 });
    sama([s.siswa, tg.length - 1, tagBaru.length], [true, 1, 1], 'siswa: tagihan dibuat + notifikasi');
    const tH = tab(tg).h;
    sama([tg[1][tH['SASARAN']], tg[1][tH['NILAI SASARAN']], tg[1][tH['KATEGORI']], tg[1][tH['JUMLAH']]], ['Siswa', 'W1', 'DAF', 150000]);
    // order DOKU "Custom" lunas: pokok 500.000 + admin 4.000
    const x = { INVOICE: 'VAC-1', REF: u.id, NAMA: 'Budi Santoso' };
    const ids = g.vcCatat_(x, 500000, 'VIRTUAL_ACCOUNT_BRI', { biaya: 4000 }, 504000, 4000);
    sama([trx.length - 1, trx[1][2], trx[1][3], trx[1][4], ids.split(',').length], [1, 'DAF', 500000, 'Budi Santoso', 3], 'pemasukan sebesar pokok dengan kode terpilih');
    sama(notif, ['va_custom_lunas']);
    sama(g.vcBaca_().data[0].status, 'Lunas');
    sama(g.vcCatat_(x, 500000, 'BRI', { biaya: 4000 }, 504000, 4000), 'LAIN', 'bayar ganda -> diperiksa');
    sama(g.izFitur_('waStafVaCustomBuat'), 'vaCustom');
  } finally { nama.forEach((k) => { g[k] = simpan[k]; }); }
});

// 36. kwitansi (v1.69.0)
tes('kwitansi: terbilang, nama penandatangan wajib nama orang, nomor tetap per transaksi, verifikasi SAH / tidak berlaku', () => {
  sama(g.kwTerbilang_(504000), 'Lima ratus empat ribu rupiah');
  sama(g.kwTerbilang_(1250000), 'Satu juta dua ratus lima puluh ribu rupiah');
  sama(g.kwTerbilang_(111), 'Seratus sebelas rupiah');
  sama(g.kwTerbilang_(1000), 'Seribu rupiah');
  sama(g.kwTerbilang_(19), 'Sembilan belas rupiah');
  const nama = ['absBaca_', 'keuSemua_', 'stafDariToken_', 'catat_', 'keuKatPeta_', 'keuWbSemua_', 'kalAkun_', 'nilLembaga_', 'kwUrl_', 'kwKop_'];
  const simpan = {};
  nama.forEach((k) => { simpan[k] = g[k]; });
  try {
    const kwt = [g.KW.HDR.slice()];
    const tab = (isi) => {
      const h = {};
      isi[0].forEach((x, j) => { h[String(x).toUpperCase()] = j; });
      return { v: isi.map((b) => b.slice()), h, sh: { appendRow: (r) => isi.push(r.slice()), getLastRow: () => isi.length, getRange: (r, c) => ({ setValue: (x) => { isi[r - 1][c - 1] = x; } }) } };
    };
    g.absBaca_ = (n) => (n === g.KW.TAB ? tab(kwt) : (() => { throw new Error('tab ' + n); })());
    const trx = [
      { id: 'T1', tanggal: '2026-11-12', jenis: 'Pemasukan', kategori: 'DAF', jumlah: 500000, pihak: 'Budi', uraian: 'Pembayaran Pendaftaran atas nama Budi', status: 'Disetujui', akun: 'TUNAI', dicatatOleh: 'Fia' },
      { id: 'T2', tanggal: '2026-11-12', jenis: 'Pengeluaran', kategori: 'ATK', jumlah: 75000, pihak: 'Toko', uraian: 'Kertas', status: 'Disetujui', akun: 'TUNAI' },
      { id: 'T3', tanggal: '2026-11-12', jenis: 'Pengeluaran', kategori: 'ATK', jumlah: 9000, uraian: 'x', status: 'Menunggu' },
      { id: 'T4', tanggal: '2026-11-12', jenis: 'Pemasukan', kategori: 'DAF', jumlah: 20000, pihak: 'Cici', uraian: 'y', status: 'Disetujui' }];
    g.keuSemua_ = () => trx;
    g.catat_ = () => {};
    g.keuKatPeta_ = () => ({ DAF: { nama: 'Pendaftaran' } });
    g.keuWbSemua_ = () => [];
    g.kalAkun_ = () => [{ kode: 'TUNAI', nama: 'Kas Tunai' }];
    g.nilLembaga_ = () => ({ nama: 'PKBM Uji', alamat: 'Jl. A', npsn: '1' });
    g.kwKop_ = () => ({ nama: 'PKBM Uji', baris: [], logo: '' });
    g.kwUrl_ = (k) => 'U?kw=' + k;
    const orang = { TA: { nama: 'Administrator', peran: 'Admin' }, TF: { nama: 'Fia Rahma', peran: 'Front Office' }, TT: { nama: 'Tono', peran: 'Tutor' } };
    g.stafDariToken_ = (t) => orang[t];
    let galat = '';
    try { g.waStafKwitansi('TA', ['T1']); } catch (e) { galat = e.message; }
    sama(/bukan nama orang/.test(galat), true, 'nama generik ditolak');
    galat = '';
    try { g.waStafKwitansi('TT', ['T1']); } catch (e) { galat = e.message; }
    sama(/Front Office/.test(galat), true, 'tutor ditolak');
    galat = '';
    try { g.waStafKwitansi('TF', ['T3']); } catch (e) { galat = e.message; }
    sama(/belum disetujui/.test(galat), true, 'transaksi menunggu ditolak');
    const a = g.waStafKwitansi('TF', ['T1', 'T2']).kwitansi;
    const thn = new Date().getFullYear();
    sama([a[0].nomor, a[1].nomor, a[0].ttd, a[0].terbilang, a[0].cara], ['KW-M/' + thn + '/0001', 'KW-K/' + thn + '/0001', { nama: 'Fia Rahma', jabatan: 'Front Office' }, 'Lima ratus ribu rupiah', 'Kas Tunai']);
    const b = g.waStafKwitansi('TF', ['T4', 'T1']).kwitansi;
    sama([b[0].nomor, b[1].nomor, b[1].kode], ['KW-M/' + thn + '/0002', 'KW-M/' + thn + '/0001', a[0].kode], 'nomor & kode tetap saat cetak ulang');
    sama(kwt.length - 1, 3, 'tidak ada nomor ganda');
    // v1.70.3: dicetak ulang oleh KS -> penandatangan tetap penerbit pertama (Fia)
    orang.TK = { nama: 'Kasih Sayang', peran: 'Kepala Sekolah' };
    const ks = g.waStafKwitansi('TK', ['T1']).kwitansi[0];
    sama([ks.nomor, ks.ttd], ['KW-M/' + thn + '/0001', { nama: 'Fia Rahma', jabatan: 'Front Office' }], 'penandatangan tetap');
    galat = '';
    try { sama(g.waStafKwitansi('TA', ['T1']).kwitansi[0].ttd.nama, 'Fia Rahma'); } catch (e) { galat = e.message; }
    sama(galat, '', 'nama generik boleh mencetak ulang kwitansi yang sudah terbit');
    const H = g.HtmlService;
    let html = '';
    g.HtmlService = { createHtmlOutput: (x) => { html = x; const o = { setTitle: () => o, addMetaTag: () => o }; return o; } };
    try {
      g.kwHalaman_(a[0].kode);
      sama(/KWITANSI SAH/.test(html), true, 'sah');
      trx[0].status = 'Dibatalkan';
      g.kwHalaman_(a[0].kode);
      sama(/TIDAK BERLAKU/.test(html), true, 'dibatalkan -> tidak berlaku');
      g.kwHalaman_('SALAH');
      sama(/tidak terdaftar/.test(html), true, 'kode palsu');
    } finally { g.HtmlService = H; }
    sama([g.izFitur_('waStafKwitansi'), g.izFitur_('waStafKwitansiDaftar')], ['kwitansi', 'kwitansi']);
  } finally { nama.forEach((k) => { g[k] = simpan[k]; }); }
});

// 37. kelayakan ujian (v1.70.0)
tes('kelayakan ujian: rumus absen A, ketuntasan per cakupan UTS/UAS, UPK kelas akhir keuangan saja, permohonan -> rekomendasi -> KS, janji gugur', () => {
  sama(g.klPersenAbsen_({ hadir: 18, total: 25 }, { hadir: 4, total: 4 }).persen, 82, '72% + 10% x 100%');
  sama(g.klPersenAbsen_({ hadir: 10, total: 10 }, { hadir: 2, total: 4 }).persen, 100, 'maks 100');
  sama(g.klPersenAbsen_({ hadir: 0, total: 0 }, { hadir: 3, total: 4 }).persen, 75, 'tanpa online = tatap muka saja');
  const nama = ['absBaca_', 'stafDariToken_', 'catat_', 'npKirim_', 'hdrOnline_', 'nilHadirKelas_', 'keuTagSemua_', 'keuBayarPeta_', 'keuWbSemua_', 'siswaDariSesi_', 'ksWb_', 'absHariIni_', 'absWaktu_'];
  const simpan = {};
  nama.forEach((k) => { simpan[k] = g[k]; });
  try {
    const aju = [g.KL.HDR.slice()];
    const tab = (isi) => {
      const h = {};
      isi[0].forEach((x, j) => { h[String(x).toUpperCase()] = j; });
      return { v: isi.map((b) => b.slice()), h, sh: { appendRow: (r) => isi.push(r.slice()), getRange: (r, c) => ({ setValue: (x) => { isi[r - 1][c - 1] = x; } }) } };
    };
    g.absBaca_ = (n) => (n === g.KL.TAB ? tab(aju) : (() => { throw new Error('tab ' + n); })());
    let hari = '2026-11-13';
    g.absHariIni_ = () => hari; g.absWaktu_ = () => hari + ' 10:00';
    g.catat_ = () => {};
    const notif = [];
    g.npKirim_ = (j) => notif.push(j);
    // sesi 1-3 lewat; UTS di sesi 4 -> batas UTS = sesi 3; item sesi 5 hanya untuk UAS
    const item = { M1: [{ id: 'A', jenis: 'Materi', n: 1, lewat: true }, { id: 'B', jenis: 'Diskusi', n: 2, lewat: true }, { id: 'C', jenis: 'Diskusi', n: 3, lewat: true },
      { id: 'D', jenis: 'Materi', n: 3, lewat: true }, { id: 'E', jenis: 'Diskusi', n: 5, lewat: true }] };
    const baca = { 'BM1|A|ani': true, 'BM1|D|ani': true }, jawab = { 'BM1|B|ani': true, 'BM1|C|ani': true };
    g.hdrOnline_ = () => ({ aktif: true, wajibLewat: { '1|1': 1, '1|2': 1, '1|3': 1, '1|5': 1 }, hadir: { 'M1|ani': { '1|1': 1, '1|2': 1, '1|3': 1, '1|5': 1 } } });
    g.nilHadirKelas_ = () => ({ gabung: () => ({ tatapMuka: { hadir: 0, total: 0 } }) });
    let sisa = 150000;
    g.keuTagSemua_ = () => ({ data: [{ id: 'T1', nama: 'SPP', aktif: true, jumlah: 150000, sasaran: 'Semua', jatuhTempo: '' }] });
    g.keuBayarPeta_ = () => ({ bayar: { 'T1|W1': 150000 - sisa }, ker: {} });
    const w = { id: 'W1', nama: 'Ani', idRombel: 'R12', namaRombel: 'C12', aktif: true };
    g.keuWbSemua_ = () => [w];
    const mkData = () => ({ per: { tahun: '2026/2027', semester: 'Ganjil', smt: 1 }, at: { blokir: true }, cfg: { uts: 4, sesiPerSemester: 18 }, syarat: 80, hari,
      peta: { kelas: { 'R12|MTK': [{ idMapel: 'M1', idRombel: 'BM1', aktif: true }] }, aktif: { 'R12|MTK': true } }, siswaBm: { BM1: [{ idRombel: 'BM1', nama: 'Ani', nisn: '' }] },
      item, baca, jawab, hk: {}, nmMapel: { MTK: 'Matematika' }, rb: { R12: { nama: 'C12' } }, sesiSt: {} });
    g.KL_MEMO_ = { aktif: mkData() };
    const c = { idRombel: 'BM1', nama: 'Ani' };
    let h = g.klWb_(g.KL_MEMO_.aktif, w, c, ['R12|MTK'], { keu: true });
    sama([h.ujian.UTS.mapel[0].tuntas.persen, h.ujian.UAS.mapel[0].tuntas.persen], [100, 80], 'UTS sesi 1-3 tuntas, UAS 4/5');
    sama([h.ujian.UTS.status, h.ujian.UAS.status, h.ujian.UPK.status, h.ujian.UPK.mapel.length], ['Belum layak', 'Belum layak', 'Belum layak', 0], 'keuangan belum lunas; UPK tanpa akademik');
    sama(h.ujian.UTS.alasan, ['keuangan']);
    sama(Object.keys(g.klWb_(g.KL_MEMO_.aktif, Object.assign({}, w, { idRombel: 'R11' }), c, ['R12|MTK'], { keu: true }).ujian), ['UTS', 'UAS'], 'bukan kelas akhir tanpa UPK');
    const ht = g.klWb_(g.KL_MEMO_.aktif, w, c, ['R12|MTK'], { keu: false });
    sama([Object.keys(ht.ujian), ht.ujian.UTS.status, ht.keu], [['UTS', 'UAS'], 'Layak', null], 'tutor: akademik saja');
    g.siswaDariSesi_ = () => ({ nama: 'Ani', idRombel: 'BM1' });
    g.ksWb_ = () => w;
    let galat = '';
    try { g.waSiswaKelayakanAju('tok', { ujian: 'UTS', alasan: 'Menunggu gajian orang tua' }); } catch (e) { galat = e.message; }
    sama(/janji bayar/.test(galat), true, 'keuangan wajib janji bayar');
    const a = g.waSiswaKelayakanAju('tok', { ujian: 'UTS', alasan: 'Menunggu gajian orang tua', janjiTanggal: '2026-11-20', janjiNominal: 100000 });
    sama([a.jenis, notif.slice(-1)[0]], ['Keuangan', 'kl_aju_keuangan']);
    galat = '';
    try { g.waSiswaKelayakanAju('tok', { ujian: 'UTS', alasan: 'Menunggu gajian orang tua', janjiTanggal: '2026-11-20', janjiNominal: 100000 }); } catch (e) { galat = e.message; }
    sama(/sedang diproses/.test(galat), true, 'tidak dobel');
    const orang = { TA: { nama: 'Ana', peran: 'Admin' }, TK: { nama: 'Kurnia', peran: 'Koordinator Kurikulum' }, TB: { nama: 'Bena', peran: 'Bendahara' }, TS: { nama: 'Kasih', peran: 'Kepala Sekolah' }, TT: { nama: 'Tono', peran: 'Tutor', id: 'U9' } };
    g.stafDariToken_ = (t) => orang[t];
    galat = '';
    try { g.waStafKelayakanRekomendasi('TK', { id: a.id, bagian: 'akademik', setuju: true, catatan: 'oke saja' }); } catch (e) { galat = e.message; }
    sama(/Koordinator Unit, Pengampu Mapel, atau Admin/.test(galat), true, 'v1.94.0: kurikulum bukan pemberi rekomendasi akademik');
    galat = '';
    try { g.waStafKelayakanRekomendasi('TA', { id: a.id, bagian: 'akademik', setuju: true, catatan: 'oke saja' }); } catch (e) { galat = e.message; }
    sama(/tidak memerlukan/.test(galat), true, 'permohonan keuangan tidak perlu rekomendasi akademik');
    sama(g.waStafKelayakanRekomendasi('TB', { id: a.id, bagian: 'keuangan', setuju: true, catatan: 'janji wajar' }).status, 'Menunggu KS');
    galat = '';
    try { g.waStafKelayakanPutus('TB', { id: a.id, setuju: true, catatan: 'setuju' }); } catch (e) { galat = e.message; }
    sama(/Kepala Sekolah/.test(galat), true, 'bendahara tidak memutus');
    sama(g.waStafKelayakanPutus('TS', { id: a.id, setuju: true, catatan: 'Boleh ikut UTS' }).status, 'Disetujui');
    g.KL_MEMO_ = { aktif: mkData() };
    h = g.klWb_(g.KL_MEMO_.aktif, w, c, ['R12|MTK'], { keu: true });
    sama([h.ujian.UTS.status, h.ujian.UAS.status], ['Layak dengan catatan', 'Belum layak'], 'izin hanya untuk UTS');
    hari = '2026-11-21'; sisa = 100000;
    g.KL_MEMO_ = { aktif: mkData() };
    h = g.klWb_(g.KL_MEMO_.aktif, w, c, ['R12|MTK'], { keu: true });
    sama([h.ujian.UTS.status, notif.includes('kl_janji')], ['Belum layak', true], 'janji gugur');
    sama(g.izFitur_('waStafKelayakanDaftar'), 'kelayakanUjian');
    galat = '';
    try { g.waStafKelayakanPanggil('TK', { idWb: 'W1', pesan: 'Datang ke ruang guru' }); } catch (e) { galat = e.message; }
    sama(/Pemanggilan/.test(galat), true, 'v1.94.0: kurikulum hanya melihat');
    sama(g.waStafKelayakanPanggil('TA', { idWb: 'W1', pesan: 'Datang ke ruang kurikulum Senin pukul 09.00' }).sukses, true);
  } finally { nama.forEach((k) => { g[k] = simpan[k]; }); g.KL_MEMO_ = {}; }
});

// v1.94.0: dispensasi kelayakan hanya untuk pelaksanaan: nilai ujian siswa yang disetujui ikut tetap ditahan
tes('dispensasi kelayakan: nilai/hasil ujian ditahan hanya untuk ujian & siswa yang diberi dispensasi', () => {
  const sv = ['klAjuBaca_', 'nilPeriode_', 'sbWbSiswa_', 'sbMasaDariJadwal_'], simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    g.KL_DIS_MEMO_ = null;
    g.klAjuBaca_ = () => ({ data: [{ STATUS: 'Disetujui', 'ID WB': 'W1', UJIAN: 'UTS', TAHUN: '2026/2027', SEMESTER: 'Ganjil' },
      { STATUS: 'Ditolak', 'ID WB': 'W2', UJIAN: 'UTS', TAHUN: '2026/2027', SEMESTER: 'Ganjil' }] });
    g.nilPeriode_ = (q) => (q ? { tahun: q.tahun, semester: q.semester, smt: q.semester === 'Ganjil' ? 1 : 2 } : { tahun: '2026/2027', semester: 'Ganjil', smt: 1 });
    g.sbWbSiswa_ = (r, n) => ({ id: n === 'Ani' ? 'W1' : 'W2' });
    g.sbMasaDariJadwal_ = () => null;
    sama(g.sbTertahan_({ jenis: 'UTS', smt: 1 }, 'BM1', 'Ani').dispensasi, true, 'UTS Ani ditahan');
    sama(g.sbTertahan_({ jenis: 'UAS', smt: 1 }, 'BM1', 'Ani'), null, 'UAS tidak');
    sama(g.sbTertahan_({ jenis: 'UTS', smt: 2 }, 'BM1', 'Ani'), null, 'semester lain tidak');
    sama(g.sbTertahan_({ jenis: 'UTS', smt: 1 }, 'BM1', 'Budi'), null, 'permohonan ditolak tidak menahan');
    sama(g.sbTertahan_({ jenis: 'TRYOUT', smt: 1 }, 'BM1', 'Ani'), null, 'tryout tanpa syarat');
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); g.KL_DIS_MEMO_ = null; }
});

// v1.95.0: tanggal sesi mengikuti kalender akademik (kaldik Jawa Barat 2026/2027)
tes('kaldik: minggu libur >= 3 hari dilewati, sesi tetap UAS bertanggal, jeda antarsemester, tanpa kaldik = rumus lama', () => {
  const kaldik = {"s1": {"mulai": "2026-07-27", "rapor": "2026-12-23", "libur": [{"dari": "2026-08-17", "sampai": "2026-08-17", "nama": "Proklamasi Kemerdekaan RI"}, {"dari": "2026-08-25", "sampai": "2026-08-25", "nama": "Maulid Nabi Muhammad SAW"}, {"dari": "2026-12-24", "sampai": "2026-12-24", "nama": "Cuti bersama Natal"}, {"dari": "2026-12-25", "sampai": "2026-12-25", "nama": "Hari Natal"}, {"dari": "2026-12-28", "sampai": "2027-01-08", "nama": "Libur semester 1"}], "tetap": {"18": {"dari": "2026-11-23", "sampai": "2026-12-13", "ket": "Asesmen sumatif akhir semester"}}}, "s2": {"mulai": "2027-01-11", "rapor": "2027-06-25", "libur": [{"dari": "2027-02-06", "sampai": "2027-02-06", "nama": "Tahun Baru Imlek"}, {"dari": "2027-02-08", "sampai": "2027-02-12", "nama": "Libur awal Ramadan"}, {"dari": "2027-03-08", "sampai": "2027-03-19", "nama": "Libur Idul Fitri 1448 H"}, {"dari": "2027-03-09", "sampai": "2027-03-09", "nama": "Hari Raya Nyepi"}, {"dari": "2027-04-26", "sampai": "2027-04-26", "nama": "Wafat Isa Almasih"}, {"dari": "2027-05-01", "sampai": "2027-05-01", "nama": "Hari Buruh"}, {"dari": "2027-05-06", "sampai": "2027-05-06", "nama": "Kenaikan Isa Almasih"}, {"dari": "2027-05-16", "sampai": "2027-05-16", "nama": "Hari Raya Waisak"}, {"dari": "2027-05-17", "sampai": "2027-05-17", "nama": "Idul Adha 1448 H"}, {"dari": "2027-06-01", "sampai": "2027-06-01", "nama": "Hari Lahir Pancasila"}, {"dari": "2027-06-06", "sampai": "2027-06-06", "nama": "Tahun Baru Islam"}, {"dari": "2027-06-28", "sampai": "2027-07-09", "nama": "Libur akhir tahun ajaran"}], "tetap": {"18": {"dari": "2027-06-07", "sampai": "2027-06-20", "ket": "Asesmen sumatif akhir tahun"}}}};
  const cfg = Object.assign({}, g.TA.DEFAULT, { jumlahSemester: 2, sesiPerSemester: 18, uts: 9, uas: 18, kaldik });
  g.TA_JADWAL_MEMO_ = null;
  const j = g.taJadwal_(cfg), r = (s, n) => [g.taIsoLokal_(j[s][n - 1].a), g.taIsoLokal_(j[s][n - 1].b)];
  sama(r(1, 1), ['2026-07-27', '2026-08-02'], 'S1 sesi 1 = jadwal lama');
  sama(r(1, 17), ['2026-11-16', '2026-11-22'], 'S1 sesi 17 tidak bergeser (libur 1 hari tidak menggeser)');
  sama(r(1, 18), ['2026-11-23', '2026-12-13'], 'UAS S1 mencakup ASAS');
  sama(r(2, 1), ['2027-01-11', '2027-01-17'], 'S2 mulai hari pertama masuk, bukan 30 Nov');
  sama(r(2, 5), ['2027-02-15', '2027-02-21'], 'minggu awal Ramadan dilewati');
  sama(r(2, 8), ['2027-03-22', '2027-03-28'], 'dua minggu Idul Fitri dilewati');
  sama(r(2, 9), ['2027-03-29', '2027-04-04'], 'UTS S2');
  sama(r(2, 17), ['2027-05-24', '2027-05-30'], 'sesi 17');
  sama(r(2, 18), ['2027-06-07', '2027-06-20'], 'UAS S2 = ASAT (31 Mei = minggu cadangan)');
  sama(j.peringatan, [], 'minggu efektif cukup');
  const w = j.minggu[2].filter((x) => x.senin === '2027-05-31')[0];
  sama([w.sesi, w.efektif], [[], true], 'minggu cadangan tanpa sesi');
  const rt = g.taRentang_(cfg, 2, 1);
  sama([rt.mulai.getFullYear(), rt.mulai.getMonth(), rt.mulai.getDate(), rt.mulai.getHours(), rt.selesai.getDate(), rt.selesai.getHours()], [2027, 0, 11, 0, 17, 23], 'taRentang_ memakai kaldik');
  const lama = Object.assign({}, cfg, { kaldik: null });
  g.TA_JADWAL_MEMO_ = null;
  const rl = g.taRentang_(lama, 2, 1);
  sama([rl.mulai.getMonth(), rl.mulai.getDate()], [10, 30], 'tanpa kaldik: rumus lama (S2 langsung menyambung)');
  // kurang minggu efektif -> peringatan
  g.TA_JADWAL_MEMO_ = null;
  const sempit = Object.assign({}, cfg, { kaldik: { s1: { mulai: '2026-07-27', libur: [], tetap: { 18: { dari: '2026-10-05', sampai: '2026-10-11' } } } } });
  sama(g.taJadwal_(sempit).peringatan.length > 0, true, 'minggu efektif kurang diperingatkan');
  let galat = '';
  try { g.taKaldikBersih_({ s1: { mulai: '2026-07-27' }, s2: { mulai: '2026-07-01' } }, 18); } catch (e) { galat = e.message; }
  sama(/setelah Semester 1/.test(galat), true);
  g.TA_JADWAL_MEMO_ = null;
});

// v1.95.0: libur kaldik -> agenda KALDIK-* (tambah, ubah nama, hapus yang hilang); agenda kaldik tidak bisa diubah manual
tes('kaldik -> agenda: sinkron libur, agenda kaldik hanya baca', () => {
  const sv = ['muTab_', 'agSemua_', 'agLupakan_', 'ujNow_'], simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    let rows = [{ id: 'KALDIK-20261224-20261224', nama: 'Lama', baris: 2 }, { id: 'KALDIK-20260101-20260101', nama: 'Hilang', baris: 3 }, { id: 'AG-X', nama: 'Manual', baris: 4 }];
    const tambah = [], ubah = [], hapus = [];
    g.muTab_ = () => ({ deleteRow: (b) => { hapus.push(b); rows = rows.filter((r) => r.baris !== b); }, appendRow: (r) => tambah.push(r), getRange: (b) => ({ setValue: (v) => ubah.push([b, v]) }) });
    g.agSemua_ = () => rows.map((r) => Object.assign({}, r));
    g.agLupakan_ = () => {};
    g.ujNow_ = () => '2026-11-28 10:00';
    const cfg = { label: '2026/2027', kaldik: { s1: { libur: [{ dari: '2026-12-24', sampai: '2026-12-24', nama: 'Cuti bersama Natal' }, { dari: '2026-12-28', sampai: '2027-01-08', nama: 'Libur semester 1' }] } } };
    const h = g.agSinkronKaldik_(cfg);
    sama([h.tambah, h.ubah, h.hapus], [1, 1, 1]);
    sama(hapus, [3], 'agenda kaldik yang tidak ada lagi dihapus; agenda manual tidak disentuh');
    const baru = tambah[0], i = g.AG.HDR.indexOf.bind(g.AG.HDR);
    sama([baru[i('ID')], baru[i('JENIS')], baru[i('STATUS')], baru[i('GANTI JADWAL')]], ['KALDIK-20261228-20270108', 'Libur (kalender akademik)', 'Disahkan', 'Ya']);
    let galat = '';
    try { g.agWajibManual_({ id: 'KALDIK-20261228-20270108' }); } catch (e) { galat = e.message; }
    sama(/kalender akademik/.test(galat), true);
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

// 38. batalkan jadwal mulai tanggal (v1.70.2)
tes('batalkan jadwal: berlaku sampai sehari sebelum tanggal, yang belum berjalan dinonaktifkan, tanggal lampau ditolak', () => {
  const nama = ['jadBacaPm_', 'stafDariToken_', 'jadPeran_', 'absHariIni_', 'catat_'];
  const simpan = {};
  nama.forEach((k) => { simpan[k] = g[k]; });
  try {
    const isi = [['ID PEMETAAN', 'AKTIF', 'TANGGAL SELESAI'], ['P1', true, ''], ['P2', true, ''], ['P3', true, '2026-11-10']];
    const data = [{ id: 'P1', baris: 2, aktif: true, dari: '2026-07-20', sampai: '' }, { id: 'P2', baris: 3, aktif: true, dari: '2026-11-20', sampai: '' },
      { id: 'P3', baris: 4, aktif: true, dari: '2026-07-20', sampai: '2026-11-10' }];
    g.jadBacaPm_ = () => ({ t: { h: { 'ID PEMETAAN': 0, AKTIF: 1, 'TANGGAL SELESAI': 2 }, sh: { getRange: (r, c) => ({ setValue: (x) => { isi[r - 1][c - 1] = x; } }) } }, data });
    g.stafDariToken_ = () => ({ nama: 'Adi', peran: 'Admin' });
    g.jadPeran_ = () => ({ kelola: true });
    g.absHariIni_ = () => '2026-11-13';
    g.catat_ = () => {};
    let galat = '';
    try { g.waStafPemetaanBatal('t', { id: ['P1'], mulai: '2026-11-01' }); } catch (e) { galat = e.message; }
    sama(/sebelum hari ini/.test(galat), true);
    const h = g.waStafPemetaanBatal('t', { id: ['P1', 'P2', 'P3'], mulai: '2026-11-16' });
    sama([h.jumlah, h.dilewati, isi[1][2], isi[2][1], isi[3][2]], [2, 1, '2026-11-15', false, '2026-11-10']);
    sama(g.izFitur_('waStafPemetaanBatal'), 'jadwal');
  } finally { nama.forEach((k) => { g[k] = simpan[k]; }); }
});

// 39. pemeliharaan: kunci sumber masalah & buang dari daftar (v1.70.4)
tes('pemeliharaan: kunci sumber masalah diurai, masalah yang ditindak dibuang dari daftar audit', () => {
  sama(g.pmlUraiKunci_('el|ROM-C11|Ryan Habibi'), { jenis: 'el', idR: 'ROM-C11', nama: 'Ryan Habibi' });
  sama(g.pmlUraiKunci_('wb|WB-9'), { jenis: 'wb', id: 'WB-9' });
  let galat = '';
  try { g.pmlUraiKunci_(''); } catch (e) { galat = e.message; }
  sama(/Periksa sekarang/.test(galat), true, 'audit lama tanpa kunci');
  const simpan = g.pmlSheet_;
  try {
    const isi = [g.PML.HDR_AUDIT.slice(), ['w', 'Tidak ditemukan di Data Induk', 'Ryan', '', '', 'C11', '', '', 'el|R|Ryan'],
      ['w', 'Rombel berbeda', 'Ani', '', 'W1', 'C10', 'C11', '', 'el|R|Ani'], ['w', 'Tidak ditemukan di Data Induk', 'Kusna', '', '', 'C11', '', '', 'el|R|Kusna']];
    g.pmlSheet_ = () => ({
      getLastRow: () => isi.length,
      getRange: (r, c, n, w) => ({
        getValues: () => isi.slice(r - 1, r - 1 + n).map((x) => x.slice(c - 1, c - 1 + w)),
        clearContent: () => { for (let i = r - 1; i < r - 1 + n; i++) isi[i] = isi[i].map(() => ''); },
        setValues: (vals) => { vals.forEach((v, i) => { isi[r - 1 + i] = v.slice(); }); },
      }),
    });
    sama(g.pmlBuangMasalah_('el|R|Ryan'), 1);
    sama([isi[1][2], isi[2][2], isi[3][2]], ['Ani', 'Kusna', ''], 'sisa digeser naik');
  } finally { g.pmlSheet_ = simpan; }
  sama([g.izFitur_('waAdminCekDataRinci'), g.izFitur_('waAdminCekDataTindak')], ['pemeliharaan', 'pemeliharaan']);
});

// 40. impor jadwal dari Excel (v1.70.5)
tes('impor jadwal: pilihan dikenali, mapel harus ada di rombel, bentrok antarbaris & dengan jadwal lama ditolak, tanggal dibaca', () => {
  const simpan = g.ubPetaUnit_;
  try {
    g.ubPetaUnit_ = () => ({ U1: { id: 'U1', nama: 'Unit Barat', aktif: true } });
    const d = {
      kelas: [{ idRombel: 'R1', kodeMapel: 'MTK', namaRombel: 'C11', namaMapel: 'Matematika', program: 'PKT-C', idTutor: '' },
        { idRombel: 'R1', kodeMapel: 'BIND', namaRombel: 'C11', namaMapel: 'Bahasa Indonesia', program: 'PKT-C', idTutor: 'T2' },
        { idRombel: 'R2', kodeMapel: 'MTK', namaRombel: 'C12', namaMapel: 'Matematika', program: 'PKT-C', idTutor: '' }],
      rombel: [{ id: 'R1', nama: 'C11' }, { id: 'R2', nama: 'C12' }],
      mapel: [{ kode: 'MTK', nama: 'Matematika', label: 'MTK - Matematika' }, { kode: 'BIND', nama: 'Bahasa Indonesia', label: 'BIND - Bahasa Indonesia' }],
      tutor: [{ id: 'T1', nama: 'Budi', label: 'Budi' }, { id: 'T2', nama: 'Sari', label: 'Sari' }],
      slot: [{ id: 'S1', nama: 'Sesi 1', mulai: '15:00', selesai: '16:00', label: 'Sesi 1 (15:00–16:00)' }, { id: 'S2', nama: 'Sesi 2', mulai: '16:00', selesai: '17:00', label: 'Sesi 2 (16:00–17:00)' }],
      unit: [{ id: 'U1', nama: 'Unit Barat' }]
    };
    const ada = [{ id: 'L1', aktif: true, idRombel: 'R2', kodeMapel: 'MTK', idTutor: 'T9', hari: 'Senin', mulai: '16:00', selesai: '17:00', dari: '2026-11-01', sampai: '', unit: '' }];
    const baris = [['TEMPLAT'], [], ['NO', 'ROMBEL', 'MAPEL', 'TUTOR', 'HARI', 'SESI', 'TANGGAL MULAI', 'TANGGAL SELESAI', 'UNIT'],
      ['1', 'C11', 'MTK - Matematika', 'Budi', 'Senin', 'Sesi 1 (15:00–16:00)', '2026-11-16', '31/12/2026', 'Unit Barat'],
      ['2', 'C12', 'MTK - Matematika', 'Budi', 'Senin', 'Sesi 1 (15:00–16:00)', '2026-11-16', '', ''],          // tutor sama jam sama mapel sama = kelas gabungan (boleh)
      ['3', 'C11', 'BIND - Bahasa Indonesia', '', 'Senin', 'Sesi 1', '', '', ''],                                   // rombel C11 sudah ada jadwal jam itu
      ['4', 'C11', 'IPA', 'Budi', 'Selasa', 'Sesi 1', '', '', ''],                                                 // mapel tak dikenal
      ['5', 'C12', 'MTK - Matematika', 'Sari', 'Senin', 'Sesi 2 (16:00–17:00)', '', '', ''],                      // bentrok jadwal lama rombel C12
      ['6', 'C11', 'BIND - Bahasa Indonesia', '', 'jumat', 'Sesi 2', '2026-11-20', '', ''],                         // tutor bawaan kelas (Sari)
      ['', '', '', '', '', '', '', '', '']];
    const r = g.jimRencana_(baris, d, ada, '2026-11-13');
    sama([r.item.length, r.galat.length, r.kosong], [3, 3, 1]);
    sama([r.item[0].sampai, r.item[0].unit, r.item[0].idTutor, r.item[1].dari, r.item[2].hari, r.item[2].idTutor], ['2026-12-31', 'U1', 'T1', '2026-11-16', 'Jumat', 'T2']);
    sama(r.galat.map((x) => x.baris), [6, 7, 8]);
    sama(/rombel sudah ada jadwal/.test(r.galat[0].alasan) && /tidak dikenal/.test(r.galat[1].alasan) && /bentrok/.test(r.galat[2].alasan), true);
    sama(g.jimTgl_('45976'), '2025-11-15', 'nomor seri Excel');
    sama([g.izFitur_('waStafPemetaanTemplat'), g.izFitur_('waStafPemetaanImporTerapkan')], ['jadwal', 'jadwal']);
  } finally { g.ubPetaUnit_ = simpan; }
});

// 41. pengaman catat ganda pembayaran gateway (v1.70.6)
tes('gateway: invoice yang sudah ada di Arus Keuangan tidak dicatat ulang', () => {
  const simpan = { keuTrxTab_: g.keuTrxTab_, gwCari_: g.gwCari_, gwUbah_: g.gwUbah_, gwCatatTagihan_: g.gwCatatTagihan_, rfWaktu_: g.rfWaktu_ };
  try {
    const v = [['ID TRANSAKSI', 'URAIAN', 'STATUS'], ['TRX-1', 'Pembayaran X (DOKU VA, invoice TAG-1)', 'Disetujui'], ['A2', 'Biaya admin (invoice TAG-1)', 'Disetujui'],
      ['TRX-9', 'Pembayaran Y (invoice TAG-2)', 'Dibatalkan']];
    g.keuTrxTab_ = () => ({ v, h: { 'ID TRANSAKSI': 0, URAIAN: 1, STATUS: 2 } });
    sama([g.gwTrxAda_('TAG-1'), g.gwTrxAda_('TAG-2'), g.gwTrxAda_('TAG-3')], ['TRX-1,A2', '', '']);
    const ubah = [];
    let dicatat = 0;
    g.gwCari_ = () => ({ INVOICE: 'TAG-1', STATUS: 'Menunggu', JENIS: 'Tagihan', _baris: 2 });
    g.gwUbah_ = (b, o) => ubah.push(o);
    g.gwCatatTagihan_ = () => { dicatat++; return 'BARU'; };
    g.rfWaktu_ = () => '2026-11-13 10:00';
    const h = g.gwSelesai_({ INVOICE: 'TAG-1' }, 24000, 'VIRTUAL_ACCOUNT_BRI');
    sama([h.status, h.idTransaksi, dicatat, ubah[0].STATUS], ['Lunas', 'TRX-1,A2', 0, 'Lunas']);
  } finally { Object.keys(simpan).forEach((k) => { g[k] = simpan[k]; }); }
});

// 42. kop kwitansi dari PENGATURAN (v1.71.0)
tes('kwitansi: kop dibaca dari PENGATURAN, kota dari alamat', () => {
  const simpan = g.simTab_;
  try {
    const buat = (h, r) => ({ getLastRow: () => 2, getLastColumn: () => h.length, getRange: () => ({ getDisplayValues: () => [h, r] }) });
    g.simTab_ = () => buat(['NAMA LEMBAGA', 'ALAMAT', 'NPSN', 'NAMA YAYASAN', 'KOP KWITANSI'],
      ['PKBM Tunas Harapan', 'Jl. Living Raya No 63, Talun, Kab. Cirebon 45171', 'P1', 'YAYASAN SEKAR ARUM', 'Ijin Ops. 1\nAkta 2 | eMail : a@b.c']);
    const k = g.kwKop_();
    sama([k.yayasan, k.nama, k.baris, k.kota, k.logo], ['YAYASAN SEKAR ARUM', 'PKBM Tunas Harapan', ['Ijin Ops. 1', 'Akta 2', 'eMail : a@b.c'], 'Cirebon', '']);
    g.simTab_ = () => buat(['NAMA LEMBAGA', 'ALAMAT', 'NPSN'], ['PKBM X', 'Jl. A, Kota Bandung', 'P2']);
    const k2 = g.kwKop_();
    sama([k2.yayasan, k2.baris, k2.kota], ['', ['Jl. A, Kota Bandung', 'NPSN P2'], 'Bandung']);
  } finally { g.simTab_ = simpan; }
});

// 43. slip honor (v1.72.0)
tes('slip honor: rincian beku dibaca dari rekap, Bendahara dipilih, keperluan & status bayar wajib', () => {
  const r = g.shRincian_({ tarif: 'Bulanan Rp250.000, potong Rp31.250 x 2', catatan: 'Wajib 8 pertemuan, tidak hadir 2 (2026-10-03, 2026-10-10). Jadwal bayar 2026-11-05', jumlah: 6 });
  sama(r, [{ label: 'Honor bulanan', nilai: 250000 }, { label: 'Pertemuan wajib / hadir', teks: '8 / 6 pertemuan' },
    { label: 'Potongan tidak hadir (2 × Rp31.250): 2026-10-03, 2026-10-10', nilai: -62500 }]);
  sama(g.shRincian_({ tarif: '62500', catatan: 'Satuan per sesi', jumlah: 4 }), [{ label: 'Kehadiran', teks: '4 × Rp62.500' }]);
  const nama = ['bacaPengguna_', 'stafDariToken_', 'absBaca_', 'absPetaTutor_', 'absTutorSaya_'];
  const simpan = {};
  nama.forEach((k) => { simpan[k] = g[k]; });
  try {
    g.bacaPengguna_ = () => [{ nama: 'Bendahara', peran: 'Bendahara', status: 'Aktif' }, { nama: 'Dewi Lestari', peran: 'Bendahara', status: 'Aktif' },
      { nama: 'Rina Sari', peran: 'Bendahara', status: 'Aktif' }, { nama: 'Budi', peran: 'Bendahara', status: 'Nonaktif' }];
    sama([g.shBendahara_(['rina sari']), g.shBendahara_(['admin'])], ['Rina Sari', 'Dewi Lestari']);
    g.stafDariToken_ = () => ({ nama: 'Andi Tutor', peran: 'Tutor' });
    g.absTutorSaya_ = () => ({ id: 'T1' });
    g.absPetaTutor_ = () => ({ T1: { nama: 'Andi Tutor' }, T2: { nama: 'Lain' } });
    const hdr = ['ID REKAP', 'BULAN', 'TUTOR', 'JUMLAH HADIR', 'HONOR PER HADIR', 'TOTAL HONOR', 'STATUS', 'CATATAN'];
    const v = [hdr, ['R1', '2026-10', 'T1', 6, '', 187500, 'Disetujui', ''], ['R2', '2026-10', 'T2', 6, '', 187500, 'Dibayar', '']];
    g.absBaca_ = () => ({ v, h: Object.fromEntries(hdr.map((x, i) => [x, i])) });
    let galat = '';
    try { g.waStafHonorSlip('T', ['R1'], 'ok'); } catch (e) { galat = e.message; }
    sama(/keperluan/i.test(galat), true);
    galat = '';
    try { g.waStafHonorSlip('T', ['R2'], 'Pengajuan pinjaman'); } catch (e) { galat = e.message; }
    sama(galat, 'Slip ini tidak tersedia untuk Anda.');
    galat = '';
    try { g.waStafHonorSlip('T', ['R1'], 'Pengajuan pinjaman'); } catch (e) { galat = e.message; }
    sama(/belum dibayar/.test(galat), true);
  } finally { nama.forEach((k) => { g[k] = simpan[k]; }); }
});

// 44. penugasan tutor per unit + tugas tambahan (v1.73.0)
tes('penugasan: impor per unit, kunci unit tutor, tutor online hanya menilai, mode Tutor tugas tambahan', () => {
  const d = { pasang: [{ idRombel: 'R1', namaRombel: 'XII A', kodeMapel: 'MTK', namaMapel: 'Matematika' }],
    unit: [{ id: 'U1', nama: 'Sampiran' }, { id: 'U3', nama: 'Losari' }],
    peta: { 'R1|MTK': { semua: 'T1', unit: {}, ada: true } },
    tutor: [{ id: 'T1', nama: 'Ikman', label: 'Ikman' }, { id: 'T2', nama: 'Patimah', label: 'Patimah' }] };
  const b = [[], [], [], [], [], [], [1, 'XII A [R1]', 'MTK - Matematika', 'Semua unit', 'Ikman'], [2, 'XII A [R1]', 'MTK - Matematika', 'Losari [U3]', 'Patimah'],
    [3, 'XII A [R1]', 'MTK - Matematika', 'Sampiran [U1]', ''], [4, 'XII A [R1]', 'MTK - Matematika', 'Cirebon [U9]', 'Ikman']];
  const r = g.pgoRencana_(b, d);
  sama([r.sama, r.item.map((x) => x.unit + ':' + x.idTutor), r.galat.map((x) => x.baris)], [2, ['U3:T2'], [10]]);
  const sv = ['pgoPeta_', 'ubUnit_', 'pgoMapelTatapMuka_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    g.pgoPeta_ = () => ({ 'R1|MTK': { semua: 'T1', unit: { U3: 'T2' }, ada: true } });
    g.ubUnit_ = () => [{ id: 'U1', aktif: true }, { id: 'U2', aktif: true }, { id: 'U3', aktif: true }];
    sama([g.pgoKunciTutor_('R1|MTK', 'T1'), g.pgoKunciTutor_('R1|MTK', 'T2'), g.pgoKunciTutor_('R1|MTK', 'T9'), g.pgoTutorUnit_('R1|MTK', 'U3'), g.pgoTutorUnit_('R1|MTK', 'U1')],
      ['U1,U2', 'U3', null, 'T2', 'T1']);
    sama(g.pgoSemuaTutor_('R1|MTK'), ['T1', 'T2']);
    const tutor = { id: 'P1', peran: 'Tutor' }, ks = { id: 'P2', peran: 'Kepala Sekolah' };
    g.API_FN_SAAT_INI_ = 'waStafMateriSimpan';
    const tolak = [g.pgoCekTutorOnline_(tutor) !== '', g.pgoCekTutorOnline_(ks)];
    g.API_FN_SAAT_INI_ = 'waStafDiskusiSimpanNilai';
    tolak.push(g.pgoCekTutorOnline_(tutor));
    g.API_FN_SAAT_INI_ = 'waStafMateri';
    tolak.push(g.pgoCekTutorOnline_(tutor));
    sama(tolak, [true, '', '', '']);
    g.pgoMapelTatapMuka_ = () => ({ M1: true });
    sama([g.pgoBolehLihat_(tutor, 'M1'), g.pgoBolehLihat_(tutor, 'M2')], [true, false]);
    g.API_FN_SAAT_INI_ = 'waStafSoalSimpan';
    sama(g.pgoBolehLihat_(tutor, 'M1'), false);
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); g.API_FN_SAAT_INI_ = ''; }
  // tugas tambahan: mode Tutor hanya bila sesi memilihnya
  const sT = g.tgPeta_, sC = g.CacheService;
  try {
    g.tgPeta_ = () => ({ KU1: true });
    const mode = {};
    g.CacheService = { getScriptCache: () => ({ get: (k) => mode[k] || null, put: (k, v) => { mode[k] = v; }, remove: (k) => { delete mode[k]; } }) };
    const ku = { id: 'KU1', peran: 'Koordinator Unit', peranKustom: '' };
    const a = g.tgTerapkanMode_(ku, 'TOK');
    mode.mode_TOK = 'Tutor';
    const b2 = g.tgTerapkanMode_(ku, 'TOK');
    const c = g.tgTerapkanMode_({ id: 'KU2', peran: 'Koordinator Unit' }, 'TOK');
    sama([a.peran, b2.peran, b2.peranUtama, ku.peran, c.peran], ['Koordinator Unit', 'Tutor', 'Koordinator Unit', 'Koordinator Unit', 'Koordinator Unit']);
  } finally { g.tgPeta_ = sT; g.CacheService = sC; }
});

// 45. laporan pemetaan siswa (v1.74.0)
tes('laporan pemetaan: rekap unit × rombel × layanan, siswa tanpa label ke unit utama, KU hanya unitnya', () => {
  const sv = ['stafDariToken_', 'ubUnitSaya_', 'ubPetaSiswa_', 'ubUtama_', 'bacaPengguna_', 'keuWbSemua_', 'kwKop_', 'catat_', 'absWaktu_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    const unit = [{ id: 'U1', nama: 'Sampiran', utama: true, koordinator: [] }, { id: 'U3', nama: 'Losari', utama: false, koordinator: ['K1'] }];
    let peran = 'Admin';
    g.stafDariToken_ = () => ({ id: 'K1', nama: 'X', peran });
    g.ubUnitSaya_ = (p) => (p.peran === 'Admin' ? unit : unit.filter((u) => u.koordinator.includes(p.id)));
    g.ubPetaSiswa_ = () => ({ W1: { unit: 'U1', layanan: 'Reguler' }, W2: { unit: 'U3', layanan: 'Flexi' }, W4: { unit: 'U3', layanan: '' } });
    g.ubUtama_ = () => 'U1';
    g.bacaPengguna_ = () => [{ id: 'K1', nama: 'Bu Koor', peran: 'Tutor', status: 'Aktif' }];   // peran sudah bukan KU: tetap tampil nama
    g.keuWbSemua_ = () => [{ id: 'W1', nama: 'Ani', idRombel: 'R1', namaRombel: 'XII', aktif: true }, { id: 'W2', nama: 'Budi', idRombel: 'R1', namaRombel: 'XII', aktif: true },
      { id: 'W3', nama: 'Cici', idRombel: 'R2', namaRombel: 'IX', aktif: true }, { id: 'W4', nama: 'Dodi', idRombel: 'R1', namaRombel: 'XII', aktif: true },
      { id: 'W5', nama: 'Eka', idRombel: 'R1', namaRombel: 'XII', aktif: false }];
    g.kwKop_ = () => ({}); g.catat_ = () => {}; g.absWaktu_ = () => 'W';
    const a = g.waStafLaporanPemetaanSiswa('T');
    sama(a.unit.map((u) => [u.nama, u.total, u.reguler, u.flexi, u.tanpaLayanan, u.ikutUtama, u.rombel.map((r) => r.nama + ':' + r.total).join(',')]),
      [['Sampiran', 2, 1, 0, 1, 1, 'IX:1,XII:1'], ['Losari', 2, 0, 1, 1, 0, 'XII:2']]);
    sama([a.total.total, a.unit[1].koordinator], [4, ['Bu Koor']]);
    peran = 'Koordinator Unit';
    const b = g.waStafLaporanPemetaanSiswa('T');
    sama([b.unit.map((u) => u.nama), b.total.total, b.semua], [['Losari'], 2, false]);
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

// 46. log aktivitas per nama + calon siswa -> siswa (v1.74.1)
tes('log aktivitas: daftar orang per nama, kunci lama dikenali, calon siswa aktif jadi siswa', () => {
  const sv = ['wajibAdmin_', 'pastikanSheetAktivitas_', 'aktRapikanCalonSekali_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    const data = [
      ['2026-11-01 08:00:00', 'Calon siswa', '', 'ISMAWATI', 'Daftar', '', 'OK'],
      ['2026-11-01 08:05:00', 'Siswa', 'R1', 'Ismawati ', 'Masuk', '', 'OK'],
      ['2026-11-01 08:06:00', 'Siswa', 'R1', 'ISMAWATI', 'Absensi', '', 'OK'],
      ['2026-11-01 09:00:00', 'Staf', '', 'Administrator', 'Masuk', 'kode salah', 'GAGAL'],
      ['2026-11-01 09:01:00', 'Admin', '', 'Administrator', 'Masuk', '', 'OK'],
      ['2026-11-01 10:00:00', 'Calon siswa', '', 'Budi', 'Daftar - OTP salah', '', 'GAGAL'],
    ];
    const ditulis = [];
    const sh = {
      getLastRow: () => data.length + 1,
      getRange: (r, c, nr, nc) => ({
        getValues: () => data.slice(r - 2, r - 2 + nr).map((x) => x.slice(c - 1, c - 1 + nc)),
        setValue: (val) => { ditulis.push([r, c, val]); data[r - 2][c - 1] = val; },
      }),
    };
    g.wajibAdmin_ = () => ({}); g.pastikanSheetAktivitas_ = () => sh; g.aktRapikanCalonSekali_ = () => 0;
    const a = g.waAdminLog('T', '');
    sama(a.orang.map((o) => [o.nama, o.peran, o.jumlah]), [['Administrator', 'Admin · Staf', 2], ['Budi', 'Calon siswa', 1], ['ISMAWATI', 'Siswa · Calon siswa', 3]]);
    sama(g.waAdminLog('T', 'N|ismawati').riwayat.length, 3);
    sama(g.waAdminLog('T', 'Siswa|ismawati').riwayat.length, 3, 'kunci lama (APK lama) tetap jalan');
    const n = g.aktCalonJadiSiswa_({ ismawati: true });
    sama([n, ditulis, data[5][1]], [1, [[2, 2, 'Siswa']], 'Calon siswa']);
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

// 47. penilaian diskusi mengikuti izin penilaian, bukan izin Mata Pelajaran (v1.74.2)
tes('izin: Tutor dengan Mata Pelajaran "tidak" tetap bisa menilai diskusi; izin penilaian "tidak" memblokir', () => {
  const simpan = g.izData_;
  try {
    const coba = (fn, orang) => { g.__API_FN = fn; g.__IZN_OK = ''; g.__IZN_PROKSI = null; try { g.izPeriksa_(orang); return 'boleh'; } catch (e) { return 'tolak'; } };
    const t = { id: 'U1', nama: 'Pak Tutor', peran: 'Tutor' };
    const fnNilai = ['waStafSesiDiskusi', 'waStafDiskusiJawaban', 'waStafDiskusiNilaiAi', 'waStafDiskusiSimpanNilai', 'waStafCatatanNilai', 'waStafBelumDinilai'];
    sama(fnNilai.map((f) => g.izFitur_(f)), fnNilai.map(() => 'nilai'));
    g.izData_ = () => ({ peran: {}, izin: { Tutor: { mapelSaya: 'tidak' } } });
    sama(fnNilai.map((f) => coba(f, t)), fnNilai.map(() => 'boleh'), 'konten dibatasi, penilaian tetap jalan');
    sama(coba('waStafMateriLengkap', t), 'tolak', 'konten tetap dibatasi');
    g.izData_ = () => ({ peran: {}, izin: { Tutor: { nilai: 'lihat' } } });
    sama([coba('waStafSesiDiskusi', t), coba('waStafDiskusiSimpanNilai', t)], ['boleh', 'tolak'], 'izin penilaian lihat = hanya melihat');
    g.izData_ = () => ({ peran: {}, izin: {} });
    sama(coba('waStafDiskusiSimpanNilai', { id: 'K1', nama: 'Bu KS', peran: 'Kepala Sekolah' }), 'boleh');
    g.__API_FN = '';
  } finally { g.izData_ = simpan; }
});

// 48. saran AI diskusi: siswa unit lain ditandai, AI hanya untuk tanggapan terpilih (v1.75.0)
tes('diskusi: siswa unit lain ditandai tidak dinilai, saran AI mengikuti pilihan tutor', () => {
  const sv = ['wajibMapel_', 'wajibPengampu_', 'ndPastikanDiskusi_', 'ndDaftarJawaban_', 'bacaRoster_', 'ndBolehNilai_', 'pgoSaringSiswaBm_',
    'aiWajibSiap_', 'hitung_', 'aiPanggil_', 'aiParseJson_', 'aiTeksDariRespons_', 'ndBangunPrompt_', 'kmCatat_', 'aiRingkasPakai_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    const r = { p: { id: 'U1', nama: 'Pak Tutor', peran: 'Tutor' }, m: { idMapel: 'M1', idRombel: 'R1', namaMapel: 'PAI' } };
    g.wajibMapel_ = () => r; g.wajibPengampu_ = () => r; g.ndBolehNilai_ = () => true;
    g.ndPastikanDiskusi_ = () => ({ judul: 'Diskusi', pertanyaan: 'Apa itu ilmu kalam?' });
    g.ndDaftarJawaban_ = () => ({ baris: [{ siswa: 'DIAN', jawaban: 'a' }, { siswa: 'Ismawati', jawaban: 'b' }, { siswa: 'Patna', jawaban: 'c' }, { siswa: 'Tono', jawaban: 'd' }] });
    g.bacaRoster_ = () => [{ nama: 'DIAN', k: 'dian' }, { nama: 'Ismawati', k: 'ismawati' }, { nama: 'Patna', k: 'patna' }, { nama: 'Tono', k: 'tono' }];
    g.pgoSaringSiswaBm_ = () => (n) => n !== 'Ismawati' && n !== 'Patna';   // Ismawati & Patna: unit lain
    const s = g.waStafSesiDiskusi('T', 'M1', 'X1');
    sama(s.jawaban.map((j) => [j.siswa, j.bolehNilai]), [['DIAN', true], ['Ismawati', false], ['Patna', false], ['Tono', true]]);
    let dikirim = 0;
    g.aiWajibSiap_ = () => {}; g.hitung_ = () => 1; g.ndBangunPrompt_ = (m, q, butir) => { dikirim = butir.length; return ''; };
    g.aiPanggil_ = () => ({ json: {} }); g.aiTeksDariRespons_ = () => ''; g.kmCatat_ = () => {}; g.aiRingkasPakai_ = () => '';
    g.aiParseJson_ = () => ({ hasil: [{ no: 1, skor: 88, alasan: 'ok' }, { no: 2, skor: 77, alasan: 'ok' }] });
    const semua = g.ndNilaiAiInti_('T', 'M1', 'X1', 0);
    sama([semua.hasil.map((h) => h.siswa), semua.total, dikirim], [['DIAN', 'Tono'], 2, 2], 'tanpa pilihan: semua siswa unitnya');
    const pilih = g.ndNilaiAiInti_('T', 'M1', 'X1', 0, ['tono ', 'Patna']);
    sama([pilih.hasil.map((h) => [h.siswa, h.skor]), pilih.total], [[['Tono', 88]], 1], 'pilihan dibatasi unit; unit lain tetap tidak dinilai');
    g.pgoSaringSiswaBm_ = () => null;
    sama(g.waStafSesiDiskusi('T', 'M1', 'X1').jawaban.every((j) => j.bolehNilai), true, 'tanpa batas unit: semua boleh');
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

// 49. sinkron SIM tidak menimpa peran & status dari aplikasi (v1.75.1)
tes('sinkron SIM: peran & status di tab Pengguna tidak ditimpa, peran kosong diisi, tutor aktif di Data Induk diaktifkan', () => {
  const sv = ['getSheet', 'izPeranKustom_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    const data = [
      ['ID', 'NAMA', 'PERAN', 'KODE', 'EMAIL', 'STATUS', 'DIBUAT'],
      ['U1', 'Eva Farihah', 'Bendahara', 'K1', 'eva@x.id', 'Aktif', ''],
      ['U2', 'Pak Lama', 'Tutor', 'K2', 'lama@x.id', 'Nonaktif', ''],
      ['U3', 'Bu Admin Off', 'Admin', 'K3', 'off@x.id', 'Nonaktif', ''],
      ['U4', 'Tanpa Peran', '', 'K4', '', '', ''],
      ['U5', 'Wali', 'Wali Kelas', 'K5', 'wali@x.id', 'Aktif', ''],
    ];
    const sh = {
      getDataRange: () => ({ getValues: () => data.map((r) => r.slice()) }),
      getRange: (r, c) => ({ setValue: (v) => { data[r - 1][c - 1] = v; } }),
      appendRow: (row) => data.push(row),
    };
    g.getSheet = () => sh;
    g.izPeranKustom_ = (n) => (n === 'Wali Kelas' ? { nama: 'Wali Kelas', dasar: 'Tutor' } : null);
    const a = g.ssoSelaraskan_('eva@x.id', { nama: 'Eva', peran: 'Admin' });
    sama([a.peran, a.status, data[1][2]], ['Bendahara', 'Aktif', 'Bendahara'], 'peran Admin dari SIM tidak menimpa Bendahara');
    const b = g.ssoSelaraskan_('lama@x.id', { nama: 'Pak Lama', peran: 'Tutor' });
    sama([b.status, data[2][5]], ['Aktif', 'Aktif'], 'tutor aktif di Data Induk diaktifkan kembali');
    const c = g.ssoSelaraskan_('off@x.id', { nama: 'Bu Admin Off', peran: 'Admin' });
    sama([c.status, data[3][5]], ['Nonaktif', 'Nonaktif'], 'akun dinonaktifkan Admin tetap nonaktif');
    const d = g.ssoSelaraskan_('baru@x.id', { nama: 'Tanpa Peran', peran: 'Kepala Sekolah' });
    sama([d.id, data[4][2], data[4][4], data[4][5]], ['U4', 'Kepala Sekolah', 'baru@x.id', 'Aktif'], 'peran kosong diisi dari SIM');
    const e = g.ssoSelaraskan_('wali@x.id', { nama: 'Wali', peran: 'Tutor' });
    sama([e.peran, data[5][2]], ['Wali Kelas', 'Wali Kelas'], 'peran kustom tidak dikembalikan ke Tutor');
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

// 50. jadwal selang-seling minggu ke-1 & 3 / 2 & 4 (v1.76.0)
tes('jadwal minggu ke: berlaku per minggu dalam bulan, minggu ke-5 ikut 1 & 3, 1,3 vs 2,4 tidak bentrok, impor Excel', () => {
  const sv = ['jadKelasAktif_', 'agLiburPm_', 'ubPetaUnit_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    sama([g.jadMingguSah_('1,3'), g.jadMingguSah_('2 & 4'), g.jadMingguSah_(13), g.jadMingguSah_('Setiap minggu'), g.jadMingguSah_('1,2,3,4'), g.jadMingguSah_('3,1')],
      ['1,3', '2,4', '1,3', '', '', '1,3']);
    g.jadKelasAktif_ = () => ({ 'R1|INF': true, 'R2|BING': true });
    g.agLiburPm_ = () => false;
    const a = { aktif: true, idRombel: 'R1', kodeMapel: 'INF', hari: 'Senin', minggu: '1,3', dari: '', sampai: '' };
    const b = { aktif: true, idRombel: 'R2', kodeMapel: 'BING', hari: 'Senin', minggu: '2,4', dari: '', sampai: '' };
    // Senin di Juni 2026: 1, 8, 15, 22, 29
    const tgl = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29'];
    sama(tgl.map((t) => [g.jadBerlaku_(a, t), g.jadBerlaku_(b, t)]), [[true, false], [false, true], [true, false], [false, true], [true, false]]);
    sama(g.jadBerlaku_(Object.assign({}, a, { minggu: '' }), '2026-06-08'), true, 'kosong = setiap minggu');
    const ada = [{ id: 'X', aktif: true, idRombel: 'R1', kodeMapel: 'INF', idTutor: 'EKA', hari: 'Senin', mulai: '13:00', selesai: '14:30', dari: '', sampai: '', unit: '', minggu: '1,3' }];
    const baru = { idRombel: 'R2', kodeMapel: 'BING', idTutor: 'EKA', hari: 'Senin', mulai: '13:00', selesai: '14:30', dari: '', sampai: '', unit: '', minggu: '2,4' };
    sama(g.jadBentrok_(ada, baru, ''), [], 'Bu Eka minggu 1,3 & 2,4 di sesi yang sama tidak bentrok');
    sama(g.jadBentrok_(ada, Object.assign({}, baru, { minggu: '' })).length, 1, 'setiap minggu vs 1,3 bentrok');
    sama(g.jadBentrok_(ada, Object.assign({}, baru, { minggu: '3' })).length, 1, '1,3 vs 3 bentrok');
    g.ubPetaUnit_ = () => ({});
    const d = {
      kelas: [{ idRombel: 'R1', kodeMapel: 'INF', namaRombel: 'B9', namaMapel: 'Informatika', program: 'PKT-B', idTutor: 'EKA' },
        { idRombel: 'R1', kodeMapel: 'BING', namaRombel: 'B9', namaMapel: 'Bahasa Inggris', program: 'PKT-B', idTutor: 'EKA' }],
      rombel: [{ id: 'R1', nama: 'B9' }],
      mapel: [{ kode: 'INF', nama: 'Informatika', label: 'INF - Informatika' }, { kode: 'BING', nama: 'Bahasa Inggris', label: 'BING - Bahasa Inggris' }],
      tutor: [{ id: 'EKA', nama: 'Eka', label: 'Eka' }],
      slot: [{ id: 'S1', nama: 'Sesi 1', mulai: '13:00', selesai: '14:30', label: 'Sesi 1 (13:00–14:30)' }],
      unit: []
    };
    const baris = [['NO', 'ROMBEL', 'MAPEL', 'TUTOR', 'HARI', 'SESI', 'TANGGAL MULAI', 'TANGGAL SELESAI', 'UNIT', 'MINGGU KE'],
      ['1', 'B9', 'INF - Informatika', 'Eka', 'Senin', 'Sesi 1', '', '', '', '1,3'],
      ['2', 'B9', 'BING - Bahasa Inggris', 'Eka', 'Senin', 'Sesi 1', '', '', '', '2,4'],
      ['3', 'B9', 'BING - Bahasa Inggris', 'Eka', 'Senin', 'Sesi 1', '', '', '', 'Setiap minggu'],   // bentrok dengan keduanya
      ['4', 'B9', 'INF - Informatika', 'Eka', 'Selasa', 'Sesi 1', '', '', '', '5']];                 // minggu tidak sah
    const r = g.jimRencana_(baris, d, [], '2026-11-13');
    sama([r.item.map((x) => x.minggu), r.galat.map((x) => x.baris)], [['1,3', '2,4'], [4, 5]]);
    sama([/bentrok/.test(r.galat[0].alasan), /tidak sah/.test(r.galat[1].alasan)], [true, true]);
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

// 51. notifikasi kelayakan ujian sesuai konteks + peran perangkat mengikuti akun sekarang (v1.76.1)
tes('notif kelayakan: Admin & KS semua, Bendahara hanya keuangan, akademik ke koordinator unit & pengampu (per akun); peran perangkat = peran akun sekarang', () => {
  const sv = ['npAturan_', 'npIzinFitur_', 'penggunaCache_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    // aturan diubah admin: Bendahara ikut dicentang di akademik (harus tetap ditolak)
    g.npAturan_ = () => ({ kl_aju_akademik: ['Koordinator Kurikulum', 'Bendahara'], kl_aju_keuangan: ['Bendahara'], kl_ks: ['Kepala Sekolah'], kl_janji: ['Bendahara'] });
    g.npIzinFitur_ = () => ({ boleh: true, tambahan: false });
    const at = g.npAturan_(), ctx = {};
    const ev = (jenis) => ({ jenis, siswa: [], tutor: [], staf: [] });
    const terima = (peran) => ['kl_aju_akademik', 'kl_aju_keuangan', 'kl_ks', 'kl_janji'].filter((j) => g.npCocok_(ev(j), { jenis: 'staf', id: 'X', peran }, at, ctx));
    sama(terima('Admin'), ['kl_aju_akademik', 'kl_aju_keuangan', 'kl_ks', 'kl_janji']);
    sama(terima('Kepala Sekolah'), ['kl_aju_akademik', 'kl_aju_keuangan', 'kl_ks', 'kl_janji']);
    sama(terima('Bendahara'), ['kl_aju_keuangan', 'kl_janji']);
    sama(terima('Koordinator Kurikulum'), [], 'v1.94.0: kurikulum tidak lagi menerima');
    sama(g.npCocok_({ jenis: 'kl_aju_akademik', siswa: [], tutor: [], staf: ['K7'] }, { jenis: 'staf', id: 'K7', peran: 'Koordinator Unit' }, at, ctx), true, 'koordinator unit / pengampu yang dituju menerima');
    sama(terima('Front Office'), []);
    g.penggunaCache_ = () => [{ id: 'U1', nama: 'Eva', peran: 'Bendahara', peranKustom: '', status: 'Aktif' }, { id: 'U2', nama: 'Off', peran: 'Admin', status: 'Nonaktif' }];
    sama(g.bcPeranKini_({ jenis: 'staf', id: 'U1', nama: 'Eva', peran: 'Admin' }).peran, 'Bendahara', 'perangkat didaftarkan saat Admin');
    sama(g.bcPeranKini_({ jenis: 'staf', id: 'U2', nama: 'Off', peran: 'Admin' }), null, 'akun nonaktif tidak menerima');
    sama(g.bcPeranKini_({ jenis: 'siswa', id: '', nama: 'Ani', rombel: 'R1', peran: '' }).nama, 'Ani');
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

// 52. templat jadwal: rombel menyeluruh "Seluruh Paket A/B/C" (v1.76.2)
tes('impor jadwal: Seluruh Paket B dipecah ke semua rombel B yang punya mapel itu, kelas gabungan, bentrok per rombel', () => {
  const simpan = g.ubPetaUnit_;
  try {
    g.ubPetaUnit_ = () => ({});
    const d = {
      kelas: [{ idRombel: 'R7', kodeMapel: 'INF', namaRombel: 'B7', namaMapel: 'Informatika', program: 'PKT-B', idTutor: '' },
        { idRombel: 'R8', kodeMapel: 'INF', namaRombel: 'B8', namaMapel: 'Informatika', program: 'PKT-B', idTutor: '' },
        { idRombel: 'R9', kodeMapel: 'INF', namaRombel: 'B9', namaMapel: 'Informatika', program: 'PKT-B', idTutor: '' },
        { idRombel: 'R10', kodeMapel: 'INF', namaRombel: 'C10', namaMapel: 'Informatika', program: 'PKT-C', idTutor: '' },
        { idRombel: 'R4', kodeMapel: 'MTK', namaRombel: 'A4', namaMapel: 'Matematika', program: '', idTutor: 'T9' }],
      rombel: [{ id: 'R7', nama: 'B7' }, { id: 'R8', nama: 'B8' }, { id: 'R9', nama: 'B9' }, { id: 'R10', nama: 'C10' }, { id: 'R4', nama: 'A4' }],
      mapel: [{ kode: 'INF', nama: 'Informatika', label: 'INF - Informatika' }, { kode: 'MTK', nama: 'Matematika', label: 'MTK - Matematika' }],
      tutor: [{ id: 'EKA', nama: 'Eka', label: 'Eka' }, { id: 'T9', nama: 'Sari', label: 'Sari' }],
      slot: [{ id: 'S1', nama: 'Sesi 1', mulai: '13:00', selesai: '14:30', label: 'Sesi 1 (13:00–14:30)' }],
      unit: []
    };
    sama([g.jimJenjang_(d.kelas[0]), g.jimJenjang_(d.kelas[4]), g.jimJenjang_({ program: '', namaRombel: 'KELAS C12' })], ['B', 'A', 'C']);
    // B9 sudah ada jadwal rombel di Senin sesi 1 -> hanya B9 yang ditolak
    const ada = [{ id: 'L1', aktif: true, idRombel: 'R9', kodeMapel: 'IPS', idTutor: 'X', hari: 'Senin', mulai: '13:00', selesai: '14:30', dari: '', sampai: '', unit: '', minggu: '' }];
    const baris = [['NO', 'ROMBEL', 'MAPEL', 'TUTOR', 'HARI', 'SESI', 'TANGGAL MULAI', 'TANGGAL SELESAI', 'UNIT', 'MINGGU KE'],
      ['1', 'Seluruh Paket B', 'INF - Informatika', 'Eka', 'Senin', 'Sesi 1', '', '', '', '1,3'],
      ['2', 'Seluruh Paket A', 'INF - Informatika', 'Eka', 'Selasa', 'Sesi 1', '', '', '', ''],     // tidak ada rombel A dengan INF
      ['3', 'Seluruh Paket A', 'MTK - Matematika', '', 'Rabu', 'Sesi 1', '', '', '', '']];          // tutor bawaan kelas
    const r = g.jimRencana_(baris, d, ada, '2026-11-13');
    sama(r.item.map((x) => [x.baris, x.namaRombel, x.idTutor, x.minggu]), [[2, 'B7', 'EKA', '1,3'], [2, 'B8', 'EKA', '1,3'], [4, 'A4', 'T9', '']]);
    sama(r.galat.map((x) => [x.baris, /^B9: bentrok/.test(x.alasan) || /tidak ada rombel Paket A/.test(x.alasan)]), [[2, true], [3, true]]);
  } finally { g.ubPetaUnit_ = simpan; }
});

// 53. kelas hanya dari Data Induk, lepas dari e-learning (v1.77.0)
tes('kelas: hanya ENROLL MAPEL; enrollment & status e-learning diabaikan; kelas tutor dari Pengampu / tutor bawaan / jadwal', () => {
  const sv = ['absKelasSim_', 'pgoSemuaTutor_', 'absPetaTutor_', 'jadBacaPm_', 'bacaEnrollment_', 'nilPetaBm_', 'absKelasBmAktif_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    ['*', 'TW', 'TB', 'TZ'].forEach((k) => g.CacheService.getScriptCache().remove('abs_kelas3_' + k));
    const kls = (r, m, t) => ({ idRombel: r, namaRombel: r, program: '', kodeMapel: m, namaMapel: m, idTutor: t || '', namaTutor: '' });
    g.absKelasSim_ = () => [kls('B7', 'IPA'), kls('B7', 'BIND', 'TW'), kls('C12', 'MTK')];
    g.pgoSemuaTutor_ = (key) => (key === 'B7|IPA' ? ['TB'] : []);
    g.absPetaTutor_ = () => ({ TW: { nama: 'Winda' }, TB: { nama: 'Budi' }, TZ: { nama: 'Zaki' } });
    g.jadBacaPm_ = () => ({ data: [{ aktif: true, idTutor: 'TZ', idRombel: 'C12', kodeMapel: 'MTK' }] });
    // jebakan: e-learning punya enrollment & mapel aktif lain -> tidak boleh ikut
    g.bacaEnrollment_ = () => [{ idPengguna: 'U9', idMapel: 'MP-X' }];
    g.nilPetaBm_ = () => ({ kelas: { 'B7|IPA': [{ idMapel: 'MP-IPA', aktif: false }] }, aktif: {}, rombel: {} });
    g.absKelasBmAktif_ = () => [kls('B7', 'INF')];
    sama(g.absKelas_('').map((k) => k.idRombel + '|' + k.kodeMapel), ['B7|BIND', 'B7|IPA', 'C12|MTK'], 'IPA tetap ada walau nonaktif di e-learning; INF e-learning tidak ikut');
    sama(g.absKelas_('TW').map((k) => k.kodeMapel), ['BIND'], 'tutor bawaan ENROLL MAPEL');
    sama(g.absKelas_('TB').map((k) => [k.kodeMapel, k.namaTutor]), [['IPA', 'Budi']], 'Tutor Online dari Pengampu');
    sama(g.absKelas_('TZ').map((k) => [k.kodeMapel, k.tatapMuka === true]), [['MTK', true]], 'tutor tatap muka dari jadwal');
  } finally {
    sv.forEach((k) => { g[k] = simpan[k]; });
    ['*', 'TW', 'TB', 'TZ'].forEach((k) => g.CacheService.getScriptCache().remove('abs_kelas3_' + k));
  }
});

// 54. Data Induk sumber tunggal: e-learning mengikuti satu arah (v1.78.0)
tes('data induk tunggal: status mapel & rombel e-learning ikut Data Induk, mapel baru dibuat, jalur ubah e-learning ditutup', () => {
  const rombelSim = [{ id: 'S7', nama: 'B7', aktif: true }, { id: 'S9', nama: 'B9', aktif: false }];
  const rombelLms = [['ROM-KELASB7', 'Kelas B7', '', 'Aktif'], ['ROM-KELASB9', 'Kelas B9', '', 'Aktif'], ['ROM-X', 'Lain', '', 'Aktif']];
  const kelas = { 'S7|IPA': { idRombel: 'S7', kodeMapel: 'IPA', namaMapel: 'Ilmu Pengetahuan Alam' }, 'S7|INF': { idRombel: 'S7', kodeMapel: 'INF', namaMapel: 'Informatika' } };
  const peta = { kelas: { 'S7|IPA': [{ idMapel: 'MP-B09-KELASB7' }], 'S7|PAK': [{ idMapel: 'MP-PAK-KELASB7' }] } };
  const mapelLms = [['MP-B09-KELASB7', 'ROM-KELASB7', 'IPA', '', 'Nonaktif'], ['MP-PAK-KELASB7', 'ROM-KELASB7', 'Agama Kristen', '', 'Aktif'],
    ['MP-INF-KELASB7', 'ROM-KELASB7', 'Lama', '', 'Nonaktif'], ['MP-LAIN', 'ROM-X', 'Tidak dikenal', '', 'Aktif']];
  const r = g.ditRencana_(rombelSim, rombelLms, kelas, peta, mapelLms);
  sama(r.rombel, [{ baris: 1, status: 'Nonaktif' }], 'B9 nonaktif di Data Induk -> nonaktif di e-learning; rombel tak dikenal dibiarkan');
  sama(r.mapel.map((x) => [x.idMapel, x.status]), [['MP-B09-KELASB7', 'Aktif'], ['MP-PAK-KELASB7', 'Nonaktif']], 'mapel tak terhubung (MP-LAIN) dibiarkan');
  sama(r.baru, [['MP-INF-KELASB7-2', 'ROM-KELASB7', 'Informatika', '', 'Aktif']], 'kelas Data Induk tanpa mapel e-learning dibuat, ID tidak bentrok');
  // jalur ubah langsung di e-learning ditutup
  const sv = ['wajibAdmin_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    g.wajibAdmin_ = () => ({ id: 'A', nama: 'Admin', peran: 'Admin' });
    let e1 = '', e2 = '';
    try { g.waAdminSimpanMapel('T', { nama: 'IPA', idRombel: 'R', status: 'Aktif' }); } catch (e) { e1 = e.message; }
    try { g.waAdminSetEnrollment('T', 'U1', ['MP-1']); } catch (e) { e2 = e.message; }
    sama([/Enroll Mapel/.test(e1), /Pengampu/.test(e2), g.ssoSelarasEnroll_('a@b.c', { id: 'U1' })], [true, true, 0]);
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

tes('pengajuan mapel tutor disetujui -> Tutor Online semua unit di Pengampu (bukan enrollment langsung)', () => {
  const sv = ['itPastikanTutor_', 'nilPetaBm_', 'absKelasSim_', 'pgoPeta_', 'pgoTulis_', 'pgoLupakan_', 'pgoTulisInduk_', 'pgoSelaraskanEnroll_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    let ditulis = null, selaras = null;
    g.itPastikanTutor_ = () => 'TT-EKA';
    g.nilPetaBm_ = () => ({ kelas: { 'S7|INF': [{ idMapel: 'MP-INF' }], 'S7|BING': [{ idMapel: 'MP-BING' }], 'S7|IPA': [{ idMapel: 'MP-IPA' }] } });
    g.absKelasSim_ = () => [{ idRombel: 'S7', kodeMapel: 'INF' }, { idRombel: 'S7', kodeMapel: 'BING' }];
    g.pgoPeta_ = () => ({ 'S7|BING': { semua: 'TT-LAIN', unit: {}, ada: true } });
    g.pgoTulis_ = (d) => { ditulis = d; return d.length; };
    g.pgoLupakan_ = () => {}; g.pgoTulisInduk_ = () => {};
    g.pgoSelaraskanEnroll_ = (k) => { selaras = k; };
    const h = g.ditSetujuiPengajuanTutor_({ id: 'U1', nama: 'Eka' }, ['MP-INF', 'MP-BING', 'MP-IPA'], 'Admin');
    sama([h.ditugaskan, ditulis, selaras], [1, [{ idRombel: 'S7', kodeMapel: 'INF', unit: '', idTutor: 'TT-EKA' }], ['S7|INF']]);
    sama(h.dilewati.length, 2, 'BING sudah ada tutor bawaan, IPA belum aktif di Enroll Mapel');
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

// 55. profil siswa: sesi habis dijawab sebagai data, bukan galat (v1.78.1)
tes('profil siswa: token kedaluwarsa -> {sesiHabis: true} tanpa galat; galat lain tetap dilempar', () => {
  const simpan = g.siswaDariSesi_;
  try {
    g.siswaDariSesi_ = () => { throw new Error('SESI_HABIS'); };
    const r = g.waProfilSiswa('token-lama');
    sama([r.sesiHabis, r.jenis, r.nama], [true, 'Siswa', '']);
    g.siswaDariSesi_ = () => { throw new Error('Lain'); };
    let galat = '';
    try { g.waProfilSiswa('x'); } catch (e) { galat = e.message; }
    sama(galat, 'Lain');
  } finally { g.siswaDariSesi_ = simpan; }
});

// 56. ruang belajar & lokasi jadwal (v1.79.0)
tes('ruang: bentrok ruang kecuali kelas gabungan, lokasi bebas, ruang nonaktif ditolak, impor RUANG / LOKASI', () => {
  const sv = ['jadRuangPeta_', 'ubPetaUnit_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    g.jadRuangPeta_ = () => ({ R1: { kode: 'R1', nama: 'Ruang 1', namaUnit: 'Sampiran', aktif: true }, R9: { kode: 'R9', nama: 'Gudang', aktif: false } });
    sama(g.jadLokasiSah_({ ruang: 'R1', lokasi: 'abaikan' }), { ruang: 'R1', lokasi: '' });
    sama(g.jadLokasiSah_({ ruang: '', lokasi: '  Aula   Desa ' }), { ruang: '', lokasi: 'Aula Desa' });
    let e = '';
    try { g.jadLokasiSah_({ ruang: 'R9' }); } catch (x) { e = x.message; }
    sama(/nonaktif/.test(e), true);
    const ada = [{ id: 'A', aktif: true, idRombel: 'B7', kodeMapel: 'IPA', idTutor: 'T1', hari: 'Senin', mulai: '13:00', selesai: '14:00', dari: '', sampai: '', unit: '', minggu: '', ruang: 'R1' }];
    const lain = { idRombel: 'C10', kodeMapel: 'MTK', idTutor: 'T2', hari: 'Senin', mulai: '13:30', selesai: '14:30', dari: '', sampai: '', unit: '', minggu: '', ruang: 'R1' };
    sama(g.jadBentrok_(ada, lain, '').length, 1, 'ruang sama, kelas lain -> bentrok');
    sama(g.jadBentrok_(ada, Object.assign({}, lain, { kodeMapel: 'IPA', idTutor: 'T1' }), ''), [], 'kelas gabungan boleh satu ruang');
    sama(g.jadBentrok_(ada, Object.assign({}, lain, { ruang: '' }), ''), [], 'tanpa ruang tidak dicek');
    g.ubPetaUnit_ = () => ({});
    const d = {
      kelas: [{ idRombel: 'B7', kodeMapel: 'IPA', namaRombel: 'B7', namaMapel: 'IPA', program: 'PKT-B', idTutor: 'T1' }],
      rombel: [{ id: 'B7', nama: 'B7' }], mapel: [{ kode: 'IPA', nama: 'IPA', label: 'IPA - IPA' }], tutor: [{ id: 'T1', nama: 'Budi', label: 'Budi' }],
      slot: [{ id: 'S1', nama: 'Sesi 1', mulai: '13:00', selesai: '14:00', label: 'Sesi 1 (13:00–14:00)' }], unit: [],
      ruang: [{ kode: 'R1', nama: 'Ruang 1', label: 'Ruang 1 (Sampiran)' }]
    };
    const baris = [['ROMBEL', 'MAPEL', 'TUTOR', 'HARI', 'SESI', 'RUANG / LOKASI'],
      ['B7', 'IPA', 'Budi', 'Senin', 'Sesi 1', 'Ruang 1 (Sampiran)'],
      ['B7', 'IPA', 'Budi', 'Selasa', 'Sesi 1', 'Aula Desa'],
      ['B7', 'IPA', 'Budi', 'Rabu', 'Sesi 1', '']];
    const r = g.jimRencana_(baris, d, [], '2026-11-14');
    sama(r.item.map((x) => [x.hari, x.ruang, x.lokasi]), [['Senin', 'R1', ''], ['Selasa', '', 'Aula Desa'], ['Rabu', '', '']]);
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

// 57. beranda tutor: jadwal minggu ini + ruang + agenda yang meniadakan (v1.79.1)
tes('beranda tutor: 7 hari, status absen hari ini, ruang tampil, jadwal ditiadakan agenda diberi keterangan', () => {
  const sv = ['waStafJadwalHari', 'jadBacaPm_', 'jadLengkapi_', 'agLiburPm_', 'brdTgl_', 'absHariIni_', 'jadKelasAktif_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    // Senin 16 Nov 2026 = hari ini
    const tgl = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
    g.brdTgl_ = (n) => tgl[n]; g.absHariIni_ = () => tgl[0];
    g.jadKelasAktif_ = () => ({ 'B7|INF': true, 'C10|SBD': true });
    const pm = [
      { id: 'J1', aktif: true, idTutor: 'TW', idRombel: 'B7', kodeMapel: 'INF', hari: 'Senin', mulai: '13:00', selesai: '14:00', dari: '', sampai: '', minggu: '', unit: '' },
      { id: 'J2', aktif: true, idTutor: 'TW', idRombel: 'C10', kodeMapel: 'SBD', hari: 'Kamis', mulai: '15:00', selesai: '16:00', dari: '', sampai: '', minggu: '', unit: '' },
      { id: 'J3', aktif: true, idTutor: 'LAIN', idRombel: 'B7', kodeMapel: 'INF', hari: 'Selasa', mulai: '13:00', selesai: '14:00', dari: '', sampai: '', minggu: '', unit: '' }];
    g.jadBacaPm_ = () => ({ data: pm.map((x) => Object.assign({}, x)) });
    g.jadLengkapi_ = (l) => { l.forEach((x) => { x.namaRombel = x.idRombel; x.namaMapel = x.kodeMapel; x.teksLokasi = x.id === 'J1' ? 'Ruang 1 (Sampiran)' : ''; }); return l; };
    g.agLiburPm_ = (x, t) => (x.id === 'J2' && t === '2026-11-19' ? { nama: 'Hari Guru' } : null);
    g.waStafJadwalHari = () => ({ jadwal: [{ id: 'J1', hadir: true }] });
    const k = g.brdKartuJadwalTutor_('T', { id: 'TW' });
    sama(k.judul, 'Jadwal mengajar minggu ini');
    sama(k.item.map((o) => [o.n, o.w]), [['Sudah diabsen', 'hijau'], ['Ditiadakan', '']]);
    sama([k.item[0].s, /Ditiadakan: Hari Guru/.test(k.item[1].s), k.ringkas], ['B7 · Ruang 1 (Sampiran)', true, '1 pertemuan · 1 ditiadakan']);
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

// 58. tutor bawaan jadwal mengacu tab Pengampu (v1.79.3)
tes('jadwal: tutor bawaan dari Pengampu (unit jadwal -> semua unit -> tutor online mana pun -> Enroll Mapel)', () => {
  const sv = ['pgoTutorUnit_', 'pgoSemuaTutor_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    const peta = { 'B7|INF': { semua: '', unit: { USMP: 'EKA', ULSR: 'PATIMAH' } }, 'C12|MTK': { semua: 'IKMAN', unit: {} } };
    g.pgoTutorUnit_ = (key, u) => { const o = peta[key]; return o ? ((u && o.unit[u]) || o.semua || '') : ''; };
    g.pgoSemuaTutor_ = (key) => { const o = peta[key]; return o ? [o.semua, ...Object.values(o.unit)].filter(Boolean) : []; };
    const k = (r, m, t) => ({ idRombel: r, kodeMapel: m, idTutor: t || '' });
    sama([g.jadTutorBawaan_(k('B7', 'INF', 'PATIMAH'), 'USMP'), g.jadTutorBawaan_(k('B7', 'INF', 'PATIMAH'), ''), g.jadTutorBawaan_(k('C12', 'MTK'), 'USMP'),
      g.jadTutorBawaan_(k('A1', 'PAI', 'LAMA'), '')], ['EKA', 'EKA', 'IKMAN', 'LAMA']);
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

const galat = (f, re) => { let m = ''; try { f(); } catch (e) { m = String(e.message); } if (!re.test(m)) throw new Error('galat diharapkan ' + re + ', didapat "' + m + '"'); };
// 59. Lihat sebagai (v1.81.0): hanya fungsi baca, token lihat tidak sah tanpa kunci
tes('lihat sebagai: hanya fungsi baca; token lihat ditolak tanpa kunci mode lihat; catat_ diam', () => {
  const b = (j, f) => g.intipBoleh_(j, f);
  sama(['waStafProfil', 'waStafBeranda', 'waStafNilaiKelas', 'waStafJadwalHari', 'waStafSesiDiskusi', 'waStafKartu'].map((f) => b('tutor', f)), [true, true, true, true, true, true]);
  sama(['waStafDiskusiSimpanNilai', 'waStafAbsenSimpan', 'waStafPemetaanSimpan', 'waStafMediaAjarTerbitSemua', 'waAdminKerangkaSetujuiSemua', 'waAdminResetData',
    'waNotifDaftar', 'waStafKeluar', 'waStafHtmlPdf', 'waSubmitJawaban', 'waAdminIntipMulai'].map((f) => b('tutor', f)), Array(11).fill(false));
  sama(['waSiswaBeranda', 'waGetMateri', 'waProfilSiswa', 'waStatusUjian'].map((f) => b('siswa', f)), [true, true, true, true]);
  sama(['waSubmitJawaban', 'waMulaiUjian', 'waTandaiBaca', 'waAbsenIsi', 'waRuangKirim', 'waProfilSiswaSimpan', 'waSiswaKelayakanAju', 'waNotifDaftar', 'waSiswaPinBuat',
    'waPulihSesiSiswa', 'waStafProfil', 'waSiswaKwitansi'].map((f) => b('siswa', f)), Array(12).fill(false));
  const c = g.CacheService.getScriptCache();
  c.put('intip_K1', JSON.stringify({ jenis: 'tutor', nama: 'Eka', sesi: 'S1' }));
  galat(() => g.intipJaga_('waStafProfil', 'TIDAKADA'), /MODE_LIHAT_HABIS/);
  galat(() => g.intipJaga_('waStafDiskusiSimpanNilai', 'K1'), /hanya baca/);
  g.__INTIP = false;
  sama(g.intipJaga_('waStafProfil', 'K1').nama, 'Eka');
  sama(g.intipAktif_(), true);
  sama(g.catat_('Admin', '', 'x', 'y', '', 'OK'), undefined);   // tidak menyentuh SpreadsheetApp
  g.__INTIP = false;
  c.put('intipstaf_S1', '1');
  galat(() => g.intipTolakTanpaKunci_('intipstaf_', 'S1'), /SESI_HABIS/);
  g.intipTolakTanpaKunci_('intipstaf_', 'TOKEN_BIASA');
  g.__INTIP = { jenis: 'tutor' };
  g.intipTolakTanpaKunci_('intipstaf_', 'S1');
  g.__INTIP = false;
});

// 60. templat slot masa ujian + pengawas (v1.82.0, v1.82.1)
tes('templat slot masa ujian: tanggal/jam Excel, rombel paket A/B/C, mode, pengawas & ruang, galat per baris', () => {
  const m = { dari: '2026-12-01', sampai: '2026-12-10' };
  const mapel = [
    { kode: 'MTK', nama: 'Matematika', rombelId: [{ id: 'R10', nama: 'C10', paket: 'C' }, { id: 'R11', nama: 'C11', paket: 'C' }, { id: 'R7', nama: 'B7', paket: 'B' }] },
    { kode: 'BIN', nama: 'Bahasa Indonesia', rombelId: [{ id: 'R10', nama: 'C10', paket: 'C' }] }];
  const staf = [{ id: 'U1', nama: 'Eka', label: 'Eka' }, { id: 'U2', nama: 'Rudi', label: 'Rudi [U2]' }, { id: 'U3', nama: 'Rudi', label: 'Rudi [U3]' }];
  const B = [['TEMPLAT'], [], ['NO', 'TANGGAL', 'JAM MULAI', 'DURASI (MENIT)', 'MAPEL', 'ROMBEL', 'JUMLAH SOAL', 'MODE', 'PENGAWAS', 'RUANG'],
    ['1', '2026-12-01', '07:30', '90', 'MTK - Matematika', 'Semua rombel paket C', '40', 'Offline', 'Eka', 'Ruang 1'],
    ['2', '46358', '0.3958333333', '', 'Bahasa Indonesia', 'Semua rombel', '', '', 'Rudi [U3]', ''],
    ['3', '2026-12-02', '7.30', '60', 'MTK', 'Semua rombel paket B', '', 'Ikut masa', '', ''],
    ['4', '2026-12-03', '08:00', '60', 'MTK', 'C11', '', '', '', ''],
    ['5', '2026-12-20', '', '5', 'IPA', 'C99', '2', 'Daring', 'Budi', ''],
    ['6', '2026-12-04', '08:00', '60', 'BIN', 'Semua rombel paket A', '', '', 'Rudi', ''],
    ['7', '', '', '', '', '', '', '', '', '']];
  const r = g.msiRencana_(B, m, mapel, staf);
  sama(r.slot.map((s) => [s.baris, s.tanggal, s.jam, s.durasi, s.kode, s.rombel, s.teksRombel, s.jumlah, s.mode, s.idPengawas, s.ruang]), [
    [4, '2026-12-01', '07:30', 90, 'MTK', ['R10', 'R11'], 'Semua rombel paket C', 40, 'Offline', 'U1', 'Ruang 1'],
    [5, '2026-12-02', '09:30', 90, 'BIN', [], 'Semua rombel', g.UJ.JUMLAH_BAWAAN, '', 'U3', ''],
    [6, '2026-12-02', '07:30', 60, 'MTK', ['R7'], 'Semua rombel paket B', g.UJ.JUMLAH_BAWAAN, '', '', '']]);
  sama(r.galat.map((x) => x.baris), [7, 8, 9]);
  sama(/sudah dijadwalkan di baris 4/.test(r.galat[0].pesan), true);
  sama(['di luar masa', 'jam mulai', 'durasi', 'jumlah soal', 'mapel "IPA"', 'mode "Daring"', 'pengawas "Budi"'].every((k) => r.galat[1].pesan.indexOf(k) >= 0), true);
  sama(['paket A', 'ganda'].every((k) => r.galat[2].pesan.indexOf(k) >= 0), true);
  sama([r.kosong, r.adaPengawas], [1, true]);
});

// 61. masa ujian per unit (v1.83.0)
tes('masa per unit: jadwal khusus unit per siswa, gerbang unit, rencana batal (hapus / pindah / sudah mulai)', () => {
  const sv = ['munSemua_', 'munUnitSiswa_', 'muCari_', 'ksWb_', 'ubUnitEf_', 'ubPetaSiswa_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    const W = [{ id: 'JU1', idUjian: 'U1', masa: 'MB', slot: 'SB1', unit: ['LSR', 'KJ'], tanggal: '2026-12-15', jam: '08:00', durasi: 60, mode: 'Kertas', baris: 2 }];
    const unit = { Ana: 'SMP', Budi: 'LSR', Cici: 'KJ' };
    g.munSemua_ = () => W;
    g.munUnitSiswa_ = (r, n) => unit[n] || '';
    const j = { idUjian: 'U1', idMapel: 'M1', tanggal: '2026-12-10', jam: '07:30', durasi: 90, mode: 'APK', masa: 'MA', slot: 'SA1', mulaiMs: 1 };
    const a = g.ujJadwalSiswa_(j, 'R', 'Ana'), b = g.ujJadwalSiswa_(j, 'R', 'Budi');
    sama([a.tanggal, a.masa, a.slot, a.mode], ['2026-12-10', 'MA', 'SA1', 'APK']);
    sama([b.tanggal, b.jam, b.durasi, b.masa, b.slot, b.mode, b.jadwalUnit], ['2026-12-15', '08:00', 60, 'MB', 'SB1', 'Kertas', 'JU1']);
    sama(b.akhirMs - b.mulaiMs, 60 * 60000);
    sama(j.tanggal, '2026-12-10');   // jadwal dasar tidak berubah
    // gerbang peserta unit
    const masa = { MA: { id: 'MA', nama: 'UAS Sampiran', peserta: { mode: 'unit', unit: ['SMP'], siswa: [] } }, MB: { id: 'MB', nama: 'UAS Losari', peserta: { mode: 'unit', unit: ['LSR', 'KJ'], siswa: [] } } };
    g.muCari_ = (id) => masa[id];
    g.ksWb_ = (s) => ({ id: s.nama });
    g.ubPetaSiswa_ = () => ({});
    g.ubUnitEf_ = (id) => unit[id];
    sama([g.muGerbang_(a, 'R', 'Ana'), g.muGerbang_(b, 'R', 'Budi'), g.muGerbang_(b, 'R', 'Cici')], ['', '', '']);
    sama(/tidak terdaftar sebagai peserta UAS Sampiran/.test(g.muGerbang_(j, 'R', 'Budi')), true);
    // rencana batal masa A (dasar): dipindah ke jadwal unit B; Budi (unit B) sudah mulai -> tetap boleh batal
    const jadA = [{ idUjian: 'U1', baris: 5 }, { idUjian: 'U2', baris: 6 }];
    let rc = g.munRencanaBatal_(masa.MA, jadA, W, [{ idUjian: 'U1', idRombel: 'R', nama: 'Budi' }], g.munUnitSiswa_);
    sama([rc.mulai, rc.pindah.map((x) => [x.j.idUjian, x.w.id]), rc.hapusJadwal.map((x) => x.idUjian), rc.hapusWin.length], [false, [['U1', 'JU1']], ['U2'], 0]);
    rc = g.munRencanaBatal_(masa.MA, jadA, W, [{ idUjian: 'U1', idRombel: 'R', nama: 'Ana' }], g.munUnitSiswa_);
    sama(rc.mulai, true);
    // batal masa B (jadwal unit saja)
    rc = g.munRencanaBatal_(masa.MB, [], W, [{ idUjian: 'U1', idRombel: 'R', nama: 'Ana' }], g.munUnitSiswa_);
    sama([rc.mulai, rc.hapusWin.map((w) => w.id), rc.pindah.length], [false, ['JU1'], 0]);
    rc = g.munRencanaBatal_(masa.MB, [], W, [{ idUjian: 'U1', idRombel: 'R', nama: 'Cici' }], g.munUnitSiswa_);
    sama(rc.mulai, true);
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

// 62. peringatan slot terlalu rapat (v1.83.2)
tes('slot terlalu rapat: per rombel & tanggal, rombel kosong = semua rombel mapel, jeda = durasi + batas masuk', () => {
  const pk = { MTK: ['R10', 'R11'], IPA: ['R10'], BIN: ['R11'] }, nm = { R10: 'C10', R11: 'C11' };
  const sl = [
    { tanggal: '2026-12-10', jam: '15:00', durasi: 30, kode: 'MTK', namaMapel: 'Matematika', rombel: [] },
    { tanggal: '2026-12-10', jam: '15:30', durasi: 30, kode: 'IPA', namaMapel: 'IPA', rombel: [] },
    { tanggal: '2026-12-10', jam: '15:45', durasi: 30, kode: 'BIN', namaMapel: 'B. Indonesia', rombel: [] },
    { tanggal: '2026-12-11', jam: '07:30', durasi: 60, kode: 'IPA', namaMapel: 'IPA', rombel: [] }];
  const r = g.muSlotRapat_(sl, pk, nm);
  sama(r.map((x) => x.rombel), ['C10']);
  sama(/paling cepat 15:45/.test(r[0].pesan), true);
});

// 63. bank soal terkunci saat ujian mapelnya berlangsung (v1.83.3)
tes('bank soal terkunci: rentang ujian (dasar & jadwal unit), siswa masih mengerjakan; di luar itu bebas', () => {
  const sv = ['ujJadwalSemua_', 'munSemua_', 'getSheetData', 'sesiCols_'];
  const simpan = {};
  sv.forEach((k) => { simpan[k] = g[k]; });
  try {
    const m0 = g.ujMs_('2026-12-10', '15:00');   // zona waktu sama dengan ujMsTeks_ (lokal / CI UTC)
    const J = { idMapel: 'M1', idUjian: 'U1', jenis: 'UAS', smt: 1, tanggal: '2026-12-10', jam: '15:00', durasi: 30, mulaiMs: m0, masukSampaiMs: m0 + 15 * 60000 };
    g.ujJadwalSemua_ = () => [J];
    g.munSemua_ = () => [{ id: 'JU1', idUjian: 'U1', masa: 'MB', slot: 'S', unit: ['LSR'], tanggal: '2026-12-12', jam: '08:00', durasi: 60, mode: 'APK' }];
    let sesi = [['h']];
    g.getSheetData = () => sesi;
    g.sesiCols_ = () => ({ idUjian: 1, status: 2, waktuMulai: 3 });
    const mnt = (n) => m0 + n * 60000;
    sama(g.kurUjianBerjalan_('M1', mnt(-10)), null);
    sama(!!g.kurUjianBerjalan_('M1', mnt(5)), true);
    sama(!!g.kurUjianBerjalan_('M1', mnt(47)), true);    // batas masuk 15 + 30 + 3
    sama(g.kurUjianBerjalan_('M1', mnt(49)), null);
    const w0 = g.ujMs_('2026-12-12', '08:00');
    sama(!!g.kurUjianBerjalan_('M1', w0 + 30 * 60000), true);   // jadwal khusus unit
    sama(g.kurUjianBerjalan_('M2', mnt(5)), null);               // mapel lain bebas
    sesi = [['h'], ['U1', 'Berlangsung', '2026-12-10 15:40:00']];
    sama(/sedang mengerjakan/.test(g.kurUjianBerjalan_('M1', mnt(100)).alasan), true);   // tambahan waktu
    sama(g.kurUjianBerjalan_('M1', mnt(200)), null);             // sesi basi tidak mengunci selamanya
    let pesan = '';
    try { g.ujJadwalSemua_ = () => [J]; g.kurJagaUjian_('M1'); } catch (e) { pesan = e.message; }
    sama(pesan, '');   // sekarang (2026) jauh dari 10 Des -> bebas
  } finally { sv.forEach((k) => { g[k] = simpan[k]; }); }
});

// 64. kunci AI Plus khusus Admin (v1.84.0)
tes('kunci AI: Plus hanya untuk peran Admin murni; peran lain, peran kustom, mode lihat, tanpa pengguna -> Free', () => {
  const pr = g.PropertiesService.getScriptProperties();
  const simpan = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_API_KEY_PLUS', 'GEMINI_MODEL_PLUS'].map((k) => [k, pr.getProperty(k)]);
  try {
    pr.setProperty('GEMINI_API_KEY', 'KUNCI_FREE_xxxxxxxxxxxxxxxx'); pr.setProperty('GEMINI_MODEL', 'gemini-free');
    pr.setProperty('GEMINI_API_KEY_PLUS', 'KUNCI_PLUS_xxxxxxxxxxxxxxxx'); pr.setProperty('GEMINI_MODEL_PLUS', 'gemini-pro');
    const cek = (p, ekstra) => { g.__STAF_P = p; g.__INTIP = false; g.__DINAS = false; g.__AI_PAKSA = ''; Object.assign(g, ekstra || {}); return [g.aiKunci_().slice(0, 10), g.aiModel_()]; };
    const PLUS = ['KUNCI_PLUS', 'gemini-pro'], FREE = ['KUNCI_FREE', 'gemini-free'];
    sama(cek({ peran: 'Admin' }), PLUS);
    sama(cek({ peran: 'Tutor' }), FREE);
    sama(cek({ peran: 'Kepala Sekolah' }), FREE);
    sama(cek({ peran: 'Admin', peranKustom: 'Operator' }), FREE);
    sama(cek({ peran: 'Admin', proksi: 'keuangan', peranDasarAsli: 'Bendahara' }), FREE);
    sama(cek({ peran: 'Admin' }, { __INTIP: { jenis: 'tutor' } }), FREE);
    sama(cek(null), FREE);                                   // pemicu terjadwal / tanpa pengguna
    sama(cek({ peran: 'Admin' }, { __AI_PAKSA: 'free' }), FREE);
    pr.deleteProperty('GEMINI_API_KEY_PLUS');
    sama(cek({ peran: 'Admin' }), FREE);                     // Plus kosong -> Admin memakai Free
  } finally {
    simpan.forEach(([k, v]) => { if (v === null) pr.deleteProperty(k); else pr.setProperty(k, v); });
    g.__STAF_P = null; g.__INTIP = false; g.__AI_PAKSA = '';
  }
});

// 65. daftar model Gemini untuk dipilih (v1.84.1)
tes('daftar model Gemini: hanya model gemini generateContent, tanpa embedding/gambar/audio, versi stabil di atas', () => {
  const r = g.aiDaftarModel_({ models: [
    { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'], inputTokenLimit: 1048576, outputTokenLimit: 65536 },
    { name: 'models/gemini-3.5-pro-preview', displayName: 'Gemini 3.5 Pro Preview', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/gemini-2.5-flash-image-generation', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemma-3-27b-it', supportedGenerationMethods: ['generateContent'] }] });
  sama(r.map((x) => x.kode), ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-pro-preview']);
  sama([r[1].nama, r[1].masuk, r[1].keluar], ['Gemini 2.5 Flash', 1048576, 65536]);
});

// 66. kisi-kisi: perkiraan sebaran soal per sesi (v1.85.0)
tes('kisi-kisi: soal dibagi bergiliran per tingkat seperti undian; kekurangan tingkat diisi tingkat lain', () => {
  const r = g.kkSebar_([{ mudah: 3, sedang: 4, sulit: 3 }, { mudah: 3, sedang: 4, sulit: 3 }, { mudah: 3, sedang: 4, sulit: 0 }], { mudah: 6, sedang: 9, sulit: 5 });
  sama(r, [{ mudah: 2, sedang: 3, sulit: 3 }, { mudah: 2, sedang: 3, sulit: 2 }, { mudah: 2, sedang: 3, sulit: 0 }]);
  const k = g.kkSebar_([{ mudah: 1, sedang: 1, sulit: 0 }], { mudah: 2, sedang: 1, sulit: 1 });   // bank kurang
  sama(k, [{ mudah: 1, sedang: 1, sulit: 0 }]);
  sama(g.kkSebar_([], { mudah: 5 }), []);
});

tes('bank soal: soal yang membahas fisik buku (halaman, bab, aktivitas, judul, gambar di buku) dibuang; soal isi materi tetap', () => {
  const o = { A: 'satu', B: 'dua', C: 'tiga', D: 'empat', E: 'lima' };
  const buang = ['Apa yang dibahas pada halaman 22-26?', 'Topik di hal. 27 adalah', 'What is on page 30?', 'Menurut buku siswa, panjat pinang adalah',
    'Bab 2 berjudul', 'Pada Activity 3 siswa diminta', 'Unit 1 membahas', 'Judul buku tersebut adalah', 'Gambar pada buku menunjukkan', 'Siapa penerbit buku ini?', 'Bagaimana merancang program dialog di lingkungan PKBM?', 'Apa tantangan bagi warga belajar dewasa?'];
  const tetap = ['Panjat pinang biasanya diadakan saat', 'Read the text. Based on the text, why did Beni win?', 'Berdasarkan teks tersebut, siapa juaranya?',
    'Sinta membaca dalam buku cerita tentang', 'Kalimat "I won the race" menggunakan tense'];
  for (const q of buang) sama([q, g.kurBersihSoal_([{ pertanyaan: q, opsi: o, kunci: 'A' }]).length], [q, 0]);
  for (const q of tetap) sama([q, g.kurBersihSoal_([{ pertanyaan: q, opsi: o, kunci: 'A' }]).length], [q, 1]);
  sama(g.kurBersihSoal_([{ pertanyaan: 'Isi materi?', opsi: { A: 'Halaman 22', B: 'b', C: 'c', D: 'd', E: 'e' }, kunci: 'B' }]).length, 0);   // opsi juga diperiksa
});

tes('impor JSON: kunci yang kehilangan kutip pembuka (opsi": {) diperbaiki otomatis, teks di dalam string tidak berubah', () => {
  const soal = (kunciOpsi) => '{\n  "tingkat": "mudah",\n  "pertanyaan": "Apa arti amanah, \\"terpercaya\\": benar?",\n  ' + kunciOpsi + ': {\n    "A": "Terpercaya, jujur",\n    "B": "Berani",\n    "C": "Dermawan",\n    "D": "Sabar",\n    "E": "Rendah hati"\n  },\n  "kunci": "A"\n}';
  const teks = '{\n  "hasil": [\n    {\n      "id": "1-12",\n      "isi_materi_lengkap": "Paragraf satu, kata: dua.\\n\\nParagraf dua",\n      "soal": [\n' +
    soal('"opsi"') + ',\n' + soal('opsi"') + ',\n' + soal('opsi"') + '\n      ]\n    }\n  ]\n}';
  const r = g.kurParseLonggar_(teks);
  sama(r && r.terpotong, false);
  const s = r.obj.hasil[0].soal;
  sama(s.length, 3);
  sama(s.map(x => x.opsi.A), ['Terpercaya, jujur', 'Terpercaya, jujur', 'Terpercaya, jujur']);
  sama(s[1].pertanyaan, 'Apa arti amanah, "terpercaya": benar?');
  sama(r.obj.hasil[0].isi_materi_lengkap, 'Paragraf satu, kata: dua.\n\nParagraf dua');
  // jalur API juga
  sama(g.aiParseJson_('{"a": 1, b": {"c": 2}}'), { a: 1, b: { c: 2 } });
  // v1.87.3: kunci tanpa kutip sama sekali di awal baris (variabel: "..."); teks "x,\nkata: y" di dalam string tidak disentuh
  const t2 = '{\n  "hasil": [\n    {\n      "id": "1-1",\n      "soal": [\n        {\n          "pertanyaan": "Apa itu, sebut: koefisien?",\n' +
    '          variabel: "Variabel mewakili harga",\n          "opsi": {\n            "A": "Satu",\n            "B": "Dua"\n          },\n          "kunci": "A"\n        }\n      ]\n    }\n  ]\n}';
  const r2 = g.kurParseLonggar_(t2);
  sama(r2.obj.hasil[0].soal[0].variabel, 'Variabel mewakili harga');
  sama(r2.obj.hasil[0].soal[0].pertanyaan, 'Apa itu, sebut: koefisien?');
  sama(g.kurKutipKunci_('{"a": "baris satu,\\nkata: dua"}'), '{"a": "baris satu,\\nkata: dua"}');
});

tes('masa: slot online di minggu materi menutup sesi itu untuk kelas peserta; bukan untuk slot tulis, sesi yang sudah mulai, atau rombel campuran unit', () => {
  const cfg = { mulai: '2026-07-27', sesiPerSemester: 18, uts: 9, uas: 18, jumlahSemester: 2, jamTayang: '00:01', jamBatas: '23:59' };
  const tgl = (n) => g.ujtTambahHari_(g.taInfo_(cfg, 1, n, 0).mulaiIso, 2);   // tengah minggu: aman dari zona waktu CI (UTC)
  const awal = g.taInfo_(cfg, 1, 1, 0).mulaiMs - 86400000;
  const kelas = [{ kode: 'MTK', idRombelSim: 'R1', idMapel: 'M1' }, { kode: 'MTK', idRombelSim: 'R2', idMapel: 'M2' }, { kode: 'IPA', idRombelSim: 'R1', idMapel: 'M3' }];
  const slot = [
    { tanggal: tgl(17), kode: 'MTK', rombel: [], mode: '' },          // online, minggu materi
    { tanggal: tgl(18), kode: 'IPA', rombel: [], mode: '' },          // minggu UAS: tidak menutup sesi
    { tanggal: tgl(16), kode: 'IPA', rombel: [], mode: 'Offline' }    // tulis: tidak menutup sesi
  ];
  const asli = { muPilihWb_: g.muPilihWb_, keuWbSemua_: g.keuWbSemua_ };
  try {
    g.muPilihWb_ = () => null;
    const r = g.mgSesiRencana_({ jenis: 'UAS', smt: 1, mode: 'Online', peserta: { mode: 'semua' } }, slot, kelas, cfg, awal);
    sama(r.target.map(t => [t.idMapel, t.smt, t.n]), [['M1', 1, 17], ['M2', 1, 17]]);
    // sudah dimulai
    const r2 = g.mgSesiRencana_({ jenis: 'UAS', smt: 1, mode: 'Online', peserta: { mode: 'semua' } }, slot, kelas, cfg, g.taInfo_(cfg, 1, 17, 0).mulaiMs + 1000);
    sama([r2.target.length, r2.info.length], [0, 1]);
    // peserta unit: R1 berisi siswa unit lain -> tidak ditutup
    g.muPilihWb_ = () => ({ W1: true, W3: true });
    g.keuWbSemua_ = () => [{ id: 'W1', idRombel: 'R1', aktif: true }, { id: 'W2', idRombel: 'R1', aktif: true }, { id: 'W3', idRombel: 'R2', aktif: true }];
    const r3 = g.mgSesiRencana_({ jenis: 'UAS', smt: 1, mode: 'Online', peserta: { mode: 'unit', unit: ['U-S'] } }, slot, kelas, cfg, awal);
    sama(r3.target.map(t => t.idMapel), ['M2']);
    sama(r3.info.length, 1);
    sama(g.mgSesiRencana_({ jenis: 'UAS', smt: 1, peserta: { mode: 'siswa' } }, slot, kelas, cfg, awal).target, []);
  } finally { Object.assign(g, asli); }
});

tes('masa: kehadiran sesi yang ditutup dihitung dari hasil ujian masa; absensi sesi itu disembunyikan', () => {
  const asli = { mgSesiTutup_: g.mgSesiTutup_, ujJadwalSemua_: g.ujJadwalSemua_, munSemua_: g.munSemua_, ujBaca_: g.ujBaca_, taBaca_: g.taBaca_ };
  try {
    g.mgSesiTutup_ = () => ({ 'M1|1|17': 'MU-1', 'M9|2|5': 'MU-1' });
    g.ujJadwalSemua_ = () => [{ idUjian: 'U1', idMapel: 'M1', masa: 'MU-1' }, { idUjian: 'U2', idMapel: 'M2', masa: 'MU-1' }];
    g.munSemua_ = () => [];
    g.ujBaca_ = () => [{ 'ID Ujian': 'U1', 'Nama Siswa': 'Ani  Rahma' }, { 'ID Ujian': 'U1', 'Nama Siswa': 'ani rahma' }, { 'ID Ujian': 'U2', 'Nama Siswa': 'Budi' }];
    const h = g.mgHadirUjian_(1);
    sama(h.length, 1);
    sama([h[0].idMapel, h[0].smt, h[0].n], ['M1', 1, 17]);
    sama(g.mgHadirUjian_(2), []);   // tidak ada hasil ujian M9
    // item absensi sesi 17 tidak disisipkan untuk M1
    g.taBaca_ = () => ({ mulai: '2026-07-27', sesiPerSemester: 18, uts: 9, uas: 18, jumlahSemester: 2, jamTayang: '00:01', jamBatas: '23:59' });
    const ids = g.abSisipItem_('M1', []).map(x => x.id);
    sama(ids.indexOf(g.abIdItem_(1, 17)), -1);
    sama(ids.indexOf(g.abIdItem_(1, 16)) >= 0, true);
  } finally { Object.assign(g, asli); }
});

tes('TTM: ditiadakan pada hari slot masa untuk rombel/unit peserta', () => {
  g.MG_LIBUR_ = [
    { id: 'MU-A', nama: 'UAS Sampiran', slot: [{ tanggal: '2026-12-01', rombel: [] }], rombel: { R1: true }, unit: ['U-S'] },
    { id: 'MU-B', nama: 'UAS Semua', slot: [{ tanggal: '2026-12-10', rombel: ['R9'] }], rombel: null, unit: null }
  ];
  sama(g.mgLiburPm_({ idRombel: 'R1', unit: '' }, '2026-12-01').masa, 'MU-A');
  sama(g.mgLiburPm_({ idRombel: 'R1', unit: 'U-L' }, '2026-12-01'), null);   // pemetaan khusus unit lain
  sama(g.mgLiburPm_({ idRombel: 'R2', unit: '' }, '2026-12-01'), null);      // bukan peserta
  sama(g.mgLiburPm_({ idRombel: 'R1', unit: '' }, '2026-12-02'), null);      // bukan hari ujian
  sama(g.mgLiburPm_({ idRombel: 'R9', unit: '' }, '2026-12-10').masa, 'MU-B');
  sama(g.mgLiburPm_({ idRombel: 'R5', unit: '' }, '2026-12-10'), null);      // slot khusus rombel R9
  g.MG_LIBUR_ = null;
});

tes('ujian kalender akademik: diganti masa (tidak dihapus), dipulihkan saat masa dibatalkan; yang sedang berlangsung tidak diganti', () => {
  const now = 1000000;
  sama(g.mgBolehGanti_({ masa: '', mulaiMs: now + 60000, akhirMs: now + 3600000 }, now), true);
  sama(g.mgBolehGanti_({ masa: '', mulaiMs: now - 60000, akhirMs: now + 3600000 }, now), false);
  sama(g.mgBolehGanti_({ masa: 'MU-9', mulaiMs: now + 60000, akhirMs: now + 3600000 }, now), false);
  const ubah = [], item = [];
  const asli = { ujUbah_: g.ujUbah_, mgStatusItem_: g.mgStatusItem_, ujJadwalSemua_: g.ujJadwalSemua_, ujNow_: g.ujNow_ };
  g.ujUbah_ = (t, b, o) => ubah.push([b, o.Kunci, o.Jenis]);
  g.mgStatusItem_ = (id, st) => item.push([id, st]);
  g.ujNow_ = () => 'kini';
  try {
    g.mgGantiLama_({ id: 'MU-1', nama: 'UAS' }, { baris: 5, kunci: 'M1|1|UAS', jenis: 'UAS', idUjian: 'U-1', catatan: '' });
    sama(ubah[0], [5, 'M1|1|UAS|diganti|MU-1', 'UAS-DIGANTI']);
    sama(item[0], ['U-1', 'Nonaktif']);
    g.ujJadwalSemua_ = () => [
      { baris: 5, kunci: 'M1|1|UAS|diganti|MU-1', jenis: 'UAS-DIGANTI', idUjian: 'U-1' },
      { baris: 6, kunci: 'M2|1|UAS|diganti|MU-1', jenis: 'UAS-DIGANTI', idUjian: 'U-2' },
      { baris: 7, kunci: 'M2|1|UAS', jenis: 'UAS', idUjian: 'U-3', masa: 'MU-7' }   // kunci M2 sudah dipakai masa lain
    ];
    sama(g.mgPulihkanLama_('MU-1'), 1);
    sama(ubah[1], [5, 'M1|1|UAS', 'UAS']);
    sama(item[1], ['U-1', 'Aktif']);
  } finally { Object.assign(g, asli); }
});

tes('masa: tempat pelaksanaan full online / di unit tampil di keterangan TTM yang diganti ujian', () => {
  const asli = g.ubPetaUnit_;
  g.ubPetaUnit_ = () => ({ 'U-S': { nama: 'Sampiran' }, 'U-L': { nama: 'Unit Losari' } });
  try {
    sama(g.muTeksTempat_({ mode: 'Online', tempat: 'Full online', unitTempat: [] }, true), 'full online');
    sama(g.muTeksTempat_({ mode: 'Online', tempat: 'Di unit', unitTempat: ['U-S', 'U-L'] }, true), 'online di Unit Sampiran / Unit Losari');
    sama(g.muTeksTempat_({ mode: 'Online', tempat: 'Di unit', unitTempat: [] }, true), 'online di unit belajar masing-masing');
    sama(g.muTeksTempat_({ mode: 'Offline', tempat: '', unitTempat: ['U-S'] }, true), 'tulis di Unit Sampiran');
    sama(g.muTeksTempat_({ mode: 'Online', tempat: '', unitTempat: [] }, true), '');   // masa lama: belum ditentukan
    sama(g.muTeksTempat_({ mode: 'Online', tempat: 'Full online', unitTempat: [] }, true, 'Kertas'), 'tulis di unit belajar masing-masing');   // slot tulis
    g.MG_LIBUR_ = [{ id: 'MU-A', nama: 'UAS Sampiran', tempat: 'online di Unit Sampiran', slot: [{ tanggal: '2026-12-01', rombel: [] }], rombel: null, unit: null, minggu: null }];
    sama(g.mgLiburPm_({ idRombel: 'R1', unit: '' }, '2026-12-01').nama, 'diganti ujian UAS Sampiran (online di Unit Sampiran)');
  } finally { g.ubPetaUnit_ = asli; g.MG_LIBUR_ = null; }
});

// v1.88.1: kirim jawaban - Materi dibaca sekali, Jawaban dicari lewat kolom D..G, kiriman ganda ditunggu
function siapKirimJawaban() {
  const H = g.CONFIG.HEADERS.MATERI;
  const baris = (id, jenis, kunci) => H.map((h) => ({ 'ID Materi': id, 'ID Mapel': 'MP1', 'Jenis': jenis, 'Judul': 'J-' + id, 'Status': 'Aktif',
    'Kunci Jawaban (A/B/C/D/E)': kunci || '', 'Poin': 100, 'Sesi': '' }[h] ?? ''));
  const hit = { materi: 0, jawabanSemua: 0, utuh: 0 };
  const mv = [H.slice(), baris('M-D', 'Diskusi'), baris('M-U', 'Ujian', 'B')];
  mv[1][H.indexOf('Konten/Instruksi')] = 'isi diskusi';
  const materi = {
    getDataRange: () => { hit.materi++; hit.utuh++; return { getValues: () => mv.map((b) => b.slice()) }; },
    getLastRow: () => mv.length, getLastColumn: () => H.length,
    getRange: (r, c, nr, nc) => {
      if (r === 1 && c === 1 && nr === mv.length) hit.materi++;
      if (c <= H.indexOf('Konten/Instruksi') + 1 && c + (nc || 1) - 1 >= H.indexOf('Konten/Instruksi') + 1 && (nr || 1) > 1) hit.utuh++;
      return { getValues: () => mv.slice(r - 1, r - 1 + (nr || 1)).map((b) => b.slice(c - 1, c - 1 + (nc || 1))), getValue: () => mv[r - 1][c - 1] };
    },
  };
  const jv = [g.CONFIG.HEADERS.JAWABAN.slice(), ['R0', 'MP1', 'X', 'M-D', 'J', 'Diskusi', 'Lain', 'teks', '', new Date()]];
  const jawaban = {
    v: jv,
    getDataRange: () => { hit.jawabanSemua++; return { getValues: () => jv.map((b) => b.slice()) }; },
    getLastRow: () => jv.length,
    appendRow: (r) => jv.push(r.slice()),
    getRange: (r, c, nr, nc) => ({
      getValues: () => jv.slice(r - 1, r - 1 + nr).map((b) => b.slice(c - 1, c - 1 + nc)),
      getValue: () => jv[r - 1][c - 1],
      setValues: (xs) => { xs.forEach((x, i) => { jv[r - 1 + i] = x.slice(); }); },
    }),
  };
  g.getSheet = (n) => (n === g.CONFIG.SHEETS.MATERI ? materi : n === g.CONFIG.SHEETS.JAWABAN ? jawaban : { getDataRange: () => ({ getValues: () => [[]] }) });
  g.getSheetMentah_ = g.getSheet;
  g.getSheetData = (n) => g.getSheet(n).getDataRange().getValues();   // tes lain mengganti getSheetData tanpa memulihkan
  g.taGerbang_ = (idMapel, idMateri) => { g.getMateriById_(idMateri); return ''; };
  g.ndAlasanTolak_ = () => '';
  g.getNamaMapel_ = () => 'Mapel 1';
  g.cekKodeAksesSiswa_ = () => true;
  g.draftHapus_ = () => {}; g.catat_ = () => {}; g.nvTulis_ = () => {}; g.mapelAktifSemua_ = () => [];
  return { hit, jv };
}
tes('waSubmitJawaban: Materi dibaca sekali, Jawaban tidak dibaca utuh, kirim ulang menimpa baris yang sama', () => {
  const asli = ['getSheet', 'getSheetMentah_', 'getSheetData', 'taGerbang_', 'ndAlasanTolak_', 'getNamaMapel_', 'cekKodeAksesSiswa_', 'draftHapus_', 'catat_', 'nvTulis_', 'mapelAktifSemua_']
    .reduce((o, k) => { o[k] = g[k]; return o; }, {});
  try {
    const { hit, jv } = siapKirimJawaban();
    const p = { idRombel: 'R1', idMapel: 'MP1', idMateri: 'M-D', nama: 'Ani', jawaban: 'tanggapan pertama' };
    const a = g.waSubmitJawaban(p);
    sama([a.sukses, a.pesan, jv.length, hit.materi, hit.jawabanSemua], [true, 'Jawaban terkirim.', 3, 1, 0], 'kirim pertama');
    sama(g.MATERI_MEMO_, null, 'memo dilepas');
    sama(hit.utuh, 0, 'kolom Konten tidak pernah dibaca utuh');
    sama(g.getMateriById_('M-D').row[g.materiCols_().konten - 1], 'isi diskusi', 'Konten baris yang dicari tetap terisi');
    const waktu1 = jv[2][9];
    const b = g.waSubmitJawaban(Object.assign({}, p, { jawaban: 'tanggapan diperbaiki' }));
    sama([b.sukses, b.pesan, jv.length, jv[2][7], jv[2][9] === waktu1, jv[1][6]], [true, 'Jawaban diperbarui.', 3, 'tanggapan diperbaiki', true, 'Lain'], 'kirim ulang');
    sama([hit.materi, hit.jawabanSemua], [3, 0], 'tetap sekali per kiriman (1 tambahan dari pemeriksaan Konten di atas)');
    const c = g.waSubmitJawaban({ idRombel: 'R1', idMapel: 'MP1', idMateri: 'M-U', nama: 'Ani', jawaban: 'b', kodeAkses: 'X' });
    sama([c.sukses, c.nilai, jv.length, jv[3][7]], [true, 100, 4, 'B'], 'ujian pilihan ganda');
    sama(g.getMateriById_('M-D') !== null && hit.materi === 5, true, 'di luar kiriman tanpa memo');
  } finally { Object.assign(g, asli); g.MATERI_MEMO_ = null; }
});
tes('waSubmitJawaban: kiriman ganda siswa yang sama menunggu kiriman pertama, lalu menimpa (tidak dobel)', () => {
  const asli = ['getSheet', 'getSheetMentah_', 'getSheetData', 'taGerbang_', 'ndAlasanTolak_', 'getNamaMapel_', 'cekKodeAksesSiswa_', 'draftHapus_', 'catat_', 'nvTulis_', 'mapelAktifSemua_']
    .reduce((o, k) => { o[k] = g[k]; return o; }, {});
  const tidur = g.Utilities.sleep;
  try {
    const { jv } = siapKirimJawaban();
    const p = { idRombel: 'R1', idMapel: 'MP1', idMateri: 'M-D', nama: 'Budi', jawaban: 'satu' };
    g.waSubmitJawaban(p);
    const kk = 'sbm|M-D|Budi';
    cache.put(kk, '1');   // seolah kiriman pertama masih berjalan
    let tunggu = 0;
    g.Utilities.sleep = () => { tunggu++; if (tunggu === 2) cache.remove(kk); };
    const b = g.waSubmitJawaban(Object.assign({}, p, { jawaban: 'dua' }));
    sama([b.pesan, tunggu, jv.length, jv[2][7], cache.get(kk)], ['Jawaban diperbarui.', 2, 3, 'dua', null]);
  } finally { Object.assign(g, asli); g.Utilities.sleep = tidur; g.MATERI_MEMO_ = null; }
});

// v1.88.2: cache notifikasi lebih lama, tetapi isi cache disaring ulang dengan waktu sekarang
tes('bcAktif_: dari cache, broadcast yang sudah habis masa berlakunya tidak ikut', () => {
  const asli = g.bcBacaSemua_;
  try {
    const now = Date.now();
    let baca = 0;
    g.bcBacaSemua_ = () => { baca++; return [
      { id: 'A', status: 'Aktif', waktuMs: now - 1000, berlakuMs: now + 300, judul: 'a', sasaran: {} },
      { id: 'B', status: 'Aktif', waktuMs: now - 2000, berlakuMs: now + 86400000, judul: 'b', sasaran: {} },
    ]; };
    cache.remove(g.BC.CACHE);
    sama(g.bcAktif_().map((b) => b.id), ['A', 'B'], 'baca sheet');
    // A dibuat kedaluwarsa di dalam cache -> tidak boleh ikut walau sheet tidak dibaca ulang
    const isi = JSON.parse(cache.get(g.BC.CACHE)); isi[0].berlakuMs = now - 1; cache.put(g.BC.CACHE, JSON.stringify(isi));
    sama([g.bcAktif_().map((b) => b.id), baca], [['B'], 1], 'dari cache, tersaring');
    g.bcLupakan_();
    g.bcAktif_();
    sama(baca, 2, 'bcLupakan_ memaksa baca ulang');
  } finally { g.bcBacaSemua_ = asli; cache.remove(g.BC.CACHE); }
});
tes('npAktif_: dari cache, kejadian lebih lama dari HARI_TAMPIL tidak ikut', () => {
  const asli = g.npBaca_;
  try {
    const now = Date.now();
    let baca = 0;
    g.npBaca_ = () => { baca++; return [{ id: 'N1', ms: now - 1000 }, { id: 'N2', ms: now - 2000 }]; };
    cache.remove(g.NP.CACHE);
    sama(g.npAktif_().map((e) => e.id), ['N1', 'N2']);
    const isi = JSON.parse(cache.get(g.NP.CACHE)); isi[1].ms = now - (g.NP.HARI_TAMPIL + 1) * 86400000; cache.put(g.NP.CACHE, JSON.stringify(isi));
    sama([g.npAktif_().map((e) => e.id), baca], [['N1'], 1]);
  } finally { g.npBaca_ = asli; cache.remove(g.NP.CACHE); }
});
tes('pinStatusCepat_: cache dipakai di hari yang sama, dihitung ulang saat ganti hari / cache lama', () => {
  const asli = { pinStatus_: g.pinStatus_, absHariIni_: g.absHariIni_ };
  try {
    let hitung = 0, hari = '2026-11-16';
    g.pinStatus_ = () => { hitung++; return { perlu: true, sisaHari: hitung }; };
    g.absHariIni_ = () => hari;
    const ck = g.PIN.CK_STATUS + g.pinCacheId_(g.normNama_('Ani') + '|R1');
    cache.put(ck, JSON.stringify({ perlu: false }));   // format lama (tanpa tanggal) -> diabaikan
    sama([g.pinStatusCepat_('Ani', 'R1').sisaHari, g.pinStatusCepat_('Ani', 'R1').sisaHari, hitung], [1, 1, 1], 'hari sama');
    hari = '2026-11-17';
    sama([g.pinStatusCepat_('Ani', 'R1').sisaHari, hitung], [2, 2], 'ganti hari');
    cache.remove(ck);
  } finally { Object.assign(g, asli); }
});

// v1.88.2: edit langsung di spreadsheet membuang cache terkait
tes('onEdit: edit langsung di tab Pengguna/Broadcast/Notif/PIN/Perangkat membuang cache terkait', () => {
  const asli = g.perfHapusCache_;
  try {
    const ev = (nama, baris, isi) => ({ range: {
      getRow: () => baris, getLastRow: () => baris + isi.length - 1,
      getSheet: () => ({ getName: () => nama, getRange: (r, c, n, m) => ({ getValues: () => isi.slice(0, n).map((x) => x.slice(c - 1, c - 1 + m)) }) }),
    } });
    let hapus = 0;
    g.perfHapusCache_ = () => { hapus++; };
    sama([g.edlBuangCache_(ev('Pengguna', 3, [['U1']])), hapus], ['pengguna', 1]);
    cache.put(g.BC.CACHE, '[]'); cache.put(g.NP.CACHE, '[]');
    sama([g.edlBuangCache_(ev(g.BC.SH, 2, [['x']])), cache.get(g.BC.CACHE)], ['broadcast', null]);
    sama([g.edlBuangCache_(ev(g.NP.TAB, 2, [['x']])), cache.get(g.NP.CACHE)], ['notif', null]);
    const kPin = g.PIN.CK_STATUS + g.pinCacheId_(g.normNama_('Ani Lestari') + '|ROM-C10');
    cache.put(kPin, 'x'); cache.put(g.PIN.CK_PETA, 'x');
    sama([g.edlBuangCache_(ev(g.PIN.SHEET, 5, [['K', 'Ani Lestari', 'ROM-C10']])), cache.get(kPin), cache.get(g.PIN.CK_PETA)], ['pin', null, null]);
    const kunciPr = 'P'.repeat(70);
    cache.put('pn_' + kunciPr.slice(0, 60), 'x');
    sama([g.edlBuangCache_(ev(g.BC.SH_PR, 4, [[kunciPr]])), cache.get('pn_' + kunciPr.slice(0, 60))], ['perangkat', null]);
    sama([g.edlBuangCache_(ev('Siswa', 2, [['x']])), g.edlBuangCache_({}), hapus], ['', '', 1], 'tab lain / tanpa range');
    g.onEdit(null);   // tidak boleh melempar galat
  } finally { g.perfHapusCache_ = asli; }
});

// v1.88.3: cache beranda bertanda (versi data + tanggal + tambahan)
tes('brdCacheBaca_: hanya dipakai bila versi data, tanggal, dan tambahan masih sama', () => {
  const asli = g.absHariIni_;
  try {
    let hari = '2026-11-16';
    g.absHariIni_ = () => hari;
    const k = 'brds_tes';
    const t1 = g.brdTanda_('x');
    g.brdCacheTulis_(cache, k, t1, { kartu: [1] }, 1800);
    sama(g.brdCacheBaca_(cache, k, g.brdTanda_('x')), { kartu: [1] }, 'tanda sama');
    sama(g.brdCacheBaca_(cache, k, g.brdTanda_('y')), null, 'tambahan beda (jawaban baru)');
    g.perfGantiVersi_();
    const lalu = Date.now(); while (Date.now() === lalu) { /* versi berbasis milidetik */ }
    g.perfGantiVersi_();
    sama(g.brdCacheBaca_(cache, k, g.brdTanda_('x')), null, 'versi data berganti');
    g.brdCacheTulis_(cache, k, g.brdTanda_('x'), { kartu: [2] }, 1800);
    hari = '2026-11-17';
    sama(g.brdCacheBaca_(cache, k, g.brdTanda_('x')), null, 'ganti hari');
    cache.put(k, JSON.stringify({ kartu: [9] }));   // format lama (tanpa tanda)
    sama(g.brdCacheBaca_(cache, k, g.brdTanda_('x')), null, 'format lama diabaikan');
    cache.put(g.brdKunciSiswa_('R1', 'Ani'), 'x');
    g.brdLupakanSiswa_('R1', 'ani ');
    sama(cache.get(g.brdKunciSiswa_('R1', 'Ani')), null, 'kirim jawaban membuang beranda siswa itu');
  } finally { g.absHariIni_ = asli; }
});

// v1.88.4: memo baca sheet per permintaan baca
tes('getSheetData: memo per permintaan baca - sekali baca, salinan terpisah, getSheet membuang memo, fungsi tulis tanpa memo', () => {
  const simpan = { getSheet: g.getSheet, getSheetData: g.getSheetData, getSheetMentah_: g.getSheetMentah_, SpreadsheetApp: g.SpreadsheetApp };
  try {
    vm.runInContext(fs.readFileSync(path.join(dir, 'SheetUtils.gs'), 'utf8'), konteks);   // fungsi asli (tes lain menggantinya)
    let baca = 0;
    const isi = [['ID', 'Nama'], ['R1', 'Ani']];
    const lembar = { getDataRange: () => { baca++; return { getValues: () => isi.map((r) => r.slice()) }; } };
    g.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: () => lembar }) };
    g.SHEET_MEMO_ = null;
    g.getSheetData('Siswa'); g.getSheetData('Siswa');
    sama(baca, 2, 'tanpa memo: dibaca tiap kali');
    g.SHEET_MEMO_ = {};
    const a = g.getSheetData('Siswa');
    a[1][1] = 'DIUBAH';
    const b = g.getSheetData('Siswa');
    sama([baca, b[1][1]], [3, 'Ani'], 'memo: sekali baca, salinan terpisah');
    g.getSheet('Siswa');
    g.getSheetData('Siswa');
    sama(baca, 4, 'getSheet (jalur tulis) membuang memo');
    sama([g.memoBolehFn_('waSiswaBeranda'), g.memoBolehFn_('waGetMateri'), g.memoBolehFn_('waStafRuangCek')], [true, true, true], 'fungsi baca');
    sama([g.memoBolehFn_('waSubmitJawaban'), g.memoBolehFn_('waAdminSimpanPengguna'), g.memoBolehFn_('waStafAbsenWbCatat'), g.memoBolehFn_('waStafMasaTetapkan'), g.memoBolehFn_('')],
      [false, false, false, false, false], 'fungsi tulis');
  } finally { g.SHEET_MEMO_ = null; Object.assign(g, simpan); }
});

// v1.88.5: daftar materi siswa - Konten dibaca hanya untuk rentang baris mapel itu
tes('getMateriAktifUntukMapel_: Konten tepat per baris, kolom Konten tidak dibaca utuh', () => {
  const simpan = { getSheet: g.getSheet, getSheetMentah_: g.getSheetMentah_, getSheetData: g.getSheetData, hitungJumlahSoalUjian_: g.hitungJumlahSoalUjian_ };
  try {
    const H = g.CONFIG.HEADERS.MATERI, ik = H.indexOf('Konten/Instruksi');
    const baris = (id, mp, jenis, konten, status) => H.map((h) => ({ 'ID Materi': id, 'ID Mapel': mp, 'Jenis': jenis, 'Judul': 'J-' + id, 'Konten/Instruksi': konten, 'Status': status || 'Aktif', 'Sesi': 'Sesi 1' }[h] ?? ''));
    const mv = [H.slice(), baris('A1', 'MA', 'Materi', 'isi A1'), baris('B1', 'MB', 'Materi', 'isi B1'), baris('B2', 'MB', 'Diskusi', 'isi B2'),
      baris('B3', 'MB', 'Materi', 'isi B3', 'Draft'), baris('B4', 'MB', 'Materi', 'isi B4'), baris('C1', 'MC', 'Materi', 'isi C1')];
    const bacaKonten = [];
    const lembar = {
      getLastRow: () => mv.length, getLastColumn: () => H.length,
      getDataRange: () => { throw new Error('tidak boleh membaca seluruh sheet'); },
      getRange: (r, c, nr, nc) => {
        nr = nr || 1; nc = nc || 1;
        if (c <= ik + 1 && c + nc - 1 >= ik + 1) bacaKonten.push([r, nr]);
        return { getValues: () => mv.slice(r - 1, r - 1 + nr).map((b) => b.slice(c - 1, c - 1 + nc)), setValue() { throw new Error('tidak boleh menulis'); } };
      },
    };
    g.getSheet = g.getSheetMentah_ = () => lembar;
    g.hitungJumlahSoalUjian_ = () => 0;
    const d = g.getMateriAktifUntukMapel_('MB');
    sama(d.map((x) => [x.id, x.konten]), [['B1', 'isi B1'], ['B2', 'isi B2'], ['B4', 'isi B4']], 'konten tepat, Draft dilewati');
    sama(bacaKonten, [[3, 4]], 'Konten dibaca sekali, hanya baris 3..6 (mapel MB)');
    sama(g.materiTanpaKonten_()[0][ik], 'Konten/Instruksi', 'judul kolom Konten tetap ada');
    sama(g.materiTanpaKonten_()[1][ik], '', 'sel Konten dikosongkan');
  } finally { Object.assign(g, simpan); }
});

// v1.88.6: cache besar bertanda versi (daftar materi per mapel)
tes('perfCacheBesar_: dipakai ulang, dipecah bila besar, dihitung ulang saat versi data berganti, objek baru tiap panggilan', () => {
  let hitung = 0;
  const besar = { isi: 'x'.repeat(120000), daftar: [{ id: 'M1', konten: 'é'.repeat(10) }] };
  const f = () => { hitung++; return JSON.parse(JSON.stringify(besar)); };
  g.perfGantiVersi_();
  const a = g.perfCacheBesar_('tes|besar', 900, f);
  const b = g.perfCacheBesar_('tes|besar', 900, f);
  sama([hitung, b.isi.length, b.daftar[0].konten, a !== b], [1, 120000, 'é'.repeat(10), true], 'dipakai ulang & utuh');
  b.daftar[0].id = 'DIUBAH';
  sama(g.perfCacheBesar_('tes|besar', 900, f).daftar[0].id, 'M1', 'perubahan pemanggil tidak memengaruhi cache');
  const kunciPecahan = [...cache._peta.keys()].filter((k) => k.startsWith('db|tes|besar|') && /\|\d+$/.test(k));
  sama(kunciPecahan.length >= 3, true, 'dipecah beberapa bagian');
  const lalu = Date.now(); while (Date.now() === lalu) { /* versi berbasis milidetik */ }
  g.perfGantiVersi_();
  g.perfCacheBesar_('tes|besar', 900, f);
  sama(hitung, 2, 'versi berganti -> dihitung ulang');
  // satu pecahan hilang -> dihitung ulang, bukan data rusak
  const k0 = 'db|tes|besar|' + g.perfVersiData_() + '|1';
  cache.remove(k0);
  sama([g.perfCacheBesar_('tes|besar', 900, f).isi.length, hitung], [120000, 3], 'pecahan hilang');
});

// v1.88.7: log aktivitas ditulis dengan satu appendRow, nilai tetap teks apa adanya
tes('catat_: satu appendRow, nilai berawalan apostrof (teks), mode lihat tidak mencatat', () => {
  const simpan = { catat_: g.catat_, pastikanSheetAktivitas_: g.pastikanSheetAktivitas_ };
  try {
    vm.runInContext(fs.readFileSync(path.join(dir, 'Aktivitas.gs'), 'utf8'), konteks);   // catat_ asli (tes lain menggantinya)
    const tulis = [];
    const lembar = { appendRow: (r) => tulis.push(r), getLastRow() { throw new Error('tidak perlu getLastRow'); }, getRange() { throw new Error('tidak perlu getRange'); } };
    g.pastikanSheetAktivitas_ = () => lembar;
    g.__INTIP = false;
    g.catat_('Siswa', 'ROM-C10', 'Ani', 'Kirim jawaban', '=HYPERLINK("x")', 'OK');
    sama(tulis.length, 1, 'satu panggilan');
    const r = tulis[0];
    sama([r.length, r[1], r[2], r[5], r[6], /^'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r[0])], [7, "'Siswa", "'ROM-C10", "'=HYPERLINK(\"x\")", "'OK", true]);
    g.catat_('Staf', '', 'B', 'x', '', 'GAGAL');
    sama([tulis[1][2], tulis[1][5], tulis[1][6]], ['', '', "'GAGAL"], 'sel kosong tetap kosong');
    g.__INTIP = true;
    g.catat_('Siswa', '', 'C', 'x', '', 'OK');
    sama(tulis.length, 2, 'mode lihat tidak mencatat');
  } finally { g.__INTIP = false; Object.assign(g, simpan); }
});

// v1.89.0: Midtrans Snap untuk pembayaran online (tiruan server Midtrans)
function siapMidtrans(statusJawab) {
  const tabel = [], panggil = [];
  const asli = ['rfAturan_', 'gwBaca_', 'gwTambah_', 'gwUbah_', 'gwCari_', 'gwSelesai_', 'catat_', 'UrlFetchApp'].reduce((o, k) => { o[k] = g[k]; return o; }, {});
  g.rfAturan_ = () => ({ gateway: { aktif: true, penyedia: 'midtrans', serverKey: 'SB-Mid-server-TES', produksi: false, dokuMasaBayar: 60 } });
  g.gwBaca_ = () => tabel.map((x, i) => Object.assign({ _baris: i + 2 }, x));
  g.gwTambah_ = (o) => tabel.push(Object.assign({}, o));
  g.gwUbah_ = (b, o) => Object.assign(tabel[b - 2], o);
  g.gwCari_ = (inv) => g.gwBaca_().filter((x) => x['INVOICE'] === String(inv))[0] || null;
  g.catat_ = () => {};
  g.gwSelesai_ = (x, bayar, kanal) => { panggil.push(['selesai', x['INVOICE'], bayar, kanal]); return { status: 'Lunas' }; };
  g.UrlFetchApp = { fetch: (url, opsi) => {
    panggil.push(['fetch', url, opsi.method, opsi.headers.Authorization, opsi.payload ? JSON.parse(opsi.payload) : null]);
    if (/snap\/v1\/transactions$/.test(url)) return { getResponseCode: () => 201, getContentText: () => JSON.stringify({ token: 't', redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/t' }) };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(statusJawab()) };
  } };
  return { tabel, panggil, pulihkan: () => Object.assign(g, asli) };
}
tes('Midtrans: buat order Snap (metode terpilih, total tetap, Basic auth), order lama dipakai ulang', () => {
  const m = siapMidtrans(() => ({}));
  try {
    const o = g.gwBuatOrder_({ jenis: 'Tagihan', ref: 'TG1', idWb: 'WB1', nama: 'Ani', uraian: 'SPP - Ani', pokok: 100000, metode: 'BCA_VA', hp: '0812-3456', oleh: 'Ani (siswa)' });
    const f = m.panggil[0];
    sama([/^https:\/\/app\.sandbox\.midtrans\.com\/snap\/v1\/transactions$/.test(f[1]), f[2], f[3]], [true, 'post', 'Basic ' + Buffer.from('SB-Mid-server-TES:').toString('base64')], 'alamat & kunci');
    sama([f[4].enabled_payments, f[4].transaction_details.gross_amount, f[4].item_details.map((i) => i.price), f[4].expiry, f[4].customer_details.phone],
      [['bca_va'], 104000, [100000, 4000], { unit: 'minute', duration: 60 }, '08123456'], 'isi Snap');
    sama([o.url, o.jumlah, o.biaya, m.tabel[0]['PENYEDIA'], m.tabel[0]['METODE']], ['https://app.sandbox.midtrans.com/snap/v4/redirection/t', 104000, 4000, 'Midtrans (sandbox)', 'BCA_VA'], 'order tercatat');
    m.tabel[0]['KADALUARSA'] = '2999-01-01 00:00';
    const o2 = g.gwBuatOrder_({ jenis: 'Tagihan', ref: 'TG1', idWb: 'WB1', nama: 'Ani', uraian: 'SPP - Ani', pokok: 100000, metode: 'BCA_VA' });
    sama([o2.lama, m.panggil.length], [true, 1], 'dipakai ulang tanpa memanggil Midtrans');
    sama(g.gwMetode_({ penyedia: 'midtrans' }).map((x) => x.grup).filter((v, i, a) => a.indexOf(v) === i), ['Virtual Account', 'QRIS & e-wallet', 'Gerai retail'], 'grup katalog');
  } finally { m.pulihkan(); }
});
tes('Midtrans: cek status - settlement diselesaikan dengan kanal katalog, expire/cancel, belum ada transaksi tetap menunggu', () => {
  let jawab = {};
  const m = siapMidtrans(() => jawab);
  try {
    m.tabel.push({ 'INVOICE': 'TAG-1', 'STATUS': 'Menunggu', 'JUMLAH': 104000, 'PENYEDIA': 'Midtrans (sandbox)', 'KADALUARSA': '2999-01-01 00:00' });
    jawab = { status_code: '404', status_message: "Transaction doesn't exist." };
    sama(g.gwPeriksa_('TAG-1').status, 'Menunggu', 'belum memilih bayar');
    sama(/api\.sandbox\.midtrans\.com\/v2\/TAG-1\/status$/.test(m.panggil[0][1]), true, 'mode sandbox mengikuti order');
    jawab = { status_code: '201', transaction_status: 'pending', order_id: 'TAG-1' };
    sama(g.gwPeriksa_('TAG-1').status, 'Menunggu', 'pending');
    jawab = { status_code: '200', transaction_status: 'settlement', order_id: 'TAG-1', gross_amount: '104000.00', payment_type: 'bank_transfer', va_numbers: [{ bank: 'bca', va_number: '1' }] };
    g.gwPeriksa_('TAG-1');
    sama(m.panggil.filter((p) => p[0] === 'selesai'), [['selesai', 'TAG-1', 104000, 'BCA_VA']], 'lunas');
    sama([g.gwMtKanal_({ payment_type: 'echannel' }), g.gwMtKanal_({ payment_type: 'qris' }), g.gwMtKanal_({ payment_type: 'cstore', store: 'indomaret' }),
      g.gwMtKanal_({ payment_type: 'bank_transfer', permata_va_number: '9' }), g.gwMtKanal_({ payment_type: 'gopay' })],
      ['ECHANNEL', 'OTHER_QRIS', 'INDOMARET', 'PERMATA_VA', 'GOPAY'], 'pemetaan kanal');
    jawab = { status_code: '407', transaction_status: 'expire', order_id: 'TAG-1' };
    sama([g.gwPeriksa_('TAG-1').status, m.tabel[0]['STATUS']], ['Kedaluwarsa', 'Kedaluwarsa'], 'expire');
    m.tabel.push({ 'INVOICE': 'TAG-2', 'STATUS': 'Menunggu', 'JUMLAH': 1000, 'PENYEDIA': 'Midtrans' });
    jawab = { status_code: '202', transaction_status: 'deny', order_id: 'TAG-2' };
    sama(g.gwPeriksa_('TAG-2').status, 'Gagal', 'deny');
    sama(/\/\/api\.midtrans\.com\//.test(m.panggil[m.panggil.length - 1][1]), true, 'order produksi diperiksa ke produksi');
  } finally { m.pulihkan(); }
});
tes('Midtrans: notifikasi - tanda tangan salah ditolak, order gateway diteruskan ke pemeriksaan status', () => {
  let jawab = { status_code: '200', transaction_status: 'settlement', order_id: 'TAG-9', gross_amount: '50000.00', payment_type: 'qris' };
  const m = siapMidtrans(() => jawab);
  try {
    m.tabel.push({ 'INVOICE': 'TAG-9', 'STATUS': 'Menunggu', 'JUMLAH': 50000, 'PENYEDIA': 'Midtrans (sandbox)' });
    const ttd = (b) => require('crypto').createHash('sha512').update(b.order_id + b.status_code + b.gross_amount + 'SB-Mid-server-TES').digest('hex');
    const body = { order_id: 'TAG-9', status_code: '200', gross_amount: '50000.00', transaction_status: 'settlement' };
    sama(g.refWebhook_(Object.assign({}, body, { signature_key: 'palsu' })).alasan, 'tanda tangan', 'palsu ditolak');
    sama(m.panggil.length, 0, 'tidak memanggil Midtrans');
    const h = g.refWebhook_(Object.assign({}, body, { signature_key: ttd(body) }));
    sama([h.status, m.panggil.filter((p) => p[0] === 'selesai')], ['Lunas', [['selesai', 'TAG-9', 50000, 'OTHER_QRIS']]], 'sah -> dikonfirmasi lalu lunas');
  } finally { m.pulihkan(); }
});

// v1.89.2: tampilan pengguna tanpa nama penyedia
tes('gwNamaKanal_ & pesan aktif: nama kanal ramah, tanpa DOKU/Midtrans', () => {
  const asli = g.rfAturan_;
  try {
    g.rfAturan_ = () => ({ gateway: { aktif: false, penyedia: 'midtrans', serverKey: '' } });
    sama([g.gwNamaKanal_({ 'PENYEDIA': 'Midtrans (sandbox)' }, 'OTHER_QRIS'), g.gwNamaKanal_({ 'PENYEDIA': 'Midtrans' }, 'ECHANNEL'),
      g.gwNamaKanal_({ 'PENYEDIA': 'DOKU' }, 'VIRTUAL_ACCOUNT_BRI'), g.gwNamaKanal_({ 'PENYEDIA': 'Midtrans' }, 'XYZ_ABC'), g.gwNamaKanal_({ 'PENYEDIA': 'DOKU' }, '')],
      ['QRIS', 'VA Mandiri', 'VA BRI', 'XYZ ABC', 'online']);
    let pesan = '';
    try { g.gwWajibAktif_(); } catch (e) { pesan = e.message; }
    sama([/belum diaktifkan/.test(pesan), /DOKU|Midtrans/.test(pesan)], [true, false], 'pesan tanpa nama penyedia');
  } finally { g.rfAturan_ = asli; }
});

// v1.90.0: Midtrans Core API -> info bayar untuk popup aplikasi (aplikasi lama tetap Snap)
tes('Midtrans Core API: aplikasi baru dapat info bayar per metode, aplikasi lama tetap halaman Snap, order dipakai ulang', () => {
  const tabel = [], panggil = [];
  const asli = ['rfAturan_', 'gwBaca_', 'gwTambah_', 'gwUbah_', 'gwCari_', 'catat_', 'UrlFetchApp', '__API_V'].reduce((o, k) => { o[k] = g[k]; return o; }, {});
  const jawab = {
    bank_transfer: (b) => ({ status_code: '201', payment_type: 'bank_transfer', expiry_time: '2099-12-31 17:00:00',
      ...(b.bank_transfer.bank === 'permata' ? { permata_va_number: '8562000001' } : { va_numbers: [{ bank: b.bank_transfer.bank, va_number: '12345' + b.bank_transfer.bank }] }) }),
    echannel: () => ({ status_code: '201', payment_type: 'echannel', biller_code: '70012', bill_key: '990011', expiry_time: '2099-12-31 17:00:00' }),
    qris: () => ({ status_code: '201', payment_type: 'qris', qr_string: '00020101021226...', actions: [{ name: 'generate-qr-code', url: 'https://api.sandbox.midtrans.com/v2/qris/x/qr-code' }] }),
    gopay: () => ({ status_code: '201', payment_type: 'gopay', actions: [{ name: 'generate-qr-code', url: 'https://q' }, { name: 'deeplink-redirect', url: 'gojek://gopay/x' }] }),
    shopeepay: () => ({ status_code: '201', payment_type: 'shopeepay', actions: [{ name: 'deeplink-redirect', url: 'https://wsa.wallet.airpay.co.id/x' }] }),
    cstore: (b) => ({ status_code: '201', payment_type: 'cstore', store: b.cstore.store, payment_code: 'KODE' + b.cstore.store }),
  };
  try {
    g.rfAturan_ = () => ({ gateway: { aktif: true, penyedia: 'midtrans', serverKey: 'SB-Mid-server-TES', produksi: false, dokuMasaBayar: 60 } });
    g.gwBaca_ = () => tabel.map((x, i) => Object.assign({ _baris: i + 2 }, x));
    g.gwTambah_ = (o) => tabel.push(Object.assign({}, o));
    g.gwUbah_ = (b, o) => Object.assign(tabel[b - 2], o);
    g.gwCari_ = (inv) => g.gwBaca_().filter((x) => x['INVOICE'] === String(inv))[0] || null;
    g.catat_ = () => {};
    g.UrlFetchApp = { fetch: (url, opsi) => {
      const b = opsi.payload ? JSON.parse(opsi.payload) : null;
      panggil.push([url, b]);
      if (/snap\/v1\/transactions$/.test(url)) return { getResponseCode: () => 201, getContentText: () => JSON.stringify({ redirect_url: 'https://snap/x' }) };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(jawab[b.payment_type](b)) };
    } };
    const buat = (metode, ref) => g.gwBuatOrder_({ jenis: 'Tagihan', ref: ref || ('T-' + metode), idWb: 'WB1', nama: 'Ani', uraian: 'SPP - Ani', pokok: 100000, metode });
    // aplikasi lama -> Snap
    g.__API_V = '1.89.2';
    const lamaApp = buat('BCA_VA', 'T-LAMA');
    sama([lamaApp.url, lamaApp.info, /snap/.test(panggil[0][0])], ['https://snap/x', null, true], 'aplikasi lama');
    // aplikasi baru -> Core API
    g.__API_V = '1.90.0';
    const va = buat('BCA_VA');
    const pc = panggil[panggil.length - 1];
    sama([/api\.sandbox\.midtrans\.com\/v2\/charge$/.test(pc[0]), pc[1].payment_type, pc[1].bank_transfer.bank, pc[1].transaction_details.gross_amount, pc[1].custom_expiry],
      [true, 'bank_transfer', 'bca', 104000, { expiry_duration: 60, unit: 'minute' }], 'isi charge VA');
    sama([va.url, va.info.jenis, va.info.bank, va.info.nomor, va.info.total, va.kadaluarsa], ['', 'va', 'BCA', '12345bca', 104000, '2099-12-31 17:00'], 'info VA');
    sama(JSON.parse(tabel[tabel.length - 1]['INFO BAYAR']).nomor, '12345bca', 'info tersimpan');
    const n = panggil.length;
    const ulang = buat('BCA_VA');
    sama([ulang.lama, ulang.info.nomor, panggil.length], [true, '12345bca', n], 'dipakai ulang tanpa charge baru');
    sama(buat('PERMATA_VA').info.nomor, '8562000001', 'permata');
    const lain = buat('OTHER_VA');
    sama([panggil[panggil.length - 1][1].bank_transfer.bank, lain.info.antarBank], ['bni', true], 'VA bank lain lewat BNI');
    const mdr = buat('ECHANNEL').info;
    sama([mdr.jenis, mdr.kodePerusahaan, mdr.kodeBayar], ['mandiri', '70012', '990011'], 'mandiri');
    const qr = buat('OTHER_QRIS').info;
    sama([qr.jenis, qr.qr.slice(0, 6), /qr-code$/.test(qr.qrUrl)], ['qris', '000201', true], 'qris');
    const gp = buat('GOPAY').info;
    sama([gp.jenis, gp.aplikasi, gp.tautan], ['ewallet', 'GoPay', 'gojek://gopay/x'], 'gopay');
    const sp = buat('SHOPEEPAY').info;
    sama([sp.aplikasi, /airpay/.test(sp.tautan)], ['ShopeePay', true], 'shopeepay');
    const im = buat('INDOMARET').info;
    sama([im.jenis, im.gerai, im.kodeBayar], ['gerai', 'Indomaret', 'KODEindomaret'], 'indomaret');
    // aplikasi lama tidak memakai ulang order tanpa halaman
    g.__API_V = '1.89.2';
    const lama2 = buat('BCA_VA');
    sama([lama2.lama, lama2.url], [false, 'https://snap/x'], 'aplikasi lama membuat halaman baru');
  } finally { Object.assign(g, asli); }
});

// v1.90.1: Custom Transaction hanya VA dan QRIS
tes('Custom Transaction: metode bayar hanya Virtual Account dan QRIS, metode lain ditolak', () => {
  const asli = ['rfAturan_', 'gwAktif_', 'stafDariToken_', 'vcCari_', 'gwBuatOrder_'].reduce((o, k) => { o[k] = g[k]; return o; }, {});
  try {
    const gw = { aktif: true, penyedia: 'midtrans', serverKey: 'SB-x' };
    g.rfAturan_ = () => ({ gateway: gw });
    g.gwAktif_ = () => ({ aktif: true, g: gw, nama: 'Midtrans' });
    const m = g.vcMetode_(gw);
    sama(m.map((x) => x.kode), ['BCA_VA', 'BNI_VA', 'BRI_VA', 'ECHANNEL', 'PERMATA_VA', 'OTHER_VA', 'OTHER_QRIS'], 'daftar metode');
    sama(m.filter((x) => x.kode === 'OTHER_QRIS')[0].grup, 'QRIS', 'grup QRIS');
    g.stafDariToken_ = () => ({ nama: 'Fia', peran: 'Front Office' });
    g.vcCari_ = () => ({ t: {}, x: { id: 'VAC-1', status: 'Menunggu', pembayar: 'Budi', keterangan: 'Pembayaran X', pokok: 1000 } });
    let dibuat = 0;
    g.gwBuatOrder_ = () => { dibuat++; throw new Error('lanjut'); };
    let galat = '';
    try { g.waStafVaCustomBayar('T', { id: 'VAC-1', metode: 'GOPAY' }); } catch (e) { galat = e.message; }
    sama([galat, dibuat], ['Pilih metode Virtual Account atau QRIS.', 0], 'gopay ditolak');
    try { g.waStafVaCustomBayar('T', { id: 'VAC-1', metode: 'other_qris' }); } catch (e) { galat = e.message; }
    sama([galat, dibuat], ['lanjut', 1], 'qris diterima');
  } finally { Object.assign(g, asli); }
});


// v1.90.2: fungsi baca tidak lagi mengosongkan cache; riwayat jawaban di-cache per siswa
tes('perfSetelah_: fungsi baca (TANPA_HAPUS) tidak mengosongkan cache, fungsi ubah tetap', () => {
  const asli = ['perfHapusCache_', 'perfGantiVersi_'].reduce((o, k) => { o[k] = g[k]; return o; }, {});
  const aktif = g.PERF.AKTIF;
  try {
    let hapus = 0, versi = 0;
    g.perfHapusCache_ = () => { hapus++; }; g.perfGantiVersi_ = () => { versi++; };
    g.PERF.AKTIF = false;
    ['waAdminRilisStatus', 'waAdminBroadcastDaftar', 'waSimpanDraftDiskusi', 'waAdminLog', 'waLaporPindahTab', 'waStafKsAbsenStatus'].forEach((f) => g.perfSetelah_(f, 100, true));
    sama([hapus, versi], [0, 0], 'fungsi baca');
    g.perfSetelah_('waAdminSimpanPengguna', 100, true);
    g.perfSetelah_('waStafDiskusiSimpanNilai', 100, true);
    g.perfSetelah_('waStafMateriStatus', 100, true);
    g.perfSetelah_('waAdminSimpanPengguna', 100, false);
    sama([hapus, versi], [2, 1], 'fungsi ubah');
    Object.keys(g.PERF.TANPA_HAPUS).forEach((f) => { if (!/^wa/.test(f)) throw new Error('nama salah ' + f); });
  } finally { Object.assign(g, asli); g.PERF.AKTIF = aktif; }
});
tes('waGetRiwayatJawaban: hasil berat di-cache per siswa per mapel; gugur saat siswa kirim/absen atau versi data berganti', () => {
  const asli = ['getSheet', 'abRiwayatSiswa_', 'sbSaringRiwayat_', 'taDibukaUntuk_'].reduce((o, k) => { o[k] = g[k]; return o; }, {});
  try {
    let baca = 0;
    const isi = [['ID Rombel', 'ID Mapel', 'Nama Mapel', 'ID Materi', 'Judul', 'Jenis', 'Nama Siswa', 'Jawaban', 'Nilai', 'Waktu Kirim'],
      ['R1', 'MP1', 'Mat', 'M1', 'x', 'Diskusi', 'Ani', 'jawab ani', 80, '2026-11-16 10:00'],
      ['R1', 'MP1', 'Mat', 'M2', 'x', 'Diskusi', 'Budi', 'jawab budi', '', '2026-11-16 10:00']];
    g.getSheet = () => ({ getDataRange: () => ({ getValues: () => { baca++; return isi.map((r) => r.slice()); } }) });
    g.abRiwayatSiswa_ = () => ({}); g.sbSaringRiwayat_ = () => {};
    let buka = 0; g.taDibukaUntuk_ = () => { buka++; return { S1: true }; };
    const a = g.waGetRiwayatJawaban('MP1', 'Ani');
    sama([a.M1.jawaban, a.M1.nilai, !!a.M2, a.__buka.S1, typeof a.__sekarang, baca], ['jawab ani', 80, false, true, 'number', 1]);
    const b = g.waGetRiwayatJawaban('MP1', 'Ani');
    sama([b.M1.jawaban, baca, buka], ['jawab ani', 1, 2], 'kedua dari cache, sesi dibuka tetap dihitung');
    g.waGetRiwayatJawaban('MP1', 'Budi');
    sama(baca, 2, 'siswa lain dihitung sendiri');
    isi[1][7] = 'jawab ani baru';
    g.brdLupakanSiswa_('R1', 'Ani');
    sama([g.waGetRiwayatJawaban('MP1', 'Ani').M1.jawaban, baca], ['jawab ani baru', 3], 'setelah kirim');
    g.waGetRiwayatJawaban('MP1', 'Budi');
    sama(baca, 3, 'cache Budi tidak terganggu');
    g.perfGantiVersi_();
    g.waGetRiwayatJawaban('MP1', 'Budi');
    sama(baca, 4, 'versi data berganti');
  } finally { Object.assign(g, asli); }
});

// v1.92.0: nama Kepala Sekolah dari akun aktif; nama penanda tangan leger
tes('ksNamaCetak_: akun Kepala Sekolah aktif dipakai, cadangan isian KEPALA PKBM', () => {
  const asli = g.bacaPengguna_;
  try {
    const u = (nama, peran, status, kustom) => ({ id: nama, nama, peran, status: status || 'Aktif', peranKustom: kustom || '' });
    g.bacaPengguna_ = () => [u('Budi', 'Tutor'), u('Siti Aminah', 'Kepala Sekolah'), u('Lama', 'Kepala Sekolah', 'Nonaktif')];
    sama(g.ksNamaCetak_('Pak Lama'), 'Siti Aminah', 'satu akun aktif');
    g.bacaPengguna_ = () => [u('Siti Aminah', 'Kepala Sekolah'), u('Rina', 'Kepala Sekolah')];
    sama([g.ksNamaCetak_('rina'), g.ksNamaCetak_('Orang Lain')], ['Rina', 'Siti Aminah'], 'dua akun: yang sama dengan isian, lalu yang pertama');
    g.bacaPengguna_ = () => [u('Dinas X', 'Kepala Sekolah', 'Aktif', 'Dinas'), u('Budi', 'Tutor')];
    sama(g.ksNamaCetak_('Kepala Cadangan'), 'Kepala Cadangan', 'tanpa akun aktif -> cadangan');
  } finally { g.bacaPengguna_ = asli; }
});
tes('nilNamaTtd_: pengampu utama dari tutor bawaan kelas, koordinator unit dari unit yang dicetak', () => {
  const asli = ['pgoPeta_', 'pgoSemuaTutor_', 'ubUtama_', 'absPetaTutor_', 'ubPetaUnit_', 'bacaPengguna_', 'ubKoordEf_'].reduce((o, k) => { o[k] = g[k]; return o; }, {});
  try {
    g.pgoPeta_ = () => ({ 'R1|MTK': { semua: 'T1', unit: { U2: 'T2' } }, 'R1|IPA': { semua: '', unit: { U1: 'T2' } } });
    g.pgoSemuaTutor_ = () => [];
    g.ubUtama_ = () => 'U1';
    g.absPetaTutor_ = () => ({ T1: { nama: 'Ani' }, T2: { nama: 'Budi' } });
    g.ubPetaUnit_ = () => ({ U1: { id: 'U1', utama: true, koordinator: [] }, U2: { id: 'U2', utama: false, koordinator: ['P9'] } });
    g.bacaPengguna_ = () => [{ id: 'P9', nama: 'Citra' }, { id: 'KS', nama: 'Siti' }];
    g.ubKoordEf_ = (u) => (u.koordinator.length ? u.koordinator : ['KS']);
    sama(g.nilNamaTtd_('R1|MTK', ['U2']), { pengampuUtama: 'Ani', koordinatorUnit: 'Citra' });
    sama(g.nilNamaTtd_('R1|IPA', ['U1']), { pengampuUtama: 'Budi', koordinatorUnit: 'Siti' }, 'tutor unit utama; unit utama tanpa koordinator -> KS');
    sama(g.nilNamaTtd_('R1|MTK', []), { pengampuUtama: 'Ani', koordinatorUnit: '' }, 'tanpa unit');
  } finally { Object.assign(g, asli); }
});

// v1.92.1: cetak jadwal bulanan tidak menampilkan pertemuan yang ditiadakan (agenda / hari ujian masa)
tes('jadTandaiTiada_: tanggal pertemuan yang ditiadakan diberi alasan, yang lain tidak', () => {
  const asli = ['absHariIni_', 'jadBerlakuDasar_', 'agLiburPm_'].reduce((o, k) => { o[k] = g[k]; return o; }, {});
  try {
    g.absHariIni_ = () => '2026-11-21';
    g.jadBerlakuDasar_ = (x, iso) => new Date(iso + 'T00:00:00Z').getUTCDay() === 4;   // setiap Kamis
    g.agLiburPm_ = (x, iso) => (iso === '2026-12-10' ? { nama: 'diganti ujian UAS Semester 1' } : iso === '2026-12-24' ? { nama: 'Libur Natal' } : null);
    const pm = [{ id: 'P1' }];
    g.jadTandaiTiada_(pm);
    sama(pm[0].tiada, { '2026-12-10': 'diganti ujian UAS Semester 1', '2026-12-24': 'Libur Natal' });
  } finally { Object.assign(g, asli); }
});

tes('TTM selesai setelah UAS; kelas akhir mengikuti UAS/UPK yang lebih akhir; masa serentak & kalender akademik', () => {
  const asli = { ujJadwalSemua_: g.ujJadwalSemua_, nilPetaBm_: g.nilPetaBm_ };
  try {
    g.MG_AKHIR_ = null;
    g.MG_LIBUR_ = [
      { id: 'MU-1', nama: 'UAS Ganjil', jenis: 'UAS', slot: [{ tanggal: '2026-12-01', rombel: [] }, { tanggal: '2026-12-03', rombel: ['R12'] }], rombel: null, unit: null },
      { id: 'MU-2', nama: 'UPK', jenis: 'UPK', slot: [{ tanggal: '2026-12-10', rombel: [] }], rombel: { R12: true }, unit: null },
      { id: 'MU-3', nama: 'UTS', jenis: 'UTS', slot: [{ tanggal: '2026-10-01', rombel: [] }], rombel: null, unit: null },
      { id: 'MU-4', nama: 'UAS Unit S', jenis: 'UAS', slot: [{ tanggal: '2026-11-20', rombel: [] }], rombel: { R5: true }, unit: ['U-S'] }
    ];
    g.MG_AKHIR_ = { R7: { '2027-1': { tanggal: '2027-06-05', jenis: 'UAS' } } };   // UAS kalender akademik (bukan masa)
    // rombel biasa: setelah hari UAS terakhir yang berlaku untuknya
    sama(g.mgSelesaiPm_({ idRombel: 'R1', unit: '' }, '2026-12-01'), null);
    sama(g.mgSelesaiPm_({ idRombel: 'R1', unit: '' }, '2026-12-02').nama, 'pembelajaran selesai setelah UAS');
    sama(g.mgSelesaiPm_({ idRombel: 'R1', unit: '' }, '2026-11-30'), null);
    // UTS tidak menghentikan pembelajaran
    sama(g.mgSelesaiPm_({ idRombel: 'R1', unit: '' }, '2026-10-02'), null);
    // semester berikutnya mulai lagi
    sama(g.mgSelesaiPm_({ idRombel: 'R1', unit: '' }, '2027-01-04'), null);
    // kelas akhir: UPK setelah UAS -> tatap muka tetap ada sampai UPK
    sama(g.mgSelesaiPm_({ idRombel: 'R12', unit: '' }, '2026-12-08'), null);
    sama(g.mgSelesaiPm_({ idRombel: 'R12', unit: '' }, '2026-12-11').nama, 'pembelajaran selesai setelah UPK');
    // UPK sebelum UAS -> selesai setelah UAS
    g.MG_LIBUR_[1].slot = [{ tanggal: '2026-11-15', rombel: [] }];
    sama(g.mgSelesaiPm_({ idRombel: 'R12', unit: '' }, '2026-12-02'), null);   // slot UAS R12 terakhir 3 Des
    sama(g.mgSelesaiPm_({ idRombel: 'R12', unit: '' }, '2026-12-04').nama, 'pembelajaran selesai setelah UAS');
    // masa per unit: pemetaan unit lain tidak terkena, unit peserta mengikuti tanggal masa unitnya
    sama(g.mgSelesaiPm_({ idRombel: 'R5', unit: 'U-S' }, '2026-12-02').selesai, '2026-12-01');   // masa semua rombel lebih akhir
    g.MG_LIBUR_[0].rombel = { R1: true };
    sama(g.mgSelesaiPm_({ idRombel: 'R5', unit: 'U-S' }, '2026-11-23').selesai, '2026-11-20');
    sama(g.mgSelesaiPm_({ idRombel: 'R5', unit: 'U-L' }, '2026-11-23'), null);
    // kalender akademik
    sama(g.mgSelesaiPm_({ idRombel: 'R7', unit: '' }, '2027-06-05'), null);
    sama(g.mgSelesaiPm_({ idRombel: 'R7', unit: '' }, '2027-06-08').selesai, '2027-06-05');
    // peta kalender akademik dari tab Jadwal ujian: hanya UAS/UPK bukan masa, per rombel SIM, tanggal terakhir
    g.MG_AKHIR_ = null;
    g.ujJadwalSemua_ = () => [
      { idMapel: 'M1', jenis: 'UAS', tanggal: '2027-06-01', masa: '' }, { idMapel: 'M2', jenis: 'UAS', tanggal: '2027-06-04', masa: '' },
      { idMapel: 'M1', jenis: 'UTS', tanggal: '2027-06-20', masa: '' }, { idMapel: 'M2', jenis: 'UAS', tanggal: '2027-06-25', masa: 'MU-9' },
      { idMapel: 'M1', jenis: 'UAS (diganti masa)', tanggal: '2027-06-28', masa: '' }];
    g.nilPetaBm_ = () => ({ kelas: { 'R7|MTK': [{ idMapel: 'M1' }], 'R7|IPA': [{ idMapel: 'M2' }] } });
    sama(g.mgAkhirKalender_(), { R7: { '2027-1': { tanggal: '2027-06-04', jenis: 'UAS' } } });
  } finally { Object.assign(g, asli); g.MG_LIBUR_ = null; g.MG_AKHIR_ = null; }
});

tes('absensi harian: acuan sesi pertama, Tepat waktu / Terlambat (toleransi), Tidak absen pulang', () => {
  const peta = { R1: [{ mulai: '09:00', unit: '' }, { mulai: '08:00', unit: 'U-L' }, { mulai: '10:00', unit: '' }] };
  // sesi khusus unit lain diabaikan; tanpa unit siswa semua sesi dihitung
  sama(g.ahAcuanSiswa_(peta, 'R1', 'U-S', '07:00'), { jam: '09:00', dari: 'jadwal' });
  sama(g.ahAcuanSiswa_(peta, 'R1', 'U-L', '07:00').jam, '08:00');
  sama(g.ahAcuanSiswa_(peta, 'R2', 'U-S', '07:00'), { jam: '07:00', dari: 'jam buka' });   // tanpa jadwal -> jam buka
  sama(g.ahAcuanSiswa_(peta, 'R2', 'U-S', ''), null);
  const kini = { tanggal: '2026-11-21', jam: '12:00' }, ac = { jam: '09:00' };
  sama(g.ahKategori_({ status: 'Hadir', datang: '09:15', pulang: '' }, ac, '2026-11-21', kini, '16:00'), { kategori: 'Tepat waktu', telat: 0, acuan: '09:00', tanpaPulang: false });
  sama(g.ahKategori_({ status: 'Hadir', datang: '09:16', pulang: '' }, ac, '2026-11-21', kini, '16:00').telat, 16);
  sama(g.ahKategori_({ status: 'Hadir', datang: '09:16', pulang: '' }, ac, '2026-11-21', kini, '16:00').kategori, 'Terlambat');
  sama(g.ahKategori_({ status: 'Hadir', datang: '08:00', pulang: '' }, ac, '2026-11-21', kini, '16:00').kategori, 'Tepat waktu');
  // tidak absen pulang: hari sudah lewat, atau hari ini setelah jam tutup
  sama(g.ahKategori_({ status: 'Hadir', datang: '09:00', pulang: '' }, ac, '2026-11-20', kini, '16:00').tanpaPulang, true);
  sama(g.ahKategori_({ status: 'Hadir', datang: '09:00', pulang: '' }, ac, '2026-11-21', { tanggal: '2026-11-21', jam: '16:01' }, '16:00').tanpaPulang, true);
  sama(g.ahKategori_({ status: 'Hadir', datang: '09:00', pulang: '' }, ac, '2026-11-21', kini, '').tanpaPulang, false);
  sama(g.ahKategori_({ status: 'Hadir', datang: '09:00', pulang: '13:00' }, ac, '2026-11-20', kini, '16:00').tanpaPulang, false);
  // bukan Hadir / tanpa acuan
  sama(g.ahKategori_({ status: 'Izin', datang: '', pulang: '' }, ac, '2026-11-20', kini, '16:00'), { kategori: '', telat: 0, acuan: '', tanpaPulang: false });
  sama(g.ahKategori_({ status: 'Hadir', datang: '10:00', pulang: '' }, null, '2026-11-21', kini, '16:00').kategori, '');
  // pesan pindai datang
  const h = g.ahPesanKategori_({ aksi: 'datang', jam: '09:40', pesan: 'Ani (B7) datang 09:40' }, { id: 'W1', rombel: 'R1' }, '2026-11-21', { peta: peta, lab: { W1: { unit: 'U-S' } }, jamBuka: '07:00' });
  sama(h.pesan, 'Ani (B7) datang 09:40 · terlambat 40 menit (mulai 09:00)');
  sama(g.ahPesanKategori_({ aksi: 'pulang', jam: '13:00', pesan: 'x' }, { id: 'W1', rombel: 'R1' }, '2026-11-21', { peta: peta, lab: {}, jamBuka: '' }).pesan, 'x');
});

tes('data induk: warga belajar disimpan -> langsung masuk tab Siswa (login); simpan massal cukup sekali', () => {
  const asli = { siswaTambahBaru_: g.siswaTambahBaru_, ditSelaraskan_: g.ditSelaraskan_, waStafIndukSimpan: g.waStafIndukSimpan, absLupakan_: g.absLupakan_, indSkema_: g.indSkema_ };
  let n = 0;
  g.siswaTambahBaru_ = () => { n++; return 1; };
  g.ditSelaraskan_ = () => ({});
  try {
    sama(g.indSegarkan_('WARGA BELAJAR').siswa, 1);
    sama(g.indSegarkan_('ROMBEL').siswa, 0);
    sama(n, 1);
    n = 0;
    g.indSkema_ = () => ({ tab: 'WARGA BELAJAR' });
    g.absLupakan_ = () => {};
    g.waStafIndukSimpan = () => { g.indSegarkan_('WARGA BELAJAR'); return { sukses: true }; };
    const h = g.waStafIndukSimpanBanyak('t', 'wb', [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }]);
    sama([h.ok, h.siswaElearning, n, g.IND_TUNDA_SISWA_], [3, 1, 1, false]);
  } finally { Object.assign(g, asli); }
});

console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
