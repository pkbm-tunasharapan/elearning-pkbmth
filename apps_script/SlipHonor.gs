// ============================================================================
// SLIP HONOR TUTOR (v1.72.0)
// - Satu slip per rekap honor (tutor × bulan) yang sudah dibayar (Dibayar / Dibayar Sebagian).
//   PDF disusun di aplikasi: F4 portrait, 2 slip per lembar, kop sama dengan kwitansi (kwKop_).
// - Rincian diambil dari rekap yang sudah dibekukan saat dihitung (HONOR PER HADIR & CATATAN), bukan dihitung ulang.
// - Penandatangan "Yang membayarkan" SELALU akun Bendahara aktif (nama orang), ditetapkan sekali saat slip pertama terbit.
// - Setiap unduhan wajib menyebut keperluannya; keperluan dicetak di slip dan dicatat di log.
// - Verifikasi: QR berisi /exec?sh=<kode>.
// - Yang boleh mengunduh: Admin, Superadmin (Ketua Yayasan), Kepala Sekolah, Bendahara (semua); Tutor (miliknya sendiri).
// ============================================================================
var SH = {
  TAB: 'SLIP HONOR',
  HDR: ['NOMOR', 'ID REKAP', 'KODE', 'TUTOR', 'BULAN', 'BERSIH', 'BENDAHARA', 'DITERBITKAN PADA', 'CETAK TERAKHIR OLEH', 'CETAK TERAKHIR PADA', 'KEPERLUAN TERAKHIR', 'JUMLAH CETAK'],
  MAKS: 60
};

function shBaca_() {
  var t = absBaca_(SH.TAB, SH.HDR), peta = {}, kode = {};
  for (var i = 1; i < t.v.length; i++) {
    var g = function(n) { return absNilai_(t, t.v[i], n); };
    var id = sTeks_(g('ID REKAP')).trim();
    if (!id) continue;
    var o = { baris: i + 1, nomor: sTeks_(g('NOMOR')).trim(), id: id, kode: sTeks_(g('KODE')).trim(), tutor: sTeks_(g('TUTOR')).trim(), bulan: sTeks_(g('BULAN')).trim(),
      bersih: keuAngka_(g('BERSIH')), bendahara: sTeks_(g('BENDAHARA')).trim(), kali: keuAngka_(g('JUMLAH CETAK')),
      oleh: sTeks_(g('CETAK TERAKHIR OLEH')), pada: sTeks_(g('CETAK TERAKHIR PADA')), keperluan: sTeks_(g('KEPERLUAN TERAKHIR')) };
    peta[id] = o; kode[o.kode] = o;
  }
  return { t: t, peta: peta, kode: kode };
}
function shUrl_(kode) {
  var u = '';
  try { u = ScriptApp.getService().getUrl(); } catch (e) {}
  return (u || '') + '?sh=' + encodeURIComponent(kode);
}

// Bendahara aktif (nama orang). Bila lebih dari satu, utamakan yang mencatat pembayaran.
function shBendahara_(olehBayar) {
  var daftar = typeof penggunaCache_ === 'function' ? penggunaCache_() : bacaPengguna_();
  var calon = daftar.filter(function(u) { return u.peran === 'Bendahara' && u.status === 'Aktif' && kwNamaSah_(u.nama); });
  var cocok = calon.filter(function(u) { return olehBayar.indexOf(String(u.nama).trim().toLowerCase()) >= 0; })[0];
  var u = cocok || calon[0];
  return u ? kwNamaSah_(u.nama) : '';
}

// Rincian beku dari baris rekap (format teks ditulis waStafHonorHitung).
function shRincian_(o) {
  var pend = [], m = /Bulanan Rp([\d.]+), potong Rp([\d.]+) x (\d+)/.exec(o.tarif || '');
  var w = /Wajib (\d+) pertemuan, tidak hadir (\d+)(?: \(([^)]*)\))?/.exec(o.catatan || '');
  var angka = function(s) { return Number(String(s).replace(/\./g, '')) || 0; };
  if (m) {
    var honor = angka(m[1]), per = angka(m[2]), n = Number(m[3]);
    pend.push({ label: 'Honor bulanan', nilai: honor });
    if (w) pend.push({ label: 'Pertemuan wajib / hadir', teks: w[1] + ' / ' + Math.max(0, Number(w[1]) - n) + ' pertemuan' });
    if (n > 0) pend.push({ label: 'Potongan tidak hadir (' + n + ' × ' + honRp_(per) + ')' + (w && w[3] ? ': ' + w[3] : ''), nilai: -per * n });
  } else {
    var tarif = Number(String(o.tarif).replace(/[^\d]/g, '')) || 0;
    pend.push({ label: 'Kehadiran', teks: o.jumlah + ' ' + (tarif ? '× ' + honRp_(tarif) : 'pertemuan (tarif per program)') });
  }
  return pend;
}

