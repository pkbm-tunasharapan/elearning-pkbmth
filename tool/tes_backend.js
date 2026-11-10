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

console.log('\n' + lulus + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
