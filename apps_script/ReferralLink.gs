// ============================================================================
// PENDAFTARAN LEWAT LINK REFERRAL (v1.93.0, beta)
// Setiap promotor (semua pengguna kecuali Dinas Pendidikan) punya kode & link pendaftaran sendiri.
// Alur:
//  1. Calon peserta membuka link promotor (tanpa login), mengisi formulir + berkas (rapor opsional, dianjurkan kelas akhir).
//     Biaya TIDAK ditampilkan kepada pendaftar. Promotor mendapat notifikasi.            TAHAP: Menunggu Promotor
//  2. Promotor memeriksa berkas, mengatur biaya (tidak boleh di bawah biaya resmi), teknis pembayaran
//     (biaya pendaftaran wajib lunas; biaya pendidikan: tanggal rencana bayar), menandatangani, lalu mengirim.
//     Admin, Kepala Sekolah, Bendahara mendapat notifikasi.                               TAHAP: Menunggu Persetujuan
//  3. Admin / KS menyetujui (atau menolak). Disetujui -> peserta dibuat di Data Induk (status Calon), tagihan atas namanya
//     dibuat, pendaftar menerima email + halaman status: Surat Pernyataan Diterima & Rincian Biaya (2 PDF).
//                                                                                          TAHAP: Menunggu Pembayaran
//  4. Pendaftar mengonfirmasi pembayaran (bukti) kepada promotornya -> promotor memeriksa & meneruskan sesuai tagihan
//     -> masuk antrean "Bukti transfer tagihan" (Admin/Bendahara memverifikasi seperti biasa).
//                                                                                          TAHAP: Konfirmasi Bayar / Verifikasi Bayar
//  5. Biaya pendaftaran lunas -> peserta Aktif, saldo promotor = cashback + selisih di atas biaya resmi, kwitansi tersedia
//     di halaman status, Admin diminta mengatur unit, rombel, dan label.                   TAHAP: Diterima
//     Biaya pendidikan lunas -> selisih biaya pendidikan di atas bawaan masuk saldo promotor.
// Biaya pendidikan dikenakan bila (tahun daftar - tahun lahir) > 21, ATAU mendaftar setelah bulan Agustus tahun daftar.
// ============================================================================
var RL = {
  TAB_KODE: 'REFERRAL KODE', HDR_KODE: ['KODE', 'PROMOTOR KUNCI', 'NAMA', 'PERAN', 'DIBUAT'],
  // kolom tambahan di tab REFERRAL DAFTAR (ditambahkan di kanan)
  KOLOM: ['SUMBER', 'KODE PROMOTOR', 'KODE STATUS', 'EMAIL', 'KELAS TUJUAN', 'TAHAP', 'BIAYA DAFTAR', 'BIAYA PENDIDIKAN', 'WAJIB PENDIDIKAN',
    'JADWAL PENDIDIKAN', 'CATATAN PROMOTOR', 'TTD PROMOTOR', 'DITINJAU PADA', 'PUTUSAN OLEH', 'PUTUSAN PADA', 'CATATAN PUTUSAN',
    'ID TAG DAFTAR', 'ID TAG PENDIDIKAN', 'KONFIRMASI', 'DOKUMEN', 'SALDO DIKREDIT'],
  RESMI_DAFTAR: 200000,
  DIDIK: { A: 1000000, B: 1300000, C: 1500000 },
  USIA: 21, BULAN_BATAS: 8,
  JATUH_TEMPO_DAFTAR_HARI: 7,
  MAKS_PER_KODE_JAM: 15, MAKS_GLOBAL_JAM: 80,
  KAT_DIK: 'DIK',
  // v1.93.0: selama tahap beta, link status di e-mail & PDF mengarah ke web beta; ubah ke false saat rilis produksi
  WEB_BETA: false,
  HURUF: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
};
(function() {
  if (typeof RF !== 'undefined' && RF.TAB && RF.TAB.DAFTAR) RL.KOLOM.forEach(function(k) { if (RF.TAB.DAFTAR.indexOf(k) < 0) RF.TAB.DAFTAR.push(k); });
  if (typeof RF !== 'undefined' && RF.BERKAS && !RF.BERKAS.rapor) RF.BERKAS.rapor = 'Rapor terakhir';
  if (typeof API_FLUTTER !== 'undefined' && API_FLUTTER && API_FLUTTER.TAMBAHAN) {
    ['waRlInfo', 'waRlDaftar', 'waRlStatus', 'waRlDokumen', 'waRlKonfirmasi', 'waRlKwitansi',
      'waRefLinkSaya', 'waRefTinjau', 'waRefTinjauKirim', 'waRefTinjauTolak', 'waRefKonfirmasiTeruskan', 'waRefKonfirmasiBukti']
      .forEach(function(f) { API_FLUTTER.TAMBAHAN[f] = true; });
  }
})();

// ---------------- aturan biaya ----------------
function rlAturan_() {
  var a = rfAturan_();
  var didik = a.rlDidik || {};
  return {
    resmiDaftar: Math.round(Number(a.rlResmiDaftar) || RL.RESMI_DAFTAR),
    didik: { A: Math.round(Number(didik.A) || RL.DIDIK.A), B: Math.round(Number(didik.B) || RL.DIDIK.B), C: Math.round(Number(didik.C) || RL.DIDIK.C) },
    cashback: Math.round(Number(a.cashback) || 0),
    rekening: a.rekening || []
  };
}
function rlPaket_(program) {
  var m = /paket\s*([ABC])\b/i.exec(String(program || '')) || /^PKT-([ABC])$/i.exec(String(program || ''));
  return m ? m[1].toUpperCase() : '';
}
// Biaya pendidikan dikenakan? tglDaftar & tglLahir 'yyyy-MM-dd'
function rlWajibDidik_(tglLahir, tglDaftar) {
  var thL = Number(String(tglLahir || '').slice(0, 4)), thD = Number(String(tglDaftar).slice(0, 4)), blD = Number(String(tglDaftar).slice(5, 7));
  var usia = thL ? thD - thL : 0;
  if (usia > RL.USIA) return { wajib: true, alasan: 'Usia ' + usia + ' tahun pada tahun mendaftar (lebih dari ' + RL.USIA + ')' };
  if (blD > RL.BULAN_BATAS) return { wajib: true, alasan: 'Mendaftar setelah bulan Agustus ' + thD };
  return { wajib: false, alasan: 'Usia ' + usia + ' tahun dan mendaftar sebelum September' };
}