// Pembayaran sah sebuah rekap + PPh yang dipotong (dari Arus Keuangan).
function shBayar_(idRekap) {
  var t = absBaca_(HON.TAB_BAYAR), out = [];
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (sTeks_(absNilai_(t, r, 'REKAP HONOR')).trim() !== idRekap || sTeks_(absNilai_(t, r, 'DIBATALKAN')).trim()) continue;
    out.push({ tanggal: absTgl_(absNilai_(t, r, 'TANGGAL')), jumlah: keuAngka_(absNilai_(t, r, 'JUMLAH')), metode: sTeks_(absNilai_(t, r, 'METODE')),
      rekening: sTeks_(absNilai_(t, r, 'REKENING TUJUAN')), sumber: sTeks_(absNilai_(t, r, 'SUMBER DANA')), oleh: sTeks_(absNilai_(t, r, 'DIBAYAR OLEH')),
      idTrx: sTeks_(absNilai_(t, r, 'ID TRANSAKSI')).trim(), pph: 0 });
  }
  if (out.length) {
    var tx = absBaca_(KEU.TAB_TRX), pph = {};
    if (absCol_(tx, 'PPH') >= 0) for (var j = 1; j < tx.v.length; j++) pph[sTeks_(absNilai_(tx, tx.v[j], 'ID TRANSAKSI')).trim()] = keuAngka_(absNilai_(tx, tx.v[j], 'PPH'));
    out.forEach(function(b) { b.pph = pph[b.idTrx] || 0; });
  }
  out.sort(function(a, b) { return String(a.tanggal).localeCompare(String(b.tanggal)); });
  return out;
}

// ids: daftar ID REKAP; keperluan: wajib (dicetak di slip).
function waStafHonorSlip(token, ids, keperluan) {
  var p = stafDariToken_(token), hp = honPeran_(p);
  if (!hp.lihatSemua && !hp.tutor) throw new Error('Peran Anda tidak dapat mengunduh slip honor.');
  keperluan = String(keperluan || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (keperluan.length < 4) throw new Error('Tuliskan keperluan slip honor ini (mis. pengajuan pinjaman bank, arsip pribadi).');
  ids = (Array.isArray(ids) ? ids : [ids]).map(String).filter(String).slice(0, SH.MAKS);
  if (!ids.length) throw new Error('Pilih rekap honor.');
  var saya = hp.tutor ? absTutorSaya_(p) : null;
  if (hp.tutor && !saya) throw new Error('Akun Anda belum terhubung dengan data tutor di Data Induk.');
  var t = absBaca_(HON.TAB_REKAP), rekap = {};
  for (var i = 1; i < t.v.length; i++) { var o = honBarisRekap_(t, t.v[i]); rekap[o.id] = o; }
  var tutorPeta = absPetaTutor_();
  var data = ids.map(function(id) {
    var o = rekap[id];
    if (!o) throw new Error('Rekap honor tidak ditemukan.');
    if (saya && o.tutor !== saya.id) throw new Error('Slip ini tidak tersedia untuk Anda.');
    if (o.status !== 'Dibayar' && o.status !== 'Dibayar Sebagian') throw new Error('Slip honor ' + ((tutorPeta[o.tutor] || {}).nama || o.tutor) + ' ' + o.bulan + ' belum tersedia: honor belum dibayar.');
    var bayar = shBayar_(o.id);
    if (!bayar.length) throw new Error('Pembayaran honor ' + o.bulan + ' tidak ditemukan.');
    return { o: o, bayar: bayar };
  });
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  var hasil;
  try {
    var k = shBaca_(), kini = absWaktu_(), thn = Utilities.formatDate(new Date(), absTz_(), 'yyyy'), urut = 0;
    Object.keys(k.peta).forEach(function(id) {
      var m = /^SH\/(\d{4})\/(\d+)$/.exec(k.peta[id].nomor);
      if (m && m[1] === thn) urut = Math.max(urut, Number(m[2]));
    });
    hasil = data.map(function(d) {
      var o = d.o, s = k.peta[o.id];
      var dibayar = d.bayar.reduce(function(a, b) { return a + b.jumlah; }, 0), pph = d.bayar.reduce(function(a, b) { return a + b.pph; }, 0);
      if (!s) {
        var ben = shBendahara_(d.bayar.map(function(b) { return String(b.oleh).trim().toLowerCase(); }));
        if (!ben) throw new Error('Belum ada akun Bendahara aktif dengan nama lengkap. Slip honor ditandatangani Bendahara; tambahkan/ubah akunnya di Kelola Pengguna.');
        urut++;
        s = { nomor: 'SH/' + thn + '/' + ('000' + urut).slice(-4), id: o.id, kode: Utilities.getUuid().replace(/-/g, '').slice(0, 14).toUpperCase(), bendahara: ben, kali: 0 };
        k.t.sh.appendRow(absBaris_(k.t, { 'NOMOR': s.nomor, 'ID REKAP': o.id, 'KODE': s.kode, 'TUTOR': (tutorPeta[o.tutor] || {}).nama || o.tutor, 'BULAN': o.bulan,
          'BERSIH': dibayar - pph, 'BENDAHARA': ben, 'DITERBITKAN PADA': kini }));
        s.baris = k.t.sh.getLastRow ? k.t.sh.getLastRow() : 0;
      }
      if (s.baris) {
        var isi = { 'CETAK TERAKHIR OLEH': p.nama, 'CETAK TERAKHIR PADA': kini, 'KEPERLUAN TERAKHIR': keperluan, 'JUMLAH CETAK': (s.kali || 0) + 1, 'BERSIH': dibayar - pph };
        Object.keys(isi).forEach(function(h) { var c = absCol_(k.t, h); if (c >= 0) k.t.sh.getRange(s.baris, c + 1).setValue(isi[h]); });
      }
      var tt = tutorPeta[o.tutor] || { nama: o.tutor };
      return {
        id: o.id, nomor: s.nomor, url: shUrl_(s.kode), bulan: o.bulan, tutor: tt.nama, status: o.status,
        rincian: shRincian_(o), bruto: o.total, dibayar: dibayar, pph: pph, bersih: dibayar - pph, sisa: Math.max(0, o.total - dibayar),
        terbilang: kwTerbilang_(dibayar - pph),
        pembayaran: d.bayar.map(function(b) { return { tanggal: b.tanggal, jumlah: b.jumlah, metode: b.metode, rekening: b.rekening, sumber: b.sumber, pph: b.pph }; }),
        bendahara: { nama: s.bendahara, jabatan: 'Bendahara' }, keperluan: keperluan
      };
    });
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} kunci.releaseLock(); }
  catat_(p.peran, '-', p.nama, 'Unduh slip honor', (hasil.map(function(x) { return x.nomor; }).join(', ') + ' · keperluan: ' + keperluan).slice(0, 400), 'OK');
  return { slip: hasil, kop: kwKop_() };
}

