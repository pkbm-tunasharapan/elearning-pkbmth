// ============================================================================
// EDIT LANGSUNG DI SPREADSHEET (v1.88.2)
// Pemicu sederhana onEdit: bila seseorang mengetik langsung di tab tertentu (bukan lewat aplikasi), cache yang
// bergantung pada tab itu langsung dibuang. Dengan begitu cache boleh panjang (cek notifikasi ringan) tanpa membuat
// perubahan manual di sheet tertunda. Hanya membuang cache; tidak mengubah data apa pun.
// Catatan: onEdit tidak terpicu oleh penghapusan baris atau oleh penulisan dari skrip/API; untuk itu cache tetap
// kedaluwarsa sendiri sesuai masa berlakunya.
// ============================================================================
var EDL = { MAKS_BARIS: 300 };

function onEdit(e) {
  try { perfGantiVersi_(); } catch (errV) {}   // v1.88.3: edit di tab mana pun -> cache berversi (beranda, dll.) dihitung ulang
  try { edlBuangCache_(e); } catch (err) {}
}

function edlBuangCache_(e) {
  var rg = e && e.range;
  if (!rg) return '';
  var sh = rg.getSheet(), nama = sh.getName(), c = CacheService.getScriptCache();
  var r1 = Math.max(2, rg.getRow()), n = Math.min(rg.getLastRow(), r1 + EDL.MAKS_BARIS - 1) - r1 + 1;
  if (nama === PERAN.SHEET_PENGGUNA) {
    perfHapusCache_();
    return 'pengguna';
  }
  if (nama === BC.SH) {
    bcLupakan_();
    return 'broadcast';
  }
  if (nama === NP.TAB) {
    c.remove(NP.CACHE);
    return 'notif';
  }
  if (nama === PIN.SHEET) {
    var kunci = [PIN.CK_PETA];
    if (n > 0) sh.getRange(r1, 2, n, 2).getValues().forEach(function(v) {   // B = Nama, C = ID Rombel
      if (String(v[0]).trim()) kunci.push(PIN.CK_STATUS + pinCacheId_(normNama_(v[0]) + '|' + String(v[1]).trim()));
    });
    c.removeAll(kunci);
    return 'pin';
  }
  if (nama === BC.SH_PR) {
    var kp = [];
    if (n > 0) sh.getRange(r1, 1, n, 1).getValues().forEach(function(v) {   // A = kunci perangkat
      var k = String(v[0]).trim();
      if (k) kp.push('pn_' + k.slice(0, 60));
    });
    if (kp.length) c.removeAll(kp);
    return 'perangkat';
  }
  return '';
}