// ---------------- kode promotor ----------------
function rlTabKode_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(RL.TAB_KODE);
  if (!sh) {
    sh = ss.insertSheet(RL.TAB_KODE);
    sh.getRange(1, 1, 1, RL.HDR_KODE.length).setValues([RL.HDR_KODE]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, 1000, RL.HDR_KODE.length).setNumberFormat('@');
  }
  return sh;
}
function rlKodeSemua_() {
  var sh = rlTabKode_(), n = sh.getLastRow() - 1, out = [];
  if (n < 1) return out;
  sh.getRange(2, 1, n, RL.HDR_KODE.length).getValues().forEach(function(r) {
    if (sTeks_(r[0]).trim()) out.push({ kode: sTeks_(r[0]).trim().toUpperCase(), kunci: sTeks_(r[1]).trim(), nama: sTeks_(r[2]).trim(), peran: sTeks_(r[3]).trim() });
  });
  return out;
}
function rlKodeUntuk_(a) {
  var ada = rlKodeSemua_().filter(function(k) { return k.kunci === a.kunci; })[0];
  if (ada) return ada.kode;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var semua = rlKodeSemua_(), dipakai = {};
    semua.forEach(function(k) { dipakai[k.kode] = true; if (k.kunci === a.kunci) ada = k; });
    if (ada) return ada.kode;
    var kode = '';
    for (var i = 0; i < 50 && (!kode || dipakai[kode]); i++) {
      kode = '';
      for (var j = 0; j < 6; j++) kode += RL.HURUF.charAt(Math.floor(Math.random() * RL.HURUF.length));
    }
    rlTabKode_().appendRow([kode, a.kunci, a.nama, a.peran, rfWaktu_()]);
    return kode;
  } finally { lock.releaseLock(); }
}
function rlPromotorDariKode_(kode) {
  kode = String(kode || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(kode)) throw new Error('Link pendaftaran tidak valid. Minta link terbaru kepada orang yang merekomendasikan Anda.');
  var k = rlKodeSemua_().filter(function(x) { return x.kode === kode; })[0];
  if (!k) throw new Error('Link pendaftaran tidak dikenal. Minta link terbaru kepada orang yang merekomendasikan Anda.');
  return k;
}
function rlNamaDepan_(n) { return String(n || '').trim().split(/\s+/)[0] || 'promotor'; }

// ---------------- baris pendaftaran ----------------
function rlCariStatus_(kodeStatus) {
  kodeStatus = String(kodeStatus || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{10,24}$/.test(kodeStatus)) throw new Error('Kode pendaftaran tidak valid.');
  var x = rfBaca_('DAFTAR').filter(function(y) { return y['KODE STATUS'] === kodeStatus; })[0];
  if (!x) throw new Error('Kode pendaftaran tidak ditemukan.');
  return x;
}
function rlTahap_(x) { return x['TAHAP'] || ''; }
function rlJson_(s, b) { return rfJson_(s, b); }
function rlTglIndo_(iso) {
  var b = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? Number(m[3]) + ' ' + b[Number(m[2]) - 1] + ' ' + m[1] : String(iso || '');
}
function rlKelasDaftar_() {
  var out = [];
  for (var i = 1; i <= 12; i++) out.push({ kelas: i, paket: i <= 6 ? 'A' : (i <= 9 ? 'B' : 'C'), akhir: i === 6 || i === 9 || i === 12 });
  return out;
}
function rlLinkWeb_(beta) {
  return beta ? 'https://th-ecourse-beta.pages.dev/' : 'https://pkbm-tunasharapan.github.io/elearning-pkbmth/';
}

// ---------------- publik: formulir ----------------
function waRlInfo(kode) {
  var k = rlPromotorDariKode_(kode), program = [];
  try { program = indRef_().program.map(function(x) { return { id: x.id, nama: x.nama }; }); } catch (e) {}
  return { promotor: rlNamaDepan_(k.nama), program: program, kelas: rlKelasDaftar_(), berkasJenis: RF.BERKAS, berkasWajib: RF.WAJIB_BERKAS,
    lembaga: (function() { try { return nilLembaga_().nama || kNamaLembaga_(); } catch (e2) { return 'PKBM Tunas Harapan'; } })() };
}
function kNamaLembaga_() { return 'PKBM Tunas Harapan'; }

// d: data formulir (RF_KOLOM + email + kelasTujuan); berkas: {foto, ijazah, kk, ktp, ttd, rapor}
function waRlDaftar(kode, d, berkas) {
  var k = rlPromotorDariKode_(kode);
  if (hitung_('rlk|' + k.kode, 3600) > RL.MAKS_PER_KODE_JAM || hitung_('rlg', 3600) > RL.MAKS_GLOBAL_JAM) throw new Error('Terlalu banyak pendaftaran dalam satu jam. Coba lagi nanti.');
  d = d || {};
  var o = rfBersihData_(d);
  var email = String(d.email || '').trim().toLowerCase();
  if (!emailValid_(email)) throw new Error('Isi alamat email yang aktif. Pemberitahuan pendaftaran dikirim ke email ini.');
  o.email = email;
  var kelas = parseInt(d.kelasTujuan, 10);
  if (!(kelas >= 1 && kelas <= 12)) throw new Error('Pilih kelas yang dituju.');
  berkas = berkas || {};
  RF.WAJIB_BERKAS.forEach(function(b) { if (!berkas[b]) throw new Error('Unggah ' + RF.BERKAS[b] + '.'); });
  var dobel = rfBaca_('DAFTAR').filter(function(x) { return x['NIK'] === o.nik && rfStatus_(x) !== 'Ditolak' && rlTahap_(x) !== 'Ditolak'; })[0];
  if (dobel) throw new Error('NIK ini sudah terdaftar. Bila ini keliru, hubungi orang yang merekomendasikan Anda.');
  var id = rfId_('DAF-'), simpan = {};
  Object.keys(RF.BERKAS).forEach(function(b) { if (berkas[b]) simpan[b] = rfSimpanBerkas_(berkas[b], id + '_' + b + '_' + o.nama); });
  var kodeStatus = Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase();
  rfTambah_('DAFTAR', {
    'ID': id, 'WAKTU': rfWaktu_(), 'PROMOTOR KUNCI': k.kunci, 'PROMOTOR NAMA': k.nama, 'PROMOTOR PERAN': k.peran, 'PROMOTOR INFO': JSON.stringify({ kode: k.kode, peran: k.peran }),
    'NAMA': o.nama, 'NIK': o.nik, 'PROGRAM': o.program, 'HP': o.hp, 'DATA': JSON.stringify(o), 'BERKAS': JSON.stringify(simpan),
    'STATUS BERKAS': 'Menunggu', 'STATUS BAYAR': 'Belum', 'DIPERBARUI': rfWaktu_(),
    'SUMBER': 'Link', 'KODE PROMOTOR': k.kode, 'KODE STATUS': kodeStatus, 'EMAIL': email, 'KELAS TUJUAN': String(kelas), 'TAHAP': 'Menunggu Promotor'
  });
  try { catat_('Pendaftar', '', o.nama, 'Daftar lewat link referral', id + ' · promotor ' + k.nama, 'OK'); } catch (e) {}
  rfNotif_(k.kunci, 'Pendaftar baru: ' + o.nama, 'Mendaftar lewat link Anda (kelas ' + kelas + '). Periksa berkas dan atur biayanya di menu Referral.');
  return { sukses: true, id: id, kodeStatus: kodeStatus, promotor: rlNamaDepan_(k.nama) };
}

