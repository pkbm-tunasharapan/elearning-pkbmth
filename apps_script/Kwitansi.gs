// ============================================================================
// KWITANSI PEMASUKAN & PENGELUARAN (v1.69.0)
// - Setiap transaksi Arus Keuangan yang sah (Disetujui, bukan mutasi) dapat dicetak sebagai kwitansi kapan saja.
//   Satu lembar F4 portrait = 3 kwitansi (PDF disusun di aplikasi).
// - Nomor tetap per transaksi (dibuat saat pertama dicetak): KW-M/<tahun>/0001 (pemasukan), KW-K/<tahun>/0001 (pengeluaran).
// - Penandatangan = nama akun yang mencetak + jabatannya (peran). Nama generik (admin, administrator, dll.) ditolak.
//   Siswa mengunduh kwitansinya sendiri dari Tagihan Saya; penandatangannya = petugas yang mencatat transaksi.
// - Verifikasi: QR berisi alamat /exec?kw=<kode>. Halaman itu memeriksa ke Arus Keuangan dan menyatakan SAH / TIDAK BERLAKU.
// - Stempel lembaga dibubuhkan basah di atas nama penandatangan setelah dicetak.
// ============================================================================
var KW = {
  TAB: 'KWITANSI',
  HDR: ['NOMOR', 'ID TRANSAKSI', 'KODE', 'JENIS', 'JUMLAH', 'DIBUAT PADA', 'CETAK TERAKHIR OLEH', 'JABATAN', 'CETAK TERAKHIR PADA', 'JUMLAH CETAK', 'PENERBIT', 'JABATAN PENERBIT'],
  PERAN: ['Admin', 'Bendahara', 'Kepala Sekolah', 'Front Office'],
  JABATAN: { 'Admin': 'Administrasi', 'Bendahara': 'Bendahara', 'Kepala Sekolah': 'Kepala Sekolah', 'Front Office': 'Front Office', 'Superadmin': 'Ketua Yayasan' },
  GENERIK: /^(admin|administrator|superadmin|super admin|staf|staff|user|pengguna|operator|test|tes|bendahara|front office|fo|kepala sekolah|ks|tu|sistem|system)$/i,
  MAKS: 60
};
if (typeof API_FLUTTER !== 'undefined' && API_FLUTTER && API_FLUTTER.TAMBAHAN) API_FLUTTER.TAMBAHAN.waSiswaKwitansi = true;

// ---------- terbilang ----------
function kwTerbilang_(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  var s = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  function t(x) {
    if (x < 12) return s[x];
    if (x < 20) return t(x - 10) + ' belas';
    if (x < 100) return t(Math.floor(x / 10)) + ' puluh' + (x % 10 ? ' ' + t(x % 10) : '');
    if (x < 200) return 'seratus' + (x - 100 ? ' ' + t(x - 100) : '');
    if (x < 1000) return t(Math.floor(x / 100)) + ' ratus' + (x % 100 ? ' ' + t(x % 100) : '');
    if (x < 2000) return 'seribu' + (x - 1000 ? ' ' + t(x - 1000) : '');
    if (x < 1e6) return t(Math.floor(x / 1000)) + ' ribu' + (x % 1000 ? ' ' + t(x % 1000) : '');
    if (x < 1e9) return t(Math.floor(x / 1e6)) + ' juta' + (x % 1e6 ? ' ' + t(x % 1e6) : '');
    if (x < 1e12) return t(Math.floor(x / 1e9)) + ' miliar' + (x % 1e9 ? ' ' + t(x % 1e9) : '');
    return t(Math.floor(x / 1e12)) + ' triliun' + (x % 1e12 ? ' ' + t(x % 1e12) : '');
  }
  var h = n === 0 ? 'nol' : t(n);
  return (h.charAt(0).toUpperCase() + h.slice(1) + ' rupiah').replace(/\s+/g, ' ');
}

