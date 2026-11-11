// ============================================================================
// ALUR KEUANGAN (v1.44.0, Tahap A)
// - Pendaftaran referral dicatat sebagai PEMASUKAN saat LUNAS (tanggal bayar), bukan saat semua verifikasi selesai.
// - Lewat Midtrans: pemasukan = jumlah yang dibayar pendaftar (gross_amount); biaya layanan gateway dicatat
//   TERPISAH sebagai pengeluaran ADM yang menyebut nomor order yang sama (transparan: kotor, biaya, bersih).
// - Pengembalian dana pendaftaran (KMB): diajukan Bendahara, diputus Ketua Yayasan di menu Keuangan.
// - Penarikan cashback: disetujui Ketua Yayasan dulu, baru dibayar Bendahara.
// - Pembatalan pembayaran honor oleh Ketua Yayasan (transaksi HON ikut Dibatalkan, rekap kembali terbuka).
// - Pemeriksaan saldo sumber dana sebelum pengeluaran disetujui/dibayar: SALDO_KURANG -> aplikasi meminta
//   konfirmasi -> paksa (tercatat di log sebagai PERINGATAN).
// - Pencatatan kas otomatis yang gagal tidak lagi diam: dicatat GAGAL di log dan diulang otomatis.
// ============================================================================
var KAL = { KAT_ADM: 'ADM', KAT_KMB: 'KMB' };

function kalGabung_(a, b) {
  var o = {};
  Object.keys(a).forEach(function(k) { o[k] = a[k]; });
  Object.keys(b).forEach(function(k) { o[k] = b[k]; });
  return o;
}
function kalRp_(n) { n = Math.round(Number(n) || 0); return (n < 0 ? '-' : '') + honRp_(Math.abs(n)); }

// Pastikan kolom ada di tab (ditambah di kanan bila belum ada).
function kalKolom_(nama, kolom) {
  var t = absBaca_(nama);
  if (absCol_(t, kolom) < 0) {
    t.sh.getRange(1, t.sh.getLastColumn() + 1).setValue(kolom).setFontWeight('bold');
    absLupakan_(nama);
    t = absBaca_(nama);
  }
  return t;
}

// ---------- saldo sumber dana ----------
function kalSaldoSumber_(sumber) {
  var s = String(sumber || 'Lainnya'), n = 0;
  keuSemua_().forEach(function(x) {
    if (keuSah_(x) && x.jenis !== 'Mutasi' && (x.sumber || 'Lainnya') === s) n += x.jenis === 'Pengeluaran' ? -x.jumlah : x.jumlah;
  });
  return n;
}
function kalCekSaldo_(sumber, jumlah, paksa, p, ket) {
  var saldo = kalSaldoSumber_(sumber), akhir = saldo - (Number(jumlah) || 0);
  if (akhir >= 0) return;
  var pesan = 'Saldo dana ' + (sumber || 'Lainnya') + ' ' + kalRp_(saldo) + ', pengeluaran ' + kalRp_(jumlah) + ', saldo menjadi ' + kalRp_(akhir) + '.';
  if (!paksa) throw new Error('SALDO_KURANG: ' + pesan);
  try { catat_(p.peran, '-', p.nama, 'Saldo minus (dikonfirmasi)', (ket || '') + ' ' + pesan, 'PERINGATAN'); } catch (e) {}
}

