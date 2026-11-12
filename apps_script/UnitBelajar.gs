// ============================================================================
// UNIT BELAJAR (v1.60.0, Tahap 1)
// - Unit belajar = titik/lokasi belajar (Unit 1, Unit 2, ...). Dipasang pada SISWA (ID WB), bukan rombel:
//   satu rombel Dapodik bisa berisi siswa dari beberapa unit. Rombel, materi, soal, keuangan tetap terpusat.
// - Layanan = label klasifikasi tambahan: Reguler (Setara Reguler) atau Flexi (Setara Flexi).
// - Pengaturan (daftar unit, label siswa, pindah unit) hanya Admin. Superadmin melihat halaman ini (hanya-lihat,
//   sama seperti di menu lain); peran lain hanya melihat label di daftar siswa.
// - Data di tab sendiri (WARGA BELAJAR tidak diubah): UNIT BELAJAR, UNIT SISWA, RIWAYAT UNIT SISWA.
//   Setiap perubahan unit/layanan dicatat dengan waktunya (dasar laporan per unit di tahap berikutnya).
// - Siswa tanpa label = perilaku aplikasi sama seperti sebelumnya.
// ============================================================================
var UB = {
  TAB_UNIT: 'UNIT BELAJAR', HDR_UNIT: ['ID UNIT', 'NAMA UNIT', 'ALAMAT', 'KETERANGAN', 'AKTIF', 'DIUBAH OLEH', 'DIUBAH PADA', 'KOORDINATOR'],
  TAB_SISWA: 'UNIT SISWA', HDR_SISWA: ['ID WB', 'UNIT', 'LAYANAN', 'DIUBAH OLEH', 'DIUBAH PADA'],
  TAB_RIW: 'RIWAYAT UNIT SISWA', HDR_RIW: ['WAKTU', 'ID WB', 'NAMA WB', 'UNIT LAMA', 'UNIT BARU', 'LAYANAN LAMA', 'LAYANAN BARU', 'OLEH', 'CATATAN'],
  LAYANAN: ['Reguler', 'Flexi'],
  PERAN_LIHAT: ['Admin', 'Superadmin'], PERAN_UBAH: ['Admin'],
  MAKS_SEKALI: 500,
  // v1.61.0 (Tahap 2): Koordinator Unit memantau siswa di unitnya (hanya lihat; pemetaan & persetujuan tetap KS)
  PERAN_KOORD: 'Koordinator Unit', PERAN_PANTAU_SEMUA: ['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum'], CACHE_DETIK: 600
};
var UB_MEMO_ = {};

