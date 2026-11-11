// ============================================================================
// REFERRAL PENDAFTARAN PESERTA DIDIK BARU (aplikasi 1.34)
// - Promotor: semua pengguna terdaftar (siswa & staf: Admin, KS, Tutor, dll.), KECUALI Dinas Pendidikan.
// - Promotor mengisi formulir pendaftaran (meniru data Dapodik) + unggah berkas. Data promotor otomatis
//   dari akunnya; di formulir hanya tampil namanya, Admin melihat lengkap.
// - Verifikasi 1 (berkas) oleh Admin / Front Office. Verifikasi 2 (pembayaran: sekretariat, transfer +
//   bukti, atau QRIS) oleh Admin / Front Office / Bendahara. Keduanya lolos -> peserta masuk Data Induk
//   (Warga Belajar, tanpa rombel), pemasukan pendaftaran (DAF) tercatat, saldo promotor + cashback.
// - Penarikan saldo minimal (bawaan Rp150.000) -> tampil di dasbor manajerial -> hanya Bendahara yang
//   membayar (unggah bukti) / menolak; promotor mendapat notifikasi; pengeluaran tercatat (RFL).
// - QRIS: statis (gambar QRIS lembaga) atau dinamis Midtrans (disiapkan, nonaktif sampai diaktifkan Admin).
// Data: tab REFERRAL * di spreadsheet e-learning; berkas di folder Drive "TH.E-Course - Berkas Pendaftaran".
// ============================================================================
var RF = {
  PROP: 'TH_REFERRAL_ATURAN', PROP_FOLDER: 'TH_REFERRAL_FOLDER',
  BAWAAN: {
    biaya: 0, cashback: 50000, minTarik: 150000, rekening: [], qrisFile: '', alamatSekretariat: '',
    gateway: { aktif: false, penyedia: 'midtrans', produksi: false, serverKey: '', clientKey: '', merchantId: '', biayaPersen: 0.7, biayaTetap: 0 }
  },
  TAB: {
    DAFTAR: ['ID', 'WAKTU', 'PROMOTOR KUNCI', 'PROMOTOR NAMA', 'PROMOTOR PERAN', 'PROMOTOR INFO', 'NAMA', 'NIK', 'PROGRAM', 'HP', 'DATA', 'BERKAS',
      'STATUS BERKAS', 'CATATAN BERKAS', 'VERIF BERKAS OLEH', 'VERIF BERKAS PADA', 'METODE BAYAR', 'BUKTI BAYAR', 'STATUS BAYAR', 'CATATAN BAYAR',
      'VERIF BAYAR OLEH', 'VERIF BAYAR PADA', 'JUMLAH BAYAR', 'ID WB', 'CASHBACK', 'ORDER GATEWAY', 'DIPERBARUI', 'ID TRANSAKSI', 'ID TRX KEMBALI'],
    SALDO: ['ID', 'WAKTU', 'PROMOTOR KUNCI', 'PROMOTOR NAMA', 'JENIS', 'JUMLAH', 'REF', 'KETERANGAN'],
    TARIK: ['ID', 'WAKTU', 'PROMOTOR KUNCI', 'PROMOTOR NAMA', 'PROMOTOR PERAN', 'JUMLAH', 'REKENING', 'STATUS', 'DIPROSES OLEH', 'DIPROSES PADA', 'BUKTI', 'CATATAN', 'ID TRANSAKSI', 'DISETUJUI OLEH', 'DISETUJUI PADA'],
    PROMOTOR: ['KUNCI', 'NAMA', 'PERAN', 'METODE', 'BANK', 'NOMOR', 'ATAS NAMA', 'HP', 'DIPERBARUI'],
    NOTIF: ['WAKTU MS', 'KUNCI', 'JUDUL', 'PESAN']
  },
  BERKAS: { foto: 'Pas foto / selfie', ijazah: 'Ijazah terakhir', kk: 'Kartu Keluarga', ktp: 'KTP / Akta kelahiran', ttd: 'Tanda tangan' },
  WAJIB_BERKAS: ['foto', 'kk', 'ttd'],
  MAKS_BERKAS: 2500000,
  KAT_DAF: 'DAF', KAT_RFL: 'RFL'
};

if (typeof API_FLUTTER !== 'undefined' && API_FLUTTER && API_FLUTTER.TAMBAHAN) {
  ['waRefKonteks', 'waRefDaftar', 'waRefPerbaiki', 'waRefBayar', 'waRefRekening', 'waRefTarik', 'waRefBerkas', 'waRefDetail', 'waRefCekBayar'].forEach(function(f) { API_FLUTTER.TAMBAHAN[f] = true; });
}

// ---------------- tabel ----------------
function rfTab_(k) {
  var nama = 'REFERRAL ' + k, hdr = RF.TAB[k];
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(nama);
  if (!sh) {
    sh = ss.insertSheet(nama);
    sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, 1000, hdr.length).setNumberFormat('@');
  } else if (sh.getLastColumn() < hdr.length) {
    var ada = sh.getLastColumn();   // v1.44.0: kolom baru di kanan
    sh.getRange(1, ada + 1, 1, hdr.length - ada).setValues([hdr.slice(ada)]).setFontWeight('bold');
  }
  return sh;
}
function rfBaca_(k) {
  var sh = rfTab_(k), hdr = RF.TAB[k], n = sh.getLastRow() - 1, out = [];
  if (n < 1) return out;
  sh.getRange(2, 1, n, hdr.length).getValues().forEach(function(r, i) {
    if (!sTeks_(r[0]).trim()) return;
    var o = { _baris: i + 2 };
    hdr.forEach(function(h, j) { o[h] = r[j] instanceof Date ? Utilities.formatDate(r[j], absTz_(), 'yyyy-MM-dd HH:mm') : sTeks_(r[j]); });
    out.push(o);
  });
  return out;
}
function rfTambah_(k, o) {
  var sh = rfTab_(k), hdr = RF.TAB[k];
  var row = hdr.map(function(h) { return o[h] === undefined || o[h] === null ? '' : o[h]; });
  var r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, hdr.length).setNumberFormat('@').setValues([row]);
  return r;
}
function rfUbah_(k, baris, o) {
  var sh = rfTab_(k), hdr = RF.TAB[k];
  Object.keys(o).forEach(function(h) { var j = hdr.indexOf(h); if (j >= 0) sh.getRange(baris, j + 1).setValue(o[h]); });
}
function rfWaktu_() { return Utilities.formatDate(new Date(), absTz_(), 'yyyy-MM-dd HH:mm'); }
function rfId_(awal) { return awal + Utilities.formatDate(new Date(), absTz_(), 'yyMMdd') + '-' + absId_().slice(0, 5).toUpperCase(); }
function rfJson_(s, bawaan) { try { return JSON.parse(s || ''); } catch (e) { return bawaan; } }

// ---------------- aturan ----------------
function rfAturan_() {
  var a = JSON.parse(JSON.stringify(RF.BAWAAN));
  try {
    var s = JSON.parse(PropertiesService.getScriptProperties().getProperty(RF.PROP) || '{}');
    Object.keys(s).forEach(function(k) {
      if (k === 'gateway' && s.gateway) Object.keys(s.gateway).forEach(function(g) { a.gateway[g] = s.gateway[g]; });
      else a[k] = s[k];
    });
  } catch (e) {}
  return a;
}
function rfAturanPublik_(a) {
  return { biaya: a.biaya, cashback: a.cashback, minTarik: a.minTarik, rekening: a.rekening || [], adaQris: !!a.qrisFile,
    qrisDinamis: !!(a.gateway && a.gateway.aktif && a.gateway.serverKey && String(a.gateway.penyedia || 'midtrans') === 'midtrans'),
    bayarOnline: gwDoku_().aktif && Number(a.biaya) >= 1000, metodeBayar: gwDoku_().aktif ? gwMetode_(a.gateway) : [], alamatSekretariat: a.alamatSekretariat || '' };
}