// ---------------- publik: status pendaftar ----------------
function rlTagihanRinci_(x) {
  var out = [], ids = [x['ID TAG DAFTAR'], x['ID TAG PENDIDIKAN']].filter(String);
  if (!ids.length || !x['ID WB'] || x['ID WB'] === '-') return out;
  var w = rlWbObj_(x['ID WB']), pb = keuBayarPeta_();
  if (!w) return out;
  ids.forEach(function(idT) {
    var tag = null;
    try { tag = keuTagCari_(idT); } catch (e) { tag = null; }
    if (!tag) return;
    var r = keuRinci_(tag, [w], pb)[0];
    if (!r) return;
    out.push({ id: tag.id, nama: tag.nama, jumlah: tag.jumlah, dibayar: r.dibayar, keringanan: r.keringanan, sisa: r.sisa, status: r.status, jatuhTempo: tag.jatuhTempo,
      jenis: idT === x['ID TAG DAFTAR'] ? 'daftar' : 'pendidikan' });
  });
  return out;
}
function rlWbObj_(idWb) {
  return keuWbSemua_().filter(function(w) { return w.id === String(idWb); })[0] || null;
}
function waRlStatus(kodeStatus) {
  var x = rlCariStatus_(kodeStatus), tahap = rlTahap_(x), at = rlAturan_();
  var o = { id: x['ID'], nama: x['NAMA'], tahap: tahap, waktu: x['WAKTU'], promotor: rlNamaDepan_(x['PROMOTOR NAMA']), kelas: x['KELAS TUJUAN'], program: x['PROGRAM'],
    catatan: tahap === 'Ditolak' ? (x['CATATAN PUTUSAN'] || x['CATATAN PROMOTOR']) : '' };
  // rincian biaya hanya setelah disetujui
  if (['Menunggu Pembayaran', 'Konfirmasi Bayar', 'Verifikasi Bayar', 'Diterima'].indexOf(tahap) >= 0) {
    o.tagihan = rlTagihanRinci_(x);
    o.rekening = at.rekening;
    o.dokumen = Object.keys(rlJson_(x['DOKUMEN'], {}));
    o.konfirmasi = rlJson_(x['KONFIRMASI'], []).map(function(k) { return { waktu: k.waktu, jumlah: k.jumlah, metode: k.metode, status: k.status, catatan: k.catatanPetugas || '' }; });
    o.bolehKonfirmasi = o.tagihan.some(function(t) { return t.sisa > 0; }) && !rlJson_(x['KONFIRMASI'], []).some(function(k) { return k.status === 'Menunggu Promotor'; });
    // kwitansi: transaksi pemasukan atas tagihan pendaftar ini
    try {
      var ids = [x['ID TAG DAFTAR'], x['ID TAG PENDIDIKAN']].filter(String);
      o.pembayaran = keuSemua_().filter(function(t) { return t.idWb === x['ID WB'] && t.jenis === 'Pemasukan' && ids.indexOf(t.idTagihan) >= 0 && kwBolehCetak_(t); })
        .map(function(t) { return { id: t.id, tanggal: t.tanggal, jumlah: t.jumlah, uraian: t.uraian }; });
    } catch (e) { o.pembayaran = []; }
  }
  return o;
}
function waRlDokumen(kodeStatus, jenis) {
  var x = rlCariStatus_(kodeStatus), dok = rlJson_(x['DOKUMEN'], {});
  if (!dok[jenis]) throw new Error('Dokumen belum tersedia.');
  return rfBerkasB64_(dok[jenis]);
}
function waRlKwitansi(kodeStatus, ids) {
  var x = rlCariStatus_(kodeStatus);
  var tags = [x['ID TAG DAFTAR'], x['ID TAG PENDIDIKAN']].filter(String);
  ids = (Array.isArray(ids) ? ids : [ids]).map(String).filter(String).slice(0, KW.MAKS);
  var semua = {};
  keuSemua_().forEach(function(t) { semua[t.id] = t; });
  var trx = ids.map(function(id) {
    var t = semua[id];
    if (!kwBolehCetak_(t) || t.jenis !== 'Pemasukan' || t.idWb !== x['ID WB'] || tags.indexOf(t.idTagihan) < 0) throw new Error('Kwitansi ini tidak tersedia.');
    return t;
  });
  if (!trx.length) throw new Error('Pilih pembayaran.');
  var no = kwTerbitkan_(trx, null, null), c = kwKonteks_();
  return { kwitansi: trx.map(function(t, i) { return kwIsi_(t, no[i], no[i].ttd, c.kat, c.wb, c.akun, c.lembaga); }), kop: kwKop_() };
}
// d: {jumlah, metode: 'Transfer'|'Tunai', rekening, bukti (dataUrl), catatan}
function waRlKonfirmasi(kodeStatus, d) {
  var x = rlCariStatus_(kodeStatus);
  if (['Menunggu Pembayaran', 'Konfirmasi Bayar', 'Verifikasi Bayar', 'Diterima'].indexOf(rlTahap_(x)) < 0) throw new Error('Pendaftaran belum disetujui.');
  d = d || {};
  var sisa = rlTagihanRinci_(x).reduce(function(t, r) { return t + r.sisa; }, 0);
  if (sisa <= 0) throw new Error('Semua tagihan sudah lunas.');
  var kon = rlJson_(x['KONFIRMASI'], []);
  if (kon.some(function(k) { return k.status === 'Menunggu Promotor'; })) throw new Error('Konfirmasi sebelumnya masih diperiksa promotor.');
  var jml = Math.round(keuAngka_(d.jumlah));
  if (!(jml > 0) || jml > sisa) throw new Error('Jumlah pembayaran 1 s.d. ' + honRp_(sisa) + '.');
  var metode = d.metode === 'Tunai' ? 'Tunai' : 'Transfer';
  var f = '';
  if (metode === 'Transfer') {
    if (!d.bukti) throw new Error('Unggah foto bukti transfer.');
    f = rfSimpanBerkas_(d.bukti, x['ID'] + '_konfirmasi_' + Utilities.formatDate(new Date(), absTz_(), 'yyyyMMdd_HHmmss'));
  }
  kon.push({ id: 'KB-' + absId_().toUpperCase(), waktu: rfWaktu_(), jumlah: jml, metode: metode, rekening: metode === 'Transfer' ? String(d.rekening || '').slice(0, 120) : '', bukti: f,
    catatan: String(d.catatan || '').slice(0, 200), status: 'Menunggu Promotor' });
  rfUbah_('DAFTAR', x._baris, { 'KONFIRMASI': JSON.stringify(kon), 'TAHAP': 'Konfirmasi Bayar', 'DIPERBARUI': rfWaktu_() });
  rfNotif_(x['PROMOTOR KUNCI'], 'Konfirmasi pembayaran: ' + x['NAMA'], honRp_(jml) + ' (' + metode + '). Periksa dan teruskan ke bendahara di menu Referral.');
  return { sukses: true, pesan: 'Konfirmasi terkirim. Promotor Anda akan memeriksa dan meneruskannya ke bendahara.' };
}

