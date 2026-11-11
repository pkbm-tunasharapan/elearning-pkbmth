// ============================================================
// PENDAFTARAN SISWA MANDIRI + OTP EMAIL
// ------------------------------------------------------------
// Alur daftar (halaman ?halaman=daftar):
//   1. Siswa mengisi nama, tanggal lahir, email, dan memilih ROMBEL (kelas) dari daftar.
//      Hanya rombel yang pendaftarannya DIBUKA admin yang muncul (default: tertutup;
//      admin membuka/menutup per rombel kapan saja di tab Pendaftaran Siswa).
//   2. Sistem mengirim OTP 6 angka ke email (berlaku 10 menit, maksimal 5 salah).
//   3. OTP benar -> baris siswa dibuat di tab Siswa, siswa mendapat Kode Akses
//      (dipakai saat kirim diskusi/absensi/ujian, sama seperti siswa lama).
//
// Alur masuk: Nama + Kata Sandi. Kata sandi = "TH-" + tanggal lahir ddmmyyyy
// (contoh lahir 3 Maret 2009 -> TH-03032009). Awalan "TH-" tetap dan dipaksa oleh
// server. OTP email HANYA dipakai saat pendaftaran awal, tidak lagi saat masuk.
// Tebakan kata sandi dibatasi (10 salah -> diblokir 30 menit per nama).
//
// Batas email: MailApp punya kuota harian (akun Gmail biasa sekitar 100/hari);
// karena hanya dipakai saat pendaftaran, kuota ini cukup untuk ratusan siswa.
// ============================================================

var PEND = {
  SHEET_BUKA: 'Pendaftaran Rombel',
  HEADERS_BUKA: ['ID Rombel', 'Nama Rombel', 'Status', 'Diperbarui'],
  OTP_DETIK: 600,
  OTP_MAKS_SALAH: 5,
  OTP_MAKS_KIRIM: 3,
  OTP_JEDA_DETIK: 45,
  EMAIL_MAKS_PER_JAM: 5,
  EMAIL_MAKS_PER_NAMA_JAM: 5,
  EMAIL_MAKS_GLOBAL_JAM: 40,
  GAGAL_MASUK_MAKS: 10,
  GAGAL_MASUK_DETIK: 1800,
  SANDI_AWALAN: 'TH-'
};

// ---------- utilitas ----------
function pastikanSheetPendaftaran_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(PEND.SHEET_BUKA)) {
    var sh = ss.insertSheet(PEND.SHEET_BUKA);
    sh.getRange(1, 1, 1, PEND.HEADERS_BUKA.length).setValues([PEND.HEADERS_BUKA]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

function hex_(bytes) {
  return bytes.map(function(b) { var x = (b < 0 ? b + 256 : b).toString(16); return x.length === 1 ? '0' + x : x; }).join('');
}

function sha256_(teks) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, teks, Utilities.Charset.UTF_8));
}

function pepper_() {
  var p = PropertiesService.getScriptProperties();
  var v = p.getProperty('PEPPER');
  if (!v) { v = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('PEPPER', v); }
  return v;
}

function hashOtp_(sesi, kode) {
  return sha256_(pepper_() + ':' + sesi + ':' + String(kode).trim());
}

function buatOtp_() {
  var angka = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000;
  var s = String(angka);
  while (s.length < 6) s = '0' + s;
  return s;
}

function emailValid_(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim()) && String(e).length <= 120;
}

function maskEmail_(e) {
  var p = String(e).split('@');
  if (p.length !== 2) return '***';
  var depan = p[0].length <= 2 ? p[0].charAt(0) : p[0].slice(0, 2);
  return depan + '***@' + p[1];
}

// Penghitung dengan jendela waktu tetap (CacheService), mengembalikan nilai setelah ditambah 1.
function hitung_(kunci, detik) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get(kunci);
  var n = 1, mulai = Date.now();
  if (raw) {
    var o = JSON.parse(raw);
    n = o.n + 1; mulai = o.t;
  }
  var sisa = Math.max(1, detik - Math.floor((Date.now() - mulai) / 1000));
  cache.put(kunci, JSON.stringify({ n: n, t: mulai }), sisa);
  return n;
}

function bacaHitung_(kunci) {
  var raw = CacheService.getScriptCache().get(kunci);
  return raw ? JSON.parse(raw).n : 0;
}

