// ============================================================================
// PEMELIHARAAN SISTEM (aplikasi 1.17): log galat, versi aplikasi, cek kesehatan data.
// - Log Galat   : galat server (dicatat otomatis dari doPost) + galat aplikasi (dilaporkan HP).
// - Versi App   : versi APK terbaru + tautan unduh, diatur admin; aplikasi menawarkan pembaruan.
// - Audit Data  : membandingkan sheet Siswa e-learning dengan WARGA BELAJAR (SIM SETARA),
//                 bisa dijalankan manual dari aplikasi atau otomatis tiap malam (pemicu waktu).
// ============================================================================
var PML = {
  SHEET_GALAT: 'Log Galat',
  HDR_GALAT: ['Waktu', 'Sumber', 'Fungsi/Layar', 'Pesan', 'Detail', 'Versi App', 'Pengguna'],
  MAKS_GALAT: 3000,
  MAKS_LAPOR_PER_MENIT: 30,
  SHEET_AUDIT: 'Audit Data',
  HDR_AUDIT: ['Diperiksa Pada', 'Jenis Masalah', 'Nama', 'NISN', 'ID WB', 'Rombel E-Learning', 'Rombel Data Induk', 'Keterangan', 'Kunci'],
  SHEET_NONAKTIF: 'Siswa Nonaktif',
  PEMICU: 'pemicuCekDataHarian',
  JAM_PEMICU: 1
};