// ---------------- promotor ----------------
function waRefLinkSaya(token) {
  var a = rfAkun_(token), kode = rlKodeUntuk_(a), at = rlAturan_();
  return { kode: kode, link: rlLinkWeb_(false) + '?daftar=' + kode, linkBeta: rlLinkWeb_(true) + '?daftar=' + kode, resmiDaftar: at.resmiDaftar, didik: at.didik, cashback: at.cashback };
}
function rlMilikLink_(token, id) {
  var m = rfMilik_(token, id);
  if (m.x['SUMBER'] !== 'Link') throw new Error('Pendaftaran ini bukan dari link referral.');
  return m;
}
function rlRingkas_(x, lengkap) {
  var d = rlJson_(x['DATA'], {});
  var o = { id: x['ID'], waktu: x['WAKTU'], nama: x['NAMA'], program: x['PROGRAM'], kelas: x['KELAS TUJUAN'], tahap: rlTahap_(x), promotor: x['PROMOTOR NAMA'],
    biayaDaftar: Number(x['BIAYA DAFTAR']) || 0, biayaPendidikan: Number(x['BIAYA PENDIDIKAN']) || 0, wajibPendidikan: x['WAJIB PENDIDIKAN'] === 'Ya',
    jadwalPendidikan: x['JADWAL PENDIDIKAN'], catatanPromotor: x['CATATAN PROMOTOR'], catatanPutusan: x['CATATAN PUTUSAN'], putusanOleh: x['PUTUSAN OLEH'],
    konfirmasiMenunggu: rlJson_(x['KONFIRMASI'], []).filter(function(k) { return k.status === 'Menunggu Promotor'; }).length, idWb: x['ID WB'] || '' };
  if (lengkap) {
    o.data = d; o.berkas = Object.keys(rlJson_(x['BERKAS'], {})); o.email = x['EMAIL']; o.hp = x['HP'];
    o.konfirmasi = rlJson_(x['KONFIRMASI'], []).map(function(k) { var c = JSON.parse(JSON.stringify(k)); c.adaBukti = !!k.bukti; delete c.bukti; return c; });
    o.tagihan = rlTagihanRinci_(x);
  }
  return o;
}
// Tinjauan promotor: data lengkap + usulan biaya bawaan.
function waRefTinjau(token, id) {
  var m = rlMilikLink_(token, id), x = m.x, at = rlAturan_(), d = rlJson_(x['DATA'], {});
  var paket = rlPaket_(x['PROGRAM']) || (function() { try { return rlPaket_((indRef_().program.filter(function(p) { return p.id === x['PROGRAM']; })[0] || {}).nama); } catch (e) { return ''; } })();
  var w = rlWajibDidik_(d.tanggalLahir, String(x['WAKTU']).slice(0, 10));
  var o = rlRingkas_(x, true);
  o.paket = paket;
  o.bawaan = { daftar: at.resmiDaftar, pendidikan: w.wajib ? (at.didik[paket] || 0) : 0, wajibPendidikan: w.wajib, alasan: w.alasan, cashback: at.cashback };
  o.kelasAkhir = ['6', '9', '12'].indexOf(String(x['KELAS TUJUAN'])) >= 0;
  return o;
}
// d: {biayaDaftar, biayaPendidikan, jadwalPendidikan (yyyy-mm-dd), catatan, ttd (dataUrl PNG)}
function waRefTinjauKirim(token, id, d) {
  var m = rlMilikLink_(token, id), x = m.x, at = rlAturan_();
  if (rlTahap_(x) !== 'Menunggu Promotor') throw new Error('Pendaftaran ini sudah ' + rlTahap_(x) + '.');
  d = d || {};
  var info = waRefTinjau(token, id);
  var bd = Math.round(keuAngka_(d.biayaDaftar));
  if (bd < at.resmiDaftar) throw new Error('Biaya pendaftaran tidak boleh di bawah biaya resmi ' + honRp_(at.resmiDaftar) + '.');
  var bp = 0, jadwal = '';
  if (info.bawaan.wajibPendidikan) {
    bp = Math.round(keuAngka_(d.biayaPendidikan));
    if (bp < info.bawaan.pendidikan) throw new Error('Biaya pendidikan tidak boleh di bawah bawaan ' + honRp_(info.bawaan.pendidikan) + ' (Paket ' + (info.paket || '?') + ').');
    jadwal = absTglSah_(d.jadwalPendidikan);
    if (jadwal < absHariIni_()) throw new Error('Tanggal rencana bayar biaya pendidikan tidak boleh sebelum hari ini.');
  }
  if (!d.ttd) throw new Error('Tanda tangani tinjauan Anda terlebih dahulu.');
  var ttd = rfSimpanBerkas_(d.ttd, x['ID'] + '_ttd_promotor');
  rfUbah_('DAFTAR', x._baris, { 'BIAYA DAFTAR': bd, 'BIAYA PENDIDIKAN': bp, 'WAJIB PENDIDIKAN': info.bawaan.wajibPendidikan ? 'Ya' : 'Tidak', 'JADWAL PENDIDIKAN': jadwal,
    'CATATAN PROMOTOR': String(d.catatan || '').slice(0, 300), 'TTD PROMOTOR': ttd, 'DITINJAU PADA': rfWaktu_(), 'STATUS BERKAS': 'Terverifikasi',
    'VERIF BERKAS OLEH': x['PROMOTOR NAMA'] + ' (promotor)', 'VERIF BERKAS PADA': rfWaktu_(), 'TAHAP': 'Menunggu Persetujuan', 'DIPERBARUI': rfWaktu_() });
  var lebih = (bd > at.resmiDaftar ? ' · daftar di atas resmi' : '') + (bp > info.bawaan.pendidikan ? ' · pendidikan di atas bawaan' : '');
  npKirim_('referral_tinjau', { judul: 'Pendaftaran menunggu persetujuan: ' + x['NAMA'], isi: 'Promotor ' + x['PROMOTOR NAMA'] + ' · daftar ' + honRp_(bd) + (bp ? ' · pendidikan ' + honRp_(bp) : '') + lebih,
    aksi: 'referral_admin', ref: 'rltinjau|' + x['ID'] });
  try { catat_(m.a.peran, '', m.a.nama, 'Tinjau pendaftaran referral', x['ID'] + ' ' + x['NAMA'] + ' daftar ' + bd + ' pendidikan ' + bp, 'OK'); } catch (e) {}
  return { sukses: true };
}
function waRefTinjauTolak(token, id, alasan) {
  var m = rlMilikLink_(token, id), x = m.x;
  if (rlTahap_(x) !== 'Menunggu Promotor') throw new Error('Pendaftaran ini sudah ' + rlTahap_(x) + '.');
  alasan = String(alasan || '').trim();
  if (alasan.length < 5) throw new Error('Tulis alasan (minimal 5 huruf).');
  rfUbah_('DAFTAR', x._baris, { 'TAHAP': 'Ditolak', 'STATUS BERKAS': 'Ditolak', 'CATATAN PROMOTOR': alasan.slice(0, 300), 'DIPERBARUI': rfWaktu_() });
  rlEmail_(x, 'Pendaftaran belum dapat diproses', 'Pendaftaran Anda belum dapat diproses: ' + alasan + '. Silakan hubungi orang yang merekomendasikan Anda.', []);
  return { sukses: true };
}
function waRefKonfirmasiBukti(token, id, idKonfirmasi) {
  var m = rlMilikLink_(token, id), k = rlJson_(m.x['KONFIRMASI'], []).filter(function(y) { return y.id === String(idKonfirmasi); })[0];
  if (!k || !k.bukti) throw new Error('Bukti tidak ada.');
  return rfBerkasB64_(k.bukti);
}
// Promotor memeriksa konfirmasi pendaftar: teruskan (dibagi ke tagihan) atau tolak.
// d: {idKonfirmasi, terima: bool, alasan, rincian: [{idTagihan, jumlah}]}
function waRefKonfirmasiTeruskan(token, id, d) {
  var m = rlMilikLink_(token, id), x = m.x;
  d = d || {};
  var kon = rlJson_(x['KONFIRMASI'], []), k = kon.filter(function(y) { return y.id === String(d.idKonfirmasi); })[0];
  if (!k || k.status !== 'Menunggu Promotor') throw new Error('Konfirmasi tidak ditemukan atau sudah diproses.');
  if (!d.terima) {
    var al = String(d.alasan || '').trim();
    if (al.length < 5) throw new Error('Tulis alasan (minimal 5 huruf).');
    k.status = 'Ditolak promotor'; k.catatanPetugas = al.slice(0, 200);
    rfUbah_('DAFTAR', x._baris, { 'KONFIRMASI': JSON.stringify(kon), 'TAHAP': 'Menunggu Pembayaran', 'DIPERBARUI': rfWaktu_() });
    rlEmail_(x, 'Konfirmasi pembayaran perlu diperbaiki', 'Konfirmasi pembayaran ' + honRp_(k.jumlah) + ' belum dapat diteruskan: ' + al + '.', []);
    return { sukses: true };
  }
  var tag = rlTagihanRinci_(x), rinci = Array.isArray(d.rincian) ? d.rincian : [];
  // bawaan: lunasi pendaftaran dulu, sisanya ke biaya pendidikan
  if (!rinci.length) {
    var sisaK = k.jumlah;
    tag.sort(function(a, b) { return a.jenis === 'daftar' ? -1 : (b.jenis === 'daftar' ? 1 : 0); }).forEach(function(t) {
      var j = Math.min(sisaK, t.sisa); if (j > 0) { rinci.push({ idTagihan: t.id, jumlah: j }); sisaK -= j; }
    });
  }
  var total = 0;
  rinci = rinci.map(function(r) {
    var t = tag.filter(function(z) { return z.id === String(r.idTagihan); })[0];
    var j = Math.round(keuAngka_(r.jumlah));
    if (!t) throw new Error('Tagihan tidak dikenal.');
    if (!(j > 0) || j > t.sisa) throw new Error('Jumlah untuk ' + t.nama + ' 1 s.d. ' + honRp_(t.sisa) + '.');
    total += j;
    return { t: t, jumlah: j };
  });
  if (!rinci.length) throw new Error('Tidak ada tagihan yang bisa dibayar.');
  if (total !== k.jumlah) throw new Error('Pembagian (' + honRp_(total) + ') harus sama dengan jumlah konfirmasi (' + honRp_(k.jumlah) + ').');
  var w = rlWbObj_(x['ID WB']);
  if (!w) throw new Error('Data peserta belum ada di Data Induk.');
  var tf = absBaca_(KS.TAB_TF, KS.HDR_TF), idTf = [];
  var rekTujuan = k.metode === 'Tunai' ? 'Tunai (via promotor ' + x['PROMOTOR NAMA'] + ')' : (k.rekening || ((rlAturan_().rekening || [])[0] ? [rlAturan_().rekening[0].bank, rlAturan_().rekening[0].nomor].join(' · ') : 'Transfer'));
  rinci.forEach(function(r) {
    var idT = 'TF-' + absId_().toUpperCase();
    tf.sh.appendRow(absBaris_(tf, { 'ID': idT, 'WAKTU': rfWaktu_(), 'TAGIHAN': r.t.id, 'ID WB': w.id, 'NAMA': w.nama, 'JUMLAH': r.jumlah, 'REKENING TUJUAN': rekTujuan,
      'BUKTI': k.bukti || '', 'CATATAN SISWA': ('Pendaftaran referral ' + x['ID'] + ' · diteruskan promotor ' + x['PROMOTOR NAMA'] + (k.catatan ? ' · ' + k.catatan : '')).slice(0, 200), 'STATUS': 'Menunggu' }));
    idTf.push(idT);
  });
  k.status = 'Diteruskan'; k.teruskan = idTf; k.diteruskanPada = rfWaktu_();
  rfUbah_('DAFTAR', x._baris, { 'KONFIRMASI': JSON.stringify(kon), 'TAHAP': 'Verifikasi Bayar', 'DIPERBARUI': rfWaktu_() });
  npKirim_('transfer_masuk', { judul: 'Pembayaran pendaftar baru ' + honRp_(k.jumlah), isi: w.nama + ' (referral ' + x['PROMOTOR NAMA'] + ', ' + k.metode + '). Periksa di Tagihan → Bukti transfer.', aksi: 'transfer', ref: idTf[0] });
  try { catat_(m.a.peran, '', m.a.nama, 'Teruskan pembayaran pendaftar', x['ID'] + ' ' + k.jumlah, 'OK'); } catch (e) {}
  return { sukses: true };
}