function escHtml_(t) {
  return String(t === null || t === undefined ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// OTP hanya dikirim saat pendaftaran awal.
function kirimOtpEmail_(email, kode, nama) {
  if (MailApp.getRemainingDailyQuota() < 1) throw new Error('KUOTA_EMAIL');
  var menit = Math.round(PEND.OTP_DETIK / 60);
  var sapaan = nama ? String(nama).trim() : 'Siswa';
  var kalimat = 'Terima kasih telah mendaftar di Belajar Mandiri PKBM Tunas Harapan. Masukkan kode verifikasi berikut untuk menyelesaikan pendaftaran akun Anda.';
  var judul = kode + ' adalah kode verifikasi Belajar Mandiri PKBM Tunas Harapan';

  var teks = 'Halo, ' + sapaan + '\n\n' +
    kalimat + '\n\n' +
    'Kode verifikasi Anda:\n\n' +
    '    ' + kode + '\n\n' +
    'Kode berlaku ' + menit + ' menit dan hanya dapat dipakai satu kali.\n\n' +
    'PERHATIAN: jangan berikan kode ini kepada siapa pun, termasuk yang mengaku sebagai tutor atau admin. ' +
    'Pihak sekolah tidak pernah meminta kode ini.\n' +
    'Jika Anda tidak merasa melakukan permintaan ini, abaikan email ini. Akun Anda tetap aman.\n\n' +
    '--\n' +
    'PKBM Tunas Harapan - Belajar Mandiri\n' +
    'Email ini dikirim otomatis, mohon tidak membalas.';

  var html =
    '<div style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;">Kode verifikasi Anda ' + escHtml_(kode) + '. Berlaku ' + menit + ' menit.</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e5e9;border-radius:12px;overflow:hidden;">' +
    '<tr><td style="background:#1b7a4d;padding:22px 24px;text-align:center;">' +
    '<div style="font-size:19px;font-weight:bold;color:#ffffff;letter-spacing:.2px;">PKBM Tunas Harapan</div>' +
    '<div style="font-size:13px;color:#d6efe1;margin-top:4px;">Belajar Mandiri</div></td></tr>' +
    '<tr><td style="padding:28px 28px 8px 28px;">' +
    '<p style="margin:0 0 14px 0;font-size:16px;line-height:1.5;">Halo, <b>' + escHtml_(sapaan) + '</b></p>' +
    '<p style="margin:0 0 20px 0;font-size:14.5px;line-height:1.6;color:#374151;">' + escHtml_(kalimat) + '</p>' +
    '<div style="text-align:center;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Kode verifikasi</div>' +
    '<div style="text-align:center;background:#e8f5ee;border:1px solid #b7e1c9;border-radius:10px;padding:16px 8px;font-size:34px;font-weight:bold;letter-spacing:10px;color:#145c3a;font-family:Consolas,\'Courier New\',monospace;">' + escHtml_(kode) + '</div>' +
    '<p style="margin:14px 0 0 0;text-align:center;font-size:13px;color:#6b7280;">Berlaku <b>' + menit + ' menit</b> dan hanya dapat dipakai satu kali.</p>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 28px 28px 28px;">' +
    '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.55;color:#92400e;">' +
    '<b>Jaga kerahasiaan kode ini.</b> Jangan berikan kepada siapa pun, termasuk yang mengaku sebagai tutor atau admin. Pihak sekolah tidak pernah meminta kode ini.</div>' +
    '<p style="margin:16px 0 0 0;font-size:12.5px;line-height:1.55;color:#6b7280;">Jika Anda tidak merasa melakukan permintaan ini, abaikan email ini. Akun Anda tetap aman.</p>' +
    '</td></tr>' +
    '<tr><td style="background:#f9fafb;border-top:1px solid #e2e5e9;padding:14px 24px;text-align:center;font-size:12px;line-height:1.5;color:#9ca3af;">' +
    'PKBM Tunas Harapan - Belajar Mandiri<br>Email ini dikirim otomatis, mohon tidak membalas.</td></tr>' +
    '</table></div>';

  MailApp.sendEmail({ to: email, subject: judul, body: teks, htmlBody: html, name: 'PKBM Tunas Harapan' });
}

function pesanEmailGagal_(e) {
  if (e && e.message === 'KUOTA_EMAIL') return 'Pengiriman email hari ini sudah mencapai batas. Coba lagi besok atau hubungi tutor.';
  return 'Kode tidak bisa dikirim ke email saat ini. Periksa alamat emailnya, atau hubungi tutor.';
}

// ---------- pendaftaran per rombel (dibuka / ditutup admin) ----------
function bacaStatusDaftar_() {
  pastikanSheetPendaftaran_();
  var v = getSheetData(PEND.SHEET_BUKA);
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (!sTeks_(v[i][0]).trim()) continue;
    out.push({ baris: i + 1, idRombel: sTeks_(v[i][0]).trim(), terbuka: sTeks_(v[i][2]).trim() === 'Dibuka' });
  }
  return out;
}

// Rombel aktif yang pendaftarannya dibuka: [{ idRombel, nama }]
function rombelTerbuka_() {
  var buka = {};
  bacaStatusDaftar_().forEach(function(k) { if (k.terbuka) buka[k.idRombel] = true; });
  var out = [];
  getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(r, i) {
    if (i === 0 || !String(r[0]).trim() || sTeks_(r[3]).trim() !== 'Aktif') return;
    var id = sTeks_(r[0]).trim();
    if (buka[id]) out.push({ idRombel: id, nama: sTeks_(r[1]).trim() });
  });
  return out;
}

// Dipakai halaman daftar (publik): hanya id dan nama rombel yang dibuka.
function waDaftarRombel() {
  return { rombel: rombelTerbuka_() };
}