// ---------- referral: kas pendaftaran ----------
function kalTglBayar_(x) {
  var s = String(x['VERIF BAYAR PADA'] || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : absHariIni_();
}
// Catat pemasukan pendaftaran (sekali saja; kolom ID TRANSAKSI menandai sudah). viaGw = dibayar lewat Midtrans.
function rfCatatBayar_(x, oleh, viaGw) {
  if (x['ID TRANSAKSI']) return x['ID TRANSAKSI'];
  var at = rfAturan_(), g = at.gateway || {};
  var jml = Math.round(Number(x['JUMLAH BAYAR']) || Number(at.biaya) || 0);
  if (!(jml > 0)) return '';
  var d = rfJson_(x['DATA'], {}), sim = {};
  try { sim = absSim_(); } catch (e) {}
  var tgl = kalTglBayar_(x), nama = d.nama || x['NAMA'], order = String(x['ORDER GATEWAY'] || ''), idWb = x['ID WB'] && x['ID WB'] !== '-' ? x['ID WB'] : '';
  var pg = kalNamaPenyedia_(g);
  var dasar = { 'TANGGAL': tgl, 'STATUS': 'Disetujui', 'TANGGAL KEPUTUSAN': tgl, 'TAHUN PELAJARAN': sim.tahun || '', 'DICATAT OLEH': oleh.nama, 'DICATAT PADA': absWaktu_() };
  rfKategori_(RF.KAT_DAF, 'Biaya Pendaftaran', 'Pemasukan');
  var ids = [rfTrx_(kalGabung_(dasar, {
    'JENIS': 'Pemasukan', 'KATEGORI KEUANGAN': RF.KAT_DAF, 'WARGA BELAJAR': idWb,
    'URAIAN': ('Pendaftaran ' + nama + ' (' + x['ID'] + ', ' + (x['METODE BAYAR'] || '-') + (viaGw ? ', order ' + pg + ' ' + order : '') + ')').slice(0, 300),
    'AKUN KAS': viaGw ? kalAkunBawaan_('gateway') : kalAkunBawaan_(x['METODE BAYAR'] || 'sekretariat'),
    'JUMLAH': jml, 'SUMBER DANA': 'Swadaya', 'PIHAK TERKAIT': nama, 'BUKTI': x['BUKTI BAYAR'] || '', 'DIPUTUS OLEH': oleh.nama,
    'CATATAN KEPUTUSAN': viaGw ? 'Dibayar lewat ' + pg + '; dicatat sebesar yang dibayar pendaftar' : 'Pendaftaran referral (otomatis saat lunas)'
  }))];
  if (viaGw) {
    var persen = Number(g.biayaPersen) || 0, tetap = Math.round(Number(g.biayaTetap) || 0);
    var biaya = oleh.biayaGw ? oleh.biayaGw.biaya : Math.round(jml * persen / 100) + tetap;   // v1.48.0: biaya per kanal DOKU
    if (biaya > 0) {
      rfKategori_(KAL.KAT_ADM, 'Biaya Administrasi Payment Gateway', 'Pengeluaran');
      ids.push(rfTrx_(kalGabung_(dasar, {
        'JENIS': 'Pengeluaran', 'KATEGORI KEUANGAN': KAL.KAT_ADM,
        'AKUN KAS': kalAkunBawaan_('gateway'),
        'URAIAN': ('Biaya layanan ' + pg + (oleh.biayaGw ? ' ' + oleh.biayaGw.ket : ' QRIS' + (persen ? ' ' + persen + '%' : '') + (tetap ? ' + ' + honRp_(tetap) : '')) + ' atas ' + honRp_(jml) +
          ' (order ' + order + ', pendaftaran ' + x['ID'] + ' ' + nama + ')').slice(0, 300),
        'JUMLAH': biaya, 'SUMBER DANA': 'Swadaya', 'PIHAK TERKAIT': pg, 'DIPUTUS OLEH': 'Sistem (dipotong otomatis oleh gateway)',
        'CATATAN KEPUTUSAN': 'Dibayar ' + honRp_(jml) + ' - biaya ' + honRp_(biaya) + ' = diterima bersih ' + honRp_(jml - biaya) + '. Sesuaikan bila laporan ' + pg + ' berbeda.'
      })));
    }
  }
  var s = ids.join(',');
  rfUbah_('DAFTAR', x._baris, { 'ID TRANSAKSI': s });
  x['ID TRANSAKSI'] = s;
  try { catat_(oleh.peran || 'Sistem', '', oleh.nama, 'Kas pendaftaran', x['ID'] + ' ' + honRp_(jml) + (ids.length > 1 ? ' (+ biaya gateway)' : ''), 'OK'); } catch (e2) {}
  return s;
}
// Versi aman: galat tidak menggagalkan verifikasi, tetapi tercatat GAGAL di log dan diulang otomatis (rfPulihkanKas_).
function rfCatatBayarAman_(x, oleh, viaGw) {
  try { return rfCatatBayar_(x, oleh, viaGw); } catch (e) {
    try { catat_(oleh.peran || 'Sistem', '', oleh.nama, 'Kas pendaftaran GAGAL', x['ID'] + ': ' + ((e && e.message) || e), 'GAGAL'); } catch (e2) {}
    return '';
  }
}
// Pendaftaran lunas yang belum punya transaksi kas. Data lama yang sudah selesai (ID WB terisi) sudah tercatat saat selesai.
function rfPulihkanKas_() {
  rfBaca_('DAFTAR').forEach(function(x) {
    if (x['STATUS BAYAR'] !== 'Lunas' || x['ID TRANSAKSI'] || x['ID WB']) return;
    rfCatatBayarAman_(x, { nama: x['VERIF BAYAR OLEH'] || 'Sistem', peran: 'Sistem' }, /otomatis/i.test(x['VERIF BAYAR OLEH'] || ''));
  });
}
// Setelah WB dibuat, transaksi pendaftaran ditautkan ke ID WB.
function kalTautWb_(ids, idWb) {
  if (!ids || !idWb || idWb === '-') return;
  try { keuUbahBaris_(keuTrxTab_(), String(ids).split(',')[0], function() { return { 'WARGA BELAJAR': idWb }; }); } catch (e) {}
}

// ---------- referral: pengembalian dana ----------
// Bendahara: ajukan pengembalian dana pendaftaran yang sudah lunas tetapi tidak jadi (belum menjadi WB).
function waStafRefKembaliAjukan(token, id, jumlah, alasan, bukti) {
  var r = rfPetugas_(token);
  if (!r.bendahara) throw new Error('Pengembalian dana diajukan oleh Bendahara.');
  var x = rfCari_(id);
  if (x['STATUS BAYAR'] !== 'Lunas') throw new Error('Hanya pembayaran berstatus Lunas yang dapat dikembalikan.');
  if (x['ID WB']) throw new Error('Pendaftaran sudah selesai (sudah menjadi warga belajar). Pengembalian dicatat manual di Keuangan.');
  alasan = String(alasan || '').trim();
  if (alasan.length < 5) throw new Error('Tulis alasan pengembalian (minimal 5 huruf).');
  rfCatatBayar_(x, r.p, /otomatis/i.test(x['VERIF BAYAR OLEH'] || ''));   // pemasukannya harus tercatat lebih dulu
  var dibayar = Math.round(Number(x['JUMLAH BAYAR']) || 0);
  var jml = Math.round(Number(jumlah) || dibayar);
  if (!(jml > 0) || jml > dibayar) throw new Error('Jumlah pengembalian harus 1 s.d. ' + honRp_(dibayar) + '.');
  rfKategori_(KAL.KAT_KMB, 'Pengembalian Dana Pendaftaran', 'Pengeluaran');
  var sim = {};
  try { sim = absSim_(); } catch (e) {}
  var f = bukti ? keuSimpanBukti_(bukti, 'KEMBALI_' + id + '_' + Utilities.formatDate(new Date(), absTz_(), 'yyyyMMdd_HHmmss')) : '';
  var idTrx = 'TRX-' + absId_().toUpperCase();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = keuTrxTab_();
    t.sh.appendRow(absBaris_(t, {
      'ID TRANSAKSI': idTrx, 'TANGGAL': absHariIni_(), 'JENIS': 'Pengeluaran', 'KATEGORI KEUANGAN': KAL.KAT_KMB,
      'URAIAN': ('Pengembalian dana pendaftaran ' + x['NAMA'] + ' (' + id + '): ' + alasan).slice(0, 300), 'JUMLAH': jml, 'SUMBER DANA': 'Swadaya',
      'PIHAK TERKAIT': x['NAMA'], 'BUKTI': f, 'STATUS': 'Menunggu', 'AKUN KAS': kalAkunBawaan_('transfer'), 'TAHUN PELAJARAN': sim.tahun || '', 'DICATAT OLEH': r.p.nama, 'DICATAT PADA': absWaktu_()
    }));
  } finally { lock.releaseLock(); }
  rfUbah_('DAFTAR', x._baris, { 'STATUS BAYAR': 'Pengembalian Diajukan', 'ID TRX KEMBALI': idTrx,
    'CATATAN BAYAR': ('Pengembalian ' + honRp_(jml) + ' diajukan: ' + alasan).slice(0, 300), 'DIPERBARUI': rfWaktu_() });
  rfNotif_(x['PROMOTOR KUNCI'], 'Pengembalian dana diajukan: ' + x['NAMA'], 'Pengembalian ' + honRp_(jml) + ' menunggu persetujuan Ketua Yayasan.');
  try { catat_(r.p.peran, '', r.p.nama, 'Ajukan pengembalian dana', id + ' ' + honRp_(jml) + ': ' + alasan, 'OK'); } catch (e2) {}
  npKirim_('pengeluaran_menunggu', { judul: 'Pengembalian dana menunggu persetujuan', isi: honRp_(jml) + ' untuk ' + x['NAMA'] + ': ' + alasan.slice(0, 120), aksi: 'keuangan', ref: idTrx });   // v1.50.0: notifikasi
  return { sukses: true, idTransaksi: idTrx };
}
// Dipanggil setelah transaksi diputus / dibatalkan di menu Keuangan.
function kalSetelahPutus_(o, status) {
  pjkSetelahPutus_(o, status);   // v1.46.0: potongan pajak ikut status transaksi asal
  if (!o || o.kategori !== KAL.KAT_KMB) return;
  try {
    var x = rfBaca_('DAFTAR').filter(function(y) { return y['ID TRX KEMBALI'] === o.id; })[0];
    if (!x) return;
    if (status === 'Disetujui') {
      rfUbah_('DAFTAR', x._baris, { 'STATUS BAYAR': 'Dikembalikan', 'CATATAN BAYAR': ('Dana ' + honRp_(o.jumlah) + ' dikembalikan (disetujui).').slice(0, 300), 'DIPERBARUI': rfWaktu_() });
      rfNotif_(x['PROMOTOR KUNCI'], 'Dana pendaftaran dikembalikan: ' + x['NAMA'], 'Pengembalian ' + honRp_(o.jumlah) + ' disetujui.');
    } else {
      rfUbah_('DAFTAR', x._baris, { 'STATUS BAYAR': 'Lunas', 'ID TRX KEMBALI': '', 'CATATAN BAYAR': ('Pengajuan pengembalian ' + String(status).toLowerCase() + '.').slice(0, 300), 'DIPERBARUI': rfWaktu_() });
    }
  } catch (e) {}
}

