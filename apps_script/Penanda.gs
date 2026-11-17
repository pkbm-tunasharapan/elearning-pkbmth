// ============================================================================
// PENANDA SUPABASE (v1.92.0, migrasi Modul 1)
// ----------------------------------------------------------------------------
// Aplikasi 1.92+ bertanya ke Supabase "ada yang baru?" (fungsi penanda_baca) sebelum memanggil
// waRuangCek / waStafRuangCek / waNotifCek. Di sini server memperbarui penanda saat ada:
//   chat - pesan chat baru        nv - baris Notifikasi baru (nilai diskusi / jawaban baru)
//   bc   - broadcast berubah      np - notifikasi per peran baru      rf - notifikasi referral baru
// Penanda hanya berisi waktu (ms), tanpa data pribadi. Penulisan memakai rahasia di Script Property
// PENANDA_RAHASIA; Supabase hanya menyimpan hash SHA-256-nya. Kunci publishable boleh publik (sama dengan
// yang tertanam di aplikasi). Bila Supabase tidak terjangkau, semua tetap berjalan seperti sebelumnya.
// Sekali saja (dari editor Apps Script): jalankan penandaSiapkan(), salin hash dari Log ke Supabase.
// ============================================================================
var PND = {
  URL: 'https://illiooqaguxfrsvtzntd.supabase.co',
  KUNCI_PUBLIK: 'sb_publishable__A_AfEI_sfx1WNPsuOmfrA_K4RT0zfc',
  PROP: 'PENANDA_RAHASIA',
  JENIS: { chat: 1, nv: 1, bc: 1, np: 1, rf: 1 }
};

function pndRahasia_() {
  try { return PropertiesService.getScriptProperties().getProperty(PND.PROP) || ''; } catch (e) { return ''; }
}

// Kirim penanda; tidak pernah melempar galat. Hasil: kode HTTP (0 = tidak dikirim/gagal).
function pndKirim_(jenis, ms) {
  try {
    if (!PND.JENIS[jenis]) return 0;
    var rahasia = pndRahasia_();
    if (!rahasia) return 0;
    var res = UrlFetchApp.fetch(PND.URL + '/rest/v1/rpc/penanda_set', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { apikey: PND.KUNCI_PUBLIK },
      payload: JSON.stringify({ p_jenis: jenis, p_ms: Math.round(Number(ms) || Date.now()), p_rahasia: rahasia })
    });
    return res.getResponseCode();
  } catch (e) { return 0; }
}

// Jalankan SEKALI dari editor: membuat rahasia (bila belum ada) dan menampilkan hash-nya di Log.
// Hash bukan rahasia; rahasianya sendiri tetap di Script Properties.
function penandaSiapkan() {
  var sp = PropertiesService.getScriptProperties();
  var r = sp.getProperty(PND.PROP);
  if (!r) {
    r = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    sp.setProperty(PND.PROP, r);
  }
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, r, Utilities.Charset.UTF_8)
    .map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  Logger.log('Hash SHA-256 penanda (aman dibagikan): ' + hash);
  return hash;
}

// Uji dari editor setelah hash dipasang di Supabase: semua jenis harus HTTP 200.
function penandaUji() {
  var now = Date.now(), hasil = {};
  Object.keys(PND.JENIS).forEach(function(j) { hasil[j] = pndKirim_(j, now); });
  Logger.log('Hasil kirim penanda: ' + JSON.stringify(hasil));
  return hasil;
}
