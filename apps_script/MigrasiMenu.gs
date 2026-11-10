// ============================================================================
// MIGRASI SEKALI-JALAN: MENU / SIM SETARA -> Standalone (v1.37.0)
// ----------------------------------------------------------------------------
// Jalankan dari editor Apps Script (tombol Run):
//   1) migrasiDariMenuPratinjau()  - hanya melaporkan rencana, TIDAK menulis apa pun.
//   2) migrasiDariMenu()           - cadangan + salin semua tab + laporan.
// MENU hanya DIBACA. Isinya tidak pernah diubah; file itu dibiarkan sebagai arsip.
// Ini SATU-SATUNYA tempat di kode yang masih membuka file MENU.
//
// Cara menyalin (lossless):
//  - Zona waktu Standalone disamakan dulu dengan MENU (Asia/Jakarta). Nilai jam saja
//    (mis. JAM BUKA GLOBAL 06:00) disimpan Sheets sebagai tanggal 1899 yang memakai zona
//    waktu historis; tanpa penyamaan, jam akan bergeser saat disalin.
//  - Nilai (getValues, bukan rumus) + format angka per sel disalin. Format angka ditulis
//    lebih dulu; teks di sel yang bukan format teks diberi awalan apostrof agar
//    "0812..." / NISN berawalan 0 tidak berubah menjadi angka.
//  - Tab tujuan yang sudah berisi data (lebih dari baris judul) => berhenti, tidak menimpa.
// ============================================================================

var MIG = {
  MENU_ID: '1R3b9I0uv3n0qIQY-G11IEDp0TRzDXiHNy_fz8wmLJ7o',
  TAB_LAPORAN: 'Laporan Migrasi',
  PROP_SELESAI: 'MIGRASI_MENU_SELESAI',
  PROP_TAB: 'MIGRASI_MENU_TAB_DIBUAT',
  PROP_TZ_LAMA: 'MIGRASI_MENU_TZ_LAMA',
  // Tab yang dibaca kode lewat getDisplayValues: tampilannya ikut dibandingkan.
  CEK_TAMPILAN: { 'PENGATURAN': true }
};

function migMenu_() {
  try {
    return SpreadsheetApp.openById(MIG.MENU_ID);
  } catch (e) {
    throw new Error('Tidak bisa membuka MENU (' + MIG.MENU_ID + '): ' + (e && e.message ? e.message : e));
  }
}