// ---------------- akun promotor ----------------
function rfAkun_(token) {
  var galatStaf = '';
  try {
    var p = stafDariToken_(token);
    if (p.peran === 'Dinas Pendidikan' || p.peranAsli === 'Dinas Pendidikan' || globalThis.__DINAS) throw new Error('Dinas');
    return { kunci: 'staf|' + p.id, nama: p.nama, peran: p.peran, staf: p, info: { id: p.id, email: p.email || '', peran: p.peran } };
  } catch (e) { galatStaf = String((e && e.message) || e); }
  if (/Dinas/.test(galatStaf)) throw new Error('Fitur referral tidak tersedia untuk akun Dinas Pendidikan.');
  var s = siswaDariSesi_(token);
  return { kunci: 'siswa|' + s.idRombel + '|' + normNama_(s.nama), nama: s.nama, peran: 'Siswa', siswa: s,
    info: { idRombel: s.idRombel, rombel: s.namaRombel || '', peran: 'Siswa' } };
}
function rfPetugas_(token) {
  var p = stafDariToken_(token), q = absPeran_(p);
  return { p: p, q: q, berkas: q.admin || q.fo, bayar: q.admin || q.fo || q.bend, bendahara: q.bend, lihat: q.admin || q.fo || q.bend || q.sa || q.ks, admin: q.admin };
}

// ---------------- berkas ----------------
function rfFolder_() {
  var pr = PropertiesService.getScriptProperties(), id = pr.getProperty(RF.PROP_FOLDER);
  if (id) { try { var f0 = DriveApp.getFolderById(id); if (!f0.isTrashed()) return f0; } catch (e) {} }
  var f = DriveApp.createFolder('TH.E-Course - Berkas Pendaftaran (rahasia)');
  pr.setProperty(RF.PROP_FOLDER, f.getId());
  return f;
}
function rfSimpanBerkas_(dataUrl, nama) {
  var m = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Format berkas tidak dikenal.');
  if (['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].indexOf(m[1]) < 0) throw new Error('Berkas harus berupa gambar (JPG/PNG) atau PDF.');
  if (m[2].length * 0.75 > RF.MAKS_BERKAS) throw new Error('Ukuran berkas terlalu besar (maks 2,5 MB).');
  var ext = m[1] === 'application/pdf' ? '.pdf' : (m[1] === 'image/png' ? '.png' : '.jpg');
  return rfFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], nama + ext)).getId();
}

// ---------------- formulir ----------------
var RF_KOLOM = ['nama', 'jk', 'nik', 'nisn', 'tempatLahir', 'tanggalLahir', 'agama', 'alamat', 'rt', 'rw', 'dusun', 'kelurahan', 'kecamatan', 'kodePos',
  'jenisTinggal', 'transportasi', 'hp', 'email', 'program', 'sekolahAsal', 'noKk', 'anakKe', 'jumlahSaudara', 'tinggi', 'berat', 'jarak', 'kebutuhanKhusus',
  'ayahNama', 'ayahTahun', 'ayahPendidikan', 'ayahPekerjaan', 'ayahPenghasilan', 'ayahNik',
  'ibuNama', 'ibuTahun', 'ibuPendidikan', 'ibuPekerjaan', 'ibuPenghasilan', 'ibuNik',
  'waliNama', 'waliTahun', 'waliPendidikan', 'waliPekerjaan', 'waliPenghasilan', 'waliNik'];

function rfBersihData_(d) {
  d = d || {};
  var o = {};
  RF_KOLOM.forEach(function(k) { o[k] = String(d[k] === null || d[k] === undefined ? '' : d[k]).replace(/\s+/g, ' ').trim().slice(0, 200); });
  o.nama = o.nama.toUpperCase();
  if (o.nama.length < 3) throw new Error('Nama lengkap calon peserta wajib diisi.');
  if (['L', 'P'].indexOf(o.jk) < 0) throw new Error('Pilih jenis kelamin.');
  if (!/^\d{16}$/.test(o.nik)) throw new Error('NIK harus 16 angka.');
  if (o.nisn && !/^\d{10}$/.test(o.nisn)) throw new Error('NISN harus 10 angka (kosongkan bila tidak ada).');
  if (o.noKk && !/^\d{16}$/.test(o.noKk)) throw new Error('Nomor KK harus 16 angka.');
  ['ayahNik', 'ibuNik', 'waliNik'].forEach(function(k) { if (o[k] && !/^\d{16}$/.test(o[k])) throw new Error('NIK orang tua/wali harus 16 angka.'); });
  if (!o.tempatLahir || !o.tanggalLahir) throw new Error('Tempat dan tanggal lahir wajib diisi.');
  o.tanggalLahir = absTglSah_(o.tanggalLahir);
  if (!o.alamat) throw new Error('Alamat wajib diisi.');
  if (!o.program) throw new Error('Pilih program / paket yang dituju.');
  if (!/^[0-9+ ]{9,16}$/.test(o.hp)) throw new Error('Nomor HP calon peserta wajib diisi (9–16 angka).');
  if (!o.ibuNama) throw new Error('Nama ibu kandung wajib diisi.');
  return o;
}

function rfStatus_(x) {
  if (x['STATUS BAYAR'] === 'Dikembalikan') return 'Dana Dikembalikan';
  if (x['STATUS BAYAR'] === 'Pengembalian Diajukan') return 'Pengembalian Diajukan';
  if (x['STATUS BAYAR'] === 'Lunas' && x['STATUS BERKAS'] === 'Terverifikasi') return 'Selesai';
  if (x['STATUS BERKAS'] === 'Perlu Perbaikan') return 'Perlu Perbaikan';
  if (x['STATUS BERKAS'] === 'Ditolak') return 'Ditolak';
  if (x['STATUS BAYAR'] === 'Menunggu Verifikasi') return 'Menunggu Verifikasi Bayar';
  if (x['STATUS BAYAR'] === 'Ditolak') return 'Pembayaran Ditolak';
  if (x['STATUS BERKAS'] === 'Terverifikasi') return 'Menunggu Pembayaran';
  return 'Menunggu Verifikasi Berkas';
}

function rfObj_(x, lengkap) {
  var d = rfJson_(x['DATA'], {}), b = rfJson_(x['BERKAS'], {});
  var o = {
    id: x['ID'], waktu: x['WAKTU'], promotor: x['PROMOTOR NAMA'], nama: x['NAMA'], nik: lengkap ? x['NIK'] : String(x['NIK']).replace(/^(\d{4})\d+(\d{4})$/, '$1********$2'),
    program: x['PROGRAM'], status: rfStatus_(x), statusBerkas: x['STATUS BERKAS'], catatanBerkas: x['CATATAN BERKAS'], statusBayar: x['STATUS BAYAR'] || 'Belum',
    catatanBayar: x['CATATAN BAYAR'], metodeBayar: x['METODE BAYAR'], cashback: Number(x['CASHBACK']) || 0, berkas: Object.keys(b), idWb: x['ID WB'],
    bisaPerbaiki: x['STATUS BERKAS'] !== 'Terverifikasi' && x['STATUS BERKAS'] !== 'Ditolak',
    bisaBayar: ['Lunas', 'Menunggu Verifikasi', 'Pengembalian Diajukan', 'Dikembalikan'].indexOf(x['STATUS BAYAR']) < 0 && x['STATUS BERKAS'] !== 'Ditolak'
  };
  if (lengkap) {
    o.data = d;
    o.hp = x['HP'];
    o.promotorPeran = x['PROMOTOR PERAN'];
    o.promotorInfo = rfJson_(x['PROMOTOR INFO'], {});
    o.promotorKunci = x['PROMOTOR KUNCI'];
    o.verifBerkas = x['VERIF BERKAS OLEH'] ? x['VERIF BERKAS OLEH'] + ' · ' + x['VERIF BERKAS PADA'] : '';
    o.verifBayar = x['VERIF BAYAR OLEH'] ? x['VERIF BAYAR OLEH'] + ' · ' + x['VERIF BAYAR PADA'] : '';
    o.adaBukti = !!x['BUKTI BAYAR'];
    o.jumlahBayar = Number(x['JUMLAH BAYAR']) || 0;
    o.idTransaksi = x['ID TRANSAKSI'] || '';
    o.bisaKembali = x['STATUS BAYAR'] === 'Lunas' && !x['ID WB'];
  }
  return o;
}

