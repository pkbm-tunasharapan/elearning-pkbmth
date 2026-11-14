// ============================================================================
// PENGAWAS UJIAN (v1.53.0, Ujian Tahap 2)
// - Penugasan pengawas per rombel (dan ruang) untuk satu Masa Ujian; bisa diganti per slot.
// - Token ujian per slot: siswa wajib memasukkan token yang diumumkan pengawas saat MULAI (melanjutkan tidak perlu).
// - Pantauan langsung: hadir / mengerjakan / selesai / terkunci / terputus, jumlah pelanggaran, sisa waktu.
// - Tindakan pengawas tercatat dengan alasan: buka kunci, tambah waktu per siswa, ganti token.
// - Detak (heartbeat) siswa tiap ±60 detik lewat CacheService (tanpa menulis sheet): status terputus & tambahan waktu.
// - Berita Acara: pelanggaran terekam otomatis (jam, mapel, nama siswa), keterangan pengawas (wajib),
//   tanda tangan digital di layar ponsel. Disimpan di tab BERITA ACARA UJIAN.
// Tab: PENGAWAS UJIAN, TAMBAH WAKTU UJIAN, PELANGGARAN UJIAN, BERITA ACARA UJIAN.
// ============================================================================
var PW = {
  TAB: 'PENGAWAS UJIAN',
  HDR: ['ID', 'MASA', 'SLOT', 'ROMBEL', 'RUANG', 'ID PENGAWAS', 'NAMA PENGAWAS', 'DIUBAH OLEH', 'DIUBAH PADA'],
  TAB_TW: 'TAMBAH WAKTU UJIAN',
  HDR_TW: ['WAKTU', 'ID UJIAN', 'ID ROMBEL', 'NAMA SISWA', 'MENIT', 'ALASAN', 'OLEH'],
  TAB_LG: 'PELANGGARAN UJIAN',
  HDR_LG: ['WAKTU', 'ID UJIAN', 'ID ROMBEL', 'NAMA SISWA', 'JENIS', 'DETAIL', 'OLEH'],
  TAB_BA: 'BERITA ACARA UJIAN',
  HDR_BA: ['ID', 'MASA', 'SLOT', 'ROMBEL', 'ID PENGAWAS', 'NAMA PENGAWAS', 'WAKTU', 'TERDAFTAR', 'HADIR', 'TIDAK HADIR', 'PELANGGARAN', 'KETERANGAN', 'TTD'],
  DETAK_DETIK: 60, PUTUS_MENIT: 3, MAKS_TAMBAH: 60, MAKS_TTD: 45000,
  PERAN_PENGAWAS_TOLAK: ['Dinas Pendidikan']
};

function pwTab_(nama, hdr) { return muTab_(nama, hdr); }
function pwBaca_(nama, hdr) { return muBaca_(nama, hdr); }
function pwWaktu_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
// appendRow menafsirkan teks seperti ketikan pengguna: awalan ' menjaga waktu & nama tetap teks (jam tidak hilang).
function pwTeks_(v) { return "'" + String(v === undefined || v === null ? '' : v); }
function pwKunciSiswa_(idUjian, idRombel, nama) { return String(idUjian) + '|' + String(idRombel) + '|' + ujNormNama_(nama); }

// ---------- tambahan waktu (dibaca di jalur ujian siswa, disimpan sementara di cache) ----------
var PW_TW_ = null;
function pwTwPeta_() {
  if (PW_TW_) return PW_TW_;
  var c = CacheService.getScriptCache(), s = c.get('pw_tw');
  if (s) { try { return (PW_TW_ = JSON.parse(s)); } catch (e) {} }
  var o = {};
  try {
    pwBaca_(PW.TAB_TW, PW.HDR_TW).forEach(function(r) {
      var k = pwKunciSiswa_(r['ID UJIAN'], r['ID ROMBEL'], r['NAMA SISWA']);
      o[k] = (o[k] || 0) + (parseInt(r['MENIT'], 10) || 0);
    });
  } catch (e2) {}
  try { c.put('pw_tw', JSON.stringify(o), 600); } catch (e3) {}
  return (PW_TW_ = o);
}
function pwTambah_(idUjian, idRombel, nama) {
  try { return pwTwPeta_()[pwKunciSiswa_(idUjian, idRombel, nama)] || 0; } catch (e) { return 0; }
}

// ---------- catatan pelanggaran / tindakan ----------
function pwCatat_(idUjian, idRombel, nama, jenis, detail, oleh) {
  pwTab_(PW.TAB_LG, PW.HDR_LG).appendRow([pwTeks_(pwWaktu_()), pwTeks_(idUjian), pwTeks_(idRombel), pwTeks_(nama), pwTeks_(jenis), pwTeks_(String(detail || '').slice(0, 300)), pwTeks_(oleh || 'Sistem')]);
}

// ---------- token slot ----------
function pwSlotCari_(idSlot) {
  return pwBaca_(MU.TAB_SLOT, MU.HDR_SLOT).map(muSlotObj_).filter(function(s) { return s.id === String(idSlot); })[0] || null;
}
function pwCekToken_(j, idRombel, nama, tokenUjian) {
  if (!j || !j.slot) return '';
  var s = pwSlotCari_(j.slot);
  if (!s || !s.token) return '';
  var t = String(tokenUjian || '').trim().toUpperCase();
  if (!t) return 'Masukkan token ujian yang diumumkan pengawas. Bila kolom token belum muncul, perbarui aplikasi.';
  if (t !== String(s.token).toUpperCase()) {
    try { pwCatat_(j.idUjian, idRombel, nama, 'Token salah', 'Token yang dimasukkan: ' + t.slice(0, 10)); } catch (e) {}
    return 'Token ujian salah. Minta token dari pengawas ruang Anda.';
  }
  return '';
}

// ---------- detak siswa ----------
var PW_KAV_ = {};
function waUjianDetak(idUjian, idRombel, nama, kodeAkses, perangkat) {
  var c = CacheService.getScriptCache(), kk = 'pw_ka_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, idRombel + '|' + nama + '|' + kodeAkses));
  if (!c.get(kk)) {
    if (!cekKodeAksesSiswa_(idRombel, nama, kodeAkses)) return { sukses: false };
    c.put(kk, '1', 1800);
  }
  // v1.54.0: perangkat lain -> aplikasi menutup layar ujian
  var u = pwUraiPerangkat_(perangkat);
  if (u.id) {
    var pd = pwPerangkatCari_(pwKunciSiswa_(idUjian, idRombel, nama));
    if (pd && pd.sidik !== u.sidik) return { sukses: true, perangkatLain: true, pesan: 'Ujian ini terdaftar di perangkat lain (' + pd.model + ').' };
  }
  var kd = 'pw_d_' + pwKunciSiswa_(idUjian, idRombel, nama), sbl = Number(c.get(kd)) || 0, kini = Date.now();
  if (sbl && kini - sbl > PW.PUTUS_MENIT * 60000) {   // v1.58.0: catat koneksi terputus (untuk Laporan Kesiapan)
    try { pwCatat_(idUjian, idRombel, nama, 'Koneksi terputus', 'Tidak tersambung ' + Math.round((kini - sbl) / 60000) + ' menit', 'Jaringan'); } catch (eP) {}
  }
  c.put(kd, String(kini), 900);
  return { sukses: true, tambahMenit: pwTambah_(idUjian, idRombel, nama), detik: PW.DETAK_DETIK };
}

