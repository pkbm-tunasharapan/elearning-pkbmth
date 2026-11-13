// ============================================================================
// AKTIVASI QR KARTU SISWA (v1.67.0)
// - Kartu ID (QR) wajib dicetak, tetapi QR baru dapat dipakai absen setelah biaya aktivasi Rp20.000 dibayar.
// - Kunci = kotak centang "QR AKTIF" di tab AKTIVASI QR. Belum dicentang -> absensi ditolak dengan pesan AQR.PESAN,
//   baik lewat pindai QR maupun memilih nama secara manual (v1.67.1); kartu siswa digital juga menampilkan pesan itu.
// - Biaya tercatat sebagai TAGIHAN "Aktivasi QR ID Card" (sasaran semua WB aktif), dibuat otomatis saat pertama dibutuhkan,
//   sehingga siswa dapat membayar lewat VA (DOKU) dari menu Tagihan Saya dan pemasukannya masuk Arus Keuangan.
// - Tunai: Front Office hanya melaporkan bahwa pembayaran sudah diterima (notifikasi ke Admin & KS); Admin / Kepala Sekolah
//   mencentang QR Aktif -> pemasukan Rp20.000 tercatat (akun Kas Tunai) bila tagihan belum lunas. Tidak pernah tercatat dua kali.
// - Tagihan lunas lewat VA / transfer terverifikasi / dicatat Bendahara -> QR otomatis tercentang.
// ============================================================================
var AQR = {
  TAB: 'AKTIVASI QR',
  HDR: ['ID WB', 'NAMA', 'QR AKTIF', 'CARA', 'ID TRANSAKSI', 'DIAKTIFKAN OLEH', 'DIAKTIFKAN PADA', 'LAPORAN FO', 'LAPORAN OLEH', 'LAPORAN PADA'],
  BIAYA: 20000,
  KAT: 'AQR', NAMA_KAT: 'Aktivasi QR ID Card', NAMA_TAG: 'Aktivasi QR ID Card',
  PROP_TAG: 'TH_AQR_TAGIHAN',
  PESAN: 'QR Belum diaktifkan, silahkan lakukan aktivasi terlebih dahulu di bagian akademik',
  PENGATUR: ['Admin', 'Kepala Sekolah']
};
var AQR_MEMO_ = null;

function aqrBaca_() { return absBaca_(AQR.TAB, AQR.HDR); }
function aqrPeta_() {
  if (AQR_MEMO_) return AQR_MEMO_;
  var t = aqrBaca_(), out = {};
  for (var i = 1; i < t.v.length; i++) {
    var g = function(n) { return absNilai_(t, t.v[i], n); };
    var id = sTeks_(g('ID WB')).trim();
    if (!id) continue;
    out[id] = { baris: i + 1, aktif: absBenar_(g('QR AKTIF')), cara: sTeks_(g('CARA')).trim(), idTrx: sTeks_(g('ID TRANSAKSI')).trim(),
      oleh: sTeks_(g('DIAKTIFKAN OLEH')).trim(), pada: sTeks_(g('DIAKTIFKAN PADA')).trim(),
      lapor: sTeks_(g('LAPORAN FO')).trim(), laporOleh: sTeks_(g('LAPORAN OLEH')).trim(), laporPada: sTeks_(g('LAPORAN PADA')).trim() };
  }
  return (AQR_MEMO_ = out);
}
function aqrAktif_(idWb) { var x = aqrPeta_()[String(idWb || '').trim()]; return !!(x && x.aktif); }
// Dipanggil setiap pencatatan absensi warga belajar (harian & per mapel, pindai maupun manual).
function aqrWajibAktif_(wb) { if (wb && !aqrAktif_(wb.id)) throw new Error(AQR.PESAN); }

// Tulis / perbarui baris satu WB. w: {id, nama}
function aqrTulis_(w, isi) {
  var t = aqrBaca_(), ada = aqrPeta_()[w.id], baris;
  isi['NAMA'] = w.nama;
  if (ada) baris = ada.baris;
  else {
    t.sh.appendRow(absBaris_(t, { 'ID WB': w.id, 'NAMA': w.nama }));
    baris = t.sh.getLastRow();
    t.sh.getRange(baris, absCol_(t, 'QR AKTIF') + 1).insertCheckboxes();
  }
  Object.keys(isi).forEach(function(k) { var c = absCol_(t, k); if (c >= 0) t.sh.getRange(baris, c + 1).setValue(isi[k]); });
  AQR_MEMO_ = null;
}