function ubTeks_(v) { return "'" + String(v === undefined || v === null ? '' : v); }
function ubWajib_(p, ubah) { if ((ubah ? UB.PERAN_UBAH : UB.PERAN_LIHAT).indexOf(p.peran) < 0) throw new Error('Pengaturan unit belajar hanya oleh Admin.'); }
// 'flexi' / 'Setara Flexi' -> 'Flexi'; '' -> ''; selain itu galat
function ubNormLayanan_(x) {
  var s = String(x || '').trim().toLowerCase().replace(/^setara\s+/, '');
  if (!s) return '';
  for (var i = 0; i < UB.LAYANAN.length; i++) if (UB.LAYANAN[i].toLowerCase() === s) return UB.LAYANAN[i];
  throw new Error('Layanan harus Reguler atau Flexi.');
}
function ubNormNama_(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

// ---------- baca ----------
function ubTabUnit_() {
  var t = absBaca_(UB.TAB_UNIT, UB.HDR_UNIT);
  var kurang = UB.HDR_UNIT.filter(function(h) { return absCol_(t, h) < 0; });
  if (kurang.length) {
    var c = t.v[0].length;
    t.sh.getRange(1, c + 1, 1, kurang.length).setValues([kurang]).setFontWeight('bold');
    t = absBaca_(UB.TAB_UNIT, UB.HDR_UNIT);
  }
  return t;
}
function ubDaftarId_(s) { return String(s || '').split(',').map(function(x) { return x.trim(); }).filter(String); }
function ubUnit_() {
  if (UB_MEMO_.unit) return UB_MEMO_.unit;
  var t = ubTabUnit_(), out = [];
  for (var i = 1; i < t.v.length; i++) {
    var id = sTeks_(absNilai_(t, t.v[i], 'ID UNIT')).trim();
    if (!id) continue;
    out.push({ baris: i + 1, id: id, nama: sTeks_(absNilai_(t, t.v[i], 'NAMA UNIT')).trim(), alamat: sTeks_(absNilai_(t, t.v[i], 'ALAMAT')).trim(),
      ket: sTeks_(absNilai_(t, t.v[i], 'KETERANGAN')).trim(), aktif: absBenar_(absNilai_(t, t.v[i], 'AKTIF')),
      koordinator: ubDaftarId_(absNilai_(t, t.v[i], 'KOORDINATOR')) });
  }
  out.sort(function(a, b) { return a.nama.localeCompare(b.nama, 'id', { numeric: true }); });
  return (UB_MEMO_.unit = out);
}
function ubPetaUnit_() { var o = {}; ubUnit_().forEach(function(u) { o[u.id] = u; }); return o; }
// {idWb: {unit, layanan, baris}}
function ubPetaSiswa_() {
  if (UB_MEMO_.siswa) return UB_MEMO_.siswa;
  var t = absBaca_(UB.TAB_SISWA, UB.HDR_SISWA), o = {};
  for (var i = 1; i < t.v.length; i++) {
    var id = sTeks_(absNilai_(t, t.v[i], 'ID WB')).trim();
    if (!id) continue;
    o[id] = { unit: sTeks_(absNilai_(t, t.v[i], 'UNIT')).trim(), layanan: sTeks_(absNilai_(t, t.v[i], 'LAYANAN')).trim(), baris: i + 1 };
  }
  return (UB_MEMO_.siswa = o);
}
// Label siap tampil untuk satu siswa: {unit: idUnit, namaUnit, layanan}. Dipakai tahap berikutnya.
function ubLabel_(idWb) {
  var s = ubPetaSiswa_()[String(idWb)];
  if (!s) return { unit: '', namaUnit: '', layanan: '' };
  var u = ubPetaUnit_()[s.unit];
  return { unit: s.unit, namaUnit: u ? u.nama : '', layanan: s.layanan };
}

// Rencana perubahan satu siswa. unitBaru/layananBaru: null = tidak diubah, '' = kosongkan.
// Mengembalikan null bila tidak ada perubahan.
function ubRencana_(lama, unitBaru, layananBaru) {
  lama = lama || { unit: '', layanan: '' };
  var u = unitBaru === null || unitBaru === undefined ? lama.unit : String(unitBaru);
  var l = layananBaru === null || layananBaru === undefined ? lama.layanan : String(layananBaru);
  if (u === lama.unit && l === lama.layanan) return null;
  return { unitLama: lama.unit, unitBaru: u, layananLama: lama.layanan, layananBaru: l };
}

// ---------- API: data halaman ----------
function waStafUnitData(token) {
  var p = stafDariToken_(token);
  ubWajib_(p);
  var unit = ubUnit_(), lab = ubPetaSiswa_(), hit = {}, hitL = { Reguler: 0, Flexi: 0, '': 0 };
  var siswa = keuWbSemua_().filter(function(w) { return w.aktif; }).map(function(w) {
    var s = lab[w.id] || { unit: '', layanan: '' };
    hit[s.unit] = (hit[s.unit] || 0) + 1;
    hitL[s.layanan] = (hitL[s.layanan] || 0) + 1;
    return { id: w.id, nisn: w.nisn, nama: w.nama, idRombel: w.idRombel, namaRombel: w.namaRombel, program: w.program, unit: s.unit, layanan: s.layanan };
  });
  siswa.sort(function(a, b) { return (a.namaRombel + '|' + a.nama).localeCompare(b.namaRombel + '|' + b.nama); });
  var calon = ubCalonKoord_(), namaK = {};
  calon.forEach(function(c) { namaK[c.id] = c.nama; });
  return {
    unit: unit.map(function(u) {
      return { id: u.id, nama: u.nama, alamat: u.alamat, ket: u.ket, aktif: u.aktif, jumlah: hit[u.id] || 0,
        koordinator: u.koordinator, namaKoordinator: u.koordinator.map(function(k) { return namaK[k] || k; }) };
    }),
    calonKoordinator: calon,
    siswa: siswa, layanan: UB.LAYANAN,
    ringkas: { total: siswa.length, tanpaUnit: hit[''] || 0, reguler: hitL.Reguler || 0, flexi: hitL.Flexi || 0, tanpaLayanan: hitL[''] || 0 }
  };
}

// d: {id?, nama, alamat, ket, aktif}
function waStafUnitSimpan(token, d) {
  var p = stafDariToken_(token);
  ubWajib_(p, true);
  d = d || {};
  var nama = ubNormNama_(d.nama).slice(0, 60);
  if (nama.length < 2) throw new Error('Isi nama unit.');
  var aktif = d.aktif !== false;
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    UB_MEMO_ = {};
    var semua = ubUnit_();
    var ganda = semua.filter(function(u) { return u.nama.toLowerCase() === nama.toLowerCase() && u.id !== String(d.id || ''); });
    if (ganda.length) throw new Error('Nama unit "' + nama + '" sudah ada.');
    var t = ubTabUnit_();
    var calon = {};
    ubCalonKoord_().forEach(function(c) { calon[c.id] = true; });
    var koord = (Array.isArray(d.koordinator) ? d.koordinator : []).map(String).filter(function(k, i, a) { return calon[k] && a.indexOf(k) === i; });
    var isi = { 'KOORDINATOR': koord.join(','), 'NAMA UNIT': nama, 'ALAMAT': ubNormNama_(d.alamat).slice(0, 200), 'KETERANGAN': String(d.ket || '').trim().slice(0, 300),
      'AKTIF': aktif ? 'Ya' : 'Tidak', 'DIUBAH OLEH': p.nama, 'DIUBAH PADA': absWaktu_() };
    var id = String(d.id || '');
    if (id) {
      var u = semua.filter(function(x) { return x.id === id; })[0];
      if (!u) throw new Error('Unit tidak ditemukan.');
      if (!aktif && u.aktif) {
        var lab = ubPetaSiswa_(), n = 0;
        Object.keys(lab).forEach(function(k) { if (lab[k].unit === id) n++; });
        if (n) throw new Error('Masih ada ' + n + ' siswa di ' + u.nama + '. Pindahkan dulu sebelum menonaktifkan unit.');
      }
      var baris = absBaris_(t, isi);
      Object.keys(isi).forEach(function(k) { var c = absCol_(t, k); if (c >= 0) t.sh.getRange(u.baris, c + 1).setValue(baris[c]); });
    } else {
      id = 'UNIT-' + absId_().toUpperCase();
      isi['ID UNIT'] = id;
      t.sh.appendRow(absBaris_(t, isi));
    }
    UB_MEMO_ = {};
  } finally { kunci.releaseLock(); }
  catat_(p.peran, '', p.nama, 'Unit belajar', (d.id ? 'Ubah ' : 'Tambah ') + nama + (aktif ? '' : ' (nonaktif)'), 'OK');
  return { sukses: true, id: id };
}