// ---------- penugasan ----------
function pwStaf_() {
  return bacaPengguna_().filter(function(u) { return u.status === 'Aktif' && u.peran && PW.PERAN_PENGAWAS_TOLAK.indexOf(u.peran) < 0; })
    .map(function(u) { return { id: u.id, nama: u.nama, peran: u.peranKustom || u.peran }; })
    .sort(function(a, b) { return a.nama.localeCompare(b.nama); });
}
function pwTugasMasa_(idMasa) { return pwBaca_(PW.TAB, PW.HDR).filter(function(r) { return r['MASA'] === String(idMasa); }); }
// Pengawas efektif untuk slot x rombel SIM: baris khusus slot menimpa baris "semua slot" (*).
function pwEfektif_(tugas, idSlot, idRombelSim) {
  var khusus = null, umum = null;
  tugas.forEach(function(r) {
    if (r['ROMBEL'] !== String(idRombelSim)) return;
    if (r['SLOT'] === String(idSlot)) khusus = r;
    else if (r['SLOT'] === '*') umum = r;
  });
  var r = khusus || umum;
  if (!r) return null;
  return { idPengawas: r['ID PENGAWAS'], namaPengawas: r['NAMA PENGAWAS'], ruang: r['RUANG'] || (umum ? umum['RUANG'] : '') || '' };
}
// Rombel SIM peserta yang punya mapel di tiap slot.
function pwRombelSlot_(m, slot, kelas) {
  var out = {};
  slot.forEach(function(s) {
    out[s.id] = {};
    kelas.forEach(function(k) {
      if (k.kode !== s.kode || !muSlotKena_(s, k.idRombelSim)) return;
      // v1.63.0: masa "pisah ruang per unit" -> satu ruang per rombel x unit (kunci "rombel~unit", "~-" = belum berlabel)
      (pwRuangRombel_(m, k.idRombelSim)).forEach(function(kr) { (out[s.id][kr] = out[s.id][kr] || []).push(k); });
    });
  });
  return out;
}

function waStafMasaPengawas(token, idMasa) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var m = muCari_(idMasa), slot = muSlot_(m.id).sort(function(a, b) { return (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam); });
  var kelas = muKelas_(m), rb = honProgramRombel_(), per = pwRombelSlot_(m, slot, kelas), rombel = {};
  slot.forEach(function(s) { Object.keys(per[s.id]).forEach(function(r) { (rombel[r] = rombel[r] || []).push(s.id); }); });
  return {
    masa: m,
    slot: slot.map(function(s) { return { id: s.id, tanggal: s.tanggal, jam: s.jam, durasi: s.durasi, namaMapel: s.namaMapel }; }),
    rombel: Object.keys(rombel).map(function(r) { return { id: r, nama: pwNamaRuang_(r, rb), slot: rombel[r] }; }).sort(function(a, b) { return a.nama.localeCompare(b.nama); }),
    tugas: pwTugasMasa_(m.id).map(function(r) { return { slot: r['SLOT'], rombel: r['ROMBEL'], ruang: r['RUANG'], idPengawas: r['ID PENGAWAS'], namaPengawas: r['NAMA PENGAWAS'] }; }),
    staf: pwStaf_()
  };
}
// tugas: [{slot:'*'|idSlot, rombel, ruang, idPengawas}] - mengganti seluruh penugasan masa ini.
function waStafMasaPengawasSimpan(token, idMasa, tugas) {
  var p = stafDariToken_(token);
  muWajib_(p);
  return { sukses: true, jumlah: pwTugasTulis_(p, muCari_(idMasa), tugas) };
}
// v1.82.1: inti simpan penugasan pengawas (dipakai layar pengawas & impor templat slot). Hasil: jumlah baris.
function pwTugasTulis_(p, m, tugas) {
  var staf = {}, baris = [], unik = {};
  pwStaf_().forEach(function(u) { staf[u.id] = u; });
  (Array.isArray(tugas) ? tugas : []).forEach(function(t) {
    var slot = String(t.slot || '*'), rombel = String(t.rombel || '').trim(), idP = String(t.idPengawas || '').trim(), ruang = String(t.ruang || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!rombel || (!idP && !ruang)) return;
    if (idP && !staf[idP]) throw new Error('Pengawas tidak ditemukan atau tidak aktif.');
    var k = slot + '|' + rombel;
    if (unik[k]) return;
    unik[k] = true;
    baris.push(['PW-' + absId_().toUpperCase(), m.id, slot, rombel, ruang, idP, idP ? staf[idP].nama : '', p.nama, ujNow_()]);
  });
  var kunci = kmKunciUnik_();
  kunci.waitLock(30000);
  try {
    var sh = pwTab_(PW.TAB, PW.HDR);
    pwTugasMasa_(m.id).map(function(r) { return r._baris; }).sort(function(a, b) { return b - a; }).forEach(function(b) { sh.deleteRow(b); });
    if (baris.length) sh.getRange(sh.getLastRow() + 1, 1, baris.length, PW.HDR.length).setNumberFormat('@').setValues(baris);
  } finally { kunci.releaseLock(); }
  catat_(p.peran, '', p.nama, 'Atur pengawas ujian', m.id + ' ' + m.nama + ': ' + baris.length + ' penugasan', 'OK');
  return baris.length;
}

// Daftar tugas pengawas: pengguna ini (atau semua bila pengelola) untuk masa yang ditetapkan dan belum lewat 2 hari.
function waStafPengawasTugas(token) {
  var p = stafDariToken_(token);
  var kelola = ujtKelola_(p), batas = ujtTambahHari_(absHariIni_(), -2), rb = honProgramRombel_(), out = [];
  var ba = {};
  pwBaca_(PW.TAB_BA, PW.HDR_BA).forEach(function(r) { ba[r['SLOT'] + '|' + r['ROMBEL']] = r['WAKTU']; });
  muSemua_().filter(function(m) { return m.status === 'Ditetapkan' && m.sampai >= batas; }).forEach(function(m) {
    var slot = muSlot_(m.id), kelas = muKelas_(m), per = pwRombelSlot_(m, slot, kelas), tugas = pwTugasMasa_(m.id);
    slot.forEach(function(s) {
      if (s.tanggal < batas) return;
      Object.keys(per[s.id]).forEach(function(r) {
        var ef = pwEfektif_(tugas, s.id, r);
        var milik = !!(ef && ef.idPengawas === p.id);
        if (!milik && !kelola) return;
        var mulai = ujMs_(s.tanggal, s.jam);
        out.push({ masa: m.id, namaMasa: m.nama, jenis: m.jenis, slot: s.id, tanggal: s.tanggal, jam: s.jam, durasi: s.durasi, mapel: s.namaMapel,
          rombel: r, namaRombel: pwNamaRuang_(r, rb), ruang: ef ? ef.ruang : '', offline: muModeSlot_(m, s) === 'Offline', pengawas: ef ? ef.namaPengawas : '', milik: milik,
          mulaiMs: mulai, akhirMs: mulai + s.durasi * 60000, beritaAcara: ba[s.id + '|' + r] || '' });
      });
    });
  });
  out.sort(function(a, b) { return (a.tanggal + a.jam + a.namaRombel).localeCompare(b.tanggal + b.jam + b.namaRombel); });
  return { tugas: out, kelola: kelola, sekarangMs: Date.now() };
}