function rfCari_(id) {
  var x = rfBaca_('DAFTAR').filter(function(y) { return y['ID'] === String(id); })[0];
  if (!x) throw new Error('Data pendaftaran tidak ditemukan.');
  return x;
}

// ---------------- saldo & notifikasi ----------------
function rfSaldo_(kunci, saldoRows) {
  return (saldoRows || rfBaca_('SALDO')).filter(function(s) { return s['PROMOTOR KUNCI'] === kunci; }).reduce(function(t, s) { return t + (Number(s['JUMLAH']) || 0); }, 0);
}
function rfNotif_(kunci, judul, pesan) {
  var ms = Date.now();
  try { rfTambah_('NOTIF', { 'WAKTU MS': String(ms), 'KUNCI': kunci, 'JUDUL': judul, 'PESAN': pesan }); } catch (e) {}
  try { CacheService.getScriptCache().put('rfn|' + kunci, String(ms), 21600); } catch (e2) {}
}
function rfKunciDariToken_(token) {
  var c = CacheService.getScriptCache(), ck = 'rft|' + String(token).slice(0, 200);
  var k = c.get(ck);
  if (k) return k;
  try { var p = stafDariToken_(token); k = 'staf|' + p.id; } catch (e) { k = '-'; }
  c.put(ck, k, 21600);
  return k;
}
// Dipanggil dari doPost: sisipkan notifikasi referral ke pemeriksa chat (aplikasi 1.34+ menampilkannya).
function rfSisipNotif_(fn, args, data) {
  try {
    if ((fn !== 'waStafRuangCek' && fn !== 'waRuangCek') || !data || typeof data !== 'object') return data;
    var sejak = Number(fn === 'waRuangCek' ? args[2] : args[1]) || 0;
    if (sejak <= 0) return data;
    var kunci = fn === 'waRuangCek' ? 'siswa|' + String(args[1] || '') + '|' + normNama_(args[0]) : rfKunciDariToken_(args[0]);
    if (!kunci || kunci === '-') return data;
    var c = CacheService.getScriptCache(), akhir = c.get('rfn|' + kunci);
    if (akhir !== null && Number(akhir) <= sejak) return data;
    var ada = rfBaca_('NOTIF').filter(function(n) { return n['KUNCI'] === kunci; });
    var maks = 0;
    ada.forEach(function(n) { maks = Math.max(maks, Number(n['WAKTU MS']) || 0); });
    c.put('rfn|' + kunci, String(maks), 21600);
    data.referral = ada.filter(function(n) { return Number(n['WAKTU MS']) > sejak; }).map(function(n) { return { waktu: Number(n['WAKTU MS']), judul: n['JUDUL'], pesan: n['PESAN'] }; });
  } catch (e) {}
  return data;
}

// ---------------- promotor ----------------
function rfRekening_(kunci) {
  var r = rfBaca_('PROMOTOR').filter(function(x) { return x['KUNCI'] === kunci; })[0];
  return r ? { metode: r['METODE'], bank: r['BANK'], nomor: r['NOMOR'], atasNama: r['ATAS NAMA'], hp: r['HP'] } : null;
}

function waRefKonteks(token) {
  var a = rfAkun_(token), at = rfAturan_(), saldoRows = rfBaca_('SALDO');
  var daftar = rfBaca_('DAFTAR').filter(function(x) { return x['PROMOTOR KUNCI'] === a.kunci; }).map(function(x) { return rfObj_(x, false); }).reverse();
  var riwayat = saldoRows.filter(function(s) { return s['PROMOTOR KUNCI'] === a.kunci; }).map(function(s) {
    return { waktu: s['WAKTU'], jenis: s['JENIS'], jumlah: Number(s['JUMLAH']) || 0, keterangan: s['KETERANGAN'] };
  }).reverse();
  var tarik = rfBaca_('TARIK').filter(function(t) { return t['PROMOTOR KUNCI'] === a.kunci; }).map(function(t) {
    return { id: t['ID'], waktu: t['WAKTU'], jumlah: Number(t['JUMLAH']) || 0, status: t['STATUS'], catatan: t['CATATAN'], diproses: t['DIPROSES PADA'], adaBukti: !!t['BUKTI'] };
  }).reverse();
  var rek = rfRekening_(a.kunci);
  if (!rek && a.staf) {
    try { var tt = absTutorSaya_(a.staf); if (tt) { var rt = honRekening_(tt.id, true); if (rt) rek = { metode: rt.metode, bank: rt.bank, nomor: rt.nomor, atasNama: rt.atasNama, hp: '', dariTutor: true }; } } catch (e) {}
  }
  var program = [];
  try { program = indRef_().program.map(function(x) { return { id: x.id, nama: x.nama }; }); } catch (e2) {}
  var ap = rfAturanPublik_(at);
  if (at.qrisFile) { try { var qb = DriveApp.getFileById(at.qrisFile).getBlob(); ap.qris = 'data:' + qb.getContentType() + ';base64,' + Utilities.base64Encode(qb.getBytes()); } catch (e3) {} }
  return { nama: a.nama, peran: a.peran, saldo: rfSaldo_(a.kunci, saldoRows), rekening: rek, aturan: ap, daftar: daftar, riwayat: riwayat, tarik: tarik,
    program: program, berkasJenis: RF.BERKAS, berkasWajib: RF.WAJIB_BERKAS };
}

// berkas: {foto: dataUrl, ijazah, kk, ktp, ttd}
function waRefDaftar(token, d, berkas) {
  var a = rfAkun_(token), o = rfBersihData_(d);
  berkas = berkas || {};
  RF.WAJIB_BERKAS.forEach(function(k) { if (!berkas[k]) throw new Error('Unggah ' + RF.BERKAS[k] + '.'); });
  var dobel = rfBaca_('DAFTAR').filter(function(x) { return x['NIK'] === o.nik && rfStatus_(x) !== 'Ditolak'; })[0];
  if (dobel) throw new Error('NIK ini sudah didaftarkan (' + dobel['ID'] + ', promotor ' + dobel['PROMOTOR NAMA'] + ').');
  var id = rfId_('DAF-'), simpan = {};
  Object.keys(RF.BERKAS).forEach(function(k) { if (berkas[k]) simpan[k] = rfSimpanBerkas_(berkas[k], id + '_' + k + '_' + o.nama); });
  var info = a.info;
  try {
    if (a.staf) { var tt = absTutorSaya_(a.staf); if (tt) { info.idTutor = tt.id; info.hp = tt.hp || ''; } }
  } catch (e) {}
  var rek = rfRekening_(a.kunci);
  if (rek && rek.hp) info.hp = rek.hp;
  rfTambah_('DAFTAR', {
    'ID': id, 'WAKTU': rfWaktu_(), 'PROMOTOR KUNCI': a.kunci, 'PROMOTOR NAMA': a.nama, 'PROMOTOR PERAN': a.peran, 'PROMOTOR INFO': JSON.stringify(info),
    'NAMA': o.nama, 'NIK': o.nik, 'PROGRAM': o.program, 'HP': o.hp, 'DATA': JSON.stringify(o), 'BERKAS': JSON.stringify(simpan),
    'STATUS BERKAS': 'Menunggu', 'STATUS BAYAR': 'Belum', 'DIPERBARUI': rfWaktu_()
  });
  try { catat_(a.peran, '', a.nama, 'Referral daftar', id + ' ' + o.nama, 'OK'); } catch (e2) {}
  return { sukses: true, id: id };
}

