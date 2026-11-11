// ============================================================================
// PAYMENT GATEWAY DOKU CHECKOUT (v1.48.0, Keuangan Tahap E)
// - Kunci: Pengaturan Referral -> Payment gateway -> DOKU (Client ID + Secret Key; disimpan di Script Properties,
//   bersama aturan referral; Secret Key tidak pernah dikirim balik utuh ke aplikasi).
// - Order dibuat lewat POST /checkout/v1/payment (tanda tangan HMACSHA256), pembeli membayar di halaman DOKU.
// - Pembayaran dicatat otomatis saat DOKU mengirim notifikasi (Notification URL = alamat /exec web app) ATAU saat
//   pemeriksaan status (tombol Cek status, pembukaan daftar, pemicu tiap jam). Notifikasi TIDAK dipercaya begitu
//   saja: status selalu dikonfirmasi ke DOKU (GET /orders/v1/status) karena Apps Script tidak bisa membaca header
//   tanda tangan notifikasi.
// - Pemasukan dicatat sebesar yang dibayar; biaya layanan per kanal (QRIS, VA, e-wallet, kartu) dicatat terpisah
//   sebagai pengeluaran ADM dengan nomor invoice yang sama. Akun kas: Saldo Payment Gateway.
// - Jenis order: Pendaftaran (referral) dan Tagihan WB.
// ============================================================================
var GW = {
  TAB: 'GATEWAY ORDER',
  HDR: ['INVOICE', 'WAKTU', 'JENIS', 'REF', 'ID WB', 'NAMA', 'URAIAN', 'JUMLAH', 'STATUS', 'URL', 'KADALUARSA', 'KANAL', 'DIBAYAR PADA', 'ID TRANSAKSI', 'CATATAN', 'PENYEDIA', 'DIBUAT OLEH', 'POKOK', 'BIAYA ADMIN', 'METODE'],
  BASE: { sandbox: 'https://api-sandbox.doku.com', produksi: 'https://api.doku.com' },
  MASA_BAWAAN: 1440, REKON_HARI: 3
};

// ---------- tabel order ----------
function gwTab_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(GW.TAB);
  if (!sh) {
    sh = ss.insertSheet(GW.TAB);
    sh.getRange(1, 1, 1, GW.HDR.length).setValues([GW.HDR]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, 1000, GW.HDR.length).setNumberFormat('@');
  } else if (sh.getLastColumn() < GW.HDR.length) {
    var ada = sh.getLastColumn();   // v1.49.0: kolom baru di kanan
    sh.getRange(1, ada + 1, 1, GW.HDR.length - ada).setValues([GW.HDR.slice(ada)]).setFontWeight('bold');
  }
  return sh;
}
function gwBaca_() {
  var sh = gwTab_(), n = sh.getLastRow() - 1, out = [];
  if (n < 1) return out;
  sh.getRange(2, 1, n, GW.HDR.length).getValues().forEach(function(r, i) {
    if (!sTeks_(r[0]).trim()) return;
    var o = { _baris: i + 2 };
    GW.HDR.forEach(function(h, j) { o[h] = r[j] instanceof Date ? Utilities.formatDate(r[j], absTz_(), 'yyyy-MM-dd HH:mm') : sTeks_(r[j]); });
    out.push(o);
  });
  return out;
}
function gwTambah_(o) {
  var sh = gwTab_(), row = GW.HDR.map(function(h) { return o[h] === undefined || o[h] === null ? '' : o[h]; });
  sh.getRange(sh.getLastRow() + 1, 1, 1, GW.HDR.length).setNumberFormat('@').setValues([row]);
}
function gwUbah_(baris, o) {
  var sh = gwTab_();
  Object.keys(o).forEach(function(h) { var j = GW.HDR.indexOf(h); if (j >= 0) sh.getRange(baris, j + 1).setValue(o[h]); });
}
function gwCari_(invoice) { return gwBaca_().filter(function(x) { return x['INVOICE'] === String(invoice); })[0] || null; }

