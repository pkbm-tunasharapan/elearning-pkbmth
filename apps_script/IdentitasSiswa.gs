// ============================================================================
// IDENTITAS SISWA: CEGAH DATA GANDA (v1.40.2)
// ----------------------------------------------------------------------------
// 1) Daftar lewat NISN/NIK + tanggal lahir: dicocokkan ke Data Induk (WARGA BELAJAR). Bila cocok, nama & rombel
//    diambil dari Data Induk (tidak diketik), akun e-learning ditautkan ke data yang sudah ada.
// 2) Daftar manual (tanpa NISN/NIK): bila Data Induk punya WB dengan tanggal lahir sama dan nama mirip
//    (spasi bergeser, huruf besar/kecil, salah 1-2 huruf, urutan kata), pendaftaran ditahan/diarahkan.
// 3) Login: bila nama tidak cocok tetapi tanggal lahir cocok dengan tepat satu siswa bernama mirip,
//    server menyarankan "Maksud Anda: <nama>?" (nama hanya terlihat bila tanggal lahir benar).
// 5) Gabung / samakan dengan Data Induk: jejak belajar (jawaban, absensi, chat, ujian, profil, PIN, perangkat)
//    ikut dipindah ke nama/rombel yang benar; sesi lama di HP diperbarui otomatis (peta ganti nama).
// ============================================================================
var IDS = {
  CACHE_DETIK: 1800, MAKS_PER_NOMOR: 8, MAKS_GLOBAL: 300,
  PROP_GANTI: 'SISWA_GANTI_NAMA',
  // tab e-learning yang menyimpan jejak siswa dengan kolom ID Rombel + Nama Siswa
  JEJAK: ['Jawaban', 'Absensi', 'Chat', 'Hasil Ujian', 'Percobaan Ujian', 'Baca Materi', 'Notifikasi', 'Draft Diskusi', 'Penilaian Diskusi']
};

function idsMirip_(a, b) { return sswMirip_(a, b) || jarakNama_(a, b) <= 2; }
function idsSama_(a, b) { return sswKompak_(a) && sswKompak_(a) === sswKompak_(b); }   // hanya beda spasi/tanda baca/huruf besar
function idsSamar_(nama) {
  return String(nama || '').trim().split(/\s+/).map(function(k, i) { return i === 0 || k.length <= 1 ? k : k.charAt(0) + new Array(Math.min(k.length, 9)).join('*'); }).join(' ');
}
// Rombel e-learning (Rombel LMS) untuk nama rombel Data Induk (mis. "C11" -> "ROM-KELASC11").
function idsElRombel_(namaRombelSim) {
  var k = sswKunciKelas_(namaRombelSim), hasil = '';
  if (!k) return '';
  getSheetData(CONFIG.SHEETS.ROMBEL).slice(1).forEach(function(r) {
    var id = sTeks_(r[0]).trim();
    if (!hasil && id && (sswKunciKelas_(r[1]) === k || sswKunciKelas_(id.replace(/^ROM-/i, '')) === k)) hasil = id;
  });
  return hasil;
}
function idsNamaRombelEl_(idRombel) {
  var nm = '';
  getSheetData(CONFIG.SHEETS.ROMBEL).slice(1).forEach(function(r) { if (sTeks_(r[0]).trim() === String(idRombel)) nm = sTeks_(r[1]).trim(); });
  return nm || idRombel;
}
// WB Data Induk aktif dengan tanggal lahir sama dan nama mirip.
function idsMiripInduk_(nama, tgl) {
  var m;
  try { m = sswBacaMenu_(); } catch (e) { return []; }
  return m.wb.filter(function(w) { return w.status !== 'Nonaktif' && w.tgl === tgl && idsMirip_(w.nama, nama); });
}