// Pasang/pindah label banyak siswa sekaligus.
// d: {ids: [idWb], unit: idUnit | '' (kosongkan) | null (tidak diubah), layanan: 'Reguler'|'Flexi'|'' | null, catatan}
function waStafUnitTetapkan(token, d) {
  var p = stafDariToken_(token);
  ubWajib_(p, true);
  d = d || {};
  var ids = (Array.isArray(d.ids) ? d.ids : []).map(function(x) { return String(x).trim(); }).filter(String);
  if (!ids.length) throw new Error('Pilih minimal satu siswa.');
  if (ids.length > UB.MAKS_SEKALI) throw new Error('Maksimal ' + UB.MAKS_SEKALI + ' siswa sekali simpan.');
  var unitBaru = d.unit === null || d.unit === undefined ? null : String(d.unit);
  var layBaru = d.layanan === null || d.layanan === undefined ? null : ubNormLayanan_(d.layanan);
  if (unitBaru === null && layBaru === null) throw new Error('Pilih unit atau layanan yang akan diterapkan.');
  var catatan = String(d.catatan || '').trim().slice(0, 200);
  if (unitBaru) {
    var u = ubPetaUnit_()[unitBaru];
    if (!u) throw new Error('Unit tidak ditemukan.');
    if (!u.aktif) throw new Error(u.nama + ' sedang nonaktif.');
  }
  var hasil = ubTulis_(p, ids.map(function(id) { return { id: id, unit: unitBaru, layanan: layBaru }; }), catatan);
  catat_(p.peran, '', p.nama, 'Label unit siswa', hasil.diubah + ' diubah, ' + hasil.sama + ' sama, ' + hasil.lewat.length + ' dilewati', 'OK');
  return hasil;
}

// Tulis label banyak siswa (dipakai atur massal & impor). item: [{id, unit, layanan}] (null = tidak diubah).
function ubTulis_(p, item, catatan) {
  var hasil = { diubah: 0, sama: 0, lewat: [] };
  var kunci = kmKunciUnik_();
  kunci.waitLock(30000);
  try {
    UB_MEMO_ = {};
    var wb = {};
    keuWbSemua_().forEach(function(w) { wb[w.id] = w; });
    var lab = ubPetaSiswa_(), t = absBaca_(UB.TAB_SISWA, UB.HDR_SISWA), waktu = absWaktu_();
    var cU = absCol_(t, 'UNIT'), cL = absCol_(t, 'LAYANAN'), cO = absCol_(t, 'DIUBAH OLEH'), cP = absCol_(t, 'DIUBAH PADA');
    var baru = [], riw = [], ubahBaris = [];
    item.forEach(function(it) {
      var id = String(it.id);
      if (!wb[id]) { hasil.lewat.push({ id: id, alasan: 'siswa tidak ditemukan' }); return; }
      var r = ubRencana_(lab[id], it.unit, it.layanan);
      if (!r) { hasil.sama++; return; }
      if (lab[id] && lab[id].baris) ubahBaris.push({ baris: lab[id].baris, r: r });
      else if (lab[id] && lab[id].baru) { lab[id].baru[cU] = r.unitBaru; lab[id].baru[cL] = r.layananBaru; }
      else { var rowB = absBaris_(t, { 'ID WB': ubTeks_(id), 'UNIT': r.unitBaru, 'LAYANAN': r.layananBaru, 'DIUBAH OLEH': p.nama, 'DIUBAH PADA': waktu }); baru.push(rowB); lab[id] = { baru: rowB }; }
      riw.push([waktu, ubTeks_(id), wb[id].nama, r.unitLama, r.unitBaru, r.layananLama, r.layananBaru, p.nama, String(catatan || '')]);
      lab[id].unit = r.unitBaru; lab[id].layanan = r.layananBaru;
      hasil.diubah++;
    });
    ubahBaris.forEach(function(x) {
      var row = t.sh.getRange(x.baris, 1, 1, t.v[0].length).getValues()[0];
      row[cU] = x.r.unitBaru; row[cL] = x.r.layananBaru; row[cO] = p.nama; row[cP] = waktu;
      row[absCol_(t, 'ID WB')] = ubTeks_(row[absCol_(t, 'ID WB')]);
      t.sh.getRange(x.baris, 1, 1, row.length).setValues([row]);
    });
    if (baru.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, baru.length, baru[0].length).setValues(baru);
    if (riw.length) {
      var tr = absBaca_(UB.TAB_RIW, UB.HDR_RIW);
      tr.sh.getRange(tr.sh.getLastRow() + 1, 1, riw.length, riw[0].length).setValues(riw);
    }
    UB_MEMO_ = {};
  } finally { kunci.releaseLock(); }
  return hasil;
}

