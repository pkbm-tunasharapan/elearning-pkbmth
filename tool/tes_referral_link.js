// Uji alur pendaftaran lewat link referral (v1.93.0) dengan spreadsheet tiruan di memori: node tool/tes_referral_link.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const dir = process.argv[2] || path.join(__dirname, '..', 'apps_script');
const pad = (n) => String(n).padStart(2, '0');
// ---- spreadsheet tiruan ----
function Lembar(nama) {
  const d = [];
  const sh = {
    nama, d,
    getLastRow: () => d.length, getLastColumn: () => d.reduce((m, r) => Math.max(m, r.length), 0),
    appendRow: (row) => { d.push(row.slice()); return sh; },
    getDataRange: () => ({ getValues: () => { const n = sh.getLastColumn(); return d.map((r) => { const x = r.slice(); while (x.length < n) x.push(''); return x; }); } }),
    getRange: (r, c, nr, nc) => {
      nr = nr || 1; nc = nc || 1;
      const rg = {
        getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(((d[r - 1 + i] || [])[c - 1 + j]) ?? ''); out.push(row); } return out; },
        getDisplayValues: () => rg.getValues().map((x) => x.map(String)),
        setValues: (v) => { for (let i = 0; i < v.length; i++) { while (d.length < r + i) d.push([]); for (let j = 0; j < v[i].length; j++) d[r - 1 + i][c - 1 + j] = v[i][j]; } return rg; },
        setValue: (v) => { while (d.length < r) d.push([]); d[r - 1][c - 1] = v; return rg; },
        setNumberFormat: () => rg, setFontWeight: () => rg,
      };
      return rg;
    },
    setFrozenRows: () => sh,
  };
  return sh;
}
const lembar = {};
const ss = { getSheetByName: (n) => lembar[n] || null, insertSheet: (n) => (lembar[n] = Lembar(n)) };
function buatTab(n, hdr) { const s = ss.insertSheet(n); s.appendRow(hdr); return s; }
// ---- layanan ----
const props = new Map(), cache = new Map(), surat = [], berkas = new Map();
const Utilities = {
  formatDate: (d, tz, f) => { const x = new Date(d.getTime() + 7 * 3600000); return f.replace('yyyy', x.getUTCFullYear()).replace('yy', String(x.getUTCFullYear()).slice(2)).replace('MM', pad(x.getUTCMonth() + 1)).replace('dd', pad(x.getUTCDate())).replace('HH', pad(x.getUTCHours())).replace('mm', pad(x.getUTCMinutes())).replace('ss', pad(x.getUTCSeconds())); },
  getUuid: () => crypto.randomUUID(), base64Encode: (b) => Buffer.from(b).toString('base64'), base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
  newBlob: (b, m, n) => ({ _n: n, getAs: () => ({ setName: (x) => ({ _n: x }) }) }), sleep: () => {},
};
let idB = 0;
const DriveApp = { getFolderById: () => ({ isTrashed: () => false, createFile: (b) => { const id = 'F' + (++idB); berkas.set(id, b); return { getId: () => id }; } }),
  createFolder: () => DriveApp.getFolderById(), getFileById: (id) => ({ getBlob: () => ({ getBytes: () => [1, 2], getContentType: () => 'image/png', getName: () => id }), setTrashed() {} }) };
