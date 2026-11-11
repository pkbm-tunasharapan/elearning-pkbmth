// ============================================================================
// TAGIHAN SAYA - KEUANGAN DI AKUN SISWA (v1.49.0)
// - Siswa melihat tagihan aktifnya (sisa, jatuh tempo, status), riwayat pembayaran, dan pengajuan transfer.
// - Bayar online (DOKU): pilih metode dulu -> total = sisa tagihan + biaya admin metode itu (tetap, tidak bisa diubah)
//   -> halaman DOKU dibuka di dalam aplikasi. Lunas tercatat otomatis.
// - Transfer manual: hanya ke rekening lembaga di Pengaturan Referral; siswa mengunggah bukti -> Bendahara/Admin
//   memverifikasi -> pemasukan tercatat (boleh mencicil, tanpa biaya admin).
// - Sasaran tagihan "Siswa" (siswa tertentu): NILAI SASARAN berisi daftar ID WB dipisah koma.
// ============================================================================
var KS = {
  TAB_TF: 'TAGIHAN TRANSFER',
  HDR_TF: ['ID', 'WAKTU', 'TAGIHAN', 'ID WB', 'NAMA', 'JUMLAH', 'REKENING TUJUAN', 'BUKTI', 'CATATAN SISWA', 'STATUS', 'DIPROSES OLEH', 'DIPROSES PADA', 'CATATAN', 'ID TRANSAKSI']
};
if (typeof API_FLUTTER !== 'undefined' && API_FLUTTER && API_FLUTTER.TAMBAHAN) {
  ['waSiswaTagihan', 'waSiswaBayarOnline', 'waSiswaCekBayar', 'waSiswaBayarTransfer'].forEach(function(f) { API_FLUTTER.TAMBAHAN[f] = true; });
}

// Akun siswa (nama + rombel) -> warga belajar di Data Induk (sama seperti Kartu Pencapaian Studi).
function ksWb_(s) {
  var nn = normNama_(s.nama), peta = nilPetaBm_(), simR = '', wb = null;
  Object.keys(peta.rombel).forEach(function(r) { if (peta.rombel[r][s.idRombel]) simR = r; });
  if (simR) {
    var nisn = '';
    (nilSiswaBm_()[String(s.idRombel)] || []).forEach(function(x) { if (normNama_(x.nama) === nn) nisn = x.nisn; });
    wb = nilCocokWb_(absWbRombel_(simR), nisn, s.nama);
  }
  if (!wb) throw new Error('Data Anda belum terhubung dengan Data Induk sekolah, jadi tagihan belum bisa ditampilkan. Hubungi admin.');
  var w = keuWbSemua_().filter(function(x) { return x.id === wb.id; })[0];
  if (!w) throw new Error('Data warga belajar tidak ditemukan.');
  return w;
}

// ---------- tab pengajuan transfer ----------
function ksTfBaca_() {
  var t = absBaca_(KS.TAB_TF, KS.HDR_TF), out = [];
  for (var i = 1; i < t.v.length; i++) {
    var g = function(n) { return absNilai_(t, t.v[i], n); };
    var id = sTeks_(g('ID')).trim();
    if (!id) continue;
    out.push({ baris: i + 1, id: id, waktu: sTeks_(g('WAKTU')), idTagihan: sTeks_(g('TAGIHAN')).trim(), idWb: sTeks_(g('ID WB')).trim(), nama: sTeks_(g('NAMA')),
      jumlah: keuAngka_(g('JUMLAH')), rekening: sTeks_(g('REKENING TUJUAN')), bukti: sTeks_(g('BUKTI')).trim(), catatanSiswa: sTeks_(g('CATATAN SISWA')),
      status: sTeks_(g('STATUS')).trim() || 'Menunggu', oleh: sTeks_(g('DIPROSES OLEH')), pada: sTeks_(g('DIPROSES PADA')), catatan: sTeks_(g('CATATAN')),
      idTransaksi: sTeks_(g('ID TRANSAKSI')) });
  }
  return { t: t, data: out };
}
function ksTfUbah_(t, baris, isi) {
  Object.keys(isi).forEach(function(k) { var c = absCol_(t, k); if (c >= 0) t.sh.getRange(baris, c + 1).setValue(isi[k]); });
}

