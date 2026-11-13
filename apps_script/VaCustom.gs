// ============================================================================
// VA CUSTOM - TAGIHAN SEKALI BAYAR (v1.68.0)
// - Admin, Kepala Sekolah, Front Office, dan Bendahara membuat tagihan virtual account dengan nominal bebas.
// - Kode transaksi WAJIB dipilih dari kategori pemasukan yang sudah ada (tidak membuat kode baru).
// - Keterangan dibentuk otomatis: "<Pembayaran nama kategori> atas nama <pembayar>" (+ catatan petugas bila ada),
//   sehingga baris di Arus Keuangan selalu seragam.
// - Pokok diisi petugas; biaya admin metode (VA, QRIS, gerai) ditanggung pembayar (gwHitungTotal_), lembaga menerima utuh.
// - Pembayar SISWA: dibuat sebagai TAGIHAN sasaran "Siswa" (satu siswa) -> tampil di Tagihan Saya, dibayar dari aplikasi
//   (VA / transfer), notifikasi tagihan baru dikirim ke siswa. Pencatatan memakai alur tagihan yang sudah ada.
// - Pembayar UMUM (orang tua, calon siswa, pihak lain): order DOKU jenis "Custom". Petugas menampilkan QR halaman bayar di
//   layar / menyimpan gambar instruksi bayar; link WA hanya cadangan. Lunas -> pemasukan dengan kode transaksi terpilih.
// ============================================================================
var VC = {
  TAB: 'VA CUSTOM',
  HDR: ['ID VA', 'DIBUAT PADA', 'KATEGORI', 'PEMBAYAR', 'ID WB', 'HP', 'POKOK', 'KETERANGAN', 'CATATAN', 'ID TAGIHAN', 'INVOICE', 'STATUS',
    'ID TRANSAKSI', 'DIBAYAR PADA', 'DIBUAT OLEH'],
  PERAN: ['Admin', 'Kepala Sekolah', 'Front Office', 'Bendahara'],
  JENIS_GW: 'Custom'
};

function vcWajibPeran_(p) {
  if (VC.PERAN.indexOf(String(p && p.peran || '')) < 0) throw new Error('VA custom untuk Admin, Kepala Sekolah, Front Office, dan Bendahara.');
}
function vcBaca_() {
  var t = absBaca_(VC.TAB, VC.HDR), out = [];
  for (var i = 1; i < t.v.length; i++) {
    var g = function(n) { return absNilai_(t, t.v[i], n); };
    var id = sTeks_(g('ID VA')).trim();
    if (!id) continue;
    out.push({ baris: i + 1, id: id, dibuatPada: sTeks_(g('DIBUAT PADA')), kategori: sTeks_(g('KATEGORI')).trim(), pembayar: sTeks_(g('PEMBAYAR')).trim(),
      idWb: sTeks_(g('ID WB')).trim(), hp: sTeks_(g('HP')).trim(), pokok: keuAngka_(g('POKOK')), keterangan: sTeks_(g('KETERANGAN')), catatan: sTeks_(g('CATATAN')),
      idTagihan: sTeks_(g('ID TAGIHAN')).trim(), invoice: sTeks_(g('INVOICE')).trim(), status: sTeks_(g('STATUS')).trim() || 'Menunggu',
      idTransaksi: sTeks_(g('ID TRANSAKSI')), dibayarPada: sTeks_(g('DIBAYAR PADA')), oleh: sTeks_(g('DIBUAT OLEH')) });
  }
  return { t: t, data: out };
}
function vcCari_(id) {
  var r = vcBaca_(), x = r.data.filter(function(v) { return v.id === String(id || ''); })[0];
  if (!x) throw new Error('VA custom tidak ditemukan.');
  return { t: r.t, x: x };
}
function vcUbah_(t, baris, isi) {
  Object.keys(isi).forEach(function(k) { var c = absCol_(t, k); if (c >= 0) t.sh.getRange(baris, c + 1).setValue(isi[k]); });
}
// "Pendaftaran" -> "Pembayaran Pendaftaran atas nama Budi"; nama kategori yang sudah diawali Pembayaran/Biaya/Iuran dipakai apa adanya.
function vcKeterangan_(namaKat, pembayar, catatan) {
  var n = String(namaKat || '').trim();
  var depan = /^(pembayaran|biaya|iuran|uang|sumbangan|infaq|donasi)\b/i.test(n) ? n : 'Pembayaran ' + n;
  var c = String(catatan || '').trim();
  return (depan + ' atas nama ' + String(pembayar || '').trim() + (c ? ' - ' + c : '')).slice(0, 200);
}