// ---------- referral: persetujuan penarikan cashback ----------
function waStafRefTarikSetujui(token, id, catatan) {
  var r = rfPetugas_(token);
  if (!r.q.sa) throw new Error('Penarikan disetujui oleh Ketua Yayasan (Superadmin).');
  var t = rfCariTarik_(id);
  if (t['STATUS'] !== 'Menunggu') throw new Error('Pengajuan ini sudah ' + t['STATUS'] + '.');
  rfUbah_('TARIK', t._baris, { 'STATUS': 'Disetujui', 'DISETUJUI OLEH': r.p.nama, 'DISETUJUI PADA': rfWaktu_(), 'CATATAN': String(catatan || '').slice(0, 300) });
  rfNotif_(t['PROMOTOR KUNCI'], 'Penarikan ' + honRp_(Number(t['JUMLAH']) || 0) + ' disetujui', 'Bendahara akan mentransfer ke ' + t['REKENING'] + '.');
  try { catat_(r.p.peran, '', r.p.nama, 'Setujui penarikan referral', id + ' ' + t['JUMLAH'], 'OK'); } catch (e) {}
  npKirim_('tarik_disetujui', { judul: 'Penarikan cashback perlu dibayar', isi: honRp_(Number(t['JUMLAH']) || 0) + ' untuk ' + t['PROMOTOR NAMA'] + ' (' + t['REKENING'] + ') sudah disetujui.', aksi: 'referral_admin', ref: 'tarikok|' + id });   // v1.50.0: notifikasi
  return { sukses: true };
}

