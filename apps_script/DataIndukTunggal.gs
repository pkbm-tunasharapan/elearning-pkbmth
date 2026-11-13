// ============================================================================
// DATA INDUK = SUMBER TUNGGAL (v1.78.0)
// Belajar online (materi, diskusi, ujian online) tetap dipakai, tetapi rombel & mapel e-learning MENGIKUTI
// Data Induk satu arah dan tidak lagi diatur di sisi e-learning:
// - Status mapel e-learning = Aktif bila rombel × kode mapel ada di ENROLL MAPEL (aktif & disetujui); selain itu Nonaktif.
// - Kelas Data Induk yang belum punya mapel e-learning dibuatkan (ID MP-<KODE>-<akhiran rombel e-learning>).
// - Status rombel e-learning = AKTIF rombel Data Induk (nama tidak diubah).
// - Akses tutor ke mapel e-learning hanya dari tab Pengampu (PengampuOnline.gs).
// Dijalankan pada sinkron Data Induk (pemicu waktu / tombol) dan setiap ENROLL MAPEL / ROMBEL disimpan.
// Mapel e-learning yang tidak terhubung ke Data Induk (nama tidak dikenali) dibiarkan apa adanya.
// ============================================================================
var DIT = { BARIS_MAKS_BARU: 200 };

function ditAkhiranRombel_(idLms) { return String(idLms || '').toUpperCase().replace(/^ROM-?/, '').replace(/[^A-Z0-9]/g, ''); }

// Rencana murni (diuji): rombelSim [{id, nama, aktif}], rombelLms [[id, nama, _, status]], kelas {key: kelas},
// peta = nilPetaBm_(), mapelLms [[id, idRombel, nama, tutor, status]].
function ditRencana_(rombelSim, rombelLms, kelas, peta, mapelLms) {
  var out = { rombel: [], mapel: [], baru: [], tanpaRombel: [] };
  var simKunci = {}, lmsDariSim = {};
  rombelSim.forEach(function(r) { simKunci[kunciKelas_(r.nama)] = r; });
  rombelLms.forEach(function(r, i) {
    var sim = simKunci[kunciKelas_(r[1])];
    if (!sim || !String(r[0]).trim()) return;
    lmsDariSim[sim.id] = String(r[0]).trim();
    var tujuan = sim.aktif ? 'Aktif' : 'Nonaktif';
    if (String(r[3]).trim() !== tujuan) out.rombel.push({ baris: i, status: tujuan });
  });
  var target = {};
  Object.keys(peta.kelas || {}).forEach(function(key) {
    (peta.kelas[key] || []).forEach(function(b) { target[b.idMapel] = !!kelas[key]; });
  });
  var adaId = {};
  mapelLms.forEach(function(r, i) {
    var id = String(r[0]).trim();
    if (!id) return;
    adaId[id] = true;
    if (!(id in target)) return;
    var tujuan = target[id] ? 'Aktif' : 'Nonaktif';
    if (String(r[4]).trim() !== tujuan) out.mapel.push({ baris: i, idMapel: id, status: tujuan });
  });
  Object.keys(kelas).sort().forEach(function(key) {
    if ((peta.kelas[key] || []).length) return;
    var k = kelas[key], lms = lmsDariSim[k.idRombel];
    if (!lms) { out.tanpaRombel.push(key); return; }
    var dasar = 'MP-' + k.kodeMapel + '-' + ditAkhiranRombel_(lms), id = dasar, n = 2;
    while (adaId[id]) { id = dasar + '-' + n; n++; }
    adaId[id] = true;
    out.baru.push([id, lms, k.namaMapel || k.kodeMapel, '', 'Aktif']);
  });
  return out;
}

