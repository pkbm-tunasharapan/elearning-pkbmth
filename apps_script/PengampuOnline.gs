// ============================================================================
// PENUGASAN TUTOR PER UNIT (v1.73.0)
// - Tutor Online per rombel × mapel × UNIT (tab PENUGASAN ONLINE). UNIT kosong = semua unit (bawaan); baris berunit
//   menimpa bawaan untuk unit itu. Contoh: Matematika XII -> semua unit: Ikman; Losari: Patimah.
//   Bila sebuah kelas belum punya penugasan, tutor di ENROLL MAPEL dipakai sebagai bawaan (masa peralihan).
// - Tutor Online: menilai diskusi & nilai (UTS/UAS/UPK, termasuk ujian offline) HANYA siswa unit penugasannya, leger mapel
//   per unit atas namanya, melihat materi. Materi, tugas, dan soal disusun Admin, Kepala Sekolah, Koordinator Kurikulum.
// - Tutor Tatap Muka = tutor di jadwal Pemetaan (per unit): kehadiran tatap muka, hanya melihat materi.
// - Akses e-learning (tab "Enrollment Tutor") = semua Tutor Online kelas itu; diselaraskan otomatis saat disimpan dan oleh
//   sinkron Data Induk. Kolom TUTOR di ENROLL MAPEL = tutor bawaan (semua unit) supaya fitur lama tetap konsisten.
// - Siswa tanpa label unit = anggota unit utama. Honor tidak berubah.
// ============================================================================
var PGO = { TAB: 'PENUGASAN ONLINE', HDR: ['ID', 'ROMBEL', 'MAPEL', 'UNIT', 'TUTOR', 'AKTIF', 'DIUBAH OLEH', 'DIUBAH PADA'],
  CACHE_DETIK: 1200, MAKS: 3000, KOLOM: ['NO', 'ROMBEL', 'MAPEL', 'UNIT', 'TUTOR ONLINE'], LEMBAR: 'PENGAMPU', LEMBAR_REF: 'PILIHAN',
  WARNA: 'FF0F766E', SEMUA: 'Semua unit' };
var PGO_MEMO_ = {};

function pgoWajib_(token) {
  var p = stafDariToken_(token);
  if (!jadPeran_(p).kelola) throw new Error('Penugasan tutor hanya diatur oleh Admin atau Kepala Sekolah.');
  return p;
}

// Semua rombel × mapel aktif (Data Induk + mapel e-learning terhubung).
function pgoPasangan_() {
  return absKelas_('').map(function(k) {
    return { idRombel: k.idRombel, namaRombel: k.namaRombel, program: k.program || '', kodeMapel: k.kodeMapel, namaMapel: k.namaMapel, idInduk: k.idTutor || '' };
  });
}

// Peta penugasan: 'rombel|mapel' -> {semua: idTutor, unit: {idUnit: idTutor}, ada: bool}. Fallback ENROLL MAPEL.
function pgoPeta_() {
  if (PGO_MEMO_.peta) return PGO_MEMO_.peta;
  var out = {};
  var t = absBaca_(PGO.TAB, PGO.HDR);
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (!absBenar_(absNilai_(t, r, 'AKTIF'))) continue;
    var key = sTeks_(absNilai_(t, r, 'ROMBEL')).trim() + '|' + sTeks_(absNilai_(t, r, 'MAPEL')).trim();
    var u = sTeks_(absNilai_(t, r, 'UNIT')).trim(), tt = sTeks_(absNilai_(t, r, 'TUTOR')).trim();
    if (!tt) continue;
    var o = out[key] = out[key] || { semua: '', unit: {}, ada: true };
    if (u) o.unit[u] = tt; else o.semua = tt;
  }
  absKelasSim_('').forEach(function(k) {
    var key = k.idRombel + '|' + k.kodeMapel;
    if (!out[key] && k.idTutor) out[key] = { semua: k.idTutor, unit: {}, ada: false };
  });
  return (PGO_MEMO_.peta = out);
}
// Tutor Online untuk siswa di unit u pada kelas key.
function pgoTutorUnit_(key, u) {
  var o = pgoPeta_()[key];
  if (!o) return '';
  return (u && o.unit[u]) || o.semua || '';
}
// Semua Tutor Online sebuah kelas (untuk akses e-learning).
function pgoSemuaTutor_(key) {
  var o = pgoPeta_()[key], out = [];
  if (!o) return out;
  if (o.semua) out.push(o.semua);
  Object.keys(o.unit).forEach(function(u) { if (out.indexOf(o.unit[u]) < 0) out.push(o.unit[u]); });
  return out;
}
// Kunci unit (koma) tempat tutor ini menjadi Tutor Online kelas key; '' = semua siswa; null = bukan Tutor Online kelas itu.
function pgoKunciTutor_(key, idTutor) {
  var o = pgoPeta_()[key];
  if (!o || !idTutor) return null;
  var aktif = [];
  try { aktif = ubUnit_().filter(function(u) { return u.aktif; }).map(function(u) { return u.id; }); } catch (e) {}
  var milik = Object.keys(o.unit).filter(function(u) { return o.unit[u] === idTutor; });
  if (o.semua === idTutor) {
    var lain = Object.keys(o.unit).filter(function(u) { return o.unit[u] !== idTutor; });
    if (!lain.length) return '';
    milik = milik.concat(aktif.filter(function(u) { return lain.indexOf(u) < 0; }));
    if (!milik.length) return '-';   // bawaan, tetapi semua unit sudah ditangani tutor lain
  }
  if (!milik.length) return null;
  return ubKunci_(milik);
}

