// ============================================================================
// MASA UJIAN SERENTAK (v1.52.0, Ujian Tahap 1)
// Pengganti penjadwalan UTS/UAS per sesi: Admin/KS/Koordinator Kurikulum membuat satu Masa Ujian
//   (UTS / UAS / Ujian Lainnya / Tryout) dengan rentang tanggal bebas, peserta (semua / rombel tertentu /
//   siswa tertentu) dan slot harian (tanggal + jam + durasi + kode mapel). Satu slot berlaku SERENTAK untuk
//   semua rombel peserta yang punya mapel itu - tatap muka maupun full online, sama-sama di APK.
// Saat ditetapkan, tiap slot x rombel-mapel menjadi baris "Jadwal Ujian" biasa (kolom Masa & Cakupan),
//   sehingga alur siswa (kode akses, PIN, timer server, kunci pindah tab, susulan) tetap sama.
// Soal: bank soal kurikulum. UTS = sesi sebelum UTS; UAS = seluruh sesi semester; Lainnya/Tryout = cakupan
//   dipilih (UTS atau UAS). Tryout tidak masuk rapor (jenis TRYOUT) dan tanpa syarat kehadiran.
// Data: tab MASA UJIAN dan SLOT UJIAN.
// ============================================================================
var MU = {
  TAB: 'MASA UJIAN',
  HDR: ['ID', 'NAMA', 'JENIS', 'SEMESTER', 'DARI', 'SAMPAI', 'PESERTA', 'CAKUPAN', 'KKM', 'STATUS', 'DIBUAT OLEH', 'DIBUAT PADA', 'DITETAPKAN OLEH', 'DITETAPKAN PADA', 'CATATAN', 'SYARAT BAYAR', 'KATEGORI BAYAR', 'ID TAGIHAN'],
  TAB_SLOT: 'SLOT UJIAN',
  HDR_SLOT: ['ID', 'MASA', 'TANGGAL', 'JAM', 'DURASI', 'KODE MAPEL', 'NAMA MAPEL', 'JUMLAH SOAL', 'MUDAH', 'SEDANG', 'SULIT', 'CATATAN', 'TOKEN'],
  JENIS: ['UTS', 'UAS', 'LAIN', 'TRYOUT'],
  NAMA_JENIS: { UTS: 'UTS', UAS: 'UAS', LAIN: 'Ujian Lainnya', TRYOUT: 'Tryout' },
  MAKS_SLOT: 120, MAKS_HARI: 31
};

// ---------- tabel ----------
function muTab_(nama, hdr) {
  var sh = bcSheet_(nama, hdr);
  if (sh.getLastColumn() < hdr.length) sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');   // kolom baru (v1.53.0: TOKEN)
  return sh;
}
// Token ujian per slot (diumumkan pengawas): 6 huruf/angka tanpa yang mirip (O/0, I/1).
function muTokenBaru_() {
  var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
  for (var i = 0; i < 6; i++) s += a.charAt(Math.floor(Math.random() * a.length));
  return s;
}
function muBaca_(nama, hdr) {
  var sh = muTab_(nama, hdr), n = sh.getLastRow() - 1, out = [];
  if (n < 1) return out;
  sh.getRange(2, 1, n, hdr.length).getValues().forEach(function(r, i) {
    if (!sTeks_(r[0]).trim()) return;
    var o = { _baris: i + 2 };
    hdr.forEach(function(h, j) { o[h] = r[j] instanceof Date ? Utilities.formatDate(r[j], Session.getScriptTimeZone(), 'yyyy-MM-dd') : sTeks_(r[j]); });
    out.push(o);
  });
  return out;
}
function muObj_(r) {
  var ps = {};
  try { ps = JSON.parse(r['PESERTA'] || '{}') || {}; } catch (e) {}
  return { id: r['ID'], nama: r['NAMA'], jenis: r['JENIS'], smt: parseInt(r['SEMESTER'], 10) || 1, dari: ujTgl_(r['DARI']), sampai: ujTgl_(r['SAMPAI']),
    peserta: { mode: ps.mode || 'semua', rombel: ps.rombel || [], siswa: ps.siswa || [] }, cakupan: r['CAKUPAN'] || '', kkm: parseFloat(r['KKM']) || 0,
    status: r['STATUS'] || 'Draft', dibuatOleh: r['DIBUAT OLEH'], dibuatPada: r['DIBUAT PADA'], ditetapkanOleh: r['DITETAPKAN OLEH'], ditetapkanPada: r['DITETAPKAN PADA'],
    catatan: r['CATATAN'], syaratBayar: parseFloat(r['SYARAT BAYAR']) || 0, kategoriBayar: r['KATEGORI BAYAR'] || '', idTagihan: r['ID TAGIHAN'] || '', baris: r._baris };
}
function muSlotObj_(r) {
  return { id: r['ID'], masa: r['MASA'], tanggal: ujTgl_(r['TANGGAL']), jam: ujJam_(r['JAM']), durasi: parseInt(r['DURASI'], 10) || 0, kode: r['KODE MAPEL'],
    namaMapel: r['NAMA MAPEL'], jumlah: parseInt(r['JUMLAH SOAL'], 10) || 0,
    komposisi: { mudah: parseInt(r['MUDAH'], 10) || 0, sedang: parseInt(r['SEDANG'], 10) || 0, sulit: parseInt(r['SULIT'], 10) || 0 }, token: r['TOKEN'] || '', baris: r._baris };
}
function muSemua_() { return muBaca_(MU.TAB, MU.HDR).map(muObj_); }
function muCari_(id) {
  var m = muSemua_().filter(function(x) { return x.id === String(id); })[0];
  if (!m) throw new Error('Masa ujian tidak ditemukan.');
  return m;
}
function muSlot_(idMasa) { return muBaca_(MU.TAB_SLOT, MU.HDR_SLOT).map(muSlotObj_).filter(function(s) { return s.masa === String(idMasa); }); }
function muWajib_(p) { if (!ujtKelola_(p)) throw new Error('Masa ujian dikelola Admin, Superadmin, Kepala Sekolah, atau Koordinator Kurikulum.'); }
function muJenisPool_(jenis, cakupan) { return jenis === 'UTS' || jenis === 'UAS' ? jenis : (cakupan === 'UTS' ? 'UTS' : 'UAS'); }