// ---------- honor: pembatalan pembayaran ----------
function honPembayaranBatal_() {
  var t = kalKolom_(HON.TAB_BAYAR, 'DIBATALKAN'), out = {};
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i], b = sTeks_(absNilai_(t, r, 'DIBATALKAN')).trim(), id = sTeks_(absNilai_(t, r, 'REKAP HONOR')).trim();
    if (!b || !id) continue;
    (out[id] = out[id] || []).push({ id: sTeks_(absNilai_(t, r, 'ID BAYAR')), tanggal: absTgl_(absNilai_(t, r, 'TANGGAL')),
      jumlah: Number(String(absNilai_(t, r, 'JUMLAH')).replace(/[^\d.-]/g, '')) || 0, batal: b });
  }
  return out;
}
function waStafHonorBayarBatal(token, idBayar, alasan) {
  var p = stafDariToken_(token);
  if (!honPeran_(p).setuju) throw new Error('Pembatalan pembayaran honor hanya oleh Ketua Yayasan (Superadmin).');
  alasan = String(alasan || '').trim();
  if (alasan.length < 5) throw new Error('Tulis alasan pembatalan (minimal 5 huruf).');
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var tb = kalKolom_(HON.TAB_BAYAR, 'DIBATALKAN'), baris = -1;
    for (var i = 1; i < tb.v.length; i++) if (sTeks_(absNilai_(tb, tb.v[i], 'ID BAYAR')).trim() === String(idBayar)) { baris = i; break; }
    if (baris < 0) throw new Error('Pembayaran honor tidak ditemukan.');
    var r = tb.v[baris];
    if (sTeks_(absNilai_(tb, r, 'DIBATALKAN')).trim()) throw new Error('Pembayaran ini sudah dibatalkan.');
    var idRekap = sTeks_(absNilai_(tb, r, 'REKAP HONOR')).trim(), idTrx = sTeks_(absNilai_(tb, r, 'ID TRANSAKSI')).trim();
    var jumlah = Number(String(absNilai_(tb, r, 'JUMLAH')).replace(/[^\d.-]/g, '')) || 0;
    var ket = p.nama + ' · ' + absWaktu_() + ': ' + alasan.slice(0, 200);
    var trxLama = idTrx ? keuSemua_().filter(function(x) { return x.id === idTrx; })[0] : null;
    if (trxLama) pjkBolehBatal_(trxLama);   // v1.46.0: PPh 21 yang sudah disetor harus dibatalkan setorannya dulu
    tb.sh.getRange(baris + 1, absCol_(tb, 'DIBATALKAN') + 1).setValue(ket);
    if (idTrx) {
      try {
        var oH = keuUbahBaris_(keuTrxTab_(), idTrx, function() {
          return { 'STATUS': 'Dibatalkan', 'TANGGAL KEPUTUSAN': absWaktu_(), 'CATATAN KEPUTUSAN': ('Pembayaran honor dibatalkan ' + ket).slice(0, 300) };
        });
        pjkSetelahPutus_(oH, 'Dibatalkan');
      } catch (e) { try { catat_(p.peran, '', p.nama, 'Batal bayar honor GAGAL', idTrx + ': ' + ((e && e.message) || e), 'GAGAL'); } catch (e1) {} }
    }
    var sudah = 0;
    for (var j = 1; j < tb.v.length; j++) {
      if (j === baris) continue;
      if (sTeks_(absNilai_(tb, tb.v[j], 'REKAP HONOR')).trim() !== idRekap || sTeks_(absNilai_(tb, tb.v[j], 'DIBATALKAN')).trim()) continue;
      sudah += Number(String(absNilai_(tb, tb.v[j], 'JUMLAH')).replace(/[^\d.-]/g, '')) || 0;
    }
    var t = absBaca_(HON.TAB_REKAP), b = honCariRekap_(t, idRekap);
    if (b) {
      var total = honBarisRekap_(t, t.v[b - 1]).total, c = absCol_(t, 'STATUS');
      if (c >= 0) t.sh.getRange(b, c + 1).setValue(sudah <= 0 ? 'Disetujui' : (sudah >= total ? 'Dibayar' : 'Dibayar Sebagian'));
      var oR = honBarisRekap_(t, t.v[b - 1]);
      npKirim_('honor_batal', { judul: 'Pembayaran honor ' + oR.bulan + ' dibatalkan', isi: honRp_(jumlah) + ' dibatalkan Ketua Yayasan: ' + alasan.slice(0, 120), aksi: 'honor', tutor: [oR.tutor] });   // v1.50.0: notifikasi
    }
    catat_(p.peran, '', p.nama, 'Batal bayar honor', idBayar + ' ' + honRp_(jumlah) + ': ' + alasan, 'OK');
    return { sukses: true };
  } finally { kunci.releaseLock(); }
}