function pmlSheet_(nama, hdr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nama);
  if (!sh) {
    sh = ss.insertSheet(nama);
    sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Teks dari luar tidak boleh menjadi rumus saat ditulis ke sheet.
function pmlAman_(s, maks) {
  s = String(s === null || s === undefined ? '' : s).slice(0, maks || 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// ---------- log galat ----------
function pmlCatatGalat_(sumber, fungsi, pesan, detail, versi, pengguna) {
  try {
    var sh = pmlSheet_(PML.SHEET_GALAT, PML.HDR_GALAT);
    sh.appendRow([absWaktu_(), pmlAman_(sumber, 20), pmlAman_(fungsi, 80), pmlAman_(pesan, 500), pmlAman_(detail, 1500), pmlAman_(versi, 20), pmlAman_(pengguna, 80)]);
    if (typeof rlsCatatGalat_ === 'function') rlsCatatGalat_(sumber, pesan, versi);   // galat rilis uji (Rilis.gs)
    var n = sh.getLastRow();
    if (n > PML.MAKS_GALAT + 200) sh.deleteRows(2, n - 1 - PML.MAKS_GALAT);
  } catch (e) {}
}

// Dipanggil aplikasi (tanpa token, karena galat bisa terjadi sebelum login). Dibatasi per menit.
// info: {pesan, stack, layar, versi, pengguna}
function waStafLaporGalat(info) {
  info = info || {};
  var c = CacheService.getScriptCache();
  var k = 'pml_lapor_' + Utilities.formatDate(new Date(), absTz_(), 'yyyyMMddHHmm');
  var n = Number(c.get(k) || 0);
  if (n >= PML.MAKS_LAPOR_PER_MENIT) return { diterima: false };
  c.put(k, String(n + 1), 120);
  pmlCatatGalat_('aplikasi', info.layar, info.pesan, info.stack, info.versi, info.pengguna);
  return { diterima: true };
}

function waAdminLogGalat(token, batas) {
  wajibAdmin_(token);
  var sh = pmlSheet_(PML.SHEET_GALAT, PML.HDR_GALAT);
  var n = sh.getLastRow() - 1;
  if (n < 1) return { baris: [], total: 0 };
  var ambil = Math.min(n, Math.max(1, Math.min(500, parseInt(batas, 10) || 200)));
  var v = sh.getRange(sh.getLastRow() - ambil + 1, 1, ambil, PML.HDR_GALAT.length).getDisplayValues();
  var out = v.reverse().map(function(r) {
    return { waktu: r[0], sumber: r[1], fungsi: r[2], pesan: r[3], detail: r[4], versi: r[5], pengguna: r[6] };
  });
  return { baris: out, total: n };
}

function waAdminLogGalatBersihkan(token) {
  var p = wajibAdmin_(token);
  var sh = pmlSheet_(PML.SHEET_GALAT, PML.HDR_GALAT);
  var n = sh.getLastRow();
  if (n > 1) sh.deleteRows(2, n - 1);
  try { catat_(p.peran, '', p.nama, 'Bersihkan log galat', (n - 1) + ' baris', 'OK'); } catch (e) {}
  return { dihapus: Math.max(0, n - 1) };
}

// ---------- versi aplikasi ----------
// Versi aplikasi otomatis dari rilis GitHub (Rilis.gs). v1.38.5: jalur UJI -> RESMI.
// token (opsional, staf): akun penguji ditawari rilis uji (tidak wajib); lainnya rilis resmi (wajib).
// Panggilan ini (tiap aplikasi dibuka) juga memastikan pemicu rilis & cadangan terpasang.
function waStafVersiApp(token) {
  try { rlsPastikanPemicu_(false); } catch (e) {}
  return rlsUntuk_(token || '');
}

// ---------- audit kesehatan data siswa ----------
function pmlNormRombel_(s) {
  return String(s || '').toUpperCase().replace(/^ROM-/, '').replace(/KELAS/g, '').replace(/[^A-Z0-9]/g, '');
}

function pmlCekData_() {
  var masalah = [];
  // v1.70.4: kolom Kunci menunjuk sumber data (el|idRombelEl|nama = sheet Siswa e-learning; wb|ID WB / wbn|nama|rombel = WARGA BELAJAR)
  var tambah = function(jenis, nama, nisn, idWb, rbEl, rbSim, ket, kunci) { masalah.push([jenis, nama || '', nisn || '', idWb || '', rbEl || '', rbSim || '', ket || '', kunci || '']); };

  var rb = absBaca_('ROMBEL'), simRb = {};
  for (var i = 1; i < rb.v.length; i++) {
    var idR = sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim();
    if (idR) simRb[idR] = sTeks_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL')).trim();
  }

  var wb = absBaca_('WARGA BELAJAR'), perNisn = {}, perNama = {};
  for (var j = 1; j < wb.v.length; j++) {
    var r = wb.v[j];
    var st = sTeks_(absNilai_(wb, r, 'STATUS')).trim();
    if (st && st !== 'Aktif') continue;
    var x = {
      id: sTeks_(absNilai_(wb, r, 'ID WB')).trim(), nisn: sTeks_(absNilai_(wb, r, 'NISN')).trim(),
      nama: sTeks_(absNilai_(wb, r, 'NAMA WB')).trim(), rombel: sTeks_(absNilai_(wb, r, 'ROMBEL')).trim()
    };
    if (!x.nama) continue;
    var rbNama = simRb[x.rombel] || x.rombel, kWb = x.id ? 'wb|' + x.id : 'wbn|' + x.nama + '|' + x.rombel;
    x.kunci = kWb;
    if (!x.nisn && !x.id) tambah('Tanpa NISN dan ID WB', x.nama, '', '', '', rbNama, 'QR kartu tidak bisa dibuat.', kWb);
    if (!x.rombel) tambah('Tanpa rombel (SIM)', x.nama, x.nisn, x.id, '', '', 'Isi kolom ROMBEL di WARGA BELAJAR.', kWb);
    else if (!simRb[x.rombel]) tambah('Rombel tidak dikenal (SIM)', x.nama, x.nisn, x.id, '', x.rombel, 'ID rombel tidak ada di tab ROMBEL.', kWb);
    if (x.nisn) (perNisn[x.nisn] = perNisn[x.nisn] || []).push(x);
    var kn = normNama_(x.nama);
    (perNama[kn] = perNama[kn] || []).push(x);
  }
  Object.keys(perNisn).forEach(function(n) {
    if (perNisn[n].length < 2) return;
    perNisn[n].forEach(function(x) { tambah('NISN ganda (SIM)', x.nama, x.nisn, x.id, '', simRb[x.rombel] || x.rombel, perNisn[n].length + ' baris aktif memakai NISN ini.', x.kunci); });
  });

  var elRb = {};
  getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(r, i) {
    if (i && String(r[0]).trim()) elRb[sTeks_(r[0]).trim()] = sTeks_(r[1]).trim();
  });
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (!i || !String(r[1]).trim()) return;
    var nama = sTeks_(r[1]).trim(), idRbEl = sTeks_(r[0]).trim(), nisn = sTeks_(r[6]).trim();
    var rbEl = elRb[idRbEl] || idRbEl, kEl = 'el|' + idRbEl + '|' + nama;
    var cocok = nisn && perNisn[nisn] ? perNisn[nisn][0] : null;
    if (!cocok) {
      var sama = perNama[normNama_(nama)] || [];
      if (sama.length === 1) cocok = sama[0];
    }
    if (!cocok) { tambah('Tidak ditemukan di Data Induk', nama, nisn, '', rbEl, '', nisn ? 'NISN tidak ada di WARGA BELAJAR aktif.' : 'NISN kosong dan nama tidak cocok tepat satu.', kEl); return; }
    var rbSim = simRb[cocok.rombel] || cocok.rombel;
    if (pmlNormRombel_(rbEl) && pmlNormRombel_(rbSim) && pmlNormRombel_(rbEl) !== pmlNormRombel_(rbSim)) {
      tambah('Rombel berbeda', nama, nisn || cocok.nisn, cocok.id, rbEl, rbSim, 'Absensi mengikuti Data Induk.', kEl);
    }
    if (!nisn && cocok.nisn) tambah('NISN kosong di e-learning', nama, cocok.nisn, cocok.id, rbEl, rbSim, 'NISN ada di Data Induk.', kEl);
  });
  return masalah;
}