// ---------- aturan & API DOKU ----------
function gwDoku_() {
  var g = rfAturan_().gateway || {};
  return { aktif: !!g.aktif && g.penyedia === 'doku' && !!g.dokuClientId && !!g.dokuSecretKey, produksi: !!g.produksi, clientId: g.dokuClientId || '',
    secret: g.dokuSecretKey || '', masa: Math.round(Number(g.dokuMasaBayar) || GW.MASA_BAWAAN), g: g };
}
function gwWajibAktif_() {
  var d = gwDoku_();
  if (!d.aktif) throw new Error('Pembayaran online DOKU belum diaktifkan Admin (Pengaturan Referral → Payment gateway).');
  return d;
}
function gwWaktuUtc_() { return Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'"); }
function gwTandaTangan_(d, reqId, ts, target, body) {
  var komp = 'Client-Id:' + d.clientId + '\nRequest-Id:' + reqId + '\nRequest-Timestamp:' + ts + '\nRequest-Target:' + target;
  if (body !== null && body !== undefined) {
    komp += '\nDigest:' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, body, Utilities.Charset.UTF_8));
  }
  return 'HMACSHA256=' + Utilities.base64Encode(Utilities.computeHmacSha256Signature(komp, d.secret, Utilities.Charset.UTF_8));
}
function gwPanggil_(d, metode, target, isi) {
  var body = isi ? JSON.stringify(isi) : null, reqId = Utilities.getUuid(), ts = gwWaktuUtc_();
  var opsi = {
    method: metode, muteHttpExceptions: true,
    headers: { 'Client-Id': d.clientId, 'Request-Id': reqId, 'Request-Timestamp': ts, 'Signature': gwTandaTangan_(d, reqId, ts, target, body) }
  };
  if (body) { opsi.contentType = 'application/json'; opsi.payload = body; }
  var res = UrlFetchApp.fetch((d.produksi ? GW.BASE.produksi : GW.BASE.sandbox) + target, opsi);
  var j = {};
  try { j = JSON.parse(res.getContentText() || '{}'); } catch (e) {}
  return { kode: res.getResponseCode(), json: j, teks: res.getContentText().slice(0, 300) };
}

// Biaya layanan per kanal. Baris aturan "KANAL persen tetap", mis. "QRIS 0.7 0", "VIRTUAL_ACCOUNT 0 4000", "EMONEY 1.5 0".
function gwBiaya_(jml, kanal, g) {
  var m = gwMetodeCari_(kanal, g);   // v1.49.0: tarif dari katalog metode (kode persis)
  if (m) return { biaya: Math.round(jml * m.persen / 100) + m.tetap, ket: (m.persen ? m.persen + '%' : '') + (m.persen && m.tetap ? ' + ' : '') + (m.tetap ? honRp_(m.tetap) : '') + ' (' + m.nama + ')' };
  var k = String(kanal || '').toUpperCase(), persen = Number(g.biayaPersen) || 0, tetap = Math.round(Number(g.biayaTetap) || 0), cocok = '';
  String(g.biayaKanal || '').split(/\r?\n/).forEach(function(baris) {
    var p = baris.trim().split(/\s+/);
    if (p.length < 2 || !p[0]) return;
    var kunci = p[0].toUpperCase();
    if (k.indexOf(kunci) >= 0 && kunci.length > cocok.length) {
      cocok = kunci; persen = Number(String(p[1]).replace(',', '.')) || 0; tetap = Math.round(Number(String(p[2] || '0').replace(/[^\d]/g, '')) || 0);
    }
  });
  var biaya = Math.round(jml * persen / 100) + tetap;
  return { biaya: biaya, ket: (persen ? persen + '%' : '') + (persen && tetap ? ' + ' : '') + (tetap ? honRp_(tetap) : '') + (cocok ? ' (kanal ' + cocok + ')' : '') };
}