// Tagihan aktivasi QR (dibuat sekali, saat pertama dibutuhkan). buat=false -> null bila belum ada.
// Jangan dipanggil dengan buat=true dari dalam ScriptLock.
function aqrTagihan_(buat) {
  var sp = PropertiesService.getScriptProperties(), cari = function() {
    var id = sp.getProperty(AQR.PROP_TAG) || '';
    if (!id) return null;
    try { return keuTagCari_(id); } catch (e) { return null; }
  };
  var tag = cari();
  if (tag || !buat) return tag;
  var kunci = LockService.getScriptLock(), baru = '';
  kunci.waitLock(20000);
  try {
    tag = cari();
    if (!tag) {
      rfKategori_(AQR.KAT, AQR.NAMA_KAT, 'Pemasukan');
      var t = absBaca_(KEU.TAB_TAG, KEU.HDR_TAG), sim = {};
      try { sim = absSim_(); } catch (e0) {}
      baru = 'TAG-AQR-' + absId_().toUpperCase();
      t.sh.appendRow(absBaris_(t, {
        'ID TAGIHAN': baru, 'NAMA': AQR.NAMA_TAG, 'KATEGORI': AQR.KAT, 'JUMLAH': AQR.BIAYA, 'SASARAN': 'Semua', 'NILAI SASARAN': '',
        'KETERANGAN': 'Biaya aktivasi QR kartu siswa (ID Card). QR baru dapat dipakai untuk absensi setelah aktivasi.',
        'TAHUN PELAJARAN': sim.tahun || '', 'AKTIF': true, 'DIBUAT OLEH': 'Sistem (aktivasi QR)', 'DIBUAT PADA': absWaktu_()
      }));
      sp.setProperty(AQR.PROP_TAG, baru);
    }
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} kunci.releaseLock(); }
  if (baru) {
    try { catat_('Sistem', '-', 'Sistem', 'Tagihan aktivasi QR dibuat', baru + ' ' + AQR.BIAYA, 'OK'); } catch (e1) {}
    try { npTagihanBaru_(baru); } catch (e2) {}
    tag = cari();
  }
  return tag;
}
function aqrIdTagihan_() { return PropertiesService.getScriptProperties().getProperty(AQR.PROP_TAG) || ''; }

// Kait setelah pembayaran tagihan tercatat (VA DOKU, transfer diverifikasi, dicatat Bendahara/Admin).
// Bila tagihan aktivasi QR lunas -> centang QR AKTIF. Tidak pernah melempar galat.
function aqrSetelahBayar_(idTagihan, idWb, cara, idTrx) {
  try {
    var id = aqrIdTagihan_();
    if (!id || String(idTagihan) !== id) return false;
    var tag = keuTagCari_(id), w = keuWbSemua_().filter(function(x) { return x.id === String(idWb); })[0];
    if (!w) return false;
    var row = keuRinci_(tag, [w], keuBayarPeta_())[0];
    if (!row || row.sisa > 0) return false;
    AQR_MEMO_ = null;
    if (aqrAktif_(w.id)) return false;
    aqrTulis_(w, { 'QR AKTIF': true, 'CARA': cara, 'ID TRANSAKSI': String(idTrx || ''), 'DIAKTIFKAN OLEH': 'Sistem (tagihan lunas)', 'DIAKTIFKAN PADA': absWaktu_() });
    try { catat_('Sistem', w.idRombel, 'Sistem', 'QR diaktifkan otomatis', w.nama + ' (' + cara + ')', 'OK'); } catch (e1) {}
    return true;
  } catch (e) { return false; }
}

function aqrWajibPeran_(p) {
  var q = absPeran_(p);
  if (!(q.admin || q.ks || q.fo)) throw new Error('Aktivasi QR untuk Admin, Kepala Sekolah, dan Front Office.');
  return q;
}
function aqrWb_(idWb) {
  var w = keuWbSemua_().filter(function(x) { return x.id === String(idWb || ''); })[0];
  if (!w) throw new Error('Warga belajar tidak ditemukan.');
  return w;
}

// Daftar siswa aktif + status QR & tagihan aktivasi.
function waStafAqrDaftar(token) {
  var p = stafDariToken_(token);
  aqrWajibPeran_(p);
  var tag = aqrTagihan_(true), pb = keuBayarPeta_(), peta = aqrPeta_();
  var siswa = keuWbSemua_().filter(function(w) { return w.aktif; }).map(function(w) {
    var r = tag ? keuRinci_(tag, [w], pb)[0] : null, a = peta[w.id] || {};
    return { id: w.id, nisn: w.nisn, nama: w.nama, idRombel: w.idRombel, rombel: w.namaRombel || '-', aktif: !!a.aktif, cara: a.cara || '', oleh: a.oleh || '', pada: a.pada || '',
      lapor: a.lapor || '', laporOleh: a.laporOleh || '', laporPada: a.laporPada || '', dibayar: r ? r.dibayar : 0, sisa: r ? r.sisa : AQR.BIAYA };
  }).sort(function(a, b) { return a.rombel.localeCompare(b.rombel, 'id', { numeric: true }) || a.nama.localeCompare(b.nama); });
  var akun = [];
  try { akun = kalAkun_().filter(function(a) { return a.aktif !== false; }).map(function(a) { return { kode: a.kode, nama: a.nama, jenis: a.jenis }; }); } catch (e) {}
  return { biaya: tag ? tag.jumlah : AQR.BIAYA, idTagihan: tag ? tag.id : '', bolehAtur: AQR.PENGATUR.indexOf(p.peran) >= 0, siswa: siswa,
    akun: akun, akunBawaan: kalAkunBawaan_('tunai'), pesanKunci: AQR.PESAN };
}