function pmlJalankanCek_() {
  var masalah = pmlCekData_();
  var waktu = absWaktu_();
  var sh = pmlSheet_(PML.SHEET_AUDIT, PML.HDR_AUDIT);
  sh.getRange(1, 1, 1, PML.HDR_AUDIT.length).setValues([PML.HDR_AUDIT]).setFontWeight('bold');   // v1.70.4: kolom Kunci
  var n = sh.getLastRow();
  if (n > 1) sh.getRange(2, 1, n - 1, PML.HDR_AUDIT.length).clearContent();
  if (masalah.length) {
    sh.getRange(2, 1, masalah.length, PML.HDR_AUDIT.length).setValues(masalah.map(function(m) { return [waktu].concat(m.map(function(x) { return pmlAman_(x, 300); })); }));
  }
  var perJenis = {};
  masalah.forEach(function(m) { perJenis[m[0]] = (perJenis[m[0]] || 0) + 1; });
  var ringkas = { waktu: waktu, total: masalah.length, perJenis: perJenis };
  PropertiesService.getScriptProperties().setProperty('PML_AUDIT_TERAKHIR', JSON.stringify(ringkas));
  return { ringkas: ringkas, masalah: masalah };
}

function pmlJadwalAktif_() {
  return ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === PML.PEMICU; });
}

// Pemicu waktu harian (dipasang dari aplikasi lewat waAdminCekDataJadwal).
function pemicuCekDataHarian() {
  try { pmlJalankanCek_(); } catch (e) { pmlCatatGalat_('pemicu', PML.PEMICU, String(e && e.message || e), e && e.stack, '', ''); }
}