// Riwayat perubahan unit/layanan satu siswa (terbaru dulu).
function waStafUnitRiwayat(token, idWb) {
  var p = stafDariToken_(token);
  ubWajib_(p);
  var t = absBaca_(UB.TAB_RIW, UB.HDR_RIW), peta = ubPetaUnit_(), out = [];
  var nm = function(id) { return id ? (peta[id] ? peta[id].nama : id) : '-'; };
  for (var i = 1; i < t.v.length; i++) {
    if (sTeks_(absNilai_(t, t.v[i], 'ID WB')).trim() !== String(idWb)) continue;
    var w = absNilai_(t, t.v[i], 'WAKTU');
    out.push({
      waktu: w instanceof Date ? Utilities.formatDate(w, absTz_(), 'yyyy-MM-dd HH:mm') : String(w).slice(0, 16),
      unitLama: nm(sTeks_(absNilai_(t, t.v[i], 'UNIT LAMA')).trim()), unitBaru: nm(sTeks_(absNilai_(t, t.v[i], 'UNIT BARU')).trim()),
      layananLama: sTeks_(absNilai_(t, t.v[i], 'LAYANAN LAMA')).trim() || '-', layananBaru: sTeks_(absNilai_(t, t.v[i], 'LAYANAN BARU')).trim() || '-',
      oleh: sTeks_(absNilai_(t, t.v[i], 'OLEH')), catatan: sTeks_(absNilai_(t, t.v[i], 'CATATAN'))
    });
  }
  return out.reverse();
}

// ---------- label di daftar Siswa per Rombel (baca saja, semua peran yang punya menu itu) ----------
// rom: hasil waStafRombelSiswa ([{idRombel (e-Learning), siswa:[{nama}]}]). Siswa dicocokkan ke ID WB lewat
// rombel SIM yang terpetakan + nama. Bila belum ada label sama sekali, tidak ada yang dikerjakan.
function ubTempelRombelSiswa_(rom) {
  var lab = ubPetaSiswa_();
  if (!Object.keys(lab).length) return rom;
  var peta = nilPetaBm_(), keSim = {};
  Object.keys(peta.rombel).forEach(function(simR) { Object.keys(peta.rombel[simR]).forEach(function(elR) { (keSim[elR] = keSim[elR] || []).push(simR); }); });
  var wbR = {};
  keuWbSemua_().forEach(function(w) { if (w.aktif) (wbR[w.idRombel] = wbR[w.idRombel] || []).push(w); });
  var unit = ubPetaUnit_();
  rom.forEach(function(r) {
    var wbs = [];
    (keSim[String(r.idRombel)] || []).forEach(function(s) { wbs = wbs.concat(wbR[s] || []); });
    if (!wbs.length) return;
    r.siswa.forEach(function(s) {
      var w = nilCocokWb_(wbs, '', s.nama), l = w && lab[w.id];
      if (!l) return;
      s.unit = l.unit && unit[l.unit] ? unit[l.unit].nama : '';
      s.layanan = l.layanan;
    });
  });
  return rom;
}

// ============================================================================
// TAHAP 2 (v1.61.0): KOORDINATOR UNIT
// - Peran bawaan baru "Koordinator Unit" (di bawah KS). Ditunjuk Admin per unit (kolom KOORDINATOR, bisa
//   lebih dari satu orang, satu orang bisa beberapa unit). Hanya MELIHAT siswa unitnya: kehadiran gabungan per
//   mapel (semester berjalan) dan sisa tagihan. Tidak memetakan tutor dan tidak menyetujui apa pun.
// - Admin, Superadmin, KS, Koordinator Kurikulum dapat membuka pantauan semua unit.
// - Notifikasi: pelanggaran berat ujian siswa unitnya, dan ringkasan mingguan (Senin).
// ============================================================================
function ubCalonKoord_() {
  return bacaPengguna_().filter(function(u) { return u.peran === UB.PERAN_KOORD && u.status === 'Aktif'; })
    .map(function(u) { return { id: u.id, nama: u.nama + (u.peranKustom ? ' (' + u.peranKustom + ')' : '') }; })
    .sort(function(a, b) { return a.nama.localeCompare(b.nama); });
}
// Unit yang boleh dipantau pengguna ini (aktif saja).
function ubUnitSaya_(p) {
  var semua = ubUnit_().filter(function(u) { return u.aktif; });
  if (UB.PERAN_PANTAU_SEMUA.indexOf(p.peran) >= 0) return semua;
  if (p.peran === UB.PERAN_KOORD) return semua.filter(function(u) { return u.koordinator.indexOf(String(p.id)) >= 0; });
  return [];
}
// ID pengguna koordinator untuk siswa (ID WB).
function ubKoordWb_(idWb) {
  var s = ubPetaSiswa_()[String(idWb)];
  var u = s && s.unit ? ubPetaUnit_()[s.unit] : null;
  return u && u.aktif ? u.koordinator.slice() : [];
}