// Status sekarang. Siswa: dari tagihan (sisa); umum: dari kolom STATUS + order DOKU terakhir.
function vcStatus_(x, tagPeta, pb, wbPeta, gwPeta) {
  if (x.idTagihan) {
    var tag = tagPeta[x.idTagihan], w = wbPeta[x.idWb];
    if (!tag) return { status: 'Dibatalkan', dibayar: 0, sisa: 0 };
    var r = w ? keuRinci_(tag, [w], pb)[0] : null;
    var dib = r ? r.dibayar : 0, sisa = r ? r.sisa : tag.jumlah;
    if (r && r.sisa <= 0) return { status: 'Lunas', dibayar: dib, sisa: 0 };
    if (!tag.aktif) return { status: 'Dibatalkan', dibayar: dib, sisa: sisa };
    return { status: dib > 0 ? 'Sebagian' : 'Menunggu', dibayar: dib, sisa: sisa };
  }
  var o = x.invoice ? gwPeta[x.invoice] : null, st = x.status;
  if (st === 'Menunggu' && o && o['STATUS'] !== 'Menunggu' && o['STATUS'] !== 'Lunas') st = 'Kedaluwarsa';
  return { status: st, dibayar: st === 'Lunas' ? x.pokok : 0, sisa: st === 'Lunas' ? 0 : x.pokok };
}

// ---------- endpoint petugas ----------
function waStafVaCustomDaftar(token) {
  var p = stafDariToken_(token);
  vcWajibPeran_(p);
  var kat = keuKategori_().filter(function(k) { return k.jenis === 'Pemasukan' && k.kode !== 'ADP'; });   // ADP = biaya admin dari pembayar (otomatis)
  var katPeta = {}; kat.forEach(function(k) { katPeta[k.kode] = k; });
  var wbs = keuWbSemua_(), wbPeta = {}; wbs.forEach(function(w) { wbPeta[w.id] = w; });
  var tagPeta = {}; keuTagSemua_().data.forEach(function(t) { tagPeta[t.id] = t; });
  var pb = keuBayarPeta_(), gwPeta = {};
  gwBaca_().forEach(function(o) { if (o['JENIS'] === VC.JENIS_GW || o['JENIS'] === 'Tagihan') gwPeta[o['INVOICE']] = o; });
  var semua = keuKatPeta_();
  var data = vcBaca_().data.map(function(x) {
    var s = vcStatus_(x, tagPeta, pb, wbPeta, gwPeta), o = x.invoice ? gwPeta[x.invoice] : null, w = wbPeta[x.idWb];
    return { id: x.id, dibuatPada: x.dibuatPada, kategori: x.kategori, namaKategori: semua[x.kategori] ? semua[x.kategori].nama : x.kategori,
      pembayar: x.pembayar, siswa: !!x.idTagihan, idWb: x.idWb, rombel: w ? w.namaRombel : '', hp: x.hp, pokok: x.pokok, keterangan: x.keterangan, catatan: x.catatan,
      idTagihan: x.idTagihan, status: s.status, dibayar: s.dibayar, sisa: s.sisa, idTransaksi: x.idTransaksi, dibayarPada: x.dibayarPada || (o && o['STATUS'] === 'Lunas' ? o['DIBAYAR PADA'] : ''),
      oleh: x.oleh, invoice: x.invoice, orderStatus: o ? o['STATUS'] : '', url: o && o['STATUS'] === 'Menunggu' ? o['URL'] : '', kadaluarsa: o ? o['KADALUARSA'] : '',
      total: o ? Number(o['JUMLAH']) || 0 : 0, metode: o ? o['METODE'] : '' };
  }).reverse().slice(0, 500);
  var d = gwDoku_();
  return {
    kategori: kat.map(function(k) { return { kode: k.kode, nama: k.nama }; }), data: data,
    wb: wbs.filter(function(w) { return w.aktif; }).map(function(w) { return { id: w.id, nama: w.nama, rombel: w.namaRombel || '-' }; })
      .sort(function(a, b) { return a.nama.localeCompare(b.nama); }),
    online: d.aktif, metode: d.aktif ? gwMetode_(d.g) : [], lembaga: nilLembaga_().nama, peran: p.peran
  };
}