function waAdminCekData(token, jalankan) {
  var p = wajibAdmin_(token);
  var hasil;
  if (jalankan === true) {
    hasil = pmlJalankanCek_();
    try { catat_(p.peran, '', p.nama, 'Cek kesehatan data', hasil.ringkas.total + ' masalah', 'OK'); } catch (e) {}
  } else {
    var sh = pmlSheet_(PML.SHEET_AUDIT, PML.HDR_AUDIT);
    var n = sh.getLastRow() - 1;
    var v = n > 0 ? sh.getRange(2, 2, n, PML.HDR_AUDIT.length - 1).getDisplayValues() : [];
    var ringkas = null;
    try { ringkas = JSON.parse(PropertiesService.getScriptProperties().getProperty('PML_AUDIT_TERAKHIR') || 'null'); } catch (e2) {}
    hasil = { ringkas: ringkas, masalah: v };
  }
  return {
    ringkas: hasil.ringkas,
    jadwal: pmlJadwalAktif_(),
    masalah: hasil.masalah.slice(0, 500).map(function(m) {
      return { jenis: m[0], nama: m[1], nisn: m[2], idWb: m[3], rombelEl: m[4], rombelSim: m[5], ket: m[6], kunci: m[7] || '' };
    })
  };
}

function waAdminCekDataJadwal(token, aktif) {
  var p = wajibAdmin_(token);
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === PML.PEMICU) ScriptApp.deleteTrigger(t); });
  if (aktif === true) ScriptApp.newTrigger(PML.PEMICU).timeBased().everyDays(1).atHour(PML.JAM_PEMICU).create();
  try { catat_(p.peran, '', p.nama, 'Jadwal cek data', aktif === true ? 'aktif' : 'nonaktif', 'OK'); } catch (e) {}
  return { jadwal: pmlJadwalAktif_() };
}