// Ringkas satu siswa: urutan masalah (kurang hadir, lalu tunggakan lewat tempo).
function ubSkor_(x) { return (x.kurang.length ? 2 : 0) + (x.lewat > 0 ? 1 : 0); }

// Data pantauan satu unit (cache 10 menit).
function ubPantau_(idUnit, paksa) {
  var c = CacheService.getScriptCache(), ck = 'ubp|' + idUnit;
  if (!paksa) { try { var l = c.get(ck); if (l) return JSON.parse(l); } catch (e) {} }
  var u = ubPetaUnit_()[idUnit];
  if (!u) throw new Error('Unit tidak ditemukan.');
  var lab = ubPetaSiswa_(), wb = keuWbSemua_().filter(function(w) { return w.aktif && lab[w.id] && lab[w.id].unit === idUnit; });
  var per = nilPeriode_(), at = nilAturan_(), byR = {}, data = {}, hari = absHariIni_();
  wb.forEach(function(w) {
    (byR[w.idRombel] = byR[w.idRombel] || []).push(w);
    data[w.id] = { id: w.id, nama: w.nama, nisn: w.nisn, namaRombel: w.namaRombel, layanan: lab[w.id].layanan, jml: 0, n: 0, kurang: [], sisa: 0, lewat: 0 };
  });
  // kehadiran gabungan per rombel|mapel aktif (sama dengan syarat ujian)
  var peta = nilPetaBm_(), nmMapel = honNamaMapel_();
  Object.keys(peta.aktif).forEach(function(key) {
    var idR = key.split('|')[0];
    if (!byR[idR]) return;
    var hk = nilHadirKelas_(per, key), kode = key.split('|')[1];
    byR[idR].forEach(function(w) {
      var g = hk.gabung(w.id);
      if (!g.total) return;
      var x = data[w.id];
      x.jml += g.persen; x.n++;
      if (g.persen < at.syaratHadir) x.kurang.push({ mapel: nmMapel[kode] || kode, persen: g.persen });
    });
  });
  // tagihan: sisa & yang sudah lewat jatuh tempo
  if (wb.length) {
    var pb = keuBayarPeta_();
    keuTagSemua_().data.forEach(function(tag) {
      if (!tag.aktif) return;
      keuRinci_(tag, wb, pb).forEach(function(r) {
        var x = data[r.idWb];
        if (!x || r.sisa <= 0) return;
        x.sisa += r.sisa;
        if (tag.jatuhTempo && String(tag.jatuhTempo) < hari) x.lewat += r.sisa;
      });
    });
  }
  var siswa = Object.keys(data).map(function(id) {
    var x = data[id];
    x.kurang.sort(function(a, b) { return a.persen - b.persen; });
    return { id: x.id, nama: x.nama, nisn: x.nisn, namaRombel: x.namaRombel, layanan: x.layanan, hadir: x.n ? Math.round(x.jml / x.n) : null,
      kurang: x.kurang, sisa: x.sisa, lewat: x.lewat };
  });
  siswa.sort(function(a, b) { return (ubSkor_(b) - ubSkor_(a)) || (a.namaRombel + a.nama).localeCompare(b.namaRombel + b.nama); });
  var ringkas = { siswa: siswa.length, reguler: 0, flexi: 0, kurangHadir: 0, menunggak: 0, lewatTempo: 0, sisa: 0, nilaiLewat: 0 };
  siswa.forEach(function(x) {
    if (x.layanan === 'Reguler') ringkas.reguler++;
    if (x.layanan === 'Flexi') ringkas.flexi++;
    if (x.kurang.length) ringkas.kurangHadir++;
    if (x.sisa > 0) ringkas.menunggak++;
    if (x.lewat > 0) ringkas.lewatTempo++;
    ringkas.sisa += x.sisa; ringkas.nilaiLewat += x.lewat;
  });
  var rombel = {};
  siswa.forEach(function(x) { rombel[x.namaRombel] = (rombel[x.namaRombel] || 0) + 1; });
  var out = { unit: { id: u.id, nama: u.nama, alamat: u.alamat }, syaratHadir: at.syaratHadir, periode: per.tahun + ' ' + per.semester,
    ringkas: ringkas, rombel: Object.keys(rombel).sort().map(function(n) { return { nama: n, jumlah: rombel[n] }; }), siswa: siswa, waktu: absWaktu_() };
  try { var js = JSON.stringify(out); if (js.length < 95000) c.put(ck, js, UB.CACHE_DETIK); } catch (e2) {}
  return out;
}

