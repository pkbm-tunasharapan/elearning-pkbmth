// ============================================================
// IMPOR KELAS & MAPEL DARI "MASTER CONTROL CLASSROOM V1"
// ------------------------------------------------------------
// Hanya MEMBACA file master control (tidak mengubah apa pun di sana).
//   Ref_Courses        -> tab Rombel (kelas)  : hanya yang State = ACTIVE
//   Ref_Topics         -> tab Mapel           : topik per kelas, kode depan ("A09 - ") dibuang
//   Identitas_Pengampu -> kolom "Tutor" di Mapel (hanya keterangan teks untuk mapel baru)
// Aman dijalankan berulang kali: kelas/mapel yang sudah ada tidak diubah dan tidak
// digandakan (dicocokkan lewat nama), data siswa, tutor, materi, dan ujian tidak disentuh.
// Butuh izin membuka spreadsheet lain; pemilik script harus menyetujuinya sekali.
// ============================================================

var IMPOR = {
  MASTER_ID: '1onfi5V1uhE9g_QjKdxzpAHd-2l-YpOHCftIEPy8m2og',
  TAB_KELAS: 'Ref_Courses',
  TAB_TOPIK: 'Ref_Topics',
  TAB_PENGAMPU: 'Identitas_Pengampu'
};

function slugKelas_(nama) {
  return String(nama || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// "A09 - Ilmu Pengetahuan Alam dan Sosial (IPAS)" -> { kode: 'A09', nama: 'Ilmu Pengetahuan Alam dan Sosial (IPAS)' }
function uraiTopik_(teks) {
  var t = sTeks_(teks).trim().replace(/\s+/g, ' ');
  var kode = '';
  var m = t.match(/^([A-Za-z]{1,2}\d{1,3})\s*[-–—]\s*(.+)$/);
  if (m) { kode = m[1].toUpperCase(); t = m[2]; }
  t = t.replace(/[.\s]+$/, '').trim();
  return { kode: kode, nama: t };
}

function kolomDari_(header, nama, cadangan) {
  var cari = String(nama).toLowerCase();
  for (var i = 0; i < header.length; i++) {
    if (sTeks_(header[i]).trim().toLowerCase() === cari) return i;
  }
  return cadangan;
}

function bacaTabMaster_(ss, nama) {
  var sh = ss.getSheetByName(nama);
  if (!sh) throw new Error('Tab "' + nama + '" tidak ditemukan di master control classroom v1.');
  var v = sh.getDataRange().getValues();
  if (v.length < 1) throw new Error('Tab "' + nama + '" di master control kosong.');
  return v;
}

// Mengembalikan { kelas: [{courseId, nama}], topik: [{courseId, kelas, kode, nama}], tutor: {courseId|nama: 'Nama Tutor'} }
function bacaMasterLama_() {
  var ss;
  try {
    ss = SpreadsheetApp.openById(IMPOR.MASTER_ID);
  } catch (e) {
    throw new Error('Tidak bisa membuka file master control classroom v1. Pastikan akun pemilik aplikasi punya akses ke file itu, lalu setujui izin yang diminta. (' + (e && e.message ? e.message : e) + ')');
  }
  var vk = bacaTabMaster_(ss, IMPOR.TAB_KELAS);
  var ik = {
    id: kolomDari_(vk[0], 'Course ID', 0),
    nama: kolomDari_(vk[0], 'Course Name', 1),
    state: kolomDari_(vk[0], 'State', 3)
  };
  var kelas = [], aktif = {};
  for (var i = 1; i < vk.length; i++) {
    var id = sTeks_(vk[i][ik.id]).trim();
    var nama = sTeks_(vk[i][ik.nama]).trim().replace(/\s+/g, ' ');
    if (!id || !nama) continue;
    if (sTeks_(vk[i][ik.state]).trim().toUpperCase() !== 'ACTIVE') continue;
    if (aktif[id]) continue;
    aktif[id] = nama;
    kelas.push({ courseId: id, nama: nama });
  }

  var vt = bacaTabMaster_(ss, IMPOR.TAB_TOPIK);
  var it = {
    id: kolomDari_(vt[0], 'Course ID', 0),
    topik: kolomDari_(vt[0], 'Topic Name', 3)
  };
  var topik = [], terlihat = {};
  for (var j = 1; j < vt.length; j++) {
    var cid = sTeks_(vt[j][it.id]).trim();
    if (!aktif[cid]) continue;
    var u = uraiTopik_(vt[j][it.topik]);
    if (!u.nama) continue;
    var kk = cid + '|' + normNama_(u.nama);
    if (terlihat[kk]) continue;
    terlihat[kk] = true;
    topik.push({ courseId: cid, kelas: aktif[cid], kode: u.kode, nama: u.nama });
  }

  var tutor = {};
  try {
    var vp = bacaTabMaster_(ss, IMPOR.TAB_PENGAMPU);
    var ip = {
      id: kolomDari_(vp[0], 'Course ID', 0),
      topik: kolomDari_(vp[0], 'Mata Pelajaran (Topik)', 2),
      tutor: kolomDari_(vp[0], 'Nama Tutor Pengampu', 4)
    };
    for (var k = 1; k < vp.length; k++) {
      var c2 = sTeks_(vp[k][ip.id]).trim();
      var nt = sTeks_(vp[k][ip.tutor]).trim();
      var nm = uraiTopik_(vp[k][ip.topik]).nama;
      if (c2 && nm && nt) tutor[c2 + '|' + normNama_(nm)] = nt;
    }
  } catch (e) {
    // tab pengampu hanya pelengkap; tidak menggagalkan impor
  }
  return { kelas: kelas, topik: topik, tutor: tutor };
}

// Menyusun rencana tanpa menulis apa pun.
function rencanaImpor_() {
  var m = bacaMaster_();

  var rombelAda = {}, idRombelDipakai = {};
  getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(r, i) {
    if (i === 0 || !String(r[0]).trim()) return;
    var id = sTeks_(r[0]).trim();
    idRombelDipakai[id] = true;
    var kunci = kunciKelas_(r[1]);
    if (kunci && !rombelAda[kunci]) rombelAda[kunci] = { id: id, nama: sTeks_(r[1]).trim(), status: sTeks_(r[3]).trim() };
  });

  var kelasBaru = [], kelasAda = [], idUntuk = {};
  m.kelas.forEach(function(k) {
    var ada = rombelAda[kunciKelas_(k.nama)];
    if (ada) {
      idUntuk[k.courseId] = ada.id;
      kelasAda.push({ nama: k.nama, idRombel: ada.id, aktif: ada.status === 'Aktif' });
      return;
    }
    var dasar = 'ROM-' + (slugKelas_(k.nama) || 'KELAS'), id = dasar, n = 2;
    while (idRombelDipakai[id]) { id = dasar + '-' + n; n++; }
    idRombelDipakai[id] = true;
    idUntuk[k.courseId] = id;
    kelasBaru.push({ idRombel: id, nama: k.nama });
  });

  var mapelAdaId = {}, mapelAdaNama = {};
  getSheetData(CONFIG.SHEETS.MAPEL).forEach(function(r, i) {
    if (i === 0 || !String(r[0]).trim()) return;
    mapelAdaId[sTeks_(r[0]).trim()] = true;
    mapelAdaNama[sTeks_(r[1]).trim() + '|' + kunciMapel_(r[2])] = true;
  });

  var mapelBaru = [], mapelAda = 0;
  m.topik.forEach(function(t) {
    var idR = idUntuk[t.courseId];
    if (!idR) return;
    if (mapelAdaNama[idR + '|' + kunciMapel_(t.nama)]) { mapelAda++; return; }
    var akhiran = String(idR).toUpperCase().replace(/^ROM-?/, '').replace(/[^A-Z0-9]/g, '');
    var dasar = 'MP-' + (t.kode || singkatanMapel_(t.nama)) + (akhiran ? '-' + akhiran : '');
    var id = dasar, n = 2;
    while (mapelAdaId[id]) { id = dasar + '-' + n; n++; }
    mapelAdaId[id] = true;
    mapelAdaNama[idR + '|' + kunciMapel_(t.nama)] = true;
    mapelBaru.push({ idMapel: id, idRombel: idR, namaKelas: t.kelas, nama: t.nama, tutor: m.tutor[t.courseId + '|' + normNama_(t.nama)] || '' });
  });

  return { kelasBaru: kelasBaru, kelasAda: kelasAda, mapelBaru: mapelBaru, mapelAda: mapelAda, totalKelasMaster: m.kelas.length, totalTopikMaster: m.topik.length };
}

function waAdminImporPratinjau(token) {
  wajibAdmin_(token);
  var r = rencanaImpor_();
  var perKelas = {};
  r.mapelBaru.forEach(function(x) { perKelas[x.namaKelas] = (perKelas[x.namaKelas] || 0) + 1; });
  return {
    totalKelasMaster: r.totalKelasMaster,
    kelasBaru: r.kelasBaru.map(function(k) { return k.nama; }),
    kelasAda: r.kelasAda.map(function(k) { return k.nama + (k.aktif ? '' : ' (nonaktif)'); }),
    jumlahMapelBaru: r.mapelBaru.length,
    jumlahMapelAda: r.mapelAda,
    mapelBaruPerKelas: Object.keys(perKelas).map(function(k) { return { kelas: k, jumlah: perKelas[k] }; })
  };
}

function waAdminImporTerapkan(token) {
  var adm = wajibAdmin_(token);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  var r;
  try {
    r = rencanaImpor_();
    if (r.kelasBaru.length) {
      var shR = getSheet(CONFIG.SHEETS.ROMBEL);
      var awalR = shR.getLastRow() + 1;
      var barisR = r.kelasBaru.map(function(k) { return [k.idRombel, k.nama, '', 'Aktif']; });
      shR.getRange(awalR, 1, barisR.length, 4).setNumberFormat('@');
      shR.getRange(awalR, 1, barisR.length, 4).setValues(barisR);
    }
    if (r.mapelBaru.length) {
      var shM = getSheet(CONFIG.SHEETS.MAPEL);
      var awalM = shM.getLastRow() + 1;
      var barisM = r.mapelBaru.map(function(x) { return [x.idMapel, x.idRombel, x.nama, x.tutor, 'Aktif']; });
      shM.getRange(awalM, 1, barisM.length, 5).setNumberFormat('@');
      shM.getRange(awalM, 1, barisM.length, 5).setValues(barisM);
    }
  } finally {
    kunci.releaseLock();
  }
  catat_('Admin', adm.id, adm.nama, 'Impor dari SIM SETARA',
    r.kelasBaru.length + ' kelas baru, ' + r.mapelBaru.length + ' mapel baru (sudah ada: ' + r.kelasAda.length + ' kelas, ' + r.mapelAda + ' mapel)', 'OK');
  return { kelasBaru: r.kelasBaru.length, mapelBaru: r.mapelBaru.length, kelasAda: r.kelasAda.length, mapelAda: r.mapelAda };
}

// Dijalankan dari editor / menu sekali saja supaya pemilik menyetujui izin
// (kirim email untuk OTP + membuka file SIM SETARA). Tidak mengirim apa pun.
function menuSetujuiIzinPendaftaran() {
  var info = [];
  try {
    SpreadsheetApp.openById(IMPOR.MASTER_ID).getName();
    info.push('Akses ke SIM SETARA: OK');
  } catch (e) {
    info.push('Akses ke SIM SETARA GAGAL: ' + (e && e.message ? e.message : e));
  }
  var sisa = MailApp.getRemainingDailyQuota();
  info.push('Sisa kuota email hari ini: ' + sisa);
  pastikanSheetPendaftaran_();
  pastikanSheetAktivitas_();
  info.push('Tab Pendaftaran Rombel dan Log Aktivitas siap.');
  var teks = info.join('\n');
  try { SpreadsheetApp.getActiveSpreadsheet().toast(teks.replace(/\n/g, ' | '), 'Izin pendaftaran', 15); } catch (e) {}
  Logger.log(teks);
  return teks;
}


// ---------- impor siswa dari SIM SETARA (admin) ----------
// Membaca tab WARGA BELAJAR di spreadsheet SIM SETARA (hanya baca). Siswa yang belum ada di tab Siswa
// ditambahkan dengan Kode Akses, email, dan waktu daftar KOSONG; siswa melengkapinya lewat verifikasi OTP.
var SIMSETARA_ID = '1R3b9I0uv3n0qIQY-G11IEDp0TRzDXiHNy_fz8wmLJ7o';

function siswaRencana_() {
  var ss = SpreadsheetApp.openById(SIMSETARA_ID);
  function tab(n) {
    var sh = ss.getSheetByName(n);
    if (!sh) throw new Error('Tab tidak ada di SIM SETARA: ' + n);
    var v = sh.getDataRange().getValues();
    var h = v[0].map(function (x) { return String(x).trim(); });
    return v.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; });
  }
  var namaRombelSim = {};
  tab('ROMBEL').forEach(function (r) { namaRombelSim[String(r['ID ROMBEL']).trim()] = String(r['NAMA ROMBEL'] || '').trim(); });
  var rombelBm = [];
  getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function (r, i) {
    if (i === 0 || !String(r[0]).trim() || sTeks_(r[3]).trim() !== 'Aktif') return;
    rombelBm.push({ id: sTeks_(r[0]).trim(), nama: sTeks_(r[1]).trim(), slug: slugKelas_(sTeks_(r[1])) });
  });
  function cocokRombel(namaSim) {
    var s = slugKelas_(namaSim);
    if (!s) return null;
    var tepat = rombelBm.filter(function (x) { return x.slug === s; });
    if (tepat.length === 1) return tepat[0];
    var akhir = rombelBm.filter(function (x) { return x.slug.length > s.length && x.slug.slice(-s.length) === s; });
    return akhir.length === 1 ? akhir[0] : null;
  }
  var sudah = {};
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function (r, i) {
    if (i === 0 || !String(r[1]).trim()) return;
    sudah[normNama_(r[1]) + '|' + formatTanggalUntukBanding_(r[2])] = true;
  });
  var hasil = { baru: [], ada: 0, tanpaData: 0, takCocok: {}, total: 0 };
  var tglMap = {};
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function (r, i) { if (i === 0 || !String(r[1]).trim()) return; var kn = normNama_(r[1]); (tglMap[kn] = tglMap[kn] || []).push(formatTanggalUntukBanding_(r[2])); });
  tab('WARGA BELAJAR').forEach(function (r) {
    var nama = String(r['NAMA WB'] || '').trim().replace(/\s+/g, ' ');
    if (!nama) return;
    hasil.total++;
    var tgl = formatTanggalUntukBanding_(r['TANGGAL LAHIR']);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) { hasil.tanpaData++; return; }
    var kunci = normNama_(nama) + '|' + tgl;
    if (sudah[kunci] || tglDekat_(tglMap, nama, tgl)) { hasil.ada++; return; }
    var namaSim = namaRombelSim[String(r['ROMBEL'] || '').trim()] || '';
    var rb = cocokRombel(namaSim);
    if (!rb) { var kk = namaSim || '(tanpa rombel)'; hasil.takCocok[kk] = (hasil.takCocok[kk] || 0) + 1; return; }
    sudah[kunci] = true;
    (tglMap[normNama_(nama)] = tglMap[normNama_(nama)] || []).push(tgl);
    hasil.baru.push({ idRombel: rb.id, namaRombel: rb.nama, nama: nama, tgl: tgl });
  });
  return hasil;
}