function migWaktu_() { return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm'); }

function migIsiTab_(sh) {
  return { baris: sh ? sh.getLastRow() : 0, kolom: sh ? sh.getLastColumn() : 0 };
}

// Susun rencana tanpa menulis apa pun.
function migRencana_() {
  var menu = migMenu_(), ss = simSs_();
  var tabStandalone = {};
  ss.getSheets().forEach(function(s) { tabStandalone[s.getName().toUpperCase()] = s; });
  var hasil = { menu: menu, ss: ss, tab: [], masalah: [], tzMenu: menu.getSpreadsheetTimeZone(), tzSs: ss.getSpreadsheetTimeZone(),
    localeMenu: menu.getSpreadsheetLocale(), localeSs: ss.getSpreadsheetLocale() };
  var dipakai = {};
  menu.getSheets().forEach(function(src) {
    var asal = src.getName(), tujuan = simNamaTab_(asal);
    var isi = migIsiTab_(src);
    var t = { asal: asal, tujuan: tujuan, barisAsal: isi.baris, kolomAsal: isi.kolom, keadaan: 'baru', catatan: '' };
    if (dipakai[tujuan.toUpperCase()]) {
      t.keadaan = 'GANDA';
      hasil.masalah.push('Dua tab MENU menuju tab yang sama: "' + tujuan + '".');
    }
    dipakai[tujuan.toUpperCase()] = true;
    var ada = tabStandalone[tujuan.toUpperCase()];
    if (ada && ada.getName() !== tujuan) {
      t.keadaan = 'BENTROK';
      t.catatan = 'Nama bentrok dengan tab "' + ada.getName() + '" (Sheets tidak membedakan huruf besar/kecil). Tambahkan ke SIM_ALIAS: \'' + asal + '\': \'SIM ' + asal + '\'.';
      hasil.masalah.push(t.catatan);
    } else if (ada) {
      var isiT = migIsiTab_(ada);
      if (isiT.baris > 1) {
        t.keadaan = 'BERISI';
        t.catatan = 'Tab tujuan sudah berisi ' + (isiT.baris - 1) + ' baris data. Tidak akan ditimpa.';
        hasil.masalah.push('"' + tujuan + '": ' + t.catatan);
      } else {
        t.keadaan = 'ada-kosong';
        t.catatan = isiT.baris === 1 ? 'Tab tujuan hanya berisi baris judul (dibuat otomatis oleh aplikasi); akan dikosongkan lalu diisi.' : 'Tab tujuan ada tetapi kosong.';
      }
    }
    hasil.tab.push(t);
  });
  return hasil;
}

function migRingkas_(r) {
  var b = [];
  b.push('MENU: "' + r.menu.getName() + '"  zona waktu ' + r.tzMenu + ', locale ' + r.localeMenu);
  b.push('Standalone: "' + r.ss.getName() + '"  zona waktu ' + r.tzSs + ', locale ' + r.localeSs);
  if (r.tzSs !== r.tzMenu) b.push('-> Zona waktu Standalone akan diubah dari ' + r.tzSs + ' ke ' + r.tzMenu + ' sebelum menyalin.');
  b.push('');
  b.push('Tab asal | Tab tujuan | Baris x Kolom | Keadaan | Catatan');
  r.tab.forEach(function(t) {
    b.push(t.asal + ' | ' + t.tujuan + ' | ' + t.barisAsal + ' x ' + t.kolomAsal + ' | ' + t.keadaan + (t.catatan ? ' | ' + t.catatan : ''));
  });
  b.push('');
  b.push('Jumlah tab: ' + r.tab.length + ', total baris (termasuk judul): ' + r.tab.reduce(function(a, t) { return a + t.barisAsal; }, 0));
  b.push(r.masalah.length ? 'MASALAH (migrasi akan berhenti):\n- ' + r.masalah.join('\n- ') : 'Tidak ada masalah. Migrasi siap dijalankan.');
  return b.join('\n');
}

// 1) PRATINJAU: hanya membaca dan melaporkan. Tidak menulis apa pun.
function migrasiDariMenuPratinjau() {
  var r = migRencana_();
  var teks = migRingkas_(r);
  // Tampilan PENGATURAN baris 2 (dibaca aplikasi lewat getDisplayValues)
  var p = r.menu.getSheetByName('PENGATURAN');
  if (p && p.getLastRow() >= 2) {
    var d = p.getRange(1, 1, 2, p.getLastColumn()).getDisplayValues();
    teks += '\n\nPENGATURAN (tampilan di MENU):\n' + d[0].map(function(h, i) { return '  ' + h + ' = ' + d[1][i]; }).join('\n');
  }
  var selesai = PropertiesService.getScriptProperties().getProperty(MIG.PROP_SELESAI);
  if (selesai) teks = 'PERHATIAN: migrasi sudah pernah dijalankan pada ' + selesai + '.\n\n' + teks;
  Logger.log(teks);
  return teks;
}

// Pastikan ukuran grid tujuan cukup.
function migPastikanUkuran_(sh, baris, kolom) {
  if (baris > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), baris - sh.getMaxRows());
  if (kolom > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), kolom - sh.getMaxColumns());
}

function migFormatTeks_(f) { return f === '@'; }

// Bandingkan dua matriks nilai (Date dibandingkan per waktu).
function migSama_(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;
    for (var j = 0; j < a[i].length; j++) {
      var x = a[i][j], y = b[i][j];
      if (x instanceof Date || y instanceof Date) {
        if (!(x instanceof Date) || !(y instanceof Date) || x.getTime() !== y.getTime()) return false;
      } else if (x !== y) return false;
    }
  }
  return true;
}