// ---------- penandatangan ----------
function kwNamaSah_(nama) {
  var n = String(nama || '').replace(/\s+/g, ' ').trim();
  return n.length >= 3 && !KW.GENERIK.test(n) ? n : '';
}
function kwTtd_(p) {
  var nama = kwNamaSah_(p.nama);
  if (!nama) throw new Error('Nama akun Anda ("' + String(p.nama || '') + '") bukan nama orang. Ubah nama akun menjadi nama lengkap sebelum mencetak kwitansi.');
  return { nama: nama, jabatan: p.peranKustom || KW.JABATAN[p.peran] || p.peran };
}
// Penandatangan untuk kwitansi yang diunduh siswa: petugas pencatat transaksi.
function kwTtdPencatat_(x) {
  var n = kwNamaSah_(x.dicatatOleh);
  if (!n || /otomatis/i.test(String(x.dicatatOleh))) return { nama: '', jabatan: '', otomatis: true };
  var peran = '';
  try {
    var daftar = typeof penggunaCache_ === 'function' ? penggunaCache_() : bacaPengguna_();
    daftar.forEach(function(u) { if (!peran && String(u.nama || '').trim().toLowerCase() === n.toLowerCase()) peran = u.peranKustom || KW.JABATAN[u.peran] || u.peran; });
  } catch (e) {}
  return { nama: n, jabatan: peran || 'Petugas', otomatis: false };
}

// ---------- tab nomor ----------
function kwBaca_() {
  // v1.70.3: kolom penerbit (penandatangan tetap = yang pertama menerbitkan)
  ['PENERBIT', 'JABATAN PENERBIT'].forEach(function(k) { try { ubPastikanKolom_(KW.TAB, k); } catch (e) {} });
  var t = absBaca_(KW.TAB, KW.HDR), peta = {}, kode = {};
  for (var i = 1; i < t.v.length; i++) {
    var g = function(n) { return absNilai_(t, t.v[i], n); };
    var id = sTeks_(g('ID TRANSAKSI')).trim();
    if (!id) continue;
    var o = { baris: i + 1, nomor: sTeks_(g('NOMOR')).trim(), id: id, kode: sTeks_(g('KODE')).trim(), jenis: sTeks_(g('JENIS')).trim(), jumlah: keuAngka_(g('JUMLAH')),
      dibuat: sTeks_(g('DIBUAT PADA')), oleh: sTeks_(g('CETAK TERAKHIR OLEH')), jabatan: sTeks_(g('JABATAN')), pada: sTeks_(g('CETAK TERAKHIR PADA')),
      kali: keuAngka_(g('JUMLAH CETAK')), penerbit: sTeks_(g('PENERBIT')).trim(), jabatanPenerbit: sTeks_(g('JABATAN PENERBIT')).trim() };
    // kwitansi lama (sebelum v1.70.3): penerbit = pencetak yang tercatat
    if (!o.penerbit && o.oleh) { o.penerbit = o.oleh; o.jabatanPenerbit = o.jabatan; o.penerbitLama = true; }
    peta[id] = o; kode[o.kode] = o;
  }
  return { t: t, peta: peta, kode: kode };
}
function kwUrl_(kode) {
  var u = '';
  try { u = ScriptApp.getService().getUrl(); } catch (e) {}
  return (u || '') + '?kw=' + encodeURIComponent(kode);
}
function kwBolehCetak_(x) { return !!x && keuSah_(x) && (x.jenis === 'Pemasukan' || x.jenis === 'Pengeluaran') && x.jumlah > 0; }