function waAdminDaftarPendaftaran(token) {
  wajibAdmin_(token);
  var buka = {};
  bacaStatusDaftar_().forEach(function(k) { buka[k.idRombel] = k.terbuka; });
  var rombel = [];
  getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(r, i) {
    if (i === 0 || !String(r[0]).trim() || sTeks_(r[3]).trim() !== 'Aktif') return;
    var id = sTeks_(r[0]).trim();
    rombel.push({ idRombel: id, nama: sTeks_(r[1]).trim(), terbuka: !!buka[id] });
  });
  var siswaPerKelas = {}; var mandiriPerKelas = {};
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (i === 0 || !String(r[1]).trim()) return;
    var id = sTeks_(r[0]).trim();
    siswaPerKelas[id] = (siswaPerKelas[id] || 0) + 1; if (String(r[4] || '').trim()) mandiriPerKelas[id] = (mandiriPerKelas[id] || 0) + 1;
  });
  rombel.forEach(function(r) { r.jumlahSiswa = siswaPerKelas[r.idRombel] || 0; r.jumlahMandiri = mandiriPerKelas[r.idRombel] || 0; });
  return { rombel: rombel };
}

// aksi: 'buka' | 'tutup' (satu rombel) | 'bukaSemua' | 'tutupSemua' (semua rombel aktif)
function waAdminAturDaftar(token, idRombel, aksi) {
  var adm = wajibAdmin_(token);
  pastikanSheetPendaftaran_();
  if (['buka', 'tutup', 'bukaSemua', 'tutupSemua'].indexOf(aksi) < 0) throw new Error('Aksi tidak dikenal.');
  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  var ringkas = '';
  try {
    var sheet = getSheet(PEND.SHEET_BUKA);
    var ada = bacaStatusDaftar_();
    var namaRombel = {}, urut = [];
    getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(r, i) {
      if (i > 0 && String(r[0]).trim() && sTeks_(r[3]).trim() === 'Aktif') { var id = sTeks_(r[0]).trim(); namaRombel[id] = sTeks_(r[1]).trim(); urut.push(id); }
    });
    var waktu = waktuSekarang_();
    function tulis(id, buka) {
      var status = buka ? 'Dibuka' : 'Ditutup';
      var rec = null;
      ada.forEach(function(k) { if (k.idRombel === id) rec = k; });
      if (rec) {
        sheet.getRange(rec.baris, 2, 1, 3).setNumberFormat('@');
        sheet.getRange(rec.baris, 2, 1, 3).setValues([[namaRombel[id] || '', status, waktu]]);
        rec.terbuka = buka;
      } else {
        var b = sheet.getLastRow() + 1;
        sheet.getRange(b, 1, 1, 4).setNumberFormat('@');
        sheet.getRange(b, 1, 1, 4).setValues([[id, namaRombel[id] || '', status, waktu]]);
        ada.push({ baris: b, idRombel: id, terbuka: buka });
      }
    }
    if (aksi === 'bukaSemua' || aksi === 'tutupSemua') {
      var buka = aksi === 'bukaSemua';
      urut.forEach(function(id) { tulis(id, buka); });
      ringkas = (buka ? 'dibuka: ' : 'ditutup: ') + urut.length + ' rombel';
    } else {
      if (!namaRombel.hasOwnProperty(idRombel)) throw new Error('Kelas tidak ditemukan atau tidak aktif.');
      tulis(idRombel, aksi === 'buka');
      ringkas = (aksi === 'buka' ? 'dibuka: ' : 'ditutup: ') + namaRombel[idRombel];
    }
  } finally {
    kunci.releaseLock();
  }
  catat_('Admin', adm.id, adm.nama, 'Pendaftaran rombel', ringkas, 'OK');
  return true;
}

// ---------- kata sandi: TH- + tanggal lahir (ddmmyyyy) ----------
// tgl berformat yyyy-MM-dd -> 'TH-ddMMyyyy'
function kataSandiDariTanggal_(tgl) {
  var p = String(tgl || '').split('-');
  if (p.length !== 3) return '';
  return PEND.SANDI_AWALAN + p[2] + p[1] + p[0];
}

// 'TH-03032009' -> '2009-03-03'; '' bila format salah atau tanggal tidak ada.
function tanggalDariKataSandi_(kataSandi) {
  var t = String(kataSandi === null || kataSandi === undefined ? '' : kataSandi).trim();
  if (t.indexOf(PEND.SANDI_AWALAN) !== 0) return '';
  var angka = t.slice(PEND.SANDI_AWALAN.length);
  if (!/^\d{8}$/.test(angka)) return '';
  var d = +angka.slice(0, 2), m = +angka.slice(2, 4), y = +angka.slice(4, 8);
  var dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
  return angka.slice(4, 8) + '-' + angka.slice(2, 4) + '-' + angka.slice(0, 2);
}