// Buat (atau pakai ulang) order. o: {jenis, ref, idWb, nama, uraian, jumlah, email, hp, oleh}
// v1.49.0: o.pokok = tagihan/biaya pendaftaran; o.metode = kode metode DOKU (dipilih lebih dulu). Total = pokok + biaya admin
// (ditanggung pembayar, dihitung dari katalog metode, tidak bisa diubah).
function gwBuatOrder_(o) {
  var d = gwWajibAktif_(), m = gwMetodeCari_(o.metode, d.g);
  if (!m) throw new Error('Pilih metode pembayaran.');
  var h = gwHitungTotal_(o.pokok, m), jml = h.total;
  if (h.pokok < 1000) throw new Error('Jumlah pembayaran online minimal Rp1.000.');
  var kini = Date.now();
  var lama = gwBaca_().filter(function(x) {
    return x['JENIS'] === o.jenis && x['REF'] === String(o.ref) && x['ID WB'] === String(o.idWb || '') && Number(x['JUMLAH']) === jml && x['METODE'] === m.kode
      && x['STATUS'] === 'Menunggu' && x['URL'] && (!x['KADALUARSA'] || new Date(String(x['KADALUARSA']).replace(' ', 'T') + ':00+07:00').getTime() - kini > 10 * 60000);
  })[0];
  if (lama) return { invoice: lama['INVOICE'], url: lama['URL'], jumlah: jml, pokok: h.pokok, biaya: h.biaya, metode: m.nama, kadaluarsa: lama['KADALUARSA'], lama: true };
  var awal = o.jenis === 'Pendaftaran' ? 'REG' : 'TAG';
  var invoice = (awal + '-' + Utilities.formatDate(new Date(), absTz_(), 'yyMMdd') + '-' + absId_().toUpperCase()).slice(0, 60);
  var isi = {
    order: { amount: jml, invoice_number: invoice, currency: 'IDR', line_items: [{ name: String(o.uraian || o.jenis).slice(0, 60), price: h.pokok, quantity: 1 }]
      .concat(h.biaya > 0 ? [{ name: ('Biaya admin ' + m.nama).slice(0, 60), price: h.biaya, quantity: 1 }] : []) },
    payment: { payment_due_date: d.masa, payment_method_types: [m.kode] },
    customer: { id: String(o.idWb || o.ref).slice(0, 50), name: String(o.nama || 'Peserta').slice(0, 60) }
  };
  if (o.email && /@/.test(o.email)) isi.customer.email = String(o.email).slice(0, 100);
  if (o.hp) isi.customer.phone = String(o.hp).replace(/[^\d]/g, '').slice(0, 16);
  var r = gwPanggil_(d, 'post', '/checkout/v1/payment', isi);
  var pay = ((r.json || {}).response || {}).payment || {};
  if (r.kode >= 300 || !pay.url) {
    try { catat_('Sistem', '', o.oleh || 'Sistem', 'DOKU order GAGAL', invoice + ' HTTP ' + r.kode + ' ' + r.teks, 'GAGAL'); } catch (e) {}
    var pesanDoku = '';
    try { pesanDoku = [].concat((r.json || {}).message || (r.json || {}).error || []).join(' ').slice(0, 160); } catch (eM) {}
    throw new Error('Gagal membuat pembayaran DOKU (HTTP ' + r.kode + (pesanDoku ? ': ' + pesanDoku : '') + '). Periksa kunci, mode sandbox/produksi, atau kode metode ' + m.kode + ' di pengaturan.');
  }
  var kd = '';
  try { kd = Utilities.formatDate(new Date(kini + d.masa * 60000), absTz_(), 'yyyy-MM-dd HH:mm'); } catch (e2) {}
  gwTambah_({ 'INVOICE': invoice, 'WAKTU': rfWaktu_(), 'JENIS': o.jenis, 'REF': String(o.ref), 'ID WB': String(o.idWb || ''), 'NAMA': o.nama || '', 'URAIAN': String(o.uraian || '').slice(0, 200),
    'JUMLAH': jml, 'STATUS': 'Menunggu', 'URL': pay.url, 'KADALUARSA': kd, 'PENYEDIA': 'DOKU' + (d.produksi ? '' : ' (sandbox)'), 'DIBUAT OLEH': o.oleh || '',
    'POKOK': h.pokok, 'BIAYA ADMIN': h.biaya, 'METODE': m.kode });
  return { invoice: invoice, url: pay.url, jumlah: jml, pokok: h.pokok, biaya: h.biaya, metode: m.nama, kadaluarsa: kd, lama: false };
}

