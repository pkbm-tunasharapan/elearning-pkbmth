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
  TAB_UNIT: 'UNIT BELAJAR', HDR_UNIT: ['ID UNIT', 'NAMA UNIT', 'ALAMAT', 'KETERANGAN', 'AKTIF', 'DIUBAH OLEH', 'DIUBAH PADA'],
  TAB_SISWA: 'UNIT SISWA', HDR_SISWA: ['ID WB', 'UNIT', 'LAYANAN', 'DIUBAH OLEH', 'DIUBAH PADA'],
  TAB_RIW: 'RIWAYAT UNIT SISWA', HDR_RIW: ['WAKTU', 'ID WB', 'NAMA WB', 'UNIT LAMA', 'UNIT BARU', 'LAYANAN LAMA', 'LAYANAN BARU', 'OLEH', 'CATATAN'],
  LAYANAN: ['Reguler', 'Flexi'],
  PERAN_LIHAT: ['Admin', 'Superadmin'], PERAN_UBAH: ['Admin'],
  MAKS_SEKALI: 500
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
function ubUnit_() {
  if (UB_MEMO_.unit) return UB_MEMO_.unit;
  var t = absBaca_(UB.TAB_UNIT, UB.HDR_UNIT), out = [];
  for (var i = 1; i < t.v.length; i++) {
    var id = sTeks_(absNilai_(t, t.v[i], 'ID UNIT')).trim();
    if (!id) continue;
    out.push({ baris: i + 1, id: id, nama: sTeks_(absNilai_(t, t.v[i], 'NAMA UNIT')).trim(), alamat: sTeks_(absNilai_(t, t.v[i], 'ALAMAT')).trim(),
      ket: sTeks_(absNilai_(t, t.v[i], 'KETERANGAN')).trim(), aktif: absBenar_(absNilai_(t, t.v[i], 'AKTIF')) });
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
  return {
    unit: unit.map(function(u) { return { id: u.id, nama: u.nama, alamat: u.alamat, ket: u.ket, aktif: u.aktif, jumlah: hit[u.id] || 0 }; }),
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
    var t = absBaca_(UB.TAB_UNIT, UB.HDR_UNIT);
    var isi = { 'NAMA UNIT': nama, 'ALAMAT': ubNormNama_(d.alamat).slice(0, 200), 'KETERANGAN': String(d.ket || '').trim().slice(0, 300),
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
  var hasil = { diubah: 0, sama: 0, lewat: [] };
  var kunci = kmKunciUnik_();
  kunci.waitLock(30000);
  try {
    UB_MEMO_ = {};
    if (unitBaru) {
      var u = ubPetaUnit_()[unitBaru];
      if (!u) throw new Error('Unit tidak ditemukan.');
      if (!u.aktif) throw new Error(u.nama + ' sedang nonaktif.');
    }
    var wb = {};
    keuWbSemua_().forEach(function(w) { wb[w.id] = w; });
    var lab = ubPetaSiswa_(), t = absBaca_(UB.TAB_SISWA, UB.HDR_SISWA), waktu = absWaktu_();
    var cU = absCol_(t, 'UNIT'), cL = absCol_(t, 'LAYANAN'), cO = absCol_(t, 'DIUBAH OLEH'), cP = absCol_(t, 'DIUBAH PADA');
    var baru = [], riw = [], ubahBaris = [];
    ids.forEach(function(id) {
      if (!wb[id]) { hasil.lewat.push({ id: id, alasan: 'siswa tidak ditemukan' }); return; }
      var r = ubRencana_(lab[id], unitBaru, layBaru);
      if (!r) { hasil.sama++; return; }
      if (lab[id]) ubahBaris.push({ baris: lab[id].baris, r: r });
      else baru.push(absBaris_(t, { 'ID WB': ubTeks_(id), 'UNIT': r.unitBaru, 'LAYANAN': r.layananBaru, 'DIUBAH OLEH': p.nama, 'DIUBAH PADA': waktu }));
      riw.push([waktu, ubTeks_(id), wb[id].nama, r.unitLama, r.unitBaru, r.layananLama, r.layananBaru, p.nama, catatan]);
      lab[id] = { unit: r.unitBaru, layanan: r.layananBaru, baris: lab[id] ? lab[id].baris : 0 };
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
  catat_(p.peran, '', p.nama, 'Label unit siswa', hasil.diubah + ' diubah, ' + hasil.sama + ' sama, ' + hasil.lewat.length + ' dilewati', 'OK');
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