// Unit (id) siswa aktif per rombel (siswa tanpa label = unit utama).
function pgoUnitRombel_() {
  var out = {}, lab = {}, utama = '';
  try { lab = ubPetaSiswa_(); utama = ubUtama_(); } catch (e) { return out; }
  keuWbSemua_().forEach(function(w) {
    if (!w.aktif || !w.idRombel) return;
    var u = lab[w.id] && lab[w.id].unit ? lab[w.id].unit : utama;
    if (u) (out[w.idRombel] = out[w.idRombel] || {})[u] = true;
  });
  return out;
}
// Jadwal tatap muka aktif: key -> {semua: [idTutor], unit: {idUnit: [idTutor]}}
function pgoJadwal_(hariIni) {
  var out = {};
  jadBacaPm_().data.forEach(function(x) {
    if (!x.aktif || (x.sampai && x.sampai < hariIni)) return;
    var k = x.idRombel + '|' + x.kodeMapel, o = out[k] = out[k] || { semua: [], unit: {} };
    var tambah = function(a) { if (x.idTutor && a.indexOf(x.idTutor) < 0) a.push(x.idTutor); };
    if (!x.unit) tambah(o.semua);
    else x.unit.split(',').forEach(function(u) { u = u.trim(); if (u) tambah(o.unit[u] = o.unit[u] || []); });
  });
  return out;
}

// Daftar untuk tab Pengampu: per kelas, per unit yang punya siswa: Tutor Online & Tutor Tatap Muka + kelengkapan.
function waStafPengampuDaftar(token) {
  var p = stafDariToken_(token);
  if (!jadPeran_(p).lihatSemua) throw new Error('Peran Anda tidak dapat melihat penugasan tutor.');
  var pt = absPetaTutor_(), nm = function(id) { return id ? (pt[id] ? pt[id].nama : id) : ''; };
  var unit = [];
  try { unit = ubUnit_().filter(function(u) { return u.aktif; }).map(function(u) { return { id: u.id, nama: u.nama }; }); } catch (e) {}
  var unitR = pgoUnitRombel_(), jad = pgoJadwal_(absHariIni_()), peta = pgoPeta_();
  var kurang = { online: 0, tatapMuka: 0 };
  var item = pgoPasangan_().map(function(k) {
    var key = k.idRombel + '|' + k.kodeMapel, o = peta[key] || { semua: '', unit: {} }, j = jad[key] || { semua: [], unit: {} };
    var baris = unit.filter(function(u) { return (unitR[k.idRombel] || {})[u.id] || o.unit[u.id] || j.unit[u.id]; }).map(function(u) {
      var on = (o.unit[u.id] || o.semua || ''), tm = j.semua.concat(j.unit[u.id] || []).filter(function(x, i, a) { return a.indexOf(x) === i; });
      var adaSiswa = !!(unitR[k.idRombel] || {})[u.id];
      if (adaSiswa && !on) kurang.online++;
      if (adaSiswa && !tm.length) kurang.tatapMuka++;
      return { unit: u.id, namaUnit: u.nama, adaSiswa: adaSiswa, idOnline: on, online: nm(on), khusus: !!o.unit[u.id], tatapMuka: tm.map(nm) };
    });
    return { idRombel: k.idRombel, namaRombel: k.namaRombel, kodeMapel: k.kodeMapel, namaMapel: k.namaMapel, idSemua: o.semua, semua: nm(o.semua), unit: baris };
  });
  return {
    item: item, kurang: kurang, ubah: jadPeran_(p).kelola, unit: unit,
    tutor: Object.keys(pt).map(function(k) { return pt[k]; }).filter(function(t) { return t.aktif; })
      .map(function(t) { return { id: t.id, nama: t.nama }; }).sort(function(a, b) { return a.nama.localeCompare(b.nama); })
  };
}