// ---------- kelas peserta: SIM rombel|kode mapel -> ID mapel e-Learning ----------
function muKelas_(m, peta) {
  peta = peta || nilPetaBm_();
  var rombel = null;
  if (m.peserta.mode === 'rombel') { rombel = {}; m.peserta.rombel.forEach(function(r) { rombel[String(r)] = true; }); }
  if (m.peserta.mode === 'siswa') {
    rombel = {};
    var ids = {};
    m.peserta.siswa.forEach(function(s) { ids[String(s)] = true; });
    keuWbSemua_().forEach(function(w) { if (ids[w.id]) rombel[w.idRombel] = true; });
  }
  var out = [];
  Object.keys(peta.kelas).forEach(function(key) {
    if (!peta.aktif[key]) return;
    var idR = key.split('|')[0], kode = key.split('|')[1];
    if (rombel && !rombel[idR]) return;
    peta.kelas[key].forEach(function(b) { if (b.aktif) out.push({ key: key, idRombelSim: idR, kode: kode, idMapel: String(b.idMapel), idRombel: b.idRombel }); });
  });
  return out;
}
function muNamaMapel_() {
  var t = absBaca_('MAPEL'), o = {};
  for (var i = 1; i < t.v.length; i++) {
    var k = sTeks_(absNilai_(t, t.v[i], 'KODE MAPEL')).trim();
    if (k) o[k] = sTeks_(absNilai_(t, t.v[i], 'NAMA MAPEL')).trim() || k;
  }
  return o;
}

