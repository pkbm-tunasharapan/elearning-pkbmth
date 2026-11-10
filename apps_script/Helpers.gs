// ============================================
// FUNGSI BANTU KECIL
// ============================================

// Jaring pengaman: kalau BusyOverlay.html gagal dimuat (atau belum
// disalin), fungsi busyShow/busyHide dkk. tetap ada sebagai fungsi kosong
// supaya dialog tidak error saat memanggilnya. Dipakai oleh showDialog_()
// di Dialog.gs.
function busyStub_() {
  return '<script>' +
    '(function(){' +
    'var kosong = function(){};' +
    'if (typeof window.busyShow     !== "function") window.busyShow     = kosong;' +
    'if (typeof window.busyHide     !== "function") window.busyHide     = kosong;' +
    '})();' +
    '<\/script>';
}
