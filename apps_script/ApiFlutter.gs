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
  TAMBAHAN: { waUrlStaf: true }
};

function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var fn = String(body.fn || '');
    var args = Array.isArray(body.args) ? body.args : [];
    if (fn === 'ping') {
      out = { ok: true, data: { versi: API_FLUTTER.VERSI, waktu: waktuSekarang_() } };
    } else {
      var boleh = (API_FLUTTER.POLA.test(fn) || API_FLUTTER.TAMBAHAN[fn] === true) && typeof globalThis[fn] === 'function';
      if (!boleh) throw new Error('Fungsi tidak diizinkan: ' + fn);
      globalThis.__API_FN = fn; globalThis.__API_ARGS = args; globalThis.__DINAS = false;
      var hasilFn = globalThis[fn].apply(null, args);
      if (globalThis.__DINAS && typeof dinasRapikan_ === 'function') hasilFn = dinasRapikan_(hasilFn);
      if (typeof updLama_ === 'function') hasilFn = updLama_(fn, args, hasilFn, body);
      out = { ok: true, data: hasilFn };
    }
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  var json;
  try { json = JSON.stringify(out); } catch (eJ) { json = JSON.stringify({ ok: false, error: 'Hasil tidak bisa diubah ke JSON.' }); }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
