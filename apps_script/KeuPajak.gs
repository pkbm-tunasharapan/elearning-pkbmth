// ============================================================================
// PAJAK (v1.46.0, Keuangan Tahap C)
// - PPN: centang "harga termasuk PPN" -> JUMLAH tetap (yang dibayar/diterima), dipisah DPP + PPN (kolom DPP, PPN).
//   Lembaga non-PKP tidak memungut PPN; untuk pembelian, PPN adalah bagian harga (informasi untuk laporan).
//   Tarif efektif bawaan 11% (PPN 12% x DPP nilai lain 11/12, PMK 131/2024) dan dapat diubah di Pengaturan Pajak.
// - PPh dipotong (PPh 21 / 23 / 4(2) / lainnya) pada pengeluaran: JUMLAH = bruto (beban lembaga), penerima
//   menerima bruto - PPh. Saat pengeluaran DISETUJUI, otomatis tercatat "Pajak dipungut" (Pemasukan, kategori PJK,
//   kolom INDUK = transaksi asal) - uang titipan negara yang masih ada di kas.
// - Setor pajak: pilih potongan yang belum disetor -> catat NTPN + bukti -> Pengeluaran PJK; potongan ditandai DISETOR.
// - Buku pembantu pajak: dipungut, disetor, belum disetor (titipan).
// Tarif hanya bawaan; aturan pajak yang berlaku dikonfirmasi ke KPP / konsultan pajak lembaga.
// ============================================================================
var PJK = {
  PROP: 'TH_KEU_PAJAK', KAT: 'PJK',
  BAWAAN: { ppnTarif: 11, pph21Tarif: 2.5, pph23Tarif: 2, pph42Tarif: 0.5 },
  JENIS_PPH: ['PPh 21', 'PPh 23', 'PPh 4(2)', 'PPh Lainnya'],
  KOLOM: ['DPP', 'PPN', 'TARIF PPN', 'PPH JENIS', 'TARIF PPH', 'PPH', 'INDUK', 'DISETOR', 'NTPN']
};

function pjkAturan_() {
  var a = JSON.parse(JSON.stringify(PJK.BAWAAN));
  try {
    var s = JSON.parse(PropertiesService.getScriptProperties().getProperty(PJK.PROP) || '{}');
    Object.keys(a).forEach(function(k) { if (s[k] !== undefined && isFinite(Number(s[k]))) a[k] = Number(s[k]); });
  } catch (e) {}
  a.jenisPph = PJK.JENIS_PPH;
  return a;
}
function pjkTarifBawaan_(jenis, a) {
  a = a || pjkAturan_();
  return jenis === 'PPh 21' ? a.pph21Tarif : jenis === 'PPh 23' ? a.pph23Tarif : jenis === 'PPh 4(2)' ? a.pph42Tarif : 0;
}
function waStafKeuPajakAturan(token, d) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  d = d || {};
  var a = pjkAturan_(), simpan = {};
  Object.keys(PJK.BAWAAN).forEach(function(k) {
    var n = d[k] !== undefined ? Number(String(d[k]).replace(',', '.')) : a[k];
    if (!(n >= 0 && n <= 50)) throw new Error('Tarif ' + k + ' harus 0–50%.');
    simpan[k] = Math.round(n * 100) / 100;
  });
  PropertiesService.getScriptProperties().setProperty(PJK.PROP, JSON.stringify(simpan));
  catat_(p.peran, '-', p.nama, 'Pengaturan pajak', JSON.stringify(simpan), 'OK');
  return { sukses: true, aturan: pjkAturan_() };
}