// ---------- halaman verifikasi publik (doGet ?sh=KODE) ----------
function shHalaman_(kode) {
  var esc = function(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var s = null, o = null, lembaga = '', bersih = 0;
  try {
    s = shBaca_().kode[String(kode || '').trim().toUpperCase()] || null;
    if (s) {
      var t = absBaca_(HON.TAB_REKAP);
      for (var i = 1; i < t.v.length; i++) { var r = honBarisRekap_(t, t.v[i]); if (r.id === s.id) { o = r; break; } }
      var b = shBayar_(s.id);
      bersih = b.reduce(function(a, x) { return a + x.jumlah - x.pph; }, 0);
    }
    lembaga = nilLembaga_().nama;
  } catch (e) {}
  var sah = !!(s && o && (o.status === 'Dibayar' || o.status === 'Dibayar Sebagian') && Math.round(bersih) === Math.round(s.bersih));
  var baris = function(a, b) { return '<tr><td>' + esc(a) + '</td><td><b>' + esc(b) + '</b></td></tr>'; };
  var isi = !s ? '<p>Kode slip tidak dikenal. Slip honor ini <b>tidak terdaftar</b> di sistem lembaga.</p>'
    : '<table>' + baris('Nomor', s.nomor) + baris('Tutor', s.tutor) + baris('Bulan honor', s.bulan) + baris('Diterima bersih', honRp_(s.bersih))
      + baris('Bendahara', s.bendahara) + '</table>'
      + (sah ? '' : '<p>Data slip tidak lagi sesuai dengan pembayaran honor (dibatalkan atau diubah).</p>');
  var html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verifikasi Slip Honor</title>'
    + '<style>body{font-family:Arial,sans-serif;background:#f3f1f8;margin:0;padding:24px;color:#222}.k{max-width:520px;margin:auto;background:#fff;border-radius:14px;padding:22px;box-shadow:0 2px 10px rgba(0,0,0,.08)}'
    + '.s{font-size:26px;font-weight:800;padding:12px;border-radius:10px;text-align:center;color:#fff;background:' + (sah ? '#2e7d32' : '#c62828') + '}'
    + 'table{width:100%;border-collapse:collapse;margin-top:14px}td{padding:7px 4px;border-bottom:1px solid #eee;vertical-align:top;font-size:14px}td:first-child{color:#666;width:38%}</style></head><body><div class="k">'
    + '<div style="text-align:center;font-weight:700;margin-bottom:10px">' + esc(lembaga || 'PKBM') + '<br><span style="font-weight:400;color:#666">Verifikasi slip honor</span></div>'
    + '<div class="s">' + (sah ? '✔ SLIP HONOR SAH' : '✖ TIDAK BERLAKU') + '</div>' + isi
    + '<p style="color:#888;font-size:12px;margin-top:16px">Slip asli memuat tanda tangan Bendahara dan stempel lembaga.</p></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Verifikasi Slip Honor').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