// Konteks satu ruang (slot x rombel SIM) + pemeriksaan hak.
function pwKonteks_(p, idSlot, idRombelSim) {
  var s = pwSlotCari_(idSlot);
  if (!s) throw new Error('Slot ujian tidak ditemukan.');
  var m = muCari_(s.masa);
  if (m.status !== 'Ditetapkan') throw new Error('Masa ujian ini belum ditetapkan.');
  var ef = pwEfektif_(pwTugasMasa_(m.id), s.id, idRombelSim);
  var milik = !!(ef && ef.idPengawas === p.id);
  if (!milik && !ujtKelola_(p)) throw new Error('Anda bukan pengawas ruang ini.');
  var kr = pwUraiRuang_(idRombelSim);
  var kelas = muKelas_(m).filter(function(k) { return k.kode === s.kode && k.idRombelSim === kr.rombel; });
  var idx = {};
  kelas.forEach(function(k) { idx[k.idMapel] = k; });
  var jad = ujJadwalSemua_().filter(function(j) { return j.slot === s.id && idx[String(j.idMapel)]; });
  var rb = honProgramRombel_();
  return { p: p, s: s, m: m, ef: ef, milik: milik, kelas: kelas, jadwal: jad, namaRombel: pwNamaRuang_(String(idRombelSim), rb), idRombelSim: kr.rombel,
    kunciRuang: String(idRombelSim), unit: kr.unit };
}
// Peserta: siswa e-Learning tiap rombel jadwal; mode "siswa tertentu" disaring dengan nama WB terpilih.
function pwPeserta_(cx) {
  var bm = nilSiswaBm_(), pilih = null;
  if (cx.m.peserta.mode === 'siswa') {
    pilih = {};
    var ids = {};
    cx.m.peserta.siswa.forEach(function(x) { ids[x] = true; });
    keuWbSemua_().forEach(function(w) { if (ids[w.id]) pilih[normNama_(w.nama)] = true; });
  }
  var out = [];
  cx.jadwal.forEach(function(j) {
    var k = cx.kelas.filter(function(x) { return x.idMapel === String(j.idMapel); })[0];
    (bm[k.idRombel] || []).forEach(function(sw) {
      if (pilih && !pilih[normNama_(sw.nama)]) return;
      if (cx.unit && !pwSiswaUnitCocok_(k.idRombel, sw.nama, cx.unit)) return;   // v1.63.0
      out.push({ nama: sw.nama, nisn: sw.nisn, idRombel: k.idRombel, idUjian: String(j.idUjian), j: j });
    });
  });
  out.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  return out;
}
function pwIndeksSesi_() {
  var v = getSheetData(CONFIG.SHEETS.PERCOBAAN_UJIAN), c = sesiCols_(), o = {};
  for (var i = 1; i < v.length; i++) o[pwKunciSiswa_(v[i][c.idUjian - 1], v[i][c.idRombel - 1], v[i][c.nama - 1])] = { row: v[i], c: c, baris: i + 1 };
  return o;
}
function pwLog_(idUjianSet) {
  return pwBaca_(PW.TAB_LG, PW.HDR_LG).filter(function(r) { return idUjianSet[r['ID UJIAN']]; });
}
function pwMs_(v) { return v instanceof Date ? v.getTime() : ujMsTeks_(v); }
function pwJam_(ms) { return ms ? Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'HH:mm') : ''; }