// ---------- siswa ----------
function waSiswaTagihan(token) {
  var s = siswaDariSesi_(token), w = ksWb_(s), pb = keuBayarPeta_(), kat = keuKatPeta_();
  var tf = ksTfBaca_().data.filter(function(x) { return x.idWb === w.id; });
  var menungguTf = {};
  tf.forEach(function(x) { if (x.status === 'Menunggu') menungguTf[x.idTagihan] = (menungguTf[x.idTagihan] || 0) + x.jumlah; });
  var tagihan = keuTagSemua_().data.filter(function(t) { return t.aktif && keuKena_(t, w); }).map(function(t) {
    var r = keuRinci_(t, [w], pb)[0];
    return { id: t.id, nama: t.nama, kategori: kat[t.kategori] ? kat[t.kategori].nama : t.kategori, jumlah: t.jumlah, jatuhTempo: t.jatuhTempo, keterangan: t.keterangan,
      dibayar: r.dibayar, keringanan: r.keringanan, sisa: r.sisa, status: r.status, transferDiperiksa: menungguTf[t.id] || 0 };
  }).sort(function(a, b) { return (a.sisa > 0 ? 0 : 1) - (b.sisa > 0 ? 0 : 1) || String(a.jatuhTempo || '9').localeCompare(String(b.jatuhTempo || '9')); });
  var namaTag = {};
  keuTagSemua_().data.forEach(function(t) { namaTag[t.id] = t.nama; });
  var riwayat = keuSemua_().filter(function(x) { return x.idWb === w.id && x.jenis === 'Pemasukan' && keuSah_(x) && (x.idTagihan || x.kategori === 'ADP'); }).map(function(x) {
    return { id: x.id, tanggal: x.tanggal, tagihan: namaTag[x.idTagihan] || (x.kategori === 'ADP' ? 'Biaya admin pembayaran online' : ''), jumlah: x.jumlah,
      cara: /DOKU/.test(x.uraian) ? 'Online' : (x.dicatatOleh === 'Gateway otomatis' ? 'Online' : 'Petugas / transfer') };
  }).sort(function(a, b) { return b.tanggal.localeCompare(a.tanggal); }).slice(0, 100);
  var pending = gwBaca_().filter(function(o) { return o['JENIS'] === 'Tagihan' && o['ID WB'] === w.id && o['STATUS'] === 'Menunggu'; }).map(function(o) {
    return { invoice: o['INVOICE'], idTagihan: o['REF'], total: Number(o['JUMLAH']) || 0, metode: o['METODE'], url: o['URL'], kadaluarsa: o['KADALUARSA'] };
  });
  var at = rfAturan_(), d = gwDoku_();
  return {
    wb: { id: w.id, nama: w.nama, rombel: w.namaRombel }, tagihan: tagihan, riwayat: riwayat, pending: pending,
    transfer: tf.slice(-20).reverse().map(function(x) { return { id: x.id, waktu: x.waktu, idTagihan: x.idTagihan, tagihan: namaTag[x.idTagihan] || x.idTagihan, jumlah: x.jumlah, status: x.status, catatan: x.catatan }; }),
    online: d.aktif, metode: d.aktif ? gwMetode_(d.g) : [], rekening: at.rekening || [], lembaga: nilLembaga_().nama
  };
}
function ksTagWb_(token, idTagihan) {
  var s = siswaDariSesi_(token), w = ksWb_(s), tag = keuTagCari_(idTagihan);
  if (!tag.aktif || !keuKena_(tag, w)) throw new Error('Tagihan ini tidak untuk Anda.');
  var row = keuRinci_(tag, [w], keuBayarPeta_())[0];
  return { s: s, w: w, tag: tag, row: row };
}
// Bayar online: total = sisa tagihan + biaya admin metode (tidak bisa diubah).
function waSiswaBayarOnline(token, idTagihan, metode) {
  var k = ksTagWb_(token, idTagihan);
  if (k.row.sisa <= 0) throw new Error('Tagihan ini sudah lunas.');
  var kontak = gwHpWb_(k.w.id);
  var o = gwBuatOrder_({ jenis: 'Tagihan', ref: k.tag.id, idWb: k.w.id, nama: k.w.nama, judul: k.tag.nama, uraian: k.tag.nama + ' - ' + k.w.nama, pokok: k.row.sisa, metode: metode,
    hp: kontak.hp, email: kontak.email, oleh: k.w.nama + ' (siswa)' });
  try { catat_('Siswa', k.s.idRombel, k.w.nama, 'Bayar tagihan online', k.tag.nama + ' ' + o.jumlah + ' ' + o.invoice, 'OK'); } catch (e) {}
  return o;
}
function waSiswaCekBayar(token, invoice) {
  var s = siswaDariSesi_(token), w = ksWb_(s), x = gwCari_(invoice);
  if (!x || x['ID WB'] !== w.id) throw new Error('Pembayaran tidak ditemukan.');
  return gwPeriksa_(invoice);
}
// d: {idTagihan, jumlah, rekening, bukti (dataURL), catatan}
function waSiswaBayarTransfer(token, d) {
  d = d || {};
  var k = ksTagWb_(token, d.idTagihan);
  if (k.row.sisa <= 0) throw new Error('Tagihan ini sudah lunas.');
  var jml = Math.round(keuAngka_(d.jumlah) || k.row.sisa);
  if (!(jml > 0) || jml > k.row.sisa) throw new Error('Jumlah transfer 1 s.d. sisa tagihan (' + honRp_(k.row.sisa) + ').');
  var rek = (rfAturan_().rekening || []).map(function(r) { return [r.bank, r.nomor, 'a.n. ' + r.atasNama].join(' · '); });
  if (!rek.length) throw new Error('Rekening lembaga belum diatur. Hubungi admin atau bayar online.');
  var tujuan = rek.indexOf(String(d.rekening || '')) >= 0 ? String(d.rekening) : rek[0];
  if (!d.bukti) throw new Error('Unggah foto bukti transfer.');
  var f = keuSimpanBukti_(d.bukti, 'TF-' + k.tag.id + '-' + k.w.id + '-' + Utilities.formatDate(new Date(), absTz_(), 'yyyyMMdd_HHmmss'));
  var t = absBaca_(KS.TAB_TF, KS.HDR_TF), id = 'TF-' + absId_().toUpperCase();
  t.sh.appendRow(absBaris_(t, { 'ID': id, 'WAKTU': rfWaktu_(), 'TAGIHAN': k.tag.id, 'ID WB': k.w.id, 'NAMA': k.w.nama, 'JUMLAH': jml, 'REKENING TUJUAN': tujuan,
    'BUKTI': f, 'CATATAN SISWA': String(d.catatan || '').slice(0, 200), 'STATUS': 'Menunggu' }));
  try { catat_('Siswa', k.s.idRombel, k.w.nama, 'Kirim bukti transfer tagihan', k.tag.nama + ' ' + jml + ' ' + id, 'OK'); } catch (e) {}
  npKirim_('transfer_masuk', { judul: 'Bukti transfer tagihan ' + honRp_(jml), isi: k.w.nama + ' (' + k.w.namaRombel + ') · ' + k.tag.nama + '. Periksa di Tagihan → Bukti transfer.', aksi: 'transfer', ref: id });   // v1.50.0: notifikasi
  return { sukses: true, id: id, pesan: 'Bukti transfer terkirim. Bendahara akan memeriksanya.' };
}