const k = {
  console, Utilities, DriveApp,
  Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (x) => props.get(x) ?? null, setProperty: (a, b) => props.set(a, String(b)), deleteProperty: (a) => props.delete(a) }) },
  CacheService: { getScriptCache: () => ({ get: (x) => cache.get(x) ?? null, put: (a, b) => cache.set(a, String(b)), remove: (a) => cache.delete(a), getAll: () => ({}) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} }, Logger: { log() {} },
  MailApp: { sendEmail: (e, j) => surat.push(e + ' | ' + j) },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://x/exec' }), getProjectTriggers: () => [] },
};
k.globalThis = k;
vm.createContext(k);
fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).sort().forEach((f) => { try { vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), k, { filename: f }); } catch (e) { console.log('muat', f, e.message); } });
// ---- stub fungsi besar ----
const catatan = [];
Object.assign(k, {
  catat_: (...a) => catatan.push(a.join('|')), npKirim_: (j, o) => catatan.push('NOTIF ' + j + ' ' + o.judul), pndKirim_: () => {}, npPastikanPemicu_: () => {},
  absSim_: () => ({ tahun: '2026/2027', semester: 'Ganjil' }), indRef_: () => ({ program: [{ id: 'PKT-C', nama: 'Paket C' }] }),
  indSegarkan_: () => {}, kwKop_: () => ({ nama: 'PKBM UJI', baris: [], kota: 'Cirebon', kepala: 'KS UJI' }), nilLembaga_: () => ({ nama: 'PKBM UJI' }),
  honProgramRombel_: () => ({}), kalAkunSah_: () => 'BANK', kalAkunBawaan_: () => 'BANK', npBayarDiterima_: () => {}, aqrSetelahBayar_: () => {},
  simNamaTab_: (n) => n, absSs_: () => ss, perfGantiVersi_: () => {},
});
const staf = { TA: { id: 'U1', nama: 'Tutor Ani', peran: 'Tutor' }, AD: { id: 'U2', nama: 'Admin Budi', peran: 'Admin' }, BE: { id: 'U3', nama: 'Bendahara Cici', peran: 'Bendahara' } };
k.stafDariToken_ = (t) => { if (!staf[t]) throw new Error('SESI_HABIS'); return staf[t]; };
// tab dasar
buatTab('WARGA BELAJAR', ['ID WB', 'NAMA WB', 'NIK', 'NISN', 'JENIS KELAMIN', 'TEMPAT LAHIR', 'TANGGAL LAHIR', 'AGAMA', 'ALAMAT', 'NO HP', 'HP', 'EMAIL', 'NAMA AYAH', 'NAMA IBU', 'NAMA WALI', 'NO KK', 'SEKOLAH ASAL', 'PROGRAM', 'ROMBEL', 'STATUS', 'KETERANGAN']);
buatTab('TRANSAKSI', ['ID TRANSAKSI', 'TANGGAL', 'JENIS', 'KATEGORI KEUANGAN', 'WARGA BELAJAR', 'URAIAN', 'JUMLAH', 'SUMBER DANA', 'PIHAK TERKAIT', 'BUKTI', 'STATUS', 'DIPUTUS OLEH', 'TANGGAL KEPUTUSAN', 'CATATAN KEPUTUSAN', 'TAHUN PELAJARAN', 'DICATAT OLEH', 'DICATAT PADA']);
buatTab('KATEGORI KEUANGAN', ['KODE KATEGORI', 'NAMA KATEGORI', 'JENIS']);
props.set('TH_REFERRAL_ATURAN', JSON.stringify({ cashback: 50000, rekening: [{ bank: 'BRI', nomor: '123', atasNama: 'PKBM' }] }));
props.set('TH_REFERRAL_FOLDER', 'FOLDER');
let ok = 0, gagal = 0;
const cek = (nama, a, b) => { const s = JSON.stringify(a) === JSON.stringify(b); s ? ok++ : gagal++; console.log((s ? 'ok   ' : 'GAGAL ') + nama + (s ? '' : ' -> ' + JSON.stringify(a) + ' != ' + JSON.stringify(b))); };
const harus = (nama, fn, pola) => { try { fn(); gagal++; console.log('GAGAL ' + nama + ' (tidak melempar)'); } catch (e) { const s = pola.test(e.message); s ? ok++ : gagal++; console.log((s ? 'ok   ' : 'GAGAL ') + nama + ' : ' + e.message); } };