// Terbitkan / perbarui nomor kwitansi untuk transaksi-transaksi ini, lalu kembalikan isi kwitansinya.
// v1.70.3: penandatangan TETAP = penerbit pertama (petugas yang pertama mencetak; bila pertama diunduh siswa = petugas
// pencatat transaksi). Cetak ulang oleh orang lain hanya mencatat "cetak terakhir", tidak mengganti penandatangan.
// ttd: petugas yang mencetak sekarang (null = unduhan siswa). Hasil o.ttd = penandatangan tetap ({nama, jabatan} / otomatis).
function kwTerbitkan_(trx, ttd, catatCetak) {
  var hasil = kwTerbitkanInti_(trx, ttd, catatCetak);
  return hasil;
}
function kwPenerbitBaru_(x, ttd) {
  if (ttd) return { nama: ttd.nama, jabatan: ttd.jabatan };
  var pc = kwTtdPencatat_(x);
  return pc.otomatis ? null : { nama: pc.nama, jabatan: pc.jabatan };
}
function kwTerbitkanInti_(trx, ttd, catatCetak) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var k = kwBaca_(), kini = absWaktu_(), thn = Utilities.formatDate(new Date(), absTz_(), 'yyyy'), urut = {};
    Object.keys(k.peta).forEach(function(id) {
      var m = /^(KW-[MK])\/(\d{4})\/(\d+)$/.exec(k.peta[id].nomor);
      if (m) { var key = m[1] + '/' + m[2]; urut[key] = Math.max(urut[key] || 0, Number(m[3])); }
    });
    return trx.map(function(x) {
      var o = k.peta[x.id];
      if (!o) {
        var awal = (x.jenis === 'Pengeluaran' ? 'KW-K' : 'KW-M') + '/' + thn, no = (urut[awal] || 0) + 1;
        urut[awal] = no;
        var pb = kwPenerbitBaru_(x, ttd);
        o = { nomor: awal + '/' + ('000' + no).slice(-4), id: x.id, kode: Utilities.getUuid().replace(/-/g, '').slice(0, 14).toUpperCase(), jenis: x.jenis, jumlah: x.jumlah, kali: 0,
          penerbit: pb ? pb.nama : '', jabatanPenerbit: pb ? pb.jabatan : '' };
        k.t.sh.appendRow(absBaris_(k.t, { 'NOMOR': o.nomor, 'ID TRANSAKSI': x.id, 'KODE': o.kode, 'JENIS': x.jenis, 'JUMLAH': x.jumlah, 'DIBUAT PADA': kini,
          'PENERBIT': o.penerbit, 'JABATAN PENERBIT': o.jabatanPenerbit }));
        o.baris = k.t.sh.getLastRow ? k.t.sh.getLastRow() : 0;
      } else if ((!o.penerbit || o.penerbitLama) && o.baris) {
        // kwitansi lama / diunduh siswa tanpa penerbit: tetapkan sekarang (sekali saja)
        var pl = o.penerbit ? { nama: o.penerbit, jabatan: o.jabatanPenerbit } : kwPenerbitBaru_(x, ttd);
        if (pl) {
          o.penerbit = pl.nama; o.jabatanPenerbit = pl.jabatan; o.penerbitLama = false;
          var isiP = { 'PENERBIT': pl.nama, 'JABATAN PENERBIT': pl.jabatan };
          Object.keys(isiP).forEach(function(h) { var c = absCol_(k.t, h); if (c >= 0) k.t.sh.getRange(o.baris, c + 1).setValue(isiP[h]); });
        }
      }
      o.ttd = o.penerbit ? { nama: o.penerbit, jabatan: o.jabatanPenerbit || 'Petugas' } : { nama: '', jabatan: '', otomatis: true };
      if (catatCetak && o.baris) {
        var isi = { 'CETAK TERAKHIR OLEH': catatCetak.nama, 'JABATAN': catatCetak.jabatan, 'CETAK TERAKHIR PADA': kini, 'JUMLAH CETAK': (o.kali || 0) + 1 };
        Object.keys(isi).forEach(function(h) { var c = absCol_(k.t, h); if (c >= 0) k.t.sh.getRange(o.baris, c + 1).setValue(isi[h]); });
      }
      return o;
    });
  } finally { kunci.releaseLock(); }
}

function kwIsi_(x, o, ttd, kat, wb, akun, lembaga) {
  var pihak = String(x.pihak || '').trim() || (wb[x.idWb] ? wb[x.idWb].nama : '') || '-';
  var cara = /DOKU|online/i.test(x.uraian) || x.dicatatOleh === 'Gateway otomatis' ? 'Pembayaran online (VA / QRIS)' : (akun[x.akun] || x.akun || 'Tunai');
  return {
    id: x.id, nomor: o.nomor, kode: o.kode, url: kwUrl_(o.kode), jenis: x.jenis, tanggal: x.tanggal, pihak: pihak,
    rombel: wb[x.idWb] ? wb[x.idWb].namaRombel : '', jumlah: x.jumlah, terbilang: kwTerbilang_(x.jumlah), uraian: String(x.uraian || '').replace(/\s*\((DOKU|invoice)[^)]*\)\s*$/i, ''),
    kategori: x.kategori + (kat[x.kategori] ? ' · ' + kat[x.kategori].nama : ''), cara: cara,
    ttd: ttd, lembaga: lembaga
  };
}
function kwKonteks_() {
  var kat = keuKatPeta_(), wb = {}, akun = {};
  keuWbSemua_().forEach(function(w) { wb[w.id] = w; });
  try { kalAkun_().forEach(function(a) { akun[a.kode] = a.nama; }); } catch (e) {}
  var l = nilLembaga_();
  return { kat: kat, wb: wb, akun: akun, lembaga: { nama: l.nama || 'PKBM', alamat: l.alamat || '', npsn: l.npsn || '' } };
}