// ---------- pendaftaran siswa ----------
function tanggalLahirValid_(s) {
  s = String(s || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-'), y = +p[0], m = +p[1], d = +p[2];
  var dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return false;
  var sekarang = new Date();
  if (y < 1920) return false;
  var batas = new Date(sekarang.getFullYear() - 3, sekarang.getMonth(), sekarang.getDate());
  return dt <= batas;
}

function siswaSudahAda_(nama, tglText) {
  var v = getSheetData(CONFIG.SHEETS.SISWA);
  for (var i = 1; i < v.length; i++) {
    if (!String(v[i][1]).trim()) continue;
    if (normNama_(v[i][1]) === normNama_(nama) && formatTanggalUntukBanding_(v[i][2]) === tglText) return true;
  }
  return false;
}

function waDaftarMulai(data) {
  pastikanSheetPendaftaran_();
  data = data || {};
  var nama = String(data.nama || '').trim().replace(/\s+/g, ' ');
  var tgl = String(data.tanggalLahir || '').trim();
  var email = String(data.email || '').trim().toLowerCase();
  var idDipilih = String(data.idRombel || '').trim();
  // v1.40.2 (lapis 1): daftar lewat NISN/NIK -> nama, tanggal lahir, rombel dari Data Induk
  var idt = data.kunciIdentitas ? idsAmbilKunci_(data.kunciIdentitas) : null, nisnInduk = '';
  if (data.kunciIdentitas && !idt) return { sukses: false, pesan: 'Pemeriksaan NISN/NIK sudah kedaluwarsa. Ulangi dari langkah pertama.' };
  if (idt) {
    if (!idt.elRombel) return { sukses: false, pesan: 'Kelas Anda (' + idt.namaRombel + ') belum tersedia di TH.E-Course. Hubungi admin.' };
    nama = idt.nama; tgl = idt.tgl; idDipilih = idt.elRombel; nisnInduk = idt.nisn || '';
  }
  if (!idt && !/^[À-ɏA-Za-z][À-ɏA-Za-z\s.'’,\-]{2,79}$/.test(nama)) {
    return { sukses: false, pesan: 'Tulis nama lengkap (minimal 3 huruf, tanpa angka).' };
  }
  if (!tanggalLahirValid_(tgl)) return { sukses: false, pesan: 'Tanggal lahir tidak valid.' };
  if (!emailValid_(email)) return { sukses: false, pesan: 'Alamat email tidak valid.' };
  // v1.40.2 (lapis 2): daftar manual -> cocokkan ke Data Induk (tanggal lahir sama + nama mirip)
  if (!idt) {
    var miripInduk = idsMiripInduk_(nama, tgl);
    var persis = miripInduk.filter(function(w) { return idsSama_(w.nama, nama); });
    if (persis.length === 1 && idsElRombel_(persis[0].namaRombel)) {
      nama = persis[0].nama; idDipilih = idsElRombel_(persis[0].namaRombel); nisnInduk = persis[0].nisn || ''; idt = { induk: true };
    } else if (miripInduk.length) {
      catat_('Calon siswa', '', nama, 'Daftar', 'Ditahan: mirip Data Induk ' + miripInduk[0].nama, 'GAGAL');
      return { sukses: false, mirip: true, pesan: 'Data Anda kemungkinan sudah ada di sekolah sebagai "' + idsSamar_(miripInduk[0].nama) + '" (' + miripInduk[0].namaRombel + '). ' +
        'Daftar memakai NISN/NIK di langkah pertama agar tersambung ke data itu, atau hubungi admin. Jangan mendaftar sebagai siswa baru.' };
    }
  }
  var adaDaftar = cariSiswa_(nama, tgl); if (!idDipilih && !adaDaftar) return { sukses: false, pesan: 'Pilih kelas (rombel) Anda.' };

  var idRombel = '';
  if (idt) idRombel = idDipilih;   // terverifikasi Data Induk: tidak perlu menunggu pendaftaran rombel dibuka
  else rombelTerbuka_().forEach(function(r) { if (r.idRombel === idDipilih) idRombel = r.idRombel; });
  if (adaDaftar && !adaDaftar.email && adaDaftar.idRombel) idRombel = adaDaftar.idRombel;
  if (!idRombel) {
    catat_('Calon siswa', '', nama, 'Daftar', 'Rombel tidak tersedia atau ditutup: ' + idDipilih.slice(0, 40), 'GAGAL');
    return { sukses: false, pesan: 'Kelas (rombel) itu belum membuka pendaftaran. Hubungi tutor atau admin.' };
  }
  if (adaDaftar && adaDaftar.email) {
    return { sukses: false, pesan: 'Nama dan tanggal lahir ini sudah terdaftar. Silakan langsung masuk di halaman siswa.' };
  }
  // Pembatas pengiriman email (tanpa kode kelas, form ini terbuka untuk umum):
  // per email, per nama, dan total per jam supaya kuota harian tidak habis dan email orang lain tidak dibanjiri.
  if (bacaHitung_('otpglobal') >= PEND.EMAIL_MAKS_GLOBAL_JAM) {
    return { sukses: false, pesan: 'Terlalu banyak permintaan pendaftaran saat ini. Coba lagi beberapa saat lagi, atau hubungi tutor.' };
  }
  if (hitung_('otpemail_' + sha256_(email).slice(0, 24), 3600) > PEND.EMAIL_MAKS_PER_JAM) {
    return { sukses: false, pesan: 'Terlalu sering meminta kode untuk email ini. Coba lagi satu jam lagi.' };
  }
  if (hitung_('otpnama_' + normNama_(nama).replace(/[^a-z0-9]/g, '').slice(0, 40), 3600) > PEND.EMAIL_MAKS_PER_NAMA_JAM) {
    return { sukses: false, pesan: 'Terlalu sering mendaftar dengan nama ini. Coba lagi satu jam lagi.' };
  }
  var sesi = Utilities.getUuid();
  var otp = buatOtp_();
  try {
    kirimOtpEmail_(email, otp, nama);
  } catch (e) {
    catat_('Calon siswa', idRombel, nama, 'Daftar', 'Gagal kirim OTP: ' + (e && e.message), 'GAGAL');
    return { sukses: false, pesan: pesanEmailGagal_(e) };
  }
  hitung_('otpglobal', 3600);
  CacheService.getScriptCache().put('otpdaftar_' + sesi, JSON.stringify({
    h: hashOtp_(sesi, otp), a: 0, kirim: 1, t: Date.now(), d: { nama: nama, tgl: tgl, email: email, idRombel: idRombel, nisn: nisnInduk }
  }), PEND.OTP_DETIK);
  catat_('Calon siswa', idRombel, nama, 'Daftar - OTP dikirim', maskEmail_(email), 'OK');
  return { sukses: true, sesi: sesi, emailMasked: maskEmail_(email) };
}

function waDaftarKirimUlang(sesi) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get('otpdaftar_' + sesi);
  if (!raw) return { sukses: false, pesan: 'Sesi pendaftaran habis. Mulai lagi dari awal.' };
  var o = JSON.parse(raw);
  if (o.kirim >= PEND.OTP_MAKS_KIRIM) return { sukses: false, pesan: 'Kode sudah dikirim beberapa kali. Mulai lagi dari awal bila belum menerima.' };
  var jeda = PEND.OTP_JEDA_DETIK - Math.floor((Date.now() - o.t) / 1000);
  if (jeda > 0) return { sukses: false, pesan: 'Tunggu ' + jeda + ' detik sebelum kirim ulang.' };
  if (bacaHitung_('otpglobal') >= PEND.EMAIL_MAKS_GLOBAL_JAM) return { sukses: false, pesan: 'Terlalu banyak permintaan pendaftaran saat ini. Coba lagi beberapa saat lagi, atau hubungi tutor.' };
  var otp = buatOtp_();
  try { kirimOtpEmail_(o.d.email, otp, o.d.nama); }
  catch (e) { return { sukses: false, pesan: pesanEmailGagal_(e) }; }
  hitung_('otpglobal', 3600);
  o.h = hashOtp_(sesi, otp); o.a = 0; o.kirim++; o.t = Date.now();
  cache.put('otpdaftar_' + sesi, JSON.stringify(o), PEND.OTP_DETIK);
  catat_('Calon siswa', o.d.idRombel, o.d.nama, 'Daftar - OTP dikirim ulang', maskEmail_(o.d.email), 'OK');
  return { sukses: true };
}

function waDaftarVerifikasi(sesi, kodeOtp) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get('otpdaftar_' + sesi);
  if (!raw) return { sukses: false, pesan: 'Kode sudah kedaluwarsa. Mulai lagi dari awal.', ulang: true };
  var o = JSON.parse(raw);
  if (o.a >= PEND.OTP_MAKS_SALAH) {
    cache.remove('otpdaftar_' + sesi);
    return { sukses: false, pesan: 'Terlalu banyak salah. Mulai lagi dari awal.', ulang: true };
  }
  if (hashOtp_(sesi, kodeOtp) !== o.h) {
    o.a++;
    cache.put('otpdaftar_' + sesi, JSON.stringify(o), PEND.OTP_DETIK);
    catat_('Calon siswa', o.d.idRombel, o.d.nama, 'Daftar - OTP salah', 'percobaan ' + o.a, 'GAGAL');
    return { sukses: false, pesan: 'Kode salah. Sisa percobaan: ' + (PEND.OTP_MAKS_SALAH - o.a) + '.' };
  }
  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  var kodeAkses = '';
  try {
    var adaV = cariSiswa_(o.d.nama, o.d.tgl); if (adaV && adaV.email) {
      cache.remove('otpdaftar_' + sesi);
      return { sukses: false, pesan: 'Nama dan tanggal lahir ini sudah terdaftar. Silakan langsung masuk.', ulang: true };
    }
    kodeAkses = buatKodeAkses_(CONFIG.PANJANG_KODE_AKSES);
    var sheet = getSheet(CONFIG.SHEETS.SISWA);
    var b = adaV ? adaV.baris : sheet.getLastRow() + 1;
    if (!adaV) sheet.getRange(b, 1, 1, 7).setNumberFormat('@');
    if (adaV) { sheet.getRange(b, 4, 1, 3).setNumberFormat('@'); sheet.getRange(b, 4, 1, 3).setValues([[kodeAkses, o.d.email, waktuSekarang_()]]); o.d.nama = adaV.nama; o.d.idRombel = adaV.idRombel; } else { sheet.getRange(b, 1, 1, 7).setValues([[o.d.idRombel, o.d.nama, o.d.tgl, kodeAkses, o.d.email, waktuSekarang_(), o.d.nisn || '']]); }
    if (adaV && o.d.nisn && !String(sheet.getRange(b, 7).getValue()).trim()) sheet.getRange(b, 7).setNumberFormat('@').setValue(o.d.nisn);
  } finally {
    kunci.releaseLock();
  }
  cache.remove('otpdaftar_' + sesi);
  catat_('Siswa', o.d.idRombel, o.d.nama, 'Daftar - berhasil', 'email ' + maskEmail_(o.d.email), 'OK');
  return { sukses: true, nama: o.d.nama, namaRombel: getNamaRombel_(o.d.idRombel), kodeAkses: kodeAkses, kataSandi: kataSandiDariTanggal_(o.d.tgl) };
}