// d: {kategori, idWb (siswa) | nama + hp (umum), pokok, catatan, jatuhTempo?}
function waStafVaCustomBuat(token, d) {
  var p = stafDariToken_(token);
  vcWajibPeran_(p);
  d = d || {};
  var kat = keuKatPeta_()[String(d.kategori || '').trim()];
  if (!kat || kat.jenis !== 'Pemasukan') throw new Error('Pilih kode transaksi (kategori pemasukan) yang sudah ada.');
  var pokok = Math.round(keuAngka_(d.pokok));
  if (!(pokok >= 1000)) throw new Error('Nominal minimal Rp1.000.');
  if (pokok > 100000000) throw new Error('Nominal terlalu besar.');
  var w = null, nama = '', hp = '';
  if (String(d.idWb || '').trim()) {
    w = keuWbSemua_().filter(function(x) { return x.id === String(d.idWb).trim(); })[0];
    if (!w) throw new Error('Siswa tidak ditemukan di Data Induk.');
    nama = w.nama;
    hp = gwHpWb_(w.id).hp;
  } else {
    nama = String(d.nama || '').replace(/\s+/g, ' ').trim();
    if (nama.length < 3) throw new Error('Isi nama pembayar.');
    hp = String(d.hp || '').replace(/[^\d]/g, '').slice(0, 16);
  }
  var ket = vcKeterangan_(kat.nama, nama, d.catatan), id = 'VAC-' + absId_().toUpperCase(), idTag = '';
  if (w) {
    var t = absBaca_(KEU.TAB_TAG, KEU.HDR_TAG);
    idTag = 'TAG-' + absId_().toUpperCase();
    t.sh.appendRow(absBaris_(t, { 'ID TAGIHAN': idTag, 'NAMA': ket.slice(0, 120), 'KATEGORI': kat.kode, 'JUMLAH': pokok, 'SASARAN': 'Siswa', 'NILAI SASARAN': w.id,
      'JATUH TEMPO': d.jatuhTempo ? absTglSah_(d.jatuhTempo) : '', 'KETERANGAN': ('VA custom ' + id + ' oleh ' + p.nama).slice(0, 300),
      'TAHUN PELAJARAN': absSim_().tahun, 'AKTIF': true, 'DIBUAT OLEH': p.nama, 'DIBUAT PADA': absWaktu_() }));
  }
  var tv = absBaca_(VC.TAB, VC.HDR);
  tv.sh.appendRow(absBaris_(tv, { 'ID VA': id, 'DIBUAT PADA': absWaktu_(), 'KATEGORI': kat.kode, 'PEMBAYAR': nama, 'ID WB': w ? w.id : '', 'HP': hp, 'POKOK': pokok,
    'KETERANGAN': ket, 'CATATAN': String(d.catatan || '').slice(0, 150), 'ID TAGIHAN': idTag, 'STATUS': 'Menunggu', 'DIBUAT OLEH': p.nama }));
  catat_(p.peran, w ? w.idRombel : '-', p.nama, 'VA custom baru', id + ' ' + ket + ' ' + pokok, 'OK');
  if (idTag) npTagihanBaru_(idTag);   // tampil di Tagihan Saya + notifikasi ke siswa
  return { sukses: true, id: id, siswa: !!w, keterangan: ket };
}