// Simpan penugasan. d: [{idRombel, kodeMapel, unit ('' = semua unit), idTutor ('' = hapus penugasan unit itu)}]
function waStafPengampuSimpan(token, d) {
  var p = pgoWajib_(token);
  d = (Array.isArray(d) ? d : [d]).filter(function(x) { return x && x.idRombel && x.kodeMapel; }).slice(0, PGO.MAKS);
  if (!d.length) throw new Error('Pilih rombel dan mapel.');
  var pt = absPetaTutor_(), sah = {}, unitSah = {};
  pgoPasangan_().forEach(function(k) { sah[k.idRombel + '|' + k.kodeMapel] = true; });
  try { ubUnit_().forEach(function(u) { if (u.aktif) unitSah[u.id] = true; }); } catch (e) {}
  d.forEach(function(x) {
    x.idRombel = String(x.idRombel); x.kodeMapel = String(x.kodeMapel); x.unit = String(x.unit || '').trim(); x.idTutor = String(x.idTutor || '').trim();
    if (!sah[x.idRombel + '|' + x.kodeMapel]) throw new Error('Mapel ' + x.kodeMapel + ' tidak ada di rombel itu.');
    if (x.unit && !unitSah[x.unit]) throw new Error('Unit tidak dikenal atau nonaktif.');
    if (x.idTutor && (!pt[x.idTutor] || !pt[x.idTutor].aktif)) throw new Error('Tutor tidak ditemukan atau nonaktif.');
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var ubah = 0, sel = {};
  try {
    ubah = pgoTulis_(d, p);
    PGO_MEMO_ = {};
    d.forEach(function(x) { sel[x.idRombel + '|' + x.kodeMapel] = true; });
    pgoTulisInduk_(Object.keys(sel));
    var hasilE = pgoSelaraskanEnroll_(Object.keys(sel));
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} lock.releaseLock(); }
  pgoLupakan_();
  catat_(p.peran, '-', p.nama, 'Atur penugasan tutor online', d.length + ' baris, ' + ubah + ' berubah' +
    (hasilE.tanpaAkun.length ? '; tanpa akun: ' + hasilE.tanpaAkun.join(', ') : ''), 'OK');
  return { sukses: true, diubah: ubah, tanpaAkun: hasilE.tanpaAkun };
}
function pgoTulis_(d, p) {
  var t = absBaca_(PGO.TAB, PGO.HDR), kini = absWaktu_(), idx = {}, n = 0;
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (!absBenar_(absNilai_(t, r, 'AKTIF'))) continue;
    var k = [absNilai_(t, r, 'ROMBEL'), absNilai_(t, r, 'MAPEL'), absNilai_(t, r, 'UNIT')].map(function(x) { return sTeks_(x).trim(); }).join('|');
    if (idx[k]) { t.sh.getRange(i + 1, absCol_(t, 'AKTIF') + 1).setValue(false); continue; }   // ganda
    idx[k] = i + 1;
  }
  var baru = [];
  d.forEach(function(x) {
    var k = x.idRombel + '|' + x.kodeMapel + '|' + x.unit, b = idx[k];
    if (b) {
      var lama = sTeks_(absNilai_(t, t.v[b - 1], 'TUTOR')).trim();
      if (lama === x.idTutor) return;
      var isi = x.idTutor ? { 'TUTOR': x.idTutor } : { 'AKTIF': false };
      isi['DIUBAH OLEH'] = p.nama; isi['DIUBAH PADA'] = kini;
      Object.keys(isi).forEach(function(h) { t.sh.getRange(b, absCol_(t, h) + 1).setValue(isi[h]); });
      n++;
    } else if (x.idTutor) {
      baru.push(absBaris_(t, { 'ID': absId_(), 'ROMBEL': x.idRombel, 'MAPEL': x.kodeMapel, 'UNIT': x.unit, 'TUTOR': x.idTutor, 'AKTIF': true, 'DIUBAH OLEH': p.nama, 'DIUBAH PADA': kini }));
      idx[k] = -1;
      n++;
    }
  });
  if (baru.length) pgoTulisTeks_(t.sh, baru);
  absLupakan_(PGO.TAB);
  return n;
}