function rfMilik_(token, id) {
  var a = rfAkun_(token), x = rfCari_(id);
  if (x['PROMOTOR KUNCI'] !== a.kunci) throw new Error('Pendaftaran ini bukan milik Anda.');
  return { a: a, x: x };
}

function waRefDetail(token, id) {
  var m = rfMilik_(token, id), o = rfObj_(m.x, true);
  delete o.promotorInfo; delete o.promotorKunci;
  return o;
}

function waRefPerbaiki(token, id, d, berkas) {
  var m = rfMilik_(token, id), x = m.x;
  if (x['STATUS BERKAS'] === 'Terverifikasi' || x['STATUS BERKAS'] === 'Ditolak') throw new Error('Data yang sudah diverifikasi/ditolak tidak dapat diubah.');
  var o = rfBersihData_(d), lama = rfJson_(x['BERKAS'], {});
  berkas = berkas || {};
  Object.keys(RF.BERKAS).forEach(function(k) {
    if (!berkas[k]) return;
    if (lama[k]) { try { DriveApp.getFileById(lama[k]).setTrashed(true); } catch (e) {} }
    lama[k] = rfSimpanBerkas_(berkas[k], id + '_' + k + '_' + o.nama);
  });
  RF.WAJIB_BERKAS.forEach(function(k) { if (!lama[k]) throw new Error('Unggah ' + RF.BERKAS[k] + '.'); });
  rfUbah_('DAFTAR', x._baris, { 'NAMA': o.nama, 'NIK': o.nik, 'PROGRAM': o.program, 'HP': o.hp, 'DATA': JSON.stringify(o), 'BERKAS': JSON.stringify(lama),
    'STATUS BERKAS': 'Menunggu', 'CATATAN BERKAS': '', 'DIPERBARUI': rfWaktu_() });
  return { sukses: true };
}

// metode: 'Sekretariat' | 'Transfer' | 'QRIS'. bukti: dataUrl (Transfer / QRIS statis).
function waRefBayar(token, id, metode, bukti) {
  var m = rfMilik_(token, id), x = m.x, at = rfAturan_();
  if (x['STATUS BAYAR'] === 'Lunas') throw new Error('Pembayaran sudah lunas.');
  if (x['STATUS BAYAR'] === 'Menunggu Verifikasi') throw new Error('Bukti pembayaran sedang diperiksa petugas.');
  if (x['STATUS BAYAR'] === 'Pengembalian Diajukan' || x['STATUS BAYAR'] === 'Dikembalikan') throw new Error('Pembayaran pendaftaran ini sedang/sudah dikembalikan.');
  metode = String(metode || '');
  if (metode === 'Sekretariat') {
    rfUbah_('DAFTAR', x._baris, { 'METODE BAYAR': 'Sekretariat', 'STATUS BAYAR': 'Belum', 'CATATAN BAYAR': 'Akan membayar langsung di sekretariat', 'DIPERBARUI': rfWaktu_() });
    return { sukses: true, pesan: 'Silakan bayar langsung di sekretariat. Petugas akan menandai lunas.' };
  }
  if (metode === 'QRIS' && at.gateway.aktif && at.gateway.serverKey && String(at.gateway.penyedia || 'midtrans') === 'midtrans' && !bukti) return rfQrisDinamis_(x, at);
  if (metode === 'Online') {   // v1.48.0: DOKU Checkout
    var o = gwBuatOrder_({ jenis: 'Pendaftaran', ref: x['ID'], nama: x['NAMA'], uraian: 'Biaya pendaftaran ' + x['NAMA'], pokok: at.biaya, metode: bukti, hp: x['HP'], oleh: m.a.nama });   // v1.49.0: argumen ke-4 = kode metode
    rfUbah_('DAFTAR', x._baris, { 'METODE BAYAR': 'DOKU', 'ORDER GATEWAY': o.invoice, 'DIPERBARUI': rfWaktu_() });
    return { sukses: true, url: o.url, invoice: o.invoice, jumlah: o.jumlah, pokok: o.pokok, biaya: o.biaya, metode: o.metode, kadaluarsa: o.kadaluarsa, pesan: 'Selesaikan pembayaran di halaman DOKU. Status lunas tercatat otomatis.' };
  }
  if (metode !== 'Transfer' && metode !== 'QRIS') throw new Error('Metode pembayaran tidak dikenal.');
  if (!bukti) throw new Error('Unggah bukti pembayaran.');
  var f = rfSimpanBerkas_(bukti, id + '_bukti_bayar');
  if (x['BUKTI BAYAR']) { try { DriveApp.getFileById(x['BUKTI BAYAR']).setTrashed(true); } catch (e) {} }
  rfUbah_('DAFTAR', x._baris, { 'METODE BAYAR': metode, 'BUKTI BAYAR': f, 'STATUS BAYAR': 'Menunggu Verifikasi', 'CATATAN BAYAR': '', 'DIPERBARUI': rfWaktu_() });
  return { sukses: true, pesan: 'Bukti pembayaran terkirim. Petugas akan memeriksanya.' };
}

function waRefRekening(token, d) {
  var a = rfAkun_(token);
  d = d || {};
  var metode = ['Transfer Bank', 'E-Wallet'].indexOf(d.metode) >= 0 ? d.metode : 'Transfer Bank';
  var bank = String(d.bank || '').trim().slice(0, 40), nomor = String(d.nomor || '').replace(/[^\d]/g, '').slice(0, 30), an = String(d.atasNama || '').trim().slice(0, 60);
  var hp = String(d.hp || '').replace(/[^\d+]/g, '').slice(0, 16);
  if (!bank || nomor.length < 6 || an.length < 3) throw new Error('Lengkapi nama bank/e-wallet, nomor (min 6 angka), dan atas nama.');
  var ada = rfBaca_('PROMOTOR').filter(function(x) { return x['KUNCI'] === a.kunci; })[0];
  var o = { 'KUNCI': a.kunci, 'NAMA': a.nama, 'PERAN': a.peran, 'METODE': metode, 'BANK': bank, 'NOMOR': nomor, 'ATAS NAMA': an, 'HP': hp, 'DIPERBARUI': rfWaktu_() };
  if (ada) rfUbah_('PROMOTOR', ada._baris, o); else rfTambah_('PROMOTOR', o);
  return { sukses: true };
}