// ---------- endpoint ----------
function waStafMasaDaftar(token) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var slot = {}, jad = {};
  muBaca_(MU.TAB_SLOT, MU.HDR_SLOT).forEach(function(s) { slot[s['MASA']] = (slot[s['MASA']] || 0) + 1; });
  ujJadwalSemua_().forEach(function(j) { if (j.masa) jad[j.masa] = (jad[j.masa] || 0) + 1; });
  var rb = honProgramRombel_(), rombel = Object.keys(rb).map(function(k) { return { id: k, nama: rb[k].nama, program: rb[k].program }; })
    .sort(function(a, b) { return String(a.nama).localeCompare(String(b.nama)); });
  var cfg = taBaca_(), kkm = 70;
  try { kkm = nilAturan_().kkm; } catch (e) {}
  return {
    masa: muSemua_().reverse().map(function(m) { m.jumlahSlot = slot[m.id] || 0; m.jumlahJadwal = jad[m.id] || 0; return m; }),
    rombel: rombel, wb: keuWbSemua_().filter(function(w) { return w.aktif; }).map(function(w) { return { id: w.id, nama: w.nama, rombel: w.namaRombel }; }),
    jenis: MU.JENIS.map(function(j) { return { kode: j, nama: MU.NAMA_JENIS[j] }; }), jumlahSemester: Math.min(2, cfg.jumlahSemester),
    bawaan: { kkm: kkm, durasi: 90, jumlah: UJ.JUMLAH_BAWAAN, maksSoal: KM.MAKS_SOAL_PER_UJIAN, durasiMin: UJ.DURASI_MIN, durasiMaks: UJ.DURASI_MAKS }
  };
}
// d: {id?, nama, jenis, smt, dari, sampai, peserta:{mode, rombel[], siswa[]}, cakupan, kkm, catatan}
function waStafMasaSimpan(token, d) {
  var p = stafDariToken_(token);
  muWajib_(p);
  d = d || {};
  var jenis = String(d.jenis || '').toUpperCase();
  if (MU.JENIS.indexOf(jenis) < 0) throw new Error('Pilih jenis ujian.');
  var nama = String(d.nama || '').replace(/\s+/g, ' ').trim().slice(0, 80) || (MU.NAMA_JENIS[jenis] + ' Semester ' + d.smt);
  var smt = parseInt(d.smt, 10);
  if (!(smt >= 1 && smt <= 2)) throw new Error('Pilih Semester 1 atau 2.');
  var dari = ujTgl_(d.dari), sampai = ujTgl_(d.sampai);
  if (!dari || !sampai || dari > sampai) throw new Error('Isi rentang tanggal yang benar.');
  if (ujtTambahHari_(dari, MU.MAKS_HARI) < sampai) throw new Error('Rentang masa ujian maksimal ' + MU.MAKS_HARI + ' hari.');
  var ps = d.peserta || {}, mode = ['semua', 'rombel', 'siswa'].indexOf(ps.mode) >= 0 ? ps.mode : 'semua';
  var peserta = { mode: mode, rombel: mode === 'rombel' ? (ps.rombel || []).map(String) : [], siswa: mode === 'siswa' ? (ps.siswa || []).map(String) : [] };
  if (mode === 'rombel' && !peserta.rombel.length) throw new Error('Pilih minimal satu rombel.');
  if (mode === 'siswa' && !peserta.siswa.length) throw new Error('Pilih minimal satu siswa.');
  var kkm = parseFloat(d.kkm);
  if (isNaN(kkm) || kkm < 0 || kkm > 100) throw new Error('KKM 0 sampai 100.');
  var cakupan = jenis === 'LAIN' || jenis === 'TRYOUT' ? (d.cakupan === 'UTS' ? 'UTS' : 'UAS') : '';
  var isi = { 'NAMA': nama, 'JENIS': jenis, 'SEMESTER': smt, 'DARI': dari, 'SAMPAI': sampai, 'PESERTA': JSON.stringify(peserta), 'CAKUPAN': cakupan, 'KKM': kkm,
    'CATATAN': String(d.catatan || '').slice(0, 300) };
  var sh = muTab_(MU.TAB, MU.HDR);
  if (d.id) {
    var m = muCari_(d.id);
    if (m.status !== 'Draft') throw new Error('Masa ujian yang sudah ditetapkan tidak bisa diubah. Batalkan penetapannya dulu.');
    Object.keys(isi).forEach(function(k) { sh.getRange(m.baris, MU.HDR.indexOf(k) + 1).setValue(isi[k]); });
    try { var m2 = muCari_(m.id), b2 = sbMasaBayar_(m2); if (b2.aktif) sbTulisTagihan_(m2, b2.nominal, b2.kategori, p); } catch (eB) {}   // v1.57.0
    catat_(p.peran, '', p.nama, 'Ubah masa ujian', m.id + ' ' + nama, 'OK');
    return { sukses: true, id: m.id };
  }
  var id = 'MU-' + absId_().toUpperCase();
  isi['ID'] = id; isi['STATUS'] = 'Draft'; isi['DIBUAT OLEH'] = p.nama; isi['DIBUAT PADA'] = ujNow_();
  sh.appendRow(MU.HDR.map(function(h) { return isi[h] === undefined ? '' : isi[h]; }));
  catat_(p.peran, '', p.nama, 'Masa ujian baru', id + ' ' + nama + ' ' + dari + '–' + sampai, 'OK');
  return { sukses: true, id: id };
}
// Detail: masa, slot, kode mapel yang tersedia untuk peserta.
function waStafMasaRinci(token, id) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var m = muCari_(id), nm = muNamaMapel_(), kelas = muKelas_(m), perKode = {};
  kelas.forEach(function(k) { (perKode[k.kode] = perKode[k.kode] || {})[k.idRombelSim] = true; });
  var rb = honProgramRombel_();
  var mapel = Object.keys(perKode).map(function(k) {
    return { kode: k, nama: nm[k] || k, rombel: Object.keys(perKode[k]).map(function(r) { return rb[r] ? rb[r].nama : r; }).sort() };
  }).sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  var jadwal = ujJadwalSemua_().filter(function(j) { return j.masa === m.id; }).length;
  return { masa: m, slot: muSlot_(m.id).sort(function(a, b) { return (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam); }), mapel: mapel, jumlahJadwal: jadwal };
}
// Usulan slot otomatis: mapel dibagi ke hari-hari dalam rentang (Minggu dilewati). q: {jam:['07:30','09:30'], durasi, jumlah, kode:[...]}
function waStafMasaUsulan(token, id, q) {
  var p = stafDariToken_(token);
  muWajib_(p);
  q = q || {};
  var r = waStafMasaRinci(token, id), m = r.masa;
  var jam = (Array.isArray(q.jam) && q.jam.length ? q.jam : ['07:30', '09:30']).map(ujJam_).filter(String);
  if (!jam.length) throw new Error('Isi minimal satu jam mulai (JJ:MM).');
  var kode = Array.isArray(q.kode) && q.kode.length ? q.kode.map(String) : r.mapel.map(function(x) { return x.kode; });
  var nama = {};
  r.mapel.forEach(function(x) { nama[x.kode] = x.nama; });
  var dur = parseInt(q.durasi, 10) || 90, jml = parseInt(q.jumlah, 10) || UJ.JUMLAH_BAWAAN, komp = ujKomposisi_(jml, {});
  var hari = [];
  for (var t = m.dari, i = 0; t <= m.sampai && i <= MU.MAKS_HARI; t = ujtTambahHari_(t, 1), i++) {
    if (new Date(t + 'T00:00:00').getDay() !== 0) hari.push(t);
  }
  if (!hari.length) throw new Error('Tidak ada hari ujian di rentang ini.');
  var slot = [], idx = 0;
  hari.forEach(function(h) { jam.forEach(function(j) { if (idx < kode.length) { slot.push({ tanggal: h, jam: j, durasi: dur, kode: kode[idx], namaMapel: nama[kode[idx]] || kode[idx], jumlah: jml, komposisi: komp }); idx++; } }); });
  return { slot: slot, sisa: kode.slice(idx).map(function(k) { return nama[k] || k; }) };
}
// Ganti seluruh slot (hanya Draft). slot: [{tanggal, jam, durasi, kode, jumlah, mudah?, sedang?, sulit?}]
function waStafMasaSlotSimpan(token, id, slot) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var m = muCari_(id);
  if (m.status !== 'Draft') throw new Error('Slot masa ujian yang sudah ditetapkan tidak bisa diubah. Batalkan penetapannya dulu.');
  slot = Array.isArray(slot) ? slot : [];
  if (slot.length > MU.MAKS_SLOT) throw new Error('Maksimal ' + MU.MAKS_SLOT + ' slot.');
  var nm = muNamaMapel_(), baris = [], tabrak = {};
  slot.forEach(function(s, i) {
    var tgl = ujTgl_(s.tanggal), jam = ujJam_(s.jam), kode = String(s.kode || '').trim();
    var label = 'Slot ' + (i + 1);
    if (!tgl || !jam) throw new Error(label + ': tanggal dan jam wajib diisi.');
    if (tgl < m.dari || tgl > m.sampai) throw new Error(label + ': tanggal di luar masa ujian (' + m.dari + ' s.d. ' + m.sampai + ').');
    if (!kode) throw new Error(label + ': pilih mapel.');
    if (tabrak[kode]) throw new Error('Mapel ' + (nm[kode] || kode) + ' dijadwalkan lebih dari sekali.');
    tabrak[kode] = true;
    var dur = parseInt(s.durasi, 10);
    if (!(dur >= UJ.DURASI_MIN && dur <= UJ.DURASI_MAKS)) throw new Error(label + ': durasi ' + UJ.DURASI_MIN + '–' + UJ.DURASI_MAKS + ' menit.');
    var jml = parseInt(s.jumlah, 10) || UJ.JUMLAH_BAWAAN;
    if (jml < 5 || jml > KM.MAKS_SOAL_PER_UJIAN) throw new Error(label + ': jumlah soal 5–' + KM.MAKS_SOAL_PER_UJIAN + '.');
    var komp = ujKomposisi_(jml, s);
    baris.push(['SL-' + absId_().toUpperCase(), m.id, tgl, jam, dur, kode, nm[kode] || kode, jml, komp.mudah, komp.sedang, komp.sulit, String(s.catatan || '').slice(0, 200), '']);
  });
  var sh = muTab_(MU.TAB_SLOT, MU.HDR_SLOT), lama = muBaca_(MU.TAB_SLOT, MU.HDR_SLOT).filter(function(s) { return s['MASA'] === m.id; })
    .map(function(s) { return s._baris; }).sort(function(a, b) { return b - a; });
  lama.forEach(function(b) { sh.deleteRow(b); });
  if (baris.length) {
    var r0 = sh.getLastRow() + 1;
    sh.getRange(r0, 1, baris.length, MU.HDR_SLOT.length).setNumberFormat('@').setValues(baris);
  }
  catat_(p.peran, '', p.nama, 'Slot masa ujian', m.id + ': ' + baris.length + ' slot', 'OK');
  return { sukses: true, jumlah: baris.length };
}
// Cek kesiapan bank soal: tiap slot x rombel-mapel peserta.
function waStafMasaKesiapan(token, id) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var m = muCari_(id), slot = muSlot_(m.id), kelas = muKelas_(m), rb = honProgramRombel_(), jp = muJenisPool_(m.jenis, m.cakupan);
  var siswaIds = {};
  m.peserta.siswa.forEach(function(s) { siswaIds[s] = true; });
  var out = [], cache = {};
  slot.forEach(function(s) {
    kelas.filter(function(k) { return k.kode === s.kode; }).forEach(function(k) {
      var pool = cache[k.idMapel] || (cache[k.idMapel] = ujPool_(k.idMapel, m.smt, jp));
      var wb = absWbRombel_(k.idRombelSim) || [];
      var n = m.peserta.mode === 'siswa' ? wb.filter(function(w) { return siswaIds[w.id]; }).length : wb.length;
      out.push({ slot: s.id, tanggal: s.tanggal, jam: s.jam, mapel: s.namaMapel, rombel: rb[k.idRombelSim] ? rb[k.idRombelSim].nama : k.idRombelSim,
        idMapel: k.idMapel, peserta: n, bank: pool.total, perlu: s.jumlah, tanpaBank: pool.tanpaBank,
        status: pool.total === 0 ? 'Kosong' : (pool.total < s.jumlah ? 'Kurang' : (pool.tanpaBank.length ? 'Sebagian' : 'Siap')) });
    });
  });
  out.sort(function(a, b) { return (a.tanggal + a.jam + a.rombel).localeCompare(b.tanggal + b.jam + b.rombel); });
  var hitung = {};
  out.forEach(function(x) { hitung[x.status] = (hitung[x.status] || 0) + 1; });
  return { masa: m, kesiapan: out, ringkas: hitung };
}
// Tetapkan: buat baris Jadwal Ujian untuk tiap slot x rombel-mapel peserta.
function waStafMasaTetapkan(token, id) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var m = muCari_(id);
  if (m.status !== 'Draft') throw new Error('Masa ujian ini sudah ditetapkan.');
  var slot = muSlot_(m.id);
  if (!slot.length) throw new Error('Belum ada slot jadwal.');
  var cfg = taBaca_(), now = Date.now(), kelas = muKelas_(m), mapel = ujtPetaMapel_(), hasil = [], lewat = [];
  var kunci = kmKunciUnik_();
  kunci.waitLock(30000);
  try {
    var adaKunci = {};
    ujJadwalSemua_().forEach(function(x) { adaKunci[x.kunci] = true; });
    slot.forEach(function(s) {
      var mulaiMs = ujMs_(s.tanggal, s.jam);
      kelas.filter(function(k) { return k.kode === s.kode; }).forEach(function(k) {
        var em = mapel[k.idMapel], nm = em ? em.namaMapel + ' · ' + em.namaRombel : k.idMapel;
        try {
          if (!em) throw new Error('mapel tidak aktif');
          if (isNaN(mulaiMs) || mulaiMs < now) throw new Error('waktu mulai sudah lewat');
          var kj = m.jenis === 'UTS' || m.jenis === 'UAS' ? ujKunciJadwal_(k.idMapel, m.smt, m.jenis) : ujKunciJadwal_(k.idMapel, m.smt, m.jenis) + '|' + m.id;
          if (adaKunci[kj]) throw new Error('sudah terjadwal ' + (MU.NAMA_JENIS[m.jenis] || m.jenis) + ' Semester ' + m.smt);
          var ses = ujtSesiDariTanggal_(cfg, s.tanggal);
          if (!ses) throw new Error('tanggal di luar kalender akademik');
          var judul = m.jenis === 'UTS' || m.jenis === 'UAS' ? ujJudul_(m.jenis, m.smt) : (m.jenis === 'TRYOUT' ? 'Tryout ' : '') + m.nama;
          var konten = 'Ujian serentak ' + m.nama + '. Kerjakan semua soal dengan teliti; soal dan urutan jawaban berbeda untuk setiap siswa.\n' +
            'Masukkan kode akses dari pengawas saat mulai. Jadwal: ' + ujTeksWaktu_(mulaiMs) + ', ' + s.durasi + ' menit.' + (m.jenis === 'TRYOUT' ? '\nTryout: nilai tidak masuk rapor.' : ' Nilai minimal ' + m.kkm + '.');
          var idU = ujBuatItemUjian_(k.idMapel, judul, konten, ses.nama, s.durasi);
          ujTambah_('JADWAL', {
            'Kunci': kj, 'ID Mapel': k.idMapel, 'Semester': m.smt, 'Jenis': m.jenis, 'ID Ujian': idU, 'Tanggal': s.tanggal, 'Jam Mulai': s.jam, 'Durasi Menit': s.durasi,
            'KKM': m.kkm, 'Jumlah Soal': s.jumlah, 'Mudah': s.komposisi.mudah, 'Sedang': s.komposisi.sedang, 'Sulit': s.komposisi.sulit, 'Dibuat Oleh': p.nama,
            'Dibuat Pada': ujNow_(), 'Catatan': 'Masa ujian ' + m.nama + ' (slot ' + s.id + ')', 'Mode': 'APK', 'Terpusat': 'Ya',
            'Judul': m.jenis === 'UTS' || m.jenis === 'UAS' ? '' : judul, 'Masa': m.id, 'Cakupan': m.cakupan, 'Slot': s.id
          });
          adaKunci[kj] = true;
          hasil.push({ nama: nm, teks: ujTeksWaktu_(mulaiMs) });
        } catch (e) { lewat.push({ nama: nm, alasan: String((e && e.message) || e) }); }
      });
    });
    if (hasil.length) {
      var sh = muTab_(MU.TAB, MU.HDR);
      sh.getRange(m.baris, MU.HDR.indexOf('STATUS') + 1).setValue('Ditetapkan');
      sh.getRange(m.baris, MU.HDR.indexOf('DITETAPKAN OLEH') + 1).setValue(p.nama);
      sh.getRange(m.baris, MU.HDR.indexOf('DITETAPKAN PADA') + 1).setValue(ujNow_());
      var shS = muTab_(MU.TAB_SLOT, MU.HDR_SLOT), kT = MU.HDR_SLOT.indexOf('TOKEN') + 1;
      slot.forEach(function(s) { if (!s.token) shS.getRange(s.baris, kT).setNumberFormat('@').setValue(muTokenBaru_()); });
    }
  } finally { kunci.releaseLock(); }
  catat_(p.peran, '', p.nama, 'Tetapkan masa ujian', m.id + ' ' + m.nama + ': ' + hasil.length + ' jadwal, ' + lewat.length + ' dilewati', 'OK');
  return { ditetapkan: hasil, lewat: lewat };
}
// Batalkan penetapan (selama belum ada siswa yang mulai): hapus jadwal & nonaktifkan item ujiannya.
function waStafMasaBatal(token, id, alasan) {
  var p = stafDariToken_(token);
  muWajib_(p);
  alasan = String(alasan || '').trim();
  if (alasan.length < 5) throw new Error('Tulis alasan pembatalan (minimal 5 huruf).');
  var m = muCari_(id);
  var jad = ujJadwalSemua_().filter(function(j) { return j.masa === m.id; }), ids = {};
  jad.forEach(function(j) { ids[String(j.idUjian)] = true; });
  if (jad.length) {
    var mulai = false;
    try {
      var v = getSheetData(CONFIG.SHEETS.PERCOBAAN_UJIAN), c = sesiCols_();
      for (var i = 1; i < v.length && !mulai; i++) if (ids[String(v[i][c.idUjian - 1])]) mulai = true;
    } catch (e) {}
    ujBaca_('HASIL').forEach(function(h) { if (ids[String(h['ID Ujian'])]) mulai = true; });
    if (mulai) throw new Error('Sudah ada siswa yang mengerjakan ujian di masa ini, sehingga penetapan tidak bisa dibatalkan.');
    var kunci = kmKunciUnik_();
    kunci.waitLock(30000);
    try {
      var shJ = ujTabel_('JADWAL');
      jad.map(function(j) { return j.baris; }).sort(function(a, b) { return b - a; }).forEach(function(b) { shJ.deleteRow(b); });
      var mm = kmMateri_(), vm = mm.sheet.getDataRange().getValues();
      for (var r = 1; r < vm.length; r++) {
        if (ids[sTeks_(vm[r][mm.c.id - 1]).trim()]) mm.sheet.getRange(r + 1, mm.c.status).setValue('Nonaktif');
      }
    } finally { kunci.releaseLock(); }
  }
  var sh = muTab_(MU.TAB, MU.HDR);
  sh.getRange(m.baris, MU.HDR.indexOf('STATUS') + 1).setValue('Draft');
  sh.getRange(m.baris, MU.HDR.indexOf('CATATAN') + 1).setValue(('Dibatalkan ' + p.nama + ' ' + ujNow_() + ': ' + alasan).slice(0, 300));
  catat_(p.peran, '', p.nama, 'Batal masa ujian', m.id + ' ' + m.nama + ' (' + jad.length + ' jadwal): ' + alasan, 'OK');
  return { sukses: true, dihapus: jad.length };
}