// ---------- login siswa: Nama + Kata Sandi (TH-ddmmyyyy) ----------
function waLogin(nama, kataSandi) {
  var kunciGagalMasuk = 'gagalmasuk_' + normNama_(nama).replace(/[^a-z0-9]/g, '').slice(0, 40);
  if (bacaHitung_(kunciGagalMasuk) >= PEND.GAGAL_MASUK_MAKS) {
    catat_('Siswa', '', nama, 'Masuk', 'Diblokir sementara karena terlalu banyak salah', 'GAGAL');
    return { sukses: false, pesan: 'Terlalu banyak percobaan yang salah. Tunggu 30 menit lalu coba lagi, atau hubungi tutor.' };
  }
  // v1.39.0: 6 angka = PIN
  if (/^\d{6}$/.test(String(kataSandi === null || kataSandi === undefined ? '' : kataSandi).trim())) return pinMasuk_(nama, String(kataSandi).trim());
  var tgl = tanggalDariKataSandi_(kataSandi);
  if (!tgl) {
    return { sukses: false, pesan: 'Kata sandi berformat TH- diikuti tanggal lahir 8 angka (ddmmyyyy). Contoh lahir 3 Maret 2009: TH-03032009.' };
  }
  var res = waLoginAsli_(nama, tgl);
  if (!res || !res.sukses) {
    hitung_(kunciGagalMasuk, PEND.GAGAL_MASUK_DETIK);
    catat_('Siswa', '', nama, 'Masuk', 'Nama atau kata sandi tidak cocok', 'GAGAL');
    // v1.40.2 (lapis 3): tanggal lahir cocok dengan tepat satu siswa bernama mirip -> sarankan namanya
    var saran = '';
    try { saran = idsSaranLogin_(nama, tgl); } catch (eS) {}
    if (saran && normNama_(saran) !== normNama_(nama)) return { sukses: false, saran: saran, pesan: 'Nama tidak cocok. Maksud Anda: ' + saran + '?' };
    return { sukses: false, pesan: 'Nama atau kata sandi tidak cocok. Periksa kembali, atau tanyakan ke tutor.' };
  }
  // v1.39.0: WB yang sudah punya PIN tidak bisa lagi masuk dengan TH-ddmmyyyy
  var stPin = { ada: false, perlu: false, wajib: false };
  try { stPin = pinStatusTgl_(res.nama, res.idRombel, tgl, true); } catch (eP) {}
  if (stPin.ada) {
    catat_('Siswa', res.idRombel, res.nama, 'Masuk', 'TH- ditolak: sudah memakai PIN', 'GAGAL');
    return { sukses: false, pesan: 'Akun ini sudah memakai PIN. Masuk dengan nama dan PIN 6 angka. Lupa PIN? Minta tutor atau admin me-reset PIN Anda.' };
  }
  res.pin = stPin;
  catat_('Siswa', res.idRombel, res.nama, 'Masuk', '', 'OK');
  try { res.sesi = ssBuat_(res); } catch (e) {}
  return res;
}

