// ============================================================================
// PERFORMA SERVER (aplikasi 1.35.1)
// 1) Pencatat lama proses tiap fungsi API (dipanggil dari doPost). Hasil dilihat dengan laporanPerforma()
//    (Run dari editor, hasil di Log eksekusi) atau waAdminPerforma (Admin). Panggilan cepat dicatat
//    sebagian (1 dari 4, dihitung ulang), panggilan lambat (>= 1,5 detik) selalu dicatat.
// 2) Cache data yang dibaca di hampir setiap permintaan:
//    - daftar pengguna (pemeriksaan sesi stafDariToken_) selama 2 menit;
//    - pengaturan absensi dari spreadsheet SIM (absSim_) selama 5 menit.
//    Cache dihapus otomatis setiap ada fungsi Admin/simpan/ubah yang berhasil, sehingga perubahan
//    pengaturan atau pengguna langsung berlaku.
// ============================================================================
var PERF = {
  AKTIF: true,
  LAMBAT_MS: 1500,
  SAMPEL: 4,
  CACHE_PENGGUNA: 'pengguna_v1',
  CACHE_SIM: 'abs_sim_v1',
  POLA_UBAH: /^waAdmin|Simpan|Hapus|Atur|Ubah|Nonaktif|Pengguna|Sandi|Tambah|Impor/
};
var PERF_MEMO_ = { pengguna: null, sim: null };

function perfTanggal_() { return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd'); }

// Dipanggil doPost setelah fungsi selesai.
function perfSetelah_(fn, ms, ok) {
  fn = String(fn || '(tanpa fn)');
  try { if (typeof kuCatat_ === 'function') kuCatat_(fn, ms, ok); } catch (eKu) {}   // v1.58.0: kinerja fungsi ujian per jam
  try {
    if (ok && PERF.POLA_UBAH.test(fn)) perfHapusCache_();
  } catch (e) {}
  if (!PERF.AKTIF || fn === 'waStafHangatkan') return;
  try {
    var bobot = 1;
    if (ms < PERF.LAMBAT_MS) {
      if (Math.random() * PERF.SAMPEL >= 1) return;
      bobot = PERF.SAMPEL;
    }
    var c = CacheService.getScriptCache(), k = 'perf|' + perfTanggal_();
    var d = {};
    try { d = JSON.parse(c.get(k) || '{}'); } catch (e1) {}
    var x = d[fn] || [0, 0, 0, 0, 0];
    x[0] += bobot;             // jumlah panggilan (perkiraan)
    x[1] += ms * bobot;        // total ms (perkiraan)
    if (ms > x[2]) x[2] = ms;  // terlama
    if (!ok) x[3] += bobot;    // galat
    if (ms >= PERF.LAMBAT_MS) x[4] += 1; // lambat (pasti)
    d[fn] = x;
    var s = JSON.stringify(d);
    if (s.length < 90000) c.put(k, s, 21600);
  } catch (e2) {}
}

function perfHapusCache_() {
  PERF_MEMO_.pengguna = null;
  PERF_MEMO_.sim = null;
  if (typeof ABS_MEMO_ !== 'undefined') ABS_MEMO_.sim = null;
  CacheService.getScriptCache().removeAll([PERF.CACHE_PENGGUNA, PERF.CACHE_SIM]);
}

function perfRingkas_() {
  var d = {};
  try { d = JSON.parse(CacheService.getScriptCache().get('perf|' + perfTanggal_()) || '{}'); } catch (e) {}
  var baris = Object.keys(d).map(function(fn) {
    var x = d[fn];
    return { fn: fn, panggilan: x[0], rataMs: x[0] ? Math.round(x[1] / x[0]) : 0, terlamaMs: x[2], galat: x[3], lambat: x[4], bebanMs: x[1] };
  });
  baris.sort(function(a, b) { return b.bebanMs - a.bebanMs; });
  return { tanggal: perfTanggal_(), fungsi: baris };
}

// Run dari editor: daftar fungsi dengan beban server terbesar hari ini.
function laporanPerforma() {
  var r = perfRingkas_();
  Logger.log('Performa ' + r.tanggal + ' (beban = jumlah panggilan x rata-rata):');
  r.fungsi.slice(0, 30).forEach(function(x) {
    Logger.log(x.fn + ' | ' + x.panggilan + ' panggilan | rata ' + x.rataMs + ' ms | terlama ' + x.terlamaMs + ' ms | lambat ' + x.lambat + ' | galat ' + x.galat);
  });
  return r;
}

function waAdminPerforma(token) {
  wajibAdmin_(token);
  return perfRingkas_();
}

// ---------- cache daftar pengguna (dipakai stafDariToken_ di setiap permintaan) ----------
function penggunaCache_() {
  if (PERF_MEMO_.pengguna) return PERF_MEMO_.pengguna;
  var c = CacheService.getScriptCache(), s = null;
  try { s = c.get(PERF.CACHE_PENGGUNA); } catch (e) {}
  if (s) {
    try { PERF_MEMO_.pengguna = JSON.parse(s); return PERF_MEMO_.pengguna; } catch (e1) {}
  }
  var d = bacaPengguna_();
  try {
    var j = JSON.stringify(d);
    if (j.length < 90000) c.put(PERF.CACHE_PENGGUNA, j, 120);
  } catch (e2) {}
  PERF_MEMO_.pengguna = d;
  return d;
}

// ---------- cache pengaturan absensi dari spreadsheet SIM ----------
function absSimCache_() {
  if (PERF_MEMO_.sim) return PERF_MEMO_.sim;
  var c = CacheService.getScriptCache(), s = null;
  try { s = c.get(PERF.CACHE_SIM); } catch (e) {}
  if (s) {
    try { PERF_MEMO_.sim = JSON.parse(s); return PERF_MEMO_.sim; } catch (e1) {}
  }
  var o = absSimBaca_();
  try { c.put(PERF.CACHE_SIM, JSON.stringify(o), 300); } catch (e2) {}
  PERF_MEMO_.sim = o;
  return o;
}