function waRefTarik(token, jumlah) {
  var a = rfAkun_(token), at = rfAturan_();
  jumlah = Math.round(Number(jumlah) || 0);
  if (jumlah < at.minTarik) throw new Error('Penarikan minimal ' + honRp_(at.minTarik) + '.');
  var rek = rfRekening_(a.kunci);
  if (!rek) throw new Error('Isi data rekening pembayaran Anda dulu.');
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var saldo = rfSaldo_(a.kunci);
    if (jumlah > saldo) throw new Error('Saldo tidak cukup (saldo ' + honRp_(saldo) + ').');
    var id = rfId_('TRK-');
    rfTambah_('TARIK', { 'ID': id, 'WAKTU': rfWaktu_(), 'PROMOTOR KUNCI': a.kunci, 'PROMOTOR NAMA': a.nama, 'PROMOTOR PERAN': a.peran, 'JUMLAH': jumlah,
      'REKENING': [rek.metode, rek.bank, rek.nomor, 'a.n. ' + rek.atasNama].join(' · '), 'STATUS': 'Menunggu' });
    rfTambah_('SALDO', { 'ID': absId_(), 'WAKTU': rfWaktu_(), 'PROMOTOR KUNCI': a.kunci, 'PROMOTOR NAMA': a.nama, 'JENIS': 'Penarikan', 'JUMLAH': -jumlah, 'REF': id, 'KETERANGAN': 'Pengajuan penarikan ' + id });
  } finally { kunci.releaseLock(); }
  try { catat_(a.peran, '', a.nama, 'Referral tarik', honRp_(jumlah), 'OK'); } catch (e) {}
  return { sukses: true };
}

function rfBerkasB64_(fileId) {
  if (!fileId) throw new Error('Berkas tidak ada.');
  var bl = DriveApp.getFileById(fileId).getBlob();
  return { b64: Utilities.base64Encode(bl.getBytes()), mime: bl.getContentType(), nama: bl.getName() };
}
// jenis: foto|ijazah|kk|ktp|ttd|bukti
function waRefBerkas(token, id, jenis) {
  var m = rfMilik_(token, id);
  return rfBerkasB64_(jenis === 'bukti' ? m.x['BUKTI BAYAR'] : rfJson_(m.x['BERKAS'], {})[jenis]);
}

// ---------------- QRIS dinamis (Midtrans; disiapkan, aktif bila diaktifkan Admin) ----------------
function rfMidtransBase_(g) { return g.produksi ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com'; }
function rfQrisDinamis_(x, at) {
  var g = at.gateway, biaya = Math.round(Number(at.biaya) || 0);
  if (biaya <= 0) throw new Error('Biaya pendaftaran belum diatur Admin.');
  var order = x['ID'] + '-' + Date.now().toString(36);
  var res = UrlFetchApp.fetch(rfMidtransBase_(g) + '/v2/charge', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(g.serverKey + ':') },
    payload: JSON.stringify({ payment_type: 'qris', transaction_details: { order_id: order, gross_amount: biaya }, qris: { acquirer: 'gopay' } })
  });
  var j = rfJson_(res.getContentText(), {});
  if (res.getResponseCode() >= 300 || !j.actions) throw new Error('Gagal membuat QRIS: ' + (j.status_message || res.getResponseCode()));
  var url = '';
  (j.actions || []).forEach(function(a) { if (a.name === 'generate-qr-code') url = a.url; });
  rfUbah_('DAFTAR', x._baris, { 'METODE BAYAR': 'QRIS', 'ORDER GATEWAY': order, 'DIPERBARUI': rfWaktu_() });
  return { sukses: true, qrUrl: url, qrString: j.qr_string || '', jumlah: biaya, order: order, pesan: 'Pindai QRIS untuk membayar. Status lunas otomatis setelah pembayaran berhasil.' };
}
// Notifikasi Midtrans (Payment Notification URL = alamat web app /exec). Dipanggil dari doPost.
function refWebhook_(body) {
  var at = rfAturan_(), g = at.gateway;
  if (!g.serverKey) return { ok: false };
  var sig = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_512, String(body.order_id) + String(body.status_code) + String(body.gross_amount) + g.serverKey)
    .map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  if (sig !== String(body.signature_key)) return { ok: false, alasan: 'tanda tangan' };
  var st = String(body.transaction_status || '');
  if (st !== 'settlement' && st !== 'capture') return { ok: true, status: st };
  var x = rfBaca_('DAFTAR').filter(function(y) { return y['ORDER GATEWAY'] === String(body.order_id); })[0];
  if (!x || ['Lunas', 'Pengembalian Diajukan', 'Dikembalikan'].indexOf(x['STATUS BAYAR']) >= 0) return { ok: true };
  rfUbah_('DAFTAR', x._baris, { 'STATUS BAYAR': 'Lunas', 'JUMLAH BAYAR': Math.round(Number(body.gross_amount) || 0), 'VERIF BAYAR OLEH': 'QRIS otomatis', 'VERIF BAYAR PADA': rfWaktu_(), 'DIPERBARUI': rfWaktu_() });
  var oto = { nama: 'QRIS otomatis', peran: 'Sistem' };
  rfCatatBayarAman_(rfCari_(x['ID']), oto, true);   // v1.44.0: pemasukan sebesar yang dibayar + biaya layanan terpisah
  rfSelesaikan_(rfCari_(x['ID']), oto);
  return { ok: true };
}

// ---------------- penyelesaian ----------------
function rfKategori_(kode, nama, jenis) {
  try {
    var t = absBaca_(KEU.TAB_KAT);
    for (var i = 1; i < t.v.length; i++) if (sTeks_(absNilai_(t, t.v[i], 'KODE KATEGORI')).trim() === kode) return;
    t.sh.appendRow(absBaris_(t, { 'KODE KATEGORI': kode, 'NAMA KATEGORI': nama, 'JENIS': jenis }));
  } catch (e) {}
}
function rfTrx_(o) {
  var tx = keuTrxTab_(), id = absId_();
  o['ID TRANSAKSI'] = id;
  tx.sh.appendRow(absBaris_(tx, o));
  return id;
}
// Dipanggil saat kedua verifikasi lolos (sekali saja).
function rfSelesaikan_(x, oleh) {
  if (rfStatus_(x) !== 'Selesai' || x['ID WB']) return;
  var at = rfAturan_(), d = rfJson_(x['DATA'], {}), sim = {};
  try { sim = absSim_(); } catch (e) {}
  var idWb = '';
  try {
    var t = absBaca_('WARGA BELAJAR');
    idWb = 'WB-' + absId_().toUpperCase();
    var alamat = [d.alamat, d.rt ? 'RT ' + d.rt : '', d.rw ? 'RW ' + d.rw : '', d.dusun, d.kelurahan, d.kecamatan, d.kodePos].filter(String).join(', ');
    t.sh.appendRow(absBaris_(t, {
      'ID WB': idWb, 'NAMA WB': d.nama, 'NIK': d.nik, 'NISN': d.nisn, 'JENIS KELAMIN': d.jk, 'TEMPAT LAHIR': d.tempatLahir, 'TANGGAL LAHIR': d.tanggalLahir,
      'AGAMA': d.agama, 'ALAMAT': alamat, 'NO HP': d.hp, 'HP': d.hp, 'EMAIL': d.email, 'NAMA AYAH': d.ayahNama, 'NAMA IBU': d.ibuNama, 'NAMA WALI': d.waliNama,
      'NO KK': d.noKk, 'SEKOLAH ASAL': d.sekolahAsal, 'PROGRAM': d.program, 'STATUS': 'Aktif', 'KETERANGAN': 'Pendaftaran referral ' + x['ID'] + ' (promotor ' + x['PROMOTOR NAMA'] + ')'
    }));
    try { if (typeof indSegarkan_ === 'function') indSegarkan_(); } catch (e0) {}
  } catch (e1) { idWb = ''; }
  // v1.44.0: pemasukan dicatat saat lunas (rfCatatBayar_); di sini hanya cadangan untuk yang belum tercatat.
  if (x['ID TRANSAKSI']) kalTautWb_(x['ID TRANSAKSI'], idWb);
  else { x['ID WB'] = idWb; rfCatatBayarAman_(x, oleh, /otomatis/i.test(oleh.nama || '')); }
  var cb = Math.round(Number(at.cashback) || 0);
  if (cb > 0) rfTambah_('SALDO', { 'ID': absId_(), 'WAKTU': rfWaktu_(), 'PROMOTOR KUNCI': x['PROMOTOR KUNCI'], 'PROMOTOR NAMA': x['PROMOTOR NAMA'], 'JENIS': 'Cashback',
    'JUMLAH': cb, 'REF': x['ID'], 'KETERANGAN': 'Cashback pendaftaran ' + x['NAMA'] });
  rfUbah_('DAFTAR', x._baris, { 'ID WB': idWb || '-', 'CASHBACK': cb, 'DIPERBARUI': rfWaktu_() });
  rfNotif_(x['PROMOTOR KUNCI'], 'Cashback ' + honRp_(cb) + ' masuk', 'Pendaftaran ' + x['NAMA'] + ' terverifikasi. Saldo referral Anda bertambah ' + honRp_(cb) + '.');
}