// ---------- gerbang siswa: peserta "siswa tertentu" ----------
function muGerbang_(j, idRombel, nama) {
  if (!j || !j.masa) return '';
  var m = null;
  try { m = muCari_(j.masa); } catch (e) { return ''; }
  if (m.peserta.mode !== 'siswa') return '';
  var w = null;
  try { w = ksWb_({ nama: nama, idRombel: idRombel }); } catch (e2) {}
  if (w && m.peserta.siswa.indexOf(w.id) >= 0) return '';
  return 'Anda tidak terdaftar sebagai peserta ' + m.nama + '.';
}

// ============================================================================
// v1.56.0: SYARAT KEHADIRAN PESERTA MASA UJIAN
// Kehadiran gabungan (absensi TH.E-Course + tatap muka) per mapel pada semester berjalan >= syarat (Aturan Nilai, bawaan 80%)
// -> otomatis boleh ujian. Kurang dari syarat -> perlu persetujuan Kepala Sekolah (dispensasi). Tryout tanpa syarat kehadiran.
// ============================================================================
function muJenisDis_(jenis) { return jenis === 'UTS' || jenis === 'UAS' ? jenis : '*'; }
// Daftar peserta di bawah syarat untuk masa ini: [{idWb, nama, idRombelSim, rombel, kode, mapel, persen, hadir, total, dispensasi}]
function muKurangHadir_(m) {
  var at = nilAturan_(), out = [];
  if (m.jenis === 'TRYOUT' || !at.blokir) return { at: at, daftar: out };
  var per = nilPeriode_(), dis = nilDisBaca_(per), rb = honProgramRombel_(), nm = muNamaMapel_();
  var kode = {};
  muSlot_(m.id).forEach(function(s) { kode[s.kode] = true; });
  var pilih = null;
  if (m.peserta.mode === 'siswa') { pilih = {}; m.peserta.siswa.forEach(function(x) { pilih[x] = true; }); }
  var sudah = {};
  muKelas_(m).forEach(function(k) {
    if (!kode[k.kode] || sudah[k.key]) return;
    sudah[k.key] = true;
    var hk = nilHadirKelas_(per, k.key);
    (absWbRombel_(k.idRombelSim) || []).forEach(function(w) {
      if (pilih && !pilih[w.id]) return;
      var g = hk.gabung(w.id);
      if (!g.total || g.persen >= at.syaratHadir) return;
      var d = nilDisCari_(dis, w.id, k.idRombelSim, k.kode, m.jenis);
      out.push({ idWb: w.id, nama: w.nama, idRombelSim: k.idRombelSim, rombel: rb[k.idRombelSim] ? rb[k.idRombelSim].nama : k.idRombelSim, kode: k.kode,
        mapel: nm[k.kode] || k.kode, persen: g.persen, hadir: g.hadir, total: g.total, dispensasi: d ? { oleh: d.oleh, pada: d.pada, alasan: d.alasan } : null });
    });
  });
  out.sort(function(a, b) { return (a.rombel + a.nama + a.mapel).localeCompare(b.rombel + b.nama + b.mapel); });
  return { at: at, daftar: out };
}
function waStafMasaHadir(token, idMasa) {
  var p = stafDariToken_(token);
  var m = muCari_(idMasa);
  if (!ujtKelola_(p) && !nilPeran_(p).dispensasi) throw new Error('Peran Anda tidak dapat melihat syarat kehadiran peserta.');
  var r = muKurangHadir_(m), minta = {};
  try {
    pwBaca_(PW.TAB_LG, PW.HDR_LG).forEach(function(x) {
      if (x['JENIS'] === 'Permintaan dispensasi kehadiran' && x['ID UJIAN'] === m.id) minta[x['ID ROMBEL'] + '|' + x['NAMA SISWA']] = x['OLEH'] + ' ' + x['WAKTU'];
    });
  } catch (e) {}
  r.daftar.forEach(function(x) { x.diajukan = minta[x.idRombelSim + '|' + x.idWb + '|' + x.kode] || ''; });
  return { masa: m, syarat: r.at.syaratHadir, blokir: r.at.blokir, tryout: m.jenis === 'TRYOUT', daftar: r.daftar, bisaSetuju: !!nilPeran_(p).dispensasi,
    jenisDis: muJenisDis_(m.jenis),
    // v1.57.0: syarat pembayaran
    bayar: sbMasaBayar_(m), bayarDaftar: sbDaftarMasa_(m), bisaAturBayar: SB.PENGATUR.indexOf(p.peran) >= 0,
    kategori: keuKategori_().filter(function(k) { return k.jenis === 'Pemasukan'; }).map(function(k) { return { kode: k.kode, nama: k.nama }; }), kategoriBawaan: sbKategoriBawaan_() };
}
// Ajukan persetujuan KS untuk beberapa siswa: item [{idWb, idRombelSim, kode}], alasan wajib.
function waStafMasaHadirAjukan(token, idMasa, item, alasan) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var m = muCari_(idMasa), a = pwAlasan_(alasan), kurang = {}, n = 0;
  muKurangHadir_(m).daftar.forEach(function(x) { kurang[x.idRombelSim + '|' + x.idWb + '|' + x.kode] = x; });
  var nama = [];
  (Array.isArray(item) ? item : []).forEach(function(i) {
    var x = kurang[String(i.idRombelSim) + '|' + String(i.idWb) + '|' + String(i.kode)];
    if (!x || x.dispensasi) return;
    pwCatat_(m.id, x.idRombelSim + '|' + x.idWb + '|' + x.kode, x.nama, 'Permintaan dispensasi kehadiran', x.mapel + ' ' + x.persen + '%: ' + a, p.nama);
    nama.push(x.nama + ' (' + x.mapel + ' ' + x.persen + '%)');
    n++;
  });
  if (!n) throw new Error('Tidak ada siswa yang perlu diajukan.');
  npKirim_('ujian_dispensasi_minta', { judul: 'Persetujuan ikut ujian (kehadiran kurang)', isi: p.nama + ' mengajukan ' + n + ' siswa untuk ' + m.nama + ': ' + nama.slice(0, 5).join(', ') +
    (nama.length > 5 ? ', dan ' + (nama.length - 5) + ' lainnya' : '') + '. Alasan: ' + a, aksi: 'masa_ujian', ref: 'dis|' + m.id + '|' + Date.now() });
  return { sukses: true, jumlah: n };
}
// Kepala Sekolah menyetujui beberapa siswa sekaligus (dispensasi per mapel untuk jenis ujian masa ini).
function waStafMasaHadirSetujui(token, idMasa, item, alasan) {
  var p = stafDariToken_(token);
  if (!nilPeran_(p).dispensasi) throw new Error('Persetujuan ikut ujian dengan kehadiran kurang diberikan Kepala Sekolah.');
  var m = muCari_(idMasa), a = pwAlasan_(alasan), kurang = {}, n = 0;
  muKurangHadir_(m).daftar.forEach(function(x) { kurang[x.idRombelSim + '|' + x.idWb + '|' + x.kode] = x; });
  var per = nilPeriode_(), t = absBaca_(NIL.TAB_DIS, NIL.HDR_DIS), jenis = muJenisDis_(m.jenis);
  (Array.isArray(item) ? item : []).forEach(function(i) {
    var x = kurang[String(i.idRombelSim) + '|' + String(i.idWb) + '|' + String(i.kode)];
    if (!x || x.dispensasi) return;
    t.sh.appendRow(absBaris_(t, {
      'ID': absId_(), 'WARGA BELAJAR': x.idWb, 'NAMA WB': x.nama, 'ROMBEL': x.idRombelSim, 'MAPEL': x.kode, 'JENIS': jenis,
      'TAHUN PELAJARAN': per.tahun, 'SEMESTER': per.semester, 'ALASAN': ('Masa ujian ' + m.nama + ' (kehadiran ' + x.persen + '%): ' + a).slice(0, 300), 'AKTIF': true,
      'DIBERI OLEH': p.nama, 'DIBERI PADA': absWaktu_()
    }));
    n++;
  });
  if (!n) throw new Error('Tidak ada siswa yang perlu disetujui.');
  catat_(p.peran, '-', p.nama, 'Setujui ikut ujian (kehadiran kurang)', m.nama + ': ' + n + ' siswa - ' + a, 'OK');
  return { sukses: true, jumlah: n };
}
