// ============================================================================
// RAPOR SEMESTER LAMPAU & NILAI OTOMATIS (v1.39.2)
// ----------------------------------------------------------------------------
// 1) Rapor semester lampau memakai KELAS PADA SEMESTER ITU, bukan rombel sekarang.
//    Contoh: WB kini di C12 (Ganjil 2026/2027). Cetak Genap 2025/2026 -> rapor C11 Genap + keputusan naik ke kelas 12;
//    cetak Ganjil 2025/2026 -> rapor C11 Ganjil. Kelas akhir (A6, B9, C12) semester Genap -> keputusan LULUS.
//    Rombel pada periode lampau ditentukan berurutan dari:
//      a. baris NILAI WB itu pada periode tsb (kolom ROMBEL),
//      b. tab KENAIKAN KELAS tahun tsb (rombel tempat keputusan dibuat),
//      c. geser tingkat: kelas sekarang dikurangi selisih tahun pelajaran (C12 -> C11 -> C10 -> B9 ...).
//    Keputusan naik/lulus semester Genap lampau: dari KENAIKAN KELAS; bila belum dicatat, disimpulkan dari kelas
//    WB sekarang (kelas lebih tinggi = Naik/Lulus, kelas sama = Tinggal/Tidak Lulus).
// 2) NILAI OTOMATIS (khusus Admin): komponen UTS/UAS yang masih kosong pada semester di luar semester berjalan
//    diisi acak KKM..85 (tidak sama semua). Tugas diskusi yang belum dinilai tutor (sesinya sudah berakhir)
//    juga dapat dinilai otomatis dengan rentang yang sama.
// ============================================================================
var NRW = { MAKS: 85, KET: 'Nilai otomatis (admin)' };

function nilAwalTahun_(tahun) { var m = /(\d{4})/.exec(String(tahun || '')); return m ? Number(m[1]) : 0; }
function nilUrutPer_(per) { return nilAwalTahun_(per.tahun) * 2 + (per.semester === 'Genap' ? 1 : 0); }