// v1.56.0: siswa ruang ini yang kehadirannya di bawah syarat dan belum disetujui KS (disimpan 5 menit).
function pwKurangHadir_(cx) {
  var c = CacheService.getScriptCache(), k = 'pw_kh_' + cx.s.id + '_' + cx.kunciRuang, s = c.get(k);
  if (s) { try { return JSON.parse(s); } catch (e) {} }
  var o = {};
  try {
    muKurangHadir_(cx.m).daftar.forEach(function(x) {
      if (x.idRombelSim === cx.idRombelSim && x.kode === cx.s.kode && !x.dispensasi) o[normNama_(x.nama)] = { persen: x.persen, syarat: nilAturan_().syaratHadir };
    });
  } catch (e2) {}
  try { c.put(k, JSON.stringify(o), 300); } catch (e3) {}
  return o;
}
function pwSekolah_() {
  var kep = { nama: 'PKBM Tunas Harapan' };
  try { var ids = getIdentitasSekolah_() || {}; kep = { nama: ids.namaSatuan || kep.nama, alamat: ids.alamat || '', kota: ids.kotaTtd || '', kepala: ids.namaKepala || '' }; } catch (e) {}
  return kep;
}
function pwRuang_(cx) {
  var now = Date.now(), peserta = pwPeserta_(cx), sesi = pwIndeksSesi_(), ids = {};
  cx.jadwal.forEach(function(j) { ids[String(j.idUjian)] = true; });
  var log = pwLog_(ids), lg = {};
  log.forEach(function(r) {
    var k = pwKunciSiswa_(r['ID UJIAN'], r['ID ROMBEL'], r['NAMA SISWA']);
    (lg[k] = lg[k] || []).push({ waktu: r['WAKTU'], jenis: r['JENIS'], detail: r['DETAIL'], oleh: r['OLEH'] });
  });
  var model = pwModelTerdaftar_(), sk = pwSanksi_(), kh = pwKurangHadir_(cx);
  var kunciDetak = peserta.map(function(x) { return 'pw_d_' + pwKunciSiswa_(x.idUjian, x.idRombel, x.nama); });
  var detak = {};
  try { for (var i = 0; i < kunciDetak.length; i += 100) { var g = CacheService.getScriptCache().getAll(kunciDetak.slice(i, i + 100)); Object.keys(g).forEach(function(k) { detak[k] = Number(g[k]); }); } } catch (e) {}
  var siswa = peserta.map(function(x) {
    var k = pwKunciSiswa_(x.idUjian, x.idRombel, x.nama), se = sesi[k], tw = pwTambah_(x.idUjian, x.idRombel, x.nama);
    var st = se ? String(se.row[se.c.status - 1]) : '', terkunci = !!(se && se.row[se.c.terkunci - 1] === true);
    var mulai = se ? pwMs_(se.row[se.c.waktuMulai - 1]) : 0, selesai = se ? pwMs_(se.row[se.c.waktuSelesai - 1]) : 0;
    var dt = detak['pw_d_' + k] || 0, akhir = mulai ? mulai + (x.j.durasi + tw) * 60000 : 0;
    var status = !se || !st || st === 'Menunggu' ? 'Belum hadir' : (terkunci ? 'Terkunci' : (st === 'Selesai' ? 'Selesai' : 'Mengerjakan'));
    if (status === 'Mengerjakan' && akhir && now > akhir + UJ.GRACE_MENIT * 60000) status = 'Waktu habis';
    if (status === 'Mengerjakan' && (dt ? now - dt > PW.PUTUS_MENIT * 60000 : now - mulai > PW.PUTUS_MENIT * 60000)) status = 'Terputus';
    var pel = (lg[k] || []).filter(function(l) { return l.oleh === 'Sistem'; });
    var rs = pwRingkasSanksi_(lg[k] || []), akhirPel = pel.length ? ujMsTeks_(pel[pel.length - 1].waktu) : 0;
    return { nama: x.nama, nisn: x.nisn, idRombel: x.idRombel, idUjian: x.idUjian, status: status, terkunci: terkunci,
      percobaan: se ? Number(se.row[se.c.percobaan - 1]) || 0 : 0, pelanggaran: pel.length, mulai: pwJam_(mulai), selesai: st === 'Selesai' ? pwJam_(selesai) : '',
      sisaMenit: status === 'Mengerjakan' || status === 'Terputus' ? Math.max(0, Math.ceil((akhir - now) / 60000)) : null, tambahMenit: tw,
      detak: dt ? pwJam_(dt) : '', perangkat: model[k] || '', log: lg[k] || [],
      kurangHadir: kh[normNama_(x.nama)] || null,
      kunciKe: rs.kunci, berat: rs.berat, minta: rs.minta, perluPimpinan: cx.m.jenis !== 'TRYOUT' && rs.kunci >= sk.pimpinanMulai,
      pelanggaranTerakhirMs: isNaN(akhirPel) ? 0 : akhirPel, pelanggaranTerakhir: pel.length ? pel[pel.length - 1].jenis : '' };
  });
  var hitung = {};
  siswa.forEach(function(x) { hitung[x.status] = (hitung[x.status] || 0) + 1; });
  var j0 = cx.jadwal[0];
  return {
    slot: { id: cx.s.id, tanggal: cx.s.tanggal, jam: cx.s.jam, durasi: cx.s.durasi, mapel: cx.s.namaMapel, token: cx.s.token,
      mulaiMs: j0 ? j0.mulaiMs : ujMs_(cx.s.tanggal, cx.s.jam), masukSampaiMs: j0 ? j0.masukSampaiMs : 0, akhirMs: j0 ? j0.akhirMs : 0 },
    masa: { id: cx.m.id, nama: cx.m.nama, jenis: cx.m.jenis, smt: cx.m.smt }, rombel: cx.kunciRuang, namaRombel: cx.namaRombel,
    offline: cx.jadwal.some(function(j) { return j.mode === 'Kertas'; }),
    ruang: cx.ef ? cx.ef.ruang : '', pengawas: cx.ef ? cx.ef.namaPengawas : '', idPengawas: cx.ef ? cx.ef.idPengawas : '', milik: cx.milik,
    siswa: siswa, ringkas: hitung, sekarangMs: now, jumlahJadwal: cx.jadwal.length, log: log, sekolah: pwSekolah_(),
    sanksi: sk, pimpinan: PW.PIMPINAN.indexOf(cx.p.peran) >= 0, tryout: cx.m.jenis === 'TRYOUT'
  };
}

function waStafPengawasPantau(token, idSlot, idRombelSim) {
  var p = stafDariToken_(token);
  var r = pwRuang_(pwKonteks_(p, idSlot, idRombelSim));
  delete r.log;   // riwayat per siswa sudah ada di siswa[].log
  return r;
}
function waStafPengawasToken(token, idSlot, idRombelSim) {
  var p = stafDariToken_(token);
  var cx = pwKonteks_(p, idSlot, idRombelSim), t = muTokenBaru_();
  pwTab_(MU.TAB_SLOT, MU.HDR_SLOT).getRange(cx.s.baris, MU.HDR_SLOT.indexOf('TOKEN') + 1).setNumberFormat('@').setValue(t);
  catat_(p.peran, '', p.nama, 'Ganti token ujian', cx.s.id + ' ' + cx.s.namaMapel, 'OK');
  return { token: t };
}
function pwSiswaRuang_(cx, idUjian, idRombel, nama) {
  var x = pwPeserta_(cx).filter(function(s) { return s.idUjian === String(idUjian) && s.idRombel === String(idRombel) && s.nama === String(nama); })[0];
  if (!x) throw new Error('Siswa ini bukan peserta ruang Anda.');
  return x;
}
function pwAlasan_(a) {
  a = String(a || '').replace(/\s+/g, ' ').trim();
  if (a.length < 5) throw new Error('Tulis alasan (minimal 5 huruf). Alasan dicatat di berita acara.');
  return a.slice(0, 200);
}
function waStafPengawasBukaKunci(token, idSlot, idRombelSim, idUjian, idRombel, nama, alasan) {
  var p = stafDariToken_(token);
  var cx = pwKonteks_(p, idSlot, idRombelSim), x = pwSiswaRuang_(cx, idUjian, idRombel, nama), a = pwAlasan_(alasan);
  // v1.55.0: sanksi bertingkat
  if (cx.m.jenis !== 'TRYOUT') {
    var sk = pwSanksi_(), rs = pwRingkasSanksi_(pwLogSiswa_(x.idUjian, x.idRombel, x.nama));
    if (rs.berat) throw new Error('Pelanggaran berat: jawaban sudah dikirim otomatis. Keputusan diambil Kepala Sekolah di Tinjauan Pelanggaran Berat.');
    if (rs.kunci >= sk.pimpinanMulai && PW.PIMPINAN.indexOf(p.peran) < 0) throw new Error('Ini kunci ke-' + rs.kunci + '. Hanya Koordinator Kurikulum, Kepala Sekolah, atau Admin yang dapat membukanya. Gunakan "Minta pimpinan membuka".');
  }
  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  try {
    var b = cariBarisSesiUjian_(x.idUjian, x.idRombel, x.nama);
    if (!b) throw new Error('Siswa ini belum memulai ujian.');
    b.sheet.getRange(b.rowIndex, b.cols.terkunci).setValue(false);
    b.sheet.getRange(b.rowIndex, b.cols.percobaan).setValue(0);
  } finally { kunci.releaseLock(); }
  pwCatat_(x.idUjian, x.idRombel, x.nama, 'Kunci dibuka pengawas', a, p.nama);
  catat_(p.peran, p.id, p.nama, 'Pengawas buka kunci ujian', x.nama + ' (ujian ' + x.idUjian + '): ' + a, 'OK');
  return { sukses: true };
}
function waStafPengawasTambahWaktu(token, idSlot, idRombelSim, idUjian, idRombel, nama, menit, alasan) {
  var p = stafDariToken_(token);
  var cx = pwKonteks_(p, idSlot, idRombelSim), x = pwSiswaRuang_(cx, idUjian, idRombel, nama), a = pwAlasan_(alasan);
  var n = parseInt(menit, 10);
  if (!(n >= 1 && n <= 30)) throw new Error('Tambahan waktu 1 sampai 30 menit.');
  var sudah = pwTambah_(x.idUjian, x.idRombel, x.nama);
  if (sudah + n > PW.MAKS_TAMBAH) throw new Error('Total tambahan waktu maksimal ' + PW.MAKS_TAMBAH + ' menit (sudah ' + sudah + ' menit).');
  pwTab_(PW.TAB_TW, PW.HDR_TW).appendRow([pwTeks_(pwWaktu_()), pwTeks_(x.idUjian), pwTeks_(x.idRombel), pwTeks_(x.nama), n, pwTeks_(a), pwTeks_(p.nama)]);
  try { CacheService.getScriptCache().remove('pw_tw'); } catch (e) {}
  PW_TW_ = null;
  pwCatat_(x.idUjian, x.idRombel, x.nama, 'Tambah waktu ' + n + ' menit', a, p.nama);
  catat_(p.peran, p.id, p.nama, 'Pengawas tambah waktu ujian', x.nama + ' +' + n + ' menit (ujian ' + x.idUjian + '): ' + a, 'OK');
  return { sukses: true, tambahMenit: sudah + n };
}

