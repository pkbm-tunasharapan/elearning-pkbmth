// ============================================================================
// CADANGAN MINGGUAN OTOMATIS (v1.38.5)
// ----------------------------------------------------------------------------
// Tiap Minggu pukul 02.00 seluruh spreadsheet database disalin ke folder "Cadangan Mingguan TH.E-Course"
// (di folder yang sama dengan spreadsheet). Disimpan CDG.SIMPAN salinan terbaru; yang lebih lama dipindah
// ke Sampah Drive (masih bisa dipulihkan 30 hari). Pemicu dipasang otomatis oleh rlsPastikanPemicu_.
// Pemulihan: buka salinan, lalu salin tab yang diperlukan (lihat docs/RUNBOOK.md).
// ============================================================================
var CDG = {
  PEMICU: 'pemicuCadanganMingguan',
  FOLDER: 'Cadangan Mingguan TH.E-Course',
  AWALAN: 'Cadangan mingguan ',
  SIMPAN: 8
};

function cdgFolder_() {
  var sp = PropertiesService.getScriptProperties(), id = sp.getProperty('CADANGAN_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var berkas = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  var induk = berkas.getParents().hasNext() ? berkas.getParents().next() : DriveApp.getRootFolder();
  var ada = induk.getFoldersByName(CDG.FOLDER);
  var f = ada.hasNext() ? ada.next() : induk.createFolder(CDG.FOLDER);
  sp.setProperty('CADANGAN_FOLDER', f.getId());
  return f;
}

// Membuat satu cadangan sekarang dan merapikan cadangan lama. Mengembalikan ringkasan.
function cdgBuat_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), folder = cdgFolder_();
  var waktu = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm');
  var salinan = DriveApp.getFileById(ss.getId()).makeCopy(CDG.AWALAN + waktu + ' - ' + ss.getName(), folder);
  var daftar = [], it = folder.getFiles();
  while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf(CDG.AWALAN) === 0) daftar.push(f); }
  daftar.sort(function(a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
  var dibuang = 0;
  daftar.slice(CDG.SIMPAN).forEach(function(f) { try { f.setTrashed(true); dibuang++; } catch (e) {} });
  PropertiesService.getScriptProperties().setProperty('CADANGAN_TERAKHIR', waktu);
  try { catat_('Sistem', '', 'Cadangan', 'Cadangan mingguan', salinan.getName() + ' · ' + Math.min(daftar.length, CDG.SIMPAN) + ' tersimpan, ' + dibuang + ' lama dibuang', 'OK'); } catch (e2) {}
  return { nama: salinan.getName(), url: salinan.getUrl(), tersimpan: Math.min(daftar.length, CDG.SIMPAN), dibuang: dibuang, folderUrl: folder.getUrl() };
}

// Pemicu mingguan. Galat dicatat ke Log Galat.
function pemicuCadanganMingguan() {
  try { cdgBuat_(); } catch (e) { pmlCatatGalat_('pemicu', CDG.PEMICU, String(e && e.message || e), e && e.stack, '', ''); }
}

// Tombol "Buat cadangan sekarang" (admin).
function waAdminCadanganSekarang(token) {
  var p = wajibAdmin_(token);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    var h = cdgBuat_();
    try { catat_(p.peran, '', p.nama, 'Cadangan manual', h.nama, 'OK'); } catch (e) {}
    return h;
  } finally { kunci.releaseLock(); }
}