// Rentang nilai otomatis: KKM sampai 85 (bila KKM > 85, dipakai KKM saja).
function nilAcak_(at) {
  var lo = Math.ceil(Number(at.kkm) || 0), hi = Math.max(lo, NRW.MAKS);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// Riwayat rombel: info kelas tiap rombel, rombel WB per periode dari NILAI, rombel WB per tahun dari KENAIKAN KELAS.
function nilRiwayatKtx_() {
  var out = { rombel: {}, perKelas: {}, nilai: {}, naik: {} };
  var rb = absBaca_('ROMBEL');
  for (var i = 1; i < rb.v.length; i++) {
    var r = rb.v[i], id = sTeks_(absNilai_(rb, r, 'ID ROMBEL')).trim();
    if (!id) continue;
    var nama = sTeks_(absNilai_(rb, r, 'NAMA ROMBEL')).trim(), u = knkUraiNama_(nama) || {};
    if (!u.paket) { var pg = /PKT-?([ABC])/i.exec(sTeks_(absNilai_(rb, r, 'PROGRAM'))); if (pg) u.paket = pg[1].toUpperCase(); }
    out.rombel[id] = { id: id, nama: nama, paket: u.paket || '', kelas: u.kelas || 0, program: sTeks_(absNilai_(rb, r, 'PROGRAM')).trim() };
    if (u.kelas) {
      (out.perKelas[(u.paket || '') + u.kelas] = out.perKelas[(u.paket || '') + u.kelas] || []).push(id);
      (out.perKelas['*' + u.kelas] = out.perKelas['*' + u.kelas] || []).push(id);
    }
  }
  var tn = absBaca_(NIL.TAB_NILAI, NIL.HDR_NILAI);
  for (var n = 1; n < tn.v.length; n++) {
    var x = tn.v[n];
    var kk = [sTeks_(absNilai_(tn, x, 'WARGA BELAJAR')).trim(), sTeks_(absNilai_(tn, x, 'TAHUN PELAJARAN')).trim(), sTeks_(absNilai_(tn, x, 'SEMESTER')).trim()].join('|');
    var rr = sTeks_(absNilai_(tn, x, 'ROMBEL')).trim();
    if (!rr) continue;
    var o = out.nilai[kk] || (out.nilai[kk] = {});
    o[rr] = (o[rr] || 0) + 1;
  }
  try {
    var t = knkBaca_();
    for (var j = 1; j < t.v.length; j++) {
      var y = t.v[j];
      var kn = sTeks_(absNilai_(t, y, 'ID WB')).trim() + '|' + sTeks_(absNilai_(t, y, 'TAHUN')).trim();
      out.naik[kn] = { idRombel: sTeks_(absNilai_(t, y, 'ID ROMBEL')).trim(), keputusan: sTeks_(absNilai_(t, y, 'KEPUTUSAN')).trim() };
    }
  } catch (e) {}
  return out;
}

// Rombel tempat WB berada pada periode per ('' bila tidak dapat ditentukan).
function nilRombelPeriode_(rk, idWb, idRombelKini, per, kini) {
  if (nilUrutPer_(per) >= nilUrutPer_(kini)) return idRombelKini;
  var hit = rk.nilai[idWb + '|' + per.tahun + '|' + per.semester];
  if (hit) {
    var terbaik = '', jml = -1;
    Object.keys(hit).forEach(function(r) { if (hit[r] > jml) { jml = hit[r]; terbaik = r; } });
    if (terbaik) return terbaik;
  }
  var kn = rk.naik[idWb + '|' + per.tahun];
  if (kn && kn.idRombel) return kn.idRombel;
  var d = nilAwalTahun_(kini.tahun) - nilAwalTahun_(per.tahun);
  if (d <= 0) return idRombelKini;
  var ri = rk.rombel[idRombelKini];
  if (!ri || !ri.kelas) return '';
  var target = ri.kelas - d;
  if (target < 1) return '';
  var calon = rk.perKelas[ri.paket + target] || rk.perKelas['*' + target] || [];
  return calon[0] || '';
}

// Kelas (mapel) sebuah rombel untuk rapor; mapel e-learning nonaktif disaring, tetapi bila hasilnya kosong
// (rombel lama) dipakai daftar lengkap.
function nilKelasRombel_(idRombel, k) {
  var kelas = nilKelasRapor_(idRombel), aktif = nilSaringAktif_(kelas, k.peta);
  return aktif.length ? aktif : kelas;
}

// Hitung leger semester lampau untuk WB rombel sekarang. Dipakai leger/rapor dan nilai otomatis.
function nilHitungLampau_(idRombelKini, per, kini) {
  var rk = nilRiwayatKtx_(), k = nilKtx_(per), wbs = absWbRombel_(idRombelKini), grup = {};
  wbs.forEach(function(w) {
    var h = nilRombelPeriode_(rk, w.id, idRombelKini, per, kini);
    (grup[h] = grup[h] || []).push(w);
  });
  var utama = '', maks = -1;
  Object.keys(grup).forEach(function(g) { if (g && grup[g].length > maks) { maks = grup[g].length; utama = g; } });
  if (!utama) throw new Error('Kelas warga belajar pada Semester ' + per.semester + ' ' + per.tahun + ' tidak dapat ditentukan. Pastikan nama rombel memuat kelas (mis. C11).');
  var kelasPer = {}, rekap = [];
  Object.keys(grup).forEach(function(g) {
    if (!g) return;
    k.wb[g] = grup[g];   // WB rombel sekarang dinilai sebagai anggota rombel periode itu
    kelasPer[g] = nilKelasRombel_(g, k);
    kelasPer[g].forEach(function(kl) { nilRekapKelas_(k, kl).forEach(function(x) { rekap.push({ g: g, kl: kl, x: x }); }); });
  });
  return { rk: rk, k: k, wbs: wbs, grup: grup, utama: utama, kelasPer: kelasPer, rekap: rekap };
}

// Keputusan naik/lulus semester Genap lampau: tercatat, atau disimpulkan dari kelas sekarang.
function nilKeputusanLampau_(h, idRombelKini, per) {
  var info = knkInfoRombel_(h.utama), kini = h.rk.rombel[idRombelKini] || {}, kep = {}, otomatis = {};
  Object.keys(h.grup).forEach(function(g) {
    if (!g) return;
    var rg = h.rk.rombel[g] || {}, akhirG = !!(rg.kelas && rg.paket && KNK.AKHIR[rg.paket] === rg.kelas);
    h.grup[g].forEach(function(w) {
      var cat = h.rk.naik[w.id + '|' + per.tahun];
      if (cat && cat.keputusan && (!cat.idRombel || cat.idRombel === g)) { kep[w.id] = cat.keputusan; return; }
      if (!kini.kelas || !rg.kelas) return;
      var naik = kini.kelas > rg.kelas;
      kep[w.id] = akhirG ? (naik ? 'Lulus' : 'Tidak Lulus') : (naik ? 'Naik' : 'Tinggal');
      otomatis[w.id] = true;
    });
  });
  return { info: info, tahun: per.tahun, keputusan: kep, otomatis: otomatis };
}

// Leger semester lampau (bentuk hasil sama dengan waStafLeger).
function nilLegerLampau_(idRombelKini, per, kini, admin) {
  var h = nilHitungLampau_(idRombelKini, per, kini), k = h.k, baris = {}, kosong = 0, adaOffline = Object.keys(k.hadirOffline || {}).length > 0;
  h.wbs.forEach(function(w) {
    baris[w.id] = { idWb: w.id, nisn: w.nisn, nama: w.nama, nilai: {}, predikat: {}, jumlah: 0, n: 0, belumTuntas: 0,
      kehadiran: k.rekapHadir[w.id] || { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 } };
  });
  h.rekap.forEach(function(z) {
    var b = baris[z.x.idWb], x = z.x;
    if (!b) return;
    if (!x.akhirManual && x.uts.nilai === null) kosong++;
    if (!x.akhirManual && x.uas.nilai === null) kosong++;
    if (x.offline) adaOffline = true;
    b.nilai[z.kl.kodeMapel] = x.akhir; b.predikat[z.kl.kodeMapel] = x.predikat;
    if (x.akhir !== null) { b.jumlah += x.akhir; b.n++; if (!x.tuntas) b.belumTuntas++; }
  });
  var out = Object.keys(baris).map(function(id) { var b = baris[id]; b.rata = b.n ? nilBulat_(b.jumlah / b.n) : null; return b; });
  var urut = out.filter(function(b) { return b.rata !== null; }).sort(function(a, b2) { return b2.jumlah - a.jumlah; });
  urut.forEach(function(b, i) { b.peringkat = i > 0 && urut[i - 1].jumlah === b.jumlah ? urut[i - 1].peringkat : i + 1; });
  out.sort(function(a, b2) { return a.nama.localeCompare(b2.nama); });
  var ru = h.rk.rombel[h.utama], rkini = h.rk.rombel[idRombelKini] || { id: idRombelKini, nama: idRombelKini };
  var kelasU = h.kelasPer[h.utama] || [];
  var hasil = {
    rombel: { id: h.utama, nama: ru.nama, program: (kelasU[0] && kelasU[0].program) || ru.program },
    rombelKini: { id: idRombelKini, nama: rkini.nama },
    lampau: true, periode: per, periodeKini: kini, aturan: k.at, lembaga: nilLembaga_(),
    wali: (function() { var w = nilWaliPeta_()[h.utama] || '', pt = absPetaTutor_(); return { id: w, nama: w && pt[w] ? pt[w].nama : '' }; })(),
    mapel: kelasU.map(function(kl) { return { kode: kl.kodeMapel, nama: kl.namaMapel, tutor: kl.namaTutor }; }), wb: out,
    tanpaKelas: (h.grup[''] || []).map(function(w) { return w.nama; })
  };
  if (admin) hasil.kosong = kosong;
  if (adaOffline) { hasil.offline = true; hasil.catatanOffline = OFL.CATATAN; }
  if (per.semester === 'Genap') hasil.kenaikan = nilKeputusanLampau_(h, idRombelKini, per);
  return hasil;
}

// ---------- endpoint admin: nilai otomatis ----------
// q: {idRombel (rombel sekarang), tahun, semester}; terapkan=false -> hanya menghitung.
function waAdminNilaiOtomatis(token, q, terapkan) {
  var p = wajibAdmin_(token);
  q = q || {};
  var kini = nilPeriode_(), per = nilPeriode_(q);
  if (nilUrutPer_(per) >= nilUrutPer_(kini)) throw new Error('Nilai otomatis hanya untuk semester di luar semester berjalan (' + kini.semester + ' ' + kini.tahun + ').');
  var h = nilHitungLampau_(String(q.idRombel || ''), per, kini), at = h.k.at, isi = [];
  h.rekap.forEach(function(z) {
    [['UTS', z.x.uts], ['UAS', z.x.uas]].forEach(function(c) {
      if (c[1].nilai === null && !z.x.akhirManual) isi.push({ idWb: z.x.idWb, nama: z.x.nama, g: z.g, kl: z.kl, jenis: c[0] });
    });
  });
  var rentang = { dari: Math.ceil(Number(at.kkm) || 0), sampai: Math.max(Math.ceil(Number(at.kkm) || 0), NRW.MAKS) };
  if (terapkan !== true || !isi.length) return { kosong: isi.length, terisi: 0, rentang: rentang, periode: per };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var t = absBaca_(NIL.TAB_NILAI, NIL.HDR_NILAI), ada = {};
    for (var i = 1; i < t.v.length; i++) {
      var x = t.v[i];
      if (sTeks_(absNilai_(t, x, 'TAHUN PELAJARAN')).trim() !== per.tahun || sTeks_(absNilai_(t, x, 'SEMESTER')).trim() !== per.semester) continue;
      ada[[sTeks_(absNilai_(t, x, 'WARGA BELAJAR')).trim(), sTeks_(absNilai_(t, x, 'ROMBEL')).trim(), sTeks_(absNilai_(t, x, 'MAPEL')).trim(), sTeks_(absNilai_(t, x, 'JENIS ASESMEN')).trim()].join('|')] = i + 1;
    }
    var baru = [], hari = absHariIni_(), oleh = p.nama + ' (otomatis)', cN = absCol_(t, 'NILAI'), cK = absCol_(t, 'KETERANGAN'), cO = absCol_(t, 'DICATAT OLEH');
    isi.forEach(function(s) {
      var nilai = String(nilAcak_(at)), kunci = [s.idWb, s.g, s.kl.kodeMapel, s.jenis].join('|');
      if (ada[kunci]) {   // baris ada tetapi nilainya kosong
        t.sh.getRange(ada[kunci], cN + 1).setValue(nilai);
        if (cK >= 0) t.sh.getRange(ada[kunci], cK + 1).setValue(NRW.KET);
        if (cO >= 0) t.sh.getRange(ada[kunci], cO + 1).setValue(oleh);
        return;
      }
      baru.push(absBaris_(t, {
        'ID NILAI': absId_(), 'TANGGAL': hari, 'ROMBEL': s.g, 'MAPEL': s.kl.kodeMapel, 'JENIS ASESMEN': s.jenis, 'WARGA BELAJAR': s.idWb,
        'NILAI': nilai, 'KETERANGAN': NRW.KET, 'TUTOR': s.kl.idTutor || '', 'TAHUN PELAJARAN': per.tahun, 'SEMESTER': per.semester, 'DICATAT OLEH': oleh
      }));
    });
    if (baru.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, baru.length, baru[0].length).setValues(baru);
  } finally { lock.releaseLock(); }
  try { catat_(p.peran, h.utama, p.nama, 'Nilai otomatis rapor', (h.rk.rombel[h.utama] || {}).nama + ' ' + per.semester + ' ' + per.tahun + ': ' + isi.length + ' nilai (acak ' + rentang.dari + '-' + rentang.sampai + ')', 'OK'); } catch (e) {}
  return { kosong: isi.length, terisi: isi.length, rentang: rentang, periode: per };
}