// ---------- 1) cek identitas lewat NISN / NIK ----------
// q: {nomor (NISN/NIK), tanggalLahir (yyyy-MM-dd)}
function waDaftarCekIdentitas(q) {
  q = q || {};
  var nomor = String(q.nomor || '').replace(/\D/g, ''), tgl = String(q.tanggalLahir || '').trim();
  if (nomor.length < 8 || nomor.length > 16) return { ada: false, pesan: 'Tulis NISN (10 angka) atau NIK (16 angka).' };
  if (!tanggalLahirValid_(tgl)) return { ada: false, pesan: 'Tanggal lahir tidak valid.' };
  if (hitung_('idsglobal', 3600) > IDS.MAKS_GLOBAL) return { ada: false, pesan: 'Terlalu banyak permintaan saat ini. Coba lagi beberapa saat lagi.' };
  if (hitung_('idsno_' + sha256_(nomor).slice(0, 20), 3600) > IDS.MAKS_PER_NOMOR) return { ada: false, pesan: 'Terlalu sering mencoba nomor ini. Coba lagi satu jam lagi, atau hubungi admin.' };
  var m = sswBacaMenu_();
  var w = m.wb.filter(function(x) { return x.status !== 'Nonaktif' && (x.nisn === nomor || x.nik === nomor) && x.tgl === tgl; })[0];
  if (!w) {
    catat_('Calon siswa', '', '', 'Cek identitas', 'NISN/NIK + tanggal lahir tidak cocok', 'GAGAL');
    return { ada: false, pesan: 'Data dengan NISN/NIK dan tanggal lahir itu tidak ditemukan di sekolah. Periksa kembali; bila Anda memang siswa baru, daftar dengan mengisi data diri.' };
  }
  var elR = idsElRombel_(w.namaRombel), akun = cariSiswa_(w.nama, w.tgl);
  var sudahAkun = !!(akun && (akun.email || sswBacaBm_().rows.some(function(r) { return r.baris === akun.baris && r.terdaftar; })));
  var kunci = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('ids_' + kunci, JSON.stringify({ idWb: w.id, nama: w.nama, tgl: w.tgl, nisn: w.nisn, elRombel: elR, namaRombel: w.namaRombel }), IDS.CACHE_DETIK);
  catat_('Calon siswa', elR, w.nama, 'Cek identitas', 'cocok dengan Data Induk (' + (w.nisn === nomor ? 'NISN' : 'NIK') + ')', 'OK');
  var out = { ada: true, kunci: kunci, namaSamar: idsSamar_(w.nama), rombel: w.namaRombel, kelasSiap: !!elR, sudahAkun: sudahAkun };
  if (sudahAkun) { out.namaLengkap = akun.nama; out.pesan = 'Anda sudah punya akun TH.E-Course. Masuk dengan nama "' + akun.nama + '" dan kata sandi TH- tanggal lahir (atau PIN Anda).'; }
  return out;
}
function idsAmbilKunci_(kunci) {
  var raw = kunci ? CacheService.getScriptCache().get('ids_' + String(kunci)) : null;
  return raw ? JSON.parse(raw) : null;
}

// ---------- 3) saran nama saat login ----------
function idsSaranLogin_(nama, tgl) {
  var v = getSheetData(CONFIG.SHEETS.SISWA), calon = {};
  for (var i = 1; i < v.length; i++) {
    var n = sTeks_(v[i][1]).trim();
    if (!n || formatTanggalUntukBanding_(v[i][2]) !== tgl) continue;
    if (idsMirip_(n, nama)) calon[normNama_(n)] = n;
  }
  var k = Object.keys(calon);
  return k.length === 1 ? calon[k[0]] : '';
}

// ---------- 5) pindahkan jejak belajar ke identitas yang benar ----------
// dari/ke: {nama, rombel (ID Rombel e-learning)}. Mengembalikan jumlah sel yang diubah per tab.
function idsPindahJejak_(dari, ke) {
  var nnD = normNama_(dari.nama), hasil = {}, ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!nnD || (nnD === normNama_(ke.nama) && String(dari.rombel) === String(ke.rombel))) return hasil;
  IDS.JEJAK.forEach(function(tab) {
    var sh = ss.getSheetByName(tab);
    if (!sh || sh.getLastRow() < 2) return;
    var v = sh.getDataRange().getValues(), hd = v[0].map(function(x) { return String(x).trim(); });
    var kN = hd.indexOf('Nama Siswa'), kR = hd.indexOf('ID Rombel'), n = 0;
    if (kN < 0) return;
    for (var i = 1; i < v.length; i++) {
      if (normNama_(v[i][kN]) !== nnD) continue;
      if (kR >= 0 && String(v[i][kR]).trim() !== String(dari.rombel)) continue;
      if (sTeks_(v[i][kN]) !== ke.nama) sh.getRange(i + 1, kN + 1).setValue(ke.nama);
      if (kR >= 0 && String(v[i][kR]).trim() !== String(ke.rombel)) sh.getRange(i + 1, kR + 1).setValue(ke.rombel);
      n++;
    }
    if (n) hasil[tab] = n;
  });
  // Profil Akun (kunci S|rombel|nama)
  try {
    var shP = ss.getSheetByName('Profil Akun');
    if (shP) {
      var vp = shP.getDataRange().getValues(), kLama = 'S|' + String(dari.rombel).trim() + '|' + nnD;
      for (var j = 1; j < vp.length; j++) if (String(vp[j][0]) === kLama) {
        shP.getRange(j + 1, 1, 1, 3).setValues([['S|' + String(ke.rombel).trim() + '|' + normNama_(ke.nama), vp[j][1], ke.nama]]);
        hasil['Profil Akun'] = 1;
      }
    }
  } catch (e) {}
  // PIN Siswa (kunci nama|tgl)
  try {
    var t = pinSheet_(), vv = t.getDataRange().getValues();
    for (var k = 1; k < vv.length; k++) {
      var kk = String(vv[k][0] || ''), bag = kk.split('|');
      if (bag[0] !== nnD) continue;
      t.getRange(k + 1, 1, 1, 3).setValues([[normNama_(ke.nama) + '|' + bag.slice(1).join('|'), ke.nama, ke.rombel]]);
      hasil['PIN Siswa'] = (hasil['PIN Siswa'] || 0) + 1;
    }
    pinHapusCache_('');
  } catch (e2) {}
  // Perangkat notifikasi (audiens siswa)
  try {
    var shN = ss.getSheetByName(BC.SH_PR);
    if (shN) {
      var vn = shN.getDataRange().getValues();
      for (var x = 1; x < vn.length; x++) {
        if (String(vn[x][1]) !== 'siswa' || normNama_(vn[x][3]) !== nnD || String(vn[x][4]).trim() !== String(dari.rombel)) continue;
        shN.getRange(x + 1, 4, 1, 2).setValues([[ke.nama, ke.rombel]]);
        try { CacheService.getScriptCache().remove('pn_' + String(vn[x][0]).slice(0, 60)); } catch (e3) {}
        hasil['Perangkat Notif'] = (hasil['Perangkat Notif'] || 0) + 1;
      }
    }
  } catch (e4) {}
  idsCatatGanti_(dari, ke);
  return hasil;
}
// Peta ganti nama/rombel: sesi lama di HP (nama/rombel lama) dipulihkan ke identitas baru.
function idsCatatGanti_(dari, ke) {
  var sp = PropertiesService.getScriptProperties(), peta = {};
  try { peta = JSON.parse(sp.getProperty(IDS.PROP_GANTI) || '{}'); } catch (e) {}
  peta[String(dari.rombel) + '|' + normNama_(dari.nama)] = { nama: ke.nama, rombel: ke.rombel, t: new Date().getTime() };
  var kunci = Object.keys(peta).sort(function(a, b) { return peta[b].t - peta[a].t; }).slice(0, 150), baru = {};
  kunci.forEach(function(k) { baru[k] = peta[k]; });
  sp.setProperty(IDS.PROP_GANTI, JSON.stringify(baru));
}
// Identitas terbaru untuk sesi lama: peta ganti nama, lalu nama unik di tab Siswa (mis. dipindah rombel).
function idsIdentitasTerbaru_(nama, rombel) {
  try {
    var peta = JSON.parse(PropertiesService.getScriptProperties().getProperty(IDS.PROP_GANTI) || '{}'), g = peta[String(rombel) + '|' + normNama_(nama)];
    if (g && siswaTerdaftar_(g.nama, g.rombel)) return { nama: g.nama, idRombel: g.rombel };
  } catch (e) {}
  var v = getSheetData(CONFIG.SHEETS.SISWA), cocok = [];
  for (var i = 1; i < v.length; i++) if (normNama_(v[i][1]) === normNama_(nama)) cocok.push({ nama: sTeks_(v[i][1]).trim(), idRombel: sTeks_(v[i][0]).trim() });
  return cocok.length === 1 ? cocok[0] : null;
}