// Periksa status ke DOKU dan selesaikan bila lunas. Hasil: status order sesudahnya.
function gwPeriksa_(invoice) {
  var x = gwCari_(invoice);
  if (!x) return { status: 'Tidak dikenal' };
  if (x['STATUS'] === 'Lunas') return { status: 'Lunas', idTransaksi: x['ID TRANSAKSI'] };
  var d = gwDoku_();
  if (!d.clientId || !d.secret) return { status: x['STATUS'] };
  var r = gwPanggil_(d, 'get', '/orders/v1/status/' + encodeURIComponent(invoice), null);
  var j = r.json || {}, st = String(((j.transaction || {}).status) || '').toUpperCase();
  // v1.48.1: alasan pemeriksaan yang tidak lunas dicatat di order (kolom CATATAN) dan dikembalikan ke aplikasi
  var ket = 'Cek status DOKU ' + rfWaktu_() + ': HTTP ' + r.kode + (st ? ', status ' + st : '') + (st === 'SUCCESS' ? '' : ' ' + String(r.teks || '').replace(/\s+/g, ' ').slice(0, 220));
  if (st !== 'SUCCESS') { try { gwUbah_(x._baris, { 'CATATAN': ket }); } catch (eK) {} }
  if (r.kode >= 300 && r.kode !== 404) return { status: x['STATUS'], galat: ket };
  if (st === 'SUCCESS') {
    var bayar = Math.round(Number((j.order || {}).amount) || Number(x['JUMLAH']) || 0);
    var kanal = String(((j.channel || {}).id) || ((j.service || {}).id) || '');
    return gwSelesai_(x, bayar, kanal);
  }
  if (st === 'FAILED' || st === 'EXPIRED') { gwUbah_(x._baris, { 'STATUS': st === 'FAILED' ? 'Gagal' : 'Kedaluwarsa', 'CATATAN': 'Status DOKU ' + st }); return { status: st === 'FAILED' ? 'Gagal' : 'Kedaluwarsa' }; }
  if (x['KADALUARSA'] && new Date(x['KADALUARSA']).getTime() < Date.now() - 6 * 3600000 && st !== 'PENDING') { gwUbah_(x._baris, { 'STATUS': 'Kedaluwarsa' }); return { status: 'Kedaluwarsa' }; }
  return { status: 'Menunggu', galat: ket };
}