// Tugas diskusi yang belum dinilai tutor dan sesinya sudah berakhir.
function nilTugasBelumDinilai_() {
  var cfg = taBaca_(), now = new Date().getTime(), materi = {}, mp = brdMapelBm_();
  var vm = getSheetData(CONFIG.SHEETS.MATERI);
  if (vm.length) {
    var hm = vm[0].map(function(x) { return String(x).trim(); });
    var mId = hm.indexOf('ID Materi'), mJ = hm.indexOf('Jenis'), mSs = hm.indexOf('Sesi'), mJd = hm.indexOf('Judul');
    for (var i = 1; i < vm.length; i++) {
      if (sTeks_(vm[i][mJ]).trim() !== 'Diskusi') continue;
      var ps = taParse_(cfg, vm[i][mSs]);
      var lewat = !ps || taInfo_(cfg, ps.smt, ps.n, now).status === 'lewat';
      materi[sTeks_(vm[i][mId]).trim()] = { lewat: lewat, judul: sTeks_(vm[i][mJd]) };
    }
  }
  var sh = getSheet(CONFIG.SHEETS.JAWABAN), v = sh.getDataRange().getValues(), out = [];
  if (v.length < 2) return { sh: sh, k: null, baris: out };
  var k = ndKolomJawaban_(v[0]), hd = v[0].map(function(x) { return String(x).trim(); }), iJ = hd.indexOf('Jenis');
  for (var a = 1; a < v.length; a++) {
    var r = v[a], idMt = sTeks_(r[k.materi]).trim(), m = materi[idMt];
    if (!m || !m.lewat) continue;                                   // bukan diskusi / sesi masih berjalan
    if (iJ >= 0 && sTeks_(r[iJ]).trim() !== 'Diskusi') continue;
    if (sTeks_(r[k.nilai]).trim() !== '') continue;                  // sudah dinilai
    if (!sTeks_(r[k.jawaban]).trim()) continue;
    var idMp = sTeks_(r[k.mapel]).trim();
    out.push({ baris: a + 1, idMapel: idMp, mapel: mp[idMp] ? mp[idMp].nama : idMp, rombel: mp[idMp] ? mp[idMp].rombel : '',
      idRombel: k.rombel >= 0 ? sTeks_(r[k.rombel]).trim() : '', idMateri: idMt, judul: m.judul, siswa: sTeks_(r[k.siswa]).trim() });
  }
  return { sh: sh, k: k, baris: out };
}

