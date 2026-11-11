// ============================================================================
// LAPORAN ARUS KEUANGAN LEMBAGA (v1.47.0, Keuangan Tahap D)
// Satu paket laporan untuk periode bebas (bulan, semester, tahun pelajaran, tahun anggaran, tahap BOSP, kustom):
//   ringkasan & per sumber dana, arus per bulan, rincian pemasukan/pengeluaran per kategori, posisi kas per akun,
//   mutasi, pajak, lalu lampiran: tagihan WB, kewajiban cashback referral, honor belum dibayar, pengeluaran
//   menunggu persetujuan, dan (opsional) rincian transaksi.
// ============================================================================
function waStafKeuArus(token, q) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'lihat');
  q = q || {};
  var dasar = waStafKeuLaporan(token, { dari: q.dari, sampai: q.sampai });
  var dari = dasar.dari, sampai = dasar.sampai, semua = keuSemua_(), kat = keuKatPeta_();
  // per sumber dana: saldo awal, masuk, keluar, akhir
  var ps = {}, pb = {}, perKatSumber = {};
  var sumberRow = function(s) { return ps[s] || (ps[s] = { sumber: s, awal: 0, masuk: 0, keluar: 0 }); };
  KEU.SUMBER.forEach(sumberRow);
  semua.forEach(function(x) {
    if (!keuSah_(x) || x.jenis === 'Mutasi' || x.tanggal > sampai) return;
    var s = sumberRow(x.sumber || 'Lainnya'), v = x.jenis === 'Pengeluaran' ? -x.jumlah : x.jumlah;
    if (x.tanggal < dari) { s.awal += v; return; }
    if (v >= 0) s.masuk += v; else s.keluar -= v;
    var b = x.tanggal.slice(0, 7), m = pb[b] || (pb[b] = { bulan: b, masuk: 0, keluar: 0 });
    if (v >= 0) m.masuk += v; else m.keluar -= v;
    var kk = x.jenis + '|' + x.kategori, k = perKatSumber[kk] || (perKatSumber[kk] = { jenis: x.jenis, kode: x.kategori, nama: kat[x.kategori] ? kat[x.kategori].nama : x.kategori, jumlah: 0, n: 0, per: {} });
    k.jumlah += x.jumlah; k.n++;
    k.per[x.sumber || 'Lainnya'] = (k.per[x.sumber || 'Lainnya'] || 0) + x.jumlah;
  });
  var perSumber = Object.keys(ps).map(function(k) { var s = ps[k]; s.akhir = s.awal + s.masuk - s.keluar; return s; })
    .filter(function(s) { return s.awal || s.masuk || s.keluar; });
  var saldo = dasar.saldoAwal;
  var perBulan = Object.keys(pb).sort().map(function(k) { var m = pb[k]; saldo += m.masuk - m.keluar; m.saldo = saldo; return m; });
  var rincian = Object.keys(perKatSumber).map(function(k) { return perKatSumber[k]; })
    .sort(function(a, b) { return a.jenis.localeCompare(b.jenis) || b.jumlah - a.jumlah; });

  // lampiran: tagihan WB (aktif)
  var tagihan = [];
  try {
    var wbs = keuWbSemua_(), bayar = keuBayarPeta_();
    keuTagSemua_().data.filter(function(t) { return t.aktif; }).forEach(function(t) {
      var r = keuRinci_(t, wbs, bayar), o = { nama: t.nama, kategori: t.kategori, perWb: t.jumlah, wb: r.length, tagihan: 0, dibayar: 0, keringanan: 0, sisa: 0, lunas: 0 };
      r.forEach(function(w) { o.tagihan += w.tagihan; o.dibayar += w.dibayar; o.keringanan += w.keringanan; o.sisa += w.sisa; if (w.status === 'Lunas') o.lunas++; });
      tagihan.push(o);
    });
  } catch (e) {}
  // lampiran: kewajiban cashback referral
  var referral = { saldoPromotor: 0, promotor: 0, tarikMenunggu: 0, tarikDisetujui: 0, daftar: [] };
  try {
    var saldoP = {}, namaP = {};
    rfBaca_('SALDO').forEach(function(s) { saldoP[s['PROMOTOR KUNCI']] = (saldoP[s['PROMOTOR KUNCI']] || 0) + (Number(s['JUMLAH']) || 0); namaP[s['PROMOTOR KUNCI']] = s['PROMOTOR NAMA']; });
    Object.keys(saldoP).forEach(function(k) { if (saldoP[k] > 0) { referral.saldoPromotor += saldoP[k]; referral.promotor++; referral.daftar.push({ nama: namaP[k], saldo: saldoP[k] }); } });
    rfBaca_('TARIK').forEach(function(t) {
      if (t['STATUS'] === 'Menunggu') referral.tarikMenunggu += Number(t['JUMLAH']) || 0;
      if (t['STATUS'] === 'Disetujui') referral.tarikDisetujui += Number(t['JUMLAH']) || 0;
    });
    referral.daftar.sort(function(a, b) { return b.saldo - a.saldo; });
  } catch (e2) {}
  referral.total = referral.saldoPromotor + referral.tarikMenunggu + referral.tarikDisetujui;
  // lampiran: honor disetujui belum lunas
  var honor = [];
  try {
    var tr = absBaca_(HON.TAB_REKAP), byr = honPembayaran_(), tut = absPetaTutor_();
    for (var i = 1; i < tr.v.length; i++) {
      var o = honBarisRekap_(tr, tr.v[i]);
      if (o.status !== 'Disetujui' && o.status !== 'Dibayar Sebagian') continue;
      var dib = (byr[o.id] || []).reduce(function(s, x) { return s + x.jumlah; }, 0);
      if (o.total - dib <= 0) continue;
      honor.push({ bulan: o.bulan, nama: tut[o.tutor] ? tut[o.tutor].nama : o.tutor, total: o.total, dibayar: dib, sisa: o.total - dib, status: o.status });
    }
    honor.sort(function(a, b) { return (a.bulan + a.nama).localeCompare(b.bulan + b.nama); });
  } catch (e3) {}
  // lampiran: pengeluaran menunggu persetujuan
  var menunggu = semua.filter(function(x) { return x.status === 'Menunggu'; }).map(function(x) {
    return { id: x.id, tanggal: x.tanggal, uraian: x.uraian, kategori: x.kategori, sumber: x.sumber, jumlah: x.jumlah, dicatatOleh: x.dicatatOleh };
  });
  dasar.perSumberLengkap = perSumber;
  dasar.perBulan = perBulan;
  dasar.rincian = rincian;
  dasar.tagihan = tagihan;
  dasar.referral = referral;
  dasar.honor = honor;
  dasar.menungguDaftar = menunggu;
  dasar.judulPeriode = String(q.judul || '');
  dasar.dicetakOleh = p.nama;
  if (q.rinci !== true) dasar.baris = [];
  try { catat_(p.peran, '-', p.nama, 'Laporan arus keuangan', dari + ' s.d. ' + sampai, 'OK'); } catch (e4) {}
  return dasar;
}