// Penyelesaian (sekali saja, dikunci).
function gwSelesai_(x, bayar, kanal) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    x = gwCari_(x['INVOICE']);
    if (x['STATUS'] === 'Lunas') return { status: 'Lunas', idTransaksi: x['ID TRANSAKSI'] };
    var g = gwDoku_().g, fee = gwBiaya_(bayar, kanal || x['METODE'], g), ids = '', catatan = '';
    var pokok = Math.round(Number(x['POKOK']) || bayar), adminBayar = Math.max(0, bayar - pokok);   // v1.49.0
    if (x['JENIS'] === 'Pendaftaran') {
      var rf = rfCari_(x['REF']);
      if (['Lunas', 'Pengembalian Diajukan', 'Dikembalikan'].indexOf(rf['STATUS BAYAR']) >= 0) {
        catatan = 'Pendaftaran sudah berstatus ' + rf['STATUS BAYAR'] + ' saat pembayaran DOKU masuk; periksa kemungkinan bayar ganda.';
        ids = gwCatatLain_(x, bayar, kanal, fee, catatan);
      } else {
        rfUbah_('DAFTAR', rf._baris, { 'STATUS BAYAR': 'Lunas', 'JUMLAH BAYAR': pokok, 'METODE BAYAR': 'DOKU ' + kanal, 'ORDER GATEWAY': x['INVOICE'],
          'VERIF BAYAR OLEH': 'Gateway otomatis', 'VERIF BAYAR PADA': rfWaktu_(), 'DIPERBARUI': rfWaktu_() });
        var oto = { nama: 'Gateway otomatis', peran: 'Sistem', biayaGw: fee };
        ids = rfCatatBayarAman_(rfCari_(x['REF']), oto, true);
        if (adminBayar > 0) ids = [ids, gwCatatAdminBayar_(x, adminBayar, kanal, 'Swadaya')].filter(String).join(',');
        rfSelesaikan_(rfCari_(x['REF']), oto);
        rfNotif_(rf['PROMOTOR KUNCI'], 'Pembayaran lunas: ' + rf['NAMA'], 'Dibayar online lewat DOKU (' + kanal + ').');
        npKirim_('bayar_online_masuk', { judul: 'Biaya pendaftaran dibayar online ' + honRp_(pokok), isi: rf['NAMA'] + ' (' + (kanal || 'DOKU') + ').', aksi: 'referral_admin', ref: 'gw|' + x['INVOICE'] });   // v1.50.0: notifikasi
      }
    } else {
      ids = gwCatatTagihan_(x, pokok, kanal, fee, bayar, adminBayar);
    }
    gwUbah_(x._baris, { 'STATUS': 'Lunas', 'DIBAYAR PADA': rfWaktu_(), 'KANAL': kanal, 'ID TRANSAKSI': ids, 'CATATAN': catatan, 'JUMLAH': bayar });
    try { catat_('Sistem', '', 'Gateway otomatis', 'DOKU lunas', x['INVOICE'] + ' ' + honRp_(bayar) + ' ' + kanal, 'OK'); } catch (e) {}
    return { status: 'Lunas', idTransaksi: ids };
  } finally { lock.releaseLock(); }
}
function gwBarisDasar_(tgl, sumber) {
  var sim = {};
  try { sim = absSim_(); } catch (e) {}
  return { 'TANGGAL': tgl, 'STATUS': 'Disetujui', 'TANGGAL KEPUTUSAN': tgl, 'TAHUN PELAJARAN': sim.tahun || '', 'DICATAT OLEH': 'Gateway otomatis', 'DICATAT PADA': absWaktu_(),
    'SUMBER DANA': sumber, 'AKUN KAS': kalAkunBawaan_('gateway'), 'DIPUTUS OLEH': 'Sistem (pembayaran online DOKU)' };
}
function gwCatatBiaya_(x, bayar, kanal, fee, sumber) {
  if (!(fee.biaya > 0)) return '';
  rfKategori_(KAL.KAT_ADM, 'Biaya Administrasi Payment Gateway', 'Pengeluaran');
  return rfTrx_(kalGabung_(gwBarisDasar_(absHariIni_(), sumber), {
    'JENIS': 'Pengeluaran', 'KATEGORI KEUANGAN': KAL.KAT_ADM, 'PIHAK TERKAIT': 'DOKU', 'JUMLAH': fee.biaya,
    'URAIAN': ('Biaya layanan DOKU ' + fee.ket + ' atas ' + honRp_(bayar) + ' (invoice ' + x['INVOICE'] + ', ' + (x['NAMA'] || '') + ')').slice(0, 300),
    'CATATAN KEPUTUSAN': 'Dibayar ' + honRp_(bayar) + ' - biaya ' + honRp_(fee.biaya) + ' = diterima bersih ' + honRp_(bayar - fee.biaya) + '. Sesuaikan bila laporan DOKU berbeda.'
  }));
}
function gwCatatTagihan_(x, bayar, kanal, fee, total, adminBayar) {
  total = total || bayar;
  var tag = keuTagCari_(x['REF']), sumber = KEU.SUMBER_KAT[tag.kategori] || 'Swadaya';
  var t = keuTrxTab_(), id = 'TRX-' + absId_().toUpperCase();
  t.sh.appendRow(absBaris_(t, kalGabung_(gwBarisDasar_(absHariIni_(), sumber), {
    'ID TRANSAKSI': id, 'JENIS': 'Pemasukan', 'KATEGORI KEUANGAN': tag.kategori, 'WARGA BELAJAR': x['ID WB'], 'TAGIHAN': tag.id, 'JUMLAH': bayar,
    'URAIAN': ('Pembayaran ' + tag.nama + ' - ' + x['NAMA'] + ' (DOKU ' + kanal + ', invoice ' + x['INVOICE'] + ')').slice(0, 300), 'PIHAK TERKAIT': x['NAMA'],
    'CATATAN KEPUTUSAN': 'Dibayar online; dicatat sebesar yang dibayar'
  })));
  var a = adminBayar > 0 ? gwCatatAdminBayar_(x, adminBayar, kanal, sumber) : '';
  var b = gwCatatBiaya_(x, total, kanal, fee, sumber);
  try { catat_('Sistem', '', 'Gateway otomatis', 'Bayar tagihan online', tag.nama + ' ' + x['NAMA'] + ' ' + bayar + (adminBayar ? ' + admin ' + adminBayar : ''), 'OK'); } catch (e) {}
  npBayarDiterima_(x['ID WB'], tag.nama, bayar, 'online ' + (kanal || ''));   // v1.50.0: notifikasi
  npKirim_('bayar_online_masuk', { judul: 'Pembayaran online masuk ' + honRp_(bayar), isi: tag.nama + ' - ' + x['NAMA'] + ' (' + (kanal || 'DOKU') + ').', aksi: 'keuangan', ref: 'gw|' + x['INVOICE'] });
  return [id, a, b].filter(String).join(',');
}
// Uang masuk yang tidak cocok dengan apa pun (mis. bayar ganda): tetap dicatat agar kas sesuai, ditandai untuk diperiksa.
function gwCatatLain_(x, bayar, kanal, fee, catatan) {
  rfKategori_('LPM', 'Penerimaan Lain-lain', 'Pemasukan');
  var id = rfTrx_(kalGabung_(gwBarisDasar_(absHariIni_(), 'Swadaya'), {
    'JENIS': 'Pemasukan', 'KATEGORI KEUANGAN': 'LPM', 'PIHAK TERKAIT': x['NAMA'], 'JUMLAH': bayar,
    'URAIAN': ('Pembayaran DOKU perlu diperiksa: ' + x['URAIAN'] + ' (invoice ' + x['INVOICE'] + ', ' + kanal + ')').slice(0, 300), 'CATATAN KEPUTUSAN': catatan.slice(0, 300)
  }));
  return [id, gwCatatBiaya_(x, bayar, kanal, fee, 'Swadaya')].filter(String).join(',');
}