// Buat / pakai ulang halaman bayar DOKU untuk metode terpilih (untuk QR di layar, gambar instruksi, atau link cadangan). d: {id, metode}
function waStafVaCustomBayar(token, d) {
  var p = stafDariToken_(token);
  vcWajibPeran_(p);
  d = d || {};
  var c = vcCari_(d.id), x = c.x, o;
  if (x.idTagihan) {
    var tag = keuTagCari_(x.idTagihan), w = keuWbSemua_().filter(function(v) { return v.id === x.idWb; })[0];
    if (!w || !tag.aktif) throw new Error('VA custom ini sudah dibatalkan.');
    var row = keuRinci_(tag, [w], keuBayarPeta_())[0];
    if (!row || row.sisa <= 0) throw new Error('VA custom ini sudah lunas.');
    var kontak = gwHpWb_(w.id);
    o = gwBuatOrder_({ jenis: 'Tagihan', ref: tag.id, idWb: w.id, nama: w.nama, judul: tag.nama, uraian: tag.nama, pokok: row.sisa, metode: d.metode,
      hp: kontak.hp, email: kontak.email, oleh: p.nama });
  } else {
    if (x.status !== 'Menunggu') throw new Error('VA custom ini berstatus ' + x.status + '.');
    o = gwBuatOrder_({ jenis: VC.JENIS_GW, ref: x.id, idWb: '', nama: x.pembayar, judul: x.keterangan, uraian: x.keterangan, pokok: x.pokok, metode: d.metode,
      hp: x.hp, oleh: p.nama });
  }
  vcUbah_(c.t, x.baris, { 'INVOICE': o.invoice });
  catat_(p.peran, '-', p.nama, 'VA custom halaman bayar', x.id + ' ' + o.invoice + ' ' + o.jumlah, 'OK');
  o.tagihan = x.keterangan; o.nama = x.pembayar; o.hp = x.hp; o.lembaga = nilLembaga_().nama; o.idVa = x.id;
  return o;
}
function waStafVaCustomCek(token, invoice) {
  var p = stafDariToken_(token);
  vcWajibPeran_(p);
  var inv = String(invoice || '');
  if (!vcBaca_().data.some(function(v) { return v.invoice === inv; })) throw new Error('Pembayaran tidak ditemukan.');
  return gwPeriksa_(inv);
}
// Batalkan VA yang belum dibayar. Siswa: tagihannya dinonaktifkan (hilang dari Tagihan Saya).
function waStafVaCustomBatal(token, id) {
  var p = stafDariToken_(token);
  vcWajibPeran_(p);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var c = vcCari_(id), x = c.x;
    if (x.idTagihan) {
      var r = keuTagSemua_(), tag = r.data.filter(function(t) { return t.id === x.idTagihan; })[0];
      if (tag) {
        var w = keuWbSemua_().filter(function(v) { return v.id === x.idWb; })[0];
        var row = w ? keuRinci_(tag, [w], keuBayarPeta_())[0] : null;
        if (row && row.dibayar > 0) throw new Error('Sudah ada pembayaran ' + honRp_(row.dibayar) + '; VA tidak bisa dibatalkan.');
        var col = absCol_(r.t, 'AKTIF');
        if (col >= 0) r.t.sh.getRange(tag.baris, col + 1).setValue(false);
      }
    } else {
      if (x.status === 'Lunas') throw new Error('VA custom ini sudah lunas.');
      if (x.invoice) { try { if (gwPeriksa_(x.invoice).status === 'Lunas') throw new Error('Pembayaran baru saja masuk; VA tidak dibatalkan.'); } catch (e) { if (/baru saja/.test(e.message)) throw e; } }
    }
    vcUbah_(c.t, x.baris, { 'STATUS': 'Dibatalkan' });
    catat_(p.peran, '-', p.nama, 'VA custom dibatalkan', x.id + ' ' + x.keterangan, 'OK');
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} kunci.releaseLock(); }
  return { sukses: true };
}

// ---------- pencatatan saat order DOKU "Custom" lunas (dipanggil gwSelesai_, sudah di dalam kunci) ----------
function vcCatat_(x, pokok, kanal, fee, total, adminBayar) {
  var c = null;
  try { c = vcCari_(x['REF']); } catch (e) {}
  if (!c || c.x.status !== 'Menunggu') {
    return gwCatatLain_(x, total, kanal, fee, 'VA custom ' + x['REF'] + (c ? ' berstatus ' + c.x.status : ' tidak ditemukan') + ' saat pembayaran DOKU masuk; periksa kemungkinan bayar ganda.');
  }
  var v = c.x, sumber = KEU.SUMBER_KAT[v.kategori] || 'Swadaya';
  var t = keuTrxTab_(), id = 'TRX-' + absId_().toUpperCase();
  t.sh.appendRow(absBaris_(t, kalGabung_(gwBarisDasar_(absHariIni_(), sumber), {
    'ID TRANSAKSI': id, 'JENIS': 'Pemasukan', 'KATEGORI KEUANGAN': v.kategori, 'JUMLAH': pokok, 'PIHAK TERKAIT': v.pembayar,
    'URAIAN': (v.keterangan + ' (DOKU ' + kanal + ', invoice ' + x['INVOICE'] + ', ' + v.id + ')').slice(0, 300),
    'CATATAN KEPUTUSAN': 'VA custom dibayar online; dicatat sebesar pokok, biaya admin dari pembayar dicatat terpisah'
  })));
  var a = adminBayar > 0 ? gwCatatAdminBayar_(x, adminBayar, kanal, sumber) : '';
  var b = gwCatatBiaya_(x, total, kanal, fee, sumber);
  vcUbah_(c.t, v.baris, { 'STATUS': 'Lunas', 'ID TRANSAKSI': id, 'DIBAYAR PADA': rfWaktu_(), 'INVOICE': x['INVOICE'] });
  try { catat_('Sistem', '', 'Gateway otomatis', 'VA custom lunas', v.id + ' ' + v.keterangan + ' ' + pokok, 'OK'); } catch (e2) {}
  npKirim_('va_custom_lunas', { judul: 'VA custom dibayar ' + honRp_(pokok), isi: v.keterangan + ' (' + (kanal || 'DOKU') + ').', aksi: 'va_custom', ref: 'gw|' + x['INVOICE'] });
  return [id, a, b].filter(String).join(',');
}