// ---------------- petugas: daftar & persetujuan ----------------
// q: {tahap: '' | 'aktif' | nama tahap}
function waStafRefVerifLinkDaftar(token, q) {
  var r = rfPetugas_(token);
  if (!r.lihat) throw new Error('Kelola pendaftaran referral untuk Admin, Kepala Sekolah, Bendahara, dan Front Office.');
  q = q || {};
  var aktif = ['Menunggu Promotor', 'Menunggu Persetujuan', 'Menunggu Pembayaran', 'Konfirmasi Bayar', 'Verifikasi Bayar'];
  var data = rfBaca_('DAFTAR').filter(function(x) { return x['SUMBER'] === 'Link'; }).filter(function(x) {
    return !q.tahap || (q.tahap === 'aktif' ? aktif.indexOf(rlTahap_(x)) >= 0 : rlTahap_(x) === q.tahap);
  }).reverse().slice(0, 300).map(function(x) { return rlRingkas_(x, false); });
  var at = rlAturan_();
  return { data: data, bolehPutus: r.admin || r.q.ks, resmiDaftar: at.resmiDaftar, didik: at.didik };
}
function waStafRefVerifLinkDetail(token, id) {
  var r = rfPetugas_(token);
  if (!r.lihat) throw new Error('Tidak ada akses.');
  var x = rfCari_(id);
  if (x['SUMBER'] !== 'Link') throw new Error('Bukan pendaftaran lewat link.');
  var o = rlRingkas_(x, true), at = rlAturan_(), d = rlJson_(x['DATA'], {});
  var w = rlWajibDidik_(d.tanggalLahir, String(x['WAKTU']).slice(0, 10)), paket = rlPaket_(x['PROGRAM']);
  o.bawaan = { daftar: at.resmiDaftar, pendidikan: w.wajib ? (at.didik[paket] || 0) : 0, alasan: w.alasan };
  o.bolehPutus = (r.admin || r.q.ks) && rlTahap_(x) === 'Menunggu Persetujuan';
  return o;
}
function waStafRefVerifLinkBerkas(token, id, jenis) {
  var r = rfPetugas_(token);
  if (!r.lihat) throw new Error('Tidak ada akses.');
  var x = rfCari_(id);
  if (jenis === 'ttdPromotor') return rfBerkasB64_(x['TTD PROMOTOR']);
  return rfBerkasB64_(rlJson_(x['BERKAS'], {})[jenis]);
}
// Admin / KS: setuju -> Data Induk (Calon), tagihan, dokumen, email. Tolak -> email ke pendaftar.
function waStafRefVerifLinkPutus(token, id, setuju, catatan) {
  var r = rfPetugas_(token);
  if (!(r.admin || r.q.ks)) throw new Error('Persetujuan pendaftaran hanya oleh Admin atau Kepala Sekolah.');
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var x = rfCari_(id);
    if (x['SUMBER'] !== 'Link') throw new Error('Bukan pendaftaran lewat link.');
    if (rlTahap_(x) !== 'Menunggu Persetujuan') throw new Error('Pendaftaran ini sudah ' + rlTahap_(x) + '.');
    catatan = String(catatan || '').trim().slice(0, 300);
    if (!setuju) {
      if (catatan.length < 5) throw new Error('Tulis alasan penolakan (minimal 5 huruf).');
      rfUbah_('DAFTAR', x._baris, { 'TAHAP': 'Ditolak', 'STATUS BERKAS': 'Ditolak', 'PUTUSAN OLEH': r.p.nama, 'PUTUSAN PADA': rfWaktu_(), 'CATATAN PUTUSAN': catatan, 'DIPERBARUI': rfWaktu_() });
      rfNotif_(x['PROMOTOR KUNCI'], 'Pendaftaran ditolak: ' + x['NAMA'], catatan);
      rlEmail_(x, 'Pendaftaran tidak dapat diterima', 'Mohon maaf, pendaftaran Anda tidak dapat diterima: ' + catatan + '.', []);
      catat_(r.p.peran, '-', r.p.nama, 'Tolak pendaftaran referral', x['ID'] + ' ' + x['NAMA'], 'OK');
      return { sukses: true };
    }
    var d = rlJson_(x['DATA'], {});
    // 1. Data Induk (status Calon sampai biaya pendaftaran lunas)
    var idWb = 'WB-' + absId_().toUpperCase();
    var t = absBaca_('WARGA BELAJAR');
    var alamat = [d.alamat, d.rt ? 'RT ' + d.rt : '', d.rw ? 'RW ' + d.rw : '', d.dusun, d.kelurahan, d.kecamatan, d.kodePos].filter(String).join(', ');
    t.sh.appendRow(absBaris_(t, {
      'ID WB': idWb, 'NAMA WB': d.nama, 'NIK': d.nik, 'NISN': d.nisn, 'JENIS KELAMIN': d.jk, 'TEMPAT LAHIR': d.tempatLahir, 'TANGGAL LAHIR': d.tanggalLahir,
      'AGAMA': d.agama, 'ALAMAT': alamat, 'NO HP': d.hp, 'HP': d.hp, 'EMAIL': d.email, 'NAMA AYAH': d.ayahNama, 'NAMA IBU': d.ibuNama, 'NAMA WALI': d.waliNama,
      'NO KK': d.noKk, 'SEKOLAH ASAL': d.sekolahAsal, 'PROGRAM': d.program, 'STATUS': 'Calon',
      'KETERANGAN': 'Pendaftaran referral ' + x['ID'] + ' (promotor ' + x['PROMOTOR NAMA'] + ', kelas tujuan ' + x['KELAS TUJUAN'] + ')'
    }));
    try { if (typeof indSegarkan_ === 'function') indSegarkan_(); } catch (e0) {}
    try { absLupakan_('WARGA BELAJAR'); } catch (eL) {}   // baris baru harus terbaca saat menyusun rincian biaya
    // 2. Tagihan atas nama peserta
    rfKategori_(RF.KAT_DAF, 'Pendaftaran', 'Pemasukan');
    rfKategori_(RL.KAT_DIK, 'Biaya Pendidikan', 'Pemasukan');
    var tt = absBaca_(KEU.TAB_TAG, KEU.HDR_TAG), tahun = absSim_().tahun;
    var jtDaftar = Utilities.formatDate(new Date(Date.now() + RL.JATUH_TEMPO_DAFTAR_HARI * 86400000), absTz_(), 'yyyy-MM-dd');
    var idTagD = 'TAG-' + absId_().toUpperCase();
    tt.sh.appendRow(absBaris_(tt, { 'ID TAGIHAN': idTagD, 'NAMA': 'Biaya Pendaftaran (' + x['ID'] + ')', 'KATEGORI': RF.KAT_DAF, 'JUMLAH': Number(x['BIAYA DAFTAR']),
      'SASARAN': 'Siswa', 'NILAI SASARAN': idWb, 'JATUH TEMPO': jtDaftar, 'KETERANGAN': 'Pendaftaran referral ' + x['ID'] + ' · wajib lunas', 'TAHUN PELAJARAN': tahun,
      'AKTIF': true, 'DIBUAT OLEH': 'Sistem (pendaftaran ' + x['ID'] + ')', 'DIBUAT PADA': absWaktu_() }));
    var idTagP = '';
    if (Number(x['BIAYA PENDIDIKAN']) > 0) {
      idTagP = 'TAG-' + absId_().toUpperCase();
      tt.sh.appendRow(absBaris_(tt, { 'ID TAGIHAN': idTagP, 'NAMA': 'Biaya Pendidikan (' + x['ID'] + ')', 'KATEGORI': RL.KAT_DIK, 'JUMLAH': Number(x['BIAYA PENDIDIKAN']),
        'SASARAN': 'Siswa', 'NILAI SASARAN': idWb, 'JATUH TEMPO': x['JADWAL PENDIDIKAN'] || '', 'KETERANGAN': 'Pendaftaran referral ' + x['ID'] + ' · rencana bayar ' + (x['JADWAL PENDIDIKAN'] || '-'),
        'TAHUN PELAJARAN': tahun, 'AKTIF': true, 'DIBUAT OLEH': 'Sistem (pendaftaran ' + x['ID'] + ')', 'DIBUAT PADA': absWaktu_() }));
    }
    rfUbah_('DAFTAR', x._baris, { 'ID WB': idWb, 'ID TAG DAFTAR': idTagD, 'ID TAG PENDIDIKAN': idTagP, 'TAHAP': 'Menunggu Pembayaran', 'PUTUSAN OLEH': r.p.nama,
      'PUTUSAN PADA': rfWaktu_(), 'CATATAN PUTUSAN': catatan, 'DIPERBARUI': rfWaktu_() });
    // 3. Dokumen + email
    x = rfCari_(id);
    var dok = {}, lampiran = [];
    try {
      var b1 = rlPdf_(rlHtmlSuratDiterima_(x, r.p), 'Surat_Pernyataan_Diterima_' + x['ID']);
      var b2 = rlPdf_(rlHtmlRincianBiaya_(x), 'Rincian_Biaya_' + x['ID']);
      dok.diterima = rfFolder_().createFile(b1).getId();
      dok.biaya = rfFolder_().createFile(b2).getId();
      lampiran = [b1, b2];
      rfUbah_('DAFTAR', x._baris, { 'DOKUMEN': JSON.stringify(dok) });
    } catch (eD) { try { catat_('Sistem', '-', 'Referral', 'Gagal membuat dokumen pendaftaran', x['ID'] + ': ' + eD.message, 'GAGAL'); } catch (e9) {} }
    rlEmail_(x, 'Pendaftaran Anda DITERIMA', 'Selamat, pendaftaran Anda di ' + rlLembaga_() + ' telah disetujui. Terlampir Surat Pernyataan Diterima dan Rincian Biaya. ' +
      'Biaya pendaftaran wajib dibayar paling lambat ' + rlTglIndo_(jtDaftar) + '. Setelah membayar, lakukan konfirmasi pembayaran lewat halaman status pendaftaran Anda.', lampiran);
    rfNotif_(x['PROMOTOR KUNCI'], 'Pendaftaran disetujui: ' + x['NAMA'], 'Pendaftar sudah menerima surat diterima dan rincian biaya. Pantau konfirmasi pembayarannya di menu Referral.');
    catat_(r.p.peran, '-', r.p.nama, 'Setujui pendaftaran referral', x['ID'] + ' ' + x['NAMA'] + ' -> ' + idWb, 'OK');
    return { sukses: true, idWb: idWb };
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} lock.releaseLock(); }
}

