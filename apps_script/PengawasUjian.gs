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
  c.put('pw_d_' + pwKunciSiswa_(idUjian, idRombel, nama), String(Date.now()), 900);
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
    kelas.forEach(function(k) { if (k.kode === s.kode) (out[s.id][k.idRombelSim] = out[s.id][k.idRombelSim] || []).push(k); });
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
    rombel: Object.keys(rombel).map(function(r) { return { id: r, nama: rb[r] ? rb[r].nama : r, slot: rombel[r] }; }).sort(function(a, b) { return a.nama.localeCompare(b.nama); }),
    tugas: pwTugasMasa_(m.id).map(function(r) { return { slot: r['SLOT'], rombel: r['ROMBEL'], ruang: r['RUANG'], idPengawas: r['ID PENGAWAS'], namaPengawas: r['NAMA PENGAWAS'] }; }),
    staf: pwStaf_()
  };
}
// tugas: [{slot:'*'|idSlot, rombel, ruang, idPengawas}] - mengganti seluruh penugasan masa ini.
function waStafMasaPengawasSimpan(token, idMasa, tugas) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var m = muCari_(idMasa), staf = {}, baris = [], unik = {};
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
  return { sukses: true, jumlah: baris.length };
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
          rombel: r, namaRombel: rb[r] ? rb[r].nama : r, ruang: ef ? ef.ruang : '', pengawas: ef ? ef.namaPengawas : '', milik: milik,
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
  var kelas = muKelas_(m).filter(function(k) { return k.kode === s.kode && k.idRombelSim === String(idRombelSim); });
  var idx = {};
  kelas.forEach(function(k) { idx[k.idMapel] = k; });
  var jad = ujJadwalSemua_().filter(function(j) { return j.slot === s.id && idx[String(j.idMapel)]; });
  var rb = honProgramRombel_();
  return { p: p, s: s, m: m, ef: ef, milik: milik, kelas: kelas, jadwal: jad, namaRombel: rb[idRombelSim] ? rb[idRombelSim].nama : idRombelSim, idRombelSim: String(idRombelSim) };
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
  var model = pwModelTerdaftar_();
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
    return { nama: x.nama, nisn: x.nisn, idRombel: x.idRombel, idUjian: x.idUjian, status: status, terkunci: terkunci,
      percobaan: se ? Number(se.row[se.c.percobaan - 1]) || 0 : 0, pelanggaran: pel.length, mulai: pwJam_(mulai), selesai: st === 'Selesai' ? pwJam_(selesai) : '',
      sisaMenit: status === 'Mengerjakan' || status === 'Terputus' ? Math.max(0, Math.ceil((akhir - now) / 60000)) : null, tambahMenit: tw,
      detak: dt ? pwJam_(dt) : '', perangkat: model[k] || '', log: lg[k] || [] };
  });
  var hitung = {};
  siswa.forEach(function(x) { hitung[x.status] = (hitung[x.status] || 0) + 1; });
  var j0 = cx.jadwal[0];
  return {
    slot: { id: cx.s.id, tanggal: cx.s.tanggal, jam: cx.s.jam, durasi: cx.s.durasi, mapel: cx.s.namaMapel, token: cx.s.token,
      mulaiMs: j0 ? j0.mulaiMs : ujMs_(cx.s.tanggal, cx.s.jam), masukSampaiMs: j0 ? j0.masukSampaiMs : 0, akhirMs: j0 ? j0.akhirMs : 0 },
    masa: { id: cx.m.id, nama: cx.m.nama, jenis: cx.m.jenis, smt: cx.m.smt }, rombel: cx.idRombelSim, namaRombel: cx.namaRombel,
    ruang: cx.ef ? cx.ef.ruang : '', pengawas: cx.ef ? cx.ef.namaPengawas : '', idPengawas: cx.ef ? cx.ef.idPengawas : '', milik: cx.milik,
    siswa: siswa, ringkas: hitung, sekarangMs: now, jumlahJadwal: cx.jadwal.length, log: log, sekolah: pwSekolah_()
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
  var lama = pwBaca_(PW.TAB_BA, PW.HDR_BA).filter(function(r) { return r['SLOT'] === cx.s.id && r['ROMBEL'] === cx.idRombelSim; })[0] || null;
  var kejadian = d.log.map(function(r) {
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
  var lama = pwBaca_(PW.TAB_BA, PW.HDR_BA).filter(function(r) { return r['SLOT'] === cx.s.id && r['ROMBEL'] === cx.idRombelSim; })[0];
  var row = [lama ? lama['ID'] : 'BA-' + absId_().toUpperCase(), cx.m.id, cx.s.id, cx.idRombelSim, p.id, p.nama, pwWaktu_(), d.siswa.length, hadir, tidak, pel, ket.slice(0, 2000), ttd];
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