// API: pantauan unit. idUnit kosong = unit pertama yang boleh.
function waStafPantauUnit(token, idUnit, paksa) {
  var p = stafDariToken_(token);
  var boleh = ubUnitSaya_(p);
  if (UB.PERAN_PANTAU_SEMUA.indexOf(p.peran) < 0 && p.peran !== UB.PERAN_KOORD) throw new Error('Pantauan unit untuk Koordinator Unit dan pimpinan.');
  var daftarU = boleh.map(function(u) { return { id: u.id, nama: u.nama }; });
  if (!boleh.length) return { daftar: [], data: null, pesan: p.peran === UB.PERAN_KOORD ? 'Anda belum ditunjuk sebagai koordinator unit mana pun. Hubungi Admin.' : 'Belum ada unit belajar aktif.' };
  var id = String(idUnit || '') || boleh[0].id;
  if (!boleh.some(function(u) { return u.id === id; })) throw new Error('Anda tidak memegang unit ini.');
  return { daftar: daftarU, data: ubPantau_(id, paksa === true) };
}

// Kartu beranda Koordinator Unit.
function ubKartuBeranda_(p) {
  var boleh = ubUnitSaya_(p);
  if (!boleh.length) return { judul: 'Unit saya', ikon: 'info', menu: 'pantauanUnit', item: [], kosong: 'Anda belum ditunjuk sebagai koordinator unit. Hubungi Admin.' };
  var item = [], tot = 0, masalah = 0;
  boleh.forEach(function(u) {
    var d = ubPantau_(u.id), r = d.ringkas;
    tot += r.siswa;
    masalah += r.kurangHadir;
    item.push({ t: u.nama, s: r.siswa + ' siswa · Reguler ' + r.reguler + ' · Flexi ' + r.flexi, n: r.kurangHadir ? r.kurangHadir + ' kurang hadir' : 'Hadir baik', w: r.kurangHadir ? 'merah' : 'hijau' });
    if (r.lewatTempo) item.push({ t: 'Tunggakan lewat jatuh tempo · ' + u.nama, s: r.lewatTempo + ' siswa', n: honRp_(r.nilaiLewat), w: 'kuning' });
  });
  return { judul: 'Unit saya', ikon: 'peringatan', menu: 'pantauanUnit', ringkas: tot + ' siswa', item: item.slice(0, 8), kosong: '' };
}

// Notifikasi pelanggaran berat ujian ke koordinator unit siswa. idRombel = rombel e-Learning.
function ubNotifPelanggaran_(idRombel, nama, j, kunciKe) {
  var w = typeof sbWbSiswa_ === 'function' ? sbWbSiswa_(idRombel, nama) : null;
  if (!w || !w.id) return;
  var staf = ubKoordWb_(w.id);
  if (!staf.length) return;
  var m = j ? (ujtPetaMapel_()[String(j.idMapel)] || {}) : {};
  npKirim_('unit_pelanggaran', { judul: 'Pelanggaran berat: ' + nama, isi: nama + ' (' + (m.namaRombel || idRombel) + ') terkunci ' + kunciKe + ' kali saat ujian ' +
    (m.namaMapel || '') + '. Kasus ditinjau Kepala Sekolah; mohon tindak lanjut pembinaan di unit.', aksi: '', staf: staf, ref: 'ubpl|' + w.id + '|' + (j ? j.idUjian : '') });
}

// Ringkasan mingguan (dipanggil npMingguan_, Senin).
function ubMingguan_(hari) {
  ubUnit_().filter(function(u) { return u.aktif && u.koordinator.length; }).forEach(function(u) {
    try {
      var r = ubPantau_(u.id, true).ringkas;
      if (!r.siswa) return;
      npKirim_('unit_mingguan', { judul: 'Ringkasan ' + u.nama, isi: r.siswa + ' siswa · ' + r.kurangHadir + ' kehadiran di bawah syarat · ' + r.lewatTempo +
        ' tunggakan lewat jatuh tempo (' + honRp_(r.nilaiLewat) + '). Buka Pantauan Unit untuk rinciannya.', aksi: 'pantauan_unit', staf: u.koordinator, ref: 'ubm|' + u.id + '|' + hari });
    } catch (e) {}
  });
}

// ============================================================================
// IMPOR LABEL DARI EXCEL (v1.61.0)
// Admin mengunduh templat xlsx (semua siswa aktif, atau hanya yang belum berlabel, opsional satu rombel),
// mengisi kolom UNIT dan LAYANAN (sel kuning), lalu mengunggahnya: pratinjau -> terapkan.
// Sel kosong = tidak diubah; tanda "-" = kosongkan. Unit ditulis dengan nama unit (tidak peka huruf besar/kecil).
// ============================================================================
var UBI = { LEMBAR: 'LABEL UNIT', LEMBAR_REF: 'PILIHAN', WARNA: 'FF0F766E', MAKS_BYTE: 4 * 1024 * 1024, CACHE_DETIK: 1200 };