// ---------------- setelah pembayaran tagihan (dipanggil dari verifikasi transfer / catat bayar / online) ----------------
function rlSetelahBayar_(idTagihan, idWb) {
  try {
    idTagihan = String(idTagihan || ''); idWb = String(idWb || '');
    if (!idTagihan || !idWb) return;
    var x = rfBaca_('DAFTAR').filter(function(y) { return y['SUMBER'] === 'Link' && y['ID WB'] === idWb && (y['ID TAG DAFTAR'] === idTagihan || y['ID TAG PENDIDIKAN'] === idTagihan); })[0];
    if (!x) return;
    var tag = rlTagihanRinci_(x), kred = rlJson_(x['SALDO DIKREDIT'], {}), at = rlAturan_(), d = rlJson_(x['DATA'], {});
    var daftar = tag.filter(function(t) { return t.jenis === 'daftar'; })[0], didik = tag.filter(function(t) { return t.jenis === 'pendidikan'; })[0];
    var ubah = {};
    // konfirmasi yang diteruskan dan sudah diverifikasi semua -> tandai selesai
    var kon = rlJson_(x['KONFIRMASI'], []), adaTf = false;
    try {
      var tfPeta = {};
      ksTfBaca_().data.forEach(function(z) { tfPeta[z.id] = z.status; });
      kon.forEach(function(k) {
        if (k.status !== 'Diteruskan' || !k.teruskan) return;
        var st = k.teruskan.map(function(i) { return tfPeta[i]; });
        if (st.every(function(s) { return s === 'Diterima'; })) k.status = 'Diterima';
        else if (st.some(function(s) { return s === 'Ditolak'; })) k.status = 'Ditolak petugas';
        else adaTf = true;
      });
      ubah['KONFIRMASI'] = JSON.stringify(kon);
    } catch (eK) {}
    if (daftar && daftar.sisa <= 0 && !kred.daftar) {
      var selisih = Math.max(0, (Number(x['BIAYA DAFTAR']) || 0) - at.resmiDaftar);
      if (at.cashback > 0) rfTambah_('SALDO', { 'ID': absId_(), 'WAKTU': rfWaktu_(), 'PROMOTOR KUNCI': x['PROMOTOR KUNCI'], 'PROMOTOR NAMA': x['PROMOTOR NAMA'], 'JENIS': 'Cashback',
        'JUMLAH': at.cashback, 'REF': x['ID'], 'KETERANGAN': 'Cashback pendaftaran ' + x['NAMA'] });
      if (selisih > 0) rfTambah_('SALDO', { 'ID': absId_(), 'WAKTU': rfWaktu_(), 'PROMOTOR KUNCI': x['PROMOTOR KUNCI'], 'PROMOTOR NAMA': x['PROMOTOR NAMA'], 'JENIS': 'Selisih biaya',
        'JUMLAH': selisih, 'REF': x['ID'], 'KETERANGAN': 'Selisih biaya pendaftaran ' + x['NAMA'] + ' (di atas resmi ' + honRp_(at.resmiDaftar) + ')' });
      kred.daftar = rfWaktu_();
      ubah['CASHBACK'] = at.cashback + selisih;
      ubah['STATUS BAYAR'] = 'Lunas'; ubah['JUMLAH BAYAR'] = daftar.dibayar; ubah['TAHAP'] = 'Diterima';
      rlWbStatus_(idWb, 'Aktif');
      rfNotif_(x['PROMOTOR KUNCI'], 'Saldo bertambah ' + honRp_(at.cashback + selisih), 'Biaya pendaftaran ' + x['NAMA'] + ' lunas. Cashback ' + honRp_(at.cashback) + (selisih ? ' + selisih ' + honRp_(selisih) : '') + '.');
      npKirim_('referral_atur', { judul: 'Atur siswa baru: ' + x['NAMA'], isi: 'Biaya pendaftaran lunas (kelas tujuan ' + x['KELAS TUJUAN'] + ', ' + x['PROGRAM'] + '). Atur unit, pemetaan rombel, dan label layanannya.',
        aksi: 'data_induk', ref: 'rlatur|' + x['ID'] });
      rlEmail_(x, 'Pembayaran pendaftaran diterima', 'Pembayaran biaya pendaftaran Anda telah diterima. Kwitansi dapat diunduh di halaman status pendaftaran. ' +
        'Petugas akan segera mengatur kelas Anda dan memberi tahu cara masuk ke aplikasi.', []);
    }
    if (didik && didik.sisa <= 0 && !kred.pendidikan) {
      var paket = rlPaket_(x['PROGRAM']), bawaan = at.didik[paket] || 0;
      var selP = Math.max(0, (Number(x['BIAYA PENDIDIKAN']) || 0) - bawaan);
      if (selP > 0) rfTambah_('SALDO', { 'ID': absId_(), 'WAKTU': rfWaktu_(), 'PROMOTOR KUNCI': x['PROMOTOR KUNCI'], 'PROMOTOR NAMA': x['PROMOTOR NAMA'], 'JENIS': 'Selisih biaya',
        'JUMLAH': selP, 'REF': x['ID'], 'KETERANGAN': 'Selisih biaya pendidikan ' + x['NAMA'] + ' (di atas bawaan ' + honRp_(bawaan) + ')' });
      kred.pendidikan = rfWaktu_();
      if (selP > 0) rfNotif_(x['PROMOTOR KUNCI'], 'Saldo bertambah ' + honRp_(selP), 'Biaya pendidikan ' + x['NAMA'] + ' lunas.');
    }
    if (!kred.daftar && !adaTf && rlTahap_(x) === 'Verifikasi Bayar') ubah['TAHAP'] = 'Menunggu Pembayaran';
    ubah['SALDO DIKREDIT'] = JSON.stringify(kred);
    ubah['DIPERBARUI'] = rfWaktu_();
    rfUbah_('DAFTAR', x._baris, ubah);
  } catch (e) {
    try { catat_('Sistem', '-', 'Referral', 'Galat setelah bayar pendaftaran', String(e && e.message || e).slice(0, 200), 'GAGAL'); } catch (e2) {}
  }
}
// Transfer ditolak petugas: kembalikan tahap agar pendaftar dapat mengonfirmasi ulang.
function rlSetelahTolak_(idTf) {
  try {
    var x = rfBaca_('DAFTAR').filter(function(y) { return y['SUMBER'] === 'Link' && String(y['KONFIRMASI']).indexOf(String(idTf)) >= 0; })[0];
    if (!x) return;
    var kon = rlJson_(x['KONFIRMASI'], []);
    kon.forEach(function(k) { if (k.teruskan && k.teruskan.indexOf(String(idTf)) >= 0) k.status = 'Ditolak petugas'; });
    rfUbah_('DAFTAR', x._baris, { 'KONFIRMASI': JSON.stringify(kon), 'TAHAP': x['STATUS BAYAR'] === 'Lunas' ? 'Diterima' : 'Menunggu Pembayaran', 'DIPERBARUI': rfWaktu_() });
    rfNotif_(x['PROMOTOR KUNCI'], 'Pembayaran pendaftar ditolak petugas: ' + x['NAMA'], 'Minta pendaftar mengirim ulang konfirmasi pembayaran.');
  } catch (e) {}
}
function rlWbStatus_(idWb, status) {
  var t = absBaca_('WARGA BELAJAR'), c = absCol_(t, 'STATUS');
  for (var i = 1; i < t.v.length; i++) {
    if (sTeks_(absNilai_(t, t.v[i], 'ID WB')).trim() === idWb) { if (c >= 0) t.sh.getRange(i + 1, c + 1).setValue(status); break; }
  }
  try { absLupakan_('WARGA BELAJAR'); } catch (eL) {}
  try { if (typeof indSegarkan_ === 'function') indSegarkan_(); } catch (e) {}
}