// ---------- petugas: verifikasi transfer ----------
function waStafTagihanTransfer(token, q) {
  var p = stafDariToken_(token), r = keuWajib_(p, 'lihat');
  q = q || {};
  var namaTag = {};
  keuTagSemua_().data.forEach(function(t) { namaTag[t.id] = t.nama; });
  var rb = {};
  keuWbSemua_().forEach(function(w) { rb[w.id] = w.namaRombel; });
  var data = ksTfBaca_().data.filter(function(x) { return q.semua || x.status === 'Menunggu'; }).reverse().slice(0, 200).map(function(x) {
    return { id: x.id, waktu: x.waktu, idTagihan: x.idTagihan, tagihan: namaTag[x.idTagihan] || x.idTagihan, idWb: x.idWb, nama: x.nama, rombel: rb[x.idWb] || '',
      jumlah: x.jumlah, rekening: x.rekening, catatanSiswa: x.catatanSiswa, status: x.status, oleh: x.oleh, pada: x.pada, catatan: x.catatan, adaBukti: !!x.bukti };
  });
  return { transfer: data, catat: r.catat, akun: kalAkun_().filter(function(a) { return a.aktif !== false; }) };
}
function waStafTagihanTransferBukti(token, id) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'lihat');
  var x = ksTfBaca_().data.filter(function(y) { return y.id === String(id); })[0];
  if (!x || !x.bukti) throw new Error('Bukti tidak ditemukan.');
  var b = DriveApp.getFileById(x.bukti).getBlob();
  return { b64: Utilities.base64Encode(b.getBytes()), mime: b.getContentType() };
}
// terima: catat pemasukan tagihan (akun pilihan, bawaan Rekening Bank); tolak: alasan wajib.
function waStafTagihanTransferPutus(token, id, terima, catatan, akun) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var tf = ksTfBaca_(), x = tf.data.filter(function(y) { return y.id === String(id); })[0];
    if (!x) throw new Error('Pengajuan transfer tidak ditemukan.');
    if (x.status !== 'Menunggu') throw new Error('Pengajuan ini sudah ' + x.status + '.');
    catatan = String(catatan || '').trim().slice(0, 300);
    if (!terima) {
      if (catatan.length < 5) throw new Error('Tulis alasan penolakan (minimal 5 huruf).');
      ksTfUbah_(tf.t, x.baris, { 'STATUS': 'Ditolak', 'DIPROSES OLEH': p.nama, 'DIPROSES PADA': rfWaktu_(), 'CATATAN': catatan });
      catat_(p.peran, '-', p.nama, 'Tolak transfer tagihan', x.id + ' ' + x.nama + ': ' + catatan, 'OK');
      npKirim_('transfer_ditolak', { judul: 'Bukti transfer ditolak', isi: honRp_(x.jumlah) + ': ' + catatan + '. Silakan kirim ulang atau bayar online.', aksi: 'tagihan_saya', siswa: [x.idWb] });   // v1.50.0: notifikasi
      return { sukses: true };
    }
    var tag = keuTagCari_(x.idTagihan), w = keuWbSemua_().filter(function(y) { return y.id === x.idWb; })[0];
    if (!w) throw new Error('Warga belajar tidak ditemukan.');
    var row = keuRinci_(tag, [w], keuBayarPeta_())[0];
    if (x.jumlah > row.sisa) throw new Error('Jumlah transfer (' + honRp_(x.jumlah) + ') melebihi sisa tagihan saat ini (' + honRp_(row.sisa) + '). Tolak lalu minta siswa mengajukan ulang.');
    var t = keuTrxTab_(), idTrx = 'TRX-' + absId_().toUpperCase();
    t.sh.appendRow(absBaris_(t, {
      'ID TRANSAKSI': idTrx, 'TANGGAL': String(x.waktu).slice(0, 10) || absHariIni_(), 'JENIS': 'Pemasukan', 'KATEGORI KEUANGAN': tag.kategori, 'WARGA BELAJAR': w.id,
      'URAIAN': ('Pembayaran ' + tag.nama + ' - ' + w.nama + ' (transfer ' + x.rekening + ', ' + x.id + ')').slice(0, 300), 'JUMLAH': x.jumlah,
      'SUMBER DANA': KEU.SUMBER_KAT[tag.kategori] || 'Swadaya', 'PIHAK TERKAIT': w.nama, 'BUKTI': x.bukti, 'STATUS': 'Disetujui', 'DIPUTUS OLEH': p.nama,
      'TANGGAL KEPUTUSAN': absWaktu_(), 'CATATAN KEPUTUSAN': ('Transfer diverifikasi. ' + catatan).trim(), 'TAHUN PELAJARAN': absSim_().tahun,
      'DICATAT OLEH': p.nama, 'DICATAT PADA': absWaktu_(), 'TAGIHAN': tag.id, 'AKUN KAS': kalAkunSah_(akun) || kalAkunBawaan_('transfer')
    }));
    ksTfUbah_(tf.t, x.baris, { 'STATUS': 'Diterima', 'DIPROSES OLEH': p.nama, 'DIPROSES PADA': rfWaktu_(), 'CATATAN': catatan, 'ID TRANSAKSI': idTrx });
    catat_(p.peran, w.idRombel, p.nama, 'Terima transfer tagihan', tag.nama + ' ' + w.nama + ' ' + x.jumlah, 'OK');
    npBayarDiterima_(w.id, tag.nama, x.jumlah, 'transfer diverifikasi');   // v1.50.0: notifikasi
    return { sukses: true, idTransaksi: idTrx };
  } finally { lock.releaseLock(); }
}
function ksJumlahTfMenunggu_() {
  try { return ksTfBaca_().data.filter(function(x) { return x.status === 'Menunggu'; }).length; } catch (e) { return 0; }
}