// ---------- pembungkus pencatat log untuk fungsi siswa yang sudah ada ----------
function waSubmitJawaban(payload) {
  var gSesi = taGerbang_(payload && payload.idMapel, payload && payload.idMateri, payload && payload.nama, 0) ||
    ndGerbangEdit_(payload) ||
    ndGerbangDiskusi_(payload && payload.idMapel, payload && payload.idMateri, payload && payload.jawaban);
  if (gSesi) return { sukses: false, pesan: gSesi };
  var r = waSubmitJawabanAsli_(payload);
  if (r && r.sukses) {
    try { draftHapus_(payload && payload.idRombel, payload && payload.idMateri, payload && payload.nama); } catch (e) {}
    try { nvCatatJawaban_(payload); } catch (e) {}
    kcpTanda_('jwb');   // v1.42.0: Jawaban berubah
  }
  try {
    catat_('Siswa', payload && payload.idRombel, payload && payload.nama, 'Kirim jawaban',
      'materi ' + (payload && payload.idMateri) + ', mapel ' + (payload && payload.idMapel) + (r && !r.sukses && r.pesan ? ' - ' + r.pesan : ''),
      r && r.sukses ? 'OK' : 'GAGAL');
  } catch (e) {}
  return r;
}

function waMulaiUjianLama_(idUjian, idRombel, idMapel, nama, kodeAkses) {
  var gSesi = taGerbang_(idMapel, idUjian, nama, 0);
  if (gSesi) return { sukses: false, pesan: gSesi };
  var r = waMulaiUjianAsli_(idUjian, idRombel, idMapel, nama, kodeAkses);
  try {
    catat_('Siswa', idRombel, nama, 'Mulai ujian', 'ujian ' + idUjian + (r && !r.sukses && r.pesan ? ' - ' + r.pesan : ''), r && r.sukses === false ? 'GAGAL' : 'OK');
  } catch (e) {}
  return r;
}