// Notifikasi HTTP DOKU (dipanggil dari doPost). Isi notifikasi hanya pemicu; status dikonfirmasi ke DOKU.
function dokuNotif_(body) {
  var inv = String(((body || {}).order || {}).invoice_number || '');
  if (!inv || !gwCari_(inv)) return { ok: false };
  // v1.48.2: notifikasi datang ±2 detik setelah bayar, saat cek status DOKU kadang masih PENDING.
  // Bila notifikasi menyatakan SUCCESS, cek ulang sampai 3 kali dengan jeda (tetap dikonfirmasi ke DOKU).
  var h = gwPeriksa_(inv), sukses = String(((body || {}).transaction || {}).status || '').toUpperCase() === 'SUCCESS';
  for (var i = 0; i < 3 && sukses && h.status === 'Menunggu'; i++) {
    Utilities.sleep(3000 + i * 2000);
    h = gwPeriksa_(inv);
  }
  return h;
}
// Pemicu tiap jam: periksa order yang masih menunggu (maks. 3 hari).
function gwRekonsiliasi_() {
  var d = gwDoku_();
  if (!d.clientId || !d.secret) return 0;
  var batas = Date.now() - GW.REKON_HARI * 86400000, n = 0;
  gwBaca_().forEach(function(x) {
    if (x['STATUS'] !== 'Menunggu' || new Date(x['WAKTU']).getTime() < batas || n >= 40) return;
    n++;
    try { gwPeriksa_(x['INVOICE']); } catch (e) {}
  });
  return n;
}