// ============================================================================
// AKUN KAS & MUTASI (v1.45.0, Tahap B)
// Setiap transaksi menyebut TEMPAT uangnya (kolom AKUN KAS): Kas Tunai, Rekening Bank, atau Saldo Payment Gateway
// (Midtrans/DOKU). Pemindahan antar tempat dicatat sebagai JENIS "Mutasi" (AKUN KAS = asal, AKUN TUJUAN = tujuan):
// tidak dihitung sebagai pemasukan/pengeluaran, tidak mengubah saldo sumber dana, hanya memindah saldo antar akun.
// Contoh: pencairan saldo gateway ke rekening bank, setor tunai ke bank, tarik tunai dari bank.
// Transaksi lama tanpa akun tampil sebagai "Belum ditentukan" dan bisa diatur (Atur akun kas).
// ============================================================================
KAL.PROP_AKUN = 'TH_KEU_AKUN';
KAL.JENIS_AKUN = ['Tunai', 'Bank', 'Gateway'];
KAL.AKUN_BAWAAN = [
  { kode: 'TUNAI', nama: 'Kas Tunai', jenis: 'Tunai', ket: '', aktif: true },
  { kode: 'BANK', nama: 'Rekening Bank', jenis: 'Bank', ket: '', aktif: true },
  { kode: 'PG', nama: 'Saldo Payment Gateway', jenis: 'Gateway', ket: '', aktif: true }
];
KAL.TANPA_AKUN = { kode: '', nama: 'Belum ditentukan', jenis: '', ket: 'Transaksi lama, atur lewat "Atur akun kas"', aktif: true };