// Hitung pajak. ppn: {aktif, tarif}; pph: {jenis, tarif}. jumlah = yang dibayar/diterima (termasuk PPN bila aktif).
function pjkHitung_(jumlah, ppn, pph, jenisTrx) {
  var a = pjkAturan_(), h = { dpp: 0, ppn: 0, tarifPpn: 0, pphJenis: '', tarifPph: 0, pph: 0 };
  jumlah = Math.round(Number(jumlah) || 0);
  if (ppn && ppn.aktif === true) {
    var tp = ppn.tarif !== undefined && ppn.tarif !== '' ? Number(String(ppn.tarif).replace(',', '.')) : a.ppnTarif;
    if (!(tp > 0 && tp <= 50)) throw new Error('Tarif PPN tidak valid.');
    h.tarifPpn = tp;
    h.dpp = Math.round(jumlah * 100 / (100 + tp));
    h.ppn = jumlah - h.dpp;
  }
  if (pph && pph.jenis && jenisTrx === 'Pengeluaran') {
    if (PJK.JENIS_PPH.indexOf(String(pph.jenis)) < 0) throw new Error('Jenis PPh tidak dikenal.');
    var tr = pph.tarif !== undefined && pph.tarif !== '' ? Number(String(pph.tarif).replace(',', '.')) : pjkTarifBawaan_(pph.jenis, a);
    if (!(tr > 0 && tr <= 50)) throw new Error('Tarif ' + pph.jenis + ' tidak valid.');
    h.pphJenis = String(pph.jenis);
    h.tarifPph = tr;
    h.pph = Math.round((h.ppn ? h.dpp : jumlah) * tr / 100);   // PPh dihitung dari nilai tanpa PPN
    if (h.pph >= jumlah) throw new Error('Potongan PPh tidak boleh sebesar/lebih dari jumlah.');
  }
  return h;
}
function pjkKeKolom_(h) {
  return { 'DPP': h.ppn ? h.dpp : '', 'PPN': h.ppn || '', 'TARIF PPN': h.ppn ? h.tarifPpn : '', 'PPH JENIS': h.pphJenis, 'TARIF PPH': h.pph ? h.tarifPph : '', 'PPH': h.pph || '' };
}
function pjkLabel_(o) { return o.pphJenis + (o.tarifPph ? ' ' + String(o.tarifPph).replace('.', ',') + '%' : ''); }

// Catat "Pajak dipungut" untuk pengeluaran yang memotong PPh (sekali per transaksi asal).
function pjkPungut_(o) {
  if (!o || !(Number(o.pph) > 0) || o.jenis !== 'Pengeluaran') return '';
  var ada = keuSemua_().filter(function(x) { return x.induk === o.id && x.kategori === PJK.KAT && x.jenis === 'Pemasukan' && keuSah_(x); })[0];
  if (ada) return ada.id;
  rfKategori_(PJK.KAT, 'Pajak dipungut / disetor (titipan)', '');
  var t = keuTrxTab_(), id = 'TRX-' + absId_().toUpperCase(), sim = {};
  try { sim = absSim_(); } catch (e) {}
  t.sh.appendRow(absBaris_(t, {
    'ID TRANSAKSI': id, 'TANGGAL': o.tanggal || absHariIni_(), 'JENIS': 'Pemasukan', 'KATEGORI KEUANGAN': PJK.KAT,
    'URAIAN': ('Pajak dipungut ' + pjkLabel_(o) + ' · ' + o.uraian).slice(0, 300), 'JUMLAH': Math.round(Number(o.pph)), 'SUMBER DANA': o.sumber || '',
    'PIHAK TERKAIT': o.pihak || '', 'STATUS': 'Disetujui', 'DIPUTUS OLEH': 'Sistem (potongan pajak)', 'TANGGAL KEPUTUSAN': absWaktu_(),
    'CATATAN KEPUTUSAN': 'Titipan pajak dari ' + o.id + ', wajib disetor', 'TAHUN PELAJARAN': o.tahun || sim.tahun || '', 'DICATAT OLEH': 'Sistem', 'DICATAT PADA': absWaktu_(),
    'AKUN KAS': o.akun || '', 'PPH JENIS': o.pphJenis, 'TARIF PPH': o.tarifPph || '', 'INDUK': o.id
  }));
  return id;
}
// Pembatalan yang tidak boleh: potongan langsung, atau induk yang pajaknya sudah disetor.
function pjkBolehBatal_(o) {
  if (o.kategori === PJK.KAT && o.jenis === 'Pemasukan' && o.induk) throw new Error('Pajak dipungut mengikuti transaksi asalnya (' + o.induk + ').');
  if (Number(o.pph) > 0) {
    var s = keuSemua_().filter(function(x) { return x.induk === o.id && x.kategori === PJK.KAT && keuSah_(x) && x.disetor; })[0];
    if (s) throw new Error('Potongan ' + pjkLabel_(o) + ' transaksi ini sudah disetor (' + s.disetor + '). Batalkan setorannya dulu.');
  }
}
// Dipanggil setelah transaksi disetujui / ditolak / dibatalkan.
function pjkSetelahPutus_(o, status) {
  if (!o) return;
  try {
    if (o.jenis === 'Pengeluaran' && Number(o.pph) > 0) {
      if (status === 'Disetujui') pjkPungut_(o);
      else if (status === 'Dibatalkan') {
        var t = keuTrxTab_();
        keuSemua_(t).forEach(function(x) {
          if (x.induk !== o.id || x.kategori !== PJK.KAT || !keuSah_(x) || x.disetor) return;
          keuUbahBaris_(t, x.id, function() { return { 'STATUS': 'Dibatalkan', 'TANGGAL KEPUTUSAN': absWaktu_(), 'CATATAN KEPUTUSAN': 'Ikut dibatalkan bersama ' + o.id }; });
        });
      }
    }
    if (o.kategori === PJK.KAT && o.jenis === 'Pengeluaran' && status === 'Dibatalkan') {   // setoran dibatalkan
      var t2 = keuTrxTab_(), c = absCol_(t2, 'DISETOR');
      for (var i = 1; i < t2.v.length; i++) {
        var ds = sTeks_(absNilai_(t2, t2.v[i], 'DISETOR'));
        if (ds && ds.split(',').indexOf(o.id) >= 0) t2.sh.getRange(i + 1, c + 1).setValue('');
      }
    }
  } catch (e) { try { catat_('Sistem', '-', 'Sistem', 'Pajak GAGAL', o.id + ': ' + ((e && e.message) || e), 'GAGAL'); } catch (e2) {} }
}