function migSalinTab_(menuSs, ss, t) {
  var src = menuSs.getSheetByName(t.asal);
  var dst = ss.getSheetByName(t.tujuan), dibuat = false;
  if (!dst) { dst = ss.insertSheet(t.tujuan, ss.getSheets().length); dibuat = true; }
  else dst.clear();
  var n = t.barisAsal, m = t.kolomAsal, nilaiAsal = [], fmt = [];
  if (n > 0 && m > 0) {
    migPastikanUkuran_(dst, n, m);
    var rgAsal = src.getRange(1, 1, n, m);
    nilaiAsal = rgAsal.getValues();
    fmt = rgAsal.getNumberFormats();
    var tulis = nilaiAsal.map(function(r, i) {
      return r.map(function(v, j) {
        if (typeof v === 'string' && v !== '' && !migFormatTeks_(fmt[i][j])) return "'" + v;
        return v;
      });
    });
    var rgTuju = dst.getRange(1, 1, n, m);
    rgTuju.setNumberFormats(fmt);
    rgTuju.setValues(tulis);
    if (src.getFrozenRows() > 0) dst.setFrozenRows(Math.min(src.getFrozenRows(), n));
    dst.getRange(1, 1, 1, m).setFontWeights(src.getRange(1, 1, 1, m).getFontWeights());
  }
  return { sh: dst, dibuat: dibuat, nilaiAsal: nilaiAsal };
}

// 2) MIGRASI: cadangan, salin semua tab, laporan. Berhenti tanpa menulis bila ada masalah.
function migrasiDariMenu() {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  var sp = PropertiesService.getScriptProperties();
  try {
    var r = migRencana_();
    Logger.log(migRingkas_(r));
    if (r.masalah.length) throw new Error('Migrasi dibatalkan, tidak ada yang ditulis:\n- ' + r.masalah.join('\n- '));
    var menuSs = r.menu, ss = r.ss, tgl = migWaktu_();

    // a) cadangan kedua spreadsheet
    [ss.getId(), menuSs.getId()].forEach(function(id) {
      var f = DriveApp.getFileById(id);
      var induk = f.getParents();
      var nama = 'Cadangan pra-migrasi ' + tgl + ' - ' + f.getName();
      var salinan = induk.hasNext() ? f.makeCopy(nama, induk.next()) : f.makeCopy(nama);
      Logger.log('Cadangan dibuat: ' + salinan.getName() + ' (' + salinan.getUrl() + ')');
    });

    // zona waktu disamakan supaya tanggal/jam tersalin tanpa bergeser
    if (r.tzSs !== r.tzMenu) {
      sp.setProperty(MIG.PROP_TZ_LAMA, r.tzSs);
      ss.setSpreadsheetTimeZone(r.tzMenu);
      Logger.log('Zona waktu Standalone diubah: ' + r.tzSs + ' -> ' + r.tzMenu);
    }

    // b) salin tiap tab
    var laporan = [], dibuat = [];
    r.tab.forEach(function(t) {
      var h = migSalinTab_(menuSs, ss, t);
      if (h.dibuat) { dibuat.push(t.tujuan); sp.setProperty(MIG.PROP_TAB, JSON.stringify(dibuat)); }
      laporan.push({ t: t, h: h });
    });
    SpreadsheetApp.flush();

    // c) verifikasi + laporan
    var baris = [['Tab asal', 'Tab tujuan', 'Baris asal', 'Kolom asal', 'Baris tujuan', 'Kolom tujuan', 'Status', 'Catatan', 'Waktu']];
    var semuaOk = true;
    laporan.forEach(function(x) {
      var t = x.t, dst = x.h.sh, isi = migIsiTab_(dst), catatan = [];
      var ok = isi.baris === t.barisAsal && isi.kolom === t.kolomAsal;
      if (!ok) catatan.push('Ukuran berbeda');
      if (ok && t.barisAsal > 0 && t.kolomAsal > 0) {
        var nilaiTuju = dst.getRange(1, 1, t.barisAsal, t.kolomAsal).getValues();
        if (!migSama_(x.h.nilaiAsal, nilaiTuju)) { ok = false; catatan.push('Isi sel berbeda'); }
        if (MIG.CEK_TAMPILAN[t.asal]) {
          var a = menuSs.getSheetByName(t.asal).getRange(1, 1, t.barisAsal, t.kolomAsal).getDisplayValues();
          var b = dst.getRange(1, 1, t.barisAsal, t.kolomAsal).getDisplayValues();
          if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; catatan.push('Tampilan berbeda: ' + JSON.stringify(a[1] || []) + ' vs ' + JSON.stringify(b[1] || [])); }
        }
      }
      if (t.catatan) catatan.push(t.catatan);
      if (!ok) semuaOk = false;
      baris.push([t.asal, t.tujuan, t.barisAsal, t.kolomAsal, isi.baris, isi.kolom, ok ? 'OK' : 'BEDA', catatan.join('; '), tgl]);
    });
    var lap = ss.getSheetByName(MIG.TAB_LAPORAN) || ss.insertSheet(MIG.TAB_LAPORAN);
    lap.clear();
    lap.getRange(1, 1, baris.length, baris[0].length).setValues(baris);
    lap.getRange(1, 1, 1, baris[0].length).setFontWeight('bold');
    lap.setFrozenRows(1);

    // d) hapus pemicu yang masih merujuk file MENU (pemicu berbasis spreadsheet MENU)
    var dihapus = 0;
    ScriptApp.getProjectTriggers().forEach(function(tr) {
      var sumber = '';
      try { sumber = tr.getTriggerSourceId(); } catch (e) {}
      if (sumber === MIG.MENU_ID) { ScriptApp.deleteTrigger(tr); dihapus++; }
    });

    absLupakan_();
    sp.setProperty(MIG.PROP_SELESAI, tgl);
    try { catat_('Sistem', '', 'Sistem', 'Migrasi MENU', laporan.length + ' tab disalin, ' + (semuaOk ? 'semua OK' : 'ADA YANG BEDA'), semuaOk ? 'OK' : 'GAGAL'); } catch (e) {}
    var teks = 'Migrasi selesai: ' + laporan.length + ' tab disalin, ' + dibuat.length + ' tab baru dibuat, ' + dihapus + ' pemicu MENU dihapus. ' +
      (semuaOk ? 'Semua OK.' : 'ADA YANG BEDA - periksa tab "' + MIG.TAB_LAPORAN + '".');
    Logger.log(teks);
    return teks;
  } finally {
    kunci.releaseLock();
  }
}