// q: {hanyaKosong: bool, idRombel}
function waStafUnitTemplat(token, q) {
  var p = stafDariToken_(token);
  ubWajib_(p, true);
  q = q || {};
  var lab = ubPetaSiswa_(), unit = ubPetaUnit_();
  var wb = keuWbSemua_().filter(function(w) {
    if (!w.aktif) return false;
    if (q.idRombel && w.idRombel !== String(q.idRombel)) return false;
    var l = lab[w.id];
    return !(q.hanyaKosong && l && l.unit && l.layanan);
  }).sort(function(a, b) { return (a.namaRombel + '|' + a.nama).localeCompare(b.namaRombel + '|' + b.nama); });
  if (!wb.length) throw new Error(q.hanyaKosong ? 'Semua siswa sudah punya unit dan layanan.' : 'Tidak ada siswa aktif.');
  var kolom = ['NO', 'ID WB', 'NISN', 'NAMA', 'ROMBEL', 'UNIT', 'LAYANAN'];
  var isiJudul = [{ v: 'LABEL UNIT BELAJAR & LAYANAN SISWA', s: 1 }];
  for (var i = 1; i < kolom.length; i++) isiJudul.push({ v: '', s: 1 });
  var aktif = ubUnit_().filter(function(u) { return u.aktif; }).map(function(u) { return u.nama; });
  var b = [
    isiJudul,
    [{ v: 'Diunduh', s: 2 }, { v: absWaktu_() + ' oleh ' + p.nama }],
    [{ v: 'Unit tersedia', s: 2 }, { v: aktif.join(', ') || '(belum ada unit aktif)' }],
    [{ v: 'Layanan', s: 2 }, { v: 'Reguler atau Flexi' }],
    [{ v: 'Isi kolom UNIT dengan nama unit persis seperti di atas, LAYANAN dengan Reguler atau Flexi. Daftar lengkap ada di lembar PILIHAN.', s: 6 }],
    [{ v: 'Sel kosong = tidak diubah. Tulis tanda - untuk mengosongkan. Jangan ubah ID WB, baris 1–8, atau nama lembar.', s: 6 }],
    [],
    kolom.map(function(k) { return { v: k, s: 3 }; })
  ];
  wb.forEach(function(w, n) {
    var l = lab[w.id] || {};
    b.push([{ v: n + 1, n: true, s: 4 }, { v: w.id, s: 4 }, { v: w.nisn, s: 4 }, { v: w.nama, s: 4 }, { v: w.namaRombel, s: 4 },
      { v: l.unit && unit[l.unit] ? unit[l.unit].nama : '', s: 5 }, { v: l.layanan || '', s: 5 }]);
  });
  var ref = [[{ v: 'UNIT AKTIF', s: 3 }, { v: 'LAYANAN', s: 3 }]];
  var nRef = Math.max(aktif.length, UB.LAYANAN.length);
  for (var j = 0; j < nRef; j++) ref.push([{ v: aktif[j] || '', s: 4 }, { v: UB.LAYANAN[j] || '', s: 4 }]);
  var lembar = [
    { nama: UBI.LEMBAR, xml: nxlSheetXml_(b, [5, 14, 13, 32, 16, 22, 12], ['A1:G1']) },
    { nama: UBI.LEMBAR_REF, xml: nxlSheetXml_(ref, [26, 14], []) }
  ];
  var nama = 'Label_Unit_Siswa_' + absHariIni_() + '.xlsx';
  var blob = oflZip_(lembar, nxlStylesXml_(UBI.WARNA), nama);
  return { nama: nama, b64: Utilities.base64Encode(blob.getBytes()), jumlah: wb.length };
}