// 1. link promotor
const link = k.waRefLinkSaya('TA');
cek('kode 6 huruf', /^[A-Z0-9]{6}$/.test(link.kode), true);
cek('kode tetap', k.waRefLinkSaya('TA').kode, link.kode);
cek('info publik', k.waRlInfo(link.kode).promotor, 'Tutor');
harus('kode salah ditolak', () => k.waRlInfo('ZZZZZZ'), /tidak dikenal/);
// 2. daftar publik (usia 30 -> biaya pendidikan)
const data = { nama: 'Calon Uji', jk: 'L', nik: '3209000000000001', tempatLahir: 'Cirebon', tanggalLahir: '1996-01-01', alamat: 'Jl. Uji', program: 'Paket C', hp: '081234567890', ibuNama: 'Ibu Uji', email: 'calon@contoh.id', kelasTujuan: '12' };
const fb = { foto: 'data:image/png;base64,AAAA', kk: 'data:image/png;base64,AAAA', ttd: 'data:image/png;base64,AAAA' };
harus('email wajib', () => k.waRlDaftar(link.kode, Object.assign({}, data, { email: '' }), fb), /email/);
const h = k.waRlDaftar(link.kode, data, fb);
cek('daftar sukses', h.sukses, true);
harus('NIK dobel', () => k.waRlDaftar(link.kode, data, fb), /sudah terdaftar/);
cek('status awal', k.waRlStatus(h.kodeStatus).tahap, 'Menunggu Promotor');
cek('biaya tidak tampil ke pendaftar', k.waRlStatus(h.kodeStatus).tagihan, undefined);
// 3. promotor tinjau
const t = k.waRefTinjau('TA', h.id);
cek('bawaan biaya', [t.bawaan.daftar, t.bawaan.pendidikan, t.bawaan.wajibPendidikan, t.paket], [200000, 1500000, true, 'C']);
harus('promotor lain ditolak', () => k.waRefTinjau('AD', h.id), /bukan milik/);
harus('daftar di bawah resmi', () => k.waRefTinjauKirim('TA', h.id, { biayaDaftar: 150000, biayaPendidikan: 1500000, jadwalPendidikan: '2030-01-01', ttd: fb.ttd }), /tidak boleh di bawah/);
harus('pendidikan di bawah bawaan', () => k.waRefTinjauKirim('TA', h.id, { biayaDaftar: 250000, biayaPendidikan: 1000000, jadwalPendidikan: '2030-01-01', ttd: fb.ttd }), /tidak boleh di bawah/);
harus('tanpa ttd', () => k.waRefTinjauKirim('TA', h.id, { biayaDaftar: 250000, biayaPendidikan: 1600000, jadwalPendidikan: '2030-01-01' }), /Tanda tangani/);
k.waRefTinjauKirim('TA', h.id, { biayaDaftar: 250000, biayaPendidikan: 1600000, jadwalPendidikan: '2030-01-01', ttd: fb.ttd });
cek('tahap setelah tinjau', k.waRlStatus(h.kodeStatus).tahap, 'Menunggu Persetujuan');
// 4. persetujuan
harus('bendahara tidak memutus', () => k.waStafRefVerifLinkPutus('BE', h.id, true, ''), /Admin atau Kepala Sekolah/);
const p = k.waStafRefVerifLinkPutus('AD', h.id, true, 'ok');
const st = k.waRlStatus(h.kodeStatus);
cek('disetujui', [st.tahap, st.tagihan.map((x) => [x.jenis, x.jumlah, x.sisa])], ['Menunggu Pembayaran', [['daftar', 250000, 250000], ['pendidikan', 1600000, 1600000]]]);
cek('WB status Calon', lembar['WARGA BELAJAR'].d.slice(1).map((r) => r[19]), ['Calon']);
cek('email diterima terkirim', surat.some((s) => /DITERIMA/.test(s)), true);
cek('dokumen 2', st.dokumen.sort(), ['biaya', 'diterima']);
// 5. konfirmasi & teruskan
harus('jumlah lebih', () => k.waRlKonfirmasi(h.kodeStatus, { jumlah: 9999999, metode: 'Transfer', bukti: fb.foto }), /Jumlah pembayaran/);
k.waRlKonfirmasi(h.kodeStatus, { jumlah: 400000, metode: 'Transfer', bukti: fb.foto });
cek('tahap konfirmasi', k.waRlStatus(h.kodeStatus).tahap, 'Konfirmasi Bayar');
const det = k.waRefTinjau('TA', h.id);
k.waRefKonfirmasiTeruskan('TA', h.id, { idKonfirmasi: det.konfirmasi[0].id, terima: true });
const tf = lembar['TAGIHAN TRANSFER'].d.slice(1);
cek('dibagi: daftar dulu', tf.map((r) => r[5]), [250000, 150000]);
cek('tahap verifikasi', k.waRlStatus(h.kodeStatus).tahap, 'Verifikasi Bayar');
// 6. bendahara verifikasi kedua transfer
tf.forEach((r) => k.waStafTagihanTransferPutus('BE', r[0], true, 'ok', 'BANK'));
const st2 = k.waRlStatus(h.kodeStatus);
cek('setelah lunas daftar', [st2.tahap, st2.tagihan.map((x) => x.sisa)], ['Diterima', [0, 1450000]]);
const saldo = lembar['REFERRAL SALDO'].d.slice(1).map((r) => [r[4], r[5]]);
cek('saldo promotor: cashback + selisih', saldo, [['Cashback', 50000], ['Selisih biaya', 50000]]);
cek('WB aktif', lembar['WARGA BELAJAR'].d.slice(1).map((r) => r[19]), ['Aktif']);
cek('notif atur siswa', catatan.some((c) => /NOTIF referral_atur/.test(c)), true);
cek('kwitansi tersedia', st2.pembayaran.length, 2);
// 7. lunasi pendidikan lewat konfirmasi kedua
k.waRlKonfirmasi(h.kodeStatus, { jumlah: 1450000, metode: 'Tunai' });
const det2 = k.waRefTinjau('TA', h.id);
k.waRefKonfirmasiTeruskan('TA', h.id, { idKonfirmasi: det2.konfirmasi[1].id, terima: true });
lembar['TAGIHAN TRANSFER'].d.slice(1).filter((r) => r[9] === 'Menunggu').forEach((r) => k.waStafTagihanTransferPutus('BE', r[0], true, 'ok', 'KAS'));
const saldo2 = lembar['REFERRAL SALDO'].d.slice(1).map((r) => [r[4], r[5]]);
cek('selisih pendidikan masuk', saldo2[2], ['Selisih biaya', 100000]);
cek('tidak dobel saldo', saldo2.length, 3);
// 8. pendaftar muda sebelum September -> tanpa biaya pendidikan (bergantung tanggal hari ini)
console.log('\n' + ok + ' lulus, ' + gagal + ' gagal');
process.exit(gagal ? 1 : 0);
