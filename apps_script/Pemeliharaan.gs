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
  HDR_AUDIT: ['Diperiksa Pada', 'Jenis Masalah', 'Nama', 'NISN', 'ID WB', 'Rombel E-Learning', 'Rombel SIM SETARA', 'Keterangan'],
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
function waStafVersiApp() {
  var sp = PropertiesService.getScriptProperties();
  return {
    versi: sp.getProperty('APP_VERSI_TERBARU') || '',
    url: sp.getProperty('APP_URL_UNDUH') || '',
    catatan: sp.getProperty('APP_CATATAN') || '',
    wajib: sp.getProperty('APP_WAJIB') === '1'
  };
}

// d: {versi: '1.17.0', url: 'https://...', catatan, wajib}
function waAdminVersiAppAtur(token, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  var versi = String(d.versi || '').trim(), url = String(d.url || '').trim();
  if (versi && !/^\d+\.\d+\.\d+$/.test(versi)) throw new Error('Format versi harus seperti 1.17.0');
  if (url && !/^https:\/\//i.test(url)) throw new Error('Tautan unduh harus diawali https://');
  if (versi && !url) throw new Error('Isi tautan unduh APK untuk versi ini.');
  var sp = PropertiesService.getScriptProperties();
  sp.setProperties({
    APP_VERSI_TERBARU: versi,
    APP_URL_UNDUH: url,
    APP_CATATAN: String(d.catatan || '').slice(0, 500),
    APP_WAJIB: d.wajib === true ? '1' : '0'
  });
  try { catat_(p.peran, '', p.nama, 'Atur versi aplikasi', versi + (d.wajib === true ? ' (wajib)' : ''), 'OK'); } catch (e) {}
  return waStafVersiApp();
}

// ---------- audit kesehatan data siswa ----------
function pmlNormRombel_(s) {
  return String(s || '').toUpperCase().replace(/^ROM-/, '').replace(/KELAS/g, '').replace(/[^A-Z0-9]/g, '');
}

function pmlCekData_() {
  var masalah = [];
  var tambah = function(jenis, nama, nisn, idWb, rbEl, rbSim, ket) { masalah.push([jenis, nama || '', nisn || '', idWb || '', rbEl || '', rbSim || '', ket || '']); };

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
    var rbNama = simRb[x.rombel] || x.rombel;
    if (!x.nisn && !x.id) tambah('Tanpa NISN dan ID WB', x.nama, '', '', '', rbNama, 'QR kartu tidak bisa dibuat.');
    if (!x.rombel) tambah('Tanpa rombel (SIM)', x.nama, x.nisn, x.id, '', '', 'Isi kolom ROMBEL di WARGA BELAJAR.');
    else if (!simRb[x.rombel]) tambah('Rombel tidak dikenal (SIM)', x.nama, x.nisn, x.id, '', x.rombel, 'ID rombel tidak ada di tab ROMBEL.');
    if (x.nisn) (perNisn[x.nisn] = perNisn[x.nisn] || []).push(x);
    var kn = normNama_(x.nama);
    (perNama[kn] = perNama[kn] || []).push(x);
  }
  Object.keys(perNisn).forEach(function(n) {
    if (perNisn[n].length < 2) return;
    perNisn[n].forEach(function(x) { tambah('NISN ganda (SIM)', x.nama, x.nisn, x.id, '', simRb[x.rombel] || x.rombel, perNisn[n].length + ' baris aktif memakai NISN ini.'); });
  });

  var elRb = {};
  getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(r, i) {
    if (i && String(r[0]).trim()) elRb[sTeks_(r[0]).trim()] = sTeks_(r[1]).trim();
  });
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (!i || !String(r[1]).trim()) return;
    var nama = sTeks_(r[1]).trim(), idRbEl = sTeks_(r[0]).trim(), nisn = sTeks_(r[6]).trim();
    var rbEl = elRb[idRbEl] || idRbEl;
    var cocok = nisn && perNisn[nisn] ? perNisn[nisn][0] : null;
    if (!cocok) {
      var sama = perNama[normNama_(nama)] || [];
      if (sama.length === 1) cocok = sama[0];
    }
    if (!cocok) { tambah('Tidak ditemukan di SIM SETARA', nama, nisn, '', rbEl, '', nisn ? 'NISN tidak ada di WARGA BELAJAR aktif.' : 'NISN kosong dan nama tidak cocok tepat satu.'); return; }
    var rbSim = simRb[cocok.rombel] || cocok.rombel;
    if (pmlNormRombel_(rbEl) && pmlNormRombel_(rbSim) && pmlNormRombel_(rbEl) !== pmlNormRombel_(rbSim)) {
      tambah('Rombel berbeda', nama, nisn || cocok.nisn, cocok.id, rbEl, rbSim, 'Absensi mengikuti SIM SETARA.');
    }
    if (!nisn && cocok.nisn) tambah('NISN kosong di e-learning', nama, cocok.nisn, cocok.id, rbEl, rbSim, 'NISN ada di SIM SETARA.');
  });
  return masalah;
}

function pmlJalankanCek_() {
  var masalah = pmlCekData_();
  var waktu = absWaktu_();
  var sh = pmlSheet_(PML.SHEET_AUDIT, PML.HDR_AUDIT);
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
      return { jenis: m[0], nama: m[1], nisn: m[2], idWb: m[3], rombelEl: m[4], rombelSim: m[5], ket: m[6] };
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