function kalAkun_() {
  try {
    var s = JSON.parse(PropertiesService.getScriptProperties().getProperty(KAL.PROP_AKUN) || 'null');
    if (Array.isArray(s) && s.length) return s;
  } catch (e) {}
  return JSON.parse(JSON.stringify(KAL.AKUN_BAWAAN));
}
function kalAkunPeta_() { var m = {}; kalAkun_().forEach(function(a) { m[a.kode] = a; }); return m; }
function kalAkunSah_(kode) { var k = String(kode || '').trim().toUpperCase(); return kalAkunPeta_()[k] ? k : ''; }
// Akun bawaan menurut metode bayar (dipakai pencatatan otomatis).
function kalAkunBawaan_(metode) {
  var m = String(metode || '').toLowerCase(), peta = kalAkunPeta_();
  var pilih = function(jenis, kode) {
    if (peta[kode] && peta[kode].aktif !== false) return kode;
    var a = kalAkun_().filter(function(x) { return x.jenis === jenis && x.aktif !== false; })[0];
    return a ? a.kode : '';
  };
  if (/gateway|otomatis|midtrans|doku/.test(m)) return pilih('Gateway', 'PG');
  if (/tunai|cash|sekretariat/.test(m)) return pilih('Tunai', 'TUNAI');
  if (!m) return '';
  return pilih('Bank', 'BANK');
}
function kalNamaPenyedia_(g) { return String((g && g.penyedia) || 'midtrans').toLowerCase() === 'doku' ? 'DOKU' : 'Midtrans'; }