// ---------------- email & dokumen ----------------
function rlLembaga_() { try { return kwKop_().nama || 'PKBM Tunas Harapan'; } catch (e) { return 'PKBM Tunas Harapan'; } }
function rlLinkStatus_(x) { return rlLinkWeb_(RL.WEB_BETA) + '?pendaftaran=' + x['KODE STATUS']; }
function rlEmail_(x, judul, isi, lampiran) {
  var email = x['EMAIL'];
  if (!email || !emailValid_(email)) return;
  try {
    var esc = function(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222"><p>Yth. ' + esc(x['NAMA']) + ',</p><p>' + esc(isi) + '</p>' +
      '<p>Kode pendaftaran: <b>' + esc(x['ID']) + '</b><br>Halaman status pendaftaran: <a href="' + rlLinkStatus_(x) + '">' + rlLinkStatus_(x) + '</a></p>' +
      '<p>Hormat kami,<br>' + esc(rlLembaga_()) + '</p></div>';
    var o = { name: rlLembaga_(), htmlBody: html };
    if (lampiran && lampiran.length) o.attachments = lampiran;
    MailApp.sendEmail(email, judul + ' - ' + rlLembaga_(), isi + '\n\nHalaman status: ' + rlLinkStatus_(x), o);
  } catch (e) {
    try { catat_('Sistem', '-', 'Referral', 'Email pendaftar gagal', x['ID'] + ': ' + String(e && e.message || e).slice(0, 150), 'GAGAL'); } catch (e2) {}
  }
}
function rlPdf_(html, nama) {
  return Utilities.newBlob(html, 'text/html', nama + '.html').getAs('application/pdf').setName(nama + '.pdf');
}
function rlKopHtml_() {
  var k = {};
  try { k = kwKop_(); } catch (e) {}
  var esc = function(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var logo = k.logo ? '<img src="data:image/png;base64,' + k.logo + '" style="height:70px;float:left;margin-right:10px">' : '';
  return '<div style="text-align:center;border-bottom:3px double #111;padding-bottom:6px;margin-bottom:12px">' + logo +
    (k.yayasan ? '<div style="font-size:11pt;font-weight:bold">' + esc(String(k.yayasan).toUpperCase()) + '</div>' : '') +
    '<div style="font-size:16pt;font-weight:bold">' + esc(String(k.nama || 'PKBM').toUpperCase()) + '</div>' +
    (k.baris || []).map(function(b) { return '<div style="font-size:8.5pt">' + esc(b) + '</div>'; }).join('') + '<div style="clear:both"></div></div>';
}
function rlCss_() { return '<style>body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#111}table{border-collapse:collapse;width:100%}td,th{padding:4px 6px;vertical-align:top}' +
  '.b td,.b th{border:1px solid #555}.r{text-align:right}h2{text-align:center;font-size:13pt;margin:8px 0}</style>'; }
function rlHtmlSuratDiterima_(x, oleh) {
  var d = rlJson_(x['DATA'], {}), k = {};
  try { k = kwKop_(); } catch (e) {}
  var esc = function(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var baris = function(a, b) { return '<tr><td style="width:35%">' + a + '</td><td>: ' + esc(b) + '</td></tr>'; };
  return '<html><head><meta charset="utf-8">' + rlCss_() + '</head><body>' + rlKopHtml_() +
    '<h2>SURAT PERNYATAAN DITERIMA<br><span style="font-size:10pt;font-weight:normal">Nomor: ' + esc(x['ID']) + '</span></h2>' +
    '<p>Yang bertanda tangan di bawah ini, Kepala ' + esc(k.nama || 'PKBM') + ', menyatakan bahwa:</p><table>' +
    baris('Nama lengkap', d.nama) + baris('NIK', d.nik) + baris('Tempat, tanggal lahir', d.tempatLahir + ', ' + rlTglIndo_(d.tanggalLahir)) +
    baris('Program', x['PROGRAM']) + baris('Kelas yang dituju', x['KELAS TUJUAN']) + baris('Alamat', d.alamat) + '</table>' +
    '<p>telah <b>DITERIMA</b> sebagai peserta didik ' + esc(k.nama || 'PKBM') + '. Penempatan kelas dan rombongan belajar ditetapkan setelah biaya pendaftaran dilunasi, ' +
    'sesuai rincian biaya yang diterbitkan bersama surat ini.</p><p>Demikian surat pernyataan ini dibuat untuk dipergunakan sebagaimana mestinya.</p>' +
    '<table style="margin-top:24px"><tr><td style="width:50%"></td><td style="text-align:center">' + esc(k.kota ? k.kota + ', ' : '') + rlTglIndo_(absHariIni_()) +
    '<br>Kepala ' + esc(k.nama || 'PKBM') + '<br><br><br><br><b><u>' + esc(k.kepala || '..............................') + '</u></b>' +
    '<div style="font-size:8pt;color:#555">Disetujui melalui sistem oleh ' + esc(oleh.nama) + ' (' + esc(oleh.peran) + ')</div></td></tr></table></body></html>';
}
function rlHtmlRincianBiaya_(x) {
  var at = rlAturan_(), tag = rlTagihanRinci_(x), k = {};
  try { k = kwKop_(); } catch (e) {}
  var esc = function(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var total = 0;
  var rows = tag.map(function(t, i) {
    total += t.jumlah;
    return '<tr><td style="text-align:center">' + (i + 1) + '</td><td>' + esc(t.jenis === 'daftar' ? 'Biaya Pendaftaran (wajib lunas)' : 'Biaya Pendidikan') + '</td><td>' +
      esc(t.jenis === 'daftar' ? 'Paling lambat ' + rlTglIndo_(t.jatuhTempo) : 'Rencana bayar ' + rlTglIndo_(t.jatuhTempo)) + '</td><td class="r">' + honRp_(t.jumlah) + '</td></tr>';
  }).join('');
  var rek = (at.rekening || []).map(function(r) { return '<li>' + esc(r.bank) + ' · <b>' + esc(r.nomor) + '</b> · a.n. ' + esc(r.atasNama) + '</li>'; }).join('');
  var ttd = '';
  try { if (x['TTD PROMOTOR']) { var bl = DriveApp.getFileById(x['TTD PROMOTOR']).getBlob(); ttd = '<img src="data:' + bl.getContentType() + ';base64,' + Utilities.base64Encode(bl.getBytes()) + '" style="height:60px">'; } } catch (e2) {}
  return '<html><head><meta charset="utf-8">' + rlCss_() + '</head><body>' + rlKopHtml_() +
    '<h2>RINCIAN BIAYA PENDIDIKAN<br><span style="font-size:10pt;font-weight:normal">Nomor: ' + esc(x['ID']) + '</span></h2>' +
    '<table><tr><td style="width:30%">Nama</td><td>: ' + esc(x['NAMA']) + '</td></tr><tr><td>Program / kelas</td><td>: ' + esc(x['PROGRAM']) + ' / kelas ' + esc(x['KELAS TUJUAN']) + '</td></tr></table>' +
    '<table class="b" style="margin-top:10px"><tr><th>No</th><th>Uraian</th><th>Waktu pembayaran</th><th>Jumlah</th></tr>' + rows +
    '<tr><td colspan="3" class="r"><b>Total</b></td><td class="r"><b>' + honRp_(total) + '</b></td></tr></table>' +
    '<p><b>Cara pembayaran</b></p><ol><li>Transfer ke rekening resmi lembaga:<ul>' + (rek || '<li>Hubungi sekretariat untuk nomor rekening.</li>') + '</ul></li>' +
    '<li>Atau bayar tunai di sekretariat ' + esc(k.nama || 'lembaga') + '.</li>' +
    '<li>Setelah membayar, lakukan <b>konfirmasi pembayaran</b> lewat halaman status pendaftaran: ' + esc(rlLinkStatus_(x)) + '</li></ol>' +
    '<p style="font-size:9.5pt">Biaya pendaftaran wajib dilunasi agar penempatan kelas dapat diproses. Kwitansi resmi tersedia di halaman status setelah pembayaran diverifikasi bendahara.</p>' +
    '<table style="margin-top:16px"><tr><td style="width:50%"></td><td style="text-align:center">Direkomendasikan oleh,<br>' + (ttd || '<br><br><br>') +
    '<br><b>' + esc(x['PROMOTOR NAMA']) + '</b></td></tr></table></body></html>';
}