// ---------- berita acara ----------
function waStafPengawasBeritaAcara(token, idSlot, idRombelSim) {
  var p = stafDariToken_(token);
  var cx = pwKonteks_(p, idSlot, idRombelSim), d = pwRuang_(cx);
  var lama = pwBaca_(PW.TAB_BA, PW.HDR_BA).filter(function(r) { return r['SLOT'] === cx.s.id && r['ROMBEL'] === cx.kunciRuang; })[0] || null;
  var kejadian = d.log.filter(function(r) { return r['OLEH'] !== 'Jaringan'; }).map(function(r) {
    return { waktu: r['WAKTU'], jam: String(r['WAKTU']).slice(11, 16), nama: r['NAMA SISWA'], jenis: r['JENIS'], detail: r['DETAIL'], oleh: r['OLEH'], sistem: r['OLEH'] === 'Sistem' };
  }).sort(function(a, b) { return String(a.waktu).localeCompare(String(b.waktu)); });
  d.kejadian = kejadian;
  d.beritaAcara = lama ? { waktu: lama['WAKTU'], pengawas: lama['NAMA PENGAWAS'], keterangan: lama['KETERANGAN'], ttd: lama['TTD'] } : null;
  d.namaPenyusun = p.nama;
  delete d.log;
  return d;
}
// isi: {keterangan (wajib), ttd: 'data:image/png;base64,...'}
function waStafPengawasBeritaAcaraSimpan(token, idSlot, idRombelSim, isi) {
  var p = stafDariToken_(token);
  var cx = pwKonteks_(p, idSlot, idRombelSim);
  isi = isi || {};
  var ket = String(isi.keterangan || '').trim();
  if (ket.length < 10) throw new Error('Keterangan pengawas wajib diisi (minimal 10 huruf).');
  var ttd = String(isi.ttd || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(ttd)) throw new Error('Tanda tangan belum dibuat.');
  if (ttd.length > PW.MAKS_TTD) throw new Error('Gambar tanda tangan terlalu besar. Hapus lalu tanda tangani lagi dengan lebih sederhana.');
  var d = pwRuang_(cx), hadir = 0, tidak = 0, pel = 0;
  d.siswa.forEach(function(x) { if (x.status === 'Belum hadir') tidak++; else hadir++; pel += x.pelanggaran; });
  var sh = pwTab_(PW.TAB_BA, PW.HDR_BA);
  var lama = pwBaca_(PW.TAB_BA, PW.HDR_BA).filter(function(r) { return r['SLOT'] === cx.s.id && r['ROMBEL'] === cx.kunciRuang; })[0];
  var row = [lama ? lama['ID'] : 'BA-' + absId_().toUpperCase(), cx.m.id, cx.s.id, cx.kunciRuang, p.id, p.nama, pwWaktu_(), d.siswa.length, hadir, tidak, pel, ket.slice(0, 2000), ttd];
  if (lama) sh.getRange(lama._baris, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  else sh.appendRow(row.map(function(v) { return typeof v === 'number' ? v : pwTeks_(v); }));
  catat_(p.peran, p.id, p.nama, 'Berita acara ujian', cx.m.nama + ' · ' + cx.s.namaMapel + ' · ' + cx.namaRombel, 'OK');
  return { sukses: true, waktu: row[6] };
}

// ============================================================================
// v1.54.0 (Ujian Tahap 3): SATU PERANGKAT PER SISWA PER UJIAN
// Perangkat pertama yang memulai ujian terdaftar (ID perangkat Android, disimpan sebagai sidik MD5 + nama model).
// Mulai / lanjut / detak / kirim jawaban dari perangkat lain ditolak dan dicatat sebagai pelanggaran.
// Pengawas dapat mengizinkan perangkat baru (alasan wajib, tercatat di berita acara).
// ============================================================================
PW.TAB_PD = 'PERANGKAT UJIAN';
PW.HDR_PD = ['WAKTU', 'ID UJIAN', 'ID ROMBEL', 'NAMA SISWA', 'SIDIK', 'MODEL', 'STATUS'];

function pwHash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s)).map(function(b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function pwUraiPerangkat_(perangkat) {
  var p = String(perangkat || ''), i = p.indexOf('|');
  var id = (i >= 0 ? p.slice(0, i) : p).trim();
  return { id: id, sidik: id ? pwHash_(id) : '', model: (i >= 0 ? p.slice(i + 1) : '').trim().slice(0, 60) || 'perangkat tidak dikenal' };
}
function pwPerangkatCari_(k) {
  var c = CacheService.getScriptCache(), s = c.get('pw_pd_' + k);
  if (s === '-') return null;
  if (s) { var a = s.split('|'); return { sidik: a[0], model: a.slice(1).join('|') }; }
  var ada = null;
  pwBaca_(PW.TAB_PD, PW.HDR_PD).forEach(function(r) {
    if (r['STATUS'] === 'Aktif' && pwKunciSiswa_(r['ID UJIAN'], r['ID ROMBEL'], r['NAMA SISWA']) === k) ada = { sidik: r['SIDIK'], model: r['MODEL'] };
  });
  try { c.put('pw_pd_' + k, ada ? ada.sidik + '|' + ada.model : '-', 1800); } catch (e) {}
  return ada;
}
// Mengembalikan pesan penolakan ('' = boleh). daftar = true: perangkat pertama didaftarkan (saat mulai).
function pwPerangkat_(j, idRombel, nama, perangkat, daftar) {
  if (!j) return '';
  var u = pwUraiPerangkat_(perangkat);
  if (!u.id) return j.masa && daftar ? 'Perbarui aplikasi TH.E-Course ke versi terbaru untuk mengikuti ujian ini.' : '';
  var k = pwKunciSiswa_(j.idUjian, idRombel, nama), ada = pwPerangkatCari_(k);
  if (!ada) {
    if (!daftar) return '';
    pwTab_(PW.TAB_PD, PW.HDR_PD).appendRow([pwTeks_(pwWaktu_()), pwTeks_(j.idUjian), pwTeks_(idRombel), pwTeks_(nama), pwTeks_(u.sidik), pwTeks_(u.model), 'Aktif']);
    try { CacheService.getScriptCache().put('pw_pd_' + k, u.sidik + '|' + u.model, 1800); } catch (e) {}
    return '';
  }
  if (ada.sidik === u.sidik) return '';
  try { pwCatat_(j.idUjian, idRombel, nama, 'Perangkat lain', 'Mencoba dari ' + u.model + '; perangkat terdaftar ' + ada.model); } catch (e2) {}
  return 'Ujian ini sudah dimulai dari perangkat lain (' + ada.model + '). Satu siswa hanya boleh memakai satu perangkat. ' +
    'Bila ponsel Anda bermasalah, minta pengawas mengizinkan perangkat baru.';
}
function pwModelTerdaftar_() {
  var o = {};
  try { pwBaca_(PW.TAB_PD, PW.HDR_PD).forEach(function(r) { if (r['STATUS'] === 'Aktif') o[pwKunciSiswa_(r['ID UJIAN'], r['ID ROMBEL'], r['NAMA SISWA'])] = r['MODEL']; }); } catch (e) {}
  return o;
}
function waStafPengawasIzinPerangkat(token, idSlot, idRombelSim, idUjian, idRombel, nama, alasan) {
  var p = stafDariToken_(token);
  var cx = pwKonteks_(p, idSlot, idRombelSim), x = pwSiswaRuang_(cx, idUjian, idRombel, nama), a = pwAlasan_(alasan);
  var k = pwKunciSiswa_(x.idUjian, x.idRombel, x.nama), sh = pwTab_(PW.TAB_PD, PW.HDR_PD), kol = PW.HDR_PD.indexOf('STATUS') + 1, n = 0;
  pwBaca_(PW.TAB_PD, PW.HDR_PD).forEach(function(r) {
    if (r['STATUS'] === 'Aktif' && pwKunciSiswa_(r['ID UJIAN'], r['ID ROMBEL'], r['NAMA SISWA']) === k) { sh.getRange(r._baris, kol).setValue('Direset'); n++; }
  });
  try { CacheService.getScriptCache().remove('pw_pd_' + k); } catch (e) {}
  pwCatat_(x.idUjian, x.idRombel, x.nama, 'Perangkat baru diizinkan pengawas', a, p.nama);
  catat_(p.peran, p.id, p.nama, 'Pengawas izinkan perangkat baru', x.nama + ' (ujian ' + x.idUjian + '): ' + a, 'OK');
  return { sukses: true, direset: n };
}

// ============================================================================
// v1.55.0: SANKSI BERTINGKAT
// Hitungan kunci per siswa per ujian (dari log PELANGGARAN UJIAN; direset oleh keputusan pimpinan):
//   kunci ke < pimpinanMulai : pengawas boleh membuka (alasan wajib)
//   kunci ke >= pimpinanMulai: hanya pimpinan (Koordinator Kurikulum / Kepala Sekolah / Admin / Superadmin); pengawas bisa meminta
//   kunci ke >= beratMulai   : jawaban dikirim otomatis apa adanya, ditandai "Pelanggaran berat - perlu ditinjau";
//                              Kepala Sekolah / Admin memutuskan: nilai tetap, susulan, atau dibatalkan.
// Tryout: hanya catatan (pengawas tetap boleh membuka, tanpa kirim otomatis).
// ============================================================================
PW.PIMPINAN = ['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum'];
PW.PEMUTUS = ['Admin', 'Superadmin', 'Kepala Sekolah'];
PW.SANKSI_BAWAAN = { pimpinanMulai: 2, beratMulai: 3 };
PW.J_KUNCI = 'ujian terkunci';
PW.J_BERAT = 'Pelanggaran berat - perlu ditinjau';
PW.J_PUTUS = 'Keputusan pimpinan';

function pwSanksi_() {
  var s = {};
  try { s = JSON.parse(PropertiesService.getScriptProperties().getProperty('pw_sanksi') || '{}') || {}; } catch (e) {}
  var a = parseInt(s.pimpinanMulai, 10), b = parseInt(s.beratMulai, 10);
  a = a >= 1 && a <= 9 ? a : PW.SANKSI_BAWAAN.pimpinanMulai;
  b = b >= 1 && b <= 9 ? b : PW.SANKSI_BAWAAN.beratMulai;
  if (b < a) b = a;
  return { pimpinanMulai: a, beratMulai: b, batasKeluar: CONFIG.BATAS_PERCOBAAN_PINDAH_TAB };
}
function waStafMasaSanksi(token) {
  var p = stafDariToken_(token);
  muWajib_(p);
  return { sanksi: pwSanksi_(), bisaUbah: p.peran === 'Admin' || p.peran === 'Superadmin' };
}
function waStafMasaSanksiSimpan(token, d) {
  var p = stafDariToken_(token);
  if (p.peran !== 'Admin' && p.peran !== 'Superadmin') throw new Error('Aturan sanksi hanya dapat diubah Admin atau Superadmin.');
  d = d || {};
  var a = parseInt(d.pimpinanMulai, 10), b = parseInt(d.beratMulai, 10);
  if (!(a >= 1 && a <= 9) || !(b >= 1 && b <= 9)) throw new Error('Isi angka 1 sampai 9.');
  if (b < a) throw new Error('Kunci "pelanggaran berat" tidak boleh lebih kecil dari kunci "dibuka pimpinan".');
  PropertiesService.getScriptProperties().setProperty('pw_sanksi', JSON.stringify({ pimpinanMulai: a, beratMulai: b }));
  catat_(p.peran, p.id, p.nama, 'Aturan sanksi ujian', 'dibuka pimpinan mulai kunci ke-' + a + ', pelanggaran berat mulai kunci ke-' + b, 'OK');
  return { sukses: true, sanksi: pwSanksi_() };
}

// Ringkasan sanksi per siswa dari baris log (urut waktu): kunci sejak keputusan terakhir, berat, menunggu pimpinan.
function pwRingkasSanksi_(baris) {
  var o = { kunci: 0, berat: false, minta: false, kunciTotal: 0 };
  baris.slice().sort(function(a, b) { return String(a.waktu || a['WAKTU']).localeCompare(String(b.waktu || b['WAKTU'])); }).forEach(function(r) {
    var j = String(r.jenis || r['JENIS'] || '');
    if (j.indexOf(PW.J_PUTUS) === 0) { o.kunci = 0; o.berat = false; o.minta = false; return; }
    if (j.indexOf(PW.J_KUNCI) >= 0) { o.kunci++; o.kunciTotal++; o.minta = false; }
    if (j === PW.J_BERAT) o.berat = true;
    if (j === 'Permintaan buka kunci ke pimpinan') o.minta = true;
    if (j === 'Kunci dibuka pengawas') o.minta = false;
  });
  return o;
}
function pwLogSiswa_(idUjian, idRombel, nama) {
  var k = pwKunciSiswa_(idUjian, idRombel, nama);
  return pwBaca_(PW.TAB_LG, PW.HDR_LG).filter(function(r) { return pwKunciSiswa_(r['ID UJIAN'], r['ID ROMBEL'], r['NAMA SISWA']) === k; });
}
// Dipanggil waLaporPindahTab sesudah ujian terkunci. Mengembalikan {kunciKe, kirimOtomatis, perluPimpinan}.
function pwSetelahKunci_(idUjian, idRombel, nama) {
  var j = ujJadwalDariUjian_(idUjian), sk = pwSanksi_(), rs = pwRingkasSanksi_(pwLogSiswa_(idUjian, idRombel, nama));
  var tryout = !!(j && j.jenis === 'TRYOUT');
  var out = { kunciKe: rs.kunci, kirimOtomatis: false, perluPimpinan: !tryout && rs.kunci >= sk.pimpinanMulai, berat: false };
  if (rs.kunci >= sk.beratMulai && !rs.berat) {
    pwCatat_(idUjian, idRombel, nama, tryout ? 'Pelanggaran berat (Tryout - hanya catatan)' : PW.J_BERAT, 'Ujian terkunci ' + rs.kunci + ' kali');
    if (!tryout) {
      out.kirimOtomatis = true; out.berat = true;
      try { CacheService.getScriptCache().put('pw_berat_' + pwKunciSiswa_(idUjian, idRombel, nama), '1', 21600); } catch (e) {}
      try {
        var m = j ? (ujtPetaMapel_()[String(j.idMapel)] || {}) : {};
        npKirim_('ujian_pelanggaran_berat', { judul: 'Pelanggaran berat saat ujian', isi: nama + ' (' + (m.namaRombel || idRombel) + ') terkunci ' + rs.kunci + ' kali pada ' +
          (m.namaMapel || 'ujian') + '. Jawaban dikirim otomatis dan perlu ditinjau.', aksi: 'tinjau_ujian', ref: 'berat|' + pwKunciSiswa_(idUjian, idRombel, nama) + '|' + rs.kunciTotal });
      } catch (e2) {}
      try { if (typeof ubNotifPelanggaran_ === 'function') ubNotifPelanggaran_(idRombel, nama, j, rs.kunci); } catch (e3) {}   // v1.61.0
    }
  } else if (rs.berat && !tryout) {
    out.kirimOtomatis = true; out.berat = true;
  }
  return out;
}
function pwBerat_(idUjian, idRombel, nama) {
  var k = pwKunciSiswa_(idUjian, idRombel, nama);
  try { if (CacheService.getScriptCache().get('pw_berat_' + k) === '1') return true; } catch (e) {}
  return pwRingkasSanksi_(pwLogSiswa_(idUjian, idRombel, nama)).berat;
}
// Kirim otomatis jawaban sesudah pelanggaran berat: kunci sementara dilepas agar jawaban bisa dinilai.
function pwLepasUntukKirim_(payload) {
  if (!payload || payload.paksa !== true || !pwBerat_(payload.idUjian, payload.idRombel, payload.nama)) return false;
  var b = cariBarisSesiUjian_(payload.idUjian, payload.idRombel, payload.nama);
  if (!b || String(b.row[b.cols.status - 1]) !== 'Berlangsung') return false;
  b.sheet.getRange(b.rowIndex, b.cols.terkunci).setValue(false);
  return true;
}

function waStafPengawasMintaBuka(token, idSlot, idRombelSim, idUjian, idRombel, nama, alasan) {
  var p = stafDariToken_(token);
  var cx = pwKonteks_(p, idSlot, idRombelSim), x = pwSiswaRuang_(cx, idUjian, idRombel, nama), a = pwAlasan_(alasan);
  var rs = pwRingkasSanksi_(pwLogSiswa_(x.idUjian, x.idRombel, x.nama));
  pwCatat_(x.idUjian, x.idRombel, x.nama, 'Permintaan buka kunci ke pimpinan', a, p.nama);
  npKirim_('ujian_minta_buka', { judul: 'Permintaan buka kunci ujian', isi: p.nama + ' meminta kunci ' + x.nama + ' (' + cx.namaRombel + ', ' + cx.s.namaMapel + ', kunci ke-' + rs.kunci + ') dibuka: ' + a +
    '. Buka di menu Pengawas Ujian.', aksi: 'pengawas_ujian', ref: 'mb|' + pwKunciSiswa_(x.idUjian, x.idRombel, x.nama) + '|' + rs.kunciTotal });
  return { sukses: true };
}

// ---------- tinjauan pelanggaran berat (Kepala Sekolah / Admin) ----------
function waStafMasaTinjau(token) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var log = pwBaca_(PW.TAB_LG, PW.HDR_LG), per = {};
  log.forEach(function(r) { (per[pwKunciSiswa_(r['ID UJIAN'], r['ID ROMBEL'], r['NAMA SISWA'])] = per[pwKunciSiswa_(r['ID UJIAN'], r['ID ROMBEL'], r['NAMA SISWA'])] || []).push(r); });
  var mapel = ujtPetaMapel_(), jad = {}, masa = {}, out = [], riwayat = [];
  ujJadwalSemua_().forEach(function(j) { jad[String(j.idUjian)] = j; });
  try { muSemua_().forEach(function(m) { masa[m.id] = m.nama; }); } catch (e) {}
  Object.keys(per).forEach(function(k) {
    var rows = per[k], rs = pwRingkasSanksi_(rows), r0 = rows[0], j = jad[String(r0['ID UJIAN'])];
    var adaBerat = rows.some(function(r) { return r['JENIS'] === PW.J_BERAT; });
    if (!adaBerat || !j) return;
    var m = mapel[String(j.idMapel)] || {}, h = ujHasilSiswa_(j.idUjian, r0['ID ROMBEL'], r0['NAMA SISWA']);
    var putus = rows.filter(function(r) { return String(r['JENIS']).indexOf(PW.J_PUTUS) === 0; }).pop();
    var o = { idUjian: String(j.idUjian), idRombel: r0['ID ROMBEL'], nama: r0['NAMA SISWA'], mapel: m.namaMapel || j.idMapel, rombel: m.namaRombel || r0['ID ROMBEL'],
      masa: masa[j.masa] || '', jenis: j.jenis, tanggal: j.tanggal, jam: j.jam, durasi: j.durasi, nilai: h.terbaik ? h.terbaik.persen : null,
      log: rows.map(function(r) { return { waktu: r['WAKTU'], jenis: r['JENIS'], detail: r['DETAIL'], oleh: r['OLEH'] }; }),
      menunggu: rs.berat, keputusan: putus ? { jenis: putus['JENIS'], detail: putus['DETAIL'], oleh: putus['OLEH'], waktu: putus['WAKTU'] } : null };
    (rs.berat ? out : riwayat).push(o);
  });
  var urut = function(a, b) { return (b.tanggal + b.jam).localeCompare(a.tanggal + a.jam); };
  return { menunggu: out.sort(urut), riwayat: riwayat.sort(urut).slice(0, 50), bisaPutus: PW.PEMUTUS.indexOf(p.peran) >= 0 };
}
// keputusan: 'tetap' | 'batal' | 'susulan' (d.tanggal, d.jam). catatan wajib.
function waStafMasaTinjauPutus(token, idUjian, idRombel, nama, keputusan, catatan, d) {
  var p = stafDariToken_(token);
  muWajib_(p);
  if (PW.PEMUTUS.indexOf(p.peran) < 0) throw new Error('Keputusan pelanggaran berat diambil Kepala Sekolah atau Admin.');
  var a = pwAlasan_(catatan), j = ujJadwalDariUjian_(idUjian);
  if (!j) throw new Error('Jadwal ujian tidak ditemukan.');
  if (!pwRingkasSanksi_(pwLogSiswa_(idUjian, idRombel, nama)).berat) throw new Error('Kasus ini sudah diputuskan.');
  var teks = '';
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    if (keputusan === 'batal' || keputusan === 'susulan') {
      ujHasilSiswa_(idUjian, idRombel, nama).baris.forEach(function(h) { ujUbah_('HASIL', h._baris, { 'Nilai': 0, 'Persen': 0, 'Jenis': 'Dibatalkan' }); });
      try { ujTulisJawaban_(j, idRombel, nama, 'Nilai dibatalkan karena pelanggaran berat: ' + a, 0); } catch (e) {}
    }
    if (keputusan === 'susulan') {
      var mulai = ujMs_(d && d.tanggal, d && d.jam);
      if (isNaN(mulai) || mulai < Date.now() - 60000) throw new Error('Isi tanggal dan jam susulan yang akan datang.');
      var selesai = mulai + (j.durasi + 30) * 60000;
      ujAksesSiswa_(idUjian, idRombel, nama).forEach(function(x) { if (x['Status'] === 'Terbuka') ujUbah_('AKSES', x._baris, { 'Status': 'Dicabut' }); });
      ujTambah_('AKSES', { 'ID': generateId_('AKS-'), 'ID Ujian': idUjian, 'ID Rombel': idRombel, 'Nama Siswa': nama, 'Jenis': 'Susulan',
        'Mulai': ujFmt_(mulai, 'yyyy-MM-dd HH:mm'), 'Selesai': ujFmt_(selesai, 'yyyy-MM-dd HH:mm'), 'Status': 'Terbuka', 'Dibuka Oleh': p.nama, 'Waktu Dibuka': ujNow_() });
      var b = cariBarisSesiUjian_(idUjian, idRombel, nama);
      if (b) { b.sheet.getRange(b.rowIndex, b.cols.terkunci).setValue(false); b.sheet.getRange(b.rowIndex, b.cols.percobaan).setValue(0); }
      teks = 'susulan ' + ujTeksWaktu_(mulai);
    } else if (keputusan === 'batal') {
      teks = 'nilai dibatalkan';
    } else if (keputusan === 'tetap') {
      teks = 'nilai tetap';
    } else throw new Error('Pilih keputusan.');
  } finally { kunci.releaseLock(); }
  pwCatat_(idUjian, idRombel, nama, PW.J_PUTUS + ': ' + teks, a, p.nama);
  try { CacheService.getScriptCache().remove('pw_berat_' + pwKunciSiswa_(idUjian, idRombel, nama)); } catch (e2) {}
  catat_(p.peran, p.id, p.nama, 'Keputusan pelanggaran berat ujian', nama + ' (ujian ' + idUjian + '): ' + teks + ' - ' + a, 'OK');
  return { sukses: true, keputusan: teks };
}