// Kolom TUTOR di ENROLL MAPEL = tutor bawaan (semua unit); bila tidak ada, tutor unit utama / pertama. Baris ganda dinonaktifkan.
function pgoTulisInduk_(keys) {
  absLupakan_('ENROLL MAPEL');
  var t = absBaca_('ENROLL MAPEL'), kT = absCol_(t, 'TUTOR'), kA = absCol_(t, 'AKTIF'), kS = absCol_(t, 'STATUS');
  if (kT < 0) return { ubah: 0, baru: 0 };
  var ingin = {}, utama = '';
  try { utama = ubUtama_(); } catch (e) {}
  keys.forEach(function(key) {
    var o = pgoPeta_()[key];
    ingin[key] = o ? (o.semua || (utama && o.unit[utama]) || pgoSemuaTutor_(key)[0] || '') : '';
  });
  var selesai = {}, out = { ubah: 0, baru: 0 };
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i], key = sTeks_(absNilai_(t, r, 'ROMBEL')).trim() + '|' + sTeks_(absNilai_(t, r, 'MAPEL')).trim();
    if (!(key in ingin)) continue;
    var aktif = kA < 0 || absBenar_(r[kA]), st = kS < 0 ? '' : sTeks_(r[kS]).trim();
    if (!aktif || (st && st !== 'Disetujui')) continue;
    if (selesai[key]) { if (kA >= 0) t.sh.getRange(i + 1, kA + 1).setValue(false); continue; }
    selesai[key] = true;
    if (sTeks_(r[kT]).trim() !== ingin[key]) { t.sh.getRange(i + 1, kT + 1).setValue(ingin[key]); out.ubah++; }
  }
  var baru = [], kini = absWaktu_();
  Object.keys(ingin).forEach(function(key) {
    if (selesai[key] || !ingin[key]) return;
    var q = key.split('|');
    baru.push(absBaris_(t, { 'ID ENROLL': itAcak_(), 'ROMBEL': q[0], 'MAPEL': q[1], 'TUTOR': ingin[key], 'AKTIF': true, 'DICATAT PADA': kini,
      'STATUS': 'Disetujui', 'DIAJUKAN OLEH': 'Pemetaan · Penugasan Online' }));
  });
  if (baru.length) pgoTulisTeks_(t.sh, baru);
  out.baru = baru.length;
  absLupakan_('ENROLL MAPEL');
  return out;
}