// Saldo per akun (transaksi Disetujui; sampai = batas tanggal inklusif, opsional).
function kalSaldoAkun_(semua, sampai) {
  var s = {};
  (semua || keuSemua_()).forEach(function(x) {
    if (!keuSah_(x) || (sampai && x.tanggal > sampai)) return;
    var a = x.akun || '';
    if (x.jenis === 'Mutasi') { s[a] = (s[a] || 0) - x.jumlah; s[x.akunTujuan || ''] = (s[x.akunTujuan || ''] || 0) + x.jumlah; }
    else s[a] = (s[a] || 0) + (x.jenis === 'Pengeluaran' ? -x.jumlah : x.jumlah);
  });
  return s;
}
function kalDaftarAkunSaldo_(semua) {
  var s = kalSaldoAkun_(semua), out = kalAkun_().map(function(a) { return { kode: a.kode, nama: a.nama, jenis: a.jenis, ket: a.ket || '', aktif: a.aktif !== false, saldo: s[a.kode] || 0 }; });
  if (s['']) out.push({ kode: '', nama: KAL.TANPA_AKUN.nama, jenis: '', ket: KAL.TANPA_AKUN.ket, aktif: true, saldo: s[''] });
  return out;
}

// d: {kode, nama, jenis, ket, aktif}
function waStafKeuAkunSimpan(token, d) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  d = d || {};
  var kode = String(d.kode || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(kode)) throw new Error('Kode akun 2–8 huruf/angka (mis. BJB, BRI, TUNAI).');
  var nama = String(d.nama || '').trim().slice(0, 60);
  if (nama.length < 3) throw new Error('Isi nama akun.');
  if (KAL.JENIS_AKUN.indexOf(String(d.jenis)) < 0) throw new Error('Pilih jenis akun: Tunai, Bank, atau Gateway.');
  var akun = kalAkun_(), ada = akun.filter(function(a) { return a.kode === kode; })[0];
  var isi = { kode: kode, nama: nama, jenis: String(d.jenis), ket: String(d.ket || '').trim().slice(0, 120), aktif: d.aktif !== false };
  if (ada) Object.keys(isi).forEach(function(k) { ada[k] = isi[k]; }); else akun.push(isi);
  if (!akun.some(function(a) { return a.aktif !== false; })) throw new Error('Minimal satu akun harus aktif.');
  PropertiesService.getScriptProperties().setProperty(KAL.PROP_AKUN, JSON.stringify(akun));
  catat_(p.peran, '-', p.nama, 'Akun kas', kode + ' ' + nama + ' (' + isi.jenis + (isi.aktif ? '' : ', nonaktif') + ')', 'OK');
  return { sukses: true, akun: kalDaftarAkunSaldo_() };
}
function waStafKeuAkun(token) {
  var p = stafDariToken_(token), r = keuPeran_(p), h = honPeran_(p);
  if (!r.lihat && !h.bayar) throw new Error('Peran Anda tidak dapat melihat akun kas.');
  return { akun: kalDaftarAkunSaldo_(), pajak: pjkAturan_() };
}