// ---------------- petugas ----------------
function waStafRefAdmin(token, q) {
  var r = rfPetugas_(token);
  if (!r.lihat) throw new Error('Peran Anda tidak dapat melihat data referral.');
  q = q || {};
  if (r.bayar) { try { rfPulihkanKas_(); } catch (e0) {} }
  var semua = rfBaca_('DAFTAR').map(function(x) { return rfObj_(x, true); }).reverse();
  var hitung = {};
  semua.forEach(function(x) { hitung[x.status] = (hitung[x.status] || 0) + 1; });
  var tarik = rfBaca_('TARIK').map(function(t) {
    return { id: t['ID'], waktu: t['WAKTU'], promotor: t['PROMOTOR NAMA'], peran: t['PROMOTOR PERAN'], jumlah: Number(t['JUMLAH']) || 0, rekening: t['REKENING'],
      status: t['STATUS'], oleh: t['DIPROSES OLEH'], pada: t['DIPROSES PADA'], catatan: t['CATATAN'], adaBukti: !!t['BUKTI'],
      disetujuiOleh: t['DISETUJUI OLEH'], disetujuiPada: t['DISETUJUI PADA'] };
  }).reverse();
  var saldo = {}, nama = {};
  rfBaca_('SALDO').forEach(function(s) { saldo[s['PROMOTOR KUNCI']] = (saldo[s['PROMOTOR KUNCI']] || 0) + (Number(s['JUMLAH']) || 0); nama[s['PROMOTOR KUNCI']] = s['PROMOTOR NAMA']; });
  var promotor = Object.keys(saldo).map(function(k) { return { kunci: k, nama: nama[k], saldo: saldo[k], rekening: rfRekening_(k) }; }).sort(function(a, b) { return b.saldo - a.saldo; });
  return { daftar: semua, hitung: hitung, tarik: tarik, promotor: promotor, aturan: rfAturanPublik_(rfAturan_()),
    peran: { berkas: r.berkas, bayar: r.bayar, bendahara: r.bendahara, admin: r.admin, sa: !!r.q.sa } };
}

function waStafRefVerifBerkas(token, id, keputusan, catatan) {
  var r = rfPetugas_(token);
  if (!r.berkas) throw new Error('Verifikasi berkas oleh Admin atau Front Office.');
  var x = rfCari_(id);
  keputusan = String(keputusan || '');
  var map = { setuju: 'Terverifikasi', perbaiki: 'Perlu Perbaikan', tolak: 'Ditolak' };
  if (!map[keputusan]) throw new Error('Keputusan tidak dikenal.');
  catatan = String(catatan || '').trim().slice(0, 300);
  if (keputusan !== 'setuju' && catatan.length < 5) throw new Error('Tuliskan catatan untuk promotor.');
  rfUbah_('DAFTAR', x._baris, { 'STATUS BERKAS': map[keputusan], 'CATATAN BERKAS': catatan, 'VERIF BERKAS OLEH': r.p.nama, 'VERIF BERKAS PADA': rfWaktu_(), 'DIPERBARUI': rfWaktu_() });
  var judul = keputusan === 'setuju' ? 'Berkas terverifikasi' : (keputusan === 'perbaiki' ? 'Berkas perlu diperbaiki' : 'Pendaftaran ditolak');
  rfNotif_(x['PROMOTOR KUNCI'], judul + ': ' + x['NAMA'], keputusan === 'setuju' ? 'Lanjutkan ke pembayaran pendaftaran.' : catatan);
  var y = rfCari_(id);
  if (keputusan === 'setuju') rfSelesaikan_(y, r.p);
  try { catat_(r.p.peran, '', r.p.nama, 'Referral verif berkas', id + ' ' + map[keputusan], 'OK'); } catch (e) {}
  return { sukses: true, status: rfStatus_(y) };
}

// keputusan: 'lunas' (bukti sah / bayar di sekretariat) | 'tolak'. jumlah: nominal diterima (bawaan biaya).
function waStafRefVerifBayar(token, id, keputusan, catatan, jumlah) {
  var r = rfPetugas_(token);
  if (!r.bayar) throw new Error('Verifikasi pembayaran oleh Admin, Front Office, atau Bendahara.');
  var x = rfCari_(id), at = rfAturan_();
  if (x['STATUS BAYAR'] === 'Lunas') throw new Error('Pembayaran sudah lunas.');
  if (x['STATUS BAYAR'] === 'Pengembalian Diajukan' || x['STATUS BAYAR'] === 'Dikembalikan') throw new Error('Pembayaran ini sedang/sudah dikembalikan.');
  catatan = String(catatan || '').trim().slice(0, 300);
  if (keputusan === 'tolak') {
    if (catatan.length < 5) throw new Error('Tuliskan alasan penolakan.');
    rfUbah_('DAFTAR', x._baris, { 'STATUS BAYAR': 'Ditolak', 'CATATAN BAYAR': catatan, 'VERIF BAYAR OLEH': r.p.nama, 'VERIF BAYAR PADA': rfWaktu_(), 'DIPERBARUI': rfWaktu_() });
    rfNotif_(x['PROMOTOR KUNCI'], 'Pembayaran ditolak: ' + x['NAMA'], catatan);
    return { sukses: true };
  }
  if (keputusan !== 'lunas') throw new Error('Keputusan tidak dikenal.');
  var jml = Math.round(Number(jumlah) || Number(at.biaya) || 0);
  rfUbah_('DAFTAR', x._baris, { 'STATUS BAYAR': 'Lunas', 'METODE BAYAR': x['METODE BAYAR'] || 'Sekretariat', 'JUMLAH BAYAR': jml, 'CATATAN BAYAR': catatan,
    'VERIF BAYAR OLEH': r.p.nama, 'VERIF BAYAR PADA': rfWaktu_(), 'DIPERBARUI': rfWaktu_() });
  rfNotif_(x['PROMOTOR KUNCI'], 'Pembayaran lunas: ' + x['NAMA'], x['STATUS BERKAS'] === 'Terverifikasi' ? 'Pendaftaran selesai.' : 'Menunggu verifikasi berkas.');
  rfCatatBayarAman_(rfCari_(id), r.p, false);   // v1.44.0: pemasukan tercatat saat lunas
  var y = rfCari_(id);
  rfSelesaikan_(y, r.p);
  try { catat_(r.p.peran, '', r.p.nama, 'Referral verif bayar', id + ' lunas ' + jml, 'OK'); } catch (e) {}
  return { sukses: true, status: rfStatus_(rfCari_(id)) };
}

function waStafRefBerkas(token, id, jenis) {
  var r = rfPetugas_(token);
  if (!r.lihat) throw new Error('Peran Anda tidak dapat melihat berkas.');
  var x = rfCari_(id);
  return rfBerkasB64_(jenis === 'bukti' ? x['BUKTI BAYAR'] : rfJson_(x['BERKAS'], {})[jenis]);
}

