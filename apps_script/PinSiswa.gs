// ============================================================================
// PIN WARGA BELAJAR (v1.39.0)
// ----------------------------------------------------------------------------
// - WB tanpa PIN tetap masuk dengan nama + TH-ddmmyyyy, lalu diminta membuat PIN 6 angka.
//   Masa tenggang PIN.HARI_TENGGANG hari sejak pertama kali tercatat belum punya PIN; setelah itu
//   aplikasi mewajibkan pembuatan PIN (layar tidak bisa dilewati).
// - Setelah PIN dibuat: masuk dengan nama + PIN. Kata sandi TH-ddmmyyyy tidak berlaku lagi.
// - PIN juga diminta saat memulai ujian online.
// - Lupa PIN: Admin atau tutor rombel itu menekan "Reset PIN"; WB masuk sekali dengan TH-ddmmyyyy
//   lalu wajib membuat PIN baru.
// - Disimpan hanya hash (SHA-256 + garam acak + pepper server). Salah 5x -> dikunci 30 menit.
// - Kunci baris: nama ternormalisasi + tanggal lahir (tetap walau WB pindah rombel).
// ============================================================================
var PIN = {
  SHEET: 'PIN Siswa',
  H: ['Kunci', 'Nama', 'ID Rombel', 'Tanggal Lahir', 'Hash', 'Garam', 'Status', 'Tenggat', 'Dibuat', 'Diubah', 'Reset Oleh', 'Reset Waktu'],
  HARI_TENGGANG: 7,
  MAKS_SALAH: 5,
  KUNCI_DETIK: 1800,
  CK_PETA: 'pin_peta_v1',
  CK_STATUS: 'pinst_',
  VERSI_MIN: '1.39.0'   // versi aplikasi pertama yang punya layar Buat PIN
};

function pinSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(PIN.SHEET);
  if (!sh) {
    sh = ss.insertSheet(PIN.SHEET);
    sh.getRange(1, 1, 1, PIN.H.length).setValues([PIN.H]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1000, PIN.H.length).setNumberFormat('@');
  }
  return sh;
}

function pinKunci_(nama, tgl) { return normNama_(nama) + '|' + String(tgl || '').trim(); }

// Peta semua baris PIN: kunci -> {baris, nama, idRombel, tgl, hash, garam, status, tenggat}
function pinPeta_() {
  var c = CacheService.getScriptCache();
  try { var lama = c.get(PIN.CK_PETA); if (lama) return JSON.parse(lama); } catch (e) {}
  var v = pinSheet_().getDataRange().getValues(), out = {};
  for (var i = 1; i < v.length; i++) {
    var k = String(v[i][0] || '').trim();
    if (!k) continue;
    out[k] = { baris: i + 1, nama: String(v[i][1] || ''), idRombel: String(v[i][2] || ''), tgl: String(v[i][3] || ''),
      hash: String(v[i][4] || ''), garam: String(v[i][5] || ''), status: String(v[i][6] || ''), tenggat: String(v[i][7] || '') };
  }
  try { c.put(PIN.CK_PETA, JSON.stringify(out), 600); } catch (e2) {}
  return out;
}
function pinHapusCache_(kunci) {
  var c = CacheService.getScriptCache();
  try { c.remove(PIN.CK_PETA); if (kunci) c.remove(PIN.CK_STATUS + pinCacheId_(kunci)); } catch (e) {}
}
function pinCacheId_(kunci) { return Utilities.base64EncodeWebSafe(String(kunci)).slice(0, 200); }

// Menulis (menambah/mengubah) satu baris PIN. d: field yang diubah.
function pinTulis_(kunci, d) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    pinHapusCache_(kunci);
    var peta = pinPeta_(), ada = peta[kunci], sh = pinSheet_();
    var r = ada ? { nama: ada.nama, idRombel: ada.idRombel, tgl: ada.tgl, hash: ada.hash, garam: ada.garam, status: ada.status, tenggat: ada.tenggat } : {};
    var lamaBaris = ada ? sh.getRange(ada.baris, 1, 1, PIN.H.length).getValues()[0] : [];
    Object.keys(d).forEach(function(k) { r[k] = d[k]; });
    var kini = absWaktu_();
    var baris = [kunci, r.nama || '', r.idRombel || '', r.tgl || '', r.hash || '', r.garam || '', r.status || '', r.tenggat || '',
      ada ? String(lamaBaris[8] || '') : kini, kini,
      d.resetOleh !== undefined ? d.resetOleh : (ada ? String(lamaBaris[10] || '') : ''),
      d.resetOleh !== undefined ? kini : (ada ? String(lamaBaris[11] || '') : '')];
    if (ada) sh.getRange(ada.baris, 1, 1, baris.length).setNumberFormat('@').setValues([baris]);
    else { var n = sh.getLastRow() + 1; sh.getRange(n, 1, 1, baris.length).setNumberFormat('@').setValues([baris]); }
    pinHapusCache_(kunci);
    try { CacheService.getScriptCache().remove(PIN.CK_STATUS + pinCacheId_(normNama_(r.nama) + '|' + r.idRombel)); } catch (eC) {}
  } finally { lock.releaseLock(); }
}