// ---------- endpoint petugas: tagihan WB ----------
function gwHpWb_(idWb) {
  try {
    var t = absBaca_('WARGA BELAJAR');
    for (var i = 1; i < t.v.length; i++) {
      if (sTeks_(absNilai_(t, t.v[i], 'ID WB')).trim() !== idWb) continue;
      return { hp: sTeks_(absNilai_(t, t.v[i], 'NO HP')).trim() || sTeks_(absNilai_(t, t.v[i], 'HP')).trim(), email: sTeks_(absNilai_(t, t.v[i], 'EMAIL')).trim() };
    }
  } catch (e) {}
  return { hp: '', email: '' };
}
// d: {idTagihan, idWb, metode} - v1.49.0: jumlah = sisa tagihan + biaya admin metode (tidak bisa diubah)
function waStafTagihanLinkBayar(token, d) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  d = d || {};
  var tag = keuTagCari_(d.idTagihan);
  var w = keuWbSemua_().filter(function(x) { return x.id === String(d.idWb); })[0];
  if (!w || !keuKena_(tag, w)) throw new Error('Warga belajar ini tidak termasuk sasaran tagihan.');
  var row = keuRinci_(tag, [w], keuBayarPeta_())[0];
  if (row.sisa <= 0) throw new Error('Tagihan ini sudah lunas.');
  var kontak = gwHpWb_(w.id);
  var o = gwBuatOrder_({ jenis: 'Tagihan', ref: tag.id, idWb: w.id, nama: w.nama, uraian: tag.nama + ' - ' + w.nama, pokok: row.sisa, metode: d.metode, hp: kontak.hp, email: kontak.email, oleh: p.nama });
  catat_(p.peran, w.idRombel, p.nama, 'Link bayar DOKU', tag.nama + ' ' + w.nama + ' ' + o.jumlah + ' ' + o.invoice, 'OK');
  o.nama = w.nama; o.tagihan = tag.nama; o.hp = kontak.hp; o.lembaga = nilLembaga_().nama;
  return o;
}
function waStafTagihanCekBayar(token, invoice) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'lihat');
  return gwPeriksa_(invoice);
}
// Daftar order (q: {idTagihan?}); order menunggu milik tagihan itu diperiksa sekalian (maks. 10).
function waStafTagihanOrder(token, q) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'lihat');
  q = q || {};
  var n = 0, semua = gwBaca_().filter(function(x) { return !q.idTagihan || (x['JENIS'] === 'Tagihan' && x['REF'] === String(q.idTagihan)); });
  semua.forEach(function(x) { if (x['STATUS'] === 'Menunggu' && n < 10) { n++; try { gwPeriksa_(x['INVOICE']); } catch (e) {} } });
  if (n) semua = gwBaca_().filter(function(x) { return !q.idTagihan || (x['JENIS'] === 'Tagihan' && x['REF'] === String(q.idTagihan)); });
  return { aktif: gwDoku_().aktif, order: semua.reverse().slice(0, 300).map(function(x) {
    return { invoice: x['INVOICE'], waktu: x['WAKTU'], jenis: x['JENIS'], idWb: x['ID WB'], nama: x['NAMA'], uraian: x['URAIAN'], jumlah: Number(x['JUMLAH']) || 0,
      status: x['STATUS'], url: x['STATUS'] === 'Menunggu' ? x['URL'] : '', kadaluarsa: x['KADALUARSA'], kanal: x['KANAL'], dibayarPada: x['DIBAYAR PADA'], catatan: x['CATATAN'] };
  }) };
}

// ---------- promotor: cek status pembayaran online ----------
function waRefCekBayar(token, id) {
  var m = rfMilik_(token, id), x = m.x;
  if (!x['ORDER GATEWAY'] || String(x['METODE BAYAR']).indexOf('DOKU') !== 0) return { status: x['STATUS BAYAR'] || 'Belum' };
  var h = gwPeriksa_(x['ORDER GATEWAY']);
  return { status: h.status, statusBayar: rfCari_(id)['STATUS BAYAR'] };
}

// ---------- pemicu tiap jam (dipasang saat DOKU diaktifkan) ----------
function pemicuGatewayDoku() {
  try { gwRekonsiliasi_(); } catch (e) { try { pmlCatatGalat_('pemicu', 'pemicuGatewayDoku', String(e && e.message || e), e && e.stack, '', ''); } catch (e2) {} }
}
function gwPastikanPemicu_() {
  var ada = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'pemicuGatewayDoku'; });
  if (!ada) ScriptApp.newTrigger('pemicuGatewayDoku').timeBased().everyHours(1).create();
}