// ---------- endpoint petugas ----------
function kwWajibPeran_(p) {
  if (KW.PERAN.indexOf(String(p && p.peran || '')) < 0) throw new Error('Kwitansi dicetak oleh Admin, Bendahara, Kepala Sekolah, atau Front Office.');
}
// q: {dari, sampai, jenis?} -> daftar transaksi sah untuk dipilih (maks. 500 terbaru).
function waStafKwitansiDaftar(token, q) {
  var p = stafDariToken_(token);
  kwWajibPeran_(p);
  q = q || {};
  var dari = String(q.dari || ''), sampai = String(q.sampai || ''), k = kwBaca_().peta, c = kwKonteks_();
  var data = keuSemua_().filter(function(x) {
    return kwBolehCetak_(x) && (!dari || x.tanggal >= dari) && (!sampai || x.tanggal <= sampai) && (!q.jenis || x.jenis === q.jenis);
  }).sort(function(a, b) { return b.tanggal.localeCompare(a.tanggal) || b.baris - a.baris; }).slice(0, 500).map(function(x) {
    var o = k[x.id];
    return { id: x.id, tanggal: x.tanggal, jenis: x.jenis, jumlah: x.jumlah, pihak: String(x.pihak || '').trim() || (c.wb[x.idWb] ? c.wb[x.idWb].nama : ''),
      uraian: x.uraian, kategori: x.kategori, nomor: o ? o.nomor : '', dicetak: o ? o.kali : 0, penerbit: o && o.penerbit ? o.penerbit + (o.jabatanPenerbit ? ' (' + o.jabatanPenerbit + ')' : '') : '' };
  });
  var ttd = null, galat = '';
  try { ttd = kwTtd_(p); } catch (e) { galat = e.message; }
  return { data: data, ttd: ttd, galatTtd: galat, maks: KW.MAKS };
}
// ids: daftar ID TRANSAKSI -> isi kwitansi (nomor diterbitkan bila belum ada).
function waStafKwitansi(token, ids) {
  var p = stafDariToken_(token);
  kwWajibPeran_(p);
  var ttd = null, galatTtd = '';
  try { ttd = kwTtd_(p); } catch (eT) { galatTtd = eT.message; }
  ids = (Array.isArray(ids) ? ids : [ids]).map(String).filter(String);
  if (!ids.length) throw new Error('Pilih transaksi.');
  if (ids.length > KW.MAKS) throw new Error('Maksimal ' + KW.MAKS + ' kwitansi sekali cetak.');
  var semua = {};
  keuSemua_().forEach(function(x) { semua[x.id] = x; });
  var trx = ids.map(function(id) {
    var x = semua[id];
    if (!kwBolehCetak_(x)) throw new Error('Transaksi ' + id + ' tidak dapat dibuatkan kwitansi (belum disetujui, mutasi, atau tidak ada).');
    return x;
  });
  // v1.70.3: nama akun pencetak hanya wajib sah bila ada kwitansi yang baru diterbitkan (penandatangan = penerbit pertama)
  if (!ttd) {
    var ada = kwBaca_().peta;
    if (trx.some(function(x) { return !ada[x.id] || !ada[x.id].penerbit; })) throw new Error(galatTtd);
  }
  var no = kwTerbitkan_(trx, ttd, { nama: p.nama, jabatan: (ttd && ttd.jabatan) || p.peran }), c = kwKonteks_();
  catat_(p.peran, '-', p.nama, 'Cetak kwitansi', no.map(function(o) { return o.nomor; }).join(', ').slice(0, 400), 'OK');
  return { kwitansi: trx.map(function(x, i) { return kwIsi_(x, no[i], no[i].ttd, c.kat, c.wb, c.akun, c.lembaga); }) };
}