// Akun e-learning (Tutor & akun bertugas tambahan Tutor) per ID TUTOR.
function pgoAkunTutor_() {
  var out = {};
  try { out = honPetaPengguna_(); } catch (e) {}
  try {
    bacaPengguna_().forEach(function(u) {
      if (u.status !== 'Aktif' || u.peran === 'Tutor' || !tgTambahanTutor_(u)) return;
      var t = absTutorSaya_(u);
      if (t && t.id) { var a = out[t.id] = out[t.id] || []; if (!a.some(function(x) { return x.id === u.id; })) a.push(u); }
    });
  } catch (e2) {}
  return out;
}
// Samakan tab "Enrollment Tutor" kelas-kelas ini dengan semua Tutor Online-nya.
function pgoSelaraskanEnroll_(keys) {
  var out = { tambah: 0, hapus: 0, tanpaAkun: [] };
  var peta = nilPetaBm_(), akun = pgoAkunTutor_(), pt = absPetaTutor_(), target = {}, nmBm = {};
  mapelAktifSemua_(true).forEach(function(m) { nmBm[m.idMapel] = m; });
  keys.forEach(function(key) {
    var us = [];
    pgoSemuaTutor_(key).forEach(function(idT) {
      var a = akun[idT] || [];
      if (!a.length) { var nm = pt[idT] ? pt[idT].nama : idT; if (out.tanpaAkun.indexOf(nm) < 0) out.tanpaAkun.push(nm); }
      a.forEach(function(u) { if (!us.some(function(x) { return x.id === u.id; })) us.push(u); });
    });
    (peta.kelas[key] || []).forEach(function(b) { target[b.idMapel] = us; });
  });
  if (!Object.keys(target).length) return out;
  var sh = getSheet(PERAN.SHEET_ENROLLMENT), v = sh.getDataRange().getValues(), ada = {}, hapus = [];
  for (var i = 1; i < v.length; i++) {
    var idU = sTeks_(v[i][0]).trim(), idM = sTeks_(v[i][2]).trim();
    if (!(idM in target)) continue;
    var boleh = target[idM].some(function(u) { return u.id === idU; });
    if (boleh && !ada[idU + '|' + idM]) ada[idU + '|' + idM] = true;
    else hapus.push(i + 1);
  }
  for (var h = hapus.length - 1; h >= 0; h--) sh.deleteRow(hapus[h]);
  out.hapus = hapus.length;
  var baru = [], kini = waktuSekarang_();
  Object.keys(target).forEach(function(idM) {
    var m = nmBm[idM] || {};
    target[idM].forEach(function(u) {
      if (ada[u.id + '|' + idM]) return;
      baru.push([u.id, u.nama, idM, m.namaMapel || '', m.namaRombel || '', kini]);
    });
  });
  if (baru.length) {
    var aw = sh.getLastRow() + 1;
    sh.getRange(aw, 1, baru.length, 6).setNumberFormat('@');
    sh.getRange(aw, 1, baru.length, 6).setValues(baru);
  }
  out.tambah = baru.length;
  try {
    var shM = getSheet(CONFIG.SHEETS.MAPEL), vm = shM.getDataRange().getValues();
    for (var j = 1; j < vm.length; j++) {
      var idm = sTeks_(vm[j][0]).trim();
      if (idm in target) shM.getRange(j + 1, 4).setValue(target[idm].map(function(u) { return u.nama; }).join(', '));
    }
  } catch (eM) {}
  return out;
}
// Untuk sinkron Data Induk: akun -> idMapel e-learning yang diinginkan dari penugasan online (kelas yang punya penugasan).
// Mengembalikan {kelola: {idMapel: true}, ingin: {idPengguna|idMapel: true}}
function pgoInginEnroll_() {
  var out = { kelola: {}, ingin: {} };
  try {
    var peta = nilPetaBm_(), akun = pgoAkunTutor_(), pp = pgoPeta_();
    Object.keys(pp).forEach(function(key) {
      if (!pp[key].ada) return;
      (peta.kelas[key] || []).forEach(function(b) {
        out.kelola[b.idMapel] = true;
        pgoSemuaTutor_(key).forEach(function(idT) { (akun[idT] || []).forEach(function(u) { out.ingin[u.id + '|' + b.idMapel] = true; }); });
      });
    });
  } catch (e) {}
  return out;
}

// Tambah baris dengan format teks (ID acak seperti '965e2800' tidak berubah menjadi angka 9.65E+28).
function pgoTulisTeks_(sh, baris) {
  var rg = sh.getRange(sh.getLastRow() + 1, 1, baris.length, baris[0].length);
  rg.setNumberFormat('@');
  rg.setValues(baris.map(function(r) { return r.map(function(v) { return typeof v === 'boolean' ? v : (v === null || v === undefined ? '' : String(v)); }); }));
}
function pgoLupakan_() {
  PGO_MEMO_ = {}; PGO_TM_MEMO_ = {};
  try { absLupakan_('ENROLL MAPEL'); absLupakan_(PGO.TAB); } catch (e) {}
  try { if (typeof perfHapusCache_ === 'function') perfHapusCache_(); } catch (e1) {}
}

