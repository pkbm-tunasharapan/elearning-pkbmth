// ============================================================================
// API UNTUK APLIKASI FLUTTER (staf/admin)
// ----------------------------------------------------------------------------
// Satu pintu doPost: body JSON {"fn": "waStafProfil", "args": [token, ...]}.
// Hanya fungsi publik berawalan waStaf / waAdmin (plus waUrlStaf) yang boleh
// dipanggil; semuanya sudah memeriksa token & peran sendiri, persis seperti saat
// dipanggil dari halaman web lewat google.script.run. Fungsi berakhiran "_"
// (internal) tidak bisa dipanggil.
// ============================================================================
var API_FLUTTER = {
  VERSI: '1',
  POLA: /^wa(Staf|Admin)[A-Za-z0-9]+$/,
  TAMBAHAN: {
    // staf
    waUrlStaf: true, waPimpinanUjianPutusan: true,
    // pemberitahuan / broadcast (siswa & staf; Broadcast.gs)
    waNotifDaftar: true, waNotifCek: true, waNotifKeluar: true,
    // kartu pencapaian studi siswa
    waSiswaPencapaian: true,
    // PIN warga belajar (PinSiswa.gs)
    waSiswaPinBuat: true,
    // cek NISN/NIK saat mendaftar (IdentitasSiswa.gs)
    waDaftarCekIdentitas: true,
    // siswa (fungsi yang sama dengan yang dipakai halaman web siswa)
    waLogin: true, waPulihSesiSiswa: true, waKeluarSiswa: true, waGetMateri: true, waGetRiwayatJawaban: true, waSubmitJawaban: true, waSimpanDraftDiskusi: true, waGetDraftDiskusi: true, waTandaiBaca: true, waStatusUjian: true, waMulaiUjian: true, waSubmitUjian: true, waLaporPindahTab: true, waUjianDetak: true, waUjianAjukan: true, waAbsenIsi: true, waRuangPoll: true, waRuangKirim: true, waRuangCek: true, waSiswaKalender: true, waDaftarRombel: true, waDaftarMulai: true, waDaftarKirimUlang: true, waDaftarVerifikasi: true, waProfilSiswa: true, waProfilSiswaSimpan: true, waDaftarTutorStatus: true, waDaftarTutorCek: true, waDaftarTutorMulaiUndangan: true, waDaftarTutorKirimUlang: true, waDaftarTutorVerifikasiUndangan: true, waStafMasukGoogle: true, waKartuSiswa: true, waSiswaBeranda: true
  }
};

function doPost(e) {
  var out, t0 = Date.now(), fn = '';
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    fn = String(body.fn || '');
    var args = Array.isArray(body.args) ? body.args : [];
    if (!fn && body && body.signature_key && typeof refWebhook_ === 'function') {
      out = { ok: true, data: refWebhook_(body) };
    } else if (!fn && body && body.order && body.order.invoice_number && typeof dokuNotif_ === 'function') {   // v1.48.0: notifikasi DOKU
      out = { ok: true, data: dokuNotif_(body) };
    } else if (fn === 'ping') {
      out = { ok: true, data: { versi: API_FLUTTER.VERSI, waktu: waktuSekarang_() } };
    } else {
      var boleh = (API_FLUTTER.POLA.test(fn) || API_FLUTTER.TAMBAHAN[fn] === true) && typeof globalThis[fn] === 'function';
      if (!boleh) throw new Error('Fungsi tidak diizinkan: ' + fn);
      API_FN_SAAT_INI_ = fn;
      globalThis.__API_FN = fn; globalThis.__API_ARGS = args; globalThis.__API_V = String(body.v || ""); globalThis.__DINAS = false;
      var hasilFn = globalThis[fn].apply(null, args);
      if (globalThis.__DINAS && typeof dinasRapikan_ === 'function') hasilFn = dinasRapikan_(hasilFn);
      if (typeof updLama_ === 'function') hasilFn = updLama_(fn, args, hasilFn, body);
      if (typeof rlsCatatPakai_ === 'function') rlsCatatPakai_(fn, args, body);   // pemakaian rilis uji oleh penguji
      if (typeof rfSisipNotif_ === 'function') hasilFn = rfSisipNotif_(fn, args, hasilFn);
      out = { ok: true, data: hasilFn };
    }
  } catch (err) {
    var pesanGalat = String((err && err.message) || err);
    out = { ok: false, error: pesanGalat };
    // v1.17: catat galat server (kecuali sesi habis / maintenance) ke tab Log Galat.
    if (!/SESI_HABIS|MAINTENANCE/.test(pesanGalat) && typeof pmlCatatGalat_ === 'function') pmlCatatGalat_('server', fn, pesanGalat, err && err.stack, '', '');
  }
  if (typeof perfSetelah_ === 'function') perfSetelah_(fn, Date.now() - t0, !!(out && out.ok));
  var json;
  try { json = JSON.stringify(out); } catch (eJ) { json = JSON.stringify({ ok: false, error: 'Hasil tidak bisa diubah ke JSON.' }); }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// PROFIL AKUN (aplikasi E-Course TH): email, nomor HP, dan foto untuk siswa & staf.
// Disimpan di sheet "Profil Akun". Foto = JPEG kecil (base64, dikecilkan di HP).
// ============================================================================
var PROFIL = { SHEET: 'Profil Akun', HEADERS: ['Kunci', 'Jenis', 'Nama', 'Email', 'No HP', 'Foto', 'Diperbarui'], MAKS_FOTO: 48000 };

function profilSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PROFIL.SHEET);
  if (!sh) {
    sh = ss.insertSheet(PROFIL.SHEET);
    sh.getRange(1, 1, 1, PROFIL.HEADERS.length).setValues([PROFIL.HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function profilCari_(kunci) {
  var sh = profilSheet_();
  var last = sh.getLastRow();
  if (last < 2) return null;
  var v = sh.getRange(2, 1, last - 1, PROFIL.HEADERS.length).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]) === kunci) return { baris: i + 2, email: sTeks_(v[i][3]), hp: sTeks_(v[i][4]), foto: sTeks_(v[i][5]) };
  }
  return null;
}

function profilBersih_(data) {
  data = data || {};
  var email = String(data.email || '').trim();
  var hp = String(data.hp || '').replace(/[^\d+]/g, '');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Alamat email belum benar.');
  if (hp && !/^\+?\d{8,15}$/.test(hp)) throw new Error('Nomor HP harus 8 sampai 15 angka.');
  var foto = data.foto === undefined || data.foto === null ? null : String(data.foto);
  if (foto) {
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(foto)) throw new Error('Foto tidak dikenali.');
    if (foto.length > PROFIL.MAKS_FOTO) throw new Error('Foto terlalu besar. Pilih foto lain.');
  }
  return { email: email.slice(0, 120), hp: hp.slice(0, 16), foto: foto };
}

function profilTulis_(kunci, jenis, nama, d) {
  var sh = profilSheet_();
  var ada = profilCari_(kunci);
  var foto = d.foto === null ? (ada ? ada.foto : '') : d.foto;
  var baris = [kunci, jenis, nama, d.email, d.hp, foto, waktuSekarang_()];
  if (ada) sh.getRange(ada.baris, 1, 1, baris.length).setValues([baris]);
  else sh.appendRow(baris);
  sh.getRange(ada ? ada.baris : sh.getLastRow(), 5).setNumberFormat('@').setValue(d.hp);
  return { email: d.email, hp: d.hp, foto: foto };
}

function siswaDariSesi_(token) {
  var mentah = token ? CacheService.getScriptCache().get(SS.AWAL + String(token)) : null;
  if (!mentah) throw new Error('SESI_HABIS');
  var d = JSON.parse(mentah);
  if (!siswaTerdaftar_(d.nama, d.idRombel)) throw new Error('SESI_HABIS');
  return d;
}

function profilKunciSiswa_(s) { return 'S|' + String(s.idRombel).trim() + '|' + normNama_(s.nama); }

function profilBarisSiswa_(s) {
  var v = getSheetData(CONFIG.SHEETS.SISWA), out = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === String(s.idRombel).trim() && normNama_(v[i][1]) === normNama_(s.nama)) out.push({ baris: i + 1, r: v[i] });
  }
  return out;
}

function waProfilSiswa(token) {
  // v1.78.1: token kedaluwarsa dijawab sebagai data (bukan galat) supaya aplikasi tidak mengulang terus-menerus
  // (88% panggilan sebelumnya gagal SESI_HABIS). Pemulihan sesi tetap lewat waPulihSesiSiswa di aplikasi.
  var s;
  try { s = siswaDariSesi_(token); } catch (e) {
    if (String(e && e.message) === 'SESI_HABIS') return { jenis: 'Siswa', sesiHabis: true, nama: '', email: '', hp: '', foto: '' };
    throw e;
  }
  var p = profilCari_(profilKunciSiswa_(s)) || {};
  var baris = profilBarisSiswa_(s);
  var utama = baris.filter(function(x) { return sTeks_(x.r[3]).trim(); })[0] || baris[0];
  var kontak = utama ? sTeks_(utama.r[4]).trim() : '';
  var tgl = utama ? formatTanggalUntukBanding_(utama.r[2]) : '';
  return {
    jenis: 'Siswa', nama: s.nama, idRombel: s.idRombel, namaRombel: getNamaRombel_(s.idRombel),
    tanggalLahir: tgl, nisn: utama ? sTeks_(utama.r[6]).trim() : '', terdaftar: utama ? sTeks_(utama.r[5]) : '',
    email: p.email || (kontak.indexOf('@') > 0 ? kontak : ''),
    hp: p.hp || (kontak && kontak.indexOf('@') < 0 ? kontak.replace(/[^\d+]/g, '') : ''),
    foto: p.foto || ''
  };
}

function waProfilSiswaSimpan(token, data) {
  var s = siswaDariSesi_(token);
  var d = profilBersih_(data);
  var h = profilTulis_(profilKunciSiswa_(s), 'Siswa', s.nama, d);
  var kontak = d.email || d.hp;
  if (kontak) {
    var sh = getSheet(CONFIG.SHEETS.SISWA);
    profilBarisSiswa_(s).forEach(function(x) { sh.getRange(x.baris, 5).setNumberFormat('@').setValue(kontak); });
  }
  try { catat_('Siswa', s.idRombel, s.nama, 'Ubah profil', '', 'OK'); } catch (e) {}
  return { sukses: true, email: h.email, hp: h.hp, foto: h.foto };
}

function waStafProfilAkun(token) {
  var p = stafDariToken_(token);
  var pr = profilCari_('P|' + p.id) || {};
  var kontak = String(p.hp || '').trim();
  return {
    jenis: 'Staf', nama: p.nama, peran: p.peran, dibuat: p.dibuat,
    email: pr.email || (kontak.indexOf('@') > 0 ? kontak : ''),
    hp: pr.hp || (kontak && kontak.indexOf('@') < 0 ? kontak.replace(/[^\d+]/g, '') : ''),
    foto: pr.foto || ''
  };
}

function waStafProfilAkunSimpan(token, data) {
  var p = stafDariToken_(token);
  var d = profilBersih_(data);
  var h = profilTulis_('P|' + p.id, p.peran, p.nama, d);
  var kontak = d.email || d.hp;
  if (kontak && p.baris) getSheet(PERAN.SHEET_PENGGUNA).getRange(p.baris, 5).setNumberFormat('@').setValue(kontak);
  try { catat_(p.peran, p.id, p.nama, 'Ubah profil', '', 'OK'); } catch (e) {}
  return { sukses: true, email: h.email, hp: h.hp, foto: h.foto };
}

// Sinkron otomatis SIM SETARA tiap 15 menit (tombol di aplikasi; sama dengan pasangSinkronOtomatis).
function waAdminSinkronOtomatis(token) {
  wajibAdmin_(token);
  var ada = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'sinkronSimSetara'; });
  return { aktif: ada };
}

function waAdminSinkronOtomatisAtur(token, aktif) {
  var adm = wajibAdmin_(token);
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'sinkronSimSetara') ScriptApp.deleteTrigger(t); });
  if (aktif === true || aktif === 'true') ScriptApp.newTrigger('sinkronSimSetara').timeBased().everyMinutes(15).create();
  try { catat_('Admin', adm.id, adm.nama, 'Sinkron otomatis', aktif ? 'ON (15 menit)' : 'OFF', 'OK'); } catch (e) {}
  return waAdminSinkronOtomatis(token);
}

// ============================================================================
// PENDAFTARAN TUTOR DENGAN KODE UNDANGAN (aplikasi E-Course TH)
// Tautan umum tetap tertutup. Calon tutor hanya bisa mendaftar bila admin membuka pendaftaran
// dan calon tutor memasukkan kode undangan yang dibagikan admin. Kode bisa diganti kapan saja.
// ============================================================================
var DT_LEWAT_UNDANGAN_ = false;
var DTU = { PROP_BUKA: 'DT_UNDANGAN_BUKA', PROP_KODE: 'DT_UNDANGAN_KODE', HURUF: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', SALAH_MAKS: 20 };

function dtUndanganBuka_() { return PropertiesService.getScriptProperties().getProperty(DTU.PROP_BUKA) === '1'; }
function dtUndanganKode_() { return PropertiesService.getScriptProperties().getProperty(DTU.PROP_KODE) || ''; }
function dtUndanganBuatKode_() {
  var k = '';
  for (var i = 0; i < 6; i++) k += DTU.HURUF.charAt(Math.floor(Math.random() * DTU.HURUF.length));
  PropertiesService.getScriptProperties().setProperty(DTU.PROP_KODE, k);
  return k;
}
function dtUndanganSah_(kode) {
  if (bacaHitung_('dtundangansalah') >= DTU.SALAH_MAKS) throw new Error('Terlalu banyak kode undangan yang salah. Coba lagi satu jam lagi.');
  var k = dtUndanganKode_();
  var sah = !!k && dtUndanganBuka_() && String(kode || '').trim().toUpperCase() === k;
  if (!sah) hitung_('dtundangansalah', 3600);
  return sah;
}

// Publik: apakah tombol "Daftar sebagai tutor" perlu ditampilkan di halaman login.
function waDaftarTutorStatus() { return { terbuka: dtUndanganBuka_() && !!dtUndanganKode_() }; }

// Publik: memeriksa kode undangan; bila sah, mengembalikan daftar mapel yang bisa diajukan.
function waDaftarTutorCek(kode) {
  if (!dtUndanganBuka_()) return { sah: false, pesan: 'Pendaftaran tutor sedang ditutup. Hubungi admin.' };
  if (!dtUndanganSah_(kode)) return { sah: false, pesan: 'Kode undangan salah. Minta kode undangan terbaru kepada admin.' };
  return { sah: true, paket: dtDaftarMapel_() };
}

function waDaftarTutorMulaiUndangan(kode, data) {
  if (!dtUndanganSah_(kode)) return { sukses: false, pesan: 'Kode undangan salah atau pendaftaran sudah ditutup. Minta kode terbaru kepada admin.' };
  DT_LEWAT_UNDANGAN_ = true;
  try {
    var h = waDaftarTutorMulai(data);
    if (h && h.sukses && h.sesi) CacheService.getScriptCache().put('dtundangan_' + h.sesi, '1', PEND.OTP_DETIK);
    return h;
  } finally { DT_LEWAT_UNDANGAN_ = false; }
}

function waDaftarTutorVerifikasiUndangan(sesi, kodeOtp) {
  if (CacheService.getScriptCache().get('dtundangan_' + sesi) !== '1') return { sukses: false, pesan: 'Sesi pendaftaran habis. Mulai lagi dari awal.', ulang: true };
  DT_LEWAT_UNDANGAN_ = true;
  try {
    var h = waDaftarTutorVerifikasi(sesi, kodeOtp);
    if (h && h.sukses) CacheService.getScriptCache().remove('dtundangan_' + sesi);
    return h;
  } finally { DT_LEWAT_UNDANGAN_ = false; }
}

// Admin: status + kode undangan.
function waAdminTutorUndangan(token) {
  wajibAdmin_(token);
  return { terbuka: dtUndanganBuka_(), kode: dtUndanganKode_() };
}

// Admin: buka/tutup pendaftaran dan/atau ganti kode. opsi = { buka: true|false, kodeBaru: true }
function waAdminTutorUndanganAtur(token, opsi) {
  var adm = wajibAdmin_(token);
  opsi = opsi || {};
  var sp = PropertiesService.getScriptProperties();
  if (opsi.buka === true || opsi.buka === false) sp.setProperty(DTU.PROP_BUKA, opsi.buka ? '1' : '0');
  if (opsi.kodeBaru === true || (dtUndanganBuka_() && !dtUndanganKode_())) dtUndanganBuatKode_();
  catat_('Admin', adm.id, adm.nama, 'Undangan tutor', (opsi.buka === true ? 'dibuka' : opsi.buka === false ? 'ditutup' : '') + (opsi.kodeBaru ? ' kode diganti' : ''), 'OK');
  return waAdminTutorUndangan(token);
}

// ============================================================================
// MASUK DENGAN GOOGLE LANGSUNG DARI APLIKASI (tanpa membuka halaman Apps Script).
// Aplikasi mengirim ID token Google; server memeriksa tanda tangan lewat tokeninfo,
// audiens (client ID), email terverifikasi, dan masa berlaku, lalu masuk seperti SSO.
// ============================================================================
var GSI = {
  KLIEN: ['375397226722-ljic4gfj1c0iv8oskjheh5mii88lii5p.apps.googleusercontent.com'],
  PENERBIT: ['accounts.google.com', 'https://accounts.google.com']
};

function waStafMasukGoogle(idToken) {
  idToken = String(idToken || '').trim();
  var gagal = 'Masuk dengan Google gagal. Silakan coba lagi.';
  if (!/^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(idToken)) return ssoGagal_(gagal);
  var res;
  try {
    res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  } catch (e) { return ssoGagal_('Tidak dapat menghubungi Google. Periksa koneksi lalu coba lagi.'); }
  if (res.getResponseCode() !== 200) return ssoGagal_('Sesi Google tidak sah atau sudah kedaluwarsa. Silakan coba lagi.');
  var t;
  try { t = JSON.parse(res.getContentText()); } catch (e2) { return ssoGagal_(gagal); }
  if (GSI.KLIEN.indexOf(String(t.aud)) < 0) return ssoGagal_('Token Google bukan untuk aplikasi ini.');
  if (GSI.PENERBIT.indexOf(String(t.iss)) < 0) return ssoGagal_(gagal);
  if (!(Number(t.exp) * 1000 > Date.now())) return ssoGagal_('Sesi Google sudah kedaluwarsa. Silakan coba lagi.');
  if (String(t.email_verified) !== 'true') return ssoGagal_('Email akun Google belum terverifikasi.');
  var email = String(t.email || '').trim().toLowerCase();
  if (!email) return ssoGagal_(gagal);
  var cache = CacheService.getScriptCache();
  // Token Google boleh dipakai ulang selama masih berlaku (HP bisa memberi token yang sama
  // setelah keluar-masuk). Keamanan: tanda tangan Google, audiens, penerbit, dan masa berlaku.
  var sim = ssoCariDiSim_(email);
  if (!sim) {
    catat_('Staf', '', email, 'Masuk', 'Google (aplikasi): email belum terdaftar di Data Induk', 'GAGAL');
    return ssoGagal_('Akun Google ' + email + ' belum terdaftar sebagai pengguna aktif di Data Induk. Hubungi admin untuk didaftarkan.');
  }
  pastikanSheetPeran_();
  var u = ssoSelaraskan_(email, sim);
  // v1.75.1: akun yang dinonaktifkan Admin tidak diaktifkan kembali oleh login Google
  if (u.status && u.status !== 'Aktif') {
    catat_(u.peran, u.id, u.nama, 'Masuk', 'Google: akun nonaktif', 'GAGAL');
    return ssoGagal_('Akun Anda nonaktif. Hubungi admin.');
  }
  if (u.peran !== 'Admin' && mtAktif_()) return { sukses: false, maintenance: true, pesan: mtPesan_() };
  try { ssoSelarasEnroll_(email, u); } catch (errEnroll) {
    catat_('Staf', u.id, u.nama, 'Sinkron enroll', String(errEnroll && errEnroll.message || errEnroll).slice(0, 150), 'GAGAL');
  }
  var token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('staf_' + token, u.id, PERAN.DURASI_SESI_DETIK);
  catat_(u.peran, u.id, u.nama, 'Masuk', 'Google (aplikasi)', 'OK');
  return { sukses: true, token: token, nama: u.nama, peran: u.peran, email: email };
}

// ============================================================================
// DOKUMEN RPP: daftar mapel yang RPP-nya boleh dilihat/diunduh pengguna ini.
// Admin, Kepala Sekolah, Koordinator Kurikulum: semua mapel aktif. Tutor: mapel yang diampu.
// ============================================================================
function waStafRppDaftarMapel(token) {
  var p = stafDariToken_(token);
  var pimpinan = (p.peran === 'Admin' || p.peran === 'Kepala Sekolah' || p.peran === 'Koordinator Kurikulum' || p.peran === 'Superadmin');
  var boleh = {};
  if (!pimpinan) bacaEnrollment_().forEach(function(e) { if (e.idPengguna === p.id) boleh[e.idMapel] = true; });
  var out = mapelAktifSemua_().filter(function(m) { return pimpinan || boleh[m.idMapel] === true; }).map(function(m) {
    return { idMapel: m.idMapel, namaMapel: m.namaMapel, idRombel: m.idRombel, namaRombel: m.namaRombel, tutor: m.tutorTeks };
  });
  return { mapel: out, dapatUbah: p.peran !== 'Kepala Sekolah' && p.peran !== 'Koordinator Kurikulum' && p.peran !== 'Superadmin' };
}

// ============================================================================
// KEPALA SEKOLAH / KOORDINATOR KURIKULUM: boleh MELIHAT semua mapel (tidak mengampu).
// Hanya fungsi BACA berikut (dipanggil lewat API aplikasi) yang dibuka untuk pimpinan;
// semua fungsi ubah/hapus/nilai tetap ditolak oleh wajibMapel_ seperti sebelumnya.
// ============================================================================
var API_FN_SAAT_INI_ = '';
var PIMPINAN_BACA_ = {
  waStafMateri: true, waStafMateriLengkap: true, waStafSesiBaca: true, waStafSesiDiskusi: true,
  waStafAbsensi: true, waStafNilai: true, waStafSiswa: true, waStafUjianInfo: true, waStafUjianPratinjau: true,
  waStafKurikulumBaca: true, waStafSoalDaftar: true, waStafBukaSesiDaftar: true, waStafUjianTerkunci: true
};
function pimpinanBolehBaca_(p) {
  return !!p && (p.peran === 'Kepala Sekolah' || p.peran === 'Koordinator Kurikulum' || p.peran === 'Superadmin') && PIMPINAN_BACA_[API_FN_SAAT_INI_] === true;
}

// ============================================================================
// KARTU SISWA DIGITAL (aplikasi): QR berisi NISN; bila belum ada NISN dipakai ID Warga Belajar
// dari SIM SETARA (tab WARGA BELAJAR, dicocokkan lewat nama + tanggal lahir).
// ============================================================================
function waKartuSiswa(token) {
  var s = siswaDariSesi_(token);
  var baris = profilBarisSiswa_(s);
  var utama = baris.filter(function(x) { return sTeks_(x.r[6]).trim(); })[0] || baris[0];
  var nisn = utama ? sTeks_(utama.r[6]).trim() : '';
  var tgl = utama ? formatTanggalUntukBanding_(utama.r[2]) : '';
  var idWb = '';
  try {
    var sh = simTab_('WARGA BELAJAR');
    if (sh && sh.getLastRow() >= 2) {
      var v = sh.getDataRange().getValues();
      var h = v[0].map(function(x) { return String(x).trim().toUpperCase(); });
      var iId = h.indexOf('ID WB'), iNisn = h.indexOf('NISN'), iNama = h.indexOf('NAMA WB'), iTgl = h.indexOf('TANGGAL LAHIR'), iSt = h.indexOf('STATUS');
      var cocokNama = null;
      for (var i = 1; i < v.length; i++) {
        var r = v[i];
        if (nisn && iNisn >= 0 && sTeks_(r[iNisn]).trim() === nisn) { idWb = sTeks_(r[iId]).trim(); break; }
        if (!cocokNama && iNama >= 0 && normNama_(r[iNama]) === normNama_(s.nama) && (!tgl || iTgl < 0 || formatTanggalUntukBanding_(r[iTgl]) === tgl)) {
          if (iSt < 0 || sTeks_(r[iSt]).trim() !== 'Nonaktif') cocokNama = r;
        }
      }
      if (!idWb && cocokNama) {
        idWb = sTeks_(cocokNama[iId]).trim();
        if (!nisn && iNisn >= 0) nisn = sTeks_(cocokNama[iNisn]).trim();
      }
    }
  } catch (e) {}
  var kode = nisn || idWb, qrAktif = true;
  try { qrAktif = !idWb || aqrAktif_(idWb); } catch (eQ) {}   // v1.67.1: QR belum diaktivasi -> aplikasi siswa menampilkan pesan kunci
  return { nama: s.nama, idRombel: s.idRombel, namaRombel: getNamaRombel_(s.idRombel), nisn: nisn, idWb: idWb, kode: kode, jenis: nisn ? 'NISN' : (idWb ? 'ID Warga Belajar' : ''),
    qrAktif: qrAktif, pesanQr: qrAktif ? '' : AQR.PESAN };
}

// ============================================================================
// KARTU DIGITAL STAF/TUTOR (aplikasi): QR berisi ID TUTOR dari SIM SETARA (tab TUTOR),
// dicocokkan lewat email (Profil Akun / kontak Pengguna), nomor HP, lalu nama.
// ============================================================================
function waStafKartu(token) {
  var p = stafDariToken_(token);
  var pr = profilCari_('P|' + p.id) || {};
  var kontak = String(p.hp || '').trim();
  var email = String(pr.email || (kontak.indexOf('@') > 0 ? kontak : '')).trim().toLowerCase();
  var hp = String(pr.hp || (kontak.indexOf('@') < 0 ? kontak : '')).replace(/\D/g, '');
  var normHp = function(x) { x = String(x || '').replace(/\D/g, ''); return x.replace(/^62/, '0'); };
  var id = '', nik = '';
  try {
    var sh = simTab_('TUTOR');
    if (sh && sh.getLastRow() >= 2) {
      var v = sh.getDataRange().getValues();
      var h = v[0].map(function(x) { return String(x).trim().toUpperCase(); });
      var iId = h.indexOf('ID TUTOR'), iEm = h.indexOf('EMAIL'), iHp = h.indexOf('NO HP'), iNama = h.indexOf('NAMA TUTOR');
      var lewatHp = null, lewatNama = null;
      for (var i = 1; i < v.length; i++) {
        var r = v[i];
        if (email && iEm >= 0 && String(r[iEm]).trim().toLowerCase() === email) { id = sTeks_(r[iId]).trim(); break; }
        if (!lewatHp && hp && iHp >= 0 && normHp(r[iHp]) && normHp(r[iHp]) === normHp(hp)) lewatHp = r;
        if (!lewatNama && iNama >= 0 && normNama_(r[iNama]) === normNama_(p.nama)) lewatNama = r;
      }
      if (!id && (lewatHp || lewatNama)) id = sTeks_((lewatHp || lewatNama)[iId]).trim();
    }
  } catch (e) {}
  return { nama: p.nama, peran: p.peran, kode: id, jenis: id ? 'ID Tutor' : '' };
}

// ============================================================================
// ABSENSI TH.E-COURSE (Tahap 1, migrasi SIM SETARA)
// Lapisan Repo: sejak v1.37.0 seluruh tab eks-SIM SETARA (SESI BELAJAR, PRESENSI WB,
// PRESENSI KS, KODE DARURAT, dst.) tinggal di spreadsheet ini sendiri. Akses tab
// lewat simTab_() (SumberData.gs) agar nama yang bentrok memakai alias "SIM ...".
// ============================================================================
var ABS = {
  PROP: 'TH_ABSENSI_ATURAN', PROP_ACUAN: 'TH_ABSENSI_FOTO_ACUAN', PROP_FOLDER: 'TH_ABSENSI_FOLDER',
  TAB_KS: 'PRESENSI KS',
  HDR_KS: ['ID', 'TANGGAL', 'JENIS', 'JAM', 'PENGGUNA', 'NAMA', 'LAT', 'LNG', 'AKURASI', 'JARAK', 'FOTO', 'CEK AI', 'TGL MULAI', 'TGL SELESAI', 'TUJUAN', 'KETERANGAN', 'STATUS', 'DIPUTUS OLEH', 'DIPUTUS PADA', 'CATATAN', 'DICATAT PADA'],
  TAB_KODE: 'KODE DARURAT',
  HDR_KODE: ['ID', 'KODE', 'TUTOR', 'NAMA TUTOR', 'TANGGAL', 'BERLAKU SAMPAI', 'DIBUAT OLEH', 'DIBUAT PADA', 'DIPAKAI OLEH', 'DIPAKAI PADA', 'SESI'],
  STATUS_WB: ['Hadir', 'Izin', 'Sakit', 'Alpa'],
  KEGIATAN: 'Tatap Muka',
  BAWAAN: { lat: null, lng: null, radius: 30, akurasi: 30, kodeMenit: 240 },
  MAKS_FOTO: 900000, MAKS_ACUAN: 4
};

// v1.17: satu eksekusi cukup membuka spreadsheet sekali dan membaca tab induk sekali.
var ABS_MEMO_ = { ss: null, tab: {} };
var ABS_MEMO_TAB_ = { 'ROMBEL': 1, 'MAPEL': 1, 'ENROLL MAPEL': 1, 'TUTOR': 1, 'WARGA BELAJAR': 1, 'PENGATURAN': 1 };
function absSs_() { return ABS_MEMO_.ss || (ABS_MEMO_.ss = simSs_()); }
function absLupakan_(nama) { if (nama) delete ABS_MEMO_.tab[nama]; else ABS_MEMO_.tab = {}; }
function absTab_(nama, hdr) {
  var ss = absSs_();
  var sh = ss.getSheetByName(simNamaTab_(nama));
  if (!sh) {
    sh = ss.insertSheet(simNamaTab_(nama));
    sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function absBaca_(nama, hdr) {
  if (!hdr && ABS_MEMO_TAB_[nama] && ABS_MEMO_.tab[nama]) return ABS_MEMO_.tab[nama];
  var sh = hdr ? absTab_(nama, hdr) : absSs_().getSheetByName(simNamaTab_(nama));
  if (!sh) throw new Error('Tab "' + nama + '" tidak ditemukan di database.');
  var v = sh.getDataRange().getValues();
  var h = {};
  (v[0] || []).forEach(function(x, i) { h[String(x).trim().toUpperCase()] = i; });
  var hasil = { sh: sh, v: v, h: h };
  if (!hdr && ABS_MEMO_TAB_[nama]) ABS_MEMO_.tab[nama] = hasil;
  return hasil;
}
function absCol_(t, nama) { var i = t.h[nama]; return i === undefined ? -1 : i; }
function absNilai_(t, r, nama) { var i = absCol_(t, nama); return i < 0 ? '' : r[i]; }
function absBaris_(t, obj) {
  var n = t.v[0].length, row = [];
  for (var i = 0; i < n; i++) row.push('');
  Object.keys(obj).forEach(function(k) { var i = absCol_(t, k); if (i >= 0) row[i] = obj[k]; });
  return row;
}
function absId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 8); }
function absTz_() { return Session.getScriptTimeZone(); }
function absHariIni_() { return Utilities.formatDate(new Date(), absTz_(), 'yyyy-MM-dd'); }
function absJamKini_() { return Utilities.formatDate(new Date(), absTz_(), 'HH:mm:ss'); }
function absWaktu_() { return Utilities.formatDate(new Date(), absTz_(), 'yyyy-MM-dd HH:mm:ss'); }
function absTgl_(x) {
  if (x instanceof Date) return Utilities.formatDate(x, absTz_(), 'yyyy-MM-dd');
  var s = String(x || '').trim();
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  return s.slice(0, 10);
}
function absJam_(x) {
  if (x instanceof Date) return Utilities.formatDate(x, absTz_(), 'HH:mm');
  return String(x || '').trim().replace(/\./g, ':').slice(0, 5);
}
function absBenar_(x) { return x === true || /^(true|ya|y|1|aktif)$/i.test(String(x || '').trim()); }
function absTglSah_(s) {
  s = String(s || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Format tanggal harus yyyy-mm-dd.');
  return s;
}

// ---------- pengaturan ----------
function absAturan_() {
  var a = {};
  Object.keys(ABS.BAWAAN).forEach(function(k) { a[k] = ABS.BAWAAN[k]; });
  try {
    var s = JSON.parse(PropertiesService.getScriptProperties().getProperty(ABS.PROP) || '{}');
    Object.keys(s).forEach(function(k) { a[k] = s[k]; });
  } catch (e) {}
  return a;
}
function absSim_() { return absSimCache_(); }
// Baca langsung tab PENGATURAN (tanpa cache); dipanggil absSimCache_ di Performa.gs.
function absSimBaca_() {
  var sh = simTab_('PENGATURAN');
  var out = { tahun: '', semester: '', jamBuka: '', jamTutup: '', aktif: true, kodeBuka: '', honor: 0, lembaga: '' };
  if (!sh || sh.getLastRow() < 2) return out;
  var d = sh.getRange(1, 1, 2, sh.getLastColumn()).getDisplayValues();
  var h = {};
  d[0].forEach(function(x, i) { h[String(x).trim().toUpperCase()] = i; });
  var g = function(n) { return h[n] === undefined ? '' : String(d[1][h[n]] || '').trim(); };
  out.tahun = g('TAHUN PELAJARAN'); out.semester = g('SEMESTER');
  out.jamBuka = g('JAM BUKA GLOBAL').replace(/\./g, ':').slice(0, 5);
  out.jamTutup = g('JAM TUTUP GLOBAL').replace(/\./g, ':').slice(0, 5);
  out.aktif = g('ABSENSI AKTIF') === '' ? true : absBenar_(g('ABSENSI AKTIF'));
  out.kodeBuka = g('KODE BUKA');
  out.honor = Number(g('HONOR PER HADIR').replace(/[^\d]/g, '')) || 0;
  out.lembaga = g('NAMA LEMBAGA');
  return out;
}
// Absensi hanya di jam buka-tutup; di luar jam itu wajib KODE BUKA (bila diisi di Pengaturan).
function absJendela_(sim, kodeBuka) {
  if (!sim.aktif) throw new Error('Absensi sedang dinonaktifkan oleh admin.');
  var kini = Utilities.formatDate(new Date(), absTz_(), 'HH:mm');
  var dalam = (!sim.jamBuka || kini >= sim.jamBuka) && (!sim.jamTutup || kini <= sim.jamTutup);
  if (dalam) return;
  if (sim.kodeBuka && String(kodeBuka || '').trim() === sim.kodeBuka) return;
  throw new Error('Absensi hanya dapat dilakukan pukul ' + (sim.jamBuka || '00:00') + '–' + (sim.jamTutup || '23:59') + (sim.kodeBuka ? '. Di luar jam itu masukkan Kode Buka dari admin.' : '.'));
}

// ---------- peran ----------
function absPeran_(p) {
  var r = String(p && p.peran || '');
  return { admin: r === 'Admin', ks: r === 'Kepala Sekolah', sa: r === 'Superadmin', fo: r === 'Front Office', tutor: r === 'Tutor', koord: r === 'Koordinator Kurikulum', bend: r === 'Bendahara' };
}
function absTutorSaya_(p) {
  var ckT = 'abs_tt_' + p.id, cT = CacheService.getScriptCache();
  try { var lamaT = cT.get(ckT); if (lamaT) return JSON.parse(lamaT); } catch (e0) {}
  var hasilT = absTutorSayaInti_(p);
  try { cT.put(ckT, JSON.stringify(hasilT), 600); } catch (e1) {}
  return hasilT;
}
function absTutorSayaInti_(p) {
  var pr = profilCari_('P|' + p.id) || {};
  var kontak = String(p.hp || '').trim();
  var email = String(pr.email || (kontak.indexOf('@') > 0 ? kontak : '')).trim().toLowerCase();
  var hp = String(pr.hp || (kontak.indexOf('@') < 0 ? kontak : '')).replace(/\D/g, '').replace(/^62/, '0');
  var t = absBaca_('TUTOR');
  var lewatHp = null, lewatNama = null;
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    var id = sTeks_(absNilai_(t, r, 'ID TUTOR')).trim();
    if (!id) continue;
    if (email && String(absNilai_(t, r, 'EMAIL')).trim().toLowerCase() === email) return { id: id, nama: sTeks_(absNilai_(t, r, 'NAMA TUTOR')).trim() };
    var h = String(absNilai_(t, r, 'NO HP')).replace(/\D/g, '').replace(/^62/, '0');
    if (!lewatHp && hp && h && h === hp) lewatHp = r;
    if (!lewatNama && normNama_(absNilai_(t, r, 'NAMA TUTOR')) === normNama_(p.nama)) lewatNama = r;
  }
  var x = lewatHp || lewatNama;
  return x ? { id: sTeks_(absNilai_(t, x, 'ID TUTOR')).trim(), nama: sTeks_(absNilai_(t, x, 'NAMA TUTOR')).trim() } : null;
}
function absPetaTutor_() {
  var t = absBaca_('TUTOR'), out = {};
  for (var i = 1; i < t.v.length; i++) {
    var id = sTeks_(absNilai_(t, t.v[i], 'ID TUTOR')).trim();
    if (id) out[id] = { id: id, nama: sTeks_(absNilai_(t, t.v[i], 'NAMA TUTOR')).trim(), nisn: '', aktif: absBenar_(absNilai_(t, t.v[i], 'AKTIF')) };
  }
  return out;
}
// Semua kelas (rombel x mapel) aktif dari ENROLL MAPEL. Tutor: hanya miliknya.
function absKelasSim_(idTutorSaja) {
  var rb = absBaca_('ROMBEL'), mp = absBaca_('MAPEL'), en = absBaca_('ENROLL MAPEL');
  var rombel = {}, mapel = {}, tutor = absPetaTutor_();
  for (var i = 1; i < rb.v.length; i++) {
    var id = sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim();
    if (id && absBenar_(absNilai_(rb, rb.v[i], 'AKTIF'))) rombel[id] = { nama: sTeks_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL')).trim(), program: sTeks_(absNilai_(rb, rb.v[i], 'PROGRAM')).trim() };
  }
  for (var j = 1; j < mp.v.length; j++) {
    var k = sTeks_(absNilai_(mp, mp.v[j], 'KODE MAPEL')).trim();
    if (k) mapel[k] = sTeks_(absNilai_(mp, mp.v[j], 'NAMA MAPEL')).trim();
  }
  var out = [], ada = {};
  for (var n = 1; n < en.v.length; n++) {
    var r = en.v[n];
    var idR = sTeks_(absNilai_(en, r, 'ROMBEL')).trim(), km = sTeks_(absNilai_(en, r, 'MAPEL')).trim(), tt = sTeks_(absNilai_(en, r, 'TUTOR')).trim();
    if (!rombel[idR] || !km) continue;
    if (!absBenar_(absNilai_(en, r, 'AKTIF'))) continue;
    var st = sTeks_(absNilai_(en, r, 'STATUS')).trim();
    if (st && st !== 'Disetujui') continue;
    if (idTutorSaja && tt !== idTutorSaja) continue;
    var kunci = idR + '|' + km;
    if (ada[kunci]) continue;
    ada[kunci] = true;
    out.push({ idRombel: idR, namaRombel: rombel[idR].nama, program: rombel[idR].program, kodeMapel: km, namaMapel: mapel[km] || km, idTutor: tt, namaTutor: tt && tutor[tt] ? tutor[tt].nama : '' });
  }
  out.sort(function(a, b) { return (a.namaRombel + '|' + a.namaMapel).localeCompare(b.namaRombel + '|' + b.namaMapel); });
  return out;
}
function absWbRombel_(idRombel) {
  var t = absBaca_('WARGA BELAJAR'), out = [];
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (sTeks_(absNilai_(t, r, 'ROMBEL')).trim() !== String(idRombel)) continue;
    var st = sTeks_(absNilai_(t, r, 'STATUS')).trim();
    if (st && st !== 'Aktif') continue;
    out.push({ id: sTeks_(absNilai_(t, r, 'ID WB')).trim(), nisn: sTeks_(absNilai_(t, r, 'NISN')).trim(), nama: sTeks_(absNilai_(t, r, 'NAMA WB')).trim() });
  }
  out.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  return out;
}
// Cari warga belajar dari isi QR (NISN atau ID WB). Bila ada beberapa baris cocok (data ganda / pindah rombel),
// utamakan yang ada di rombel [idRombel] lalu yang berstatus Aktif (perbaikan v1.16). NISN dibandingkan tanpa nol di depan.
function absCariWb_(kode, idRombel) {
  kode = String(kode || '').trim();
  if (!kode) return null;
  var kl = kode.toLowerCase(), angka = /^\d+$/.test(kode) ? kode.replace(/^0+/, '') : '';
  var t = absBaca_('WARGA BELAJAR'), cocok = [];
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    var id = sTeks_(absNilai_(t, r, 'ID WB')).trim(), nisn = sTeks_(absNilai_(t, r, 'NISN')).trim();
    var sama = (id && id.toLowerCase() === kl) || (nisn && (nisn === kode || (angka && /^\d+$/.test(nisn) && nisn.replace(/^0+/, '') === angka)));
    if (!sama) continue;
    cocok.push({ id: id, nisn: nisn, nama: sTeks_(absNilai_(t, r, 'NAMA WB')).trim(), rombel: sTeks_(absNilai_(t, r, 'ROMBEL')).trim(), status: sTeks_(absNilai_(t, r, 'STATUS')).trim() });
  }
  if (!cocok.length) return null;
  var skor = function(x) { return (idRombel && x.rombel === String(idRombel) ? 2 : 0) + (!x.status || x.status === 'Aktif' ? 1 : 0); };
  cocok.sort(function(a, b) { return skor(b) - skor(a); });
  return cocok[0];
}
function absNamaRombel_(idRombel) {
  var rb = absBaca_('ROMBEL');
  for (var i = 1; i < rb.v.length; i++) {
    if (sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim() === String(idRombel)) return sTeks_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL')).trim();
  }
  return '';
}
// ---------- Kartu QR massal untuk ID Card (khusus admin) ----------
// Isi QR = NISN (bila ada) atau ID WB: sama dengan kartu siswa digital dan dikenali pemindai absensi/ujian/keuangan.
// idRombel: '' = hanya daftar rombel, '*' = semua rombel aktif, selain itu satu rombel.
function waAdminKartuQr(token, idRombel) {
  // v1.40.2: Front Office juga boleh melihat & mengunduh QR siswa (untuk mencetak kartu siswa)
  var p = stafDariToken_(token);
  if (p.peran !== 'Admin' && p.peran !== 'Front Office') throw new Error('Kartu QR siswa hanya untuk Admin dan Front Office.');
  idRombel = String(idRombel || '').trim();
  var rb = absBaca_('ROMBEL'), rombel = [], namaRb = {};
  for (var i = 1; i < rb.v.length; i++) {
    var id = sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim();
    if (!id || !absBenar_(absNilai_(rb, rb.v[i], 'AKTIF'))) continue;
    var nm = sTeks_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL')).trim();
    namaRb[id] = nm;
    rombel.push({ id: id, nama: nm, program: sTeks_(absNilai_(rb, rb.v[i], 'PROGRAM')).trim() });
  }
  var urutNama = function(a, b) { return String(a).localeCompare(String(b), 'id', { numeric: true }); };
  rombel.sort(function(a, b) { return urutNama(a.program, b.program) || urutNama(a.nama, b.nama); });
  var siswa = [], tanpaKode = [];
  if (idRombel) {
    var t = absBaca_('WARGA BELAJAR');
    for (var j = 1; j < t.v.length; j++) {
      var r = t.v[j];
      var rId = sTeks_(absNilai_(t, r, 'ROMBEL')).trim();
      if (idRombel === '*' ? !namaRb[rId] : rId !== idRombel) continue;
      var st = sTeks_(absNilai_(t, r, 'STATUS')).trim();
      if (st && st !== 'Aktif') continue;
      var nama = sTeks_(absNilai_(t, r, 'NAMA WB')).trim();
      var nisn = sTeks_(absNilai_(t, r, 'NISN')).trim(), idWb = sTeks_(absNilai_(t, r, 'ID WB')).trim();
      if (!nama) continue;
      if (!nisn && !idWb) { tanpaKode.push(nama); continue; }
      siswa.push({ nama: nama, kode: nisn || idWb, jenis: nisn ? 'NISN' : 'ID WB', idRombel: rId, namaRombel: namaRb[rId] || rId });
    }
    siswa.sort(function(a, b) { return urutNama(a.namaRombel, b.namaRombel) || urutNama(a.nama, b.nama); });
    try { catat_(p.peran, idRombel, p.nama, 'Kartu QR siswa', siswa.length + ' kartu (' + (idRombel === '*' ? 'semua rombel' : (namaRb[idRombel] || idRombel)) + ')', 'OK'); } catch (e) {}
  }
  return { rombel: rombel, siswa: siswa, tanpaKode: tanpaKode };
}
function absKelasCek_(daftar, idRombel, kodeMapel) {
  for (var i = 0; i < daftar.length; i++) if (daftar[i].idRombel === String(idRombel) && daftar[i].kodeMapel === String(kodeMapel)) return daftar[i];
  return null;
}

// ---------- sesi tatap muka (satu baris SESI BELAJAR per tanggal x rombel x mapel) ----------
// v1.62.0: [unit] = kunci unit pemetaan (kosong = sesi bersama seluruh rombel). Satu sesi per tanggal x rombel x mapel x unit.
function absSesiCari_(t, tanggal, idRombel, kodeMapel, unit) {
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (absTgl_(absNilai_(t, r, 'TANGGAL')) !== tanggal) continue;
    if (sTeks_(absNilai_(t, r, 'ROMBEL')).trim() !== idRombel || sTeks_(absNilai_(t, r, 'MAPEL')).trim() !== kodeMapel) continue;
    if (sTeks_(absNilai_(t, r, 'UNIT')).trim() !== String(unit || '')) continue;
    if (sTeks_(absNilai_(t, r, 'KEGIATAN')).trim() !== ABS.KEGIATAN) continue;
    return { baris: i + 1, r: r, id: sTeks_(absNilai_(t, r, 'ID SESI')).trim() };
  }
  return null;
}
function absSesiPastikan_(tanggal, kelas, pencatat, unit) {
  if (unit) ubPastikanKolom_('SESI BELAJAR', 'UNIT');
  var t = absBaca_('SESI BELAJAR');
  var s = absSesiCari_(t, tanggal, kelas.idRombel, kelas.kodeMapel, unit);
  if (s) return { t: t, s: s };
  var sim = absSim_();
  var id = absId_();
  var row = absBaris_(t, {
    'ID SESI': id, 'TANGGAL': tanggal, 'ROMBEL': kelas.idRombel, 'MAPEL': kelas.kodeMapel, 'TUTOR': kelas.idTutor || '',
    'KEGIATAN': ABS.KEGIATAN, 'TAHUN PELAJARAN': sim.tahun, 'SEMESTER': sim.semester,
    'DICATAT OLEH': pencatat, 'DICATAT PADA': absWaktu_(), 'UNIT': unit || ''
  });
  t.sh.appendRow(row);
  t.v.push(row);
  return { t: t, s: { baris: t.v.length, r: row, id: id } };
}

// ============================ API ============================
function waStafAbsenKonteks(token) {
  var p = stafDariToken_(token), q = absPeran_(p);
  var sim = absSim_();
  var kelas = [], tutorSaya = null;
  if (q.tutor) {
    tutorSaya = absTutorSaya_(p);
    kelas = tutorSaya ? absKelas_(tutorSaya.id) : [];
  } else if (q.admin || q.ks || q.sa || q.fo || q.koord) {
    kelas = absKelas_('');
  }
  return {
    peran: p.peran, nama: p.nama,
    bolehWb: q.tutor || q.ks || q.admin || q.fo,
    bolehTutor: q.ks || q.admin || q.fo,
    perluKodeDarurat: q.fo,
    bolehAbsenDiri: q.ks,
    bolehPutus: q.sa,
    tutorSaya: tutorSaya,
    tutorTerhubung: !q.tutor || !!tutorSaya,
    kelas: kelas,
    hariIni: absHariIni_(),
    jam: { buka: sim.jamBuka, tutup: sim.jamTutup, aktif: sim.aktif, adaKodeBuka: !!sim.kodeBuka },
    statusWb: ABS.STATUS_WB
  };
}

function absWajibWb_(p, idRombel, kodeMapel) {
  var q = absPeran_(p);
  // v1.66.1: Front Office lewat izin "Absensi Warga Belajar (Front Office)" (diperiksa izPeriksa_)
  if (!(q.tutor || q.ks || q.admin || q.fo)) throw new Error('Peran Anda tidak dapat mengabsen warga belajar.');
  var kelas;
  if (q.tutor) {
    var t = absTutorSaya_(p);
    if (!t) throw new Error('Akun Anda belum terhubung dengan data tutor di Data Induk. Hubungi admin.');
    kelas = absKelasCek_(absKelas_(t.id), idRombel, kodeMapel);
    if (!kelas) throw new Error('Anda tidak mengampu mapel ini di rombel tersebut.');
  } else {
    kelas = absKelasCek_(absKelas_(''), idRombel, kodeMapel);
    if (!kelas) throw new Error('Rombel/mapel tidak ditemukan atau tidak aktif.');
  }
  return kelas;
}

function waStafAbsenWbDaftar(token, q) {
  var p = stafDariToken_(token);
  q = q || {};
  var tanggal = absTglSah_(q.tanggal || absHariIni_());
  var kelas = absWajibWb_(p, q.idRombel, q.kodeMapel);
  var siswa = absWbRombel_(kelas.idRombel);
  var us = ubUnitSesi_(p, kelas, tanggal, q.unit);
  var ts = absBaca_('SESI BELAJAR');
  var s = absSesiCari_(ts, tanggal, kelas.idRombel, kelas.kodeMapel, us.unit);
  var catat = {};
  if (s) {
    var tp = absBaca_('PRESENSI WB');
    for (var i = 1; i < tp.v.length; i++) {
      var r = tp.v[i];
      if (sTeks_(absNilai_(tp, r, 'JADWAL')).trim() !== s.id) continue;
      catat[sTeks_(absNilai_(tp, r, 'WARGA BELAJAR')).trim()] = { status: sTeks_(absNilai_(tp, r, 'STATUS')).trim(), jam: absJam_(absNilai_(tp, r, 'JAM')), oleh: sTeks_(absNilai_(tp, r, 'DICATAT OLEH')).trim(), ket: sTeks_(absNilai_(tp, r, 'KETERANGAN')).trim() };
    }
  }
  siswa = ubSaringWb_(siswa, us.unit, catat);
  return {
    kelas: kelas, tanggal: tanggal, unit: us.unit, namaUnit: us.nama, pilihanUnit: us.pilihan,
    sesi: s ? { id: s.id, tutorHadir: sTeks_(absNilai_(ts, s.r, 'STATUS')).trim() === 'Hadir', jamTutor: absJam_(absNilai_(ts, s.r, 'JAM HADIR')) } : null,
    siswa: siswa.map(function(x) { var c = catat[x.id] || {}; return { id: x.id, nisn: x.nisn, nama: x.nama, status: c.status || '', jam: c.jam || '', oleh: c.oleh || '', ket: c.ket || '', unit: x.namaUnit || '', layanan: x.layanan || '' }; })
  };
}

// d: {tanggal, idRombel, kodeMapel, idWb | kode(QR), status, keterangan, kodeBuka}
function waStafAbsenWbCatat(token, d) {
  var p = stafDariToken_(token);
  d = d || {};
  var tanggal = absTglSah_(d.tanggal || absHariIni_());
  if (tanggal > absHariIni_()) throw new Error('Tidak dapat mengabsen untuk tanggal yang akan datang.');
  var kelas = absWajibWb_(p, d.idRombel, d.kodeMapel);
  var sim = absSim_();
  if (tanggal === absHariIni_()) absJendela_(sim, d.kodeBuka);
  else if (!absPeran_(p).admin && !absPeran_(p).ks) throw new Error('Absensi tanggal lampau hanya dapat dicatat oleh Kepala Sekolah atau admin.');
  var status = String(d.status || 'Hadir');
  if (ABS.STATUS_WB.indexOf(status) < 0) throw new Error('Status tidak dikenal.');
  var wb = null;
  if (d.kode) {
    wb = absCariWb_(d.kode, kelas.idRombel);
    if (!wb) throw new Error('QR tidak dikenali sebagai kartu warga belajar.');
  } else {
    wb = absWbRombel_(kelas.idRombel).filter(function(x) { return x.id === String(d.idWb); })[0] || null;
    if (!wb) throw new Error('Warga belajar tidak ditemukan di rombel ini.');
    wb.rombel = kelas.idRombel;
  }
  if (wb.status && wb.status !== 'Aktif') throw new Error(wb.nama + ' berstatus ' + wb.status + ' di Data Induk, tidak dapat diabsen.');
  aqrWajibAktif_(wb);   // v1.67.1: semua jalur (pindai QR maupun pilih nama manual) memerlukan aktivasi QR
  var usC = ubUnitSesi_(p, kelas, tanggal, d.unit);
  var lainUnit = ubLuarUnit_(wb.id, usC.unit);
  if (lainUnit) throw new Error(wb.nama + ' terdaftar di ' + lainUnit + ', bukan di unit sesi ini (' + usC.nama + ').');
  if (wb.rombel !== kelas.idRombel) {
    var rbAsli = wb.rombel ? (absNamaRombel_(wb.rombel) || wb.rombel) : '(belum diisi)';
    throw new Error(wb.nama + ' tercatat di rombel ' + rbAsli + ' menurut Data Induk, bukan ' + kelas.namaRombel + '. Pilih rombel ' + rbAsli + ' di atas, atau perbaiki kolom ROMBEL siswa ini di Data Induk bila datanya keliru.');
  }
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var ps = absSesiPastikan_(tanggal, kelas, p.nama, usC.unit);
    var tp = absBaca_('PRESENSI WB');
    for (var i = 1; i < tp.v.length; i++) {
      var r = tp.v[i];
      if (sTeks_(absNilai_(tp, r, 'JADWAL')).trim() === ps.s.id && sTeks_(absNilai_(tp, r, 'WARGA BELAJAR')).trim() === wb.id) {
        var lama = sTeks_(absNilai_(tp, r, 'STATUS')).trim();
        if (d.kode && lama === status) return { sukses: true, sudah: true, nama: wb.nama, status: lama, pesan: wb.nama + ' sudah tercatat ' + lama + '.' };
        var cS = absCol_(tp, 'STATUS'), cK = absCol_(tp, 'KETERANGAN'), cO = absCol_(tp, 'DICATAT OLEH');
        if (cS >= 0) tp.sh.getRange(i + 1, cS + 1).setValue(status);
        if (cK >= 0) tp.sh.getRange(i + 1, cK + 1).setValue(String(d.keterangan || '').slice(0, 200));
        if (cO >= 0) tp.sh.getRange(i + 1, cO + 1).setValue(p.nama);
        catat_(p.peran, kelas.idRombel, p.nama, 'Ubah absen WB', wb.nama + ' ' + lama + ' → ' + status + ' (' + tanggal + ' ' + kelas.kodeMapel + ')', 'OK');
        return { sukses: true, diubah: true, nama: wb.nama, status: status };
      }
    }
    tp.sh.appendRow(absBaris_(tp, {
      'ID PRESENSI': absId_(), 'JADWAL': ps.s.id, 'WARGA BELAJAR': wb.id, 'STATUS': status,
      'KETERANGAN': String(d.keterangan || '').slice(0, 200), 'JAM': absJamKini_(), 'DICATAT OLEH': p.nama
    }));
    return { sukses: true, nama: wb.nama, status: status };
  } finally { kunci.releaseLock(); }
}

// ---------- absen tutor (KS memindai QR tutor; FO hanya dengan kode darurat dari KS) ----------
// Sejak Tahap 3: hanya kelas yang TERJADWAL hari itu (PEMETAAN). Di luar jadwal wajib alasan.
function waStafAbsenTutorCari(token, kode) {
  var p = stafDariToken_(token), q = absPeran_(p);
  // v1.38.7: tutor hanya bisa diabsen Kepala Sekolah, Admin, dan Front Office (FO dengan kode darurat). Tutor tidak bisa mengabsen diri sendiri.
  if (!(q.ks || q.admin || q.fo)) throw new Error('Absen tutor hanya dapat dilakukan Kepala Sekolah, Admin, atau Front Office (dengan kode darurat).');
  kode = String(kode || '').trim();
  var peta = absPetaTutor_();
  var t = peta[kode];
  if (!t) {
    Object.keys(peta).forEach(function(k) { if (!t && normNama_(peta[k].nama) === normNama_(kode)) t = peta[k]; });
  }
  if (!t) throw new Error('QR tidak dikenali sebagai kartu tutor.');
  var kelas = absKelas_(t.id);
  var hari = absHariIni_();
  var jadwal = jadTutorHari_(t.id, hari);
  var ts = absBaca_('SESI BELAJAR');
  kelas.forEach(function(k) {
    var j = jadwal.filter(function(x) { return x.idRombel === k.idRombel && x.kodeMapel === k.kodeMapel; })[0];
    k.unit = j ? j.unit : '';
    k.namaUnit = k.unit ? ubNamaKunci_(k.unit) : '';
    var s = absSesiCari_(ts, hari, k.idRombel, k.kodeMapel, k.unit);
    k.hadir = !!(s && sTeks_(absNilai_(ts, s.r, 'STATUS')).trim() === 'Hadir' && sTeks_(absNilai_(ts, s.r, 'TUTOR')).trim() === t.id);
    k.terjadwal = !!j;
    k.jam = j ? j.mulai + '–' + j.selesai : '';
  });
  kelas.sort(function(a, b) { return (b.terjadwal ? 1 : 0) - (a.terjadwal ? 1 : 0) || String(a.jam).localeCompare(String(b.jam)); });
  return { tutor: t, kelas: kelas, tanggal: hari, hari: jadHariDari_(hari), wajibJadwal: jadAturan_().wajibJadwal };
}

// d: {idTutor, idRombel, kodeMapel, kodeDarurat, kodeBuka, alasanLuarJadwal}
function waStafAbsenTutorCatat(token, d) {
  var p = stafDariToken_(token), q = absPeran_(p);
  d = d || {};
  if (!(q.ks || q.admin || q.fo)) throw new Error('Absen tutor hanya dapat dilakukan Kepala Sekolah, Admin, atau Front Office (dengan kode darurat).');
  var peta = absPetaTutor_();
  var t = peta[String(d.idTutor || '').trim()];
  if (!t) throw new Error('Tutor tidak ditemukan.');
  var kelas = absKelasCek_(absKelas_(t.id), d.idRombel, d.kodeMapel);
  if (!kelas) throw new Error(t.nama + ' tidak mengampu mapel ini di rombel tersebut.');
  var sim = absSim_();
  absJendela_(sim, d.kodeBuka);
  var hari = absHariIni_();
  var jad = jadTutorHari_(t.id, hari).filter(function(x) { return x.idRombel === kelas.idRombel && x.kodeMapel === kelas.kodeMapel; })[0] || null;
  var alasan = String(d.alasanLuarJadwal || '').trim();
  if (!jad && jadAturan_().wajibJadwal && alasan.length < 5) {
    throw new Error('LUAR_JADWAL: ' + kelas.namaMapel + ' ' + kelas.namaRombel + ' tidak terjadwal untuk ' + t.nama + ' hari ini. Isi alasan absen di luar jadwal.');
  }
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var kd = null;
    if (q.fo) {
      kd = absKodeCek_(d.kodeDarurat, t.id, hari);
    }
    var ps = absSesiPastikan_(hari, kelas, p.nama, jad ? jad.unit : '');
    var ts = ps.t, b = ps.s.baris;
    var cur = ts.sh.getRange(b, 1, 1, ts.v[0].length).getValues()[0];
    if (sTeks_(absNilai_(ts, cur, 'STATUS')).trim() === 'Hadir' && sTeks_(absNilai_(ts, cur, 'TUTOR')).trim() === t.id) {
      return { sukses: true, sudah: true, nama: t.nama, pesan: t.nama + ' sudah tercatat hadir untuk ' + kelas.namaMapel + ' ' + kelas.namaRombel + ' hari ini.' };
    }
    var set = function(nama, nilai) { var c = absCol_(ts, nama); if (c >= 0) ts.sh.getRange(b, c + 1).setValue(nilai); };
    set('TUTOR', t.id);
    set('STATUS', 'Hadir');
    set('JAM HADIR', absJamKini_());
    if (jad) set('JADWAL', 'PM:' + jad.id);
    var ket = q.fo ? ('DARURAT: diabsen Front Office ' + p.nama + ' dengan kode KS') : ('Diabsen KS ' + p.nama);
    if (!jad) ket += ' | LUAR JADWAL: ' + alasan.slice(0, 200);
    set('KETERANGAN', ket);
    if (kd) absKodeTandai_(kd, p.nama, ps.s.id);
    catat_(p.peran, kelas.idRombel, p.nama, q.fo ? 'Absen tutor DARURAT' : 'Absen tutor', t.nama + ' · ' + kelas.namaMapel + ' ' + kelas.namaRombel + (jad ? '' : ' (luar jadwal)'), 'OK');
    return { sukses: true, nama: t.nama, darurat: !!kd, luarJadwal: !jad };
  } finally { kunci.releaseLock(); }
}

// ---------- kode darurat (dibuat KS untuk satu tutor, sekali pakai, berlaku terbatas) ----------
function absKodeCek_(kode, idTutor, hari) {
  kode = String(kode || '').trim().toUpperCase();
  if (!kode) throw new Error('Absen darurat oleh Front Office wajib memakai kode approval dari Kepala Sekolah.');
  var t = absBaca_(ABS.TAB_KODE, ABS.HDR_KODE);
  var now = new Date().getTime();
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (String(absNilai_(t, r, 'KODE')).trim().toUpperCase() !== kode) continue;
    if (sTeks_(absNilai_(t, r, 'TUTOR')).trim() !== idTutor) throw new Error('Kode ini bukan untuk tutor tersebut.');
    if (sTeks_(absNilai_(t, r, 'DIPAKAI PADA')).trim()) throw new Error('Kode ini sudah dipakai.');
    var batas = Number(absNilai_(t, r, 'BERLAKU SAMPAI')) || 0;
    if (batas && now > batas) throw new Error('Kode ini sudah kedaluwarsa. Minta kode baru ke Kepala Sekolah.');
    return { t: t, baris: i + 1 };
  }
  throw new Error('Kode approval salah.');
}
function absKodeTandai_(kd, oleh, idSesi) {
  var t = kd.t;
  var set = function(nama, nilai) { var c = absCol_(t, nama); if (c >= 0) t.sh.getRange(kd.baris, c + 1).setValue(nilai); };
  set('DIPAKAI OLEH', oleh); set('DIPAKAI PADA', absWaktu_()); set('SESI', idSesi);
}
function waStafKodeDaruratBuat(token, idTutor) {
  var p = stafDariToken_(token);
  if (!absPeran_(p).ks) throw new Error('Kode darurat hanya dapat dibuat oleh Kepala Sekolah.');
  var t = absPetaTutor_()[String(idTutor || '').trim()];
  if (!t) throw new Error('Tutor tidak ditemukan.');
  var aturan = absAturan_();
  var huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', kode = '';
  for (var i = 0; i < 6; i++) kode += huruf.charAt(Math.floor(Math.random() * huruf.length));
  var batas = new Date().getTime() + (Number(aturan.kodeMenit) || 240) * 60000;
  var tk = absBaca_(ABS.TAB_KODE, ABS.HDR_KODE);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  try {
    // kode lama yang belum dipakai untuk tutor yang sama dibatalkan (satu tutor = satu kode aktif)
    for (var j = 1; j < tk.v.length; j++) {
      var r = tk.v[j];
      if (sTeks_(absNilai_(tk, r, 'TUTOR')).trim() === t.id && !sTeks_(absNilai_(tk, r, 'DIPAKAI PADA')).trim()) {
        var cB = absCol_(tk, 'BERLAKU SAMPAI');
        if (cB >= 0) tk.sh.getRange(j + 1, cB + 1).setValue(1);
      }
    }
    tk.sh.appendRow(absBaris_(tk, { 'ID': absId_(), 'KODE': kode, 'TUTOR': t.id, 'NAMA TUTOR': t.nama, 'TANGGAL': absHariIni_(), 'BERLAKU SAMPAI': batas, 'DIBUAT OLEH': p.nama, 'DIBUAT PADA': absWaktu_() }));
  } finally { kunci.releaseLock(); }
  catat_(p.peran, '', p.nama, 'Buat kode darurat', t.nama, 'OK');
  return { kode: kode, tutor: t, berlakuSampai: Utilities.formatDate(new Date(batas), absTz_(), 'HH:mm') };
}
function waStafKodeDaruratDaftar(token) {
  var p = stafDariToken_(token);
  if (!absPeran_(p).ks && !absPeran_(p).admin) throw new Error('Khusus Kepala Sekolah.');
  var t = absBaca_(ABS.TAB_KODE, ABS.HDR_KODE), out = [], now = new Date().getTime();
  for (var i = t.v.length - 1; i >= 1 && out.length < 40; i--) {
    var r = t.v[i];
    var batas = Number(absNilai_(t, r, 'BERLAKU SAMPAI')) || 0;
    var dipakai = sTeks_(absNilai_(t, r, 'DIPAKAI PADA')).trim();
    out.push({
      kode: sTeks_(absNilai_(t, r, 'KODE')), tutor: sTeks_(absNilai_(t, r, 'NAMA TUTOR')), tanggal: absTgl_(absNilai_(t, r, 'TANGGAL')),
      status: dipakai ? ('Dipakai ' + sTeks_(absNilai_(t, r, 'DIPAKAI OLEH')) + ' ' + dipakai.slice(11, 16)) : (batas === 1 ? 'Dibatalkan' : (now > batas ? 'Kedaluwarsa' : 'Aktif s.d. ' + Utilities.formatDate(new Date(batas), absTz_(), 'HH:mm')))
    });
  }
  var pt = absPetaTutor_();
  return { kode: out, tutor: Object.keys(pt).map(function(k) { return pt[k]; }).filter(function(x) { return x.aktif; }) };
}

// ---------- absensi Kepala Sekolah (selfie + lokasi sekretariat; izin/sakit/dinas) ----------
function absJarak_(a1, o1, a2, o2) {
  var R = 6371000, r = Math.PI / 180;
  var dA = (a2 - a1) * r, dO = (o2 - o1) * r;
  var x = Math.sin(dA / 2) * Math.sin(dA / 2) + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) * Math.sin(dO / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
function absFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(ABS.PROP_FOLDER);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('TH.E-Course - Foto Absensi (rahasia)');
  props.setProperty(ABS.PROP_FOLDER, f.getId());
  return f;
}
function absSimpanFoto_(dataUrl, nama) {
  var m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Foto tidak dikenali.');
  if (m[3].length > ABS.MAKS_FOTO) throw new Error('Foto terlalu besar.');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[3]), m[1], nama + '.' + (m[2] === 'jpeg' ? 'jpg' : m[2]));
  return { id: absFolder_().createFile(blob).getId(), b64: m[3], mime: m[1] };
}
function absCekAi_(b64, mime) {
  var acuan = absAcuanDaftar_();
  if (!acuan.length) return { cocok: null, alasan: 'Belum ada foto acuan area Front Office.' };
  try {
    var parts = [{ text: 'Anda memeriksa absensi Kepala Sekolah. Foto-foto pertama adalah ACUAN area Front Office sekretariat PKBM. Foto TERAKHIR adalah selfie absensi. ' +
      'Nilai apakah latar belakang selfie memperlihatkan area Front Office yang sama dengan acuan (perhatikan dinding, meja, papan, pintu, tata letak). ' +
      'Jawab HANYA JSON: {"cocok": true/false, "adaWajah": true/false, "alasan": "maks 25 kata, bahasa Indonesia"}.' }];
    acuan.forEach(function(a) { parts.push({ inline_data: { mime_type: a.mime, data: a.b64 } }); });
    parts.push({ text: 'SELFIE ABSENSI:' });
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
    var r = aiPanggil_('POST', AI.BASE + '/v1beta/models/' + aiModel_() + ':generateContent', { contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }, { maks: 2 });
    var teks = (((r.json || {}).candidates || [])[0] || {}).content;
    teks = teks && teks.parts ? teks.parts.map(function(x) { return x.text || ''; }).join('') : '';
    var bt = String.fromCharCode(96, 96, 96);
    var j = JSON.parse(teks.split(bt + 'json').join('').split(bt).join('').trim());
    return { cocok: j.cocok === true && j.adaWajah !== false, alasan: String(j.alasan || '').slice(0, 200) };
  } catch (e) {
    return { cocok: null, alasan: 'Pemeriksaan otomatis gagal: ' + String(e && e.message || e).slice(0, 120) };
  }
}
function absAcuanId_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(ABS.PROP_ACUAN) || '[]'); } catch (e) { return []; } }
function absAcuanDaftar_() {
  var out = [];
  absAcuanId_().forEach(function(id) {
    try { var b = DriveApp.getFileById(id).getBlob(); out.push({ id: id, mime: b.getContentType() || 'image/jpeg', b64: Utilities.base64Encode(b.getBytes()) }); } catch (e) {}
  });
  return out;
}
function absKsBaris_(t, r, lengkap) {
  var o = {
    id: sTeks_(absNilai_(t, r, 'ID')), tanggal: absTgl_(absNilai_(t, r, 'TANGGAL')), jenis: sTeks_(absNilai_(t, r, 'JENIS')), jam: absJam_(absNilai_(t, r, 'JAM')),
    nama: sTeks_(absNilai_(t, r, 'NAMA')), pengguna: sTeks_(absNilai_(t, r, 'PENGGUNA')), jarak: Number(absNilai_(t, r, 'JARAK')) || null,
    akurasi: Number(absNilai_(t, r, 'AKURASI')) || null, adaFoto: !!sTeks_(absNilai_(t, r, 'FOTO')).trim(), cekAi: sTeks_(absNilai_(t, r, 'CEK AI')),
    mulai: absTgl_(absNilai_(t, r, 'TGL MULAI')), selesai: absTgl_(absNilai_(t, r, 'TGL SELESAI')), tujuan: sTeks_(absNilai_(t, r, 'TUJUAN')),
    keterangan: sTeks_(absNilai_(t, r, 'KETERANGAN')), status: sTeks_(absNilai_(t, r, 'STATUS')), diputusOleh: sTeks_(absNilai_(t, r, 'DIPUTUS OLEH')),
    catatan: sTeks_(absNilai_(t, r, 'CATATAN'))
  };
  return o;
}
function waStafKsAbsenStatus(token) {
  var p = stafDariToken_(token);
  if (!absPeran_(p).ks) throw new Error('Khusus Kepala Sekolah.');
  var t = absBaca_(ABS.TAB_KS, ABS.HDR_KS), hari = absHariIni_(), out = [], hariIni = null;
  for (var i = t.v.length - 1; i >= 1; i--) {
    var r = t.v[i];
    if (sTeks_(absNilai_(t, r, 'PENGGUNA')).trim() !== p.id) continue;
    var o = absKsBaris_(t, r);
    if (!hariIni && o.jenis === 'Hadir' && o.tanggal === hari) hariIni = o;
    if (out.length < 60) out.push(o);
  }
  var a = absAturan_();
  return { hariIni: hariIni, riwayat: out, lokasiSiap: a.lat !== null && a.lng !== null, radius: a.radius, akurasi: a.akurasi, tanggal: hari, jam: absSim_() };
}
// d: {lat, lng, akurasi, mock, foto(dataURL)}
function waStafKsAbsenMasuk(token, d) {
  var p = stafDariToken_(token);
  if (!absPeran_(p).ks) throw new Error('Khusus Kepala Sekolah.');
  d = d || {};
  var a = absAturan_();
  if (a.lat === null || a.lng === null) throw new Error('Lokasi sekretariat belum diatur admin.');
  if (d.mock === true) throw new Error('Lokasi palsu (mock location) terdeteksi. Matikan aplikasi pemalsu lokasi.');
  var lat = Number(d.lat), lng = Number(d.lng), akr = Number(d.akurasi);
  if (!isFinite(lat) || !isFinite(lng)) throw new Error('Lokasi tidak terbaca.');
  if (!(akr > 0) || akr > Number(a.akurasi)) throw new Error('Sinyal GPS kurang akurat (±' + Math.round(akr || 0) + ' m). Tunggu sebentar di dekat jendela/area terbuka lalu ulangi. Batas ±' + a.akurasi + ' m.');
  var jarak = absJarak_(lat, lng, Number(a.lat), Number(a.lng));
  if (jarak > Number(a.radius)) throw new Error('Anda berada ' + Math.round(jarak) + ' m dari sekretariat. Absen hanya dapat dilakukan di area Front Office (radius ' + a.radius + ' m).');
  if (!d.foto) throw new Error('Selfie wajib untuk absen masuk.');
  var t = absBaca_(ABS.TAB_KS, ABS.HDR_KS), hari = absHariIni_();
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (sTeks_(absNilai_(t, r, 'PENGGUNA')).trim() === p.id && sTeks_(absNilai_(t, r, 'JENIS')) === 'Hadir' && absTgl_(absNilai_(t, r, 'TANGGAL')) === hari && sTeks_(absNilai_(t, r, 'STATUS')) !== 'Ditolak') {
      return { sukses: true, sudah: true, data: absKsBaris_(t, r), pesan: 'Anda sudah absen hari ini pukul ' + absJam_(absNilai_(t, r, 'JAM')) + '.' };
    }
  }
  var f = absSimpanFoto_(d.foto, 'KS_' + Utilities.formatDate(new Date(), absTz_(), 'yyyyMMdd_HHmmss') + '_' + p.id);
  var ai = absCekAi_(f.b64, f.mime);
  var status = ai.cocok === true ? 'Diterima' : 'Perlu dicek';
  var row = absBaris_(t, {
    'ID': absId_(), 'TANGGAL': hari, 'JENIS': 'Hadir', 'JAM': absJamKini_(), 'PENGGUNA': p.id, 'NAMA': p.nama,
    'LAT': lat, 'LNG': lng, 'AKURASI': Math.round(akr), 'JARAK': Math.round(jarak), 'FOTO': f.id,
    'CEK AI': (ai.cocok === true ? 'Cocok' : (ai.cocok === false ? 'Tidak cocok' : 'Tidak diperiksa')) + (ai.alasan ? ': ' + ai.alasan : ''),
    'STATUS': status, 'DICATAT PADA': absWaktu_()
  });
  t.sh.appendRow(row);
  catat_(p.peran, '', p.nama, 'Absen KS', status + ' · ' + Math.round(jarak) + ' m', 'OK');
  return { sukses: true, data: absKsBaris_(t, row), pesan: status === 'Diterima' ? 'Absen masuk tercatat.' : 'Absen tercatat dan menunggu pemeriksaan foto oleh Ketua Yayasan.' };
}
// d: {jenis: Izin|Sakit|Dinas, mulai, selesai, alasan, tujuan, foto?}
function waStafKsIzinAjukan(token, d) {
  var p = stafDariToken_(token);
  if (!absPeran_(p).ks) throw new Error('Khusus Kepala Sekolah.');
  d = d || {};
  var jenis = String(d.jenis || '');
  if (['Izin', 'Sakit', 'Dinas'].indexOf(jenis) < 0) throw new Error('Jenis pengajuan tidak dikenal.');
  var mulai = absTglSah_(d.mulai), selesai = absTglSah_(d.selesai || d.mulai);
  if (selesai < mulai) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  var alasan = String(d.alasan || '').trim();
  if (alasan.length < 5) throw new Error('Isi keterangan/keperluan (minimal 5 karakter).');
  if (jenis === 'Dinas' && !String(d.tujuan || '').trim()) throw new Error('Isi tujuan perjalanan dinas.');
  var fotoId = '';
  if (d.foto) fotoId = absSimpanFoto_(d.foto, jenis.toUpperCase() + '_' + Utilities.formatDate(new Date(), absTz_(), 'yyyyMMdd_HHmmss') + '_' + p.id).id;
  var t = absBaca_(ABS.TAB_KS, ABS.HDR_KS);
  var row = absBaris_(t, {
    'ID': absId_(), 'TANGGAL': absHariIni_(), 'JENIS': jenis, 'JAM': absJamKini_(), 'PENGGUNA': p.id, 'NAMA': p.nama, 'FOTO': fotoId,
    'TGL MULAI': mulai, 'TGL SELESAI': selesai, 'TUJUAN': String(d.tujuan || '').slice(0, 200), 'KETERANGAN': alasan.slice(0, 500),
    'STATUS': 'Menunggu', 'DICATAT PADA': absWaktu_()
  });
  t.sh.appendRow(row);
  catat_(p.peran, '', p.nama, 'Ajukan ' + jenis, mulai + ' s.d. ' + selesai, 'OK');
  return { sukses: true, data: absKsBaris_(t, row) };
}
// Superadmin/Admin: semua; KS: miliknya. q: {status, dari, sampai}
function waStafKsPresensiDaftar(token, q) {
  var p = stafDariToken_(token), r0 = absPeran_(p);
  if (!(r0.sa || r0.admin || r0.ks || r0.fo)) throw new Error('Peran Anda tidak dapat melihat data ini.');
  q = q || {};
  var t = absBaca_(ABS.TAB_KS, ABS.HDR_KS), out = [];
  for (var i = t.v.length - 1; i >= 1 && out.length < 300; i--) {
    var o = absKsBaris_(t, t.v[i]);
    if (r0.ks && o.pengguna !== p.id) continue;
    if (q.status && o.status !== q.status) continue;
    if (q.dari && o.tanggal < q.dari && (!o.selesai || o.selesai < q.dari)) continue;
    if (q.sampai && o.tanggal > q.sampai && (!o.mulai || o.mulai > q.sampai)) continue;
    out.push(o);
  }
  return { data: out, bolehPutus: r0.sa };
}
function waStafKsPutus(token, id, setuju, catatan) {
  var p = stafDariToken_(token);
  if (!absPeran_(p).sa) throw new Error('Persetujuan hanya oleh Superadmin (Ketua Yayasan).');
  var t = absBaca_(ABS.TAB_KS, ABS.HDR_KS);
  for (var i = 1; i < t.v.length; i++) {
    if (sTeks_(absNilai_(t, t.v[i], 'ID')) !== String(id)) continue;
    var jenis = sTeks_(absNilai_(t, t.v[i], 'JENIS'));
    var st = jenis === 'Hadir' ? (setuju ? 'Diterima' : 'Ditolak') : (setuju ? 'Disetujui' : 'Ditolak');
    var set = function(n, v) { var c = absCol_(t, n); if (c >= 0) t.sh.getRange(i + 1, c + 1).setValue(v); };
    set('STATUS', st); set('DIPUTUS OLEH', p.nama); set('DIPUTUS PADA', absWaktu_()); set('CATATAN', String(catatan || '').slice(0, 300));
    catat_(p.peran, '', p.nama, 'Putus presensi KS', jenis + ' ' + st, 'OK');
    return { sukses: true, status: st };
  }
  throw new Error('Data tidak ditemukan.');
}
function waStafKsFoto(token, id) {
  var p = stafDariToken_(token), r0 = absPeran_(p);
  var t = absBaca_(ABS.TAB_KS, ABS.HDR_KS);
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (sTeks_(absNilai_(t, r, 'ID')) !== String(id)) continue;
    if (!(r0.sa || r0.admin || sTeks_(absNilai_(t, r, 'PENGGUNA')).trim() === p.id)) throw new Error('Anda tidak berhak melihat foto ini.');
    var fid = sTeks_(absNilai_(t, r, 'FOTO')).trim();
    if (!fid) throw new Error('Tidak ada foto.');
    var b = DriveApp.getFileById(fid).getBlob();
    return { b64: Utilities.base64Encode(b.getBytes()), mime: b.getContentType() };
  }
  throw new Error('Data tidak ditemukan.');
}

// ---------- laporan kehadiran ----------
// q: {dari, sampai}. Tutor: hanya kelasnya. Lainnya (KS, FO, Superadmin, Admin, Koordinator): semua.
function waStafLaporanHadir(token, q) {
  var p = stafDariToken_(token), r0 = absPeran_(p);
  q = q || {};
  var hari = absHariIni_();
  var dari = q.dari ? absTglSah_(q.dari) : hari.slice(0, 8) + '01';
  var sampai = q.sampai ? absTglSah_(q.sampai) : hari;
  var kelas, tutorSaya = null;
  if (r0.tutor) { tutorSaya = absTutorSaya_(p); kelas = tutorSaya ? absKelas_(tutorSaya.id) : []; }
  else if (r0.ks || r0.fo || r0.sa || r0.admin || r0.koord) kelas = absKelas_('');
  else throw new Error('Peran Anda tidak dapat melihat laporan kehadiran.');
  var bolehRombel = {}, namaRombel = {}, namaMapel = {};
  kelas.forEach(function(k) { bolehRombel[k.idRombel] = true; namaRombel[k.idRombel] = k.namaRombel; namaMapel[k.kodeMapel] = k.namaMapel; });
  var tutor = absPetaTutor_();
  var ts = absBaca_('SESI BELAJAR');
  var sesi = {}, perTutor = {}, sesiRombel = {}, daftarSesi = [], sesiUnitR = {}, recWb = {};
  for (var i = 1; i < ts.v.length; i++) {
    var r = ts.v[i];
    var tg = absTgl_(absNilai_(ts, r, 'TANGGAL'));
    if (tg < dari || tg > sampai) continue;
    var idR = sTeks_(absNilai_(ts, r, 'ROMBEL')).trim();
    if (!bolehRombel[idR]) continue;
    var km = sTeks_(absNilai_(ts, r, 'MAPEL')).trim();
    if (r0.tutor && !absKelasCek_(kelas, idR, km)) continue;
    var id = sTeks_(absNilai_(ts, r, 'ID SESI')).trim();
    var keg = sTeks_(absNilai_(ts, r, 'KEGIATAN')).trim();
    var tt = sTeks_(absNilai_(ts, r, 'TUTOR')).trim();
    var hadirT = sTeks_(absNilai_(ts, r, 'STATUS')).trim() === 'Hadir';
    var ket = sTeks_(absNilai_(ts, r, 'KETERANGAN')).trim();
    sesi[id] = { idRombel: idR };
    sesiRombel[idR] = (sesiRombel[idR] || 0) + 1;
    (sesiUnitR[idR] = sesiUnitR[idR] || []).push({ id: id, unit: sTeks_(absNilai_(ts, r, 'UNIT')).trim() });   // v1.63.0
    daftarSesi.push({ id: id, tanggal: tg, rombel: namaRombel[idR] || idR, mapel: namaMapel[km] || km, kegiatan: keg, tutor: tt && tutor[tt] ? tutor[tt].nama : '', tutorHadir: hadirT, jam: absJam_(absNilai_(ts, r, 'JAM HADIR')), darurat: /^DARURAT/.test(ket) });
    if (keg === ABS.KEGIATAN && tt) {
      if (r0.tutor && tutorSaya && tt !== tutorSaya.id) continue;
      var x = perTutor[tt] || (perTutor[tt] = { id: tt, nama: tutor[tt] ? tutor[tt].nama : tt, hadir: 0, sesi: 0, darurat: 0 });
      x.sesi++;
      if (hadirT) x.hadir++;
      if (hadirT && /^DARURAT/.test(ket)) x.darurat++;
    }
  }
  var tp = absBaca_('PRESENSI WB'), perWb = {};
  for (var j = 1; j < tp.v.length; j++) {
    var w = tp.v[j];
    var s = sesi[sTeks_(absNilai_(tp, w, 'JADWAL')).trim()];
    if (!s) continue;
    var idW = sTeks_(absNilai_(tp, w, 'WARGA BELAJAR')).trim();
    recWb[idW + '|' + sTeks_(absNilai_(tp, w, 'JADWAL')).trim()] = true;
    var st = sTeks_(absNilai_(tp, w, 'STATUS')).trim() || 'Hadir';
    var y = perWb[idW] || (perWb[idW] = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 });
    y[st] = (y[st] || 0) + 1;
  }
  var rombelOut = Object.keys(bolehRombel).map(function(idR) {
    var total = sesiRombel[idR] || 0;
    var anggota = (typeof ubSaringWb_ === 'function' ? ubSaringWb_(absWbRombel_(idR), '', null) : absWbRombel_(idR)).map(function(wb) {
      var y = perWb[wb.id] || { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 };
      // v1.63.0: total per siswa = sesi yang berlaku untuk unit/layanannya
      var tW = typeof ubTmWb_ === 'function' ? ubTmWb_({ k: sesiUnitR[idR] || [] }, recWb, 'k', wb.id, y.Hadir, total).t : total;
      return { id: wb.id, nama: wb.nama, hadir: y.Hadir, izin: y.Izin, sakit: y.Sakit, alpa: y.Alpa, persen: tW ? Math.round(y.Hadir * 1000 / tW) / 10 : null,
        totalSesi: tW, unit: wb.namaUnit || '', layanan: wb.layanan || '' };
    });
    return { id: idR, nama: namaRombel[idR], totalSesi: total, wb: anggota };
  }).sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  daftarSesi.sort(function(a, b) { return b.tanggal.localeCompare(a.tanggal); });
  var ks = [];
  if (!r0.tutor) ks = waStafKsPresensiDaftarInti_(dari, sampai);
  return { dari: dari, sampai: sampai, syaratPersen: 80, tutor: Object.keys(perTutor).map(function(k) { return perTutor[k]; }).sort(function(a, b) { return a.nama.localeCompare(b.nama); }), rombel: rombelOut, sesi: daftarSesi.slice(0, 400), ks: ks };
}
function waStafKsPresensiDaftarInti_(dari, sampai) {
  var t = absBaca_(ABS.TAB_KS, ABS.HDR_KS), out = [];
  for (var i = t.v.length - 1; i >= 1; i--) {
    var o = absKsBaris_(t, t.v[i]);
    var a = o.jenis === 'Hadir' ? o.tanggal : (o.mulai || o.tanggal), b = o.jenis === 'Hadir' ? o.tanggal : (o.selesai || o.tanggal);
    if (b < dari || a > sampai) continue;
    out.push(o);
  }
  return out;
}

// ---------- pengaturan absensi (admin) ----------
function waAdminAbsenAtur(token) {
  wajibAdmin_(token);
  return { aturan: absAturan_(), sim: absSim_(), acuan: absAcuanDaftar_().map(function(a, i) { return { i: i, id: a.id, dataUrl: 'data:' + a.mime + ';base64,' + a.b64 }; }) };
}
function waAdminAbsenAturSimpan(token, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  var a = absAturan_();
  if (d.lat !== undefined && d.lat !== null) { var la = Number(d.lat), lo = Number(d.lng); if (!isFinite(la) || !isFinite(lo)) throw new Error('Koordinat tidak valid.'); a.lat = la; a.lng = lo; }
  if (d.radius !== undefined) { var rd = Number(d.radius); if (!(rd >= 5 && rd <= 500)) throw new Error('Radius 5–500 meter.'); a.radius = rd; }
  if (d.akurasi !== undefined) { var ak = Number(d.akurasi); if (!(ak >= 5 && ak <= 200)) throw new Error('Batas akurasi 5–200 meter.'); a.akurasi = ak; }
  if (d.kodeMenit !== undefined) { var km = Number(d.kodeMenit); if (!(km >= 10 && km <= 1440)) throw new Error('Masa berlaku kode 10–1440 menit.'); a.kodeMenit = km; }
  PropertiesService.getScriptProperties().setProperty(ABS.PROP, JSON.stringify(a));
  catat_(p.peran, '', p.nama, 'Atur absensi', JSON.stringify(a).slice(0, 150), 'OK');
  return { aturan: a };
}
function waAdminAbsenAcuanTambah(token, dataUrl) {
  var p = wajibAdmin_(token);
  var ids = absAcuanId_();
  if (ids.length >= ABS.MAKS_ACUAN) throw new Error('Maksimal ' + ABS.MAKS_ACUAN + ' foto acuan. Hapus salah satu dulu.');
  var f = absSimpanFoto_(dataUrl, 'ACUAN_FO_' + Utilities.formatDate(new Date(), absTz_(), 'yyyyMMdd_HHmmss'));
  ids.push(f.id);
  PropertiesService.getScriptProperties().setProperty(ABS.PROP_ACUAN, JSON.stringify(ids));
  catat_(p.peran, '', p.nama, 'Tambah foto acuan FO', '', 'OK');
  return waAdminAbsenAtur(token);
}
function waAdminAbsenAcuanHapus(token, id) {
  wajibAdmin_(token);
  var ids = absAcuanId_().filter(function(x) { return x !== String(id); });
  PropertiesService.getScriptProperties().setProperty(ABS.PROP_ACUAN, JSON.stringify(ids));
  return waAdminAbsenAtur(token);
}

// Kelas dari enrollment TH.E-Course (Belajar Mandiri) dipetakan ke ID rombel & kode mapel SIM SETARA
// lewat nama (abaikan awalan "Kelas" dan isi kurung). Digabung dengan ENROLL MAPEL SIM SETARA.
function absNormNama_(s) { return String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/^\s*kelas\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function absKelasBm_(idTutorSaja) {
  var rb = absBaca_('ROMBEL'), mp = absBaca_('MAPEL');
  var rombelNama = {}, mapelNama = {}, mapelKode = {};
  for (var i = 1; i < rb.v.length; i++) {
    var id = sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim();
    if (id && absBenar_(absNilai_(rb, rb.v[i], 'AKTIF'))) rombelNama[absNormNama_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL'))] = { id: id, nama: sTeks_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL')).trim(), program: sTeks_(absNilai_(rb, rb.v[i], 'PROGRAM')).trim() };
  }
  for (var j = 1; j < mp.v.length; j++) {
    var k = sTeks_(absNilai_(mp, mp.v[j], 'KODE MAPEL')).trim();
    if (!k) continue;
    var nm = sTeks_(absNilai_(mp, mp.v[j], 'NAMA MAPEL')).trim();
    mapelNama[absNormNama_(nm)] = { kode: k, nama: nm };
    mapelKode[k.toLowerCase()] = { kode: k, nama: nm };
  }
  var pengguna = {};
  bacaPengguna_().forEach(function(u) { if (u.peran === 'Tutor' && u.status === 'Aktif') pengguna[u.id] = u; });
  var tt = {};
  var mapelBm = {};
  mapelAktifSemua_().forEach(function(m) { mapelBm[m.idMapel] = m; });
  var out = [];
  bacaEnrollment_().forEach(function(e) {
    var u = pengguna[e.idPengguna];
    if (!u) return;
    if (tt[u.id] === undefined) tt[u.id] = absTutorSaya_(u);
    var t = tt[u.id];
    if (idTutorSaja && (!t || t.id !== idTutorSaja)) return;
    var m = mapelBm[e.idMapel];
    if (!m) return;
    var r = rombelNama[absNormNama_(m.namaRombel)];
    if (!r) return;
    var kurung = /\(([^)]+)\)/.exec(m.namaMapel || '');
    var mm = mapelNama[absNormNama_(m.namaMapel)] || (kurung ? mapelKode[String(kurung[1]).trim().toLowerCase()] : null);
    if (!mm) return;
    out.push({ idRombel: r.id, namaRombel: r.nama, program: r.program, kodeMapel: mm.kode, namaMapel: mm.nama, idTutor: t ? t.id : '', namaTutor: t ? t.nama : u.nama });
  });
  return out;
}
function absKelas_(idTutorSaja) {
  // v1.77.0: kelas HANYA dari Data Induk (ENROLL MAPEL aktif & disetujui). Tidak lagi dari enrollment / status e-learning.
  var ck = 'abs_kelas3_' + (idTutorSaja || '*'), c = CacheService.getScriptCache();
  try { var lama = c.get(ck); if (lama) return JSON.parse(lama); } catch (e0) {}
  var semua = absKelasSim_(''), a = [], ada = {};
  if (!idTutorSaja) a = semua;
  else {
    // kelas tutor = Tutor Online di tab Pengampu (unit mana pun) atau tutor bawaan di ENROLL MAPEL
    var ptS = absPetaTutor_();
    semua.forEach(function(k) {
      var on = false;
      try { on = typeof pgoSemuaTutor_ === 'function' && pgoSemuaTutor_(k.idRombel + '|' + k.kodeMapel).indexOf(idTutorSaja) >= 0; } catch (eP) {}
      if (k.idTutor !== idTutorSaja && !on) return;
      var s = JSON.parse(JSON.stringify(k));
      s.idTutor = idTutorSaja; s.namaTutor = ptS[idTutorSaja] ? ptS[idTutorSaja].nama : s.namaTutor;
      a.push(s);
    });
  }
  a.forEach(function(k) { ada[k.idRombel + '|' + k.kodeMapel] = k; });
  // v1.62.0: tutor yang dipetakan di jadwal (mis. tutor unit) mengampu kelas itu walau tidak tercatat di enrollment
  if (idTutorSaja) {
    try {
      var ptT = absPetaTutor_();
      jadBacaPm_().data.forEach(function(x) {
        if (!x.aktif || x.idTutor !== idTutorSaja) return;
        var kk = x.idRombel + '|' + x.kodeMapel;
        if (ada[kk]) return;
        var asal = absKelasCek_(semua, x.idRombel, x.kodeMapel);
        if (!asal) return;
        var salin = JSON.parse(JSON.stringify(asal));
        salin.idTutor = idTutorSaja; salin.namaTutor = ptT[idTutorSaja] ? ptT[idTutorSaja].nama : '';
        salin.tatapMuka = true;   // v1.73.0: hanya tutor tatap muka (kehadiran), bukan pengampu (nilai)
        ada[kk] = salin; a.push(salin);
      });
    } catch (e3) {}
  }
  a = a.slice().sort(function(p, q) { return (p.namaRombel + '|' + p.namaMapel).localeCompare(q.namaRombel + '|' + q.namaMapel); });
  try { c.put(ck, JSON.stringify(a), 300); } catch (e1) {}
  return a;
}


// ============================================================================
// HONOR TUTOR (Tahap 2, migrasi SIM SETARA). Repo: tab REKAP HONOR, PEMBAYARAN HONOR,
// TRANSAKSI di spreadsheet database (simSs_). Aturan honor di Script Property TH_HONOR_ATURAN
// sehingga tarif, satuan, tarif per program, dan syarat tunggakan bisa diubah tanpa kode.
// Honor = kehadiran tutor (SESI BELAJAR "Tatap Muka", STATUS Hadir) x tarif.
// Bila ada tunggakan e-learning, SELURUH honor bulan itu ditahan sampai tunggakan selesai.
// ============================================================================
var HON = {
  PROP: 'TH_HONOR_ATURAN', PROP_FOLDER: 'TH_HONOR_FOLDER',
  // mode 'bulanan' (aplikasi 1.30): honor bulanan per tutor, dipotong per pertemuan wajib yang tidak dihadiri.
  // mode 'kehadiran': cara lama (tarif x kehadiran).
  BAWAAN: { mode: 'bulanan', honorBulanan: 250000, honorTutor: {}, tanggalBayar: 5, libur: [],
    satuan: 'sesi', tarif: null, tarifProgram: {}, cekDiskusi: true, batasDiskusiHari: 7, cekUjian: true, sumberDana: 'BOP' },
  TAB_REKAP: 'REKAP HONOR', TAB_BAYAR: 'PEMBAYARAN HONOR', TAB_TRX: 'TRANSAKSI',
  KUNCI: ['Disetujui', 'Dibayar Sebagian', 'Dibayar']
};
function honAturan_() {
  var a = {};
  Object.keys(HON.BAWAAN).forEach(function(k) { a[k] = HON.BAWAAN[k]; });
  try {
    var s = JSON.parse(PropertiesService.getScriptProperties().getProperty(HON.PROP) || '{}');
    Object.keys(s).forEach(function(k) { a[k] = s[k]; });
  } catch (e) {}
  a.tarifSim = absSim_().honor || 0;
  a.tarifBerlaku = Number(a.tarif) > 0 ? Number(a.tarif) : a.tarifSim;
  return a;
}
// Honor bulanan seorang tutor: nilai khusus (bila diatur) atau honor bulanan bawaan.
function honHonorTutor_(aturan, tt) {
  var v = (aturan.honorTutor || {})[tt];
  return (v !== undefined && v !== null && v !== '' && Number(v) >= 0) ? Number(v) : (Number(aturan.honorBulanan) || 0);
}
// Tanggal bayar honor bulan "yyyy-mm": tanggal N bulan berikutnya; bila hari Minggu, dibayar hari Senin.
function honTanggalBayar_(bulan, aturan) {
  var p = String(bulan).split('-'), y = Number(p[0]), m = Number(p[1]);
  var n = Math.min(28, Math.max(1, Number((aturan || {}).tanggalBayar) || 5));
  var d = new Date(y, m, n);
  if (d.getDay() === 0) d = new Date(y, m, n + 1);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function honPeran_(p) {
  var q = absPeran_(p);
  return { lihatSemua: q.admin || q.sa || q.ks || q.bend, kelola: q.admin || q.sa, setuju: q.sa, bayar: q.admin || q.sa || q.bend, tutor: q.tutor };
}
function honBulanSah_(b) {
  b = String(b || '').trim();
  if (!/^\d{4}-\d{2}$/.test(b)) throw new Error('Format bulan harus yyyy-mm.');
  return b;
}
function honBulanIni_() { return absHariIni_().slice(0, 7); }
function honRp_(n) { return 'Rp' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

// Peta ID TUTOR SIM -> pengguna TH.E-Course (tutor aktif).
function honPetaPengguna_() {
  var out = {};
  bacaPengguna_().forEach(function(u) {
    if (u.peran !== 'Tutor' || u.status !== 'Aktif') return;
    var t = absTutorSaya_(u);
    if (t && t.id) (out[t.id] = out[t.id] || []).push(u);
  });
  return out;
}
function honProgramRombel_() {
  var rb = absBaca_('ROMBEL'), out = {};
  for (var i = 1; i < rb.v.length; i++) out[sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim()] = { nama: sTeks_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL')).trim(), program: sTeks_(absNilai_(rb, rb.v[i], 'PROGRAM')).trim() };
  return out;
}
function honNamaMapel_() {
  var mp = absBaca_('MAPEL'), out = {};
  for (var i = 1; i < mp.v.length; i++) out[sTeks_(absNilai_(mp, mp.v[i], 'KODE MAPEL')).trim()] = sTeks_(absNilai_(mp, mp.v[i], 'NAMA MAPEL')).trim();
  return out;
}

// Kehadiran tutor dalam satu bulan -> { tt: { sesi: [...], jumlah, total, bulanan? } }
function honKehadiran_(bulan, aturan) {
  var ts = absBaca_('SESI BELAJAR'), rombel = honProgramRombel_(), mapel = honNamaMapel_();
  var bulanan = aturan.mode !== 'kehadiran';
  var out = {};
  for (var i = 1; i < ts.v.length; i++) {
    var r = ts.v[i];
    var tg = absTgl_(absNilai_(ts, r, 'TANGGAL'));
    if (tg.slice(0, 7) !== bulan) continue;
    if (sTeks_(absNilai_(ts, r, 'KEGIATAN')).trim() !== ABS.KEGIATAN) continue;
    if (sTeks_(absNilai_(ts, r, 'STATUS')).trim() !== 'Hadir') continue;
    var tt = sTeks_(absNilai_(ts, r, 'TUTOR')).trim();
    if (!tt) continue;
    var idR = sTeks_(absNilai_(ts, r, 'ROMBEL')).trim(), km = sTeks_(absNilai_(ts, r, 'MAPEL')).trim();
    var prog = rombel[idR] ? rombel[idR].program : '';
    var tarif = bulanan ? 0 : (Number((aturan.tarifProgram || {})[prog]) > 0 ? Number(aturan.tarifProgram[prog]) : aturan.tarifBerlaku);
    var x = out[tt] || (out[tt] = { sesi: [], hari: {}, jumlah: 0, total: 0 });
    x.sesi.push({ id: sTeks_(absNilai_(ts, r, 'ID SESI')).trim(), tanggal: tg, rombel: rombel[idR] ? rombel[idR].nama : idR, program: prog, mapel: mapel[km] || km, jam: absJam_(absNilai_(ts, r, 'JAM HADIR')), tarif: tarif, darurat: /^DARURAT/.test(sTeks_(absNilai_(ts, r, 'KETERANGAN'))) });
    if (bulanan) x.hari[tg] = true;
    else if (aturan.satuan === 'hari') {
      if (!x.hari[tg]) { x.hari[tg] = true; x.jumlah++; x.total += tarif; }
    } else { x.jumlah++; x.total += tarif; }
  }
  if (bulanan) honBulanan_(bulan, aturan, out);
  Object.keys(out).forEach(function(k) { out[k].sesi.sort(function(a, b) { return a.tanggal.localeCompare(b.tanggal); }); delete out[k].hari; });
  // v1.73.0: tutor yang hanya bertugas tambahan (peran utama bukan Tutor, mis. Koordinator Unit) tidak mendapat honor tutor
  try {
    if (typeof tgTambahanTutor_ === 'function') {
      var tutorAkun = honPetaPengguna_(), tambahan = {};
      bacaPengguna_().forEach(function(u) { if (u.status === 'Aktif' && tgTambahanTutor_(u)) { var t = absTutorSaya_(u); if (t && t.id) tambahan[t.id] = true; } });
      Object.keys(out).forEach(function(k) { if (tambahan[k] && !(tutorAkun[k] || []).length) delete out[k]; });
    }
  } catch (eTg) {}
  return out;
}
// Mode bulanan. Pertemuan wajib = tanggal di bulan itu yang ada jadwal tutor (PEMETAAN), dikurangi hari libur.
// Potongan per pertemuan = honor bulanan / jumlah pertemuan wajib. Setiap pertemuan wajib tanpa kehadiran
// dipotong, apa pun alasannya. Bulan berjalan: hanya tanggal yang sudah lewat yang dihitung tidak hadir.
function honBulanan_(bulan, aturan, out) {
  var p = bulan.split('-'), y = Number(p[0]), m = Number(p[1]);
  var nHari = new Date(y, m, 0).getDate(), hariIni = absHariIni_();
  var libur = {};
  (aturan.libur || []).forEach(function(l) {
    var t = typeof l === 'string' ? l : (l && l.tanggal);
    if (t) libur[String(t)] = (l && l.ket) || 'Libur';
  });
  var wajib = {}, pm = jadBacaPm_().data;
  for (var d = 1; d <= nHari; d++) {
    var tg = bulan + '-' + ('0' + d).slice(-2);
    if (libur[tg]) continue;
    pm.forEach(function(x) { if (x.idTutor && jadBerlaku_(x, tg)) (wajib[x.idTutor] = wajib[x.idTutor] || {})[tg] = true; });
  }
  var semua = {};
  Object.keys(out).forEach(function(k) { semua[k] = true; });
  Object.keys(wajib).forEach(function(k) { semua[k] = true; });
  var tutor = absPetaTutor_();
  var liburBulan = Object.keys(libur).filter(function(t) { return t.slice(0, 7) === bulan; }).sort().map(function(t) { return { tanggal: t, ket: libur[t] }; });
  Object.keys(semua).forEach(function(tt) {
    if (!out[tt] && tutor[tt] && tutor[tt].aktif === false) return;
    var x = out[tt] || (out[tt] = { sesi: [], hari: {}, jumlah: 0, total: 0 });
    var w = Object.keys(wajib[tt] || {}).sort();
    var honor = honHonorTutor_(aturan, tt);
    var tidak = w.filter(function(t) { return t < hariIni && !x.hari[t]; });
    var per = w.length ? Math.round(honor / w.length / 1000) * 1000 : 0;   // v1.37: dibulatkan ke ribuan terdekat
    var potong = (w.length && tidak.length === w.length) ? honor : Math.min(honor, per * tidak.length);
    x.jumlah = Object.keys(x.hari).length;
    x.total = Math.max(0, honor - potong);
    x.bulanan = { honor: honor, wajib: w.length, tanggalWajib: w, tidakHadir: tidak, potonganPer: per, potongan: potong, libur: liburBulan, tanggalBayar: honTanggalBayar_(bulan, aturan) };
  });
}
// Tunggakan e-learning seorang tutor (gabungan semua akun TH.E-Course miliknya).
function honTunggakan_(users, aturan, cache) {
  var hasil = { ada: false, diskusi: 0, diskusiMapel: [], ujian: 0, ujianMapel: [] };
  if (!users || !users.length) return hasil;
  cache = cache || {};
  var idUser = {};
  users.forEach(function(u) { idUser[u.id] = true; });
  var mapelSaya = {};
  bacaEnrollment_().forEach(function(e) { if (idUser[e.idPengguna]) mapelSaya[e.idMapel] = true; });
  if (!cache.mapel) { cache.mapel = {}; mapelAktifSemua_().forEach(function(m) { cache.mapel[m.idMapel] = m; }); }
  var nm = function(id) { var m = cache.mapel[id]; return m ? m.namaMapel + ' · ' + m.namaRombel : id; };
  if (aturan.cekDiskusi) {
    if (!cache.jaw) cache.jaw = getSheet(CONFIG.SHEETS.JAWABAN).getDataRange().getValues();
    var v = cache.jaw, hd = (v[0] || []).map(function(x) { return String(x).trim(); });
    var k = { mapel: hd.indexOf('ID Mapel'), jenis: hd.indexOf('Jenis'), jawaban: hd.indexOf('Jawaban'), nilai: hd.indexOf('Nilai'), waktu: hd.indexOf('Waktu Kirim') };
    var batas = Date.now() - (Number(aturan.batasDiskusiHari) || 0) * 86400000, per = {};
    for (var i = 1; i < v.length; i++) {
      var idM = sTeks_(v[i][k.mapel]).trim();
      if (!mapelSaya[idM] || !cache.mapel[idM]) continue;
      if (sTeks_(v[i][k.jenis]).trim() !== 'Diskusi' || !sTeks_(v[i][k.jawaban]).trim() || sTeks_(v[i][k.nilai]).trim() !== '') continue;
      var ms = k.waktu >= 0 ? rbMs_(v[i][k.waktu]) : 0;
      if (ms && ms > batas) continue;
      hasil.diskusi++;
      per[idM] = (per[idM] || 0) + 1;
    }
    hasil.diskusiMapel = Object.keys(per).map(function(id) { return { mapel: nm(id), jumlah: per[id] }; });
  }
  if (aturan.cekUjian) {
    try {
      if (!cache.aju) cache.aju = ujBaca_('AJU');
      var perU = {};
      cache.aju.forEach(function(a) {
        var idM = String(a['ID Mapel'] || '');
        if (!mapelSaya[idM]) return;
        if (String(a['Status'] || '').trim() !== 'Menunggu Tutor') return;
        hasil.ujian++;
        perU[idM] = (perU[idM] || 0) + 1;
      });
      hasil.ujianMapel = Object.keys(perU).map(function(id) { return { mapel: nm(id), jumlah: perU[id] }; });
    } catch (e) {}
  }
  hasil.ada = hasil.diskusi > 0 || hasil.ujian > 0;
  return hasil;
}
function honTunggakanTeks_(t) {
  if (!t || !t.ada) return '';
  var a = [];
  if (t.diskusi) a.push(t.diskusi + ' jawaban diskusi belum dinilai');
  if (t.ujian) a.push(t.ujian + ' pengajuan ujian belum diproses');
  return 'DITAHAN: ' + a.join(', ');
}
function honPembayaran_() {
  var t = absBaca_(HON.TAB_BAYAR), out = {};
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    var id = sTeks_(absNilai_(t, r, 'REKAP HONOR')).trim();
    if (!id || sTeks_(absNilai_(t, r, 'DIBATALKAN')).trim()) continue;   // v1.44.0: dibatalkan Ketua Yayasan
    (out[id] = out[id] || []).push({
      id: sTeks_(absNilai_(t, r, 'ID BAYAR')), tanggal: absTgl_(absNilai_(t, r, 'TANGGAL')), jumlah: Number(String(absNilai_(t, r, 'JUMLAH')).replace(/[^\d.-]/g, '')) || 0,
      metode: sTeks_(absNilai_(t, r, 'METODE')), rekening: sTeks_(absNilai_(t, r, 'REKENING TUJUAN')), adaBukti: !!sTeks_(absNilai_(t, r, 'BUKTI')).trim(),
      catatan: sTeks_(absNilai_(t, r, 'CATATAN')), oleh: sTeks_(absNilai_(t, r, 'DIBAYAR OLEH')), sumber: sTeks_(absNilai_(t, r, 'SUMBER DANA'))
    });
  }
  return out;
}
function honRekening_(tt, lengkap) {
  var t = absBaca_('TUTOR');
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (sTeks_(absNilai_(t, r, 'ID TUTOR')).trim() !== tt) continue;
    var metode = sTeks_(absNilai_(t, r, 'METODE PEMBAYARAN')).trim();
    var nomor = metode === 'E-Wallet' ? sTeks_(absNilai_(t, r, 'NOMOR E-WALLET')).trim() : sTeks_(absNilai_(t, r, 'NOMOR REKENING')).trim();
    var bank = metode === 'E-Wallet' ? sTeks_(absNilai_(t, r, 'E-WALLET')).trim() : sTeks_(absNilai_(t, r, 'NAMA BANK')).trim();
    if (!lengkap && nomor.length > 4) nomor = new Array(nomor.length - 3).join('•') + nomor.slice(-4);
    return { metode: metode, bank: bank, nomor: nomor, atasNama: sTeks_(absNilai_(t, r, 'ATAS NAMA')).trim() };
  }
  return null;
}
function honBarisRekap_(t, r) {
  return {
    id: sTeks_(absNilai_(t, r, 'ID REKAP')), bulan: honBulanTeks_(absNilai_(t, r, 'BULAN')), tutor: sTeks_(absNilai_(t, r, 'TUTOR')).trim(),
    jumlah: Number(absNilai_(t, r, 'JUMLAH HADIR')) || 0, tarif: sTeks_(absNilai_(t, r, 'HONOR PER HADIR')), total: Number(String(absNilai_(t, r, 'TOTAL HONOR')).replace(/[^\d.-]/g, '')) || 0,
    status: sTeks_(absNilai_(t, r, 'STATUS')).trim(), catatan: sTeks_(absNilai_(t, r, 'CATATAN')), oleh: sTeks_(absNilai_(t, r, 'DIBUAT OLEH')), pada: sTeks_(absNilai_(t, r, 'DIBUAT PADA'))
  };
}
function honBulanTeks_(x) {
  if (x instanceof Date) return Utilities.formatDate(x, absTz_(), 'yyyy-MM');
  var s = String(x || '').trim();
  var m = /^(\d{4})-(\d{1,2})/.exec(s);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) : s;
}

// ============================ API ============================
function waStafHonorAturan(token) {
  var p = stafDariToken_(token), hp = honPeran_(p);
  if (!hp.lihatSemua && !hp.tutor) throw new Error('Peran Anda tidak dapat melihat aturan honor.');
  var a = honAturan_();
  var out = { aturan: a, bolehUbah: absPeran_(p).admin, contohBayar: honTanggalBayar_(honBulanIni_(), a) };
  if (hp.lihatSemua) {
    var pt = absPetaTutor_();
    out.tutor = Object.keys(pt).map(function(k) { return pt[k]; }).filter(function(x) { return x.aktif; })
      .map(function(x) { return { id: x.id, nama: x.nama }; }).sort(function(x, y) { return x.nama.localeCompare(y.nama); });
  } else delete a.honorTutor;
  return out;
}
function waAdminHonorAturanSimpan(token, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  var a = honAturan_();
  var simpan = {};
  Object.keys(HON.BAWAAN).forEach(function(k) { simpan[k] = a[k]; });
  if (d.mode !== undefined) { if (['bulanan', 'kehadiran'].indexOf(d.mode) < 0) throw new Error('Mode honor tidak dikenal.'); simpan.mode = d.mode; }
  if (d.honorBulanan !== undefined) { var hb = Number(d.honorBulanan); if (!(hb >= 0)) throw new Error('Honor bulanan tidak valid.'); simpan.honorBulanan = Math.round(hb); }
  if (d.honorTutor !== undefined) {
    var ht = {};
    Object.keys(d.honorTutor || {}).forEach(function(k) { var v = d.honorTutor[k]; if (v !== null && v !== '' && Number(v) >= 0) ht[String(k)] = Math.round(Number(v)); });
    simpan.honorTutor = ht;
  }
  if (d.tanggalBayar !== undefined) { var tb = Number(d.tanggalBayar); if (!(tb >= 1 && tb <= 28)) throw new Error('Tanggal bayar 1–28.'); simpan.tanggalBayar = tb; }
  if (d.libur !== undefined) {
    var lb = {};
    (Array.isArray(d.libur) ? d.libur : []).forEach(function(l) {
      var t = absTglSah_(typeof l === 'string' ? l : (l && l.tanggal));
      lb[t] = { tanggal: t, ket: String((l && l.ket) || 'Libur').slice(0, 40) };
    });
    simpan.libur = Object.keys(lb).sort().slice(-120).map(function(t) { return lb[t]; });
  }
  if (d.satuan !== undefined) { if (['sesi', 'hari'].indexOf(d.satuan) < 0) throw new Error('Satuan harus sesi atau hari.'); simpan.satuan = d.satuan; }
  if (d.tarif !== undefined) { var tr = d.tarif === null || d.tarif === '' ? null : Number(d.tarif); if (tr !== null && !(tr >= 0)) throw new Error('Tarif tidak valid.'); simpan.tarif = tr; }
  if (d.tarifProgram !== undefined) {
    var tp = {};
    Object.keys(d.tarifProgram || {}).forEach(function(k) { var n = Number(d.tarifProgram[k]); if (n > 0) tp[String(k)] = n; });
    simpan.tarifProgram = tp;
  }
  if (d.cekDiskusi !== undefined) simpan.cekDiskusi = d.cekDiskusi === true;
  if (d.batasDiskusiHari !== undefined) { var bh = Number(d.batasDiskusiHari); if (!(bh >= 0 && bh <= 60)) throw new Error('Batas hari 0–60.'); simpan.batasDiskusiHari = bh; }
  if (d.cekUjian !== undefined) simpan.cekUjian = d.cekUjian === true;
  if (d.sumberDana !== undefined) simpan.sumberDana = String(d.sumberDana || '').slice(0, 40);
  PropertiesService.getScriptProperties().setProperty(HON.PROP, JSON.stringify(simpan));
  catat_(p.peran, '', p.nama, 'Atur honor', JSON.stringify(simpan).slice(0, 180), 'OK');
  return { aturan: honAturan_() };
}
// Hitung / perbarui rekap satu bulan. Rekap yang sudah Disetujui/Dibayar tidak diubah.
function waStafHonorHitung(token, bulan) {
  var p = stafDariToken_(token);
  if (!honPeran_(p).kelola) throw new Error('Hanya Admin atau Ketua Yayasan yang dapat menghitung honor.');
  bulan = honBulanSah_(bulan || honBulanIni_());
  var aturan = honAturan_();
  var hadir = honKehadiran_(bulan, aturan);
  var pengguna = honPetaPengguna_();
  var cache = {};
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  var baru = 0, ubah = 0, tetap = 0;
  try {
    var t = absBaca_(HON.TAB_REKAP);
    var ada = {};
    for (var i = 1; i < t.v.length; i++) {
      if (honBulanTeks_(absNilai_(t, t.v[i], 'BULAN')) === bulan) ada[sTeks_(absNilai_(t, t.v[i], 'TUTOR')).trim()] = i + 1;
    }
    Object.keys(hadir).forEach(function(tt) {
      var x = hadir[tt];
      var tg = honTunggakan_(pengguna[tt], aturan, cache);
      var status = tg.ada ? 'Ditahan' : 'Draft';
      var tarifTeks = x.bulanan ? ('Bulanan ' + honRp_(x.bulanan.honor) + ', potong ' + honRp_(x.bulanan.potonganPer) + ' x ' + x.bulanan.tidakHadir.length) : (Object.keys(aturan.tarifProgram || {}).length ? 'per program' : String(aturan.tarifBerlaku));
      var nilai = { 'BULAN': bulan, 'TUTOR': tt, 'JUMLAH HADIR': x.jumlah, 'HONOR PER HADIR': tarifTeks, 'TOTAL HONOR': x.total, 'STATUS': status, 'CATATAN': honTunggakanTeks_(tg) || (x.bulanan ? ('Wajib ' + x.bulanan.wajib + ' pertemuan, tidak hadir ' + x.bulanan.tidakHadir.length + (x.bulanan.tidakHadir.length ? ' (' + x.bulanan.tidakHadir.join(', ') + ')' : '') + '. Jadwal bayar ' + x.bulanan.tanggalBayar) : ('Satuan per ' + aturan.satuan)), 'DIBUAT OLEH': p.nama, 'DIBUAT PADA': absWaktu_() };
      var b = ada[tt];
      if (b) {
        var st = sTeks_(absNilai_(t, t.v[b - 1], 'STATUS')).trim();
        if (HON.KUNCI.indexOf(st) >= 0) { tetap++; return; }
        var row = absBaris_(t, nilai);
        var cId = absCol_(t, 'ID REKAP');
        row[cId] = sTeks_(absNilai_(t, t.v[b - 1], 'ID REKAP')) || absId_();
        t.sh.getRange(b, 1, 1, row.length).setValues([row]);
        ubah++;
      } else {
        nilai['ID REKAP'] = absId_();
        t.sh.appendRow(absBaris_(t, nilai));
        baru++;
      }
    });
  } finally { kunci.releaseLock(); }
  catat_(p.peran, '', p.nama, 'Hitung honor', bulan + ': ' + baru + ' baru, ' + ubah + ' diperbarui, ' + tetap + ' terkunci', 'OK');
  if (baru + ubah > 0) npKirim_('honor_perlu_setuju', { judul: 'Rekap honor ' + bulan + ' perlu disetujui', isi: (baru + ubah) + ' rekap honor tutor menunggu persetujuan Ketua Yayasan.', aksi: 'honor', ref: 'hon|' + bulan + '|' + absHariIni_() });   // v1.50.0: notifikasi
  return { bulan: bulan, baru: baru, diperbarui: ubah, terkunci: tetap };
}

// Daftar rekap satu bulan (Admin/Ketua Yayasan/KS: semua; Tutor: miliknya) + rincian & pembayaran.
function waStafHonorRekap(token, bulan) {
  var p = stafDariToken_(token), hp = honPeran_(p);
  if (!hp.lihatSemua && !hp.tutor) throw new Error('Peran Anda tidak dapat melihat honor.');
  bulan = honBulanSah_(bulan || honBulanIni_());
  var aturan = honAturan_();
  var saya = null;
  if (hp.tutor) { saya = absTutorSaya_(p); if (!saya) throw new Error('Akun Anda belum terhubung dengan data tutor di Data Induk.'); }
  var tutor = absPetaTutor_();
  var hadir = honKehadiran_(bulan, aturan);
  var bayar = honPembayaran_(), batalBayar = {};
  try { batalBayar = honPembayaranBatal_(); } catch (eB) {}
  var t = absBaca_(HON.TAB_REKAP), out = [], dicatat = {};
  for (var i = 1; i < t.v.length; i++) {
    var o = honBarisRekap_(t, t.v[i]);
    if (o.bulan !== bulan) continue;
    if (saya && o.tutor !== saya.id) continue;
    dicatat[o.tutor] = true;
    o.nama = tutor[o.tutor] ? tutor[o.tutor].nama : o.tutor;
    o.pembayaran = bayar[o.id] || [];
    o.dibatalkan = batalBayar[o.id] || [];
    o.dibayar = o.pembayaran.reduce(function(s, x) { return s + x.jumlah; }, 0);
    o.sisa = Math.max(0, o.total - o.dibayar);
    o.sesi = (hadir[o.tutor] || {}).sesi || [];
    o.bulanan = (hadir[o.tutor] || {}).bulanan || null;
    o.berubah = !!hadir[o.tutor] && HON.KUNCI.indexOf(o.status) < 0 && (hadir[o.tutor].total !== o.total);
    o.rekening = honRekening_(o.tutor, hp.bayar || !!saya);
    out.push(o);
  }
  // tutor yang hadir tetapi belum dihitung (pratinjau)
  var belum = Object.keys(hadir).filter(function(tt) { return !dicatat[tt] && (!saya || tt === saya.id); }).map(function(tt) {
    return { tutor: tt, nama: tutor[tt] ? tutor[tt].nama : tt, jumlah: hadir[tt].jumlah, total: hadir[tt].total, sesi: hadir[tt].sesi, bulanan: hadir[tt].bulanan || null };
  });
  out.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  return { bulan: bulan, tanggalBayar: honTanggalBayar_(bulan, aturan), aturan: aturan, rekap: out, belumDihitung: belum, peran: { kelola: hp.kelola, setuju: hp.setuju, bayar: hp.bayar } };
}

// Detail tunggakan saat ini (dipanggil saat melihat satu rekap / sebelum menyetujui).
function waStafHonorTunggakan(token, tt) {
  var p = stafDariToken_(token), hp = honPeran_(p);
  if (hp.tutor) { var s = absTutorSaya_(p); if (!s) throw new Error('Akun belum terhubung.'); tt = s.id; }
  else if (!hp.lihatSemua) throw new Error('Peran Anda tidak dapat melihat data ini.');
  return honTunggakan_(honPetaPengguna_()[String(tt || '')], honAturan_(), {});
}

function honCariRekap_(t, id) {
  for (var i = 1; i < t.v.length; i++) if (sTeks_(absNilai_(t, t.v[i], 'ID REKAP')) === String(id)) return i + 1;
  return 0;
}
function waStafHonorSetujui(token, id, catatan) {
  var p = stafDariToken_(token);
  if (!honPeran_(p).setuju) throw new Error('Persetujuan honor hanya oleh Ketua Yayasan (Superadmin).');
  var t = absBaca_(HON.TAB_REKAP), b = honCariRekap_(t, id);
  if (!b) throw new Error('Rekap tidak ditemukan.');
  var o = honBarisRekap_(t, t.v[b - 1]);
  if (HON.KUNCI.indexOf(o.status) >= 0) throw new Error('Rekap ini sudah ' + o.status + '.');
  var aturan = honAturan_();
  var tg = honTunggakan_(honPetaPengguna_()[o.tutor], aturan, {});
  var set = function(n, v) { var c = absCol_(t, n); if (c >= 0) t.sh.getRange(b, c + 1).setValue(v); };
  if (tg.ada) {
    set('STATUS', 'Ditahan'); set('CATATAN', honTunggakanTeks_(tg));
    throw new Error('Tidak dapat disetujui: ' + honTunggakanTeks_(tg).replace('DITAHAN: ', '') + '. Honor tetap ditahan sampai tunggakan selesai.');
  }
  // pastikan nilai rekap masih sama dengan kehadiran terbaru
  var h = honKehadiran_(o.bulan, aturan)[o.tutor];
  if (h && h.total !== o.total) throw new Error('Kehadiran berubah sejak rekap dihitung. Tekan "Hitung ulang" dulu.');
  set('STATUS', 'Disetujui');
  set('CATATAN', 'Disetujui ' + p.nama + ' ' + absWaktu_() + (catatan ? ': ' + String(catatan).slice(0, 200) : ''));
  catat_(p.peran, '', p.nama, 'Setujui honor', o.tutor + ' ' + o.bulan + ' ' + honRp_(o.total), 'OK');
  npKirim_('honor_disetujui', { judul: 'Honor ' + o.bulan + ' disetujui', isi: 'Honor Anda ' + honRp_(o.total) + ' sudah disetujui dan menunggu pembayaran.', aksi: 'honor', tutor: [o.tutor] });   // v1.50.0: notifikasi
  return { sukses: true };
}
function waStafHonorBatalSetuju(token, id, alasan) {
  var p = stafDariToken_(token);
  if (!honPeran_(p).setuju) throw new Error('Hanya Ketua Yayasan (Superadmin).');
  var t = absBaca_(HON.TAB_REKAP), b = honCariRekap_(t, id);
  if (!b) throw new Error('Rekap tidak ditemukan.');
  var o = honBarisRekap_(t, t.v[b - 1]);
  if (o.status !== 'Disetujui') throw new Error('Hanya rekap berstatus Disetujui (belum dibayar) yang dapat dibatalkan.');
  if ((honPembayaran_()[o.id] || []).length) throw new Error('Rekap sudah ada pembayaran.');
  var set = function(n, v) { var c = absCol_(t, n); if (c >= 0) t.sh.getRange(b, c + 1).setValue(v); };
  set('STATUS', 'Draft'); set('CATATAN', 'Persetujuan dibatalkan ' + p.nama + ': ' + String(alasan || '').slice(0, 200));
  catat_(p.peran, '', p.nama, 'Batal setujui honor', o.tutor + ' ' + o.bulan, 'OK');
  return { sukses: true };
}
function honFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(HON.PROP_FOLDER);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('TH.E-Course - Bukti Pembayaran Honor (rahasia)');
  props.setProperty(HON.PROP_FOLDER, f.getId());
  return f;
}
// d: {jumlah, tanggal, metode, rekening, sumberDana, catatan, bukti(dataURL opsional)}
function waStafHonorBayar(token, id, d) {
  var p = stafDariToken_(token);
  if (!honPeran_(p).bayar) throw new Error('Hanya Admin atau Ketua Yayasan yang dapat mencatat pembayaran.');
  d = d || {};
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var t = absBaca_(HON.TAB_REKAP), b = honCariRekap_(t, id);
    if (!b) throw new Error('Rekap tidak ditemukan.');
    var o = honBarisRekap_(t, t.v[b - 1]);
    if (o.status !== 'Disetujui' && o.status !== 'Dibayar Sebagian') throw new Error('Honor hanya dapat dibayar setelah disetujui Ketua Yayasan (status sekarang: ' + (o.status || '-') + ').');
    var sudah = (honPembayaran_()[o.id] || []).reduce(function(s, x) { return s + x.jumlah; }, 0);
    var sisa = o.total - sudah;
    var jumlah = Math.round(Number(d.jumlah || sisa));
    if (!(jumlah > 0)) throw new Error('Jumlah pembayaran tidak valid.');
    if (jumlah > sisa) throw new Error('Jumlah melebihi sisa honor (' + honRp_(sisa) + ').');
    var tanggal = d.tanggal ? absTglSah_(d.tanggal) : absHariIni_();
    var tutor = absPetaTutor_()[o.tutor] || { nama: o.tutor };
    var rek = honRekening_(o.tutor, true) || {};
    var bukti = '';
    if (d.bukti) {
      var m = /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+\/=]+)$/.exec(String(d.bukti));
      if (!m) throw new Error('Berkas bukti tidak dikenali.');
      var blob = Utilities.newBlob(Utilities.base64Decode(m[3]), m[1], 'HONOR_' + o.bulan + '_' + o.tutor + '_' + Utilities.formatDate(new Date(), absTz_(), 'yyyyMMdd_HHmmss') + (m[1] === 'application/pdf' ? '.pdf' : '.jpg'));
      bukti = honFolder_().createFile(blob).getId();
    }
    var aturan = honAturan_(), sim = absSim_();
    var sumber = String(d.sumberDana || aturan.sumberDana || '').slice(0, 40);
    kalCekSaldo_(sumber, jumlah, d.paksa === true, p, 'Honor ' + tutor.nama + ' ' + o.bulan);   // v1.44.0
    var idTrx = absId_();
    var tx = keuTrxTab_();
    var pphH = pjkHitung_(jumlah, null, d.pph && d.pph.tarif ? { jenis: 'PPh 21', tarif: d.pph.tarif } : null, 'Pengeluaran');   // v1.46.0
    var akunH = kalAkunSah_(d.akun) || kalAkunBawaan_(d.metode || rek.metode || 'transfer');
    var rowH = {
      'ID TRANSAKSI': idTrx, 'TANGGAL': tanggal, 'JENIS': 'Pengeluaran', 'KATEGORI KEUANGAN': 'HON',
      'URAIAN': 'Honor ' + tutor.nama + ' bulan ' + o.bulan + (pphH.pph ? ' (dipotong PPh 21 ' + honRp_(pphH.pph) + ', dibayar bersih ' + honRp_(jumlah - pphH.pph) + ')' : ''), 'JUMLAH': jumlah, 'SUMBER DANA': sumber, 'PIHAK TERKAIT': tutor.nama,
      'BUKTI': bukti, 'STATUS': 'Disetujui', 'DIPUTUS OLEH': p.nama, 'TANGGAL KEPUTUSAN': tanggal, 'CATATAN KEPUTUSAN': 'Pembayaran honor (otomatis dari TH.E-Course)',
      'TAHUN PELAJARAN': sim.tahun, 'DICATAT OLEH': p.nama, 'DICATAT PADA': absWaktu_(),
      'AKUN KAS': akunH
    };
    var kp = pjkKeKolom_(pphH);
    Object.keys(kp).forEach(function(k) { rowH[k] = kp[k]; });
    tx.sh.appendRow(absBaris_(tx, rowH));
    if (pphH.pph) pjkPungut_({ id: idTrx, jenis: 'Pengeluaran', pph: pphH.pph, pphJenis: 'PPh 21', tarifPph: pphH.tarifPph, tanggal: tanggal, uraian: rowH['URAIAN'],
      sumber: sumber, pihak: tutor.nama, akun: akunH, tahun: sim.tahun });
    var tb = absBaca_(HON.TAB_BAYAR);
    var idBayar = absId_();
    tb.sh.appendRow(absBaris_(tb, {
      'ID BAYAR': idBayar, 'REKAP HONOR': o.id, 'TANGGAL': tanggal, 'JUMLAH': jumlah, 'METODE': String(d.metode || rek.metode || '').slice(0, 40),
      'REKENING TUJUAN': String(d.rekening || [rek.bank, rek.nomor, rek.atasNama].filter(String).join(' · ')).slice(0, 120), 'BUKTI': bukti,
      'CATATAN': String(d.catatan || '').slice(0, 200), 'ID TRANSAKSI': idTrx, 'DIBAYAR OLEH': p.nama, 'DICATAT PADA': absWaktu_(), 'SUMBER DANA': sumber
    }));
    var lunas = jumlah >= sisa;
    var c = absCol_(t, 'STATUS');
    if (c >= 0) t.sh.getRange(b, c + 1).setValue(lunas ? 'Dibayar' : 'Dibayar Sebagian');
    catat_(p.peran, '', p.nama, 'Bayar honor', tutor.nama + ' ' + o.bulan + ' ' + honRp_(jumlah), 'OK');
    npKirim_('honor_dibayar', { judul: 'Honor ' + o.bulan + ' dibayar', isi: honRp_(jumlah) + ' dibayar ke ' + (d.rekening || rek.bank || 'rekening Anda') + '.', aksi: 'honor', tutor: [o.tutor] });   // v1.50.0: notifikasi
    return { sukses: true, lunas: lunas, sisa: sisa - jumlah, idBayar: idBayar, idTransaksi: idTrx };
  } finally { kunci.releaseLock(); }
}
function waStafHonorBukti(token, idBayar) {
  var p = stafDariToken_(token), hp = honPeran_(p);
  var t = absBaca_(HON.TAB_BAYAR);
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (sTeks_(absNilai_(t, r, 'ID BAYAR')) !== String(idBayar)) continue;
    if (!hp.lihatSemua) {
      var s = hp.tutor ? absTutorSaya_(p) : null;
      var tr = absBaca_(HON.TAB_REKAP), b = honCariRekap_(tr, sTeks_(absNilai_(t, r, 'REKAP HONOR')));
      if (!s || !b || sTeks_(absNilai_(tr, tr.v[b - 1], 'TUTOR')).trim() !== s.id) throw new Error('Anda tidak berhak melihat bukti ini.');
    }
    var fid = sTeks_(absNilai_(t, r, 'BUKTI')).trim();
    if (!fid) throw new Error('Tidak ada bukti.');
    var bl = DriveApp.getFileById(fid).getBlob();
    return { b64: Utilities.base64Encode(bl.getBytes()), mime: bl.getContentType() };
  }
  throw new Error('Pembayaran tidak ditemukan.');
}
// Ringkasan honor tutor: 12 bulan terakhir + saldo + tunggakan saat ini + pratinjau bulan berjalan.
function waStafHonorSaya(token) {
  var p = stafDariToken_(token);
  if (!absPeran_(p).tutor) throw new Error('Khusus tutor.');
  var s = absTutorSaya_(p);
  if (!s) throw new Error('Akun Anda belum terhubung dengan data tutor di Data Induk (email/nomor HP/nama tidak cocok). Hubungi admin.');
  var aturan = honAturan_();
  var bayar = honPembayaran_();
  var t = absBaca_(HON.TAB_REKAP), rekap = [];
  for (var i = 1; i < t.v.length; i++) {
    var o = honBarisRekap_(t, t.v[i]);
    if (o.tutor !== s.id) continue;
    o.pembayaran = bayar[o.id] || [];
    o.dibayar = o.pembayaran.reduce(function(x, y) { return x + y.jumlah; }, 0);
    o.sisa = Math.max(0, o.total - o.dibayar);
    o.tanggalBayar = honTanggalBayar_(o.bulan, aturan);
    rekap.push(o);
  }
  rekap.sort(function(a, b) { return b.bulan.localeCompare(a.bulan); });
  var disetujui = rekap.filter(function(o) { return HON.KUNCI.indexOf(o.status) >= 0; });
  var bulanIni = honBulanIni_();
  var kini = honKehadiran_(bulanIni, aturan)[s.id] || { jumlah: 0, total: 0, sesi: [] };
  return {
    tutor: s, aturan: { mode: aturan.mode, honor: honHonorTutor_(aturan, s.id), tanggalBayar: aturan.tanggalBayar, satuan: aturan.satuan, tarif: aturan.tarifBerlaku, tarifProgram: aturan.tarifProgram, batasDiskusiHari: aturan.batasDiskusiHari },
    rekening: honRekening_(s.id, true),
    saldo: { belumDibayar: disetujui.reduce(function(x, o) { return x + o.sisa; }, 0), sudahDibayar: rekap.reduce(function(x, o) { return x + o.dibayar; }, 0), ditahan: rekap.filter(function(o) { return o.status === 'Ditahan'; }).reduce(function(x, o) { return x + o.total; }, 0) },
    tunggakan: honTunggakan_(honPetaPengguna_()[s.id], aturan, {}),
    bulanIni: { bulan: bulanIni, jumlah: kini.jumlah, total: kini.total, sesi: kini.sesi, bulanan: kini.bulanan || null, tanggalBayar: honTanggalBayar_(bulanIni, aturan) },
    rekap: rekap.slice(0, 24)
  };
}


// ============================================================================
// JADWAL TATAP MUKA (Tahap 3, migrasi SIM SETARA). Repo: tab PEMETAAN & USULAN JADWAL
// di spreadsheet database (simSs_). Slot sesi (Sesi 1, Sesi 2, ...) diatur Admin di Script Property
// TH_JADWAL_ATURAN. Jadwal harian dihitung dari PEMETAAN (hari + slot + rentang tanggal).
// Absen tutor hanya untuk kelas yang terjadwal hari itu; di luar jadwal wajib alasan.
// ============================================================================
var JAD = {
  PROP: 'TH_JADWAL_ATURAN',
  HARI: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
  BAWAAN: { slot: [{ id: 'S1', nama: 'Sesi 1', mulai: '13:00', selesai: '14:30' }, { id: 'S2', nama: 'Sesi 2', mulai: '14:30', selesai: '16:00' }], wajibJadwal: true },
  TAB_PM: 'PEMETAAN', TAB_US: 'USULAN JADWAL'
};
function jadAturan_() {
  var a = { slot: JAD.BAWAAN.slot, wajibJadwal: JAD.BAWAAN.wajibJadwal };
  try {
    var s = JSON.parse(PropertiesService.getScriptProperties().getProperty(JAD.PROP) || '{}');
    if (Array.isArray(s.slot)) a.slot = s.slot;
    if (s.wajibJadwal !== undefined) a.wajibJadwal = s.wajibJadwal === true;
  } catch (e) {}
  return a;
}
function jadJamSah_(j) {
  j = String(j || '').trim().replace('.', ':');
  var m = /^(\d{1,2}):(\d{2})$/.exec(j);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error('Format jam harus HH:MM (contoh 13:00).');
  return ('0' + m[1]).slice(-2) + ':' + m[2];
}
function jadHariDari_(tanggal) { var p = tanggal.split('-'); return JAD.HARI[new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay()]; }
// v1.76.0: pola minggu dalam bulan (kolom MINGGU KE). '' = setiap minggu; '1,3' = minggu ke-1 & 3; '2,4' = minggu ke-2 & 4.
// Minggu ke-n = urutan hari itu dalam bulan (tgl 1-7 = ke-1, 8-14 = ke-2, ...). Minggu ke-5 (tgl 29-31) ikut minggu 1 & 3.
function jadMingguSah_(v) {
  var s = {};
  // digit diambil satu per satu: Excel bisa mengubah "1,3" menjadi angka 13 / 1.3
  (String(v === null || v === undefined ? '' : v).match(/[1-4]/g) || []).forEach(function(x) { s[x] = true; });
  var k = Object.keys(s).sort();
  return k.length === 4 ? '' : k.join(',');
}
function jadMingguKe_(tanggal) { return Math.ceil(Number(String(tanggal).split('-')[2]) / 7); }
function jadMingguSet_(m) {
  var o = {};
  (m ? String(m).split(',') : ['1', '2', '3', '4']).forEach(function(x) { o[String(x).trim()] = true; });
  if (o['1'] || o['3']) o['5'] = true;
  return o;
}
function jadMingguCocok_(m, tanggal) { return !m || !!jadMingguSet_(m)[String(jadMingguKe_(tanggal))]; }
function jadMingguIris_(a, b) {
  if (!a || !b) return true;
  var A = jadMingguSet_(a), B = jadMingguSet_(b);
  return Object.keys(A).some(function(k) { return B[k]; });
}
function jadMingguTeks_(m) { return m ? 'minggu ke-' + m.replace(/,/g, ' & ') : 'setiap minggu'; }
function jadPeran_(p) { var q = absPeran_(p); return { kelola: q.admin || q.ks, putus: q.ks, lihatSemua: q.admin || q.ks || q.sa || q.fo || q.koord, tutor: q.tutor }; }

function jadBacaPm_() {
  var t = absBaca_(JAD.TAB_PM), out = [];
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    var id = sTeks_(absNilai_(t, r, 'ID PEMETAAN')).trim();
    if (!id) continue;
    out.push({
      baris: i + 1, id: id, idRombel: sTeks_(absNilai_(t, r, 'ROMBEL')).trim(), kodeMapel: sTeks_(absNilai_(t, r, 'MAPEL')).trim(), idTutor: sTeks_(absNilai_(t, r, 'TUTOR')).trim(),
      hari: sTeks_(absNilai_(t, r, 'HARI')).trim(), mulai: absJam_(absNilai_(t, r, 'JAM MULAI')), selesai: absJam_(absNilai_(t, r, 'JAM SELESAI')),
      dari: absTgl_(absNilai_(t, r, 'TANGGAL MULAI')), sampai: absTgl_(absNilai_(t, r, 'TANGGAL SELESAI')), aktif: absBenar_(absNilai_(t, r, 'AKTIF')),
      slot: sTeks_(absNilai_(t, r, 'SESI')).trim(), paket: sTeks_(absNilai_(t, r, 'PAKET')).trim(),
      unit: sTeks_(absNilai_(t, r, 'UNIT')).trim(),   // v1.62.0: ID unit (koma, terurut); kosong = semua siswa rombel
      minggu: jadMingguSah_(absNilai_(t, r, 'MINGGU KE')),   // v1.76.0
      ruang: sTeks_(absNilai_(t, r, 'RUANG')).trim(), lokasi: sTeks_(absNilai_(t, r, 'LOKASI')).trim()   // v1.79.0
    });
  }
  return { t: t, data: out };
}
function jadLengkapi_(list) {
  var rombel = honProgramRombel_(), mapel = honNamaMapel_(), tutor = absPetaTutor_(), ruang = jadRuangPeta_();
  list.forEach(function(x) {
    x.namaRombel = rombel[x.idRombel] ? rombel[x.idRombel].nama : x.idRombel;
    x.namaMapel = mapel[x.kodeMapel] || x.kodeMapel;
    x.namaTutor = tutor[x.idTutor] ? tutor[x.idTutor].nama : x.idTutor;
    // v1.79.0: lokasi tatap muka = nama ruang (unit) atau keterangan bebas
    var rg = x.ruang ? ruang[x.ruang] : null;
    x.namaRuang = rg ? rg.nama : (x.ruang || '');
    x.teksLokasi = rg ? rg.nama + (rg.namaUnit ? ' (' + rg.namaUnit + ')' : '') : (x.ruang || x.lokasi || '');
  });
  return list;
}
// v1.79.0: ruang belajar (Data Induk -> Ruang Belajar): kode -> {kode, nama, unit, namaUnit, kapasitas, aktif}
function jadRuangPeta_() {
  var out = {};
  try {
    var sh = absSs_().getSheetByName('RUANG BELAJAR');
    if (!sh || sh.getLastRow() < 2) return out;
    var t = absBaca_('RUANG BELAJAR', IND.ruang.hdr), nu = {};
    try { ubUnit_().forEach(function(u) { nu[u.id] = u.nama; }); } catch (e1) {}
    for (var i = 1; i < t.v.length; i++) {
      var k = sTeks_(absNilai_(t, t.v[i], 'KODE RUANG')).trim();
      if (!k) continue;
      var u = sTeks_(absNilai_(t, t.v[i], 'UNIT')).trim();
      out[k] = { kode: k, nama: sTeks_(absNilai_(t, t.v[i], 'NAMA RUANG')).trim() || k, unit: u, namaUnit: nu[u] || u,
        kapasitas: sTeks_(absNilai_(t, t.v[i], 'KAPASITAS')).trim(), aktif: absBenar_(absNilai_(t, t.v[i], 'AKTIF')) };
    }
  } catch (e) {}
  return out;
}
function jadRuangDaftar_() {
  var p = jadRuangPeta_();
  return Object.keys(p).map(function(k) { return p[k]; }).filter(function(r) { return r.aktif; })
    .sort(function(a, b) { return (a.namaUnit + '|' + a.nama).localeCompare(b.namaUnit + '|' + b.nama, 'id', { numeric: true }); });
}
// Ruang & lokasi sah untuk disimpan: ruang harus terdaftar & aktif; lokasi bebas maks 80 huruf (dipakai bila tanpa ruang).
function jadLokasiSah_(d) {
  var ruang = String(d.ruang || '').trim(), lokasi = String(d.lokasi || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (ruang) {
    var rg = jadRuangPeta_()[ruang];
    if (!rg || !rg.aktif) throw new Error('Ruang "' + ruang + '" tidak terdaftar atau nonaktif di Data Induk → Ruang Belajar.');
    return { ruang: ruang, lokasi: '' };
  }
  return { ruang: '', lokasi: lokasi };
}
// pemetaan hanya berlaku untuk mapel aktif
var JAD_AKTIF_ = null;
function jadKelasAktif_() {
  if (!JAD_AKTIF_) { JAD_AKTIF_ = {}; absKelas_('').forEach(function(k) { JAD_AKTIF_[k.idRombel + '|' + k.kodeMapel] = true; }); }
  return JAD_AKTIF_;
}
function jadBerlaku_(x, tanggal) {
  if (!x.aktif) return false;
  if (!jadKelasAktif_()[x.idRombel + '|' + x.kodeMapel]) return false;
  if (x.dari && tanggal < x.dari) return false;
  if (x.sampai && tanggal > x.sampai) return false;
  if (x.hari !== jadHariDari_(tanggal)) return false;
  if (!jadMingguCocok_(x.minggu, tanggal)) return false;   // v1.76.0
  // v1.64.0: agenda lembaga yang disahkan (libur / kegiatan pengganti) meniadakan jadwal tatap muka ini
  if (typeof agLiburPm_ === 'function' && agLiburPm_(x, tanggal)) return false;
  return true;
}
// Pemetaan tutor yang berlaku pada tanggal tertentu.
function jadTutorHari_(idTutor, tanggal) {
  return jadBacaPm_().data.filter(function(x) { return x.idTutor === idTutor && jadBerlaku_(x, tanggal); });
}
function jadBentrok_(semua, d, kecualiId) {
  var hasil = [];
  semua.forEach(function(x) {
    if (!x.aktif || x.id === kecualiId || x.hari !== d.hari) return;
    if (!(x.mulai < d.selesai && d.mulai < x.selesai)) return;
    var rentang = (!x.sampai || !d.dari || x.sampai >= d.dari) && (!d.sampai || !x.dari || d.sampai >= x.dari);
    if (!rentang) return;
    if (!jadMingguIris_(x.minggu, d.minggu)) return;   // v1.76.0: minggu 1,3 dan 2,4 tidak bentrok
    var mg = x.minggu ? ' (' + jadMingguTeks_(x.minggu) + ')' : '';
    // mapel sama pada jam sama = kelas gabungan (beberapa rombel sekaligus), bukan bentrok
      if (x.idTutor && x.idTutor === d.idTutor && x.kodeMapel !== d.kodeMapel) hasil.push('tutor sudah mengajar ' + x.kodeMapel + ' di rombel lain pada ' + x.hari + ' ' + x.mulai + '–' + x.selesai + mg);
    if (x.idRombel === d.idRombel && (typeof ubIris_ !== 'function' || ubIris_(x.unit, d.unit))) hasil.push('rombel sudah ada jadwal ' + x.kodeMapel + ' pada ' + x.hari + ' ' + x.mulai + '–' + x.selesai + mg);
    // v1.79.0: satu ruang tidak dipakai dua kelas berbeda pada jam yang sama (kelas gabungan: mapel & tutor sama, boleh)
    if (x.ruang && d.ruang && x.ruang === d.ruang && !(x.kodeMapel === d.kodeMapel && x.idTutor === d.idTutor))
      hasil.push('ruang ' + x.ruang + ' sudah dipakai ' + x.kodeMapel + ' pada ' + x.hari + ' ' + x.mulai + '–' + x.selesai + mg);
  });
  return hasil;
}

// ============================ API ============================
function waStafJadwalAturan(token) {
  stafDariToken_(token);
  return { aturan: jadAturan_(), hari: JAD.HARI.slice(1).concat(['Minggu']) };
}
function waAdminJadwalAturanSimpan(token, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  var a = jadAturan_();
  if (d.slot !== undefined) {
    if (!Array.isArray(d.slot) || !d.slot.length) throw new Error('Minimal satu slot sesi.');
    var ids = {};
    a.slot = d.slot.map(function(s, i) {
      var nama = String(s.nama || ('Sesi ' + (i + 1))).trim().slice(0, 30);
      var mulai = jadJamSah_(s.mulai), selesai = jadJamSah_(s.selesai);
      if (selesai <= mulai) throw new Error(nama + ': jam selesai harus setelah jam mulai.');
      var id = String(s.id || ('S' + (i + 1))).trim().slice(0, 10);
      if (ids[id]) id = 'S' + (i + 1) + '_' + i;
      ids[id] = true;
      return { id: id, nama: nama, mulai: mulai, selesai: selesai };
    });
  }
  if (d.wajibJadwal !== undefined) a.wajibJadwal = d.wajibJadwal === true;
  PropertiesService.getScriptProperties().setProperty(JAD.PROP, JSON.stringify(a));
  catat_(p.peran, '', p.nama, 'Atur jadwal', JSON.stringify(a).slice(0, 180), 'OK');
  return { aturan: a };
}
// Daftar pemetaan (+ data formulir untuk Admin/KS). Tutor: miliknya.
function waStafPemetaanDaftar(token) {
  var p = stafDariToken_(token), jp = jadPeran_(p);
  if (!jp.lihatSemua && !jp.tutor) throw new Error('Peran Anda tidak dapat melihat jadwal.');
  var hariIni = absHariIni_();   // v1.70.2: jadwal yang sudah berakhir (dibatalkan) tidak ditampilkan lagi
  var data = jadBacaPm_().data.filter(function(x) { return x.aktif && (!x.sampai || x.sampai >= hariIni) && jadKelasAktif_()[x.idRombel + '|' + x.kodeMapel]; });
  var saya = null;
  if (jp.tutor) { saya = absTutorSaya_(p); data = saya ? data.filter(function(x) { return x.idTutor === saya.id; }) : []; }
  jadLengkapi_(data);
  data.forEach(function(x) { x.namaUnit = x.unit && typeof ubNamaKunci_ === 'function' ? ubNamaKunci_(x.unit) : ''; });   // v1.62.0
  var urut = {};
  JAD.HARI.forEach(function(h, i) { urut[h] = i === 0 ? 7 : i; });
  data.sort(function(a, b) { return (urut[a.hari] || 9) - (urut[b.hari] || 9) || a.mulai.localeCompare(b.mulai) || a.namaRombel.localeCompare(b.namaRombel); });
  var out = { pemetaan: data, aturan: jadAturan_(), kelola: jp.kelola, tutorSaya: saya };
  if (jp.kelola) {
    try { out.unit = ubUnit_().filter(function(u) { return u.aktif; }).map(function(u) { return { id: u.id, nama: u.nama }; }); } catch (eU) { out.unit = []; }
    out.kelas = absKelas_('');
    out.ruang = jadRuangDaftar_();   // v1.79.0
    var pt = absPetaTutor_();
    out.tutor = Object.keys(pt).map(function(k) { return pt[k]; }).filter(function(x) { return x.aktif; }).sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  } else if (saya) {
    out.kelas = absKelas_(saya.id);
  }
  return out;
}
// v1.76.0: data cetak jadwal mingguan (akses & saringan sama dengan daftar; tutor hanya miliknya) + kop lembaga.
function waStafJadwalCetak(token) {
  var d = waStafPemetaanDaftar(token), p = stafDariToken_(token), kop = {}, unit = [];
  try { kop = kwKop_(); } catch (e) {}
  try { unit = ubUnit_().filter(function(u) { return u.aktif; }).map(function(u) { return { id: u.id, nama: u.nama }; }); } catch (e1) {}
  return { pemetaan: d.pemetaan, aturan: d.aturan, unit: unit, kop: kop, dibuat: absWaktu_(), oleh: p.nama, tutorSaja: !!d.tutorSaya };
}
// d: {id?, idRombel, kodeMapel, idTutor, hari, slot | (mulai, selesai), dari, sampai}
function waStafPemetaanSimpan(token, d) {
  var p = stafDariToken_(token);
  if (!jadPeran_(p).kelola) throw new Error('Pemetaan jadwal hanya oleh Admin atau Kepala Sekolah.');
  return jadSimpanInti_(p, d || {});
}
// Banyak rombel sekaligus (per jenjang / per rombel), satu tutor + satu mapel + hari + slot.
// d: {idTutor, kodeMapel, rombel: [idRombel...], hari, slot, dari, sampai, tunggal}
// tunggal = true: hanya satu tanggal (dari = sampai), hari mengikuti tanggal.
function waStafPemetaanSimpanBanyak(token, d) {
  var p = stafDariToken_(token);
  if (!jadPeran_(p).kelola) throw new Error('Pemetaan jadwal hanya oleh Admin atau Kepala Sekolah.');
  d = d || {};
  var rombel = (Array.isArray(d.rombel) ? d.rombel : []).map(String).filter(function(x, i, a) { return x && a.indexOf(x) === i; });
  if (!rombel.length) throw new Error('Pilih minimal satu rombel.');
  if (rombel.length > 40) throw new Error('Terlalu banyak rombel sekaligus (maks 40).');
  var dari = d.dari ? absTglSah_(d.dari) : absHariIni_();
  var sampai = d.tunggal ? dari : (d.sampai ? absTglSah_(d.sampai) : '');
  var hari = d.tunggal ? jadHariDari_(dari) : String(d.hari || '');
  var a = jadAturan_(), slot = a.slot.filter(function(s) { return s.id === d.slot || s.nama === d.slot; })[0];
  if (!slot) throw new Error('Slot sesi tidak dikenal.');
  var semuaKelas = absKelas_(''), pm = jadBacaPm_().data, galat = [], lokB = jadLokasiSah_(d);
  rombel.forEach(function(idR) {
    var k = absKelasCek_(semuaKelas, idR, d.kodeMapel);
    if (!k) { galat.push(idR + ': mapel tidak ada di rombel ini'); return; }
    var b = jadBentrok_(pm, { idRombel: k.idRombel, kodeMapel: k.kodeMapel, idTutor: String(d.idTutor || ''), hari: hari, mulai: slot.mulai, selesai: slot.selesai, dari: dari, sampai: sampai,
      unit: typeof ubKunciSah_ === 'function' ? ubKunciSah_(d.unit) : '', minggu: d.tunggal ? '' : jadMingguSah_(d.minggu), ruang: lokB.ruang }, '');
    if (b.length) galat.push(k.namaRombel + ': ' + b.join('; '));
  });
  if (galat.length) throw new Error('Jadwal belum disimpan. ' + galat.join(' | '));
  var hasil = [];
  rombel.forEach(function(idR) {
    hasil.push(jadSimpanInti_(p, { idRombel: idR, kodeMapel: d.kodeMapel, idTutor: d.idTutor, hari: hari, slot: slot.id, dari: dari, sampai: sampai, unit: d.unit, minggu: d.tunggal ? '' : d.minggu, ruang: lokB.ruang, lokasi: lokB.lokasi }).id);
  });
  return { sukses: true, jumlah: hasil.length, id: hasil, hari: hari, dari: dari, sampai: sampai };
}
function jadSimpanInti_(p, d) {
  var kelas = absKelasCek_(absKelas_(''), d.idRombel, d.kodeMapel);
  if (!kelas) throw new Error('Rombel/mapel tidak ditemukan atau tidak aktif.');
  var idTutor = String(d.idTutor || kelas.idTutor || '').trim();
  if (!idTutor || !absPetaTutor_()[idTutor]) throw new Error('Pilih tutor pengajar.');
  var hari = String(d.hari || '').trim();
  if (JAD.HARI.indexOf(hari) < 0) throw new Error('Hari tidak dikenal.');
  var a = jadAturan_(), slot = null;
  if (d.slot) { slot = a.slot.filter(function(s) { return s.id === d.slot || s.nama === d.slot; })[0]; if (!slot) throw new Error('Slot sesi tidak dikenal.'); }
  var mulai = slot ? slot.mulai : jadJamSah_(d.mulai), selesai = slot ? slot.selesai : jadJamSah_(d.selesai);
  if (selesai <= mulai) throw new Error('Jam selesai harus setelah jam mulai.');
  var dari = d.dari ? absTglSah_(d.dari) : absHariIni_(), sampai = d.sampai ? absTglSah_(d.sampai) : '';
  if (sampai && sampai < dari) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  var unitPm = typeof ubKunciSah_ === 'function' ? ubKunciSah_(d.unit) : '';
  var minggu = jadMingguSah_(d.minggu);   // v1.76.0
  var lok = jadLokasiSah_(d);   // v1.79.0
  var baru = { idRombel: kelas.idRombel, kodeMapel: kelas.kodeMapel, idTutor: idTutor, hari: hari, mulai: mulai, selesai: selesai, dari: dari, sampai: sampai, unit: unitPm, minggu: minggu, ruang: lok.ruang };
  if (lok.ruang || lok.lokasi) { ubPastikanKolom_(JAD.TAB_PM, 'RUANG'); ubPastikanKolom_(JAD.TAB_PM, 'LOKASI'); }
  if (unitPm) ubPastikanKolom_(JAD.TAB_PM, 'UNIT');
  if (minggu) ubPastikanKolom_(JAD.TAB_PM, 'MINGGU KE');
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var pm = jadBacaPm_();
    var b = jadBentrok_(pm.data, baru, d.id || '');
    if (b.length) throw new Error('Bentrok jadwal: ' + b.join('; ') + '.');
    var nilai = {
      'ROMBEL': baru.idRombel, 'MAPEL': baru.kodeMapel, 'TUTOR': idTutor, 'HARI': hari, 'JAM MULAI': mulai, 'JAM SELESAI': selesai,
      'TANGGAL MULAI': dari, 'TANGGAL SELESAI': sampai, 'AKTIF': true, 'SESI': slot ? slot.nama : '', 'PAKET': kelas.program, 'UNIT': unitPm,
      'MINGGU KE': minggu, 'RUANG': lok.ruang, 'LOKASI': lok.lokasi
    };
    var id = d.id ? String(d.id) : '';
    if (id) {
      var lama = pm.data.filter(function(x) { return x.id === id; })[0];
      if (!lama) throw new Error('Pemetaan tidak ditemukan.');
      nilai['ID PEMETAAN'] = id;
      var row = absBaris_(pm.t, nilai);
      pm.t.sh.getRange(lama.baris, 1, 1, row.length).setValues([row]);
    } else {
      id = absId_();
      nilai['ID PEMETAAN'] = id;
      pm.t.sh.appendRow(absBaris_(pm.t, nilai));
    }
    catat_(p.peran, kelas.idRombel, p.nama, d.id ? 'Ubah jadwal' : 'Tambah jadwal', kelas.namaRombel + ' ' + kelas.namaMapel + ' ' + hari + ' ' + mulai + (minggu ? ' ' + jadMingguTeks_(minggu) : ''), 'OK');
    return { sukses: true, id: id };
  } finally { kunci.releaseLock(); }
}
function waStafPemetaanHapus(token, id) {
  var p = stafDariToken_(token);
  if (!jadPeran_(p).kelola) throw new Error('Hanya Admin atau Kepala Sekolah.');
  var pm = jadBacaPm_();
  var x = pm.data.filter(function(y) { return y.id === String(id); })[0];
  if (!x) throw new Error('Pemetaan tidak ditemukan.');
  var c = absCol_(pm.t, 'AKTIF'), cs = absCol_(pm.t, 'TANGGAL SELESAI');
  if (c >= 0) pm.t.sh.getRange(x.baris, c + 1).setValue(false);
  if (cs >= 0 && !x.sampai) pm.t.sh.getRange(x.baris, cs + 1).setValue(absHariIni_());
  catat_(p.peran, x.idRombel, p.nama, 'Hapus jadwal', x.kodeMapel + ' ' + x.hari + ' ' + x.mulai, 'OK');
  return { sukses: true };
}
// v1.70.2: batalkan satu / beberapa jadwal mulai tanggal tertentu (revisi). d: {id: [..], mulai: 'yyyy-MM-dd'}
// Jadwal tetap berlaku sampai sehari sebelum [mulai]; yang belum pernah berlaku (dari >= mulai) dinonaktifkan.
// Riwayat sesi, absensi, dan honor yang sudah tercatat tidak berubah.
function waStafPemetaanBatal(token, d) {
  var p = stafDariToken_(token);
  if (!jadPeran_(p).kelola) throw new Error('Hanya Admin atau Kepala Sekolah.');
  d = d || {};
  var ids = (Array.isArray(d.id) ? d.id : [d.id]).map(String).filter(function(x, i, a) { return x && a.indexOf(x) === i; });
  if (!ids.length) throw new Error('Pilih jadwal yang akan dibatalkan.');
  if (ids.length > 200) throw new Error('Terlalu banyak jadwal sekaligus (maks 200).');
  var hariIni = absHariIni_(), mulai = d.mulai ? absTglSah_(d.mulai) : hariIni;
  if (mulai < hariIni) throw new Error('Tanggal berlaku pembatalan tidak boleh sebelum hari ini.');
  var akhir = Utilities.formatDate(new Date(new Date(mulai + 'T12:00:00+07:00').getTime() - 86400000), absTz_(), 'yyyy-MM-dd');
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var pm = jadBacaPm_(), cA = absCol_(pm.t, 'AKTIF'), cS = absCol_(pm.t, 'TANGGAL SELESAI'), n = 0, lewati = [];
    ids.forEach(function(id) {
      var x = pm.data.filter(function(y) { return y.id === id; })[0];
      if (!x || !x.aktif) { lewati.push(id); return; }
      if (x.sampai && x.sampai <= akhir) { lewati.push(id); return; }   // sudah berakhir sebelum tanggal itu
      if (!x.dari || x.dari >= mulai) { if (cA >= 0) pm.t.sh.getRange(x.baris, cA + 1).setValue(false); }
      else if (cS >= 0) pm.t.sh.getRange(x.baris, cS + 1).setValue(akhir);
      n++;
      catat_(p.peran, x.idRombel, p.nama, 'Batalkan jadwal', x.kodeMapel + ' ' + x.hari + ' ' + x.mulai + ' mulai ' + mulai, 'OK');
    });
    return { sukses: true, jumlah: n, dilewati: lewati.length, mulai: mulai };
  } finally { kunci.releaseLock(); }
}
// Jadwal satu tanggal + status absen tutor. Tutor: miliknya.
function waStafJadwalHari(token, tanggal) {
  var p = stafDariToken_(token), jp = jadPeran_(p);
  if (!jp.lihatSemua && !jp.tutor) throw new Error('Peran Anda tidak dapat melihat jadwal.');
  tanggal = tanggal ? absTglSah_(tanggal) : absHariIni_();
  var data = jadBacaPm_().data.filter(function(x) { return jadBerlaku_(x, tanggal); });
  if (jp.tutor) { var s = absTutorSaya_(p); data = s ? data.filter(function(x) { return x.idTutor === s.id; }) : []; }
  jadLengkapi_(data);
  var ts = absBaca_('SESI BELAJAR');
  data.forEach(function(x) {
    var sesi = absSesiCari_(ts, tanggal, x.idRombel, x.kodeMapel, x.unit);
    x.hadir = !!(sesi && sTeks_(absNilai_(ts, sesi.r, 'STATUS')).trim() === 'Hadir');
    x.namaUnit = x.unit ? ubNamaKunci_(x.unit) : '';
    x.jamHadir = sesi ? absJam_(absNilai_(ts, sesi.r, 'JAM HADIR')) : '';
  });
  data.sort(function(a, b) { return a.mulai.localeCompare(b.mulai) || a.namaRombel.localeCompare(b.namaRombel); });
  return { tanggal: tanggal, hari: jadHariDari_(tanggal), jadwal: data };
}

// ---------- usulan jadwal (tutor) -> persetujuan Kepala Sekolah ----------
function jadTabUsulan_() {
  var t = absBaca_(JAD.TAB_US);
  if (absCol_(t, 'ROMBEL') < 0) {
    var n = t.sh.getLastColumn() + 1;
    t.sh.getRange(1, n).setValue('ROMBEL').setFontWeight('bold');
    t = absBaca_(JAD.TAB_US);
  }
  return t;
}
function jadUsulanObj_(t, r) {
  return {
    id: sTeks_(absNilai_(t, r, 'ID USULAN')), tutor: sTeks_(absNilai_(t, r, 'TUTOR')).trim(), hari: sTeks_(absNilai_(t, r, 'HARI')).trim(), slot: sTeks_(absNilai_(t, r, 'SESI')).trim(),
    paket: sTeks_(absNilai_(t, r, 'PAKET')).trim(), kodeMapel: sTeks_(absNilai_(t, r, 'MAPEL')).trim(), idRombel: sTeks_(absNilai_(t, r, 'ROMBEL')).trim(),
    catatan: sTeks_(absNilai_(t, r, 'CATATAN')), status: sTeks_(absNilai_(t, r, 'STATUS')).trim(), diajukan: sTeks_(absNilai_(t, r, 'DIAJUKAN PADA')),
    diputusOleh: sTeks_(absNilai_(t, r, 'DIPUTUS OLEH')), idPemetaan: sTeks_(absNilai_(t, r, 'ID PEMETAAN'))
  };
}
// d: {idRombel, kodeMapel, hari, slot, catatan}
function waStafUsulanAjukan(token, d) {
  var p = stafDariToken_(token);
  if (!absPeran_(p).tutor) throw new Error('Usulan jadwal diajukan oleh tutor.');
  d = d || {};
  var s = absTutorSaya_(p);
  if (!s) throw new Error('Akun Anda belum terhubung dengan data tutor di Data Induk.');
  var kelas = absKelasCek_(absKelas_(s.id), d.idRombel, d.kodeMapel);
  if (!kelas) throw new Error('Anda tidak mengampu mapel ini di rombel tersebut.');
  if (JAD.HARI.indexOf(String(d.hari)) < 0) throw new Error('Pilih hari.');
  var slot = jadAturan_().slot.filter(function(x) { return x.id === d.slot || x.nama === d.slot; })[0];
  if (!slot) throw new Error('Pilih slot sesi.');
  var b = jadBentrok_(jadBacaPm_().data, { idRombel: kelas.idRombel, idTutor: s.id, hari: d.hari, mulai: slot.mulai, selesai: slot.selesai, dari: absHariIni_(), sampai: '' }, '');
  if (b.length) throw new Error('Slot itu bentrok: ' + b.join('; ') + '. Pilih hari/slot lain.');
  var t = jadTabUsulan_();
  t.sh.appendRow(absBaris_(t, {
    'ID USULAN': absId_(), 'TUTOR': s.id, 'HARI': d.hari, 'SESI': slot.nama, 'PAKET': kelas.program, 'MAPEL': kelas.kodeMapel, 'ROMBEL': kelas.idRombel,
    'CATATAN': String(d.catatan || '').slice(0, 300), 'STATUS': 'Menunggu', 'DIAJUKAN PADA': absWaktu_()
  }));
  catat_(p.peran, kelas.idRombel, p.nama, 'Usulan jadwal', kelas.namaMapel + ' ' + d.hari + ' ' + slot.nama, 'OK');
  return { sukses: true };
}
function waStafUsulanDaftar(token) {
  var p = stafDariToken_(token), jp = jadPeran_(p);
  var saya = null;
  if (jp.tutor) { saya = absTutorSaya_(p); if (!saya) return { usulan: [], bolehPutus: false }; }
  else if (!jp.lihatSemua) throw new Error('Peran Anda tidak dapat melihat usulan jadwal.');
  var t = jadTabUsulan_(), out = [];
  var rombel = honProgramRombel_(), mapel = honNamaMapel_(), tutor = absPetaTutor_();
  for (var i = t.v.length - 1; i >= 1 && out.length < 200; i--) {
    var o = jadUsulanObj_(t, t.v[i]);
    if (!o.id || (saya && o.tutor !== saya.id)) continue;
    o.namaTutor = tutor[o.tutor] ? tutor[o.tutor].nama : o.tutor;
    o.namaRombel = rombel[o.idRombel] ? rombel[o.idRombel].nama : (o.idRombel || '-');
    o.namaMapel = mapel[o.kodeMapel] || o.kodeMapel;
    out.push(o);
  }
  return { usulan: out, bolehPutus: jp.putus };
}
function waStafUsulanPutus(token, id, setuju, catatan) {
  var p = stafDariToken_(token);
  if (!jadPeran_(p).putus) throw new Error('Usulan jadwal disetujui oleh Kepala Sekolah.');
  var t = jadTabUsulan_();
  for (var i = 1; i < t.v.length; i++) {
    var o = jadUsulanObj_(t, t.v[i]);
    if (o.id !== String(id)) continue;
    if (o.status !== 'Menunggu') throw new Error('Usulan ini sudah ' + o.status + '.');
    var set = function(n, v) { var c = absCol_(t, n); if (c >= 0) t.sh.getRange(i + 1, c + 1).setValue(v); };
    if (setuju) {
      var h = jadSimpanInti_(p, { idRombel: o.idRombel, kodeMapel: o.kodeMapel, idTutor: o.tutor, hari: o.hari, slot: o.slot });
      set('ID PEMETAAN', h.id);
    }
    set('STATUS', setuju ? 'Disetujui' : 'Ditolak'); set('DIPUTUS OLEH', p.nama); set('DIPUTUS PADA', absWaktu_());
    if (catatan) set('CATATAN', (o.catatan ? o.catatan + ' | ' : '') + 'KS: ' + String(catatan).slice(0, 200));
    catat_(p.peran, o.idRombel, p.nama, setuju ? 'Setujui usulan jadwal' : 'Tolak usulan jadwal', o.kodeMapel + ' ' + o.hari + ' ' + o.slot, 'OK');
    return { sukses: true };
  }
  throw new Error('Usulan tidak ditemukan.');
}



// ============================================================================
// NILAI & ASESMEN TH.E-COURSE (Tahap 4, migrasi SIM SETARA)
// Nilai akhir per mapel = bobot x (rata-rata Diskusi, UTS, UAS). UTS/UAS diambil dari
// ujian online TH.E-Course (nilai terbaik) atau input manual tutor (ujian kertas; manual
// menggantikan online bila diisi). Syarat ujian: kehadiran gabungan (absensi TH.E-Course + tatap muka) >= syaratHadir %
// per mapel pada semester berjalan; bila kurang, ujian diblokir kecuali ada dispensasi KS.
// Tab (database simSs_): NILAI, ASESMEN, PRESENSI ASESMEN (sudah ada di SIM SETARA),
// DISPENSASI UJIAN (baru).
// ============================================================================
var NIL = {
  PROP: 'TH_NILAI_ATURAN',
  BAWAAN: { bobot: { diskusi: 40, uts: 30, uas: 30 }, kkm: 70, syaratHadir: 80, blokir: true, predikatA: 90, predikatB: 80 },
  TAB_NILAI: 'NILAI', TAB_AS: 'ASESMEN', TAB_PA: 'PRESENSI ASESMEN', TAB_DIS: 'DISPENSASI UJIAN',
  HDR_NILAI: ['ID NILAI', 'TANGGAL', 'ROMBEL', 'MAPEL', 'JENIS ASESMEN', 'WARGA BELAJAR', 'NILAI', 'KETERANGAN', 'TUTOR', 'TAHUN PELAJARAN', 'SEMESTER', 'DICATAT OLEH'],
  HDR_AS: ['ID ASESMEN', 'JENIS ASESMEN', 'TANGGAL', 'JAM MULAI', 'JAM SELESAI', 'MAPEL', 'PAKET', 'ROMBEL', 'RUANG', 'PENGAWAS', 'CATATAN', 'DIBUAT OLEH', 'DIBUAT PADA'],
  HDR_PA: ['ID PRESENSI', 'ASESMEN', 'WARGA BELAJAR', 'JAM', 'KETERANGAN', 'LAMPIRAN', 'DICATAT OLEH', 'DICATAT PADA'],
  HDR_DIS: ['ID', 'WARGA BELAJAR', 'NAMA WB', 'ROMBEL', 'MAPEL', 'JENIS', 'TAHUN PELAJARAN', 'SEMESTER', 'ALASAN', 'AKTIF', 'DIBERI OLEH', 'DIBERI PADA'],
  JENIS: ['UTS', 'UAS'],
  JENIS_AS: ['UTS', 'UAS', 'Ujian Kesetaraan', 'Lainnya']
};

// ---------- aturan & periode ----------
function nilAturan_() {
  var a = JSON.parse(JSON.stringify(NIL.BAWAAN));
  try {
    var s = JSON.parse(PropertiesService.getScriptProperties().getProperty(NIL.PROP) || '{}');
    Object.keys(s).forEach(function(k) {
      if (k === 'bobot' && s.bobot) Object.keys(s.bobot).forEach(function(b) { a.bobot[b] = Number(s.bobot[b]) || 0; });
      else a[k] = s[k];
    });
  } catch (e) {}
  return a;
}
function waStafNilaiAturan(token) {
  var p = stafDariToken_(token);
  return { aturan: nilAturan_(), periode: nilPeriode_(), admin: absPeran_(p).admin };
}
function waAdminNilaiAturanSimpan(token, d) {
  var p = stafDariToken_(token);
  if (!absPeran_(p).admin) throw new Error('Hanya admin yang dapat mengubah aturan nilai.');
  d = d || {};
  var b = d.bobot || {}, bobot = { diskusi: Math.max(0, Number(b.diskusi) || 0), uts: Math.max(0, Number(b.uts) || 0), uas: Math.max(0, Number(b.uas) || 0) };
  if (bobot.diskusi + bobot.uts + bobot.uas <= 0) throw new Error('Isi minimal satu bobot.');
  var a = {
    bobot: bobot,
    kkm: Math.min(100, Math.max(0, Number(d.kkm) || 0)),
    syaratHadir: Math.min(100, Math.max(0, Number(d.syaratHadir) || 0)),
    blokir: d.blokir !== false,
    predikatA: Math.min(100, Math.max(0, Number(d.predikatA) || 90)),
    predikatB: Math.min(100, Math.max(0, Number(d.predikatB) || 80))
  };
  PropertiesService.getScriptProperties().setProperty(NIL.PROP, JSON.stringify(a));
  catat_(p.peran, '-', p.nama, 'Aturan nilai', JSON.stringify(a), 'OK');
  return { sukses: true, aturan: nilAturan_() };
}
// q: {tahun:'2026/2027', semester:'Ganjil'|'Genap'} opsional; bawaan = PENGATURAN SIM SETARA.
function nilPeriode_(q) {
  q = q || {};
  var sim = absSim_();
  var tp = String(q.tahun || sim.tahun || '').trim();
  var sm = /genap/i.test(String(q.semester || sim.semester || '')) ? 'Genap' : 'Ganjil';
  var m = /(\d{4})\s*\/\s*(\d{4})/.exec(tp), y1, y2;
  if (m) { y1 = Number(m[1]); y2 = Number(m[2]); }
  else {
    var h = absHariIni_(), y = Number(h.slice(0, 4)), mo = Number(h.slice(5, 7));
    y1 = mo >= 7 ? y : y - 1; y2 = y1 + 1; tp = y1 + '/' + y2;
  }
  return sm === 'Ganjil' ? { tahun: tp, semester: sm, smt: 1, dari: y1 + '-07-01', sampai: y1 + '-12-31' }
                         : { tahun: tp, semester: sm, smt: 2, dari: y2 + '-01-01', sampai: y2 + '-06-30' };
}
function nilLembaga_() {
  var out = { nama: '', npsn: '', alamat: '', kepala: '' };
  var sh = simTab_('PENGATURAN');
  if (!sh || sh.getLastRow() < 2) return out;
  var d = sh.getRange(1, 1, 2, sh.getLastColumn()).getDisplayValues(), h = {};
  d[0].forEach(function(x, i) { h[String(x).trim().toUpperCase()] = i; });
  var g = function(n) { return h[n] === undefined ? '' : String(d[1][h[n]] || '').trim(); };
  out.nama = g('NAMA LEMBAGA'); out.npsn = g('NPSN'); out.alamat = g('ALAMAT'); out.kepala = g('KEPALA PKBM');
  return out;
}

// ---------- peran ----------
function nilPeran_(p) {
  var q = absPeran_(p);
  return {
    q: q, admin: q.admin, tutor: q.tutor,
    lihatSemua: q.admin || q.ks || q.koord || q.sa,
    input: q.admin || q.ks || q.tutor,
    dispensasi: q.ks,
    kelolaAs: q.admin || q.ks,
    presensi: q.admin || q.ks || q.fo || q.tutor,
    kartu: q.admin || q.ks || q.fo || q.sa
  };
}
function nilKelasBoleh_(p) {
  var r = nilPeran_(p);
  if (r.lihatSemua || r.q.fo) {
    // v1.77.0: hanya kelas Data Induk (ENROLL MAPEL); tidak lagi ditambah mapel aktif e-learning
    var a = absKelas_('').slice();
    a.sort(function(x, y) { return (x.namaRombel + '|' + x.namaMapel).localeCompare(y.namaRombel + '|' + y.namaMapel); });
    return a;
  }
  // v1.73.0: nilai hanya oleh Tutor Online (pengampu); kelas yang hanya dijadwalkan tatap muka tidak termasuk
  if (r.tutor) { var s = absTutorSaya_(p); return s ? absKelas_(s.id).filter(function(k) { return !k.tatapMuka; }) : []; }
  throw new Error('Peran Anda tidak dapat melihat nilai.');
}

// ---------- pemetaan ke e-Learning (Belajar Mandiri) ----------
// kelas: { 'idRombelSim|kodeMapel': [{idMapel, idRombel}] } (ID e-Learning)
function nilPetaBm_() {
  var rb = absBaca_('ROMBEL'), mp = absBaca_('MAPEL');
  var rombelNama = {}, mapelNama = {}, mapelKode = {};
  for (var i = 1; i < rb.v.length; i++) {
    var id = sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim();
    if (id) rombelNama[absNormNama_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL'))] = id;
  }
  for (var j = 1; j < mp.v.length; j++) {
    var k = sTeks_(absNilai_(mp, mp.v[j], 'KODE MAPEL')).trim();
    if (!k) continue;
    mapelNama[absNormNama_(absNilai_(mp, mp.v[j], 'NAMA MAPEL'))] = k;
    mapelKode[k.toLowerCase()] = k;
  }
  var out = { kelas: {}, rombel: {}, aktif: {} };
  mapelAktifSemua_(true).forEach(function(m) {
    var r = rombelNama[absNormNama_(m.namaRombel)];
    if (!r) return;
    var kurung = /\(([^)]+)\)/.exec(m.namaMapel || '');
    var km = mapelNama[absNormNama_(m.namaMapel)] || (kurung ? mapelKode[String(kurung[1]).trim().toLowerCase()] : '');
    if (!km) return;
    var key = r + '|' + km;
    var akt = m.statusMapel === 'Aktif';
    (out.kelas[key] = out.kelas[key] || []).push({ idMapel: m.idMapel, idRombel: m.idRombel, aktif: akt });
    if (akt) out.aktif[key] = true;
    (out.rombel[r] = out.rombel[r] || {})[m.idRombel] = true;
  });
  return out;
}
// Kelas yang terhubung ke e-Learning hanya dipakai bila mapelnya Aktif di e-Learning.
function nilSaringAktif_(kelas, peta) {
  return kelas.filter(function(k) { var key = k.idRombel + '|' + k.kodeMapel; return !peta.kelas[key] || peta.aktif[key]; });
}
function nilSiswaBm_() {
  var v = getSheetData(CONFIG.SHEETS.SISWA), out = {};
  if (!v.length) return out;
  var hd = v[0].map(function(x) { return String(x).trim(); });
  var iR = hd.indexOf('ID Rombel'), iN = hd.indexOf('Nama Siswa'), iS = hd.indexOf('NISN');
  for (var i = 1; i < v.length; i++) {
    var r = sTeks_(v[i][iR]).trim(), n = sTeks_(v[i][iN]).trim();
    if (!r || !n) continue;
    (out[r] = out[r] || []).push({ idRombel: r, nama: n, nisn: iS >= 0 ? sTeks_(v[i][iS]).trim() : '' });
  }
  return out;
}
function nilCocokBm_(wb, daftar) {
  var nn = normNama_(wb.nama), hasil = null;
  for (var i = 0; i < daftar.length; i++) {
    if (wb.nisn && daftar[i].nisn && daftar[i].nisn === wb.nisn) return daftar[i];
    if (!hasil && normNama_(daftar[i].nama) === nn) hasil = daftar[i];
  }
  return hasil;
}
function nilCocokWb_(wbs, nisn, nama) {
  var nn = normNama_(nama), hasil = null;
  for (var i = 0; i < wbs.length; i++) {
    if (nisn && wbs[i].nisn && wbs[i].nisn === nisn) return wbs[i];
    if (!hasil && normNama_(wbs[i].nama) === nn) hasil = wbs[i];
  }
  return hasil;
}

// ---------- kehadiran & dispensasi ----------
// ---------- v1.38.4: KEHADIRAN GABUNGAN ----------
// Persen hadir = (hadir absensi TH.E-Course + hadir tatap muka) / (sesi TH.E-Course + pertemuan tatap muka).
// - TH.E-Course: sesi mingguan yang wajib absensi (bukan UTS/UAS) pada semester itu yang SUDAH BERAKHIR;
//   sesi yang sedang berjalan ikut dihitung bila siswa sudah absen (agar absen minggu ini langsung terlihat).
// - Tatap muka (SESI BELAJAR/PRESENSI WB) menambah pembilang & pembagi bila ada; bila tidak ada,
//   pembagi hanya dari TH.E-Course. Data online hanya ada untuk tahun ajaran berjalan (tahun lama diarsipkan).
var HDR_MEMO_ = {};
function hdrOnline_(per) {
  var mk = per.tahun + '|' + per.semester;
  if (HDR_MEMO_[mk]) return HDR_MEMO_[mk];
  var out = { aktif: false, lewat: 0, wajibLewat: {}, wajibMulai: {}, hadir: {} };
  try {
    var cfg = taBaca_(), now = new Date().getTime(), smt = per.smt;
    if (String(cfg.label || '').trim() === String(per.tahun).trim() && smt >= 1 && smt <= cfg.jumlahSemester) {
      // Pembagi = SELURUH sesi wajib absensi yang sudah berakhir sejak Sesi 1. Sesi yang terlewat diisi siswa
      // lewat fitur Buka Susulan Massal (absensi yang diisi saat susulan ikut terhitung).
      var semua = abBaca_(null);
      out.aktif = true;
      for (var n = 1; n <= cfg.sesiPerSemester; n++) {
        if (!abSesiWajib_(cfg, smt, n)) continue;
        var info = taInfo_(cfg, smt, n, now), kk = smt + '|' + n;
        if (info.status === 'lewat') { out.wajibLewat[kk] = true; out.lewat++; }
        else if (info.status === 'berjalan') out.wajibMulai[kk] = true;
      }
      semua.forEach(function(r) {
        var kk = r.smt + '|' + r.n;
        if (r.smt !== smt || (!out.wajibLewat[kk] && !out.wajibMulai[kk])) return;
        var key = r.idMapel + '|' + r.kunciNama;
        (out.hadir[key] = out.hadir[key] || {})[kk] = true;
      });
    }
  } catch (e) { out = { aktif: false, lewat: 0, wajibLewat: {}, wajibMulai: {}, hadir: {} }; }
  HDR_MEMO_[mk] = out;
  return out;
}
// bm: mapel e-learning [{idMapel, idRombel}] milik kelas ini; nama: nama siswa di e-learning ('' = tidak terhubung).
function hdrGabung_(on, tmHadir, tmTotal, bm, nama) {
  var oh = 0, ot = 0;
  if (on && on.aktif && nama && bm && bm.length) {
    var set = {}, nn = normNama_(nama);
    bm.forEach(function(b) { var x = on.hadir[b.idMapel + '|' + nn]; if (x) Object.keys(x).forEach(function(k) { set[k] = true; }); });
    ot = on.lewat;
    Object.keys(set).forEach(function(k) { oh++; if (!on.wajibLewat[k]) ot++; });
  }
  var h = oh + (tmHadir || 0), t = ot + (tmTotal || 0);
  return { hadir: h, total: t, persen: t ? nilBulat_(h * 100 / t) : null, online: { hadir: oh, total: ot }, tatapMuka: { hadir: tmHadir || 0, total: tmTotal || 0 } };
}

// Indeks tatap muka per periode (dibaca sekali per eksekusi): total pertemuan per kelas & hadir per WB|kelas.
function hdrTatapMuka_(per) {
  var mk = 'tm|' + per.tahun + '|' + per.semester;
  if (HDR_MEMO_[mk]) return HDR_MEMO_[mk];
  var ts = absBaca_('SESI BELAJAR'), sesi = {}, total = {}, hadir = {}, perKey = {}, rec = {};
  for (var i = 1; i < ts.v.length; i++) {
    var r = ts.v[i], tg = absTgl_(absNilai_(ts, r, 'TANGGAL'));
    if (tg < per.dari || tg > per.sampai) continue;
    var key = sTeks_(absNilai_(ts, r, 'ROMBEL')).trim() + '|' + sTeks_(absNilai_(ts, r, 'MAPEL')).trim();
    var idS = sTeks_(absNilai_(ts, r, 'ID SESI')).trim();
    sesi[idS] = key;
    total[key] = (total[key] || 0) + 1;
    (perKey[key] = perKey[key] || []).push({ id: idS, unit: sTeks_(absNilai_(ts, r, 'UNIT')).trim() });   // v1.62.0
  }
  var tp = absBaca_('PRESENSI WB');
  for (var j = 1; j < tp.v.length; j++) {
    var w = tp.v[j], idJ = sTeks_(absNilai_(tp, w, 'JADWAL')).trim(), kk = sesi[idJ];
    if (!kk) continue;
    var idW = sTeks_(absNilai_(tp, w, 'WARGA BELAJAR')).trim();
    rec[idW + '|' + idJ] = true;
    if ((sTeks_(absNilai_(tp, w, 'STATUS')).trim() || 'Hadir') !== 'Hadir') continue;
    var hk = idW + '|' + kk;
    hadir[hk] = (hadir[hk] || 0) + 1;
  }
  return (HDR_MEMO_[mk] = { total: total, hadir: hadir, perKey: perKey, rec: rec });
}
function hdrPetaBm_() { return HDR_MEMO_.peta || (HDR_MEMO_.peta = nilPetaBm_()); }
function hdrSiswaBm_() { return HDR_MEMO_.siswa || (HDR_MEMO_.siswa = nilSiswaBm_()); }

function nilHadirKelas_(per, key) {
  var tm = hdrTatapMuka_(per), total = tm.total[key] || 0, hadir = {};
  Object.keys(tm.hadir).forEach(function(hk) {
    var i = hk.indexOf('|');
    if (hk.slice(i + 1) === key) hadir[hk.slice(0, i)] = tm.hadir[hk];
  });
  // total/hadir = tatap muka saja (lama). gabung(idWb) = kehadiran gabungan TH.E-Course + tatap muka (dipakai untuk syarat).
  var siap = null;
  var gabung = function(idWb) {
    if (!siap) {
      var peta = hdrPetaBm_(), bm = peta.kelas[key] || [], sb = hdrSiswaBm_(), siswa = [], wbs = {};
      bm.forEach(function(b) { (sb[b.idRombel] || []).forEach(function(s) { siswa.push(s); }); });
      absWbRombel_(String(key).split('|')[0]).forEach(function(w) { wbs[w.id] = w; });
      siap = { bm: bm, siswa: siswa, wbs: wbs, on: hdrOnline_(per) };
    }
    var w = siap.wbs[String(idWb)], c = w ? nilCocokBm_(w, siap.siswa) : null;
    var bmKu = c ? siap.bm.filter(function(b) { return b.idRombel === c.idRombel; }) : [];
    var tmW = typeof ubTmWb_ === 'function' ? ubTmWb_(tm.perKey, tm.rec, key, idWb, hadir[idWb] || 0, total) : { h: hadir[idWb] || 0, t: total };   // v1.62.0
    return hdrGabung_(siap.on, tmW.h, tmW.t, bmKu, c ? c.nama : '');
  };
  return { total: total, hadir: hadir, gabung: gabung };
}
function nilDisBaca_(per) {
  var t = absBaca_(NIL.TAB_DIS, NIL.HDR_DIS), out = [];
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (!absBenar_(absNilai_(t, r, 'AKTIF'))) continue;
    if (sTeks_(absNilai_(t, r, 'TAHUN PELAJARAN')).trim() !== per.tahun || sTeks_(absNilai_(t, r, 'SEMESTER')).trim() !== per.semester) continue;
    out.push({
      id: sTeks_(absNilai_(t, r, 'ID')).trim(), idWb: sTeks_(absNilai_(t, r, 'WARGA BELAJAR')).trim(), nama: sTeks_(absNilai_(t, r, 'NAMA WB')).trim(),
      idRombel: sTeks_(absNilai_(t, r, 'ROMBEL')).trim(), kodeMapel: sTeks_(absNilai_(t, r, 'MAPEL')).trim() || '*', jenis: sTeks_(absNilai_(t, r, 'JENIS')).trim() || '*',
      alasan: sTeks_(absNilai_(t, r, 'ALASAN')), oleh: sTeks_(absNilai_(t, r, 'DIBERI OLEH')), pada: sTeks_(absNilai_(t, r, 'DIBERI PADA'))
    });
  }
  return out;
}
// jenis '' = dispensasi apa pun untuk mapel itu
function nilDisCari_(daftar, idWb, idRombel, kodeMapel, jenis) {
  for (var i = 0; i < daftar.length; i++) {
    var d = daftar[i];
    if (d.idWb !== idWb || d.idRombel !== idRombel) continue;
    if (d.kodeMapel !== '*' && d.kodeMapel !== kodeMapel) continue;
    if (jenis && d.jenis !== '*' && d.jenis !== jenis) continue;
    return d;
  }
  return null;
}

// ---------- konteks perhitungan (sekali baca semua tabel) ----------
function nilKtx_(per) {
  var k = { per: per, at: nilAturan_(), sesi: {}, totalSesi: {}, hadir: {}, rekapHadir: {}, manual: {}, disk: {}, ujian: {}, hasil: {}, wb: {}, perKey: {}, rec: {} };
  var ts = absBaca_('SESI BELAJAR');
  for (var i = 1; i < ts.v.length; i++) {
    var r = ts.v[i], tg = absTgl_(absNilai_(ts, r, 'TANGGAL'));
    if (tg < per.dari || tg > per.sampai) continue;
    var key = sTeks_(absNilai_(ts, r, 'ROMBEL')).trim() + '|' + sTeks_(absNilai_(ts, r, 'MAPEL')).trim();
    var idSk = sTeks_(absNilai_(ts, r, 'ID SESI')).trim();
    k.sesi[idSk] = key;
    k.totalSesi[key] = (k.totalSesi[key] || 0) + 1;
    (k.perKey[key] = k.perKey[key] || []).push({ id: idSk, unit: sTeks_(absNilai_(ts, r, 'UNIT')).trim() });   // v1.62.0
  }
  var tp = absBaca_('PRESENSI WB');
  for (var j = 1; j < tp.v.length; j++) {
    var w = tp.v[j], kk = k.sesi[sTeks_(absNilai_(tp, w, 'JADWAL')).trim()];
    if (!kk) continue;
    var idW = sTeks_(absNilai_(tp, w, 'WARGA BELAJAR')).trim(), st = sTeks_(absNilai_(tp, w, 'STATUS')).trim() || 'Hadir';
    k.rec[idW + '|' + sTeks_(absNilai_(tp, w, 'JADWAL')).trim()] = true;
    if (st === 'Hadir') k.hadir[idW + '|' + kk] = (k.hadir[idW + '|' + kk] || 0) + 1;
    var y = k.rekapHadir[idW] || (k.rekapHadir[idW] = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 });
    y[st] = (y[st] || 0) + 1;
  }
  // v1.40.0: rekap kehadiran offline (hardcopy) / dibekukan saat arsip menggantikan rekap bila ada
  k.hadirOffline = {};
  try { var oh = oflHadir_(per); Object.keys(oh).forEach(function(id) { k.rekapHadir[id] = oh[id]; k.hadirOffline[id] = oh[id]; }); } catch (eOh) {}
  k.dis = nilDisBaca_(per);
  var tn = absBaca_(NIL.TAB_NILAI, NIL.HDR_NILAI);
  for (var n = 1; n < tn.v.length; n++) {
    var x = tn.v[n];
    if (sTeks_(absNilai_(tn, x, 'TAHUN PELAJARAN')).trim() !== per.tahun || sTeks_(absNilai_(tn, x, 'SEMESTER')).trim() !== per.semester) continue;
    var nv = sTeks_(absNilai_(tn, x, 'NILAI')).trim();
    var kunci = [sTeks_(absNilai_(tn, x, 'WARGA BELAJAR')).trim(), sTeks_(absNilai_(tn, x, 'ROMBEL')).trim(), sTeks_(absNilai_(tn, x, 'MAPEL')).trim(), sTeks_(absNilai_(tn, x, 'JENIS ASESMEN')).trim()].join('|');
    if (nv === '') { delete k.manual[kunci]; continue; }
    k.manual[kunci] = { nilai: Number(nv.replace(',', '.')) || 0, ket: sTeks_(absNilai_(tn, x, 'KETERANGAN')), oleh: sTeks_(absNilai_(tn, x, 'DICATAT OLEH')) };
  }
  k.peta = nilPetaBm_();
  k.siswaBm = nilSiswaBm_();
  var v = getSheetData(CONFIG.SHEETS.JAWABAN);
  if (v.length) {
    var hd = v[0].map(function(z) { return String(z).trim(); });
    var iM = hd.indexOf('ID Mapel'), iJ = hd.indexOf('Jenis'), iS = hd.indexOf('Nama Siswa'), iN = hd.indexOf('Nilai'), iW = hd.indexOf('Waktu Kirim');
    for (var a = 1; a < v.length; a++) {
      if (sTeks_(v[a][iJ]).trim() !== 'Diskusi') continue;
      var nil = sTeks_(v[a][iN]).trim();
      if (nil === '' || isNaN(Number(nil.replace(',', '.')))) continue;
      var tgl = absTgl_(v[a][iW]);
      if (tgl && (tgl < per.dari || tgl > per.sampai)) continue;
      var dk = sTeks_(v[a][iM]).trim() + '|' + normNama_(v[a][iS]);
      var o = k.disk[dk] || (k.disk[dk] = { sum: 0, jml: 0 });
      o.sum += Number(nil.replace(',', '.')); o.jml++;
    }
  }
  ujJadwalSemua_().forEach(function(jj) { if (jj.smt === per.smt && jj.idUjian) k.ujian[jj.idMapel + '|' + jj.jenis] = jj.idUjian; });
  ujBaca_('HASIL').forEach(function(h) {
    var hk = h['ID Ujian'] + '|' + h['ID Rombel'] + '|' + normNama_(h['Nama Siswa']), ps = parseFloat(h['Persen']) || 0;
    if (k.hasil[hk] === undefined || ps > k.hasil[hk]) k.hasil[hk] = ps;
  });
  return k;
}
function nilWbRombelK_(k, idRombel) { return k.wb[idRombel] || (k.wb[idRombel] = absWbRombel_(idRombel)); }
function nilBulat_(x) { return Math.round(x * 10) / 10; }
function nilPredikat_(at, n) {
  if (n === null || n === undefined) return '';
  if (n >= at.predikatA) return 'A';
  if (n >= at.predikatB) return 'B';
  if (n >= at.kkm) return 'C';
  return 'D';
}
function nilAkhir_(at, diskusi, uts, uas) {
  var b = at.bobot, parts = [[b.diskusi, diskusi], [b.uts, uts], [b.uas, uas]], tw = 0, s = 0, lengkap = true, ada = false, wAda = 0;
  parts.forEach(function(x) {
    var w = Number(x[0]) || 0;
    if (!w) return;
    tw += w;
    if (x[1] === null || x[1] === undefined) { lengkap = false; return; }
    ada = true; wAda += w; s += w * x[1];
  });
  if (!tw || !ada) return { akhir: null, predikat: '', lengkap: false, tuntas: false };
  var akhir = Math.round(s / wAda); // sementara: dihitung dari komponen yang sudah ada
  return { akhir: akhir, predikat: nilPredikat_(at, akhir), lengkap: lengkap, tuntas: akhir >= at.kkm };
}
function nilRekapKelas_(k, kelas) {
  var key = kelas.idRombel + '|' + kelas.kodeMapel, bm = k.peta.kelas[key] || [], total = k.totalSesi[key] || 0;
  var siswaBm = [];
  bm.forEach(function(b) { (k.siswaBm[b.idRombel] || []).forEach(function(s) { siswaBm.push(s); }); });
  return nilWbRombelK_(k, kelas.idRombel).map(function(w) {
    var c = nilCocokBm_(w, siswaBm), nn = c ? normNama_(c.nama) : '';
    // v1.38.4: kehadiran gabungan TH.E-Course + tatap muka
    var tmK = typeof ubTmWb_ === 'function' ? ubTmWb_(k.perKey, k.rec, key, w.id, k.hadir[w.id + '|' + key] || 0, total) : { h: k.hadir[w.id + '|' + key] || 0, t: total };
    var g = hdrGabung_(hdrOnline_(k.per), tmK.h, tmK.t, c ? bm.filter(function(b) { return b.idRombel === c.idRombel; }) : [], c ? c.nama : '');
    var h = g.hadir, persen = g.persen, totalG = g.total;
    var lolos = !totalG || persen >= k.at.syaratHadir;
    var dis = nilDisCari_(k.dis, w.id, kelas.idRombel, kelas.kodeMapel, '');
    var dsum = 0, djml = 0;
    if (c) bm.forEach(function(b) { var x = k.disk[b.idMapel + '|' + nn]; if (x) { dsum += x.sum; djml += x.jml; } });
    var diskusi = djml ? nilBulat_(dsum / djml) : null;
    // v1.40.0: nilai tugas/diskusi dari data offline (hardcopy) atau dibekukan saat arsip, bila tidak ada nilai online
    var mTugas = k.manual[w.id + '|' + key + '|Tugas'], mAkhir = k.manual[w.id + '|' + key + '|Akhir'];
    if (diskusi === null && mTugas) diskusi = mTugas.nilai;
    var komp = {};
    NIL.JENIS.forEach(function(jn) {
      var on = null;
      if (c) bm.forEach(function(b) {
        var idU = k.ujian[b.idMapel + '|' + jn];
        if (!idU) return;
        var val = k.hasil[idU + '|' + b.idRombel + '|' + nn];
        if (val !== undefined && (on === null || val > on)) on = nilBulat_(val);
      });
      var man = k.manual[w.id + '|' + key + '|' + jn];
      var bolehJ = lolos || !!nilDisCari_(k.dis, w.id, kelas.idRombel, kelas.kodeMapel, jn) || !k.at.blokir;
      komp[jn] = { online: on, manual: man ? man.nilai : null, nilai: man ? man.nilai : on, ket: man ? man.ket : '', boleh: bolehJ };
    });
    var ak = nilAkhir_(k.at, diskusi, komp.UTS.nilai, komp.UAS.nilai);
    // v1.40.0: nilai akhir rapor dari hardcopy (bila hanya nilai akhir yang tersedia) menggantikan hitungan komponen
    if (mAkhir) ak = { akhir: Math.round(mAkhir.nilai), predikat: nilPredikat_(k.at, Math.round(mAkhir.nilai)), lengkap: true, tuntas: Math.round(mAkhir.nilai) >= k.at.kkm };
    var offline = [mTugas, mAkhir, k.manual[w.id + '|' + key + '|UTS'], k.manual[w.id + '|' + key + '|UAS']].some(function(m) { return m && /offline/i.test(String(m.ket || '')); });
    return {
      akhirManual: !!mAkhir, offline: offline,
      idWb: w.id, nisn: w.nisn, nama: w.nama, terhubung: !!c,
      hadir: h, totalSesi: totalG, persen: persen, hadirOnline: g.online, hadirTatapMuka: g.tatapMuka,
      syarat: lolos ? (totalG ? 'Memenuhi' : 'Belum ada sesi') : (dis ? 'Dispensasi' : 'Kurang'),
      bolehUjian: lolos || !!dis || !k.at.blokir,
      dispensasi: dis ? { id: dis.id, alasan: dis.alasan, oleh: dis.oleh, jenis: dis.jenis } : null,
      diskusi: diskusi, jmlDiskusi: djml, uts: komp.UTS, uas: komp.UAS,
      akhir: ak.akhir, predikat: ak.predikat, lengkap: ak.lengkap, tuntas: ak.tuntas
    };
  });
}

// ---------- API nilai ----------
// ---------- wali kelas (kolom TUTOR tabel ROMBEL) ----------
function nilWaliPeta_() {
  var rb = absBaca_('ROMBEL'), out = {};
  for (var i = 1; i < rb.v.length; i++) {
    var id = sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim(), tt = sTeks_(absNilai_(rb, rb.v[i], 'TUTOR')).trim();
    if (id && tt) out[id] = tt;
  }
  return out;
}
// Rapor (semua mapel satu rombel): Wali Kelas rombel itu, Kepala Sekolah, Admin.
function nilAksesRapor_(p, idRombel) {
  var r = nilPeran_(p);
  if (r.admin || r.q.ks) return true;
  if (!r.tutor) return false;
  var s = absTutorSaya_(p);
  return !!(s && nilWaliPeta_()[String(idRombel)] === s.id);
}
function nilWajibNilai_(r) {
  if (!(r.admin || r.q.ks || r.tutor)) throw new Error('Nilai hanya dapat dibuka tutor pengampu, Kepala Sekolah atau Admin.');
}
function waStafWaliDaftar(token) {
  var p = stafDariToken_(token), r = nilPeran_(p);
  if (!(r.admin || r.q.ks)) throw new Error('Wali kelas diatur oleh Admin atau Kepala Sekolah.');
  var wali = nilWaliPeta_(), pt = absPetaTutor_(), ada = {}, rombel = [];
  absKelas_('').forEach(function(k) {
    if (ada[k.idRombel]) return;
    ada[k.idRombel] = true;
    var w = wali[k.idRombel] || '';
    rombel.push({ id: k.idRombel, nama: k.namaRombel, program: k.program, idWali: w, namaWali: w && pt[w] ? pt[w].nama : '' });
  });
  rombel.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  var tutor = Object.keys(pt).map(function(k) { return pt[k]; }).filter(function(x) { return x.aktif; }).sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  return { rombel: rombel, tutor: tutor };
}
function waStafWaliSimpan(token, idRombel, idTutor) {
  var p = stafDariToken_(token), r = nilPeran_(p);
  if (!(r.admin || r.q.ks)) throw new Error('Wali kelas diatur oleh Admin atau Kepala Sekolah.');
  idTutor = String(idTutor || '').trim();
  var pt = absPetaTutor_();
  if (idTutor && !pt[idTutor]) throw new Error('Tutor tidak ditemukan.');
  var rb = absBaca_('ROMBEL'), c = absCol_(rb, 'TUTOR');
  if (c < 0) throw new Error('Kolom TUTOR tidak ada di tabel ROMBEL.');
  for (var i = 1; i < rb.v.length; i++) {
    if (sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim() !== String(idRombel)) continue;
    rb.sh.getRange(i + 1, c + 1).setValue(idTutor);
    catat_(p.peran, String(idRombel), p.nama, 'Wali kelas', sTeks_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL')) + ' = ' + (idTutor ? pt[idTutor].nama : '(kosong)'), 'OK');
    return { sukses: true };
  }
  throw new Error('Rombel tidak ditemukan.');
}

function waStafNilaiKelas(token) {
  var p = stafDariToken_(token), r = nilPeran_(p);
  nilWajibNilai_(r);
  var kelas = nilKelasBoleh_(p);   // v1.77.0: tanpa saringan status e-learning
  var wali = nilWaliPeta_(), saya = r.tutor ? absTutorSaya_(p) : null, ada = {}, rombelRapor = [];
  (r.tutor ? absKelas_('') : kelas).forEach(function(k) {
    if (ada[k.idRombel]) return;
    if (!(r.admin || r.q.ks || (saya && wali[k.idRombel] === saya.id))) return;
    ada[k.idRombel] = true;
    rombelRapor.push({ id: k.idRombel, nama: k.namaRombel, program: k.program });
  });
  rombelRapor.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  return {
    kelas: kelas, rombelRapor: rombelRapor, periode: nilPeriode_(), aturan: nilAturan_(),
    peran: { input: r.input, dispensasi: r.dispensasi, lihatSemua: r.lihatSemua, kelolaAs: r.kelolaAs, presensi: r.presensi, kartu: r.kartu, admin: r.admin, tutor: r.tutor }
  };
}
// q: {idRombel, kodeMapel, tahun?, semester?}
function waStafNilaiRekap(token, q) {
  var p = stafDariToken_(token), r = nilPeran_(p);
  q = q || {};
  nilWajibNilai_(r);
  var kelas = absKelasCek_(nilKelasBoleh_(p), q.idRombel, q.kodeMapel);
  if (!kelas) throw new Error('Kelas tidak ditemukan atau bukan kelas Anda.');
  var per = nilPeriode_(q), k = nilKtx_(per);
  var dis = k.dis.filter(function(d) { return d.idRombel === kelas.idRombel && (d.kodeMapel === '*' || d.kodeMapel === kelas.kodeMapel); });
  var wbRekap = nilRekapKelas_(k, kelas);
  // v1.66.0: tutor unit hanya melihat & menilai siswa unit pemetaannya
  var kunciU = typeof ubKunciTutorKelas_ === 'function' ? ubKunciTutorKelas_(p, kelas) : '';
  if (kunciU) {
    var bolehWb = {};
    ubWbNilai_(p, kelas, absWbRombel_(kelas.idRombel)).forEach(function(w) { bolehWb[w.id] = true; });
    wbRekap = wbRekap.filter(function(w) { return bolehWb[w.idWb]; });
  }
  // v1.73.0: leger per unit. Tutor: unit penugasannya, atas namanya. Staf: pilih unit (q.unit) -> Tutor Online unit itu.
  var unitPil = [], namaUnit = '';
  try {
    var key = kelas.idRombel + '|' + kelas.kodeMapel, pu = ubPetaUnit_();
    kelas = JSON.parse(JSON.stringify(kelas));
    if (r.tutor) {
      kelas.namaTutor = p.nama;
      namaUnit = kunciU ? ubNamaKunci_(kunciU) : '';
    } else {
      var ur = (typeof pgoUnitRombel_ === 'function' ? pgoUnitRombel_() : {})[kelas.idRombel] || {};
      unitPil = Object.keys(ur).filter(function(u) { return pu[u]; }).map(function(u) { return { id: u, nama: pu[u].nama }; });
      if (q.unit && pu[q.unit]) {
        var lab = ubPetaSiswa_(), utama = ubUtama_();
        var dlm = {};
        absWbRombel_(kelas.idRombel).forEach(function(w) { var l = lab[w.id]; if (((l && l.unit) || utama) === q.unit) dlm[w.id] = true; });
        wbRekap = wbRekap.filter(function(w) { return dlm[w.idWb]; });
        namaUnit = pu[q.unit].nama;
        var tu = typeof pgoTutorUnit_ === 'function' ? pgoTutorUnit_(key, q.unit) : '';
        var ptU = absPetaTutor_();
        if (tu) kelas.namaTutor = ptU[tu] ? ptU[tu].nama : tu;
      }
    }
  } catch (eU) {}
  return {
    kelas: kelas, periode: per, aturan: k.at, wb: wbRekap, dispensasi: dis, unitPilihan: unitPil, namaUnit: namaUnit,
    terhubungElearning: (k.peta.kelas[kelas.idRombel + '|' + kelas.kodeMapel] || []).length > 0,
    bolehInput: r.input, bolehDispensasi: r.dispensasi
  };
}
// d: {idRombel, kodeMapel, jenis:'UTS'|'UAS', nilai:[{idWb, nilai ('' = hapus), ket}]}
function waStafNilaiInput(token, d) {
  var p = stafDariToken_(token), r = nilPeran_(p);
  if (!r.input) throw new Error('Peran Anda tidak dapat menginput nilai.');
  d = d || {};
  // v1.38.3: 'Lainnya' (ujian lainnya, lewat unggah xlsx) juga diterima; rapor tetap memakai UTS & UAS.
  if (NIL.JENIS.indexOf(String(d.jenis)) < 0 && String(d.jenis) !== 'Lainnya' && String(d.jenis) !== 'UPK') throw new Error('Jenis nilai harus UTS, UAS, UPK, atau Lainnya.');
  var kelas = absKelasCek_(nilKelasBoleh_(p), d.idRombel, d.kodeMapel);
  if (!kelas) throw new Error('Kelas tidak ditemukan atau bukan kelas Anda.');
  var per = nilPeriode_(), at = nilAturan_(), key = kelas.idRombel + '|' + kelas.kodeMapel;
  var hk = nilHadirKelas_(per, key), dis = nilDisBaca_(per);
  var wbs = {}, luar = {};
  var wbRombel = absWbRombel_(kelas.idRombel), wbBoleh = typeof ubWbNilai_ === 'function' ? ubWbNilai_(p, kelas, wbRombel.slice()) : wbRombel;
  wbBoleh.forEach(function(w) { wbs[w.id] = w; });
  wbRombel.forEach(function(w) { if (!wbs[w.id]) luar[w.id] = w; });   // v1.66.0: siswa unit lain ditolak
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = absBaca_(NIL.TAB_NILAI, NIL.HDR_NILAI), ada = {};
    for (var i = 1; i < t.v.length; i++) {
      var x = t.v[i];
      if (sTeks_(absNilai_(t, x, 'TAHUN PELAJARAN')).trim() !== per.tahun || sTeks_(absNilai_(t, x, 'SEMESTER')).trim() !== per.semester) continue;
      ada[[sTeks_(absNilai_(t, x, 'WARGA BELAJAR')).trim(), sTeks_(absNilai_(t, x, 'ROMBEL')).trim(), sTeks_(absNilai_(t, x, 'MAPEL')).trim(), sTeks_(absNilai_(t, x, 'JENIS ASESMEN')).trim()].join('|')] = i + 1;
    }
    var simpan = 0, ditolak = [], baru = [];
    (d.nilai || []).forEach(function(it) {
      var w = wbs[String(it.idWb || '')];
      if (!w) { if (luar[String(it.idWb || '')]) ditolak.push(luar[String(it.idWb || '')].nama + ' (siswa unit lain)'); return; }
      var s = String(it.nilai === null || it.nilai === undefined ? '' : it.nilai).trim().replace(',', '.');
      if (s !== '') {
        var n = Number(s);
        if (isNaN(n) || n < 0 || n > 100) { ditolak.push(w.nama + ' (nilai tidak sah)'); return; }
        if (at.blokir && d.jenis !== 'Lainnya') {
          var gh = hk.gabung(w.id);   // v1.38.4: kehadiran gabungan TH.E-Course + tatap muka
          if (gh.total && gh.persen < at.syaratHadir && !nilDisCari_(dis, w.id, kelas.idRombel, kelas.kodeMapel, d.jenis)) { ditolak.push(w.nama + ' (kehadiran ' + gh.persen + '%)'); return; }
        }
        s = String(nilBulat_(n));
      }
      var kunci = [w.id, kelas.idRombel, kelas.kodeMapel, d.jenis].join('|');
      var ket = String(it.ket || '').slice(0, 200);
      if (ada[kunci]) {
        var baris = ada[kunci];
        t.sh.getRange(baris, absCol_(t, 'NILAI') + 1).setValue(s);
        t.sh.getRange(baris, absCol_(t, 'KETERANGAN') + 1).setValue(ket);
        t.sh.getRange(baris, absCol_(t, 'TANGGAL') + 1).setValue(absHariIni_());
        t.sh.getRange(baris, absCol_(t, 'DICATAT OLEH') + 1).setValue(p.nama);
        simpan++;
      } else if (s !== '') {
        baru.push(absBaris_(t, {
          'ID NILAI': absId_(), 'TANGGAL': absHariIni_(), 'ROMBEL': kelas.idRombel, 'MAPEL': kelas.kodeMapel, 'JENIS ASESMEN': d.jenis,
          'WARGA BELAJAR': w.id, 'NILAI': s, 'KETERANGAN': ket, 'TUTOR': kelas.idTutor || '', 'TAHUN PELAJARAN': per.tahun, 'SEMESTER': per.semester, 'DICATAT OLEH': p.nama
        }));
        simpan++;
      }
    });
    if (baru.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, baru.length, baru[0].length).setValues(baru);
  } finally { lock.releaseLock(); }
  catat_(p.peran, kelas.idRombel, p.nama, 'Input nilai ' + d.jenis, kelas.namaMapel + ' ' + kelas.namaRombel + ': ' + simpan + ' nilai', 'OK');
  return { sukses: true, tersimpan: simpan, ditolak: ditolak };
}

// ---------- dispensasi (Kepala Sekolah) ----------
// d: {idWb, idRombel, kodeMapel ('' = semua mapel), jenis ('' = UTS & UAS), alasan}
function waStafDispensasiBeri(token, d) {
  var p = stafDariToken_(token);
  if (!nilPeran_(p).dispensasi) throw new Error('Dispensasi ujian hanya dapat diberikan Kepala Sekolah.');
  d = d || {};
  var w = absCariWb_(d.idWb);
  if (!w) throw new Error('Warga belajar tidak ditemukan.');
  var alasan = String(d.alasan || '').trim();
  if (alasan.length < 5) throw new Error('Tulis alasan dispensasi (minimal 5 huruf).');
  var jenis = NIL.JENIS.indexOf(String(d.jenis)) >= 0 ? String(d.jenis) : '*';
  var per = nilPeriode_(), t = absBaca_(NIL.TAB_DIS, NIL.HDR_DIS);
  var id = absId_();
  t.sh.appendRow(absBaris_(t, {
    'ID': id, 'WARGA BELAJAR': w.id, 'NAMA WB': w.nama, 'ROMBEL': String(d.idRombel || w.rombel), 'MAPEL': String(d.kodeMapel || '*'), 'JENIS': jenis,
    'TAHUN PELAJARAN': per.tahun, 'SEMESTER': per.semester, 'ALASAN': alasan.slice(0, 300), 'AKTIF': true, 'DIBERI OLEH': p.nama, 'DIBERI PADA': absWaktu_()
  }));
  catat_(p.peran, String(d.idRombel || w.rombel), p.nama, 'Dispensasi ujian', w.nama + ' ' + (d.kodeMapel || 'semua mapel') + ' ' + jenis + ': ' + alasan, 'OK');
  return { sukses: true, id: id };
}
function waStafDispensasiCabut(token, id) {
  var p = stafDariToken_(token);
  if (!nilPeran_(p).dispensasi) throw new Error('Hanya Kepala Sekolah yang dapat mencabut dispensasi.');
  var t = absBaca_(NIL.TAB_DIS, NIL.HDR_DIS);
  for (var i = 1; i < t.v.length; i++) {
    if (sTeks_(absNilai_(t, t.v[i], 'ID')).trim() !== String(id)) continue;
    t.sh.getRange(i + 1, absCol_(t, 'AKTIF') + 1).setValue(false);
    catat_(p.peran, '-', p.nama, 'Cabut dispensasi', String(id), 'OK');
    return { sukses: true };
  }
  throw new Error('Dispensasi tidak ditemukan.');
}
function waStafDispensasiDaftar(token) {
  var p = stafDariToken_(token), r = nilPeran_(p);
  if (!r.lihatSemua) throw new Error('Peran Anda tidak dapat melihat daftar dispensasi.');
  var per = nilPeriode_(), rombel = honProgramRombel_(), mapel = honNamaMapel_();
  return { periode: per, dispensasi: nilDisBaca_(per).map(function(d) {
    d.namaRombel = rombel[d.idRombel] ? rombel[d.idRombel].nama : d.idRombel;
    d.namaMapel = d.kodeMapel === '*' ? 'Semua mapel' : (mapel[d.kodeMapel] || d.kodeMapel);
    return d;
  }), boleh: r.dispensasi };
}

// ---------- leger & rapor ----------
// v1.37: mapel e-learning berstatus Aktif untuk satu rombel, TANPA syarat punya tutor (untuk leger & rapor).
function absKelasBmAktif_(idRombel) {
  var rb = absBaca_('ROMBEL'), mp = absBaca_('MAPEL');
  var rombelNama = {}, mapelNama = {}, mapelKode = {};
  for (var i = 1; i < rb.v.length; i++) {
    var id = sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim();
    if (id && absBenar_(absNilai_(rb, rb.v[i], 'AKTIF'))) rombelNama[absNormNama_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL'))] = { id: id, nama: sTeks_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL')).trim(), program: sTeks_(absNilai_(rb, rb.v[i], 'PROGRAM')).trim() };
  }
  for (var j = 1; j < mp.v.length; j++) {
    var k = sTeks_(absNilai_(mp, mp.v[j], 'KODE MAPEL')).trim();
    if (!k) continue;
    var nm = sTeks_(absNilai_(mp, mp.v[j], 'NAMA MAPEL')).trim();
    mapelNama[absNormNama_(nm)] = { kode: k, nama: nm };
    mapelKode[k.toLowerCase()] = { kode: k, nama: nm };
  }
  var out = [];
  mapelAktifSemua_().forEach(function(m) {
    var r = rombelNama[absNormNama_(m.namaRombel)];
    if (!r || (idRombel && r.id !== String(idRombel))) return;   // idRombel kosong = semua rombel
    var kurung = /\(([^)]+)\)/.exec(m.namaMapel || '');
    var mm = mapelNama[absNormNama_(m.namaMapel)] || (kurung ? mapelKode[String(kurung[1]).trim().toLowerCase()] : null);
    if (!mm) return;
    out.push({ idRombel: r.id, namaRombel: r.nama, program: r.program, kodeMapel: mm.kode, namaMapel: mm.nama, idTutor: '', namaTutor: m.tutorTeks || '' });
  });
  return out;
}
// Mapel leger/rapor satu rombel: kelas yang sudah dikenal (ENROLL MAPEL + mapel bertutor) ditambah SEMUA mapel
// e-learning berstatus Aktif walau belum punya tutor. Urutan mengikuti tab SIM MAPEL (urutan baku rapor).
function nilKelasRapor_(idRombel) {
  idRombel = String(idRombel || '');
  var kelas = absKelas_('').filter(function(x) { return x.idRombel === idRombel; });
  var ada = {};
  kelas.forEach(function(x) { ada[x.kodeMapel] = true; });   // v1.77.0: hanya mapel ENROLL MAPEL (tanpa mapel aktif e-learning)
  var urut = {};
  try {
    var mp = absBaca_('MAPEL');
    for (var j = 1; j < mp.v.length; j++) { var km = sTeks_(absNilai_(mp, mp.v[j], 'KODE MAPEL')).trim(); if (km && urut[km] === undefined) urut[km] = j; }
  } catch (e2) {}
  kelas.sort(function(a, b) {
    var x = urut[a.kodeMapel] === undefined ? 9999 : urut[a.kodeMapel], y = urut[b.kodeMapel] === undefined ? 9999 : urut[b.kodeMapel];
    return x - y || String(a.namaMapel).localeCompare(String(b.namaMapel));
  });
  return kelas;
}
// q: {idRombel, tahun?, semester?}
function waStafLeger(token, q) {
  var p = stafDariToken_(token), r = nilPeran_(p);
  q = q || {};
  if (!nilAksesRapor_(p, q.idRombel)) throw new Error('Rapor hanya dapat dibuka Wali Kelas rombel ini, Kepala Sekolah atau Admin.');
  // v1.39.2: semester lampau memakai kelas WB pada semester itu (RaporRiwayat.gs); semester mendatang ditolak
  var kiniL = nilPeriode_(), perL = nilPeriode_(q);
  if (nilUrutPer_(perL) > nilUrutPer_(kiniL)) throw new Error('Semester ' + perL.semester + ' ' + perL.tahun + ' belum berjalan.');
  if (nilUrutPer_(perL) < nilUrutPer_(kiniL)) return nilLegerLampau_(String(q.idRombel), perL, kiniL, r.admin);
  return nilLegerKini_(String(q.idRombel), q);
}
// Leger semester berjalan satu rombel (dipakai waStafLeger dan arsip semester).
function nilLegerKini_(idRombel, q) {
  q = q || {};
  var kelas = nilKelasRapor_(idRombel);
  if (!kelas.length) throw new Error('Rombel tidak ditemukan atau belum punya mapel.');
  var per = nilPeriode_(q), k = nilKtx_(per), baris = {};
  if (!kelas.length) throw new Error('Rombel ini belum punya mapel aktif.');   // v1.77.0: tanpa saringan status e-learning
  nilWbRombelK_(k, kelas[0].idRombel).forEach(function(w) { baris[w.id] = { idWb: w.id, nisn: w.nisn, nama: w.nama, nilai: {}, predikat: {}, jumlah: 0, n: 0, belumTuntas: 0, kehadiran: k.rekapHadir[w.id] || { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 } }; });
  kelas.forEach(function(kl) {
    nilRekapKelas_(k, kl).forEach(function(x) {
      var b = baris[x.idWb];
      if (!b) return;
      b.nilai[kl.kodeMapel] = x.akhir; b.predikat[kl.kodeMapel] = x.predikat;
      if (x.akhir !== null) { b.jumlah += x.akhir; b.n++; if (!x.tuntas) b.belumTuntas++; }
    });
  });
  var out = Object.keys(baris).map(function(id) { var b = baris[id]; b.rata = b.n ? nilBulat_(b.jumlah / b.n) : null; return b; });
  var urut = out.filter(function(b) { return b.rata !== null; }).sort(function(a, b2) { return b2.jumlah - a.jumlah; });
  urut.forEach(function(b, i) { b.peringkat = i > 0 && urut[i - 1].jumlah === b.jumlah ? urut[i - 1].peringkat : i + 1; });
  out.sort(function(a, b2) { return a.nama.localeCompare(b2.nama); });
  return {
    rombel: { id: kelas[0].idRombel, nama: kelas[0].namaRombel, program: kelas[0].program }, rombelKini: { id: kelas[0].idRombel, nama: kelas[0].namaRombel }, lampau: false,
    periode: per, periodeKini: nilPeriode_(), aturan: k.at, lembaga: nilLembaga_(),
    wali: (function() { var w = nilWaliPeta_()[kelas[0].idRombel] || '', pt = absPetaTutor_(); return { id: w, nama: w && pt[w] ? pt[w].nama : '' }; })(),
    mapel: kelas.map(function(kl) { return { kode: kl.kodeMapel, nama: kl.namaMapel, tutor: kl.namaTutor }; }), wb: out
  };
}
function nilWbDetail_(idWb) {
  var t = absBaca_('WARGA BELAJAR');
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (sTeks_(absNilai_(t, r, 'ID WB')).trim() !== String(idWb)) continue;
    return {
      id: String(idWb), nisn: sTeks_(absNilai_(t, r, 'NISN')).trim(), nama: sTeks_(absNilai_(t, r, 'NAMA WB')).trim(), jk: sTeks_(absNilai_(t, r, 'JENIS KELAMIN')).trim(),
      tempatLahir: sTeks_(absNilai_(t, r, 'TEMPAT LAHIR')).trim(), tglLahir: absTgl_(absNilai_(t, r, 'TANGGAL LAHIR')), idRombel: sTeks_(absNilai_(t, r, 'ROMBEL')).trim()
    };
  }
  return null;
}
function nilDeskripsi_(nama, pred) {
  var m = { A: 'sangat baik', B: 'baik', C: 'cukup', D: 'perlu bimbingan' }[pred];
  if (!m) return 'Nilai belum lengkap.';
  return pred === 'D' ? 'Perlu bimbingan lebih lanjut dalam mencapai kompetensi ' + nama + '.' : 'Menunjukkan penguasaan kompetensi ' + nama + ' dengan ' + m + '.';
}
// q: {idWb, tahun?, semester?}
function waStafRapor(token, q) {
  var p = stafDariToken_(token), r = nilPeran_(p);
  q = q || {};
  var wb = nilWbDetail_(q.idWb);
  if (!wb) throw new Error('Warga belajar tidak ditemukan.');
  if (!nilAksesRapor_(p, wb.idRombel)) throw new Error('Rapor hanya dapat dibuat Wali Kelas, Kepala Sekolah atau Admin.');
  var hasil = nilRaporWb_(wb, q);
  catat_(p.peran, wb.idRombel, p.nama, 'Rapor', wb.nama + ' ' + hasil.periode.tahun + ' ' + hasil.periode.semester, 'OK');
  return hasil;
}
// Rapor satu warga belajar (dipakai rapor staf dan kartu pencapaian siswa; rumus nilai sama persis).
function nilRaporWb_(wb, q) {
  var per = nilPeriode_(q), k = nilKtx_(per), rows = [], kiniR = nilPeriode_(), idR = wb.idRombel;
  if (nilUrutPer_(per) > nilUrutPer_(kiniR)) throw new Error('Semester ' + per.semester + ' ' + per.tahun + ' belum berjalan.');
  // v1.39.2: semester lampau -> rombel (kelas) WB pada semester itu
  if (nilUrutPer_(per) < nilUrutPer_(kiniR)) {
    idR = nilRombelPeriode_(nilRiwayatKtx_(), wb.id, wb.idRombel, per, kiniR);
    if (!idR) throw new Error('Kelas pada Semester ' + per.semester + ' ' + per.tahun + ' tidak dapat ditentukan.');
    k.wb[idR] = [{ id: wb.id, nisn: wb.nisn, nama: wb.nama }];
  }
  var kelas = nilKelasRombel_(idR, k);
  kelas.forEach(function(kl) {
    var x = nilRekapKelas_(k, kl).filter(function(y) { return y.idWb === wb.id; })[0];
    if (!x) return;
    rows.push({ kode: kl.kodeMapel, nama: kl.namaMapel, diskusi: x.diskusi, uts: x.uts.nilai, uas: x.uas.nilai, akhir: x.akhir, predikat: x.predikat, tuntas: x.tuntas, deskripsi: nilDeskripsi_(kl.namaMapel, x.predikat), persenHadir: x.persen });
  });
  var rb = honProgramRombel_()[idR] || { nama: idR, program: '' };
  var hd = k.rekapHadir[wb.id] || { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 };
  return { wb: wb, rombel: { id: idR, nama: rb.nama, program: rb.program }, periode: per, aturan: k.at, lembaga: nilLembaga_(), mapel: rows, kehadiran: hd, tanggal: absHariIni_() };
}

// v1.38.3: KARTU PENCAPAIAN STUDI untuk siswa (semester berjalan dan sebelumnya).
// q: {tahun?, semester?}; bawaan = semester berjalan. Hasil di-cache 10 menit per siswa & periode.
function waSiswaPencapaian(token, q) {
  var s = siswaDariSesi_(token), nn = normNama_(s.nama);
  q = q || {};
  var kini = nilPeriode_(), per = nilPeriode_(q);
  var peta = nilPetaBm_(), uj = sbUjianSiswa_(s, per, peta);   // v1.57.0: status ujian, nilai ditahan, remedial
  var ck = 'kps_' + Utilities.base64EncodeWebSafe([s.idRombel, nn, per.tahun, per.semester, uj.kunci].join('|')).slice(0, 200), c = CacheService.getScriptCache();
  try { var lama = c.get(ck); if (lama) { var lm = JSON.parse(lama); lm.ujian = uj.daftar; return lm; } } catch (e0) {}
  var simR = '', wb = null;
  Object.keys(peta.rombel).forEach(function(r) { if (peta.rombel[r][s.idRombel]) simR = r; });
  if (simR) {
    var nisn = '';
    (nilSiswaBm_()[String(s.idRombel)] || []).forEach(function(x) { if (normNama_(x.nama) === nn) nisn = x.nisn; });
    wb = nilCocokWb_(absWbRombel_(simR), nisn, s.nama);
  }
  if (!wb) throw new Error('Data Anda belum terhubung dengan Data Induk sekolah, jadi nilai belum bisa ditampilkan. Hubungi admin.');
  var d = nilWbDetail_(wb.id) || { id: wb.id, nisn: wb.nisn, nama: wb.nama, idRombel: simR };
  var h = nilRaporWb_(d, per);
  var mapel = h.mapel, n = 0, jml = 0, tuntas = 0;
  mapel.forEach(function(m) { if (m.akhir !== null && m.akhir !== undefined && m.akhir !== '') { n++; jml += Number(m.akhir) || 0; if (m.tuntas) tuntas++; } });
  var out = {
    nama: d.nama, nisn: d.nisn, rombel: h.rombel, periode: h.periode, periodeKini: kini, kkm: h.aturan.kkm, lembaga: h.lembaga,
    mapel: mapel.map(function(m) {
      var tU = uj.tahan[m.kode + '|UTS'], tA = uj.tahan[m.kode + '|UAS'];
      if (tU || tA) return { kode: m.kode, nama: m.nama, diskusi: m.diskusi, uts: tU ? '**' : m.uts, uas: tA ? '**' : m.uas, akhir: '**', predikat: '**', tuntas: null, persenHadir: m.persenHadir, tertahan: tU || tA };
      return { kode: m.kode, nama: m.nama, diskusi: m.diskusi, uts: m.uts, uas: m.uas, akhir: m.akhir, predikat: m.predikat, tuntas: m.tuntas, persenHadir: m.persenHadir };
    }),
    ringkas: { jumlahMapel: mapel.length, dinilai: n, tuntas: tuntas, rata: n ? nilBulat_(jml / n) : null },
    kehadiran: h.kehadiran
  };
  try { c.put(ck, JSON.stringify(out), 600); } catch (e1) {}
  out.ujian = uj.daftar;
  return out;
}

// ---------- asesmen tatap muka (kertas) ----------
function nilAsObj_(t, r) {
  return {
    id: sTeks_(absNilai_(t, r, 'ID ASESMEN')).trim(), jenis: sTeks_(absNilai_(t, r, 'JENIS ASESMEN')).trim(), tanggal: absTgl_(absNilai_(t, r, 'TANGGAL')),
    mulai: absJam_(absNilai_(t, r, 'JAM MULAI')), selesai: absJam_(absNilai_(t, r, 'JAM SELESAI')), kodeMapel: sTeks_(absNilai_(t, r, 'MAPEL')).trim(),
    paket: sTeks_(absNilai_(t, r, 'PAKET')).trim(), idRombel: sTeks_(absNilai_(t, r, 'ROMBEL')).trim(), ruang: sTeks_(absNilai_(t, r, 'RUANG')).trim(),
    pengawas: sTeks_(absNilai_(t, r, 'PENGAWAS')).trim(), catatan: sTeks_(absNilai_(t, r, 'CATATAN')), dibuatOleh: sTeks_(absNilai_(t, r, 'DIBUAT OLEH'))
  };
}
function nilAsSemua_(per) {
  var t = absBaca_(NIL.TAB_AS, NIL.HDR_AS), out = [], rombel = honProgramRombel_(), mapel = honNamaMapel_();
  for (var i = 1; i < t.v.length; i++) {
    var o = nilAsObj_(t, t.v[i]);
    if (!o.id) continue;
    if (per && (o.tanggal < per.dari || o.tanggal > per.sampai)) continue;
    o.baris = i + 1;
    o.namaRombel = rombel[o.idRombel] ? rombel[o.idRombel].nama : o.idRombel;
    o.namaMapel = mapel[o.kodeMapel] || o.kodeMapel;
    out.push(o);
  }
  return out;
}
function nilPaHadir_() {
  var t = absBaca_(NIL.TAB_PA, NIL.HDR_PA), out = {};
  for (var i = 1; i < t.v.length; i++) {
    var a = sTeks_(absNilai_(t, t.v[i], 'ASESMEN')).trim(), w = sTeks_(absNilai_(t, t.v[i], 'WARGA BELAJAR')).trim();
    if (a && w) (out[a] = out[a] || {})[w] = { jam: absJam_(absNilai_(t, t.v[i], 'JAM')), ket: sTeks_(absNilai_(t, t.v[i], 'KETERANGAN')) };
  }
  return out;
}
function waStafAsesmenDaftar(token, q) {
  var p = stafDariToken_(token), r = nilPeran_(p);
  var kelas = nilKelasBoleh_(p), boleh = {};
  kelas.forEach(function(k) { boleh[k.idRombel + '|' + k.kodeMapel] = true; });
  var per = nilPeriode_(q || {}), hadir = nilPaHadir_();
  var out = nilAsSemua_(per).filter(function(a) { return r.lihatSemua || r.q.fo || boleh[a.idRombel + '|' + a.kodeMapel]; });
  out.forEach(function(a) { a.jumlahHadir = Object.keys(hadir[a.id] || {}).length; });
  out.sort(function(a, b) { return (a.tanggal + a.mulai).localeCompare(b.tanggal + b.mulai); });
  var rombel = [], adaR = {};
  if (r.kartu) absKelas_('').forEach(function(k) { if (!adaR[k.idRombel]) { adaR[k.idRombel] = true; rombel.push({ id: k.idRombel, nama: k.namaRombel }); } });
  rombel.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  return { periode: per, asesmen: out, kelas: r.kelolaAs ? absKelas_('') : [], rombel: rombel, kartu: r.kartu, jenis: NIL.JENIS_AS, kelola: r.kelolaAs, presensi: r.presensi };
}
// d: {id?, jenis, tanggal, mulai, selesai, idRombel, kodeMapel, ruang, pengawas, catatan}
function waStafAsesmenSimpan(token, d) {
  var p = stafDariToken_(token);
  if (!nilPeran_(p).kelolaAs) throw new Error('Jadwal asesmen diatur oleh Admin atau Kepala Sekolah.');
  d = d || {};
  if (NIL.JENIS_AS.indexOf(String(d.jenis)) < 0) throw new Error('Pilih jenis asesmen.');
  var tgl = absTglSah_(d.tanggal);
  var mulai = String(d.mulai || '').trim(), selesai = String(d.selesai || '').trim();
  if (!/^\d{2}:\d{2}$/.test(mulai) || !/^\d{2}:\d{2}$/.test(selesai) || selesai <= mulai) throw new Error('Jam mulai/selesai tidak sah (format HH:mm).');
  var kelas = absKelasCek_(absKelas_(''), d.idRombel, d.kodeMapel);
  if (!kelas) throw new Error('Kelas (rombel & mapel) tidak ditemukan.');
  var t = absBaca_(NIL.TAB_AS, NIL.HDR_AS);
  var isi = {
    'JENIS ASESMEN': d.jenis, 'TANGGAL': tgl, 'JAM MULAI': mulai, 'JAM SELESAI': selesai, 'MAPEL': kelas.kodeMapel, 'PAKET': kelas.program, 'ROMBEL': kelas.idRombel,
    'RUANG': String(d.ruang || '').slice(0, 80), 'PENGAWAS': String(d.pengawas || '').slice(0, 120), 'CATATAN': String(d.catatan || '').slice(0, 300)
  };
  if (d.id) {
    for (var i = 1; i < t.v.length; i++) {
      if (sTeks_(absNilai_(t, t.v[i], 'ID ASESMEN')).trim() !== String(d.id)) continue;
      var row = t.v[i].slice();
      Object.keys(isi).forEach(function(k) { var c = absCol_(t, k); if (c >= 0) row[c] = isi[k]; });
      t.sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
      catat_(p.peran, kelas.idRombel, p.nama, 'Ubah asesmen', d.jenis + ' ' + kelas.namaMapel + ' ' + tgl, 'OK');
      return { sukses: true, id: String(d.id) };
    }
    throw new Error('Asesmen tidak ditemukan.');
  }
  var id = absId_();
  isi['ID ASESMEN'] = id; isi['DIBUAT OLEH'] = p.nama; isi['DIBUAT PADA'] = absWaktu_();
  t.sh.appendRow(absBaris_(t, isi));
  catat_(p.peran, kelas.idRombel, p.nama, 'Jadwal asesmen', d.jenis + ' ' + kelas.namaMapel + ' ' + kelas.namaRombel + ' ' + tgl, 'OK');
  return { sukses: true, id: id };
}
function waStafAsesmenHapus(token, id) {
  var p = stafDariToken_(token);
  if (!nilPeran_(p).kelolaAs) throw new Error('Jadwal asesmen diatur oleh Admin atau Kepala Sekolah.');
  if (Object.keys(nilPaHadir_()[String(id)] || {}).length) throw new Error('Asesmen sudah punya presensi peserta, tidak dapat dihapus.');
  var t = absBaca_(NIL.TAB_AS, NIL.HDR_AS);
  for (var i = t.v.length - 1; i >= 1; i--) {
    if (sTeks_(absNilai_(t, t.v[i], 'ID ASESMEN')).trim() !== String(id)) continue;
    t.sh.deleteRow(i + 1);
    catat_(p.peran, '-', p.nama, 'Hapus asesmen', String(id), 'OK');
    return { sukses: true };
  }
  throw new Error('Asesmen tidak ditemukan.');
}
function nilAsCari_(id) {
  var a = nilAsSemua_(null).filter(function(x) { return x.id === String(id); })[0];
  if (!a) throw new Error('Asesmen tidak ditemukan.');
  return a;
}
function nilSyaratAs_(a, hk, dis, at, w) {
  var g = hk.gabung ? hk.gabung(w.id) : { total: hk.total, persen: hk.total ? nilBulat_((hk.hadir[w.id] || 0) * 100 / hk.total) : null };
  if (!g.total) return { persen: null, boleh: true, status: 'Belum ada sesi' };
  var ps = g.persen;
  if (ps >= at.syaratHadir) return { persen: ps, boleh: true, status: 'Memenuhi' };
  var jn = NIL.JENIS.indexOf(a.jenis) >= 0 ? a.jenis : '';
  if (nilDisCari_(dis, w.id, a.idRombel, a.kodeMapel, jn)) return { persen: ps, boleh: true, status: 'Dispensasi' };
  return { persen: ps, boleh: !at.blokir, status: 'Kurang' };
}
function waStafAsesmenPeserta(token, id) {
  var p = stafDariToken_(token), r = nilPeran_(p);
  if (!r.presensi && !r.lihatSemua) throw new Error('Peran Anda tidak dapat melihat peserta asesmen.');
  var a = nilAsCari_(id), per = nilPeriode_(), at = nilAturan_();
  var hk = nilHadirKelas_(per, a.idRombel + '|' + a.kodeMapel), dis = nilDisBaca_(per), hadir = nilPaHadir_()[a.id] || {};
  var peserta = absWbRombel_(a.idRombel).map(function(w) {
    var s = nilSyaratAs_(a, hk, dis, at, w);
    return { idWb: w.id, nisn: w.nisn, nama: w.nama, persen: s.persen, syarat: s.status, boleh: s.boleh, hadir: !!hadir[w.id], jam: hadir[w.id] ? hadir[w.id].jam : '' };
  });
  return { asesmen: a, aturan: at, peserta: peserta, presensi: r.presensi };
}
// kode = isi QR kartu (NISN atau ID WB)
function waStafAsesmenHadir(token, id, kode) {
  var p = stafDariToken_(token);
  if (!nilPeran_(p).presensi) throw new Error('Peran Anda tidak dapat mencatat presensi asesmen.');
  var a = nilAsCari_(id), w = absCariWb_(kode);
  if (!w) throw new Error('Kartu tidak dikenal: ' + String(kode || '').slice(0, 30));
  if (w.rombel !== a.idRombel) throw new Error(w.nama + ' bukan peserta rombel asesmen ini.');
  var hadir = nilPaHadir_()[a.id] || {};
  if (hadir[w.id]) return { sukses: true, sudah: true, nama: w.nama, pesan: w.nama + ' sudah tercatat hadir pukul ' + hadir[w.id].jam + '.' };
  var per = nilPeriode_(), s = nilSyaratAs_(a, nilHadirKelas_(per, a.idRombel + '|' + a.kodeMapel), nilDisBaca_(per), nilAturan_(), w);
  if (!s.boleh) throw new Error('SYARAT: ' + w.nama + ' belum memenuhi syarat kehadiran (' + s.persen + '%). Minta dispensasi Kepala Sekolah.');
  var t = absBaca_(NIL.TAB_PA, NIL.HDR_PA);
  t.sh.appendRow(absBaris_(t, { 'ID PRESENSI': absId_(), 'ASESMEN': a.id, 'WARGA BELAJAR': w.id, 'JAM': absJamKini_(), 'KETERANGAN': s.status === 'Memenuhi' ? 'Hadir' : 'Hadir (' + s.status + ')', 'DICATAT OLEH': p.nama, 'DICATAT PADA': absWaktu_() }));
  return { sukses: true, nama: w.nama, syarat: s.status };
}

// ---------- kartu peserta ujian ----------
function waStafKartuPeserta(token, idRombel) {
  var p = stafDariToken_(token), r = nilPeran_(p);
  if (!r.kartu) throw new Error('Kartu peserta dicetak oleh Admin, Kepala Sekolah atau Front Office.');
  var rb = honProgramRombel_()[String(idRombel)];
  if (!rb) throw new Error('Rombel tidak ditemukan.');
  var per = nilPeriode_(), peta = nilPetaBm_(), mapel = honNamaMapel_(), jadwal = [];
  nilAsSemua_(per).forEach(function(a) { if (a.idRombel === String(idRombel)) jadwal.push({ jenis: a.jenis, mapel: a.namaMapel, tanggal: a.tanggal, jam: a.mulai + '–' + a.selesai, ruang: a.ruang || 'Sekretariat', mode: 'Tatap muka' }); });
  var bmKe = {};
  Object.keys(peta.kelas).forEach(function(key) {
    if (key.split('|')[0] !== String(idRombel)) return;
    peta.kelas[key].forEach(function(b) { if (b.aktif) bmKe[b.idMapel] = key.split('|')[1]; });
  });
  ujJadwalSemua_().forEach(function(j) {
    if (j.smt !== per.smt || !bmKe[j.idMapel]) return;
    jadwal.push({ jenis: j.jenis, mapel: mapel[bmKe[j.idMapel]] || bmKe[j.idMapel], tanggal: j.tanggal, jam: j.jam + ' (' + j.durasi + ' mnt)', ruang: 'Online', mode: 'Online' });
  });
  jadwal.sort(function(a, b) { return (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam); });
  return {
    rombel: { id: String(idRombel), nama: rb.nama, program: rb.program }, periode: per, lembaga: nilLembaga_(),
    wb: absWbRombel_(idRombel).map(function(w) { return { idWb: w.id, nisn: w.nisn, nama: w.nama, kode: w.nisn || w.id }; }), jadwal: jadwal
  };
}

// ---------- gerbang ujian online (dipanggil dari waMulaiUjian) ----------
function nilGerbangUjian_(j, idRombelBm, namaBm) {
  if (j && j.jenis === 'TRYOUT') return '';   // v1.52.0: tryout tanpa syarat kehadiran
  var at = nilAturan_();
  if (!at.blokir) return '';
  var peta = nilPetaBm_(), key = '';
  Object.keys(peta.kelas).forEach(function(kk) { peta.kelas[kk].forEach(function(b) { if (b.idMapel === String(j.idMapel)) key = kk; }); });
  if (!key) return '';
  var idR = key.split('|')[0], km = key.split('|')[1];
  var nisn = '';
  (nilSiswaBm_()[String(idRombelBm)] || []).forEach(function(s) { if (normNama_(s.nama) === normNama_(namaBm)) nisn = s.nisn; });
  var wb = nilCocokWb_(absWbRombel_(idR), nisn, namaBm);
  if (!wb) return '';
  var per = nilPeriode_(), g = nilHadirKelas_(per, key).gabung(wb.id);   // v1.38.4: TH.E-Course + tatap muka
  if (!g.total) return '';
  var ps = g.persen;
  if (ps >= at.syaratHadir) return '';
  if (nilDisCari_(nilDisBaca_(per), wb.id, idR, km, j.jenis)) return '';
  return 'Anda belum memenuhi syarat kehadiran untuk mengikuti ujian ini (hadir ' + g.hadir + ' dari ' + g.total + ' sesi = ' + ps + '%; absensi TH.E-Course ' + g.online.hadir + '/' + g.online.total +
    (g.tatapMuka.total ? ', tatap muka ' + g.tatapMuka.hadir + '/' + g.tatapMuka.total : '') + '; minimal ' + at.syaratHadir + '%). Silakan hubungi Kepala Sekolah untuk dispensasi.';
}



// ============================================================================
// KEUANGAN TH.E-COURSE (Tahap 5, migrasi SIM SETARA)
// Tab (database simSs_): TRANSAKSI (+kolom TAGIHAN), KATEGORI KEUANGAN, TAGIHAN (baru),
// KERINGANAN TAGIHAN (baru). Pencatat: Bendahara / Admin. Pemasukan langsung Disetujui;
// pengeluaran Menunggu sampai diputus Ketua Yayasan (Superadmin). Saldo = transaksi Disetujui.
// Tagihan WB: sasaran Semua / Program / Rombel; lunas bila dibayar + keringanan >= jumlah.
// ============================================================================
var KEU = {
  TAB_TRX: 'TRANSAKSI', TAB_KAT: 'KATEGORI KEUANGAN', TAB_TAG: 'TAGIHAN', TAB_KER: 'KERINGANAN TAGIHAN',
  HDR_TAG: ['ID TAGIHAN', 'NAMA', 'KATEGORI', 'JUMLAH', 'SASARAN', 'NILAI SASARAN', 'JATUH TEMPO', 'KETERANGAN', 'TAHUN PELAJARAN', 'AKTIF', 'DIBUAT OLEH', 'DIBUAT PADA'],
  HDR_KER: ['ID', 'TAGIHAN', 'WARGA BELAJAR', 'JUMLAH', 'ALASAN', 'DICATAT OLEH', 'DICATAT PADA'],
  SUMBER: ['BOP', 'Swadaya', 'Donasi', 'Yayasan', 'Lainnya'],
  SUMBER_KAT: { BOP: 'BOP', IUR: 'Swadaya', DAF: 'Swadaya', ASM: 'Swadaya', DON: 'Donasi', LPM: 'Lainnya' },
  JENIS: ['Pemasukan', 'Pengeluaran'],
  SASARAN: ['Semua', 'Program', 'Rombel', 'Siswa'],   // v1.49.0: Siswa = siswa tertentu (ID WB dipisah koma)
  PROP_FOLDER: 'TH_KEU_FOLDER', MAKS_BUKTI: 900000
};

// ---------- peran ----------
function keuPeran_(p) {
  var q = absPeran_(p);
  return { q: q, catat: q.bend || q.admin, putus: q.sa, lihat: q.bend || q.admin || q.sa || q.ks };
}
function keuWajib_(p, apa) {
  var r = keuPeran_(p);
  if (apa === 'catat' && !r.catat) throw new Error('Transaksi dicatat oleh Bendahara atau Admin.');
  if (apa === 'putus' && !r.putus) throw new Error('Persetujuan pengeluaran hanya oleh Ketua Yayasan (Superadmin).');
  if (!r.lihat) throw new Error('Keuangan hanya untuk Bendahara, Admin, Ketua Yayasan dan Kepala Sekolah.');
  return r;
}

// ---------- tabel ----------
function keuTrxTab_() {
  var t = absBaca_(KEU.TAB_TRX);
  ['TAGIHAN', 'AKUN KAS', 'AKUN TUJUAN'].concat(PJK.KOLOM).forEach(function(k) {   // v1.46.0: kolom pajak   // v1.45.0: AKUN KAS / AKUN TUJUAN (mutasi)
    if (absCol_(t, k) >= 0) return;
    t.sh.getRange(1, t.sh.getLastColumn() + 1).setValue(k).setFontWeight('bold');
    t = absBaca_(KEU.TAB_TRX);
  });
  return t;
}
function keuAngka_(x) {
  if (typeof x === 'number') return x;
  var s = String(x || '').replace(/[^\d,.-]/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  return Number(s) || 0;
}
function keuTrxObj_(t, r, i) {
  var g = function(n) { return absNilai_(t, r, n); };
  return {
    baris: i + 1, id: sTeks_(g('ID TRANSAKSI')).trim(), tanggal: absTgl_(g('TANGGAL')), jenis: sTeks_(g('JENIS')).trim(),
    kategori: sTeks_(g('KATEGORI KEUANGAN')).trim(), idWb: sTeks_(g('WARGA BELAJAR')).trim(), uraian: sTeks_(g('URAIAN')),
    jumlah: keuAngka_(g('JUMLAH')), sumber: sTeks_(g('SUMBER DANA')).trim(), pihak: sTeks_(g('PIHAK TERKAIT')), bukti: sTeks_(g('BUKTI')).trim(),
    status: sTeks_(g('STATUS')).trim() || 'Disetujui', diputusOleh: sTeks_(g('DIPUTUS OLEH')), tglPutus: sTeks_(g('TANGGAL KEPUTUSAN')),
    catatanPutus: sTeks_(g('CATATAN KEPUTUSAN')), tahun: sTeks_(g('TAHUN PELAJARAN')), dicatatOleh: sTeks_(g('DICATAT OLEH')),
    dicatatPada: sTeks_(g('DICATAT PADA')), idTagihan: sTeks_(g('TAGIHAN')).trim(),
    akun: sTeks_(g('AKUN KAS')).trim(), akunTujuan: sTeks_(g('AKUN TUJUAN')).trim(),
    dpp: keuAngka_(g('DPP')), ppn: keuAngka_(g('PPN')), tarifPpn: keuAngka_(g('TARIF PPN')), pphJenis: sTeks_(g('PPH JENIS')).trim(),
    tarifPph: keuAngka_(g('TARIF PPH')), pph: keuAngka_(g('PPH')), induk: sTeks_(g('INDUK')).trim(), disetor: sTeks_(g('DISETOR')).trim(), ntpn: sTeks_(g('NTPN')).trim()
  };
}
function keuSemua_(t) {
  t = t || keuTrxTab_();
  var out = [];
  for (var i = 1; i < t.v.length; i++) {
    var o = keuTrxObj_(t, t.v[i], i);
    if (o.id) out.push(o);
  }
  return out;
}
function keuKategori_() {
  var t = absBaca_(KEU.TAB_KAT), out = [];
  for (var i = 1; i < t.v.length; i++) {
    var k = sTeks_(absNilai_(t, t.v[i], 'KODE KATEGORI')).trim();
    if (k) out.push({ kode: k, nama: sTeks_(absNilai_(t, t.v[i], 'NAMA KATEGORI')).trim(), jenis: sTeks_(absNilai_(t, t.v[i], 'JENIS')).trim(), baris: i + 1 });
  }
  return out;
}
function keuKatPeta_() { var m = {}; keuKategori_().forEach(function(k) { m[k.kode] = k; }); return m; }
function keuBulanIni_() { var h = absHariIni_(); return { dari: h.slice(0, 8) + '01', sampai: h }; }
function keuFolder_() {
  var pr = PropertiesService.getScriptProperties(), id = pr.getProperty(KEU.PROP_FOLDER);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('TH.E-Course - Bukti Keuangan (rahasia)');
  pr.setProperty(KEU.PROP_FOLDER, f.getId());
  return f;
}
function keuSimpanBukti_(dataUrl, nama) {
  var m = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Format bukti tidak dikenal.');
  if (m[2].length > KEU.MAKS_BUKTI * 1.4) throw new Error('Ukuran bukti terlalu besar.');
  return keuFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], nama)).getId();
}
function keuSah_(x) { return x.status === 'Disetujui'; }

// ---------- konteks & daftar ----------
function waStafKeuKonteks(token) {
  var p = stafDariToken_(token), r = keuWajib_(p, 'lihat');
  var semua = keuSemua_(), per = {}, total = 0, menunggu = 0;
  KEU.SUMBER.forEach(function(s) { per[s] = 0; });
  semua.forEach(function(x) {
    if (x.status === 'Menunggu') menunggu++;
    if (!keuSah_(x) || x.jenis === 'Mutasi') return;   // mutasi hanya memindah antar akun
    var v = x.jenis === 'Pengeluaran' ? -x.jumlah : x.jumlah;
    total += v;
    var s = x.sumber || 'Lainnya';
    per[s] = (per[s] || 0) + v;
  });
  return {
    peran: { catat: r.catat, putus: r.putus, lihat: r.lihat }, kategori: keuKategori_(), sumber: KEU.SUMBER, sumberKat: KEU.SUMBER_KAT,
    saldo: { total: total, per: per }, menunggu: menunggu, tahun: absSim_().tahun, bulanIni: keuBulanIni_(),
    akun: kalDaftarAkunSaldo_(semua), jenisAkun: KAL.JENIS_AKUN, pajak: pjkAturan_()
  };
}
// q: {dari, sampai, jenis, status, kategori, sumber, cari}
function waStafKeuDaftar(token, q) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'lihat');
  q = q || {};
  var bi = keuBulanIni_(), dari = q.dari ? absTglSah_(q.dari) : bi.dari, sampai = q.sampai ? absTglSah_(q.sampai) : bi.sampai;
  var cari = String(q.cari || '').toLowerCase().trim(), kat = keuKatPeta_(), wb = {};
  var out = keuSemua_().filter(function(x) {
    if (q.status === 'Menunggu') { if (x.status !== 'Menunggu') return false; }
    else if (x.tanggal < dari || x.tanggal > sampai) return false;
    if (q.status && q.status !== 'Menunggu' && x.status !== q.status) return false;
    if (q.jenis && x.jenis !== q.jenis) return false;
    if (q.kategori && x.kategori !== q.kategori) return false;
    if (q.sumber && x.sumber !== q.sumber) return false;
    if (q.akun && (x.akun || '-') !== q.akun && x.akunTujuan !== q.akun) return false;
    if (cari && (x.uraian + ' ' + x.pihak + ' ' + x.id).toLowerCase().indexOf(cari) < 0) return false;
    return true;
  });
  var masuk = 0, keluar = 0, ap = kalAkunPeta_();
  out.forEach(function(x) {
    x.namaKategori = x.jenis === 'Mutasi' ? 'Mutasi antar akun' : (kat[x.kategori] ? kat[x.kategori].nama : x.kategori);
    x.namaAkun = x.akun ? (ap[x.akun] ? ap[x.akun].nama : x.akun) : KAL.TANPA_AKUN.nama;
    x.namaAkunTujuan = x.akunTujuan ? (ap[x.akunTujuan] ? ap[x.akunTujuan].nama : x.akunTujuan) : '';
    x.adaBukti = !!x.bukti;
    delete x.bukti;
    if (keuSah_(x) && x.jenis !== 'Mutasi') { if (x.jenis === 'Pengeluaran') keluar += x.jumlah; else masuk += x.jumlah; }
  });
  out.sort(function(a, b) { return (b.tanggal + b.dicatatPada).localeCompare(a.tanggal + a.dicatatPada); });
  return { dari: dari, sampai: sampai, transaksi: out.slice(0, 500), masuk: masuk, keluar: keluar };
}

// ---------- catat / ubah / batal / putus ----------
// d: {id?, tanggal, jenis, kategori, uraian, jumlah, sumber, pihak, idWb?, bukti (dataURL)?}
function waStafKeuSimpan(token, d) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  d = d || {};
  var tgl = absTglSah_(d.tanggal);
  if (KEU.JENIS.indexOf(String(d.jenis)) < 0) throw new Error('Pilih jenis transaksi.');
  var kat = keuKatPeta_()[String(d.kategori || '')];
  if (!kat) throw new Error('Pilih kategori.');
  if (kat.jenis && kat.jenis !== d.jenis) throw new Error('Kategori ' + kat.nama + ' untuk ' + kat.jenis + '.');
  if (kat.kode === 'HON') throw new Error('Pengeluaran honor dicatat otomatis dari menu Rekap Honor.');
  if (kat.kode === PJK.KAT) throw new Error('Pajak dipungut/disetor dicatat dari menu Pajak.');
  var jumlah = Math.round(keuAngka_(d.jumlah));
  if (jumlah <= 0) throw new Error('Jumlah harus lebih dari 0.');
  var uraian = String(d.uraian || '').trim();
  if (uraian.length < 3) throw new Error('Isi uraian transaksi.');
  var sumber = KEU.SUMBER.indexOf(String(d.sumber)) >= 0 ? String(d.sumber) : (KEU.SUMBER_KAT[kat.kode] || 'Lainnya');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = keuTrxTab_();
    var isi = {
      'TANGGAL': tgl, 'JENIS': d.jenis, 'KATEGORI KEUANGAN': kat.kode, 'WARGA BELAJAR': String(d.idWb || ''), 'URAIAN': uraian.slice(0, 300),
      'JUMLAH': jumlah, 'SUMBER DANA': sumber, 'PIHAK TERKAIT': String(d.pihak || '').slice(0, 120)
    };
    if (d.akun !== undefined) isi['AKUN KAS'] = kalAkunSah_(d.akun);   // v1.45.0
    if (d.ppn !== undefined || d.pph !== undefined) {   // v1.46.0: PPN termasuk harga / PPh dipotong
      var hp = pjkKeKolom_(pjkHitung_(jumlah, d.ppn, d.pph, d.jenis));
      Object.keys(hp).forEach(function(k) { isi[k] = hp[k]; });
    }
    if (d.bukti) isi['BUKTI'] = keuSimpanBukti_(d.bukti, 'TRX-' + tgl + '-' + absId_());
    if (d.id) {
      for (var i = 1; i < t.v.length; i++) {
        var o = keuTrxObj_(t, t.v[i], i);
        if (o.id !== String(d.id)) continue;
        if (o.kategori === 'HON') throw new Error('Transaksi honor diubah dari menu Rekap Honor.');
        if (o.jenis === 'Mutasi') throw new Error('Mutasi tidak bisa diubah; batalkan lalu catat ulang.');
        if (o.idTagihan) throw new Error('Pembayaran tagihan tidak bisa diubah; batalkan lalu catat ulang.');
        if (o.status !== 'Menunggu' && !(o.jenis === 'Pemasukan' && o.status === 'Disetujui')) throw new Error('Transaksi berstatus ' + o.status + ' tidak bisa diubah.');
        if (d.jenis === 'Pengeluaran') { isi['STATUS'] = 'Menunggu'; isi['DIPUTUS OLEH'] = ''; isi['TANGGAL KEPUTUSAN'] = ''; isi['CATATAN KEPUTUSAN'] = ''; }
        else isi['STATUS'] = 'Disetujui';
        var row = t.v[i].slice();
        Object.keys(isi).forEach(function(k) { var c = absCol_(t, k); if (c >= 0) row[c] = isi[k]; });
        t.sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
        catat_(p.peran, '-', p.nama, 'Ubah transaksi', o.id + ' ' + d.jenis + ' ' + jumlah, 'OK');
        return { sukses: true, id: o.id, status: isi['STATUS'] };
      }
      throw new Error('Transaksi tidak ditemukan.');
    }
    var id = 'TRX-' + absId_().toUpperCase();
    isi['ID TRANSAKSI'] = id;
    isi['STATUS'] = d.jenis === 'Pengeluaran' ? 'Menunggu' : 'Disetujui';
    isi['TAHUN PELAJARAN'] = absSim_().tahun;
    isi['DICATAT OLEH'] = p.nama;
    isi['DICATAT PADA'] = absWaktu_();
    t.sh.appendRow(absBaris_(t, isi));
    catat_(p.peran, '-', p.nama, 'Catat transaksi', id + ' ' + d.jenis + ' ' + kat.kode + ' ' + jumlah, 'OK');
    if (isi['STATUS'] === 'Menunggu') npKirim_('pengeluaran_menunggu', { judul: 'Pengeluaran menunggu persetujuan', isi: kat.nama + ' ' + honRp_(jumlah) + ': ' + uraian.slice(0, 120) + ' (dicatat ' + p.nama + ')', aksi: 'keuangan', ref: id });   // v1.50.0: notifikasi
    return { sukses: true, id: id, status: isi['STATUS'] };
  } finally { lock.releaseLock(); }
}
function keuUbahBaris_(t, id, fn) {
  for (var i = 1; i < t.v.length; i++) {
    var o = keuTrxObj_(t, t.v[i], i);
    if (o.id !== String(id)) continue;
    var isi = fn(o);
    var row = t.v[i].slice();
    Object.keys(isi).forEach(function(k) { var c = absCol_(t, k); if (c >= 0) row[c] = isi[k]; });
    t.sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
    return o;
  }
  throw new Error('Transaksi tidak ditemukan.');
}
function waStafKeuBatal(token, id, alasan) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  alasan = String(alasan || '').trim();
  if (alasan.length < 3) throw new Error('Tulis alasan pembatalan.');
  var o = keuUbahBaris_(keuTrxTab_(), id, function(o) {
    if (o.kategori === 'HON') throw new Error('Transaksi honor dibatalkan dari menu Rekap Honor.');
    if (o.status === 'Dibatalkan' || o.status === 'Ditolak') throw new Error('Transaksi sudah ' + o.status + '.');
    pjkBolehBatal_(o);   // v1.46.0
    return { 'STATUS': 'Dibatalkan', 'CATATAN KEPUTUSAN': 'Dibatalkan ' + p.nama + ': ' + alasan.slice(0, 200), 'TANGGAL KEPUTUSAN': absWaktu_() };
  });
  catat_(p.peran, '-', p.nama, 'Batal transaksi', o.id + ': ' + alasan, 'OK');
  kalSetelahPutus_(o, 'Dibatalkan');
  return { sukses: true };
}
function waStafKeuPutus(token, id, setuju, catatan, paksa) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'putus');
  var o = keuUbahBaris_(keuTrxTab_(), id, function(o) {
    if (o.status !== 'Menunggu') throw new Error('Transaksi ini sudah ' + o.status + '.');
    if (setuju && o.jenis === 'Pengeluaran') kalCekSaldo_(o.sumber, o.jumlah, paksa === true, p, o.id);   // v1.44.0
    return { 'STATUS': setuju ? 'Disetujui' : 'Ditolak', 'DIPUTUS OLEH': p.nama, 'TANGGAL KEPUTUSAN': absWaktu_(), 'CATATAN KEPUTUSAN': String(catatan || '').slice(0, 300) };
  });
  catat_(p.peran, '-', p.nama, setuju ? 'Setujui pengeluaran' : 'Tolak pengeluaran', o.id + ' ' + o.jumlah, 'OK');
  kalSetelahPutus_(o, setuju ? 'Disetujui' : 'Ditolak');
  npKirim_('pengeluaran_diputus', { judul: 'Pengeluaran ' + (setuju ? 'disetujui' : 'ditolak'), isi: honRp_(o.jumlah) + ': ' + String(o.uraian).slice(0, 120) + ' · ' + p.nama + (catatan ? ' · ' + String(catatan).slice(0, 100) : ''), aksi: 'keuangan', ref: 'putus|' + o.id });   // v1.50.0: notifikasi
  return { sukses: true };
}
function waStafKeuBukti(token, id) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'lihat');
  var o = keuSemua_().filter(function(x) { return x.id === String(id); })[0];
  if (!o || !o.bukti) throw new Error('Transaksi ini tidak punya bukti.');
  var fid = (/[-\w]{25,}/.exec(o.bukti) || [o.bukti])[0];
  var b = DriveApp.getFileById(fid).getBlob();
  return { b64: Utilities.base64Encode(b.getBytes()), mime: b.getContentType() };
}
// d: {kode, nama, jenis}
function waStafKeuKategoriSimpan(token, d) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  d = d || {};
  var kode = String(d.kode || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(kode)) throw new Error('Kode kategori 2–8 huruf/angka.');
  var nama = String(d.nama || '').trim();
  if (nama.length < 3) throw new Error('Isi nama kategori.');
  if (KEU.JENIS.indexOf(String(d.jenis)) < 0) throw new Error('Pilih jenis kategori.');
  var t = absBaca_(KEU.TAB_KAT);
  for (var i = 1; i < t.v.length; i++) {
    if (sTeks_(absNilai_(t, t.v[i], 'KODE KATEGORI')).trim() !== kode) continue;
    if (kode === 'HON') throw new Error('Kategori HON dipakai otomatis oleh honor.');
    t.sh.getRange(i + 1, absCol_(t, 'NAMA KATEGORI') + 1).setValue(nama);
    t.sh.getRange(i + 1, absCol_(t, 'JENIS') + 1).setValue(d.jenis);
    return { sukses: true };
  }
  t.sh.appendRow(absBaris_(t, { 'KODE KATEGORI': kode, 'NAMA KATEGORI': nama, 'JENIS': d.jenis }));
  catat_(p.peran, '-', p.nama, 'Kategori keuangan', kode + ' ' + nama, 'OK');
  return { sukses: true };
}

// ---------- laporan (buku kas) ----------
// q: {dari, sampai, sumber?}
function waStafKeuLaporan(token, q) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'lihat');
  q = q || {};
  var bi = keuBulanIni_(), dari = q.dari ? absTglSah_(q.dari) : bi.dari, sampai = q.sampai ? absTglSah_(q.sampai) : bi.sampai;
  // v1.45.0: q.akun = buku pembantu satu akun ('-' = belum ditentukan); tanpa q.akun = buku kas umum (mutasi tidak dihitung).
  var akunF = q.akun ? (q.akun === '-' ? '' : String(q.akun)) : null;
  var kat = keuKatPeta_(), ap = kalAkunPeta_(), semua = keuSemua_(), awal = 0, masuk = 0, keluar = 0, baris = [], perKat = {}, perSum = {}, menunggu = 0, mutasi = [], pa = {};
  var nAkun = function(k) { return k ? (ap[k] ? ap[k].nama : k) : KAL.TANPA_AKUN.nama; };
  var pj = { ppnMasukan: 0, ppnKeluaran: 0, dipungut: 0, disetor: 0, titipan: 0 };   // v1.46.0
  var akunRow = function(k) { return pa[k] || (pa[k] = { kode: k, nama: nAkun(k), awal: 0, masuk: 0, keluar: 0, mutasiMasuk: 0, mutasiKeluar: 0 }); };
  kalAkun_().forEach(function(a) { akunRow(a.kode); });
  semua.sort(function(a, b) { return (a.tanggal + a.dicatatPada).localeCompare(b.tanggal + b.dicatatPada); });
  semua.forEach(function(x) {
    if (x.status === 'Menunggu' && x.tanggal <= sampai && (!q.sumber || x.sumber === q.sumber)) menunggu++;
    if (!keuSah_(x) || x.tanggal > sampai) return;
    var sebelum = x.tanggal < dari, ak = x.akun || '', tj = x.akunTujuan || '';
    if (x.kategori === PJK.KAT) pj.titipan += x.jenis === 'Pemasukan' ? x.jumlah : -x.jumlah;
    if (!sebelum) {
      if (Number(x.ppn) > 0) { if (x.jenis === 'Pengeluaran') pj.ppnMasukan += Number(x.ppn); else pj.ppnKeluaran += Number(x.ppn); }
      if (x.kategori === PJK.KAT) { if (x.jenis === 'Pemasukan') pj.dipungut += x.jumlah; else pj.disetor += x.jumlah; }
    }
    // posisi kas per akun (seluruh dana)
    var A = akunRow(ak);
    if (x.jenis === 'Mutasi') {
      var B = akunRow(tj);
      if (sebelum) { A.awal -= x.jumlah; B.awal += x.jumlah; } else { A.mutasiKeluar += x.jumlah; B.mutasiMasuk += x.jumlah; }
    } else if (sebelum) A.awal += x.jenis === 'Pengeluaran' ? -x.jumlah : x.jumlah;
    else if (x.jenis === 'Pengeluaran') A.keluar += x.jumlah; else A.masuk += x.jumlah;
    // buku kas
    var v = null;
    if (akunF !== null) {
      if (x.jenis === 'Mutasi') v = ak === akunF ? -x.jumlah : (tj === akunF ? x.jumlah : null);
      else if (ak === akunF && (!q.sumber || x.sumber === q.sumber)) v = x.jenis === 'Pengeluaran' ? -x.jumlah : x.jumlah;
    } else if (x.jenis === 'Mutasi') {
      if (!sebelum) mutasi.push({ id: x.id, tanggal: x.tanggal, uraian: x.uraian, dari: nAkun(ak), ke: nAkun(tj), jumlah: x.jumlah });
    } else if (!q.sumber || x.sumber === q.sumber) v = x.jenis === 'Pengeluaran' ? -x.jumlah : x.jumlah;
    if (v === null) return;
    if (sebelum) { awal += v; return; }
    if (v >= 0) masuk += v; else keluar -= v;
    if (x.jenis !== 'Mutasi') {
      var k = perKat[x.kategori] || (perKat[x.kategori] = { kode: x.kategori, nama: kat[x.kategori] ? kat[x.kategori].nama : x.kategori, jenis: x.jenis, jumlah: 0 });
      k.jumlah += x.jumlah;
      var s = perSum[x.sumber || 'Lainnya'] || (perSum[x.sumber || 'Lainnya'] = { sumber: x.sumber || 'Lainnya', masuk: 0, keluar: 0 });
      if (v >= 0) s.masuk += v; else s.keluar -= v;
    }
    baris.push({ id: x.id, tanggal: x.tanggal, jenis: x.jenis, kategori: x.jenis === 'Mutasi' ? 'MUT' : x.kategori,
      uraian: x.jenis === 'Mutasi' ? x.uraian + ' (' + nAkun(ak) + ' → ' + nAkun(tj) + ')' : x.uraian, pihak: x.pihak, sumber: x.sumber,
      akun: x.jenis === 'Mutasi' ? '' : nAkun(ak), masuk: v >= 0 ? v : 0, keluar: v < 0 ? -v : 0 });
  });
  var saldo = awal;
  baris.forEach(function(b) { saldo += b.masuk - b.keluar; b.saldo = saldo; });
  var perAkun = Object.keys(pa).map(function(k) { var a = pa[k]; a.akhir = a.awal + a.masuk - a.keluar + a.mutasiMasuk - a.mutasiKeluar; return a; })
    .filter(function(a) { return a.kode || a.awal || a.masuk || a.keluar || a.mutasiMasuk || a.mutasiKeluar; });
  return {
    dari: dari, sampai: sampai, sumber: q.sumber || '', akun: akunF === null ? null : akunF, namaAkun: akunF === null ? '' : nAkun(akunF),
    saldoAwal: awal, masuk: masuk, keluar: keluar, saldoAkhir: awal + masuk - keluar,
    baris: baris, perKategori: Object.keys(perKat).map(function(k) { return perKat[k]; }).sort(function(a, b) { return a.jenis.localeCompare(b.jenis) || b.jumlah - a.jumlah; }),
    perSumber: Object.keys(perSum).map(function(k) { return perSum[k]; }), perAkun: perAkun, mutasi: mutasi, pajak: pj, menunggu: menunggu, lembaga: nilLembaga_(), tanggal: absHariIni_()
  };
}

// ---------- tagihan warga belajar ----------
function keuTagObj_(t, r, i) {
  var g = function(n) { return absNilai_(t, r, n); };
  return {
    baris: i + 1, id: sTeks_(g('ID TAGIHAN')).trim(), nama: sTeks_(g('NAMA')).trim(), kategori: sTeks_(g('KATEGORI')).trim(), jumlah: keuAngka_(g('JUMLAH')),
    sasaran: sTeks_(g('SASARAN')).trim() || 'Semua', nilaiSasaran: sTeks_(g('NILAI SASARAN')).trim(), jatuhTempo: absTgl_(g('JATUH TEMPO')),
    keterangan: sTeks_(g('KETERANGAN')), tahun: sTeks_(g('TAHUN PELAJARAN')), aktif: absBenar_(g('AKTIF')), dibuatOleh: sTeks_(g('DIBUAT OLEH'))
  };
}
function keuTagSemua_() {
  var t = absBaca_(KEU.TAB_TAG, KEU.HDR_TAG), out = [];
  for (var i = 1; i < t.v.length; i++) { var o = keuTagObj_(t, t.v[i], i); if (o.id) out.push(o); }
  return { t: t, data: out };
}
function keuWbSemua_() {
  var t = absBaca_('WARGA BELAJAR'), rb = honProgramRombel_(), out = [];
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i], id = sTeks_(absNilai_(t, r, 'ID WB')).trim();
    if (!id) continue;
    var st = sTeks_(absNilai_(t, r, 'STATUS')).trim();
    var idR = sTeks_(absNilai_(t, r, 'ROMBEL')).trim();
    out.push({ id: id, nisn: sTeks_(absNilai_(t, r, 'NISN')).trim(), nama: sTeks_(absNilai_(t, r, 'NAMA WB')).trim(), idRombel: idR,
      namaRombel: rb[idR] ? rb[idR].nama : idR, program: rb[idR] ? rb[idR].program : '', aktif: !st || st === 'Aktif' });
  }
  return out;
}
function keuKena_(tag, w) {
  if (!w.aktif) return false;
  if (tag.sasaran === 'Program') return w.program === tag.nilaiSasaran;
  if (tag.sasaran === 'Rombel') return w.idRombel === tag.nilaiSasaran;
  if (tag.sasaran === 'Siswa') return (',' + String(tag.nilaiSasaran).replace(/\s+/g, '') + ',').indexOf(',' + w.id + ',') >= 0;
  return true;
}
// peta pembayaran & keringanan: kunci idTagihan|idWb
function keuBayarPeta_() {
  var bayar = {}, ker = {};
  keuSemua_().forEach(function(x) {
    if (!x.idTagihan || !keuSah_(x) || x.jenis !== 'Pemasukan') return;
    var k = x.idTagihan + '|' + x.idWb;
    bayar[k] = (bayar[k] || 0) + x.jumlah;
  });
  var t = absBaca_(KEU.TAB_KER, KEU.HDR_KER);
  for (var i = 1; i < t.v.length; i++) {
    var k2 = sTeks_(absNilai_(t, t.v[i], 'TAGIHAN')).trim() + '|' + sTeks_(absNilai_(t, t.v[i], 'WARGA BELAJAR')).trim();
    ker[k2] = (ker[k2] || 0) + keuAngka_(absNilai_(t, t.v[i], 'JUMLAH'));
  }
  return { bayar: bayar, ker: ker };
}
function keuRinci_(tag, wbs, pb) {
  return wbs.filter(function(w) { return keuKena_(tag, w); }).map(function(w) {
    var k = tag.id + '|' + w.id, dib = pb.bayar[k] || 0, ker = pb.ker[k] || 0, sisa = Math.max(0, tag.jumlah - dib - ker);
    return { idWb: w.id, nisn: w.nisn, nama: w.nama, idRombel: w.idRombel, namaRombel: w.namaRombel, tagihan: tag.jumlah, dibayar: dib, keringanan: ker, sisa: sisa,
      status: sisa <= 0 ? 'Lunas' : (dib + ker > 0 ? 'Sebagian' : 'Belum bayar') };
  }).sort(function(a, b) { return (a.namaRombel + a.nama).localeCompare(b.namaRombel + b.nama); });
}
function waStafTagihanDaftar(token) {
  var p = stafDariToken_(token), r = keuWajib_(p, 'lihat');
  var tg = keuTagSemua_().data, wbs = keuWbSemua_(), pb = keuBayarPeta_(), kat = keuKatPeta_(), rb = honProgramRombel_();
  var out = tg.map(function(tag) {
    var rows = keuRinci_(tag, wbs, pb), tot = { peserta: rows.length, lunas: 0, dibayar: 0, keringanan: 0, sisa: 0 };
    rows.forEach(function(x) { if (x.status === 'Lunas') tot.lunas++; tot.dibayar += x.dibayar; tot.keringanan += x.keringanan; tot.sisa += x.sisa; });
    tag.namaKategori = kat[tag.kategori] ? kat[tag.kategori].nama : tag.kategori;
    tag.namaSasaran = tag.sasaran === 'Rombel' ? (rb[tag.nilaiSasaran] ? rb[tag.nilaiSasaran].nama : tag.nilaiSasaran) : (tag.sasaran === 'Program' ? tag.nilaiSasaran
      : tag.sasaran === 'Siswa' ? String(tag.nilaiSasaran).split(',').filter(String).length + ' siswa tertentu' : 'Semua warga belajar');
    tag.ringkas = tot;
    return tag;
  }).sort(function(a, b) { return (b.aktif - a.aktif) || String(b.jatuhTempo).localeCompare(String(a.jatuhTempo)); });
  var rombel = [], program = {};
  absKelas_('').forEach(function(k) { if (!rombel.some(function(x) { return x.id === k.idRombel; })) rombel.push({ id: k.idRombel, nama: k.namaRombel }); if (k.program) program[k.program] = true; });
  rombel.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  return { tagihan: out, catat: r.catat, kategori: keuKategori_().filter(function(k) { return k.jenis === 'Pemasukan'; }), rombel: rombel, program: Object.keys(program).sort(), sasaran: KEU.SASARAN,
    wb: wbs.filter(function(w) { return w.aktif; }).map(function(w) { return { id: w.id, nama: w.nama, rombel: w.namaRombel }; }).sort(function(a, b) { return (a.rombel + a.nama).localeCompare(b.rombel + b.nama); }),
    transferMenunggu: ksJumlahTfMenunggu_() };
}
// d: {id?, nama, kategori, jumlah, sasaran, nilaiSasaran, jatuhTempo, keterangan}
function waStafTagihanSimpan(token, d) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  d = d || {};
  var nama = String(d.nama || '').trim();
  if (nama.length < 3) throw new Error('Isi nama tagihan (mis. Iuran November 2026).');
  var kat = keuKatPeta_()[String(d.kategori || '')];
  if (!kat || kat.jenis !== 'Pemasukan') throw new Error('Pilih kategori pemasukan.');
  var jumlah = Math.round(keuAngka_(d.jumlah));
  if (jumlah <= 0) throw new Error('Jumlah tagihan harus lebih dari 0.');
  if (KEU.SASARAN.indexOf(String(d.sasaran)) < 0) throw new Error('Pilih sasaran tagihan.');
  if (d.sasaran !== 'Semua' && !String(d.nilaiSasaran || '').trim()) throw new Error('Pilih ' + (d.sasaran === 'Rombel' ? 'rombel' : d.sasaran === 'Siswa' ? 'siswa' : 'program') + ' sasaran.');
  if (d.sasaran === 'Siswa') d.nilaiSasaran = (Array.isArray(d.nilaiSasaran) ? d.nilaiSasaran : String(d.nilaiSasaran).split(',')).map(function(x) { return String(x).trim(); }).filter(String).join(',');
  var jt = d.jatuhTempo ? absTglSah_(d.jatuhTempo) : '';
  var t = absBaca_(KEU.TAB_TAG, KEU.HDR_TAG);
  var isi = { 'NAMA': nama.slice(0, 120), 'KATEGORI': kat.kode, 'JUMLAH': jumlah, 'SASARAN': d.sasaran, 'NILAI SASARAN': d.sasaran === 'Semua' ? '' : String(d.nilaiSasaran), 'JATUH TEMPO': jt, 'KETERANGAN': String(d.keterangan || '').slice(0, 300) };
  if (d.id) {
    for (var i = 1; i < t.v.length; i++) {
      if (sTeks_(absNilai_(t, t.v[i], 'ID TAGIHAN')).trim() !== String(d.id)) continue;
      var row = t.v[i].slice();
      Object.keys(isi).forEach(function(k) { var c = absCol_(t, k); if (c >= 0) row[c] = isi[k]; });
      t.sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
      catat_(p.peran, '-', p.nama, 'Ubah tagihan', d.id + ' ' + nama, 'OK');
      return { sukses: true, id: String(d.id) };
    }
    throw new Error('Tagihan tidak ditemukan.');
  }
  var id = 'TAG-' + absId_().toUpperCase();
  isi['ID TAGIHAN'] = id; isi['TAHUN PELAJARAN'] = absSim_().tahun; isi['AKTIF'] = true; isi['DIBUAT OLEH'] = p.nama; isi['DIBUAT PADA'] = absWaktu_();
  t.sh.appendRow(absBaris_(t, isi));
  catat_(p.peran, '-', p.nama, 'Tagihan baru', id + ' ' + nama + ' ' + jumlah, 'OK');
  npTagihanBaru_(id);   // v1.50.0: notifikasi ke siswa sasaran
  return { sukses: true, id: id };
}
function waStafTagihanAktif(token, id, aktif) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  var t = absBaca_(KEU.TAB_TAG, KEU.HDR_TAG);
  for (var i = 1; i < t.v.length; i++) {
    if (sTeks_(absNilai_(t, t.v[i], 'ID TAGIHAN')).trim() !== String(id)) continue;
    t.sh.getRange(i + 1, absCol_(t, 'AKTIF') + 1).setValue(!!aktif);
    catat_(p.peran, '-', p.nama, aktif ? 'Aktifkan tagihan' : 'Tutup tagihan', String(id), 'OK');
    return { sukses: true };
  }
  throw new Error('Tagihan tidak ditemukan.');
}
function keuTagCari_(id) {
  var tag = keuTagSemua_().data.filter(function(x) { return x.id === String(id); })[0];
  if (!tag) throw new Error('Tagihan tidak ditemukan.');
  return tag;
}
function waStafTagihanRinci(token, id) {
  var p = stafDariToken_(token), r = keuWajib_(p, 'lihat');
  var tag = keuTagCari_(id), rows = keuRinci_(tag, keuWbSemua_(), keuBayarPeta_());
  return { tagihan: tag, wb: rows, catat: r.catat, akun: kalAkun_().filter(function(a) { return a.aktif !== false; }), onlineAktif: gwDoku_().aktif, metode: gwDoku_().aktif ? gwMetode_() : [] };
}
// d: {idTagihan, idWb, jumlah, tanggal, catatan, bukti?}
function waStafTagihanBayar(token, d) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  d = d || {};
  var tag = keuTagCari_(d.idTagihan);
  var w = keuWbSemua_().filter(function(x) { return x.id === String(d.idWb); })[0];
  if (!w || !keuKena_(tag, w)) throw new Error('Warga belajar ini tidak termasuk sasaran tagihan.');
  var row = keuRinci_(tag, [w], keuBayarPeta_())[0];
  var jumlah = Math.round(keuAngka_(d.jumlah));
  if (jumlah <= 0) throw new Error('Jumlah bayar harus lebih dari 0.');
  if (jumlah > row.sisa) throw new Error('Jumlah melebihi sisa tagihan (Rp' + row.sisa + ').');
  var tgl = d.tanggal ? absTglSah_(d.tanggal) : absHariIni_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = keuTrxTab_(), id = 'TRX-' + absId_().toUpperCase();
    var isi = {
      'ID TRANSAKSI': id, 'TANGGAL': tgl, 'JENIS': 'Pemasukan', 'KATEGORI KEUANGAN': tag.kategori, 'WARGA BELAJAR': w.id,
      'URAIAN': ('Pembayaran ' + tag.nama + ' - ' + w.nama + (d.catatan ? ' (' + String(d.catatan).slice(0, 100) + ')' : '')).slice(0, 300),
      'JUMLAH': jumlah, 'SUMBER DANA': KEU.SUMBER_KAT[tag.kategori] || 'Swadaya', 'PIHAK TERKAIT': w.nama, 'STATUS': 'Disetujui',
      'TAHUN PELAJARAN': absSim_().tahun, 'DICATAT OLEH': p.nama, 'DICATAT PADA': absWaktu_(), 'TAGIHAN': tag.id,
      'AKUN KAS': kalAkunSah_(d.akun)
    };
    if (d.bukti) isi['BUKTI'] = keuSimpanBukti_(d.bukti, 'BAYAR-' + tag.id + '-' + w.id);
    t.sh.appendRow(absBaris_(t, isi));
  } finally { lock.releaseLock(); }
  catat_(p.peran, w.idRombel, p.nama, 'Bayar tagihan', tag.nama + ' ' + w.nama + ' ' + jumlah, 'OK');
  npBayarDiterima_(w.id, tag.nama, jumlah, 'dicatat petugas');   // v1.50.0: notifikasi
  aqrSetelahBayar_(tag.id, w.id, 'Dicatat ' + p.nama, id);   // v1.67.0: tagihan aktivasi QR lunas -> QR aktif
  return { sukses: true, id: id, tanggal: tgl, jumlah: jumlah, sisa: row.sisa - jumlah, nama: w.nama, nisn: w.nisn, rombel: w.namaRombel, tagihan: tag.nama, petugas: p.nama, lembaga: nilLembaga_() };
}
// d: {idTagihan, idWb, jumlah, alasan}
function waStafTagihanKeringanan(token, d) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'catat');
  d = d || {};
  var tag = keuTagCari_(d.idTagihan);
  var w = keuWbSemua_().filter(function(x) { return x.id === String(d.idWb); })[0];
  if (!w || !keuKena_(tag, w)) throw new Error('Warga belajar ini tidak termasuk sasaran tagihan.');
  var row = keuRinci_(tag, [w], keuBayarPeta_())[0];
  var jumlah = Math.round(keuAngka_(d.jumlah));
  if (jumlah <= 0 || jumlah > row.sisa) throw new Error('Keringanan harus antara 1 dan sisa tagihan (Rp' + row.sisa + ').');
  var alasan = String(d.alasan || '').trim();
  if (alasan.length < 5) throw new Error('Tulis alasan keringanan (minimal 5 huruf).');
  var t = absBaca_(KEU.TAB_KER, KEU.HDR_KER);
  t.sh.appendRow(absBaris_(t, { 'ID': absId_(), 'TAGIHAN': tag.id, 'WARGA BELAJAR': w.id, 'JUMLAH': jumlah, 'ALASAN': alasan.slice(0, 300), 'DICATAT OLEH': p.nama, 'DICATAT PADA': absWaktu_() }));
  catat_(p.peran, w.idRombel, p.nama, 'Keringanan tagihan', tag.nama + ' ' + w.nama + ' ' + jumlah + ': ' + alasan, 'OK');
  npKirim_('keringanan', { judul: 'Keringanan ' + tag.nama, isi: 'Anda mendapat keringanan ' + honRp_(jumlah) + '. Sisa tagihan menjadi ' + honRp_(row.sisa - jumlah) + '.', aksi: 'tagihan_saya', siswa: [w.id] });   // v1.50.0: notifikasi
  return { sukses: true };
}
// Tunggakan satu WB (semua tagihan aktif) — kode = ID WB atau NISN
function waStafTunggakanWb(token, kode) {
  var p = stafDariToken_(token);
  keuWajib_(p, 'lihat');
  var wbs = keuWbSemua_(), k = String(kode || '').trim();
  var w = wbs.filter(function(x) { return x.id === k || (x.nisn && x.nisn === k); })[0];
  if (!w) throw new Error('Warga belajar tidak ditemukan.');
  var pb = keuBayarPeta_(), out = [];
  keuTagSemua_().data.forEach(function(tag) {
    if (!tag.aktif || !keuKena_(tag, w)) return;
    var x = keuRinci_(tag, [w], pb)[0];
    x.idTagihan = tag.id; x.namaTagihan = tag.nama; x.jatuhTempo = tag.jatuhTempo;
    out.push(x);
  });
  return { wb: w, tagihan: out, totalSisa: out.reduce(function(s, x) { return s + x.sisa; }, 0) };
}



// ============================================================================
// BERANDA: kartu "Agenda & Informasi" sesuai peran (staf: waStafBeranda, siswa: waSiswaBeranda).
// Tiap kartu: {judul, ikon, menu, ringkas, item:[{t, s, n, w}], kosong}. w = merah|kuning|hijau|biru.
// Setiap kartu dihitung terpisah; bila satu gagal, kartu lain tetap tampil.
// ============================================================================
function brdTgl_(n) { var d = new Date(); d.setDate(d.getDate() + n); return Utilities.formatDate(d, absTz_(), 'yyyy-MM-dd'); }
function brdTglPendek_(iso) {
  var b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'], p = String(iso || '').split('-');
  if (iso === absHariIni_()) return 'Hari ini';
  if (iso === brdTgl_(1)) return 'Besok';
  return p.length === 3 ? Number(p[2]) + ' ' + b[Number(p[1]) - 1] : String(iso || '');
}
function brdRp_(n) { var v = Math.round(Number(n) || 0), s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (v < 0 ? '-' : '') + 'Rp' + s; }
function brdKartu_(out, fn) {
  try { var k = fn(); if (k) out.push(k); } catch (e) { try { Logger.log('beranda: ' + (e && e.stack || e)); } catch (e2) {} }
}
function brdMapelBm_() {
  var m = {};
  mapelAktifSemua_().forEach(function(x) { m[x.idMapel] = { nama: x.namaMapel, rombel: x.namaRombel, idRombel: x.idRombel, tutor: x.tutorTeks }; });
  return m;
}
// Agenda ujian (online dari Jadwal Ujian + tatap muka dari ASESMEN) dalam hari hari ke depan.
function brdAgenda_(bolehBm, bolehSim, hari) {
  var h0 = absHariIni_(), h1 = brdTgl_(hari || 21), mp = brdMapelBm_(), out = [];
  ujJadwalSemua_().forEach(function(j) {
    if (!j.tanggal || j.tanggal < h0 || j.tanggal > h1) return;
    var m = mp[j.idMapel];
    if (!m || (bolehBm && !bolehBm(j.idMapel, m))) return;
    out.push({ tgl: j.tanggal, t: j.jenis + ' ' + m.nama, s: m.rombel + ' · ' + j.jam + ' · ' + j.durasi + ' menit · online' });
  });
  try {
    nilAsSemua_(null).forEach(function(a) {
      if (a.tanggal < h0 || a.tanggal > h1) return;
      if (bolehSim && !bolehSim(a.idRombel, a.kodeMapel)) return;
      out.push({ tgl: a.tanggal, t: a.jenis + ' ' + a.namaMapel, s: a.namaRombel + ' · ' + a.mulai + '–' + a.selesai + ' · ' + (a.ruang || 'tatap muka') });
    });
  } catch (e) {}
  out.sort(function(a, b) { return a.tgl.localeCompare(b.tgl); });
  var h3 = brdTgl_(3);
  return out.slice(0, 10).map(function(x) { return { t: x.t, s: x.s, n: brdTglPendek_(x.tgl), w: x.tgl === h0 ? 'merah' : (x.tgl <= h3 ? 'kuning' : 'biru') }; });
}
function brdKartuAgenda_(bolehBm, bolehSim) {
  return { judul: 'Agenda ujian 3 minggu ke depan', ikon: 'agenda', menu: 'kalender', item: brdAgenda_(bolehBm, bolehSim, 21), kosong: 'Belum ada UTS/UAS terjadwal dalam 3 minggu ke depan.' };
}
// Jawaban diskusi/tugas yang belum dinilai, per mapel.
function brdBelumDinilai_(mapelBoleh) {
  var v = getSheetData(CONFIG.SHEETS.JAWABAN), mp = brdMapelBm_(), per = {};
  if (!v.length) return [];
  var hd = v[0].map(function(x) { return String(x).trim(); });
  var iM = hd.indexOf('ID Mapel'), iJ = hd.indexOf('Jenis'), iN = hd.indexOf('Nilai'), iW = hd.indexOf('Jawaban');
  for (var i = 1; i < v.length; i++) {
    var jn = sTeks_(v[i][iJ]).trim();
    if (jn !== 'Diskusi' && jn !== 'Tugas') continue;
    if (sTeks_(v[i][iN]).trim() !== '' || !sTeks_(v[i][iW]).trim()) continue;
    var id = sTeks_(v[i][iM]).trim();
    if (!mp[id] || (mapelBoleh && !mapelBoleh[id])) continue;
    per[id] = (per[id] || 0) + 1;
  }
  return Object.keys(per).map(function(id) { return { id: id, nama: mp[id].nama, rombel: mp[id].rombel, tutor: mp[id].tutor, jumlah: per[id] }; })
    .sort(function(a, b) { return b.jumlah - a.jumlah; });
}
function brdKartuBelumDinilai_(mapelBoleh, perTutor) {
  var d = brdBelumDinilai_(mapelBoleh), total = d.reduce(function(s, x) { return s + x.jumlah; }, 0);
  var item;
  if (perTutor) {
    var t = {};
    d.forEach(function(x) { var k = x.tutor || 'Belum ada tutor'; t[k] = (t[k] || 0) + x.jumlah; });
    item = Object.keys(t).sort(function(a, b) { return t[b] - t[a]; }).slice(0, 8).map(function(k) { return { t: k, s: 'jawaban belum dinilai', n: String(t[k]), w: t[k] >= 10 ? 'merah' : 'kuning' }; });
  } else {
    item = d.slice(0, 8).map(function(x) { return { t: x.nama, s: x.rombel, n: String(x.jumlah), w: x.jumlah >= 10 ? 'merah' : 'kuning' }; });
  }
  return { judul: 'Tugas & diskusi belum dinilai', ikon: 'tugas', menu: 'nilai', ringkas: String(total), item: item, kosong: 'Semua jawaban sudah dinilai. Mantap!' };
}
// WB dengan kehadiran di bawah syarat pada kelas-kelas tertentu (semester berjalan).
// v1.38.4: memakai kehadiran gabungan (TH.E-Course + tatap muka), sama dengan syarat ujian.
function brdHadirRendah_(kelas) {
  var per = nilPeriode_(), at = nilAturan_(), byR = {}, out = [];
  keuWbSemua_().forEach(function(x) { if (x.aktif) (byR[x.idRombel] = byR[x.idRombel] || []).push(x); });
  kelas.forEach(function(k) {
    var hk = nilHadirKelas_(per, k.idRombel + '|' + k.kodeMapel);
    (byR[k.idRombel] || []).forEach(function(x) {
      var g = hk.gabung(x.id);
      if (g.total && g.persen < at.syaratHadir) out.push({ ps: g.persen, t: x.nama, s: k.namaMapel + ' · ' + k.namaRombel, n: g.persen + '%', w: 'merah' });
    });
  });
  out.sort(function(a, b) { return a.ps - b.ps; });
  return { jumlah: out.length, syarat: at.syaratHadir, item: out.slice(0, 8).map(function(x) { return { t: x.t, s: x.s, n: x.n, w: x.w }; }) };
}
function brdKartuHadirRendah_(kelas, judul) {
  var h = brdHadirRendah_(kelas);
  return { judul: judul || 'Kehadiran di bawah ' + h.syarat + '%', ikon: 'peringatan', menu: 'laporanHadir', ringkas: String(h.jumlah), item: h.item,
    kosong: 'Semua warga belajar memenuhi syarat kehadiran ' + h.syarat + '%.' };
}
function brdJadwalItem_(x, label) {
  return { t: x.mulai + '–' + x.selesai + ' · ' + x.namaMapel, s: x.namaRombel + (x.namaTutor ? ' · ' + x.namaTutor : ''), n: label, w: '' };
}
function brdKartuJadwalHariIni_(token) {
  var d = waStafJadwalHari(token);
  var item = d.jadwal.map(function(x) {
    var o = brdJadwalItem_(x, x.hadir ? 'Hadir ' + x.jamHadir : 'Belum');
    o.w = x.hadir ? 'hijau' : 'kuning';
    return o;
  });
  return { judul: 'Jadwal hari ini (' + d.hari + ')', ikon: 'jadwal', menu: 'jadwal', ringkas: d.jadwal.filter(function(x) { return x.hadir; }).length + '/' + d.jadwal.length,
    item: item, kosong: 'Tidak ada jadwal tatap muka hari ini.' };
}
function brdKartuJadwalTutor_(token, s) {
  var d = waStafJadwalHari(token), judul = 'Jadwal mengajar hari ini';
  var item = d.jadwal.map(function(x) { var o = brdJadwalItem_(x, x.hadir ? 'Sudah diabsen' : 'Belum diabsen'); o.s = x.namaRombel; o.w = x.hadir ? 'hijau' : 'kuning'; return o; });
  if (!item.length && s) {
    var pmS = jadBacaPm_().data.filter(function(x) { return x.idTutor === s.id; });
    for (var n = 1; n <= 7 && !item.length; n++) {
      var tg = brdTgl_(n), j = pmS.filter(function(x) { return jadBerlaku_(x, tg); });
      if (!j.length) continue;
      jadLengkapi_(j);
      j.sort(function(a, b) { return a.mulai.localeCompare(b.mulai); });
      judul = 'Jadwal mengajar berikutnya';
      item = j.map(function(x) { var o = brdJadwalItem_(x, brdTglPendek_(tg)); o.s = x.namaRombel + ' · ' + jadHariDari_(tg); o.w = 'biru'; return o; });
    }
  }
  return { judul: judul, ikon: 'jadwal', menu: 'jadwal', item: item, kosong: 'Belum ada jadwal mengajar dalam 7 hari ke depan.' };
}
function brdKas_() {
  var saldo = 0, menunggu = [], semua = keuSemua_();
  semua.forEach(function(x) {
    if (x.status === 'Menunggu') menunggu.push(x);
    if (keuSah_(x) && x.jenis !== 'Mutasi') saldo += x.jenis === 'Pengeluaran' ? -x.jumlah : x.jumlah;
  });
  var tg = keuTagSemua_().data.filter(function(t) { return t.aktif; }), wbs = keuWbSemua_(), pb = keuBayarPeta_(), sisa = 0, nunggak = {};
  tg.forEach(function(t) { keuRinci_(t, wbs, pb).forEach(function(r) { if (r.sisa > 0) { sisa += r.sisa; nunggak[r.idWb] = true; } }); });
  return { saldo: saldo, menunggu: menunggu, tunggakan: sisa, wbNunggak: Object.keys(nunggak).length };
}
function brdKartuKas_(k, judul) {
  var item = [{ t: 'Saldo kas', s: 'transaksi disetujui', n: brdRp_(k.saldo), w: k.saldo < 0 ? 'merah' : 'hijau' },
    { t: 'Pengeluaran menunggu persetujuan', s: k.menunggu.length ? brdRp_(k.menunggu.reduce(function(s, x) { return s + x.jumlah; }, 0)) : 'tidak ada', n: String(k.menunggu.length), w: k.menunggu.length ? 'kuning' : '' },
    { t: 'Tunggakan tagihan warga belajar', s: k.wbNunggak + ' warga belajar', n: brdRp_(k.tunggakan), w: k.tunggakan > 0 ? 'merah' : 'hijau' }];
  return { judul: judul || 'Keuangan', ikon: 'kas', menu: 'keuangan', ringkas: brdRp_(k.saldo), item: item, kosong: '' };
}
function brdHonorStatus_() {
  var t = absBaca_('REKAP HONOR'), out = { Draft: 0, Ditahan: 0, Disetujui: 0, 'Dibayar Sebagian': 0 }, nilai = { Disetujui: 0, 'Dibayar Sebagian': 0, Draft: 0 };
  for (var i = 1; i < t.v.length; i++) {
    var st = sTeks_(absNilai_(t, t.v[i], 'STATUS')).trim();
    if (out[st] === undefined) continue;
    out[st]++;
    if (nilai[st] !== undefined) nilai[st] += keuAngka_(absNilai_(t, t.v[i], 'TOTAL HONOR'));
  }
  return { n: out, total: nilai };
}
function brdIzinKsMenunggu_() {
  var t = absBaca_(ABS.TAB_KS, ABS.HDR_KS), out = [];
  for (var i = t.v.length - 1; i >= 1; i--) {
    var o = absKsBaris_(t, t.v[i]);
    if (o.status === 'Menunggu' && o.jenis !== 'Hadir') out.push({ t: o.jenis + ' · ' + o.nama, s: (o.mulai || o.tanggal) + (o.selesai && o.selesai !== o.mulai ? ' s.d. ' + o.selesai : '') + (o.keterangan ? ' · ' + o.keterangan : ''), n: 'Menunggu', w: 'kuning' });
  }
  return out;
}

// ---------- staf ----------
function waStafBeranda(token, paksa) {
  var p = stafDariToken_(token), q = absPeran_(p), k = [];
  var ckB = 'brd_' + p.id, cB = CacheService.getScriptCache();
  if (!paksa) { try { var lamaB = cB.get(ckB); if (lamaB) return JSON.parse(lamaB); } catch (eB) {} }
  var saya = q.tutor ? absTutorSaya_(p) : null;
  if (q.tutor) {
    var mapelSaya = {};
    bacaEnrollment_().forEach(function(e) { if (e.idPengguna === p.id) mapelSaya[e.idMapel] = true; });
    var kelasSaya = saya ? absKelas_(saya.id) : [];
    var kunci = {};
    kelasSaya.forEach(function(x) { kunci[x.idRombel + '|' + x.kodeMapel] = true; });
    brdKartu_(k, function() { return brdKartuJadwalTutor_(token, saya); });
    brdKartu_(k, function() { return brdKartuBelumDinilai_(mapelSaya, false); });
    brdKartu_(k, function() { return brdKartuAgenda_(function(id) { return !!mapelSaya[id]; }, function(r, m) { return !!kunci[r + '|' + m]; }); });
    brdKartu_(k, function() {
      if (!saya) return { judul: 'Honor', ikon: 'honor', menu: 'honorSaya', item: [], kosong: 'Akun Anda belum terhubung ke data tutor. Hubungi admin.' };
      var h = waStafHonorSaya(token), bulan = absHariIni_().slice(0, 7), hd = honKehadiran_(bulan, honAturan_())[saya.id] || { jumlah: 0, total: 0 };
      var item = [{ t: 'Belum dibayar', s: 'honor yang sudah disetujui', n: brdRp_(h.saldo.belumDibayar), w: h.saldo.belumDibayar > 0 ? 'hijau' : '' },
        { t: 'Bulan ini (sementara)', s: hd.jumlah + ' kehadiran', n: brdRp_(hd.total), w: 'biru' }];
      if (h.saldo.ditahan > 0) item.push({ t: 'Ditahan', s: 'selesaikan penilaian agar honor cair', n: brdRp_(h.saldo.ditahan), w: 'merah' });
      return { judul: 'Saldo honor', ikon: 'honor', menu: 'honorSaya', ringkas: brdRp_(h.saldo.belumDibayar), item: item, kosong: '' };
    });
    if (kelasSaya.length) brdKartu_(k, function() { return brdKartuHadirRendah_(kelasSaya, 'Warga belajar kurang hadir di kelas Anda'); });
  } else if (q.ks) {
    brdKartu_(k, function() {
      var s = waStafKsAbsenStatus(token), h = s.hariIni;
      return { judul: 'Absen saya hari ini', ikon: 'hadir', menu: 'absenSaya', item: [h ? { t: 'Sudah absen', s: 'pukul ' + h.jam + ' · ' + (h.status || ''), n: h.status || 'Hadir', w: h.status === 'Perlu dicek' ? 'kuning' : 'hijau' }
        : { t: 'Belum absen', s: 'selfie di area Front Office sekretariat', n: 'Belum', w: 'merah' }], kosong: '' };
    });
    brdKartu_(k, function() { return brdKartuJadwalHariIni_(token); });
    brdKartu_(k, function() {
      var u = waStafUsulanDaftar(token).usulan.filter(function(x) { return x.status === 'Menunggu'; });
      return { judul: 'Usulan jadwal menunggu persetujuan', ikon: 'setuju', menu: 'usulanJadwal', ringkas: String(u.length),
        item: u.slice(0, 6).map(function(x) { return { t: x.namaMapel + ' · ' + x.namaRombel, s: x.namaTutor + ' · ' + x.hari + ' ' + x.slot, n: 'Menunggu', w: 'kuning' }; }), kosong: 'Tidak ada usulan yang menunggu.' };
    });
    brdKartu_(k, function() { return brdKartuAgenda_(null, null); });
    brdKartu_(k, function() { return brdKartuHadirRendah_(absKelas_(''), null); });
  } else if (q.admin) {
    brdKartu_(k, function() { return brdKartuAgenda_(null, null); });
    brdKartu_(k, function() { return brdKartuBelumDinilai_(null, true); });
    brdKartu_(k, function() {
      var item = [], kelas = absKelas_(''), wali = nilWaliPeta_(), rb = {}, tanpaTutor = kelas.filter(function(x) { return !x.idTutor; });
      kelas.forEach(function(x) { rb[x.idRombel] = x.namaRombel; });
      var tanpaWali = Object.keys(rb).filter(function(id) { return !wali[id]; }).map(function(id) { return rb[id]; }).sort();
      var aju = 0;
      try {
        var v = getSheetData('Pengajuan Enrollment'), iS = v.length ? v[0].map(function(x) { return String(x).trim(); }).indexOf('Status') : -1;
        for (var i = 1; i < v.length; i++) if (iS >= 0 && /menunggu/i.test(sTeks_(v[i][iS]))) aju++;
      } catch (e) {}
      if (aju) item.push({ t: 'Pengajuan enrollment tutor', s: 'menunggu keputusan', n: String(aju), w: 'kuning' });
      if (tanpaWali.length) item.push({ t: 'Rombel tanpa wali kelas', s: tanpaWali.slice(0, 6).join(', '), n: String(tanpaWali.length), w: 'kuning' });
      if (tanpaTutor.length) item.push({ t: 'Mapel aktif tanpa tutor', s: tanpaTutor.slice(0, 4).map(function(x) { return x.namaMapel + ' ' + x.namaRombel; }).join(', ') + (tanpaTutor.length > 4 ? ', …' : ''), n: String(tanpaTutor.length), w: 'kuning' });
      return { judul: 'Perlu ditindaklanjuti', ikon: 'info', menu: 'waliKelas', ringkas: String(item.length), item: item, kosong: 'Tidak ada yang perlu ditindaklanjuti.' };
    });
    brdKartu_(k, function() { return brdKartuKas_(brdKas_()); });
  } else if (q.sa) {
    brdKartu_(k, function() {
      var kas = brdKas_(), hs = brdHonorStatus_(), izin = brdIzinKsMenunggu_(), item = [];
      kas.menunggu.slice(0, 5).forEach(function(x) { item.push({ t: 'Pengeluaran: ' + x.uraian, s: tglIndoBrd_(x.tanggal) + ' · ' + x.dicatatOleh, n: brdRp_(x.jumlah), w: 'kuning' }); });
      izin.slice(0, 4).forEach(function(x) { item.push(x); });
      if (hs.n.Draft) item.push({ t: 'Rekap honor perlu disetujui', s: brdRp_(hs.total.Draft), n: String(hs.n.Draft), w: 'kuning' });
      return { judul: 'Menunggu persetujuan Anda', ikon: 'setuju', menu: kas.menunggu.length ? 'keuangan' : (izin.length ? 'persetujuanKs' : 'rekapHonor'),
        ringkas: String(kas.menunggu.length + izin.length + hs.n.Draft), item: item, kosong: 'Tidak ada yang menunggu persetujuan.' };
    });
    brdKartu_(k, function() { return brdKartuKas_(brdKas_()); });
    brdKartu_(k, function() { return brdKartuAgenda_(null, null); });
  } else if (q.bend) {
    brdKartu_(k, function() { return brdKartuKas_(brdKas_()); });
    brdKartu_(k, function() {
      var hs = brdHonorStatus_(), n = hs.n.Disetujui + hs.n['Dibayar Sebagian'];
      return { judul: 'Honor tutor siap dibayar', ikon: 'honor', menu: 'rekapHonor', ringkas: String(n),
        item: n ? [{ t: n + ' rekap honor disetujui Ketua Yayasan', s: 'belum lunas dibayar', n: brdRp_(hs.total.Disetujui + hs.total['Dibayar Sebagian']), w: 'hijau' }] : [], kosong: 'Tidak ada honor yang menunggu pembayaran.' };
    });
  } else if (q.fo) {
    brdKartu_(k, function() { return brdKartuJadwalHariIni_(token); });
    brdKartu_(k, function() { return brdKartuAgenda_(null, null); });
  } else if (p.peran === 'Koordinator Unit') {   // v1.61.0
    brdKartu_(k, function() { return ubKartuBeranda_(p); });
    brdKartu_(k, function() { return brdKartuAgenda_(null, null); });
  } else if (q.koord) {
    brdKartu_(k, function() { return brdKartuAgenda_(null, null); });
    brdKartu_(k, function() { return brdKartuBelumDinilai_(null, true); });
    brdKartu_(k, function() { return brdKartuJadwalHariIni_(token); });
  }
  var hasilB = { peran: p.peran, kartu: k, waktu: absWaktu_() };
  try { cB.put(ckB, JSON.stringify(hasilB), 600); } catch (eB2) {}
  return hasilB;
}
function tglIndoBrd_(iso) { return brdTglPendek_(iso); }

// ---------- siswa ----------
function waSiswaBeranda(token, paksa) {
  var s = siswaDariSesi_(token), k = [], h0 = absHariIni_(), nn = normNama_(s.nama);
  var ckS = 'brds_' + Utilities.base64EncodeWebSafe(String(s.idRombel) + '|' + nn).slice(0, 200), cS = CacheService.getScriptCache();
  if (!paksa) { try { var lamaS = cS.get(ckS); if (lamaS) return JSON.parse(lamaS); } catch (eS) {} }
  var mp = brdMapelBm_();
  var mapelKu = {};
  Object.keys(mp).forEach(function(id) { if (mp[id].idRombel === String(s.idRombel)) mapelKu[id] = mp[id]; });
  // pemetaan ke SIM SETARA (rombel & ID WB) untuk asesmen tatap muka, kehadiran, tagihan
  var peta = nilPetaBm_(), simR = '', wb = null;
  Object.keys(peta.rombel).forEach(function(r) { if (peta.rombel[r][s.idRombel]) simR = r; });
  if (simR) {
    var nisn = '';
    (nilSiswaBm_()[String(s.idRombel)] || []).forEach(function(x) { if (normNama_(x.nama) === nn) nisn = x.nisn; });
    wb = nilCocokWb_(absWbRombel_(simR), nisn, s.nama);
  }
  // 1. agenda: ujian + batas waktu tugas/diskusi yang belum dikerjakan
  brdKartu_(k, function() {
    var item = brdAgenda_(function(id) { return !!mapelKu[id]; }, function(r) { return r === simR; }, 21), h1 = brdTgl_(14), h3 = brdTgl_(3);
    var sudah = {}, v = getSheetData(CONFIG.SHEETS.JAWABAN);
    if (v.length) {
      var hd = v[0].map(function(x) { return String(x).trim(); }), iR = hd.indexOf('ID Rombel'), iMt = hd.indexOf('ID Materi'), iS = hd.indexOf('Nama Siswa');
      for (var i = 1; i < v.length; i++) if (sTeks_(v[i][iR]) === String(s.idRombel) && normNama_(v[i][iS]) === nn) sudah[sTeks_(v[i][iMt]).trim()] = true;
    }
    var m = getSheetData(CONFIG.SHEETS.MATERI), tugas = [];
    if (m.length) {
      var hm = m[0].map(function(x) { return String(x).trim(); });
      var cId = hm.indexOf('ID Materi'), cMp = hm.indexOf('ID Mapel'), cJ = hm.indexOf('Jenis'), cJd = hm.indexOf('Judul'), cB = hm.indexOf('Batas Waktu (opsional)'), cSt = hm.indexOf('Status');
      for (var j = 1; j < m.length; j++) {
        var r = m[j], idm = sTeks_(r[cMp]).trim(), jn = sTeks_(r[cJ]).trim();
        if (!mapelKu[idm] || jn === 'Materi' || jn === 'Ujian' || (cSt >= 0 && sTeks_(r[cSt]).trim() && sTeks_(r[cSt]).trim() !== 'Aktif')) continue;
        var bt = cB >= 0 ? absTgl_(r[cB]) : '';
        if (!bt || bt < h0 || bt > h1 || sudah[sTeks_(r[cId]).trim()]) continue;
        tugas.push({ tgl: bt, t: 'Batas ' + jn.toLowerCase() + ': ' + sTeks_(r[cJd]), s: mapelKu[idm].nama + ' · belum dikerjakan' });
      }
    }
    tugas.sort(function(a, b) { return a.tgl.localeCompare(b.tgl); });
    tugas.slice(0, 5).forEach(function(x) { item.push({ t: x.t, s: x.s, n: brdTglPendek_(x.tgl), w: x.tgl <= h3 ? 'merah' : 'kuning' }); });
    return { judul: 'Agenda terdekat', ikon: 'agenda', menu: 'kalender', item: item, kosong: 'Tidak ada ujian atau tenggat tugas dalam waktu dekat.' };
  });
  // 2. nilai tugas/diskusi terbaru
  brdKartu_(k, function() {
    var v = getSheetData(CONFIG.SHEETS.JAWABAN), out = [];
    if (v.length) {
      var hd = v[0].map(function(x) { return String(x).trim(); });
      var iR = hd.indexOf('ID Rombel'), iS = hd.indexOf('Nama Siswa'), iN = hd.indexOf('Nilai'), iJd = hd.indexOf('Judul Materi'), iNm = hd.indexOf('Nama Mapel'), iK = hd.indexOf('Komentar Tutor'), iW = hd.indexOf('Waktu Dinilai'), iJ = hd.indexOf('Jenis');
      for (var i = 1; i < v.length; i++) {
        var r = v[i];
        if (sTeks_(r[iR]) !== String(s.idRombel) || normNama_(r[iS]) !== nn) continue;
        var nl = sTeks_(r[iN]).trim();
        if (nl === '' || sTeks_(r[iJ]).trim() === 'Ujian') continue;
        out.push({ urut: absTgl_(r[iW]) + ('000000' + i).slice(-6), t: sTeks_(r[iJd]).replace(/^Diskusi Sesi \d+:\s*/, ''), s: sTeks_(r[iNm]) + (sTeks_(r[iK]).trim() ? ' · ' + sTeks_(r[iK]).slice(0, 90) : ''), n: nl, w: Number(nl) >= 70 ? 'hijau' : 'kuning' });
      }
    }
    out.sort(function(a, b) { return b.urut.localeCompare(a.urut); });
    return { judul: 'Nilai tugas & diskusi terbaru', ikon: 'nilai', menu: '', item: out.slice(0, 5).map(function(x) { return { t: x.t, s: x.s, n: x.n, w: x.w }; }), kosong: 'Belum ada tugas yang dinilai.' };
  });
  // 3. hasil UTS/UAS (online terbaik + nilai ujian kertas dari tutor)
  brdKartu_(k, function() {
    var jad = {}, out = [];
    ujJadwalSemua_().forEach(function(j) { if (mapelKu[j.idMapel]) jad[j.idUjian] = j; });
    var best = {};
    ujBaca_('HASIL').forEach(function(h) {
      if (String(h['ID Rombel']) !== String(s.idRombel) || normNama_(h['Nama Siswa']) !== nn || !jad[h['ID Ujian']]) return;
      var ps = parseFloat(h['Persen']) || 0;
      if (best[h['ID Ujian']] === undefined || ps > best[h['ID Ujian']]) best[h['ID Ujian']] = ps;
    });
    Object.keys(best).forEach(function(id) {
      var j = jad[id];
      var thB = null;
      try { thB = sbTertahan_(j, s.idRombel, s.nama); } catch (eTb) {}   // v1.57.0
      if (thB) { out.push({ t: j.jenis + ' ' + mapelKu[j.idMapel].nama, s: 'nilai terbuka setelah biaya ujian lunas', n: '**', w: 'kuning', tgl: j.tanggal }); return; }
      out.push({ t: j.jenis + ' ' + mapelKu[j.idMapel].nama, s: 'ujian online · KKM ' + j.kkm, n: String(Math.round(best[id] * 10) / 10), w: best[id] >= j.kkm ? 'hijau' : 'merah', tgl: j.tanggal });
    });
    if (wb) {
      var per = nilPeriode_(), t = absBaca_(NIL.TAB_NILAI, NIL.HDR_NILAI), nm = honNamaMapel_(), at = nilAturan_();
      for (var i = 1; i < t.v.length; i++) {
        var r = t.v[i];
        if (sTeks_(absNilai_(t, r, 'WARGA BELAJAR')).trim() !== wb.id || sTeks_(absNilai_(t, r, 'TAHUN PELAJARAN')).trim() !== per.tahun || sTeks_(absNilai_(t, r, 'SEMESTER')).trim() !== per.semester) continue;
        var nv = sTeks_(absNilai_(t, r, 'NILAI')).trim();
        if (nv === '') continue;
        var km = sTeks_(absNilai_(t, r, 'MAPEL')).trim();
        out.push({ t: sTeks_(absNilai_(t, r, 'JENIS ASESMEN')) + ' ' + (nm[km] || km), s: 'ujian tatap muka · KKM ' + at.kkm, n: nv, w: Number(nv) >= at.kkm ? 'hijau' : 'merah', tgl: absTgl_(absNilai_(t, r, 'TANGGAL')) });
      }
    }
    out.sort(function(a, b) { return String(b.tgl).localeCompare(String(a.tgl)); });
    return { judul: 'Hasil UTS / UAS', ikon: 'ujian', menu: '', item: out.slice(0, 8).map(function(x) { return { t: x.t, s: x.s, n: x.n, w: x.w }; }), kosong: 'Belum ada hasil UTS/UAS semester ini.' };
  });
  // 4. v1.38.4: kehadiran gabungan (absensi TH.E-Course + tatap muka) per mapel & penyelesaian sesi
  var statusBelajar = null;
  brdKartu_(k, function() {
    var per = nilPeriode_(), at = nilAturan_(), on = hdrOnline_(per), tm = hdrTatapMuka_(per), peta2 = hdrPetaBm_();
    var item = [], sh = 0, stt = 0;
    if (simR) {
      nilKelasRapor_(simR).forEach(function(kl) {
        var key = kl.idRombel + '|' + kl.kodeMapel;
        var bm = (peta2.kelas[key] || []).filter(function(b) { return b.idRombel === String(s.idRombel); });
        if (peta2.kelas[key] && !peta2.aktif[key]) return;          // mapel nonaktif di e-learning
        var g = hdrGabung_(on, wb ? (tm.hadir[wb.id + '|' + key] || 0) : 0, wb ? (tm.total[key] || 0) : 0, bm, s.nama);
        if (!g.total) return;
        sh += g.hadir; stt += g.total;
        item.push({ ps: g.persen, t: kl.namaMapel,
          s: 'TH.E-Course ' + g.online.hadir + '/' + g.online.total + (g.tatapMuka.total ? ' · tatap muka ' + g.tatapMuka.hadir + '/' + g.tatapMuka.total : ''),
          n: g.persen + '%', w: g.persen >= at.syaratHadir ? 'hijau' : (g.persen >= 50 ? 'kuning' : 'merah') });
      });
    }
    item.sort(function(a, b) { return a.ps - b.ps; });
    var rata = stt ? nilBulat_(sh * 100 / stt) : null;
    // penyelesaian sesi: diskusi aktif pada sesi yang sudah berakhir vs yang sudah dijawab
    var selesai = null, wajibD = 0, dikerjakan = 0;
    try {
      var cfg = taBaca_(), now = new Date().getTime(), dijawab = {};
      var vj = getSheetData(CONFIG.SHEETS.JAWABAN);
      if (vj.length) {
        var hj = vj[0].map(function(x) { return String(x).trim(); }), jR = hj.indexOf('ID Rombel'), jM = hj.indexOf('ID Materi'), jS = hj.indexOf('Nama Siswa');
        for (var a = 1; a < vj.length; a++) if (sTeks_(vj[a][jR]) === String(s.idRombel) && normNama_(vj[a][jS]) === nn) dijawab[sTeks_(vj[a][jM]).trim()] = true;
      }
      var vm = getSheetData(CONFIG.SHEETS.MATERI);
      if (vm.length) {
        var hm = vm[0].map(function(x) { return String(x).trim(); });
        var mId = hm.indexOf('ID Materi'), mMp = hm.indexOf('ID Mapel'), mJ = hm.indexOf('Jenis'), mSt = hm.indexOf('Status'), mSs = hm.indexOf('Sesi');
        for (var b2 = 1; b2 < vm.length; b2++) {
          var r2 = vm[b2];
          if (!mapelKu[sTeks_(r2[mMp]).trim()] || sTeks_(r2[mJ]).trim() !== 'Diskusi' || sTeks_(r2[mSt]).trim() !== 'Aktif') continue;
          var ps2 = taParse_(cfg, r2[mSs]);
          if (!ps2 || ps2.smt !== per.smt || taInfo_(cfg, ps2.smt, ps2.n, now).status !== 'lewat') continue;
          wajibD++;
          if (dijawab[sTeks_(r2[mId]).trim()]) dikerjakan++;
        }
      }
      if (wajibD) selesai = nilBulat_(dikerjakan * 100 / wajibD);
    } catch (eS) {}
    // status kondisi belajar: Bahaya (< 50%), Perlu perhatian (< syarat), Baik
    var buruk = function(x, batas) { return x !== null && x < batas; };
    var level = (buruk(rata, 50) || buruk(selesai, 50)) ? 'bahaya' : ((buruk(rata, at.syaratHadir) || buruk(selesai, 80)) ? 'perhatian' : 'baik');
    var pesan = [];
    if (rata !== null) pesan.push('Kehadiran ' + rata + '% (syarat ikut ujian ' + at.syaratHadir + '%)');
    if (selesai !== null) pesan.push('penyelesaian sesi ' + selesai + '% (' + dikerjakan + ' dari ' + wajibD + ' diskusi)');
    if (rata !== null || selesai !== null) {
      statusBelajar = {
        level: level, hadir: rata, selesai: selesai, syarat: at.syaratHadir,
        judul: level === 'bahaya' ? 'Status: BAHAYA' : (level === 'perhatian' ? 'Status: Perlu perhatian' : 'Status: Baik'),
        pesan: pesan.join(', ') + '. ' + (level === 'bahaya'
          ? 'Kamu berisiko tidak boleh mengikuti ujian dan tidak naik kelas. Segera isi absensi dan kerjakan diskusi yang tertinggal, atau hubungi tutor/wali kelas.'
          : level === 'perhatian' ? 'Masih di bawah target. Isi absensi tiap sesi dan selesaikan diskusi yang tertinggal agar aman.' : 'Pertahankan! Tetap isi absensi dan kerjakan diskusi tiap sesi.')
      };
    }
    return { judul: 'Kehadiran (TH.E-Course + tatap muka) · syarat ujian ' + at.syaratHadir + '%', ikon: 'hadir', menu: '', ringkas: rata === null ? '' : rata + '%',
      item: item.map(function(x) { return { t: x.t, s: x.s, n: x.n, w: x.w }; }), kosong: 'Belum ada sesi yang dihitung semester ini.' };
  });
  // 5. tagihan
  if (wb) brdKartu_(k, function() {
    var w = keuWbSemua_().filter(function(x) { return x.id === wb.id; })[0];
    if (!w) return null;
    var pb = keuBayarPeta_(), item = [], sisa = 0;
    keuTagSemua_().data.forEach(function(t) {
      if (!t.aktif || !keuKena_(t, w)) return;
      var x = keuRinci_(t, [w], pb)[0];
      if (x.sisa <= 0) return;
      sisa += x.sisa;
      item.push({ t: t.nama, s: t.jatuhTempo ? 'jatuh tempo ' + brdTglPendek_(t.jatuhTempo) : 'tagihan aktif', n: brdRp_(x.sisa), w: t.jatuhTempo && t.jatuhTempo < h0 ? 'merah' : 'kuning' });
    });
    if (!item.length) return null;
    return { judul: 'Tagihan belum lunas', ikon: 'tagihan', menu: '', ringkas: brdRp_(sisa), item: item, kosong: '' };
  });
  // v1.38.4: status kondisi belajar (Bahaya / Perlu perhatian / Baik) ditampilkan sebagai spanduk di atas beranda.
  var hasilS = { kartu: k, status: statusBelajar, waktu: absWaktu_() };
  try { cS.put(ckS, JSON.stringify(hasilS), 600); } catch (eS2) {}
  return hasilS;
}



// ============================================================================
// DATA INDUK (Tahap 6): kelola WB, Tutor, Rombel, Mapel, Enroll Mapel, Pengaturan lembaga
// langsung dari aplikasi (menggantikan AppSheet). Tidak ada hapus permanen: "hapus" = nonaktif.
// ============================================================================
var IND = {
  wb: { tab: 'WARGA BELAJAR', kunci: 'ID WB', judul: 'Warga Belajar', label: 'NAMA WB', sub: ['ROMBEL', 'NISN'], wajib: ['NAMA WB', 'ROMBEL'],
    pilihan: { 'JENIS KELAMIN': ['L', 'P'], STATUS: ['Aktif', 'Nonaktif', 'Lulus', 'Keluar'] }, ref: { ROMBEL: 'rombel' }, tanggal: ['TANGGAL LAHIR'], bawaan: { STATUS: 'Aktif' }, hapus: { STATUS: 'Nonaktif' } },
  tutor: { tab: 'TUTOR', kunci: 'ID TUTOR', judul: 'Tutor', label: 'NAMA TUTOR', sub: ['EMAIL', 'NO HP'], wajib: ['NAMA TUTOR'], prefix: 'TT-',
    pilihan: { 'METODE PEMBAYARAN': ['Transfer Bank', 'E-Wallet', 'Tunai'], 'E-WALLET': ['', 'DANA', 'OVO', 'GoPay', 'ShopeePay', 'LinkAja'] }, bool: ['AKTIF', 'ATAS NAMA PRIBADI'], bawaan: { AKTIF: true }, hapus: { AKTIF: false } },
  rombel: { tab: 'ROMBEL', kunci: 'ID ROMBEL', judul: 'Rombel', label: 'NAMA ROMBEL', sub: ['PROGRAM', 'TINGKAT'], wajib: ['NAMA ROMBEL', 'PROGRAM'],
    ref: { PROGRAM: 'program', TUTOR: 'tutor' }, label2: { TUTOR: 'WALI KELAS' }, bool: ['AKTIF'], bawaan: { AKTIF: true }, hapus: { AKTIF: false } },
  mapel: { tab: 'MAPEL', kunci: 'KODE MAPEL', manual: true, judul: 'Mata Pelajaran', label: 'NAMA MAPEL', sub: ['KODE MAPEL', 'KELOMPOK'], wajib: ['KODE MAPEL', 'NAMA MAPEL'],
    pilihan: { KELOMPOK: ['Umum', 'Pilihan', 'Muatan Lokal', 'Pemberdayaan', 'Keterampilan'] } },
  enroll: { tab: 'ENROLL MAPEL', kunci: 'ID ENROLL', judul: 'Enroll Mapel', label: 'MAPEL', sub: ['ROMBEL', 'TUTOR'], wajib: ['ROMBEL', 'MAPEL'],
    ref: { ROMBEL: 'rombel', MAPEL: 'mapel', TUTOR: 'tutor' }, pilihan: { STATUS: ['Disetujui', 'Menunggu', 'Ditolak'] }, bool: ['AKTIF'], ro: ['DICATAT PADA', 'DIAJUKAN OLEH', 'TUTOR'],   // v1.73.0: TUTOR diatur di Pemetaan -> Pengampu Online
    bawaan: { AKTIF: true, STATUS: 'Disetujui' }, hapus: { AKTIF: false } },
  // v1.79.0: ruang belajar tatap muka (terikat satu unit, boleh dipakai siswa unit lain)
  ruang: { tab: 'RUANG BELAJAR', hdr: ['KODE RUANG', 'NAMA RUANG', 'UNIT', 'KAPASITAS', 'KETERANGAN', 'AKTIF'], kunci: 'KODE RUANG', manual: true,
    judul: 'Ruang Belajar', label: 'NAMA RUANG', sub: ['KODE RUANG', 'UNIT'], wajib: ['KODE RUANG', 'NAMA RUANG', 'UNIT'], ref: { UNIT: 'unit' },
    bool: ['AKTIF'], bawaan: { AKTIF: true }, hapus: { AKTIF: false } },
  pengaturan: { tab: 'PENGATURAN', kunci: 'ID', tunggal: true, judul: 'Pengaturan Lembaga', label: 'NAMA LEMBAGA', ro: ['ID', 'LOGO'],
    pilihan: { SEMESTER: ['Ganjil', 'Genap'] }, bool: ['ABSENSI AKTIF'] }
};
function indWajib_(token, tulis) {
  var p = stafDariToken_(token), q = absPeran_(p);
  if (!(q.admin || q.sa || (!tulis && q.ks))) throw new Error('Data induk dikelola oleh Admin atau Superadmin.');
  return p;
}
function indSkema_(k) {
  var s = IND[k];
  if (!s) throw new Error('Tabel tidak dikenal.');
  return s;
}
function indJenis_(s, h) {
  if ((s.ref || {})[h]) return 'ref';
  if ((s.pilihan || {})[h]) return 'pilihan';
  if ((s.bool || []).indexOf(h) >= 0) return 'bool';
  if ((s.tanggal || []).indexOf(h) >= 0) return 'tanggal';
  return 'teks';
}
function indNilai_(s, h, v) {
  var j = indJenis_(s, h);
  if (j === 'bool') return absBenar_(v);
  if (j === 'tanggal') return v ? absTgl_(v) : '';
  if (v instanceof Date) return Utilities.formatDate(v, absTz_(), h.indexOf('JAM') >= 0 ? 'HH:mm' : 'yyyy-MM-dd HH:mm');
  return sTeks_(v);
}
function indRef_() {
  var ambil = function(tab, kId, kNama, kAktif) {
    var t = absBaca_(tab), out = [];
    for (var i = 1; i < t.v.length; i++) {
      var id = sTeks_(absNilai_(t, t.v[i], kId)).trim();
      if (!id) continue;
      out.push({ id: id, nama: sTeks_(absNilai_(t, t.v[i], kNama)).trim() || id, aktif: kAktif ? absBenar_(absNilai_(t, t.v[i], kAktif)) : true });
    }
    return out.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  };
  return { rombel: ambil('ROMBEL', 'ID ROMBEL', 'NAMA ROMBEL', 'AKTIF'), program: ambil('PROGRAM', 'KODE PROGRAM', 'NAMA PROGRAM'), tutor: ambil('TUTOR', 'ID TUTOR', 'NAMA TUTOR', 'AKTIF'), mapel: ambil('MAPEL', 'KODE MAPEL', 'NAMA MAPEL'),
    unit: (function() { try { return ubUnit_().map(function(u) { return { id: u.id, nama: u.nama, aktif: !!u.aktif }; }); } catch (e) { return []; } })() };
}
function waStafIndukDaftar(token, k) {
  var p = indWajib_(token, false), s = indSkema_(k), t = absBaca_(s.tab, s.hdr);
  var hdr = t.v[0].map(function(x) { return String(x).trim(); }).filter(function(x) { return x; });
  var kolom = hdr.map(function(h) {
    var j = indJenis_(s, h);
    return { nama: h, label: (s.label2 || {})[h] || h, jenis: j, pilihan: (s.pilihan || {})[h] || [], ref: (s.ref || {})[h] || '', wajib: (s.wajib || []).indexOf(h) >= 0,
      ro: (s.ro || []).indexOf(h) >= 0 || (h === s.kunci && !s.manual) };
  });
  var baris = [];
  for (var i = 1; i < t.v.length; i++) {
    var o = {}, kosong = true;
    hdr.forEach(function(h) { o[h] = indNilai_(s, h, absNilai_(t, t.v[i], h)); if (o[h] !== '' && o[h] !== false) kosong = false; });
    if (kosong) continue;
    o._id = String(o[s.kunci] || ('BARIS' + (i + 1)));
    baris.push(o);
  }
  return { tabel: k, judul: s.judul, kunci: s.kunci, label: s.label, sub: s.sub || [], tunggal: !!s.tunggal, bisaHapus: !!s.hapus, tulis: absPeran_(p).admin || absPeran_(p).sa,
    kolom: kolom, baris: baris, ref: indRef_(), bawaan: s.bawaan || {} };
}
// d: {_id? (kosong = baru), KOLOM: nilai, ...}
function waStafIndukSimpan(token, k, d) {
  var p = indWajib_(token, true), s = indSkema_(k);
  d = d || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = absBaca_(s.tab, s.hdr), hdr = t.v[0].map(function(x) { return String(x).trim(); }), ref = null, baru = !d._id;
    var isi = {};
    hdr.forEach(function(h) {
      if (!h || !(h in d) || (s.ro || []).indexOf(h) >= 0) return;
      if (h === s.kunci && !(s.manual && baru)) return;
      var j = indJenis_(s, h), v = d[h];
      if (j === 'bool') v = v === true || v === 'true';
      else if (j === 'tanggal') v = v ? absTglSah_(String(v).slice(0, 10)) : '';
      else v = String(v === null || v === undefined ? '' : v).trim().slice(0, 300);
      if (j === 'pilihan' && v !== '' && s.pilihan[h].indexOf(v) < 0) throw new Error(h + ' harus salah satu: ' + s.pilihan[h].join(', '));
      if (j === 'ref' && v !== '') {
        ref = ref || indRef_();
        if (!ref[s.ref[h]].some(function(x) { return x.id === v; })) throw new Error(h + ' "' + v + '" tidak ditemukan.');
      }
      if (h === 'NISN' && v && !/^\d{10}$/.test(v)) throw new Error('NISN harus 10 angka.');
      if (h === 'NIK' && v && !/^\d{16}$/.test(v)) throw new Error('NIK harus 16 angka.');
      if (h === 'EMAIL' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new Error('Format email tidak sah.');
      if (h === 'HONOR PER HADIR') v = keuAngka_(v);
      isi[h] = v;
    });
    var cari = function(id) { for (var i = 1; i < t.v.length; i++) if (sTeks_(absNilai_(t, t.v[i], s.kunci)).trim() === String(id)) return i; return -1; };
    if (s.tunggal) {
      var row1 = t.v[1].slice();
      Object.keys(isi).forEach(function(h) { var c = absCol_(t, h); if (c >= 0) row1[c] = isi[h]; });
      t.sh.getRange(2, 1, 1, row1.length).setValues([row1]);
      catat_(p.peran, '-', p.nama, 'Pengaturan lembaga', Object.keys(isi).join(', '), 'OK');
      return { sukses: true, id: sTeks_(row1[absCol_(t, s.kunci)]) };
    }
    if (baru) {
      (s.wajib || []).forEach(function(h) { if (!String(isi[h] === undefined ? '' : isi[h]).trim()) throw new Error('Isi ' + ((s.label2 || {})[h] || h) + '.'); });
      var id;
      if (s.manual) {
        id = String(isi[s.kunci]).toUpperCase().replace(/\s+/g, '');
        if (!/^[A-Z0-9-]{2,12}$/.test(id)) throw new Error(s.kunci + ' 2–12 huruf/angka.');
        if (cari(id) >= 0) throw new Error(s.kunci + ' ' + id + ' sudah dipakai.');
      } else id = (s.prefix || '') + absId_();
      isi[s.kunci] = id;
      Object.keys(s.bawaan || {}).forEach(function(h) { if (!(h in isi) || isi[h] === '') isi[h] = s.bawaan[h]; });
      if (absCol_(t, 'DICATAT PADA') >= 0) isi['DICATAT PADA'] = absWaktu_();
      if (absCol_(t, 'DIAJUKAN OLEH') >= 0) isi['DIAJUKAN OLEH'] = p.nama;
      t.sh.appendRow(absBaris_(t, isi));
      catat_(p.peran, '-', p.nama, 'Data induk baru', s.judul + ' ' + id + ' ' + (isi[s.label] || ''), 'OK');
      indSegarkan_(s.tab);
      return { sukses: true, id: id };
    }
    var i2 = cari(d._id);
    if (i2 < 0) throw new Error('Data tidak ditemukan.');
    (s.wajib || []).forEach(function(h) { if (h in isi && !String(isi[h]).trim()) throw new Error('Isi ' + ((s.label2 || {})[h] || h) + '.'); });
    var row = t.v[i2].slice();
    Object.keys(isi).forEach(function(h) { var c = absCol_(t, h); if (c >= 0) row[c] = isi[h]; });
    t.sh.getRange(i2 + 1, 1, 1, row.length).setValues([row]);
    catat_(p.peran, '-', p.nama, 'Ubah data induk', s.judul + ' ' + d._id, 'OK');
    indSegarkan_(s.tab);
    return { sukses: true, id: String(d._id) };
  } finally { lock.releaseLock(); }
}
function waStafIndukNonaktif(token, k, id) {
  var p = indWajib_(token, true), s = indSkema_(k);
  if (!s.hapus) throw new Error('Data ' + s.judul + ' tidak bisa dinonaktifkan.');
  var t = absBaca_(s.tab, s.hdr);
  for (var i = 1; i < t.v.length; i++) {
    if (sTeks_(absNilai_(t, t.v[i], s.kunci)).trim() !== String(id)) continue;
    Object.keys(s.hapus).forEach(function(h) { var c = absCol_(t, h); if (c >= 0) t.sh.getRange(i + 1, c + 1).setValue(s.hapus[h]); });
    catat_(p.peran, '-', p.nama, 'Nonaktifkan data induk', s.judul + ' ' + id, 'OK');
    indSegarkan_(s.tab);
    return { sukses: true };
  }
  throw new Error('Data tidak ditemukan.');
}
function indSegarkan_(tab) {
  try { CacheService.getScriptCache().removeAll(['abs_kelas3_*', 'abs_kelas2_*', 'abs_kelas_*']); } catch (e) {}
  // v1.78.0: Enroll Mapel / Rombel berubah -> e-learning langsung mengikuti
  if (tab === 'ENROLL MAPEL' || tab === 'ROMBEL') { try { ditSelaraskan_(); } catch (e2) {} }
}