function pinHash_(pin, garam) { return sha256_(pepper_() + ':pin:' + garam + ':' + String(pin)); }

// Tanggal lahir (yyyy-MM-dd) siswa e-learning dari sheet Siswa.
function pinTglSiswa_(idRombel, nama) {
  var v = getSheetData(CONFIG.SHEETS.SISWA), nn = normNama_(nama);
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() !== String(idRombel).trim() || normNama_(v[i][1]) !== nn) continue;
    var t = formatTanggalUntukBanding_(v[i][2]);
    if (t) return t;
  }
  return '';
}

// '' bila PIN boleh dipakai; selain itu alasan penolakan.
function pinLemah_(pin, tgl) {
  pin = String(pin || '');
  if (!/^\d{6}$/.test(pin)) return 'PIN harus 6 angka.';
  if (/^(\d)\1{5}$/.test(pin) || /^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin)) return 'PIN terlalu mudah ditebak (angka berulang). Pilih PIN lain.';
  if ('01234567890'.indexOf(pin) >= 0 || '09876543210'.indexOf(pin) >= 0) return 'PIN terlalu mudah ditebak (angka berurutan). Pilih PIN lain.';
  var p = String(tgl || '').split('-');
  if (p.length === 3) {
    var y = p[0], m = p[1], d = p[2], yy = y.slice(2);
    if ([d + m + yy, yy + m + d, m + d + yy, d + m + y.slice(0, 2), y.slice(0, 2) + yy + m, m + y].indexOf(pin) >= 0) {
      return 'Jangan memakai tanggal lahir sebagai PIN. Pilih PIN lain.';
    }
  }
  return '';
}

function pinSelisihHari_(dari, sampai) {
  var a = String(dari).split('-'), b = String(sampai).split('-');
  return Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
}
function pinTambahHari_(tgl, n) {
  var a = String(tgl).split('-'), d = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2] + n));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}

// Status PIN untuk dikirim ke aplikasi. catat = true: WB yang baru pertama kali terlihat tanpa PIN dicatat
// tenggatnya (masa tenggang mulai berjalan).
// {ada, perlu, wajib, reset, tenggat, sisaHari}
function pinStatusTgl_(nama, idRombel, tgl, catat) {
  if (!tgl) return { ada: false, perlu: false, wajib: false };
  var k = pinKunci_(nama, tgl), r = pinPeta_()[k], hari = absHariIni_();
  if (r && r.status === 'Aktif' && r.hash) return { ada: true, perlu: false, wajib: false };
  if (r && r.status === 'Reset') return { ada: false, perlu: true, wajib: true, reset: true, tenggat: hari, sisaHari: 0 };
  var tenggat = r && r.tenggat ? r.tenggat : '', tercatat = !!tenggat;
  if (!tenggat) {
    tenggat = pinTambahHari_(hari, PIN.HARI_TENGGANG);
    // masa tenggang baru dimulai saat WB memakai aplikasi yang sudah bisa membuat PIN
    if (catat && pinVersiDukung_()) { pinTulis_(k, { nama: nama, idRombel: idRombel, tgl: tgl, status: 'Belum', tenggat: tenggat }); tercatat = true; }
  }
  var sisa = pinSelisihHari_(hari, tenggat);
  return { ada: false, perlu: true, wajib: tercatat && sisa < 0, reset: false, tenggat: tenggat, sisaHari: Math.max(0, sisa), tercatat: tercatat };
}
function pinVersiDukung_() {
  var v = String(globalThis.__API_V || '').split(' ')[0];
  return !!v && rlsBanding_(v, PIN.VERSI_MIN) >= 0;
}
function pinStatus_(nama, idRombel, catat) {
  return pinStatusTgl_(nama, idRombel, pinTglSiswa_(idRombel, nama), catat);
}
// Versi ringan (cache 10 menit) untuk pemeriksaan berkala pemberitahuan.
function pinStatusCepat_(nama, idRombel) {
  var c = CacheService.getScriptCache(), ck = PIN.CK_STATUS + pinCacheId_(normNama_(nama) + '|' + idRombel);
  try { var lama = c.get(ck); if (lama) return JSON.parse(lama); } catch (e) {}
  var s = pinStatus_(nama, idRombel, false);
  try { c.put(ck, JSON.stringify(s), 600); } catch (e2) {}
  return s;
}