// DARURAT: batalkan hasil migrasi di Standalone (hanya tab yang DIBUAT oleh migrasiDariMenu,
// plus mengembalikan zona waktu). MENU tidak tersentuh. Dipakai bila ingin mengulang migrasi.
function migrasiDariMenuBatalkan() {
  var sp = PropertiesService.getScriptProperties(), ss = simSs_();
  var dibuat = JSON.parse(sp.getProperty(MIG.PROP_TAB) || '[]'), dihapus = [];
  dibuat.forEach(function(n) { var sh = ss.getSheetByName(n); if (sh) { ss.deleteSheet(sh); dihapus.push(n); } });
  var tz = sp.getProperty(MIG.PROP_TZ_LAMA);
  if (tz) ss.setSpreadsheetTimeZone(tz);
  [MIG.PROP_TAB, MIG.PROP_TZ_LAMA, MIG.PROP_SELESAI].forEach(function(k) { sp.deleteProperty(k); });
  var teks = 'Dibatalkan. Tab dihapus (' + dihapus.length + '): ' + dihapus.join(', ') + (tz ? '. Zona waktu dikembalikan ke ' + tz : '');
  Logger.log(teks);
  return teks;
}

// ---------- mode pemeliharaan dari editor (cutover) ----------
function hapusCacheMaintenance() {
  CacheService.getScriptCache().remove('mt_flag');
  var v = PropertiesService.getScriptProperties().getProperty('MODE_MAINTENANCE');
  Logger.log('Cache mt_flag dihapus. MODE_MAINTENANCE = ' + v);
  return v;
}
function pemeliharaanNyala() {
  PropertiesService.getScriptProperties().setProperty('MODE_MAINTENANCE', '1');
  return hapusCacheMaintenance();
}
function pemeliharaanMati() {
  PropertiesService.getScriptProperties().setProperty('MODE_MAINTENANCE', '0');
  return hapusCacheMaintenance();
}