// Mutasi antar akun. d: {tanggal, dari, ke, jumlah, uraian, bukti?, paksa?}
function waStafKeuMutasi(token, d) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  d = d || {};
  var tgl = absTglSah_(d.tanggal || absHariIni_());
  var dari = kalAkunSah_(d.dari), ke = kalAkunSah_(d.ke);
  if (!dari || !ke) throw new Error('Pilih akun asal dan akun tujuan.');
  if (dari === ke) throw new Error('Akun asal dan tujuan tidak boleh sama.');
  var jumlah = Math.round(keuAngka_(d.jumlah));
  if (jumlah <= 0) throw new Error('Jumlah harus lebih dari 0.');
  var peta = kalAkunPeta_();
  var saldo = kalSaldoAkun_(null)[dari] || 0;
  if (saldo - jumlah < 0) {
    var pesan = 'Saldo ' + peta[dari].nama + ' ' + kalRp_(saldo) + ', dipindah ' + kalRp_(jumlah) + ', saldo menjadi ' + kalRp_(saldo - jumlah) + '.';
    if (d.paksa !== true) throw new Error('SALDO_KURANG: ' + pesan);
    try { catat_(p.peran, '-', p.nama, 'Saldo akun minus (dikonfirmasi)', pesan, 'PERINGATAN'); } catch (e) {}
  }
  var uraian = String(d.uraian || '').trim() || ('Pemindahan ' + peta[dari].nama + ' ke ' + peta[ke].nama);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = keuTrxTab_(), id = 'TRX-' + absId_().toUpperCase();
    var isi = {
      'ID TRANSAKSI': id, 'TANGGAL': tgl, 'JENIS': 'Mutasi', 'KATEGORI KEUANGAN': 'MUT', 'URAIAN': uraian.slice(0, 300), 'JUMLAH': jumlah,
      'SUMBER DANA': '', 'PIHAK TERKAIT': '', 'STATUS': 'Disetujui', 'TAHUN PELAJARAN': absSim_().tahun, 'DICATAT OLEH': p.nama, 'DICATAT PADA': absWaktu_(),
      'AKUN KAS': dari, 'AKUN TUJUAN': ke
    };
    if (d.bukti) isi['BUKTI'] = keuSimpanBukti_(d.bukti, 'MUTASI-' + tgl + '-' + absId_());
    t.sh.appendRow(absBaris_(t, isi));
    catat_(p.peran, '-', p.nama, 'Mutasi kas', id + ' ' + dari + '->' + ke + ' ' + jumlah, 'OK');
    return { sukses: true, id: id };
  } finally { lock.releaseLock(); }
}

// Atur akun kas satu transaksi (untuk data lama / salah pilih). Jumlah & status tidak berubah.
function waStafKeuAturAkun(token, id, akun, akunTujuan) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  var a = kalAkunSah_(akun);
  if (!a) throw new Error('Pilih akun kas.');
  var o = keuUbahBaris_(keuTrxTab_(), id, function(o) {
    if (o.status === 'Dibatalkan' || o.status === 'Ditolak') throw new Error('Transaksi ' + o.status + ' tidak perlu diatur.');
    var isi = { 'AKUN KAS': a };
    if (o.jenis === 'Mutasi') {
      var b = kalAkunSah_(akunTujuan) || o.akunTujuan;
      if (!b || b === a) throw new Error('Akun asal dan tujuan mutasi harus berbeda.');
      isi['AKUN TUJUAN'] = b;
    }
    return isi;
  });
  catat_(p.peran, '-', p.nama, 'Atur akun kas', o.id + ': ' + (o.akun || '-') + ' -> ' + a, 'OK');
  return { sukses: true };
}