// ---------- hak akses e-learning ----------
// Penyusun materi/tugas/soal: Admin, Kepala Sekolah, Koordinator Kurikulum.
function pgoPenyusun_(p) { return !!p && (p.peran === 'Admin' || p.peran === 'Kepala Sekolah' || p.peran === 'Koordinator Kurikulum'); }
// Fungsi penilaian yang boleh dijalankan Tutor Online (selain fungsi baca).
var PGO_NILAI_ = { waStafDiskusiJawaban: true, waStafDiskusiNilaiAi: true, waStafDiskusiSimpanNilai: true, waStafBukaKunci: true,
  waStafKodeAksesDaftar: true, waStafKodeAksesGenerate: true, waStafBukaSesi: true, waStafBukaSesiCabut: true, waStafBukaSesiDaftar: true };

// ID mapel e-learning yang dijadwalkan tatap muka untuk tutor ini tetapi ia bukan Tutor Online-nya.
var PGO_TM_MEMO_ = {};
function pgoMapelTatapMuka_(p) {
  if (!p || p.peran !== 'Tutor') return {};
  if (PGO_TM_MEMO_[p.id]) return PGO_TM_MEMO_[p.id];
  var out = {};
  try {
    var t = absTutorSaya_(p);
    if (t && t.id) {
      var hari = absHariIni_(), kunci = {};
      jadBacaPm_().data.forEach(function(x) {
        if (x.aktif && x.idTutor === t.id && (!x.sampai || x.sampai >= hari)) kunci[x.idRombel + '|' + x.kodeMapel] = true;
      });
      if (Object.keys(kunci).length) {
        var peta = nilPetaBm_(), milik = {};
        bacaEnrollment_().forEach(function(e) { if (e.idPengguna === p.id) milik[e.idMapel] = true; });
        Object.keys(kunci).forEach(function(k) { (peta.kelas[k] || []).forEach(function(b) { if (b.aktif && !milik[b.idMapel]) out[b.idMapel] = true; }); });
      }
    }
  } catch (e) {}
  return (PGO_TM_MEMO_[p.id] = out);
}
function pgoFnBaca_() { return typeof PIMPINAN_BACA_ !== 'undefined' && PIMPINAN_BACA_[API_FN_SAAT_INI_] === true; }
// Tutor tatap muka (bukan Tutor Online): hanya fungsi baca.
function pgoBolehLihat_(p, idMapel) {
  return !!p && p.peran === 'Tutor' && pgoFnBaca_() && !!pgoMapelTatapMuka_(p)[String(idMapel)];
}
// Tutor Online (ter-enroll): fungsi baca + penilaian; menyusun materi/soal ditolak. '' = boleh, selain itu pesan galat.
function pgoCekTutorOnline_(p) {
  if (!p || pgoPenyusun_(p) || p.peran !== 'Tutor') return '';
  var fn = String(API_FN_SAAT_INI_ || '');
  if (!fn || pgoFnBaca_() || PGO_NILAI_[fn]) return '';
  return 'Materi, tugas, dan soal disusun oleh Admin, Kepala Sekolah, atau Koordinator Kurikulum. Tutor menilai siswa di unit penugasannya.';
}

// Saringan siswa untuk Tutor Online di sebuah mapel e-learning: fungsi(namaSiswa) -> boolean. null = tanpa saringan.
function pgoSaringSiswaBm_(p, m) {
  if (!p || p.peran !== 'Tutor' || !m) return null;
  try {
    var t = absTutorSaya_(p);
    if (!t || !t.id) return null;
    var peta = nilPetaBm_(), key = '';
    Object.keys(peta.kelas).some(function(k) { if (peta.kelas[k].some(function(b) { return b.idMapel === m.idMapel; })) { key = k; return true; } return false; });
    if (!key) return null;
    var kunci = pgoKunciTutor_(key, t.id);
    if (kunci === '' || kunci === null) return null;
    var lab = ubPetaSiswa_(), utama = ubUtama_();
    return function(nama) {
      var w = sbWbSiswa_(m.idRombel, nama);
      if (!w) return false;
      var l = lab[w.id], u = l && l.unit ? l.unit : utama;
      return ubDalam_(kunci, u);
    };
  } catch (e) { return null; }
}