// Centang / lepas QR Aktif (Admin & Kepala Sekolah). d: {idWb, aktif, akun}
// Mencentang siswa yang tagihannya belum lunas = pembayaran tunai diterima -> pemasukan sisa tagihan dicatat ke Arus Keuangan.
function waStafAqrAtur(token, d) {
  var p = stafDariToken_(token);
  aqrWajibPeran_(p);
  if (AQR.PENGATUR.indexOf(p.peran) < 0) throw new Error('Aktivasi QR dilakukan oleh Admin atau Kepala Sekolah. Front Office cukup melaporkan pembayaran yang diterima.');
  d = d || {};
  var w = aqrWb_(d.idWb), aktif = d.aktif === true;
  var tag = aktif ? aqrTagihan_(true) : null, idTrx = '', jumlah = 0;
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    AQR_MEMO_ = null;
    if (!aktif) {
      if (!aqrAktif_(w.id)) return { sukses: true, aktif: false };
      aqrTulis_(w, { 'QR AKTIF': false, 'CARA': 'Dinonaktifkan', 'DIAKTIFKAN OLEH': p.nama, 'DIAKTIFKAN PADA': absWaktu_() });
    } else {
      if (aqrAktif_(w.id)) return { sukses: true, aktif: true, sudah: true };
      if (!tag) throw new Error('Tagihan aktivasi QR belum tersedia. Coba lagi.');
      var row = keuRinci_(tag, [w], keuBayarPeta_())[0], cara = 'Sudah lunas';
      if (row && row.sisa > 0) {
        jumlah = row.sisa;
        var t = keuTrxTab_(), sim = absSim_();
        idTrx = 'TRX-' + absId_().toUpperCase();
        t.sh.appendRow(absBaris_(t, {
          'ID TRANSAKSI': idTrx, 'TANGGAL': absHariIni_(), 'JENIS': 'Pemasukan', 'KATEGORI KEUANGAN': tag.kategori, 'WARGA BELAJAR': w.id,
          'URAIAN': ('Pembayaran ' + tag.nama + ' - ' + w.nama + ' (tunai, diaktifkan ' + p.nama + ')').slice(0, 300),
          'JUMLAH': jumlah, 'SUMBER DANA': KEU.SUMBER_KAT[tag.kategori] || 'Swadaya', 'PIHAK TERKAIT': w.nama, 'STATUS': 'Disetujui',
          'TAHUN PELAJARAN': sim.tahun, 'DICATAT OLEH': p.nama, 'DICATAT PADA': absWaktu_(), 'TAGIHAN': tag.id,
          'AKUN KAS': kalAkunSah_(d.akun) || kalAkunBawaan_('tunai')
        }));
        cara = 'Tunai';
      }
      aqrTulis_(w, { 'QR AKTIF': true, 'CARA': cara, 'ID TRANSAKSI': idTrx, 'DIAKTIFKAN OLEH': p.nama, 'DIAKTIFKAN PADA': absWaktu_() });
    }
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} kunci.releaseLock(); }
  catat_(p.peran, w.idRombel, p.nama, aktif ? 'Aktifkan QR siswa' : 'Nonaktifkan QR siswa', w.nama + (jumlah ? ' (tunai ' + jumlah + ', ' + idTrx + ')' : ''), 'OK');
  if (jumlah) { try { npBayarDiterima_(w.id, tag.nama, jumlah, 'tunai, QR diaktifkan'); } catch (e) {} }
  return { sukses: true, aktif: aktif, jumlah: jumlah, idTransaksi: idTrx, nama: w.nama };
}

// Front Office melaporkan pembayaran aktivasi sudah diterima -> notifikasi ke Admin & Kepala Sekolah. d: {idWb, catatan}
function waStafAqrLapor(token, d) {
  var p = stafDariToken_(token);
  aqrWajibPeran_(p);
  d = d || {};
  var w = aqrWb_(d.idWb);
  AQR_MEMO_ = null;
  if (aqrAktif_(w.id)) throw new Error('QR ' + w.nama + ' sudah aktif.');
  var catatan = String(d.catatan || '').trim().slice(0, 150), waktu = absWaktu_();
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    aqrTulis_(w, { 'LAPORAN FO': 'Pembayaran diterima' + (catatan ? ': ' + catatan : ''), 'LAPORAN OLEH': p.nama, 'LAPORAN PADA': waktu });
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} kunci.releaseLock(); }
  catat_(p.peran, w.idRombel, p.nama, 'Lapor bayar aktivasi QR', w.nama + (catatan ? ': ' + catatan : ''), 'OK');
  npKirim_('aqr_lapor', { judul: 'Aktivasi QR menunggu: ' + w.nama, isi: p.nama + ' menerima pembayaran aktivasi QR dari ' + w.nama + ' (' + (w.namaRombel || '-') + ')'
    + (catatan ? '. Catatan: ' + catatan : '') + '. Centang QR Aktif di menu Aktivasi QR Siswa.', aksi: 'aktivasi_qr', ref: 'aqr|' + w.id + '|' + waktu });
  return { sukses: true, nama: w.nama };
}