// ============================================================================
// KATALOG METODE BAYAR & BIAYA ADMIN DITANGGUNG PEMBAYAR (v1.49.0)
// Baris pengaturan "KODE | Nama | persen | biaya tetap". Kode = payment_method_types DOKU Checkout.
// Paylater/cicilan (Akulaku, Kredivo, Indodana, Atome, ...) selalu disaring walau tertulis di pengaturan.
// Total = pokok + biaya admin. Untuk biaya persen, total dinaikkan (gross-up) agar lembaga menerima utuh:
//   total = ceil((pokok + tetap) / (1 - persen/100)).
// ============================================================================
var GWM = {
  BAWAAN: [
    'VIRTUAL_ACCOUNT_BCA | VA BCA | 0 | 4000',
    'VIRTUAL_ACCOUNT_BANK_MANDIRI | VA Mandiri | 0 | 4000',
    'VIRTUAL_ACCOUNT_BRI | VA BRI | 0 | 4000',
    'VIRTUAL_ACCOUNT_BNI | VA BNI | 0 | 4000',
    'VIRTUAL_ACCOUNT_BANK_BJB | VA Bank BJB | 0 | 4000',
    'VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI | VA BSI | 0 | 4000',
    'VIRTUAL_ACCOUNT_BANK_PERMATA | VA Permata | 0 | 4000',
    'VIRTUAL_ACCOUNT_BANK_CIMB | VA CIMB Niaga | 0 | 4000',
    'VIRTUAL_ACCOUNT_BANK_DANAMON | VA Danamon | 0 | 4000',
    'VIRTUAL_ACCOUNT_BTN | VA BTN | 0 | 4000',
    'VIRTUAL_ACCOUNT_BNC | VA Bank Neo Commerce | 0 | 4000',
    'VIRTUAL_ACCOUNT_DOKU | VA DOKU (ATM Bersama/Prima/Alto) | 0 | 4000',
    'QRIS | QRIS (semua e-wallet & m-banking) | 0.7 | 0',
    'EMONEY_SHOPEEPAY | ShopeePay | 2 | 0',
    'EMONEY_OVO | OVO | 1.5 | 0',
    'EMONEY_DANA | DANA | 1.5 | 0',
    'ONLINE_TO_OFFLINE_ALFA | Alfamart / Alfamidi | 0 | 5000',
    'ONLINE_TO_OFFLINE_INDOMARET | Indomaret | 0 | 5000'
  ].join('\n'),
  LARANG: /PEER_TO_PEER|AKULAKU|KREDIVO|INDODANA|ATOME|PAYLATER|CICIL|INSTALLMENT/i
};
function gwMetode_(g) {
  g = g || (rfAturan_().gateway || {});
  var teks = String(g.metodeBayar || '').trim() || GWM.BAWAAN, out = [], ada = {};
  teks.split(/\r?\n/).forEach(function(b) {
    var p = b.split('|').map(function(s) { return s.trim(); });
    var kode = String(p[0] || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!kode || ada[kode] || GWM.LARANG.test(kode)) return;
    ada[kode] = true;
    out.push({ kode: kode, nama: p[1] || kode, persen: Math.max(0, Number(String(p[2] || '0').replace(',', '.')) || 0),
      tetap: Math.max(0, Math.round(Number(String(p[3] || '0').replace(/[^\d]/g, '')) || 0)),
      grup: /^VIRTUAL_ACCOUNT/.test(kode) ? 'Virtual Account' : /^QRIS|^EMONEY/.test(kode) ? 'QRIS & e-wallet' : /^ONLINE_TO_OFFLINE/.test(kode) ? 'Gerai retail' : 'Lainnya' });
  });
  return out;
}
function gwMetodeCari_(kode, g) {
  var k = String(kode || '').toUpperCase();
  if (!k) return null;
  return gwMetode_(g).filter(function(m) { return m.kode === k; })[0] || null;
}
function gwHitungTotal_(pokok, m) {
  pokok = Math.round(Number(pokok) || 0);
  var p = (Number(m.persen) || 0) / 100, t = Math.round(Number(m.tetap) || 0);
  var total = p > 0 && p < 0.5 ? Math.ceil((pokok + t) / (1 - p)) : pokok + t;
  return { pokok: pokok, biaya: total - pokok, total: total };
}
// Biaya admin yang dibayar pembayar dicatat sebagai pemasukan tersendiri (ADP), terpisah dari tagihannya.
function gwCatatAdminBayar_(x, jumlah, kanal, sumber) {
  if (!(jumlah > 0)) return '';
  rfKategori_('ADP', 'Biaya Admin dari Pembayar', 'Pemasukan');
  return rfTrx_(kalGabung_(gwBarisDasar_(absHariIni_(), sumber || 'Swadaya'), {
    'JENIS': 'Pemasukan', 'KATEGORI KEUANGAN': 'ADP', 'WARGA BELAJAR': x['ID WB'] || '', 'PIHAK TERKAIT': x['NAMA'], 'JUMLAH': Math.round(jumlah),
    'URAIAN': ('Biaya admin pembayaran online ' + (kanal || x['METODE'] || '') + ' dibayar ' + (x['NAMA'] || '') + ' (invoice ' + x['INVOICE'] + ')').slice(0, 300),
    'CATATAN KEPUTUSAN': 'Dibebankan ke pembayar; menutup biaya layanan DOKU (ADM) dengan invoice yang sama'
  }));
}
