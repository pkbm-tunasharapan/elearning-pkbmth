// ============================================================================
// DASBOR LEMBAGA (aplikasi 1.23): ringkasan sekali lihat untuk Admin, Kepala Sekolah,
// Koordinator Kurikulum, dan Superadmin di beranda aplikasi/web.
// Isi: warga belajar aktif, kehadiran harian hari ini (absensi global), per rombel,
// kelengkapan data (NISN/NIK/biodata), dan jumlah ulang tahun hari ini.
// Hanya membaca; hasil di-cache 2 menit agar ringan.
// ============================================================================
var DSB = { PERAN: ['Admin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Superadmin', 'Dinas Pendidikan'], TTL_DETIK: 120 };

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
  // v1.38.9: statistik TH.E-Course sesi berjalan + kehadiran semester
  try { out.online = dsbOnline_(); } catch (eO) { out.online = { galat: String(eO && eO.message || eO) }; }
  cache.put(ck, JSON.stringify(out), DSB.TTL_DETIK);
  return out;
}

// v1.38.9: absensi & tugas TH.E-Course pada sesi yang sedang berjalan, plus kehadiran TH.E-Course semester ini.
// Satuan: siswa e-learning (sheet Siswa) pada rombel yang punya mapel aktif. "Absensi" = satu siswa x satu mapel.
function dsbOnline_() {
  var cfg = taBaca_(), now = new Date().getTime(), per = nilPeriode_(), smt = per.smt;
  var berjalan = {}, sesi = [];
  for (var n = 1; n <= cfg.sesiPerSemester; n++) {
    if (taInfo_(cfg, smt, n, now).status !== 'berjalan') continue;
    sesi.push('Sesi ' + n);
    if (abSesiWajib_(cfg, smt, n)) berjalan[smt + '|' + n] = true;
  }
  var adaSesi = Object.keys(berjalan).length > 0;
  var mp = brdMapelBm_(), mapelRb = {};
  Object.keys(mp).forEach(function(id) { (mapelRb[mp[id].idRombel] = mapelRb[mp[id].idRombel] || []).push(id); });

  var sudah = {};
  if (adaSesi) abBaca_(null).forEach(function(r) { if (berjalan[r.smt + '|' + r.n]) sudah[r.idMapel + '|' + r.kunciNama] = true; });

  // diskusi aktif pada sesi berjalan, per mapel; jawaban siswa
  var diskusi = {}, dijawab = {};
  if (adaSesi) {
    var vm = getSheetData(CONFIG.SHEETS.MATERI);
    if (vm.length) {
      var hm = vm[0].map(function(x) { return String(x).trim(); });
      var mId = hm.indexOf('ID Materi'), mMp = hm.indexOf('ID Mapel'), mJ = hm.indexOf('Jenis'), mSt = hm.indexOf('Status'), mSs = hm.indexOf('Sesi');
      for (var i = 1; i < vm.length; i++) {
        var r = vm[i], idm = sTeks_(r[mMp]).trim();
        if (!mp[idm] || sTeks_(r[mJ]).trim() !== 'Diskusi' || sTeks_(r[mSt]).trim() !== 'Aktif') continue;
        var ps = taParse_(cfg, r[mSs]);
        if (!ps || !berjalan[ps.smt + '|' + ps.n]) continue;
        (diskusi[idm] = diskusi[idm] || []).push(sTeks_(r[mId]).trim());
      }
    }
    var vj = getSheetData(CONFIG.SHEETS.JAWABAN);
    if (vj.length) {
      var hj = vj[0].map(function(x) { return String(x).trim(); }), jR = hj.indexOf('ID Rombel'), jM = hj.indexOf('ID Materi'), jS = hj.indexOf('Nama Siswa');
      for (var a = 1; a < vj.length; a++) dijawab[sTeks_(vj[a][jM]).trim() + '|' + sTeks_(vj[a][jR]).trim() + '|' + normNama_(vj[a][jS])] = true;
    }
  }

  var on = hdrOnline_(per), siswa = nilSiswaBm_();
  var o = { sesi: sesi.join(', '), adaSesi: adaSesi, wb: 0, sudahAbsenWb: 0, absen: 0, wajibAbsen: 0, tugas: 0, wajibTugas: 0,
    belumWb: 0, belumAbsenWb: 0, belumTugasWb: 0, semHadir: 0, semTotal: 0, rombel: [], belum: [] };
  Object.keys(mapelRb).forEach(function(rb) {
    var ms = mapelRb[rb], g = { nama: mp[ms[0]].rombel, wb: 0, absen: 0, belum: 0 };
    (siswa[rb] || []).forEach(function(s) {
      var nn = normNama_(s.nama), absKu = 0, kurangAbs = 0, kurangTgs = 0;
      o.wb++; g.wb++;
      ms.forEach(function(m) {
        if (adaSesi) {
          o.wajibAbsen++;
          if (sudah[m + '|' + nn]) { o.absen++; absKu++; } else kurangAbs++;
          (diskusi[m] || []).forEach(function(d) { o.wajibTugas++; if (dijawab[d + '|' + rb + '|' + nn]) o.tugas++; else kurangTgs++; });
        }
        if (on.aktif) {
          var x = on.hadir[m + '|' + nn], ks = x ? Object.keys(x) : [];
          o.semHadir += ks.length;
          o.semTotal += on.lewat + ks.filter(function(k) { return !on.wajibLewat[k]; }).length;
        }
      });
      if (!adaSesi) return;
      if (absKu) { o.sudahAbsenWb++; g.absen++; }
      if (kurangAbs) o.belumAbsenWb++;
      if (kurangTgs) o.belumTugasWb++;
      if (kurangAbs || kurangTgs) {
        o.belumWb++; g.belum++;
        o.belum.push({ nama: s.nama, rombel: g.nama, absen: kurangAbs, tugas: kurangTgs, dari: ms.length });
      }
    });
    if (g.wb) o.rombel.push(g);
  });
  o.rombel.sort(function(a, b) { return a.nama.localeCompare(b.nama, 'id', { numeric: true }); });
  o.belum.sort(function(a, b) { return (b.absen + b.tugas) - (a.absen + a.tugas) || a.nama.localeCompare(b.nama); });
  o.belum = o.belum.slice(0, 60);
  o.persenAbsen = o.wajibAbsen ? Math.round(o.absen * 100 / o.wajibAbsen) : null;
  o.persenSemester = o.semTotal ? Math.round(o.semHadir * 100 / o.semTotal) : null;
  return o;
}