function ditSelaraskan_() {
  var hasil = { rombel: 0, aktif: 0, nonaktif: 0, baru: 0, tanpaRombel: 0 };
  try { absLupakan_('ROMBEL'); absLupakan_('ENROLL MAPEL'); } catch (e0) {}
  var rb = absBaca_('ROMBEL'), rombelSim = [];
  for (var i = 1; i < rb.v.length; i++) {
    var id = sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim();
    if (id) rombelSim.push({ id: id, nama: sTeks_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL')).trim(), aktif: absBenar_(absNilai_(rb, rb.v[i], 'AKTIF')) });
  }
  var shR = getSheet(CONFIG.SHEETS.ROMBEL), vR = shR.getDataRange().getValues();
  var shM = getSheet(CONFIG.SHEETS.MAPEL), vM = shM.getDataRange().getValues();
  var kelas = {};
  absKelasSim_('').forEach(function(k) { kelas[k.idRombel + '|' + k.kodeMapel] = k; });
  var r = ditRencana_(rombelSim, vR.slice(1), kelas, nilPetaBm_(), vM.slice(1));
  r.rombel.forEach(function(x) { shR.getRange(x.baris + 2, 4).setValue(x.status); hasil.rombel++; });
  r.mapel.forEach(function(x) { shM.getRange(x.baris + 2, 5).setValue(x.status); if (x.status === 'Aktif') hasil.aktif++; else hasil.nonaktif++; });
  var baru = r.baru.slice(0, DIT.BARIS_MAKS_BARU);
  if (baru.length) {
    var aw = shM.getLastRow() + 1;
    shM.getRange(aw, 1, baru.length, 5).setNumberFormat('@');
    shM.getRange(aw, 1, baru.length, 5).setValues(baru);
    hasil.baru = baru.length;
  }
  hasil.tanpaRombel = r.tanpaRombel.length;
  if (hasil.rombel || hasil.aktif || hasil.nonaktif || hasil.baru) {
    try { if (typeof perfHapusCache_ === 'function') perfHapusCache_(); } catch (e1) {}
    try { CacheService.getScriptCache().removeAll(['abs_kelas3_*']); } catch (e2) {}
    try { catat_('Sistem', '', 'Data Induk', 'Selaraskan e-learning dari Data Induk',
      hasil.rombel + ' rombel, ' + hasil.aktif + ' mapel diaktifkan, ' + hasil.nonaktif + ' dinonaktifkan, ' + hasil.baru + ' mapel baru' +
      (hasil.tanpaRombel ? ', ' + hasil.tanpaRombel + ' kelas tanpa rombel e-learning' : ''), 'OK'); } catch (e3) {}
  }
  return hasil;
}

// Pengajuan mapel tutor yang disetujui -> Tutor Online "semua unit" di tab Pengampu (bila kelas itu belum punya tutor
// bawaan), lalu akses e-learning diselaraskan dari Pengampu. idMapel = ID mapel e-learning pada pengajuan.
function ditSetujuiPengajuanTutor_(tutorAkun, daftarIdMapel, oleh) {
  var out = { ditugaskan: 0, dilewati: [] };
  var idT = itPastikanTutor_(tutorAkun);
  if (!idT) { out.dilewati.push('tutor belum tercatat di Data Induk'); return out; }
  var peta = nilPetaBm_(), balik = {}, kelas = {};
  Object.keys(peta.kelas).forEach(function(k) { peta.kelas[k].forEach(function(b) { balik[b.idMapel] = k; }); });
  absKelasSim_('').forEach(function(k) { kelas[k.idRombel + '|' + k.kodeMapel] = true; });
  var tulis = [], keys = [];
  (daftarIdMapel || []).forEach(function(idM) {
    var key = balik[String(idM)];
    if (!key || !kelas[key]) { out.dilewati.push(String(idM) + ': kelas belum aktif di Data Induk (Enroll Mapel)'); return; }
    var o = pgoPeta_()[key];
    if (o && o.ada && o.semua && o.semua !== idT) { out.dilewati.push(key + ': sudah ada Tutor Online bawaan'); return; }
    var q = key.split('|');
    tulis.push({ idRombel: q[0], kodeMapel: q[1], unit: '', idTutor: idT });
    keys.push(key);
  });
  if (tulis.length) {
    pgoTulis_(tulis, { nama: oleh || 'Admin' });
    pgoLupakan_();
    pgoTulisInduk_(keys);
    pgoSelaraskanEnroll_(keys);
    pgoLupakan_();
    out.ditugaskan = tulis.length;
  }
  return out;
}