function waAdminSiswaPratinjau(token) {
  wajibAdmin_(token);
  var r = siswaRencana_();
  return {
    totalSim: r.total, baru: r.baru.length, ada: r.ada, tanpaData: r.tanpaData, takCocok: r.takCocok,
    contoh: r.baru.slice(0, 5).map(function (x) { return x.nama + ' (' + x.namaRombel + ')'; })
  };
}

function waAdminSiswaTerapkan(token) {
  wajibAdmin_(token);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  try {
    var r = siswaRencana_();
    if (!r.baru.length) return { ditambah: 0 };
    var sheet = getSheet(CONFIG.SHEETS.SISWA);
    var b = sheet.getLastRow() + 1;
    var baris = r.baru.map(function (x) { return [x.idRombel, x.nama, x.tgl, '', '', '']; });
    var rg = sheet.getRange(b, 1, baris.length, 6);
    rg.setNumberFormat('@');
    rg.setValues(baris);
    catat_('Admin', '', 'Impor siswa', 'Impor siswa dari SIM SETARA', baris.length + ' siswa ditambahkan', 'OK');
    return { ditambah: baris.length };
  } finally {
    kunci.releaseLock();
  }
}


// Sumber kelas, mapel, dan pengampu sekarang SIM SETARA (tab ROMBEL, MAPEL, ENROLL MAPEL, TUTOR).
// Keluarannya sama dengan bacaMasterLama_ supaya rencanaImpor_ dan penerapannya tidak berubah.
function bacaMaster_() {
  var ss;
  try {
    ss = SpreadsheetApp.openById(SIMSETARA_ID);
  } catch (e) {
    throw new Error('Tidak bisa membuka spreadsheet SIM SETARA. Pastikan akun pemilik aplikasi punya akses ke file itu, lalu setujui izin yang diminta. (' + (e && e.message ? e.message : e) + ')');
  }
  function tab(n) {
    var sh = ss.getSheetByName(n);
    if (!sh) throw new Error('Tab "' + n + '" tidak ditemukan di SIM SETARA.');
    var v = sh.getDataRange().getValues();
    var h = v[0].map(function (x) { return String(x).trim(); });
    return v.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; });
  }
  function aktif(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }
  var namaTutor = {};
  tab('TUTOR').forEach(function (r) { namaTutor[String(r['ID TUTOR']).trim()] = String(r['NAMA TUTOR'] || '').trim(); });
  var mapelList = tab('MAPEL').map(function (r) {
    return { kode: String(r['KODE MAPEL']).trim(), nama: String(r['NAMA MAPEL'] || '').trim(), jenjang: String(r['JENJANG'] || '').toUpperCase().split(/[^A-Z]+/).filter(String) };
  }).filter(function (x) { return x.kode && x.nama; });
  var namaMapel = {};
  mapelList.forEach(function (x) { namaMapel[x.kode] = x.nama; });
  var pengampu = {};
  tab('ENROLL MAPEL').forEach(function (r) {
    if (!aktif(r['AKTIF'])) return;
    var st = String(r['STATUS'] || '').trim();
    if (st && st !== 'Disetujui') return;
    var t = namaTutor[String(r['TUTOR']).trim()];
    if (t) pengampu[String(r['ROMBEL']).trim() + '|' + String(r['MAPEL']).trim()] = t;
  });
  var kelas = [], topik = [], tutor = {};
  tab('ROMBEL').forEach(function (r) {
    var id = String(r['ID ROMBEL']).trim(), nama = String(r['NAMA ROMBEL'] || '').trim();
    if (!id || !nama || !aktif(r['AKTIF'])) return;
    kelas.push({ courseId: id, nama: nama });
    var paket = String(r['PROGRAM'] || '').toUpperCase().replace(/[^A-Z]/g, '').replace(/^PKT/, '').charAt(0);
    mapelList.forEach(function (x) {
      if (paket && x.jenjang.indexOf(paket) < 0) return;
      topik.push({ courseId: id, kelas: nama, kode: x.kode, nama: x.nama });
      var t = pengampu[id + '|' + x.kode];
      if (t) tutor[id + '|' + normNama_(x.nama)] = t;
    });
  });
  return { kelas: kelas, topik: topik, tutor: tutor };
}