// ============================================================================
// v1.70.4: TELUSURI SUMBER MASALAH DATA + TINDAKAN (Admin)
// Setiap masalah audit punya Kunci yang menunjuk sumber datanya:
//   el|<ID Rombel e-learning>|<Nama>  -> baris di sheet Siswa e-learning (akun belajar siswa)
//   wb|<ID WB> / wbn|<Nama>|<Rombel>   -> baris di WARGA BELAJAR (Data Induk)
// Rincian: isi baris sumber, kandidat di Data Induk (termasuk yang Nonaktif/Lulus/Keluar), dan jejak asal data dari
// Log Aktivitas. Tindakan: hapus / nonaktifkan akun e-learning, tambahkan ke Data Induk, aktifkan kembali,
// ubah / nonaktifkan data induk, samakan e-learning dengan Data Induk. Setelah ditindak, masalah hilang dari daftar.
// ============================================================================
function pmlSiswaCari_(idR, nama) {
  var sh = getSheet(CONFIG.SHEETS.SISWA), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][SSW.S_ROMBEL]).trim() === idR && sTeks_(v[i][SSW.S_NAMA]).trim() === nama) return { sh: sh, baris: i + 1, r: v[i], hdr: v[0] };
  }
  return null;
}
function pmlUraiKunci_(kunci) {
  var k = String(kunci || ''), p = k.split('|');
  if (p[0] === 'el' && p.length >= 3) return { jenis: 'el', idR: p[1], nama: p.slice(2).join('|') };
  if (p[0] === 'wb' && p[1]) return { jenis: 'wb', id: p[1] };
  if (p[0] === 'wbn' && p.length >= 3) return { jenis: 'wbn', nama: p[1], rombel: p.slice(2).join('|') };
  throw new Error('Masalah ini belum memiliki penunjuk sumber. Tekan "Periksa sekarang" lalu buka lagi.');
}
function pmlWbSemua_() {
  var t = absBaca_('WARGA BELAJAR'), rb = honProgramRombel_(), out = [];
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i], g = function(n) { return absNilai_(t, r, n); };
    var id = sTeks_(g('ID WB')).trim(), nama = sTeks_(g('NAMA WB')).trim();
    if (!id && !nama) continue;
    var idR = sTeks_(g('ROMBEL')).trim();
    out.push({ id: id, nama: nama, nisn: sTeks_(g('NISN')).trim(), rombel: idR, namaRombel: rb[idR] ? rb[idR].nama : idR,
      status: sTeks_(g('STATUS')).trim() || 'Aktif', tglLahir: formatTanggalUntukBanding_(g('TANGGAL LAHIR')), nik: sTeks_(g('NIK')).trim() });
  }
  return out;
}
function pmlTglEl_(v) { try { return formatTanggalUntukBanding_(v); } catch (e) { return sTeks_(v); } }
// Jejak asal data: entri Log Aktivitas yang menyebut nama ini (maks. 15, terbaru dulu).
function pmlAsal_(nama) {
  var out = [];
  try {
    var sh = pastikanSheetAktivitas_(), n = String(nama || '').trim();
    if (n.length < 3) return out;
    var sel = sh.createTextFinder(n).matchCase(false).findAll(), baris = {};
    sel.forEach(function(c) { if (c.getRow() > 1) baris[c.getRow()] = true; });
    Object.keys(baris).map(Number).sort(function(a, b) { return b - a; }).slice(0, 15).forEach(function(b) {
      var r = sh.getRange(b, 1, 1, 7).getDisplayValues()[0];
      out.push({ waktu: r[0], peran: r[1], oleh: r[3], aksi: r[4], detail: r[5] });
    });
  } catch (e) {}
  return out;
}
function waAdminCekDataRinci(token, kunci) {
  wajibAdmin_(token);
  var u = pmlUraiKunci_(kunci), out = { kunci: String(kunci), sumber: u.jenis === 'el' ? 'el' : 'wb', el: null, induk: [], kandidat: [], asal: [], rombelSim: [], tebakRombel: '' };
  var rb = honProgramRombel_();
  out.rombelSim = Object.keys(rb).filter(String).map(function(id) { return { id: id, nama: rb[id].nama }; }).sort(function(a, b) { return a.nama.localeCompare(b.nama, 'id', { numeric: true }); });
  var semua = pmlWbSemua_();
  try {
    var sh = pmlSheet_(PML.SHEET_AUDIT, PML.HDR_AUDIT), n = sh.getLastRow() - 1;
    out.masalah = n > 0 ? sh.getRange(2, 2, n, PML.HDR_AUDIT.length - 1).getDisplayValues().filter(function(m) { return m[7] === String(kunci); }).map(function(m) { return { jenis: m[0], ket: m[6] }; }) : [];
  } catch (e0) { out.masalah = []; }
  if (u.jenis === 'el') {
    var f = pmlSiswaCari_(u.idR, u.nama);
    if (!f) { out.hilang = true; out.asal = pmlAsal_(u.nama); return out; }
    var r = f.r, namaRb = idsNamaRombelEl_(u.idR);
    out.el = { baris: f.baris, idRombel: u.idR, rombel: namaRb, nama: u.nama, tglLahir: pmlTglEl_(r[SSW.S_TGL]), kontak: sTeks_(r[SSW.S_KONTAK]),
      terdaftar: sTeks_(r[SSW.S_DAFTAR]), nisn: sTeks_(r[SSW.S_NISN]).trim(), punyaKode: !!sTeks_(r[SSW.S_KODE]).trim() };
    var nn = normNama_(u.nama);
    out.kandidat = semua.filter(function(w) {
      return (out.el.nisn && w.nisn === out.el.nisn) || normNama_(w.nama) === nn || (out.el.tglLahir && w.tglLahir === out.el.tglLahir && idsMirip_(w.nama, u.nama));
    }).slice(0, 10);
    var kEl = pmlNormRombel_(namaRb) || pmlNormRombel_(u.idR);
    out.rombelSim.forEach(function(x) { if (!out.tebakRombel && kEl && pmlNormRombel_(x.nama) === kEl) out.tebakRombel = x.id; });
    out.asal = pmlAsal_(u.nama);
  } else {
    var w = u.jenis === 'wb' ? semua.filter(function(x) { return x.id === u.id; })[0] : semua.filter(function(x) { return x.nama === u.nama && x.rombel === u.rombel; })[0];
    if (!w) { out.hilang = true; return out; }
    out.induk = [w];
    if (w.nisn) semua.forEach(function(x) { if (x !== w && x.nisn === w.nisn) out.induk.push(x); });   // NISN ganda
    out.asal = pmlAsal_(w.nama);
  }
  return out;
}
// Buang masalah dengan kunci ini dari daftar audit (dan perbarui ringkasan).
function pmlBuangMasalah_(kunci) {
  var sh = pmlSheet_(PML.SHEET_AUDIT, PML.HDR_AUDIT), n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  var v = sh.getRange(2, 1, n, PML.HDR_AUDIT.length).getValues(), sisa = [], buang = 0;
  v.forEach(function(r) { if (String(r[8]) === String(kunci)) buang++; else sisa.push(r); });
  if (!buang) return 0;
  sh.getRange(2, 1, n, PML.HDR_AUDIT.length).clearContent();
  if (sisa.length) sh.getRange(2, 1, sisa.length, PML.HDR_AUDIT.length).setValues(sisa);
  try {
    var sp = PropertiesService.getScriptProperties(), rk = JSON.parse(sp.getProperty('PML_AUDIT_TERAKHIR') || 'null');
    if (rk) {
      var per = {};
      sisa.forEach(function(r) { per[r[1]] = (per[r[1]] || 0) + 1; });
      rk.total = sisa.length; rk.perJenis = per;
      sp.setProperty('PML_AUDIT_TERAKHIR', JSON.stringify(rk));
    }
  } catch (e) {}
  return buang;
}
// aksi: hapusEl | nonaktifEl | tambahInduk {rombel} | aktifkanInduk {idWb} | nonaktifInduk {idWb} | ubahInduk {idWb, nisn?, rombel?}
//       | samakanEl | isiNisnEl {nisn}
function waAdminCekDataTindak(token, kunci, aksi, d) {
  var p = wajibAdmin_(token), u = pmlUraiKunci_(kunci);
  d = d || {};
  var pesan = '';
  if (aksi === 'buang') return { sukses: true, pesan: 'Dihapus dari daftar masalah.', dibuang: pmlBuangMasalah_(kunci) };   // sumber sudah tidak ada
  if (aksi === 'hapusEl' || aksi === 'nonaktifEl' || aksi === 'samakanEl' || aksi === 'isiNisnEl' || aksi === 'tambahInduk') {
    if (u.jenis !== 'el') throw new Error('Tindakan ini untuk akun e-learning.');
  }
  if (aksi === 'hapusEl' || aksi === 'nonaktifEl') {
    var kunciL = LockService.getScriptLock();
    kunciL.waitLock(30000);
    try {
      var f = pmlSiswaCari_(u.idR, u.nama);
      if (!f) throw new Error('Akun e-learning ini sudah tidak ada.');
      var lebar = f.hdr.length, nilai = f.r.slice(0, lebar).map(function(x) { return x instanceof Date ? sTeks_(x) : String(x); }), ss = f.sh.getParent();
      if (aksi === 'hapusEl') {
        var cad = ss.getSheetByName(SSW.TAB_CADANGAN) || ss.insertSheet(SSW.TAB_CADANGAN);
        if (cad.getLastRow() === 0) cad.getRange(1, 1, 1, lebar + 2).setValues([['Dihapus pada', 'Digabung ke'].concat(f.hdr.map(String))]).setFontWeight('bold');
        cad.getRange(cad.getLastRow() + 1, 1, 1, lebar + 2).setNumberFormat('@').setValues([[waktuSekarang_(), 'Dihapus dari Pemeliharaan oleh ' + p.nama].concat(nilai)]);
        pesan = 'Akun e-learning ' + u.nama + ' dihapus (salinan di tab ' + SSW.TAB_CADANGAN + ').';
      } else {
        var na = ss.getSheetByName(PML.SHEET_NONAKTIF) || ss.insertSheet(PML.SHEET_NONAKTIF);
        if (na.getLastRow() === 0) na.getRange(1, 1, 1, lebar + 2).setValues([['Dinonaktifkan pada', 'Oleh'].concat(f.hdr.map(String))]).setFontWeight('bold');
        na.getRange(na.getLastRow() + 1, 1, 1, lebar + 2).setNumberFormat('@').setValues([[waktuSekarang_(), p.nama].concat(nilai)]);
        pesan = 'Akun e-learning ' + u.nama + ' dinonaktifkan (tidak bisa masuk; data dipindah ke tab ' + PML.SHEET_NONAKTIF + ').';
      }
      f.sh.deleteRow(f.baris);
      catat_(p.peran, u.idR, p.nama, aksi === 'hapusEl' ? 'Hapus akun siswa (pemeliharaan)' : 'Nonaktifkan akun siswa (pemeliharaan)', u.nama + ' · ' + nilai.join(' | ').slice(0, 220), 'OK');
    } finally { kunciL.releaseLock(); }
  } else if (aksi === 'tambahInduk') {
    var fe = pmlSiswaCari_(u.idR, u.nama);
    if (!fe) throw new Error('Akun e-learning ini sudah tidak ada.');
    if (!String(d.rombel || '').trim()) throw new Error('Pilih rombel Data Induk.');
    var isi = { 'NAMA WB': u.nama, 'ROMBEL': String(d.rombel), 'STATUS': 'Aktif' };
    var nisn = sTeks_(fe.r[SSW.S_NISN]).replace(/\D/g, ''), tg = pmlTglEl_(fe.r[SSW.S_TGL]);
    if (/^\d{10}$/.test(nisn)) isi['NISN'] = nisn;
    if (/^\d{4}-\d{2}-\d{2}$/.test(tg)) isi['TANGGAL LAHIR'] = tg;
    var h = waStafIndukSimpan(token, 'wb', isi);
    pesan = u.nama + ' ditambahkan ke Data Induk (' + h.id + ').';
  } else if (aksi === 'aktifkanInduk') {
    waStafIndukSimpan(token, 'wb', { _id: String(d.idWb || ''), 'STATUS': 'Aktif' });
    pesan = 'Data induk diaktifkan kembali.';
  } else if (aksi === 'nonaktifInduk') {
    waStafIndukNonaktif(token, 'wb', String(d.idWb || ''));
    pesan = 'Data induk dinonaktifkan.';
  } else if (aksi === 'ubahInduk') {
    var ub = { _id: String(d.idWb || '') };
    if (d.nisn !== undefined) ub['NISN'] = String(d.nisn || '').trim();
    if (d.rombel !== undefined && String(d.rombel).trim()) ub['ROMBEL'] = String(d.rombel).trim();
    waStafIndukSimpan(token, 'wb', ub);
    pesan = 'Data induk diperbarui.';
  } else if (aksi === 'samakanEl') {
    var bm = sswBacaBm_(), fs2 = pmlSiswaCari_(u.idR, u.nama);
    if (!fs2) throw new Error('Akun e-learning ini sudah tidak ada.');
    var r2 = bm.rows.filter(function(x) { return x.baris === fs2.baris; })[0];
    if (!r2) throw new Error('Baris siswa tidak ditemukan. Muat ulang lalu coba lagi.');
    var hs = waAdminSamakanInduk(token, r2.kunci);
    pesan = 'Disamakan dengan Data Induk: ' + hs.ket;
  } else if (aksi === 'isiNisnEl') {
    var fn = pmlSiswaCari_(u.idR, u.nama), nis = String(d.nisn || '').replace(/\D/g, '');
    if (!fn) throw new Error('Akun e-learning ini sudah tidak ada.');
    if (!/^\d{10}$/.test(nis)) throw new Error('NISN harus 10 angka.');
    fn.sh.getRange(fn.baris, SSW.S_NISN + 1).setNumberFormat('@').setValue(nis);
    catat_(p.peran, u.idR, p.nama, 'Isi NISN akun siswa (pemeliharaan)', u.nama + ' ' + nis, 'OK');
    pesan = 'NISN akun e-learning diisi.';
  } else {
    throw new Error('Tindakan tidak dikenal.');
  }
  var dibuang = pmlBuangMasalah_(kunci);
  return { sukses: true, pesan: pesan, dibuang: dibuang };
}
