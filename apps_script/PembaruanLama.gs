// ============================================================================
// PEMBERITAHUAN PEMBARUAN UNTUK APLIKASI LAMA (aplikasi 1.33)
// Aplikasi 1.33 ke atas mengirim "v" (versi) di setiap permintaan dan punya pemeriksa versi sendiri.
// Permintaan TANPA "v" berasal dari aplikasi lama (mis. 1.15 yang belum punya pembaruan otomatis).
// Untuk mereka, server menyisipkan:
//  - kartu merah "Pembaruan aplikasi tersedia" paling atas di beranda (staf & siswa);
//  - notifikasi (snackbar "Pesan baru") sekali sehari lewat pemeriksa chat yang sudah ada di versi lama.
// Hanya aktif bila versi terbaru di Drive (Versi Aplikasi) sudah >= UPD.MIN_V.
// ============================================================================
var UPD = {
  MIN_V: '1.33.0',
  ALAMAT: 'pkbm-tunasharapan.github.io/elearning-pkbmth/unduh.html',
  FN: { waStafBeranda: 'kartu', waSiswaBeranda: 'kartu', waStafRuangCek: 'chat', waRuangCek: 'chat' }
};

function updBanding_(a, b) {
  var x = String(a || '').split('.'), y = String(b || '').split('.');
  for (var i = 0; i < 3; i++) {
    var u = parseInt(x[i], 10) || 0, v = parseInt(y[i], 10) || 0;
    if (u !== v) return u > v ? 1 : -1;
  }
  return 0;
}

function updTerbaru_() {
  var c = CacheService.getScriptCache();
  try { var s = c.get('upd_terbaru'); if (s) return JSON.parse(s); } catch (e) {}
  var t = null;
  try {
    var d = waStafVersiApp() || {};
    t = { versi: String(d.versi || ''), url: String(d.url || '') };
    c.put('upd_terbaru', JSON.stringify(t), 600);
  } catch (e2) {}
  return t;
}

// Dipanggil dari doPost (ApiFlutter.gs) setelah fungsi API dijalankan.
function updLama_(fn, args, data, body) {
  try {
    if (body && body.v) return data;
    var jenis = UPD.FN[fn];
    if (!jenis || !data || typeof data !== 'object' || Array.isArray(data)) return data;
    var t = updTerbaru_();
    if (!t || !t.versi || updBanding_(t.versi, UPD.MIN_V) < 0) return data;
    if (jenis === 'kartu') {
      var kartu = Array.isArray(data.kartu) ? data.kartu : [];
      kartu.unshift({
        judul: 'Pembaruan aplikasi ' + t.versi + ' tersedia',
        ikon: 'peringatan',
        ringkas: 'Penting',
        item: [
          { t: 'Aplikasi Anda versi lama dan tidak mendapat pembaruan otomatis.', s: 'Pasang versi ' + t.versi + ' agar semua fitur berjalan benar.', w: 'merah' },
          { t: 'Buka di Chrome: ' + UPD.ALAMAT, s: 'Ketuk "Unduh APK", lalu pasang menimpa aplikasi lama. Akun & data tetap aman.', w: 'merah' },
          { t: 'Setelah terpasang, aplikasi memberi tahu sendiri setiap ada versi baru.', s: '', w: 'biru' }
        ]
      });
      data.kartu = kartu;
    } else {
      var sejak = Number(fn === 'waRuangCek' ? args[2] : args[1]) || 0;
      if (sejak > 0 && Array.isArray(data.baru)) {
        var hari = new Date();
        hari.setHours(0, 0, 0, 0);
        data.baru.push({
          kunci: fn === 'waRuangCek' ? 'ROMBEL' : 'STAF', waktu: hari.getTime(), nama: 'TH.E-Course', peran: 'Admin',
          pesan: 'Versi ' + t.versi + ' tersedia. Buka ' + UPD.ALAMAT + ' di Chrome, unduh, lalu pasang menimpa aplikasi.'
        });
      }
    }
  } catch (e) {}
  return data;
}