function rfCariTarik_(id) {
  var t = rfBaca_('TARIK').filter(function(y) { return y['ID'] === String(id); })[0];
  if (!t) throw new Error('Pengajuan penarikan tidak ditemukan.');
  return t;
}
// Hanya Bendahara: catat pembayaran penarikan (+bukti transfer), notifikasi promotor, catat pengeluaran.
function waStafRefTarikBayar(token, id, bukti, catatan, paksa) {
  var r = rfPetugas_(token);
  if (!r.bendahara) throw new Error('Pembayaran penarikan hanya oleh Bendahara.');
  var t = rfCariTarik_(id);
  if (t['STATUS'] === 'Menunggu') throw new Error('Penarikan ini belum disetujui Ketua Yayasan.');
  if (t['STATUS'] !== 'Disetujui') throw new Error('Pengajuan ini sudah ' + t['STATUS'] + '.');
  if (!bukti) throw new Error('Unggah bukti transfer.');
  kalCekSaldo_('Swadaya', Number(t['JUMLAH']) || 0, paksa === true, r.p, 'Penarikan referral ' + id);
  var f = keuSimpanBukti_(bukti, 'REFERRAL_' + id + '_' + Utilities.formatDate(new Date(), absTz_(), 'yyyyMMdd_HHmmss') + '.jpg');
  rfKategori_(RF.KAT_RFL, 'Cashback Referral Pendaftaran', 'Pengeluaran');
  var sim = {};
  try { sim = absSim_(); } catch (e) {}
  var idTrx = '';
  {
    idTrx = rfTrx_({ 'TANGGAL': absHariIni_(), 'JENIS': 'Pengeluaran', 'KATEGORI KEUANGAN': RF.KAT_RFL, 'URAIAN': 'Penarikan cashback referral ' + t['PROMOTOR NAMA'] + ' (' + id + ')',
      'JUMLAH': Number(t['JUMLAH']) || 0, 'SUMBER DANA': 'Swadaya', 'PIHAK TERKAIT': t['PROMOTOR NAMA'], 'BUKTI': f, 'STATUS': 'Disetujui', 'AKUN KAS': kalAkunBawaan_('transfer'), 'DIPUTUS OLEH': t['DISETUJUI OLEH'] || r.p.nama,
      'TANGGAL KEPUTUSAN': String(t['DISETUJUI PADA'] || '').slice(0, 10) || absHariIni_(), 'CATATAN KEPUTUSAN': 'Penarikan cashback referral (disetujui ' + (t['DISETUJUI OLEH'] || '-') + ', dibayar ' + r.p.nama + ')', 'TAHUN PELAJARAN': sim.tahun || '', 'DICATAT OLEH': r.p.nama, 'DICATAT PADA': absWaktu_() });
  }
  rfUbah_('TARIK', t._baris, { 'STATUS': 'Dibayar', 'DIPROSES OLEH': r.p.nama, 'DIPROSES PADA': rfWaktu_(), 'BUKTI': f, 'CATATAN': String(catatan || '').slice(0, 300), 'ID TRANSAKSI': idTrx });
  rfNotif_(t['PROMOTOR KUNCI'], 'Penarikan ' + honRp_(Number(t['JUMLAH']) || 0) + ' sudah dibayar', 'Dana telah ditransfer ke ' + t['REKENING'] + '. Cek rekening Anda.');
  try { catat_(r.p.peran, '', r.p.nama, 'Referral bayar tarik', id + ' ' + t['JUMLAH'], 'OK'); } catch (e3) {}
  return { sukses: true };
}
function waStafRefTarikTolak(token, id, alasan) {
  var r = rfPetugas_(token);
  if (!r.bendahara && !r.q.sa) throw new Error('Penolakan penarikan oleh Bendahara atau Ketua Yayasan.');
  var t = rfCariTarik_(id);
  if (t['STATUS'] !== 'Menunggu' && t['STATUS'] !== 'Disetujui') throw new Error('Pengajuan ini sudah ' + t['STATUS'] + '.');
  alasan = String(alasan || '').trim().slice(0, 300);
  if (alasan.length < 5) throw new Error('Tuliskan alasan penolakan.');
  rfUbah_('TARIK', t._baris, { 'STATUS': 'Ditolak', 'DIPROSES OLEH': r.p.nama, 'DIPROSES PADA': rfWaktu_(), 'CATATAN': alasan });
  rfTambah_('SALDO', { 'ID': absId_(), 'WAKTU': rfWaktu_(), 'PROMOTOR KUNCI': t['PROMOTOR KUNCI'], 'PROMOTOR NAMA': t['PROMOTOR NAMA'], 'JENIS': 'Pengembalian',
    'JUMLAH': Number(t['JUMLAH']) || 0, 'REF': id, 'KETERANGAN': 'Penarikan ditolak: ' + alasan });
  rfNotif_(t['PROMOTOR KUNCI'], 'Penarikan ditolak', alasan + ' Saldo dikembalikan.');
  return { sukses: true };
}
function waStafRefTarikBukti(token, id) {
  var r = rfPetugas_(token);
  if (!r.lihat) throw new Error('Peran Anda tidak dapat melihat bukti.');
  return rfBerkasB64_(rfCariTarik_(id)['BUKTI']);
}