// terapkan=false -> ringkasan per mapel; true -> nilai acak KKM..85 ditulis (Dinilai Oleh = admin (otomatis)).
function waAdminTugasNilaiOtomatis(token, terapkan) {
  var p = wajibAdmin_(token), at = nilAturan_();
  var rentang = { dari: Math.ceil(Number(at.kkm) || 0), sampai: Math.max(Math.ceil(Number(at.kkm) || 0), NRW.MAKS) };
  if (terapkan !== true) {
    var d0 = nilTugasBelumDinilai_(), per = {};
    d0.baris.forEach(function(b) { var kk = b.mapel + ' · ' + b.rombel; per[kk] = (per[kk] || 0) + 1; });
    return { jumlah: d0.baris.length, rentang: rentang,
      perMapel: Object.keys(per).sort(function(a, b) { return per[b] - per[a]; }).map(function(kk) { return { nama: kk, jumlah: per[kk] }; }) };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var jml = 0;
  try {
    ndPastikanKolom_(getSheet(CONFIG.SHEETS.JAWABAN));
    var d = nilTugasBelumDinilai_(), oleh = p.nama + ' (otomatis)', kabar = [], waktu = new Date();
    d.baris.forEach(function(b) {
      var skor = nilAcak_(at);
      d.sh.getRange(b.baris, d.k.nilai + 1).setValue(skor);
      if (d.k.penilai >= 0) d.sh.getRange(b.baris, d.k.penilai + 1).setValue(oleh);
      if (d.k.waktuNilai >= 0) d.sh.getRange(b.baris, d.k.waktuNilai + 1).setValue(waktu);
      kabar.push({ rombel: b.idRombel, idMapel: b.idMapel, mapel: b.mapel, idMateri: b.idMateri, judul: b.judul, siswa: b.siswa, nilai: skor, oleh: oleh });
      jml++;
    });
    nvTulis_('NILAI', kabar);
    kcpTanda_('jwb');
  } finally { lock.releaseLock(); }
  try { catat_(p.peran, '', p.nama, 'Nilai otomatis tugas', jml + ' jawaban diskusi (acak ' + rentang.dari + '-' + rentang.sampai + ')', 'OK'); } catch (e) {}
  try { CacheService.getScriptCache().remove('brd_' + p.id); } catch (e2) {}
  return { jumlah: jml, terisi: jml, rentang: rentang };
}