function waLaporPindahTab(idUjian, idRombel, nama, kodeAkses, jenis) {
  // Laporan hanya dihitung bila kode akses siswa benar (mencegah orang lain menambah pelanggaran siswa lain).
  if (!cekKodeAksesSiswa_(idRombel, nama, kodeAkses)) {
    try { catat_('Siswa', idRombel, nama, 'Laporan pindah tab ditolak', 'kode akses tidak valid, ujian ' + idUjian, 'GAGAL'); } catch (e) {}
    return { percobaan: 0, terkunci: false, batasPercobaan: CONFIG.BATAS_PERCOBAAN_PINDAH_TAB };
  }
  var r = waLaporPindahTabAsli_(idUjian, idRombel, nama);
  try { pwCatat_(idUjian, idRombel, nama, (jenis === 'layar_terbagi' ? 'Layar terbagi / jendela mengambang' : 'Keluar aplikasi') + (r.terkunci ? ' - ujian terkunci' : ''), 'Pelanggaran ke-' + r.percobaan + ' dari batas ' + r.batasPercobaan); } catch (ePw) {}
  if (r.terkunci) {   // v1.55.0: sanksi bertingkat
    try { var sx = pwSetelahKunci_(idUjian, idRombel, nama); r.kunciKe = sx.kunciKe; r.kirimOtomatis = sx.kirimOtomatis; r.perluPimpinan = sx.perluPimpinan; } catch (eSx) {}
  }
  try { catat_('Siswa', idRombel, nama, 'Pindah tab saat ujian', 'ujian ' + idUjian, 'GAGAL'); } catch (e) {}
  return r;
}

function waSubmitUjianLama_(payload) {
  var gSesi = taGerbang_(payload && payload.idMapel, payload && payload.idUjian, payload && payload.nama, TA.TOLERANSI_KIRIM_MENIT);
  if (gSesi) return { sukses: false, pesan: gSesi };
  var r = waSubmitUjianAsli_(payload);
  try {
    catat_('Siswa', payload && payload.idRombel, payload && payload.nama, 'Kirim ujian',
      'ujian ' + (payload && payload.idUjian) + (r && !r.sukses && r.pesan ? ' - ' + r.pesan : ''), r && r.sukses === false ? 'GAGAL' : 'OK');
  } catch (e) {}
  return r;
}

// ---------- sesi siswa: tetap masuk saat halaman di-refresh (berlaku maks 6 jam, disimpan di sessionStorage peramban) ----------
var SS = { AWAL: 'sis_', DURASI: 6 * 3600 };

function ssBuat_(res) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(SS.AWAL + token, JSON.stringify({ nama: res.nama, idRombel: res.idRombel }), SS.DURASI);
  return token;
}

// kunciPerangkat (v1.38.7, opsional): kunci perangkat jangka panjang (Broadcast.gs). Bila token sesi 6 jam sudah
// habis tetapi kunci perangkat sah untuk siswa ini, diterbitkan token sesi baru (siswa tidak perlu login ulang).
// Token yang masih berlaku diperpanjang lagi 6 jam setiap kali dipulihkan.
function waPulihSesiSiswa(token, kunciPerangkat) {
  var gagal = { sukses: false };
  var c = CacheService.getScriptCache(), d = null, mentah = null;
  if (token && String(token).length >= 40) mentah = c.get(SS.AWAL + String(token));
  if (mentah) {
    try { d = JSON.parse(mentah); } catch (e) { d = null; }
    if (d) c.put(SS.AWAL + String(token), mentah, SS.DURASI);
  }
  if (!d && kunciPerangkat && typeof bcAudiens_ === 'function') {
    var a = bcAudiens_(kunciPerangkat);
    if (a && a.jenis === 'siswa' && a.nama && a.rombel) {
      d = { nama: a.nama, idRombel: a.rombel };
      token = ssBuat_(d);
    }
  }
  if (!d) return gagal;
  if (!siswaTerdaftar_(d.nama, d.idRombel)) {
    var baru = null;
    try { baru = idsIdentitasTerbaru_(d.nama, d.idRombel); } catch (eB) {}
    if (baru) { d = baru; token = ssBuat_(d); }
  }
  var ada = false;
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (i > 0 && sTeks_(r[0]).trim() === d.idRombel && normNama_(r[1]) === normNama_(d.nama)) ada = true;
  });
  if (!ada) return gagal;
  var stPin = { ada: false, perlu: false, wajib: false };
  try { stPin = pinStatus_(d.nama, d.idRombel, true); } catch (eP) {}
  return { sukses: true, idRombel: d.idRombel, namaRombel: getNamaRombel_(d.idRombel), nama: d.nama, daftarMapel: getMapelAktifUntukRombel_(d.idRombel), sesi: String(token), pin: stPin };
}

function waKeluarSiswa(token) {
  if (token && String(token).length >= 40) CacheService.getScriptCache().remove(SS.AWAL + String(token));
  return true;
}

// ---------- batas ubah jawaban diskusi: ND_EDIT_MENIT menit sejak kirim PERTAMA ----------
var ND_EDIT_MENIT = 5;