// ---------------- pengaturan (Admin) ----------------
function waStafRefAturan(token) {
  var r = rfPetugas_(token);
  if (!r.lihat) throw new Error('Peran Anda tidak dapat melihat pengaturan referral.');
  var a = rfAturan_(), g = JSON.parse(JSON.stringify(a.gateway));
  if (g.serverKey) g.serverKey = '••••' + String(g.serverKey).slice(-4);
  if (g.dokuSecretKey) g.dokuSecretKey = '••••' + String(g.dokuSecretKey).slice(-4);
  if (!String(g.metodeBayar || '').trim()) g.metodeBayar = GWM.BAWAAN;   // v1.49.0
  var qris = '';
  if (a.qrisFile) { try { qris = 'data:image/png;base64,' + Utilities.base64Encode(DriveApp.getFileById(a.qrisFile).getBlob().getBytes()); } catch (e) {} }
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e2) {}
  return { aturan: { biaya: a.biaya, cashback: a.cashback, minTarik: a.minTarik, rekening: a.rekening, alamatSekretariat: a.alamatSekretariat, gateway: g },
    qris: qris, webhook: url, bolehUbah: r.admin };
}
function waAdminRefAturanSimpan(token, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  var a = rfAturan_();
  ['biaya', 'cashback', 'minTarik'].forEach(function(k) { if (d[k] !== undefined) { var n = Math.round(Number(d[k])); if (!(n >= 0)) throw new Error(k + ' tidak valid.'); a[k] = n; } });
  if (d.rekening !== undefined) {
    a.rekening = (Array.isArray(d.rekening) ? d.rekening : []).slice(0, 6).map(function(x) {
      return { bank: String(x.bank || '').trim().slice(0, 40), nomor: String(x.nomor || '').trim().slice(0, 30), atasNama: String(x.atasNama || '').trim().slice(0, 60) };
    }).filter(function(x) { return x.bank && x.nomor; });
  }
  if (d.alamatSekretariat !== undefined) a.alamatSekretariat = String(d.alamatSekretariat || '').slice(0, 200);
  if (d.qris !== undefined) {
    if (a.qrisFile) { try { DriveApp.getFileById(a.qrisFile).setTrashed(true); } catch (e) {} }
    a.qrisFile = d.qris ? rfSimpanBerkas_(d.qris, 'QRIS_LEMBAGA') : '';
  }
  if (d.gateway) {
    var g = d.gateway;
    if (g.aktif !== undefined) a.gateway.aktif = g.aktif === true;
    if (g.produksi !== undefined) a.gateway.produksi = g.produksi === true;
    ['penyedia', 'clientKey', 'merchantId'].forEach(function(k) { if (g[k] !== undefined) a.gateway[k] = String(g[k] || '').trim().slice(0, 120); });
    if (g.serverKey && String(g.serverKey).indexOf('••••') !== 0) a.gateway.serverKey = String(g.serverKey).trim().slice(0, 120);
    if (g.hapusKunci === true) a.gateway.serverKey = '';
    if (g.biayaPersen !== undefined) { var bp = Number(g.biayaPersen); if (!(bp >= 0 && bp <= 10)) throw new Error('Biaya layanan gateway 0–10%.'); a.gateway.biayaPersen = Math.round(bp * 100) / 100; }
    if (g.biayaTetap !== undefined) { var bt = Math.round(Number(g.biayaTetap)); if (!(bt >= 0 && bt <= 100000)) throw new Error('Biaya tetap gateway tidak valid.'); a.gateway.biayaTetap = bt; }
    a.gateway.penyedia = String(a.gateway.penyedia || 'midtrans').toLowerCase() === 'doku' ? 'doku' : 'midtrans';
    if (g.dokuClientId !== undefined) a.gateway.dokuClientId = String(g.dokuClientId || '').trim().slice(0, 80);
    if (g.dokuSecretKey && String(g.dokuSecretKey).indexOf('••••') !== 0) a.gateway.dokuSecretKey = String(g.dokuSecretKey).trim().slice(0, 200);
    if (g.hapusKunciDoku === true) a.gateway.dokuSecretKey = '';
    if (g.dokuMasaBayar !== undefined) { var mb = Math.round(Number(g.dokuMasaBayar)); if (!(mb >= 15 && mb <= 10080)) throw new Error('Masa bayar 15–10080 menit.'); a.gateway.dokuMasaBayar = mb; }
    if (g.biayaKanal !== undefined) a.gateway.biayaKanal = String(g.biayaKanal || '').slice(0, 1000);
    if (g.metodeBayar !== undefined) a.gateway.metodeBayar = String(g.metodeBayar || '').slice(0, 4000);
    if (a.gateway.aktif && a.gateway.penyedia === 'doku' && (!a.gateway.dokuClientId || !a.gateway.dokuSecretKey)) throw new Error('Isi Client ID dan Secret Key DOKU sebelum mengaktifkan.');
    if (a.gateway.aktif && a.gateway.penyedia === 'midtrans' && !a.gateway.serverKey) throw new Error('Isi Server Key sebelum mengaktifkan QRIS dinamis.');
  }
  PropertiesService.getScriptProperties().setProperty(RF.PROP, JSON.stringify(a));
  try { if (a.gateway.aktif && a.gateway.penyedia === 'doku') gwPastikanPemicu_(); } catch (eP) {}
  try { catat_(p.peran, '', p.nama, 'Atur referral', 'biaya ' + a.biaya + ', cashback ' + a.cashback + ', min ' + a.minTarik + ', gateway ' + (a.gateway.aktif ? 'aktif' : 'nonaktif'), 'OK'); } catch (e2) {}
  return waStafRefAturan(token);
}

// ---------------- popup promosi saat aplikasi dibuka (aplikasi 1.34) ----------------
// Urutan di aplikasi: 1) promosi (bila aktif), 2) jendela pembaruan (bila ada versi baru).
// Konten diatur Admin: gambar, judul, teks, tombol aksi (buka Referral / buka tautan / tanpa tombol), sasaran.
var PROMO = { PROP: 'TH_PROMOSI', BAWAAN: { aktif: false, judul: '', teks: '', gambarFile: '', tombol: 'Daftarkan sekarang', aksi: 'referral', url: '', sasaran: 'semua', rev: 0 } };
function promoAturan_() {
  var a = JSON.parse(JSON.stringify(PROMO.BAWAAN));
  try { var s = JSON.parse(PropertiesService.getScriptProperties().getProperty(PROMO.PROP) || '{}'); Object.keys(s).forEach(function(k) { a[k] = s[k]; }); } catch (e) {}
  return a;
}
function promoGambar_(id) {
  if (!id) return '';
  try { var b = DriveApp.getFileById(id).getBlob(); return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()); } catch (e) { return ''; }
}
// Tanpa token (dipanggil saat aplikasi dibuka). revKlien: revisi gambar yang sudah tersimpan di HP; gambar hanya dikirim bila berbeda.
function waStafPromosi(revKlien) {
  var a = promoAturan_();
  if (!a.aktif) return { aktif: false };
  var out = { aktif: true, judul: a.judul, teks: a.teks, tombol: a.tombol, aksi: a.aksi, url: a.url, sasaran: a.sasaran, rev: a.rev, adaGambar: !!a.gambarFile };
  if (a.gambarFile && Number(revKlien) !== Number(a.rev)) {
    var c = CacheService.getScriptCache(), ck = 'promo_img_' + a.rev, g = '';
    try { g = c.get(ck) || ''; } catch (e) {}
    if (!g) { g = promoGambar_(a.gambarFile); try { if (g.length < 95000) c.put(ck, g, 21600); } catch (e2) {} }
    out.gambar = g;
  }
  return out;
}
function waStafPromosiAtur(token) {
  var p = stafDariToken_(token);
  if (!absPeran_(p).admin) throw new Error('Pengaturan promosi hanya untuk Admin.');
  var a = promoAturan_();
  return { aturan: { aktif: a.aktif, judul: a.judul, teks: a.teks, tombol: a.tombol, aksi: a.aksi, url: a.url, sasaran: a.sasaran, rev: a.rev }, gambar: promoGambar_(a.gambarFile) };
}
// d: {aktif, judul, teks, tombol, aksi: 'referral'|'url'|'tutup', url, sasaran: 'semua'|'staf'|'siswa', gambar: dataUrl | '' (hapus)}
function waAdminPromosiSimpan(token, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  var a = promoAturan_();
  if (d.aktif !== undefined) a.aktif = d.aktif === true;
  ['judul', 'teks', 'tombol', 'url'].forEach(function(k) { if (d[k] !== undefined) a[k] = String(d[k] || '').slice(0, k === 'teks' ? 1000 : 200); });
  if (d.aksi !== undefined) a.aksi = ['referral', 'url', 'tutup'].indexOf(d.aksi) >= 0 ? d.aksi : 'tutup';
  if (d.sasaran !== undefined) a.sasaran = ['semua', 'staf', 'siswa'].indexOf(d.sasaran) >= 0 ? d.sasaran : 'semua';
  if (a.aksi === 'url' && !/^https?:\/\//.test(a.url)) throw new Error('Tautan harus diawali https://');
  if (d.gambar !== undefined) {
    if (a.gambarFile) { try { DriveApp.getFileById(a.gambarFile).setTrashed(true); } catch (e) {} }
    a.gambarFile = d.gambar ? rfSimpanBerkas_(d.gambar, 'PROMOSI_' + Date.now()) : '';
    a.rev = (Number(a.rev) || 0) + 1;
  }
  if (a.aktif && !a.gambarFile && !a.judul && !a.teks) throw new Error('Isi gambar atau teks promosi sebelum mengaktifkan.');
  PropertiesService.getScriptProperties().setProperty(PROMO.PROP, JSON.stringify(a));
  try { catat_(p.peran, '', p.nama, 'Atur promosi', (a.aktif ? 'aktif' : 'nonaktif') + ' · ' + a.judul, 'OK'); } catch (e2) {}
  return waStafPromosiAtur(token);
}