function pinKunciGagal_(nama) { return 'gagalpin_' + normNama_(nama).replace(/[^a-z0-9]/g, '').slice(0, 40); }

// Memeriksa PIN WB tertentu (untuk ujian & ubah PIN). Mengembalikan '' bila cocok, atau pesan galat.
function pinPeriksa_(nama, idRombel, pin) {
  var tgl = pinTglSiswa_(idRombel, nama), r = pinPeta_()[pinKunci_(nama, tgl)];
  if (!r || r.status !== 'Aktif' || !r.hash) return '';
  var kg = pinKunciGagal_(nama);
  if (bacaHitung_(kg) >= PIN.MAKS_SALAH) return 'Terlalu banyak PIN salah. Tunggu 30 menit lalu coba lagi, atau minta tutor me-reset PIN.';
  if (pinHash_(String(pin || '').trim(), r.garam) === r.hash) return '';
  var n = hitung_(kg, PIN.KUNCI_DETIK);
  return 'PIN salah.' + (n < PIN.MAKS_SALAH ? ' Sisa ' + (PIN.MAKS_SALAH - n) + ' kali percobaan.' : ' Akun dikunci 30 menit.');
}
function pinPunya_(nama, idRombel) {
  var r = pinPeta_()[pinKunci_(nama, pinTglSiswa_(idRombel, nama))];
  return !!(r && r.status === 'Aktif' && r.hash);
}

// Masuk dengan nama + PIN (dipanggil waLogin bila kata sandi berupa 6 angka).
function pinMasuk_(nama, pin) {
  var kg = pinKunciGagal_(nama);
  if (bacaHitung_(kg) >= PIN.MAKS_SALAH) {
    catat_('Siswa', '', nama, 'Masuk', 'PIN: diblokir sementara karena terlalu banyak salah', 'GAGAL');
    return { sukses: false, pesan: 'Terlalu banyak PIN salah. Tunggu 30 menit lalu coba lagi, atau minta tutor me-reset PIN.' };
  }
  var awal = normNama_(nama) + '|', peta = pinPeta_(), calon = [], adaBaris = false;
  Object.keys(peta).forEach(function(k) {
    if (k.indexOf(awal) !== 0) return;
    adaBaris = true;
    if (peta[k].status === 'Aktif' && peta[k].hash) calon.push(peta[k]);
  });
  if (!calon.length) {
    return { sukses: false, pesan: adaBaris
      ? 'Anda belum membuat PIN, atau PIN Anda sudah di-reset. Masuk dengan kata sandi TH- tanggal lahir (8 angka), lalu buat PIN.'
      : 'Nama tidak ditemukan atau belum punya PIN. Masuk dengan kata sandi TH- tanggal lahir (8 angka) dulu.' };
  }
  var cocok = calon.filter(function(r) { return pinHash_(String(pin).trim(), r.garam) === r.hash; })[0];
  if (!cocok) {
    var n = hitung_(kg, PIN.KUNCI_DETIK);
    catat_('Siswa', '', nama, 'Masuk', 'PIN salah', 'GAGAL');
    return { sukses: false, pesan: 'Nama atau PIN tidak cocok.' + (n < PIN.MAKS_SALAH ? ' Sisa ' + (PIN.MAKS_SALAH - n) + ' kali percobaan.' : ' Akun dikunci 30 menit.') };
  }
  var res = waLoginAsli_(cocok.nama || nama, cocok.tgl);
  if (!res || !res.sukses) return res || { sukses: false, pesan: 'Data siswa tidak ditemukan. Hubungi tutor.' };
  CacheService.getScriptCache().remove(kg);
  res.pin = { ada: true, perlu: false, wajib: false };
  catat_('Siswa', res.idRombel, res.nama, 'Masuk', 'PIN', 'OK');
  try { res.sesi = ssBuat_(res); } catch (e) {}
  return res;
}