// ---------- siswa: kwitansi pembayaran sendiri ----------
function waSiswaKwitansi(token, ids) {
  var s = siswaDariSesi_(token), w = ksWb_(s);
  ids = (Array.isArray(ids) ? ids : [ids]).map(String).filter(String).slice(0, KW.MAKS);
  var semua = {};
  keuSemua_().forEach(function(x) { semua[x.id] = x; });
  var trx = ids.map(function(id) {
    var x = semua[id];
    if (!kwBolehCetak_(x) || x.jenis !== 'Pemasukan' || x.idWb !== w.id) throw new Error('Kwitansi ini tidak tersedia untuk Anda.');
    return x;
  });
  if (!trx.length) throw new Error('Pilih pembayaran.');
  var no = kwTerbitkan_(trx, null, null), c = kwKonteks_();
  try { catat_('Siswa', s.idRombel, w.nama, 'Unduh kwitansi', no.map(function(o) { return o.nomor; }).join(', ').slice(0, 300), 'OK'); } catch (e) {}
  return { kwitansi: trx.map(function(x, i) { return kwIsi_(x, no[i], no[i].ttd, c.kat, c.wb, c.akun, c.lembaga); }) };
}

// ---------- halaman verifikasi publik (doGet ?kw=KODE) ----------
function kwHalaman_(kode) {
  var esc = function(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var o = null, x = null, lembaga = '';
  try {
    o = kwBaca_().kode[String(kode || '').trim().toUpperCase()] || null;
    if (o) x = keuSemua_().filter(function(t) { return t.id === o.id; })[0] || null;
    lembaga = nilLembaga_().nama;
  } catch (e) {}
  var sah = !!(o && x && kwBolehCetak_(x) && x.jenis === o.jenis && Math.round(x.jumlah) === Math.round(o.jumlah));
  var rp = function(n) { return 'Rp' + String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  var baris = function(a, b) { return '<tr><td>' + esc(a) + '</td><td><b>' + esc(b) + '</b></td></tr>'; };
  var isi = !o ? '<p>Kode kwitansi tidak dikenal. Kwitansi ini <b>tidak terdaftar</b> di sistem keuangan lembaga.</p>'
    : '<table>' + baris('Nomor', o.nomor) + baris('Jenis', o.jenis) + baris('Tanggal', x ? x.tanggal : '-')
      + baris(o.jenis === 'Pengeluaran' ? 'Dibayarkan kepada' : 'Diterima dari', x ? (String(x.pihak || '').trim() || '-') : '-')
      + baris('Jumlah', rp(o.jumlah)) + baris('Keterangan', x ? String(x.uraian || '').replace(/\s*\((DOKU|invoice)[^)]*\)\s*$/i, '') : '-')
      + (o.penerbit ? baris('Diterbitkan oleh', o.penerbit + (o.jabatanPenerbit ? ' (' + o.jabatanPenerbit + ')' : '')) : '')
      + (o.oleh ? baris('Dicetak terakhir', o.oleh + ' (' + o.jabatan + '), ' + o.pada) : '') + '</table>'
      + (sah ? '' : '<p>Data kwitansi tidak lagi sesuai dengan Arus Keuangan (transaksi dibatalkan, ditolak, atau diubah).</p>');
  var html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verifikasi Kwitansi</title>'
    + '<style>body{font-family:Arial,sans-serif;background:#f3f1f8;margin:0;padding:24px;color:#222}.k{max-width:520px;margin:auto;background:#fff;border-radius:14px;padding:22px;box-shadow:0 2px 10px rgba(0,0,0,.08)}'
    + '.s{font-size:26px;font-weight:800;padding:12px;border-radius:10px;text-align:center;color:#fff;background:' + (sah ? '#2e7d32' : '#c62828') + '}'
    + 'table{width:100%;border-collapse:collapse;margin-top:14px}td{padding:7px 4px;border-bottom:1px solid #eee;vertical-align:top;font-size:14px}td:first-child{color:#666;width:38%}</style></head><body><div class="k">'
    + '<div style="text-align:center;font-weight:700;margin-bottom:10px">' + esc(lembaga || 'PKBM') + '<br><span style="font-weight:400;color:#666">Verifikasi kwitansi</span></div>'
    + '<div class="s">' + (sah ? '✔ KWITANSI SAH' : '✖ TIDAK BERLAKU') + '</div>' + isi
    + '<p style="color:#888;font-size:12px;margin-top:16px">Kwitansi asli juga memuat tanda tangan dan stempel basah lembaga.</p></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Verifikasi Kwitansi').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
