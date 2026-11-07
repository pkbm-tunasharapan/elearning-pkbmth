// ============================================================================
// DASBOR LEMBAGA (aplikasi 1.23): ringkasan sekali lihat untuk Admin, Kepala Sekolah,
// Koordinator Kurikulum, dan Superadmin di beranda aplikasi/web.
// Isi: warga belajar aktif, kehadiran harian hari ini (absensi global), per rombel,
// kelengkapan data (NISN/NIK/biodata), dan jumlah ulang tahun hari ini.
// Hanya membaca; hasil di-cache 2 menit agar ringan.
// ============================================================================
var DSB = { PERAN: ['Admin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Superadmin'], TTL_DETIK: 120 };

function waStafDasbor(token, paksa) {
  var p = stafDariToken_(token);
  if (DSB.PERAN.indexOf(p.peran) < 0) throw new Error('Dasbor lembaga hanya untuk Admin dan pimpinan.');
  var hari = absHariIni_();
  var cache = CacheService.getScriptCache(), ck = 'dsb|' + hari;
  if (paksa !== true) {
    var s = cache.get(ck);
    if (s) { try { return JSON.parse(s); } catch (e) {} }
  }
  var rb = ahPetaRombel_(), perRb = {};
  Object.keys(rb).forEach(function(id) { if (rb[id].aktif) perRb[id] = { id: id, nama: rb[id].nama, aktif: 0, hadir: 0, absen: 0 }; });

  var bio = {};
  try {
    var tb = bioBaca_();
    for (var b = 1; b < tb.v.length; b++) { var idB = sTeks_(absNilai_(tb, tb.v[b], 'ID WB')).trim(); if (idB) bio[idB] = true; }
  } catch (eB) {}

  var w = absBaca_('WARGA BELAJAR'), aktif = {}, n = 0, tanpaNisn = 0, tanpaNik = 0, tanpaBio = 0, tanpaRombel = 0;
  for (var i = 1; i < w.v.length; i++) {
    var r = w.v[i];
    var st = sTeks_(absNilai_(w, r, 'STATUS')).trim();
    if (st && st !== 'Aktif') continue;
    var id = sTeks_(absNilai_(w, r, 'ID WB')).trim();
    if (!id || !sTeks_(absNilai_(w, r, 'NAMA WB')).trim()) continue;
    var idRb = sTeks_(absNilai_(w, r, 'ROMBEL')).trim();
    aktif[id] = idRb;
    n++;
    if (!sTeks_(absNilai_(w, r, 'NISN')).replace(/\D/g, '')) tanpaNisn++;
    if (!sTeks_(absNilai_(w, r, 'NIK')).replace(/\D/g, '')) tanpaNik++;
    if (!bio[id]) tanpaBio++;
    if (!idRb || !perRb[idRb]) tanpaRombel++;
    if (perRb[idRb]) perRb[idRb].aktif++;
  }

  var hit = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 }, pulang = 0;
  var t = ahBaca_();
  for (var j = 1; j < t.v.length; j++) {
    var x = t.v[j];
    if (absTgl_(absNilai_(t, x, 'TANGGAL')) !== hari) continue;
    var idW = sTeks_(absNilai_(t, x, 'WARGA BELAJAR')).trim();
    if (aktif[idW] === undefined) continue;
    var stat = sTeks_(absNilai_(t, x, 'STATUS')).trim();
    if (hit[stat] === undefined) continue;
    hit[stat]++;
    if (stat === 'Hadir' && absJam_(absNilai_(t, x, 'JAM PULANG'))) pulang++;
    var g = perRb[aktif[idW]];
    if (g) { if (stat === 'Hadir') g.hadir++; else g.absen++; }
  }

  var ultah = 0;
  try { ultah = ultDaftar_().length; } catch (eU) {}

  var daftarRb = Object.keys(perRb).map(function(k) { return perRb[k]; }).filter(function(g) { return g.aktif > 0; })
    .sort(function(a, b2) { return a.nama.localeCompare(b2.nama, 'id', { numeric: true }); });
  var tercatat = hit.Hadir + hit.Izin + hit.Sakit + hit.Alpa;
  var out = {
    tanggal: hari, dibuat: absJamKini_().slice(0, 5),
    wbAktif: n, rombelAktif: daftarRb.length,
    hadir: hit.Hadir, pulang: pulang, izin: hit.Izin, sakit: hit.Sakit, alpa: hit.Alpa, belum: Math.max(0, n - tercatat),
    persenHadir: n ? Math.round(hit.Hadir * 100 / n) : 0,
    data: { tanpaNisn: tanpaNisn, tanpaNik: tanpaNik, tanpaBiodata: tanpaBio, tanpaRombel: tanpaRombel },
    ulangTahun: ultah,
    rombel: daftarRb
  };
  cache.put(ck, JSON.stringify(out), DSB.TTL_DETIK);
  return out;
}