// ---------- endpoint siswa ----------
// pinLama wajib bila WB sudah punya PIN (mengganti PIN).
function waSiswaPinBuat(token, pin, pinLama) {
  var s = siswaDariSesi_(token), tgl = pinTglSiswa_(s.idRombel, s.nama);
  if (!tgl) return { sukses: false, pesan: 'Tanggal lahir Anda belum tercatat. Hubungi tutor.' };
  pin = String(pin || '').trim();
  var lemah = pinLemah_(pin, tgl);
  if (lemah) return { sukses: false, pesan: lemah };
  var k = pinKunci_(s.nama, tgl), r = pinPeta_()[k], ganti = !!(r && r.status === 'Aktif' && r.hash);
  if (ganti) {
    var g = pinPeriksa_(s.nama, s.idRombel, pinLama);
    if (g) return { sukses: false, pesan: g.replace('PIN salah.', 'PIN lama salah.') };
    if (pinHash_(pin, r.garam) === r.hash) return { sukses: false, pesan: 'PIN baru sama dengan PIN lama.' };
  }
  var garam = Utilities.getUuid();
  pinTulis_(k, { nama: s.nama, idRombel: s.idRombel, tgl: tgl, hash: pinHash_(pin, garam), garam: garam, status: 'Aktif' });
  CacheService.getScriptCache().remove(pinKunciGagal_(s.nama));
  try { catat_('Siswa', s.idRombel, s.nama, ganti ? 'Ubah PIN' : 'Buat PIN', '', 'OK'); } catch (e) {}
  return { sukses: true, pin: { ada: true, perlu: false, wajib: false } };
}

// ---------- endpoint staf ----------
function pinBolehReset_(p, idRombel) {
  if (p.peran === 'Admin' || p.peran === 'Superadmin') return true;
  var mapelRb = {};
  mapelAktifSemua_().forEach(function(m) { if (String(m.idRombel) === String(idRombel)) mapelRb[m.idMapel] = true; });
  return bacaEnrollment_().some(function(e) { return e.idPengguna === p.id && mapelRb[e.idMapel]; });
}

function waStafPinReset(token, idRombel, nama) {
  var p = stafDariToken_(token);
  if (!pinBolehReset_(p, idRombel)) throw new Error('Reset PIN hanya dapat dilakukan Admin atau tutor rombel ini.');
  var tgl = pinTglSiswa_(idRombel, nama);
  if (!tgl) throw new Error('Siswa tidak ditemukan atau tanggal lahirnya kosong.');
  var k = pinKunci_(nama, tgl), r = pinPeta_()[k];
  if (!r || r.status !== 'Aktif') return { sukses: false, pesan: nama + ' belum memiliki PIN, tidak perlu di-reset.' };
  pinTulis_(k, { hash: '', garam: '', status: 'Reset', resetOleh: p.nama + ' (' + p.peran + ')' });
  CacheService.getScriptCache().remove(pinKunciGagal_(nama));
  try { catat_(p.peran, idRombel, p.nama, 'Reset PIN siswa', nama, 'OK'); } catch (e) {}
  return { sukses: true, pesan: 'PIN ' + nama + ' sudah di-reset. Minta siswa masuk dengan TH- tanggal lahir (8 angka), lalu membuat PIN baru.' };
}

// Status PIN untuk daftar siswa staf: kunci (nama|tgl) -> 'Aktif' | 'Reset' | 'Belum'
function pinStatusDaftar_() {
  var peta = pinPeta_(), out = {};
  Object.keys(peta).forEach(function(k) { out[k] = peta[k].status === 'Aktif' && peta[k].hash ? 'Aktif' : (peta[k].status === 'Reset' ? 'Reset' : 'Belum'); });
  return out;
}

// Pengingat harian untuk pemberitahuan (waNotifCek): WB yang belum punya PIN.
function pinPengingat_(a) {
  if (!a || a.jenis !== 'siswa' || !a.nama || !a.rombel) return null;
  var s = pinStatusCepat_(a.nama, a.rombel);
  if (!s.perlu || (!s.reset && !s.tercatat)) return null;   // belum memakai aplikasi yang bisa membuat PIN
  var hari = absHariIni_();
  return {
    id: 'PIN-' + hari, oleh: 'Sistem', waktu: hari + ' 07:00:00',
    judul: s.wajib ? 'Wajib buat PIN sekarang' : 'Segera buat PIN akun Anda',
    isi: s.reset ? 'PIN Anda sudah di-reset. Masuk dengan TH- tanggal lahir lalu buat PIN baru.'
      : s.wajib ? 'Masa tenggang sudah habis. Buka aplikasi TH.E-Course dan buat PIN 6 angka agar tetap bisa belajar.'
      : 'Buat PIN 6 angka agar akun Anda aman. Sisa ' + s.sisaHari + ' hari sebelum PIN diwajibkan.'
  };
}