// ---------- templat & impor Excel ----------
function pgoPilihan_() {
  var pt = absPetaTutor_();
  var tutor = Object.keys(pt).map(function(k) { return pt[k]; }).filter(function(t) { return t.aktif; });
  var hit = {};
  tutor.forEach(function(t) { hit[t.nama.toLowerCase()] = (hit[t.nama.toLowerCase()] || 0) + 1; });
  var unit = [];
  try { unit = ubUnit_().filter(function(u) { return u.aktif; }).map(function(u) { return { id: u.id, nama: u.nama }; }); } catch (e) {}
  return {
    pasang: pgoPasangan_(), unit: unit, peta: pgoPeta_(),
    tutor: tutor.map(function(t) { return { id: t.id, nama: t.nama, label: hit[t.nama.toLowerCase()] > 1 ? t.nama + ' [' + t.id + ']' : t.nama }; })
      .sort(function(a, b) { return a.label.localeCompare(b.label); })
  };
}
function waStafPengampuTemplat(token) {
  var p = pgoWajib_(token), d = pgoPilihan_(), tl = {};
  d.tutor.forEach(function(t) { tl[t.id] = t.label; });
  var urut = d.pasang.slice().sort(function(a, b) { return (a.namaRombel + '|' + a.namaMapel).localeCompare(b.namaRombel + '|' + b.namaMapel, 'id', { numeric: true }); });
  var b = [
    [{ v: 'TEMPLAT PENUGASAN TUTOR ONLINE (PER ROMBEL × MAPEL × UNIT)', s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }],
    [{ v: 'Diunduh', s: 2 }, { v: absWaktu_() + ' oleh ' + p.nama }],
    [{ v: 'UNIT "' + PGO.SEMUA + '" = tutor bawaan seluruh siswa rombel. Baris unit tertentu menimpa bawaan untuk siswa unit itu. Kosongkan TUTOR ONLINE untuk melepas.', s: 6 }],
    [{ v: 'Tutor Online menilai siswa unit penugasannya dan namanya tercetak di leger mapel unit itu. Kolom ROMBEL, MAPEL, UNIT jangan diubah.', s: 6 }],
    [],
    PGO.KOLOM.map(function(k) { return { v: k, s: 3 }; })
  ];
  var no = 0;
  urut.forEach(function(k) {
    var o = d.peta[k.idRombel + '|' + k.kodeMapel] || { semua: '', unit: {} };
    [{ id: '', nama: PGO.SEMUA }].concat(d.unit).forEach(function(u) {
      var idT = u.id ? (o.unit[u.id] || '') : o.semua;
      b.push([{ v: ++no, n: true, s: 4 }, { v: k.namaRombel + ' [' + k.idRombel + ']', s: 4 }, { v: k.kodeMapel + ' - ' + k.namaMapel, s: 4 },
        { v: u.nama + (u.id ? ' [' + u.id + ']' : ''), s: 4 }, { v: idT ? (tl[idT] || idT) : '', s: 5 }]);
    });
  });
  var ref = [[{ v: 'TUTOR', s: 3 }]].concat(d.tutor.map(function(t) { return [{ v: t.label, s: 4 }]; }));
  var val = '<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="E7:E' + Math.max(7, 6 + no) + '">' +
    '<formula1>' + PGO.LEMBAR_REF + '!$A$2:$A$' + Math.max(2, d.tutor.length + 1) + '</formula1></dataValidation></dataValidations>';
  var xml = nxlSheetXml_(b, [5, 30, 36, 22, 32], ['A1:E1']).replace('</worksheet>', val + '</worksheet>');
  var nama = 'Templat_Penugasan_Online_' + absHariIni_() + '.xlsx';
  var blob = oflZip_([{ nama: PGO.LEMBAR, xml: xml }, { nama: PGO.LEMBAR_REF, xml: nxlSheetXml_(ref, [34], []) }], nxlStylesXml_(PGO.WARNA), nama);
  return { nama: nama, b64: Utilities.base64Encode(blob.getBytes()) };
}
// Baris Excel -> rencana. {item:[{baris,idRombel,kodeMapel,unit,idTutor,...}], galat, sama}
function pgoRencana_(baris, d) {
  var pas = {}, tut = {}, ganda = {}, unitId = {};
  d.pasang.forEach(function(k) { pas[k.idRombel + '|' + k.kodeMapel] = k; });
  d.unit.forEach(function(u) { unitId[u.id] = u; });
  d.tutor.forEach(function(t) {
    [t.label, t.nama, t.id].forEach(function(x) {
      var k = String(x).trim().toLowerCase();
      if (tut[k] && tut[k] !== t.id) ganda[k] = true; else tut[k] = t.id;
    });
  });
  var out = { item: [], galat: [], sama: 0 };
  (baris || []).forEach(function(r, i) {
    if (i < 6) return;
    var rb = String(r[1] || '').trim(), mp = String(r[2] || '').trim(), un = String(r[3] || '').trim(), tt = String(r[4] || '').trim();
    if (!rb && !mp) return;
    var mR = /\[([^\]]+)\]\s*$/.exec(rb), idR = mR ? mR[1].trim() : '';
    var k = pas[idR + '|' + mp.split(' - ')[0].trim()];
    if (!k) { out.galat.push({ baris: i + 1, alasan: 'Rombel/mapel "' + rb + ' / ' + mp + '" tidak dikenali.' }); return; }
    var idU = '';
    if (un && un !== PGO.SEMUA) {
      var mU = /\[([^\]]+)\]\s*$/.exec(un);
      idU = mU ? mU[1].trim() : '';
      if (!unitId[idU]) { out.galat.push({ baris: i + 1, alasan: 'Unit "' + un + '" tidak dikenali.' }); return; }
    }
    var idT = '';
    if (tt) {
      var key = tt.toLowerCase();
      if (ganda[key]) { out.galat.push({ baris: i + 1, alasan: 'Nama tutor "' + tt + '" ganda; pilih dari daftar yang memuat ID.' }); return; }
      idT = tut[key] || '';
      if (!idT) { out.galat.push({ baris: i + 1, alasan: 'Tutor "' + tt + '" tidak ditemukan atau nonaktif.' }); return; }
    }
    var o = d.peta[k.idRombel + '|' + k.kodeMapel] || { semua: '', unit: {}, ada: false };
    var lama = idU ? (o.unit[idU] || '') : o.semua;
    if (idT === lama) { out.sama++; return; }
    var nmT = function(id) { return id ? (d.tutor.filter(function(t) { return t.id === id; })[0] || {}).nama || id : ''; };
    out.item.push({ baris: i + 1, idRombel: k.idRombel, kodeMapel: k.kodeMapel, unit: idU, idTutor: idT, namaRombel: k.namaRombel, namaMapel: k.namaMapel,
      namaUnit: idU ? unitId[idU].nama : PGO.SEMUA, lama: nmT(lama), baru: nmT(idT) });
  });
  return out;
}
function waStafPengampuImporPratinjau(token, d) {
  var p = pgoWajib_(token);
  d = d || {};
  if (String(d.b64 || '').length > 4 * 1024 * 1024 * 1.4) throw new Error('File terlalu besar (maksimal 4 MB).');
  var lembar = oflBacaXlsx_(d.b64), baris = lembar[PGO.LEMBAR];
  if (!baris) { var k = Object.keys(lembar); baris = lembar[k[0]]; }
  var r = pgoRencana_(baris, pgoPilihan_());
  var kunci = 'pgo_' + p.id + '_' + absId_();
  CacheService.getScriptCache().put(kunci, JSON.stringify({ item: r.item, oleh: p.id }), PGO.CACHE_DETIK);
  return { kunci: kunci, jumlah: { siap: r.item.length, galat: r.galat.length, sama: r.sama }, item: r.item.slice(0, 500), galat: r.galat.slice(0, 300) };
}
function waStafPengampuImporTerapkan(token, kunci) {
  var p = pgoWajib_(token);
  var c = CacheService.getScriptCache(), s = c.get(String(kunci || ''));
  if (!s) throw new Error('Pratinjau kedaluwarsa. Unggah ulang berkasnya.');
  var d = JSON.parse(s);
  if (d.oleh !== p.id) throw new Error('Pratinjau ini milik pengguna lain.');
  if (!d.item.length) throw new Error('Tidak ada perubahan yang perlu disimpan.');
  var h = waStafPengampuSimpan(token, d.item.map(function(x) { return { idRombel: x.idRombel, kodeMapel: x.kodeMapel, unit: x.unit, idTutor: x.idTutor }; }));
  c.remove(String(kunci));
  return h;
}