// Kunci pencocokan nama: abaikan awalan 'Kelas', tanda kurung, tanda baca, huruf besar/kecil.
function kunciKelas_(n) {
  return normNama_(n).replace(/^kelas\s+/, '').replace(/\s+/g, '');
}
function kunciMapel_(n) {
  return normNama_(n).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}


// Nama sama dan tanggal lahir selisih paling banyak 1 hari (akibat zona waktu / koreksi) dianggap siswa yang sama.
function tglDekat_(tglMap, nama, tgl) {
  var daftar = tglMap[normNama_(nama)] || [], t = Date.parse(tgl);
  for (var i = 0; i < daftar.length; i++) {
    var d = Date.parse(daftar[i]);
    if (!isNaN(t) && !isNaN(d) && Math.abs(t - d) <= 86400000 * 1.01) return true;
  }
  return false;
}

// Satukan baris siswa ganda yang namanya sama, rombel sama, tanggal lahir selisih 1 hari:
// baris lama dipertahankan (riwayat/kode akses aman), tanggal lahirnya disamakan dengan baris yang lebih baru (sumber: SIM SETARA), baris baru dihapus.
function satukanSiswaGanda() {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    var sh = getSheet(CONFIG.SHEETS.SISWA), ss = sh.getParent();
    var v = sh.getDataRange().getValues(), hapus = [], ubah = [];
    var dipakai = {};
    for (var i = 1; i < v.length; i++) {
      if (!String(v[i][1]).trim() || dipakai[i]) continue;
      for (var j = i + 1; j < v.length; j++) {
        if (dipakai[j] || !String(v[j][1]).trim()) continue;
        if (sTeks_(v[i][0]).trim() !== sTeks_(v[j][0]).trim()) continue;
        if (normNama_(v[i][1]) !== normNama_(v[j][1])) continue;
        var a = formatTanggalUntukBanding_(v[i][2]), b = formatTanggalUntukBanding_(v[j][2]);
        var sel = Math.abs(Date.parse(a) - Date.parse(b));
        if (a === b || sel <= 86400000 * 1.01) {
          ubah.push({ baris: i + 1, tgl: b });
          hapus.push(j + 1); dipakai[j] = true; dipakai[i] = true;
          break;
        }
      }
    }
    if (!hapus.length) return 0;
    ss.copy('Cadangan sebelum satukan siswa ganda ' + waktuSekarang_());
    ubah.forEach(function(u) { var c = sh.getRange(u.baris, 3); c.setNumberFormat('@'); c.setValue(u.tgl); });
    hapus.sort(function(x, y) { return y - x; }).forEach(function(b) { sh.deleteRow(b); });
    catat_('Sistem', '', 'Sistem', 'Satukan siswa ganda', hapus.length + ' baris ganda disatukan', 'OK');
    return hapus.length;
  } finally {
    kunci.releaseLock();
  }
}


function pindahKurikulumKeMapel_(dari, ke) {
  var ss = getSheet(CONFIG.SHEETS.SISWA).getParent();
  var tgt = ss.getSheetByName('Kurikulum');
  var v = tgt.getDataRange().getValues();
  var adaTujuan = 0, idx = [];
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][0]).trim();
    if (id === ke) adaTujuan++;
    if (id === dari) idx.push(i);
  }
  if (adaTujuan) throw new Error('Mapel tujuan sudah punya ' + adaTujuan + ' baris kurikulum, dibatalkan.');
  if (!idx.length) return 0;
  ss.copy('Cadangan sebelum pindah kurikulum ' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH.mm'));
  idx.forEach(function (i) { tgt.getRange(i + 1, 1).setValue(ke); });
  SpreadsheetApp.flush();
  return idx.length;
}

function pindahKurikulumInformatikaKePai() {
  var n = pindahKurikulumKeMapel_('MP-A08-KELASA4', 'MP-A01-KELASA4');
  Logger.log('Dipindahkan: ' + n + ' baris');
  return n;
}