// d: {ids:[id potongan], tanggal, ntpn, akun, bukti?}
function waStafKeuSetorPajak(token, d) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  d = d || {};
  var ids = (Array.isArray(d.ids) ? d.ids : []).map(String);
  if (!ids.length) throw new Error('Pilih potongan pajak yang disetor.');
  var ntpn = String(d.ntpn || '').trim().toUpperCase().slice(0, 40);
  if (ntpn.length < 5) throw new Error('Isi NTPN / nomor bukti setor dari bank / DJP.');
  var tgl = absTglSah_(d.tanggal || absHariIni_()), akun = kalAkunSah_(d.akun);
  if (!akun) throw new Error('Pilih akun kas yang dipakai menyetor.');
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var t = keuTrxTab_(), semua = keuSemua_(t), pilih = semua.filter(function(x) { return ids.indexOf(x.id) >= 0; });
    if (pilih.length !== ids.length) throw new Error('Sebagian potongan tidak ditemukan.');
    pilih.forEach(function(x) {
      if (x.kategori !== PJK.KAT || x.jenis !== 'Pemasukan' || !keuSah_(x)) throw new Error(x.id + ' bukan potongan pajak yang sah.');
      if (x.disetor) throw new Error(x.id + ' sudah disetor (' + x.disetor + ').');
    });
    var bukti = d.bukti ? keuSimpanBukti_(d.bukti, 'SETOR-PAJAK-' + tgl + '-' + ntpn) : '';
    var grup = {};
    pilih.forEach(function(x) { (grup[x.sumber || ''] = grup[x.sumber || ''] || []).push(x); });
    var sim = absSim_(), hasil = [];
    Object.keys(grup).forEach(function(sumber) {
      var g = grup[sumber], jml = g.reduce(function(s, x) { return s + x.jumlah; }, 0);
      var jenis = g.map(function(x) { return x.pphJenis; }).filter(function(v, i, a) { return v && a.indexOf(v) === i; }).join(', ');
      var id = 'TRX-' + absId_().toUpperCase();
      t.sh.appendRow(absBaris_(t, {
        'ID TRANSAKSI': id, 'TANGGAL': tgl, 'JENIS': 'Pengeluaran', 'KATEGORI KEUANGAN': PJK.KAT,
        'URAIAN': ('Setor ' + (jenis || 'pajak') + ' · NTPN ' + ntpn + ' · ' + g.length + ' potongan').slice(0, 300), 'JUMLAH': jml, 'SUMBER DANA': sumber,
        'PIHAK TERKAIT': 'Kas Negara', 'BUKTI': bukti, 'STATUS': 'Disetujui', 'DIPUTUS OLEH': 'Kewajiban pajak', 'TANGGAL KEPUTUSAN': absWaktu_(),
        'CATATAN KEPUTUSAN': 'Setoran potongan ' + g.map(function(x) { return x.id; }).join(', '), 'TAHUN PELAJARAN': sim.tahun, 'DICATAT OLEH': p.nama,
        'DICATAT PADA': absWaktu_(), 'AKUN KAS': akun, 'PPH JENIS': jenis, 'NTPN': ntpn
      }));
      hasil.push(id);
      var c = absCol_(t, 'DISETOR');
      g.forEach(function(x) { t.sh.getRange(x.baris, c + 1).setValue(id); });
    });
    catat_(p.peran, '-', p.nama, 'Setor pajak', hasil.join(',') + ' NTPN ' + ntpn, 'OK');
    return { sukses: true, id: hasil };
  } finally { lock.releaseLock(); }
}