// Rencana impor dari baris lembar (murni, diuji). baris: [[sel...]]; unitPeta: {namaKecil|ID: {id, nama, aktif}};
// wb: {id: {id, nisn, nama}}; nisnKe: {nisn: id}; lab: {id: {unit, layanan}}
function ubRencanaImpor_(baris, unitPeta, wb, nisnKe, lab) {
  var h = -1, kol = {};
  for (var i = 0; i < Math.min(baris.length, 20) && h < 0; i++) {
    var r = (baris[i] || []).map(function(x) { return String(x || '').trim().toUpperCase(); });
    if (r.indexOf('ID WB') >= 0 && r.indexOf('UNIT') >= 0) { h = i; r.forEach(function(k, j) { if (k) kol[k] = j; }); }
  }
  if (h < 0) throw new Error('Baris judul kolom (ID WB, UNIT, LAYANAN) tidak ditemukan. Pakai templat dari aplikasi.');
  var out = { item: [], ubah: [], galat: [], sama: 0, kosong: 0 }, sudah = {};
  var sel = function(r, k) { return kol[k] === undefined ? '' : String(r[kol[k]] === undefined || r[kol[k]] === null ? '' : r[kol[k]]).trim(); };
  for (var n = h + 1; n < baris.length; n++) {
    var r2 = baris[n] || [], noBaris = n + 1;
    var id = sel(r2, 'ID WB'), nisn = sel(r2, 'NISN').replace(/\D/g, ''), nm = sel(r2, 'NAMA');
    var uT = sel(r2, 'UNIT'), lT = sel(r2, 'LAYANAN');
    if (!id && !nisn && !nm) continue;
    if (!uT && !lT) { out.kosong++; continue; }
    if (!wb[id] && nisn && nisnKe[nisn]) id = nisnKe[nisn];
    if (!wb[id]) { out.galat.push({ baris: noBaris, nama: nm, alasan: 'siswa tidak ditemukan (ID WB/NISN)' }); continue; }
    if (sudah[id]) { out.galat.push({ baris: noBaris, nama: wb[id].nama, alasan: 'siswa muncul dua kali (baris ' + sudah[id] + ')' }); continue; }
    sudah[id] = noBaris;
    var unit = null, lay = null;
    if (uT === '-') unit = '';
    else if (uT) {
      var u = unitPeta[uT.toLowerCase().replace(/\s+/g, ' ')] || unitPeta[uT];
      if (!u) { out.galat.push({ baris: noBaris, nama: wb[id].nama, alasan: 'unit "' + uT + '" tidak dikenal' }); continue; }
      if (!u.aktif) { out.galat.push({ baris: noBaris, nama: wb[id].nama, alasan: u.nama + ' nonaktif' }); continue; }
      unit = u.id;
    }
    if (lT === '-') lay = '';
    else if (lT) {
      try { lay = ubNormLayanan_(lT); } catch (e) { out.galat.push({ baris: noBaris, nama: wb[id].nama, alasan: 'layanan "' + lT + '" harus Reguler atau Flexi' }); continue; }
    }
    var rc = ubRencana_(lab[id], unit, lay);
    if (!rc) { out.sama++; continue; }
    out.item.push({ id: id, unit: unit, layanan: lay });
    out.ubah.push({ id: id, nama: wb[id].nama, unitLama: rc.unitLama, unitBaru: rc.unitBaru, layananLama: rc.layananLama, layananBaru: rc.layananBaru });
  }
  return out;
}

function waStafUnitImporPratinjau(token, d) {
  var p = stafDariToken_(token);
  ubWajib_(p, true);
  d = d || {};
  if (String(d.b64 || '').length > UBI.MAKS_BYTE * 1.4) throw new Error('File terlalu besar (maksimal 4 MB).');
  var lembar = oflBacaXlsx_(d.b64), baris = lembar[UBI.LEMBAR];
  if (!baris) { var k = Object.keys(lembar); baris = lembar[k[0]]; }
  var unitPeta = {}, wb = {}, nisnKe = {};
  ubUnit_().forEach(function(u) { unitPeta[u.nama.toLowerCase().replace(/\s+/g, ' ')] = u; unitPeta[u.id] = u; });
  keuWbSemua_().forEach(function(w) { if (!w.aktif) return; wb[w.id] = w; if (w.nisn) nisnKe[String(w.nisn).replace(/\D/g, '')] = w.id; });
  var r = ubRencanaImpor_(baris, unitPeta, wb, nisnKe, ubPetaSiswa_());
  var kunci = 'ubi_' + p.id + '_' + absId_();
  CacheService.getScriptCache().put(kunci, JSON.stringify({ item: r.item, oleh: p.id }), UBI.CACHE_DETIK);
  var nm = function(id) { return id ? (unitPeta[id] ? unitPeta[id].nama : id) : '-'; };
  return {
    kunci: kunci, jumlah: { ubah: r.ubah.length, sama: r.sama, kosong: r.kosong, galat: r.galat.length },
    ubah: r.ubah.slice(0, 400).map(function(x) { return { nama: x.nama, unit: nm(x.unitLama) + ' → ' + nm(x.unitBaru), layanan: (x.layananLama || '-') + ' → ' + (x.layananBaru || '-') }; }),
    galat: r.galat.slice(0, 200)
  };
}

function waStafUnitImporTerapkan(token, kunci) {
  var p = stafDariToken_(token);
  ubWajib_(p, true);
  var c = CacheService.getScriptCache(), s = c.get(String(kunci || ''));
  if (!s) throw new Error('Pratinjau kedaluwarsa. Unggah ulang berkasnya.');
  var d = JSON.parse(s);
  if (d.oleh !== p.id) throw new Error('Pratinjau ini milik pengguna lain.');
  if (!d.item.length) throw new Error('Tidak ada perubahan untuk diterapkan.');
  var hasil = ubTulis_(p, d.item, 'Impor Excel');
  c.remove(String(kunci));
  catat_(p.peran, '', p.nama, 'Impor label unit siswa', hasil.diubah + ' diubah, ' + hasil.sama + ' sama, ' + hasil.lewat.length + ' dilewati', 'OK');
  return hasil;
}