function ndGerbangEdit_(payload) {
  try {
    if (!payload) return '';
    var found = getMateriById_(payload.idMateri);
    if (!found) return '';
    var c = found.cols, row = found.row;
    if (String(row[c.idMapel - 1]) !== String(payload.idMapel)) return '';
    if (String(row[c.jenis - 1] || '').trim() !== 'Diskusi') return '';
    var v = getSheet(CONFIG.SHEETS.JAWABAN).getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][3]) === String(payload.idMateri) && v[i][6] === payload.nama) {
        var w = (v[i][9] instanceof Date) ? v[i][9].getTime() : new Date(String(v[i][9])).getTime();
        if (isNaN(w) || new Date().getTime() - w > ND_EDIT_MENIT * 60000) {
          return 'Jawaban diskusi hanya dapat diubah dalam ' + ND_EDIT_MENIT + ' menit setelah dikirim. Waktu untuk mengubah sudah habis.';
        }
        return '';
      }
    }
  } catch (e) {}
  return '';
}


function cariSiswa_(nama, tglText) {
  var v = getSheetData(CONFIG.SHEETS.SISWA);
  for (var i = 1; i < v.length; i++) {
    if (!String(v[i][1]).trim()) continue;
    if ((normNama_(v[i][1]) === normNama_(nama) || sswKompak_(v[i][1]) === sswKompak_(nama)) && formatTanggalUntukBanding_(v[i][2]) === tglText) {
      return { baris: i + 1, nama: String(v[i][1]).trim(), idRombel: String(v[i][0]).trim(), email: String(v[i][4] || '').trim() };
    }
  }
  // Tidak ada yang persis sama: cari siswa dengan tanggal lahir sama dan nama sangat mirip (salah ketik, urutan kata, spasi) supaya tidak jadi data ganda.
  var terbaik = null, skorTerbaik = 99;
  for (var j = 1; j < v.length; j++) {
    if (!String(v[j][1]).trim()) continue;
    if (formatTanggalUntukBanding_(v[j][2]) !== tglText) continue;
    var d = jarakNama_(v[j][1], nama);
    if (d <= 2 && d < skorTerbaik) { skorTerbaik = d; terbaik = j; }
  }
  if (terbaik !== null) {
    return { baris: terbaik + 1, nama: String(v[terbaik][1]).trim(), idRombel: String(v[terbaik][0]).trim(), email: String(v[terbaik][4] || '').trim(), mirip: true };
  }
  return null;
}


// Jarak antar dua nama (0 = sama setelah dirapikan). Urutan kata diabaikan; maks 2 salah huruf dihitung mirip.
function kunciNamaMirip_(n) {
  return normNama_(n).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(String).sort().join('');
}
function jarakNama_(a, b) {
  var x = kunciNamaMirip_(a), y = kunciNamaMirip_(b);
  if (!x || !y) return 99;
  if (x === y) return 0;
  if (Math.min(x.length, y.length) < 6) return 99;
  if (Math.abs(x.length - y.length) > 2) return 99;
  var prev = [], cur = [], i, j;
  for (j = 0; j <= y.length; j++) prev[j] = j;
  for (i = 1; i <= x.length; i++) {
    cur = [i];
    for (j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x.charAt(i - 1) === y.charAt(j - 1) ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

// (versi lama, digantikan analisaDataGanda() di SinkronSiswa.gs)
function analisaDataGandaLama_() {
  var v = getSheetData(CONFIG.SHEETS.SISWA), sh0 = getSheet(CONFIG.SHEETS.SISWA), ss = sh0.getParent();
  var baris = [];
  for (var i = 1; i < v.length; i++) {
    if (!String(v[i][1]).trim()) continue;
    baris.push({ b: i + 1, rombel: sTeks_(v[i][0]).trim(), nama: sTeks_(v[i][1]).trim(), tgl: formatTanggalUntukBanding_(v[i][2]), email: String(v[i][4] || '').trim().toLowerCase(), daftar: sTeks_(v[i][5]) });
  }
  var hasil = [], pasang = {};
  function tambah(a, c, alasan) {
    var k = a.b + '-' + c.b; if (pasang[k]) return; pasang[k] = true;
    hasil.push([alasan, a.b, a.rombel, a.nama, a.tgl, a.email, c.b, c.rombel, c.nama, c.tgl, c.email]);
  }
  for (var x = 0; x < baris.length; x++) {
    for (var y = x + 1; y < baris.length; y++) {
      var p = baris[x], q = baris[y];
      var d = jarakNama_(p.nama, q.nama);
      if (d === 0 && p.tgl === q.tgl) tambah(p, q, 'Nama dan tanggal lahir sama');
      else if (d <= 2 && p.tgl && p.tgl === q.tgl) tambah(p, q, 'Tanggal lahir sama, nama mirip');
      else if (d === 0) tambah(p, q, 'Nama sama, tanggal lahir berbeda');
      if (p.email && p.email === q.email) tambah(p, q, 'Email sama dipakai dua baris');
    }
  }
  var nl = 'Analisa Ganda', sh = ss.getSheetByName(nl) || ss.insertSheet(nl);
  sh.clear();
  var kop = [['Indikasi', 'Baris A', 'Rombel A', 'Nama A', 'Tgl Lahir A', 'Email A', 'Baris B', 'Rombel B', 'Nama B', 'Tgl Lahir B', 'Email B']];
  var isi = kop.concat(hasil.length ? hasil : [['Tidak ditemukan indikasi data ganda', '', '', '', '', '', '', '', '', '', '']]);
  sh.getRange(1, 1, isi.length, 11).setNumberFormat('@').setValues(isi);
  sh.getRange(isi.length + 2, 1).setValue('Dianalisis ' + waktuSekarang_());
  return hasil.length;
}
