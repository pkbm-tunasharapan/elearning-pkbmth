// ============================================================================
// PEMANAS SERVER (aplikasi 1.35): dipanggil robot dari luar (mis. cron-job.org) tiap 5 menit pada jam sekolah.
// - Menjaga server Apps Script tetap "bangun" sehingga pengguna pertama tidak menunggu lama (cold start).
// - Mengisi ulang data yang sering dipakai (pengaturan absensi, rombel, warga belajar, versi aplikasi).
// - Membalas lama proses (ms) sebagai pemantau performa; robot mengirim email bila server gagal menjawab.
// - Tidak memakai kuota pemicu waktu Apps Script karena dipanggil dari luar lewat doPost.
// Panggilan: POST ke URL web app, isi {"fn":"waStafHangatkan","args":["<kunci>"]}.
// Kunci diatur sekali dengan aturKunciHangatkan() (Run dari editor); tanpa kunci yang cocok, fungsi tidak bekerja.
// ============================================================================
var HANGAT = { PROP: 'TH_HANGATKAN_KUNCI' };

function waStafHangatkan(kunci) {
  var mulai = Date.now();
  var simpan = PropertiesService.getScriptProperties().getProperty(HANGAT.PROP) || '';
  if (!simpan || String(kunci || '') !== simpan) return { ok: false, pesan: 'Kunci tidak cocok.' };
  var langkah = {};
  function ukur(nama, f) {
    var t = Date.now();
    try { f(); langkah[nama] = Date.now() - t; } catch (e) { langkah[nama] = 'galat: ' + e.message; }
  }
  ukur('sim', function() { absSim_(); });
  ukur('rombel', function() { ahPetaRombel_(); });
  ukur('wargaBelajar', function() { absBaca_('WARGA BELAJAR'); });
  ukur('presensiHarian', function() { ahBaca_(); });
  ukur('versi', function() { if (typeof updTerbaru_ === 'function') updTerbaru_(); });
  ukur('promosi', function() { if (typeof waStafPromosi === 'function') waStafPromosi(''); });
  return { ok: true, ms: Date.now() - mulai, jam: absJamKini_(), langkah: langkah };
}

// Jalankan sekali dari editor (Run). Kunci baru tampil di Log eksekusi; salin ke pengaturan robot.
function aturKunciHangatkan() {
  var k = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
  PropertiesService.getScriptProperties().setProperty(HANGAT.PROP, k);
  Logger.log('Kunci pemanas: ' + k);
  return k;
}