// Buku pembantu pajak. q: {dari, sampai}
function waStafKeuPajak(token, q) {
  var p = stafDariToken_(token), r = keuWajib_(p, 'lihat');
  q = q || {};
  var bi = keuBulanIni_(), dari = q.dari ? absTglSah_(q.dari) : bi.dari, sampai = q.sampai ? absTglSah_(q.sampai) : bi.sampai;
  var semua = keuSemua_(), peta = {}, ap = kalAkunPeta_();
  semua.forEach(function(x) { peta[x.id] = x; });
  var potong = [], setor = [], perJenis = {}, ppn = { masukan: 0, keluaran: 0, baris: [] }, belum = 0;
  var jn = function(k) { return perJenis[k] || (perJenis[k] = { jenis: k, dipungut: 0, disetor: 0 }); };
  semua.forEach(function(x) {
    if (!keuSah_(x)) return;
    var diPeriode = x.tanggal >= dari && x.tanggal <= sampai;
    if (x.kategori === PJK.KAT && x.jenis === 'Pemasukan') {
      if (!x.disetor) belum += x.jumlah;
      var ind = peta[x.induk] || {};
      if (diPeriode || !x.disetor) potong.push({ id: x.id, tanggal: x.tanggal, jenis: x.pphJenis, tarif: x.tarifPph, jumlah: x.jumlah, induk: x.induk,
        uraianInduk: ind.uraian || '', pihak: x.pihak, bruto: ind.jumlah || 0, sumber: x.sumber, disetor: x.disetor, diPeriode: diPeriode });
      if (diPeriode) jn(x.pphJenis || 'PPh').dipungut += x.jumlah;
      var sr = x.disetor ? peta[x.disetor] : null;
      if (sr && sr.tanggal >= dari && sr.tanggal <= sampai) jn(x.pphJenis || 'PPh').disetor += x.jumlah;
    } else if (x.kategori === PJK.KAT && x.jenis === 'Pengeluaran' && diPeriode) {
      setor.push({ id: x.id, tanggal: x.tanggal, uraian: x.uraian, jumlah: x.jumlah, ntpn: x.ntpn, jenis: x.pphJenis, akun: ap[x.akun] ? ap[x.akun].nama : x.akun, adaBukti: !!x.bukti });
    } else if (Number(x.ppn) > 0 && diPeriode) {
      if (x.jenis === 'Pengeluaran') ppn.masukan += Number(x.ppn); else ppn.keluaran += Number(x.ppn);
      ppn.baris.push({ id: x.id, tanggal: x.tanggal, jenis: x.jenis, uraian: x.uraian, pihak: x.pihak, jumlah: x.jumlah, dpp: x.dpp, ppn: x.ppn, tarif: x.tarifPpn });
    }
  });
  potong.sort(function(a, b) { return a.tanggal.localeCompare(b.tanggal); });
  setor.sort(function(a, b) { return a.tanggal.localeCompare(b.tanggal); });
  return { dari: dari, sampai: sampai, aturan: pjkAturan_(), potong: potong, setor: setor, perJenis: Object.keys(perJenis).map(function(k) { return perJenis[k]; }),
    belumDisetor: belum, ppn: ppn, akun: kalAkun_().filter(function(a) { return a.aktif !== false; }), catat: r.catat, lembaga: nilLembaga_() };
}