// Admin: samakan baris siswa e-learning dengan Data Induk (nama & rombel), jejak ikut dipindah.
// kunciBaris = kunci baris dari daftar "perlu dicek" (Sinkron & Data Ganda).
function waAdminSamakanInduk(token, kunciBaris) {
  var adm = wajibAdmin_(token);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var menu = sswBacaMenu_(), bm = sswBacaBm_();
    sswCocokkan_(bm, menu);
    var r = bm.rows.filter(function(x) { return x.kunci === kunciBaris; })[0];
    if (!r) throw new Error('Data siswa sudah berubah. Muat ulang lalu coba lagi.');
    if (!r.wb) throw new Error('Siswa ini belum cocok dengan Data Induk.');
    var elR = idsElRombel_(r.wb.namaRombel) || r.rombel;
    var ke = { nama: r.wb.nama, rombel: elR }, dari = { nama: r.nama, rombel: r.rombel };
    if (bm.rows.some(function(o) { return o !== r && o.rombel === ke.rombel && normNama_(o.nama) === normNama_(ke.nama); })) {
      throw new Error('Sudah ada baris lain "' + ke.nama + '" di rombel itu. Gabungkan lewat Analisa Data Ganda.');
    }
    var sh = getSheet(CONFIG.SHEETS.SISWA);
    sh.getRange(r.baris, SSW.S_NAMA + 1).setNumberFormat('@').setValue(ke.nama);
    sh.getRange(r.baris, SSW.S_ROMBEL + 1).setNumberFormat('@').setValue(ke.rombel);
    if (!r.nisn && r.wb.nisn) sh.getRange(r.baris, SSW.S_NISN + 1).setNumberFormat('@').setValue(r.wb.nisn);
    var jejak = idsPindahJejak_(dari, ke);
    var ket = r.nama + ' (' + r.namaRombel + ') → ' + ke.nama + ' (' + idsNamaRombelEl_(ke.rombel) + ')';
    sswRiwayat_([[waktuSekarang_(), 'Samakan dengan Data Induk', ke.nama, 'Nama/Rombel', [dari.nama, dari.rombel].join(' · '), [ke.nama, ke.rombel].join(' · '), adm.nama]]);
    catat_('Admin', adm.id, adm.nama, 'Samakan siswa dengan Data Induk', ket + ' · jejak: ' + JSON.stringify(jejak), 'OK');
    return { ok: true, ket: ket, jejak: jejak };
  } finally { lock.releaseLock(); }
}