// ============================================================================
// v1.63.0: RUANG UJIAN PER UNIT BELAJAR
// Masa dengan "pisah ruang per unit": tiap rombel dibagi per unit siswa (kunci ruang "idRombel~idUnit";
// "~-" = siswa belum berlabel unit). Pengawas, pantauan, daftar hadir, dan berita acara mengikuti kunci ini.
// ============================================================================
function pwUraiRuang_(kunci) {
  var s = String(kunci || ''), i = s.indexOf('~');
  return i < 0 ? { rombel: s, unit: '' } : { rombel: s.slice(0, i), unit: s.slice(i + 1) || '-' };
}
function pwNamaRuang_(kunci, rb) {
  var k = pwUraiRuang_(kunci), nama = rb && rb[k.rombel] ? rb[k.rombel].nama : k.rombel;
  if (!k.unit) return nama;
  return nama + ' · ' + (k.unit === '-' ? 'Belum ada unit' : (typeof ubNamaKunci_ === 'function' ? ubNamaKunci_(k.unit) : k.unit));
}
var PW_RUANG_MEMO_ = {};
function pwRuangRombel_(m, idRombelSim) {
  if (!m.pisahUnit || typeof ubPetaSiswa_ !== 'function') return [String(idRombelSim)];
  var ck = m.id + '|' + idRombelSim;
  if (PW_RUANG_MEMO_[ck]) return PW_RUANG_MEMO_[ck];
  var lab = ubPetaSiswa_(), unit = {}, pilih = null;
  if (m.peserta.mode === 'siswa') { pilih = {}; m.peserta.siswa.forEach(function(x) { pilih[x] = true; }); }
  (absWbRombel_(idRombelSim) || []).forEach(function(w) {
    if (pilih && !pilih[w.id]) return;
    unit[ubUnitEf_(w.id, lab) || '-'] = true;   // v1.64.2: belum berlabel -> unit utama (bila ada)
  });
  var out = Object.keys(unit).sort().map(function(u) { return String(idRombelSim) + '~' + u; });
  return (PW_RUANG_MEMO_[ck] = out.length ? out : [String(idRombelSim)]);
}
// Siswa e-Learning (rombel e-Learning + nama) termasuk unit ruang ini? unit '-' = belum berlabel.
function pwSiswaUnitCocok_(idRombelEl, nama, unit) {
  var w = typeof sbWbSiswa_ === 'function' ? sbWbSiswa_(idRombelEl, nama) : null;
  var l = w && typeof ubPetaSiswa_ === 'function' ? ubPetaSiswa_()[w.id] : null;
  var u = w && typeof ubUnitEf_ === 'function' ? (ubUnitEf_(w.id) || '-') : (l && l.unit ? l.unit : '-');
  return u === unit;
}
