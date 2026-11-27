// ============================================================================
// KARTU PESERTA UJIAN (v1.93.4) - meniru format KTPU, disesuaikan untuk PKBM
// - Hanya ujian serentak (Masa Ujian berstatus Ditetapkan yang belum berakhir).
// - Kode akses = kode akses siswa yang sudah ada (satu per siswa, kolom D tab Siswa), dicetak di kartu.
//   Token dari pengawas TETAP wajib saat mulai ujian.
// - Jadwal per hari: jam mulai-selesai, mapel, durasi, mode; kolom ruang hanya terisi untuk ujian tulis (offline)
//   atau masa yang dilaksanakan di unit (ruang dari penugasan pengawas).
// - Siswa: waSiswaKartuUjian(token). Petugas: waStafMasaKartu(token, idMasa, idRombel?) untuk cetak per masa/rombel.
// - v1.94.0: kartu hanya untuk siswa yang LAYAK (Analisa Kelayakan Ujian jenis ujian masa itu). Belum layak -> kartu terkunci,
//   siswa dapat mengajukan dispensasi (permohonan kelayakan). Disetujui -> kartu bertanda DISPENSASI (nilai ujian itu
//   tetap tidak ditampilkan kepada siswa). Petugas: waStafMasaKodeAkses membuat kode akses semua siswa yang belum punya.
// ============================================================================
if (typeof API_FLUTTER !== 'undefined' && API_FLUTTER && API_FLUTTER.TAMBAHAN) API_FLUTTER.TAMBAHAN.waSiswaKartuUjian = true;

var KU_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
var KU_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function kuTglPanjang_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return KU_HARI[d.getDay()] + ', ' + Number(m[3]) + ' ' + KU_BULAN[Number(m[2]) - 1] + ' ' + m[1];
}
function kuJamTambah_(jam, menit) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(jam || ''));
  if (!m) return '';
  var t = Number(m[1]) * 60 + Number(m[2]) + (Number(menit) || 0);
  return ('0' + Math.floor(t / 60) % 24).slice(-2) + ':' + ('0' + t % 60).slice(-2);
}

// Data bersama (sekali per eksekusi).
var KU_MEMO_ = null;
function kuData_() {
  if (KU_MEMO_) return KU_MEMO_;
  var h0 = absHariIni_(), masa = {};
  muSemua_().forEach(function(m) { if (m.status === 'Ditetapkan' && m.sampai >= h0) masa[m.id] = m; });
  var jadwal = ujJadwalSemua_().filter(function(j) { return j.masa && masa[j.masa]; });
  var siswaKode = {}, nisn = {}, v = getSheetData(CONFIG.SHEETS.SISWA);
  if (v.length) {
    var hd = v[0].map(function(x) { return String(x).trim(); });
    var iR = hd.indexOf('ID Rombel'), iN = hd.indexOf('Nama Siswa'), iS = hd.indexOf('NISN');
    for (var i = 1; i < v.length; i++) {
      var k = sTeks_(v[i][iR >= 0 ? iR : 0]).trim() + '|' + normNama_(v[i][iN >= 0 ? iN : 1]);
      if (!siswaKode[k]) siswaKode[k] = sTeks_(v[i][3]).trim();
      if (iS >= 0 && !nisn[k]) nisn[k] = sTeks_(v[i][iS]).trim();
    }
  }
  var pu = {};
  try { pu = ubPetaUnit_(); } catch (e) {}
  return (KU_MEMO_ = { h0: h0, masa: masa, jadwal: jadwal, mp: brdMapelBm_(), peta: nilPetaBm_(), siswaKode: siswaKode, nisn: nisn, pu: pu, tugas: {}, wb: {} });
}
function kuSimRombel_(D, idRombel) {
  var simR = '';
  Object.keys(D.peta.rombel).forEach(function(r) { if (D.peta.rombel[r][idRombel]) simR = r; });
  return simR;
}
function kuWb_(D, idRombel, nama) {
  var k = idRombel + '|' + normNama_(nama);
  if (D.wb[k] === undefined) { try { D.wb[k] = ksWb_({ nama: nama, idRombel: idRombel }) || null; } catch (e) { D.wb[k] = null; } }
  return D.wb[k];
}
function kuNamaUnit_(D, id) { var u = D.pu[id]; return u ? (/^unit\b/i.test(u.nama) ? u.nama : 'Unit ' + u.nama) : ''; }

// Kartu satu siswa (e-learning: idRombel + nama). hanyaMasa: batasi ke satu masa (cetak petugas).
function kuKartuSiswa_(D, idRombel, nama, hanyaMasa) {
  idRombel = String(idRombel);
  var per = {}, gerbang = {}, simR = kuSimRombel_(D, idRombel);
  D.jadwal.forEach(function(j0) {
    if (hanyaMasa && j0.masa !== hanyaMasa) return;
    var mp = D.mp[String(j0.idMapel)];
    if (!mp || String(mp.idRombel) !== idRombel) return;
    var m = D.masa[j0.masa];
    if (!m) return;
    if (gerbang[m.id] === undefined) gerbang[m.id] = muGerbang_(j0, idRombel, nama);   // bukan peserta (siswa tertentu / unit)
    if (gerbang[m.id]) return;
    var j = ujJadwalSiswa_(j0, idRombel, nama);   // jadwal khusus unit siswa
    var tulis = j.mode === 'Kertas', diUnit = tulis || m.tempat === 'Di unit';
    var ruang = '', tempat = '';
    if (diUnit) {
      var wb = kuWb_(D, idRombel, nama), unit = '';
      try { unit = wb ? ubUnitEf_(wb.id, ubPetaSiswa_()) : ''; } catch (eU) {}
      tempat = kuNamaUnit_(D, unit) || (m.unitTempat || []).map(function(u) { return kuNamaUnit_(D, u); }).filter(String).join(' / ') || 'Unit belajar';
      if (simR && j.slot) {
        if (!D.tugas[m.id]) D.tugas[m.id] = pwTugasMasa_(m.id);
        var ef = pwEfektif_(D.tugas[m.id], j.slot, m.pisahUnit ? simR + '~' + (unit || '-') : simR);
        ruang = ef ? String(ef.ruang || '') : '';
      }
    }
    var o = per[m.id] || (per[m.id] = { id: m.id, nama: m.nama, jenis: m.jenis, cakupan: m.cakupan || '', jenisNama: MU.NAMA_JENIS[m.jenis] || m.jenis, smt: m.smt, dari: m.dari, sampai: m.sampai,
      tempat: muTeksTempat_(m, true), item: [] });
    o.item.push({ tanggal: j.tanggal, jam: j.jam, selesai: kuJamTambah_(j.jam, j.durasi), durasi: j.durasi, mapel: mp.nama,
      mode: tulis ? 'Tulis' : 'Online', ruang: ruang, tempat: diUnit ? tempat : '', idUjian: String(j.idUjian) });
  });
  return Object.keys(per).map(function(id) {
    var o = per[id], hari = {};
    o.item.sort(function(a, b) { return (a.tanggal + a.jam + a.mapel).localeCompare(b.tanggal + b.jam + b.mapel); });
    o.item.forEach(function(x) { (hari[x.tanggal] = hari[x.tanggal] || []).push(x); });
    o.hari = Object.keys(hari).sort().map(function(t, i) {
      return { ke: i + 1, tanggal: t, teks: kuTglPanjang_(t), item: hari[t].map(function(x, n) { x.sesi = n + 1; return x; }) };
    });
    o.adaRuang = o.item.some(function(x) { return x.tempat || x.ruang; });
    delete o.item;
    return o;
  }).sort(function(a, b) { return a.dari.localeCompare(b.dari); });
}
function kuIdentitas_(D, idRombel, nama) {
  var k = String(idRombel) + '|' + normNama_(nama);
  var rbNama = '';
  try { rbNama = getNamaRombel_(idRombel); } catch (e) { rbNama = idRombel; }
  var unit = '';
  try { var wb = kuWb_(D, idRombel, nama); unit = wb ? kuNamaUnit_(D, ubUnitEf_(wb.id, ubPetaSiswa_())) : ''; } catch (e2) {}
  return { nama: nama, nisn: D.nisn[k] || '', rombel: rbNama, unit: unit, kodeAkses: D.siswaKode[k] || '' };
}
// v1.94.0: jenis kelayakan untuk masa ini ('' = tanpa syarat, mis. Tryout)
function kuUjianMasa_(m) {
  if (!m || m.jenis === 'TRYOUT') return '';
  if (m.jenis === 'UTS' || m.jenis === 'UAS' || m.jenis === 'UPK') return m.jenis;
  return m.cakupan === 'UTS' ? 'UTS' : 'UAS';
}
// Status kelayakan siswa untuk satu masa: {status, ujian, dispensasi, alasan, bolehAju, proses}
function kuKelayakan_(idRombel, nama, m) {
  var ujian = kuUjianMasa_(m), ok = { status: 'Layak', ujian: ujian, dispensasi: false, alasan: '', bolehAju: false, proses: '' };
  if (!ujian) return ok;
  try {
    var d = klData_(m.smt);
    if (!d.at.blokir) return ok;
    var w = sbWbSiswa_(idRombel, nama);
    if (!w) return ok;
    var keys = klKeysRombel_(d, w.idRombel, null);
    var h = klWb_(d, w, { idRombel: String(idRombel), nama: nama }, keys, { keu: true, ujian: [ujian] }), u = h.ujian[ujian];
    if (!u) return ok;
    var alasan = [];
    if (!u.akaOk && !u.izinAka) {
      alasan.push('akademik (' + u.mapel.filter(function(x) { return !x.ok; }).map(function(x) {
        return x.nama + (x.okTuntas ? '' : ' tuntas ' + x.tuntas.persen + '%') + (x.okAbsen ? '' : ' absensi ' + x.absen.persen + '%');
      }).join('; ') + '; minimal ' + d.syarat + '%)');
    }
    if (!u.keuOk && !u.izinKeu) alasan.push('keuangan (sisa tagihan ' + honRp_(h.keu ? h.keu.sisa : 0) + ')');
    return { status: u.status, ujian: ujian, dispensasi: u.status === 'Layak dengan catatan', alasan: alasan.join(' · '), bolehAju: !!u.bolehAju,
      proses: u.aktif ? u.aktif.status : '' };
  } catch (e) { return ok; }   // gerbang mulai ujian tetap memeriksa ulang
}
// Pasang status kelayakan ke tiap masa pada kartu siswa.
function kuPasangLayak_(masa, idRombel, nama) {
  masa.forEach(function(o) {
    var k = kuKelayakan_(idRombel, nama, { jenis: o.jenis, cakupan: o.cakupan, smt: o.smt });
    o.kelayakan = k;
    o.terkunci = k.status === 'Belum layak';
    o.dispensasi = k.dispensasi;
  });
  return masa;
}
function kuKop_() { try { return kwKop_(); } catch (e) { return { nama: 'PKBM Tunas Harapan', baris: [] }; } }

// ---------- siswa ----------
function waSiswaKartuUjian(token) {
  var s = siswaDariSesi_(token), D = kuData_();
  var id = kuIdentitas_(D, s.idRombel, s.nama);
  id.masa = kuPasangLayak_(kuKartuSiswa_(D, s.idRombel, s.nama, ''), s.idRombel, s.nama);
  // kode akses hanya tampil bila ada masa yang boleh diikuti (layak / dispensasi disetujui)
  if (id.masa.length && id.masa.every(function(m) { return m.terkunci; })) { id.kodeAkses = ''; id.kodeTerkunci = true; }
  id.kop = kuKop_();
  id.dicetak = absHariIni_();
  return id;
}

// ---------- petugas: cetak kartu satu masa (opsional satu rombel e-learning) ----------
function waStafMasaKartu(token, idMasa, idRombel) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var m = muCari_(idMasa);
  if (m.status !== 'Ditetapkan') throw new Error('Kartu peserta dicetak setelah masa ujian ditetapkan.');
  var D = kuData_();
  if (!D.masa[m.id]) D.masa[m.id] = m;   // masa yang sudah lewat tetap bisa dicetak ulang
  if (!D.jadwal.some(function(j) { return j.masa === m.id; })) D.jadwal = D.jadwal.concat(ujJadwalSemua_().filter(function(j) { return j.masa === m.id; }));
  var bm = nilSiswaBm_(), pilih = muPilihNama_(m), dilihat = {}, rombel = {}, out = [], belum = [];
  muKelas_(m).forEach(function(k) {
    rombel[k.idRombel] = true;
    if (idRombel && String(k.idRombel) !== String(idRombel)) return;
    (bm[k.idRombel] || []).forEach(function(sw) {
      var kunci = k.idRombel + '|' + normNama_(sw.nama);
      if (dilihat[kunci] || (pilih && !pilih[normNama_(sw.nama)])) return;
      dilihat[kunci] = true;
      var masa = kuKartuSiswa_(D, k.idRombel, sw.nama, m.id);
      if (!masa.length) return;
      var id = kuIdentitas_(D, k.idRombel, sw.nama);
      id.masa = kuPasangLayak_(masa, k.idRombel, sw.nama);
      if (id.masa[0].terkunci) { belum.push({ nama: id.nama, rombel: id.rombel, alasan: id.masa[0].kelayakan.alasan }); return; }
      out.push(id);
    });
  });
  out.sort(function(a, b) { return (a.rombel + a.nama).localeCompare(b.rombel + b.nama, 'id', { numeric: true }); });
  var nmR = {};
  Object.keys(rombel).forEach(function(r) { try { nmR[r] = getNamaRombel_(r); } catch (e) { nmR[r] = r; } });
  catat_(p.peran, '', p.nama, 'Cetak kartu peserta ujian', m.id + ' ' + m.nama + ': ' + out.length + ' siswa' + (belum.length ? ', ' + belum.length + ' belum layak' : ''), 'OK');
  belum.sort(function(a, b) { return (a.rombel + a.nama).localeCompare(b.rombel + b.nama, 'id', { numeric: true }); });
  return { masa: { id: m.id, nama: m.nama }, kartu: out, belumLayak: belum, rombel: Object.keys(rombel).map(function(r) { return { id: r, nama: nmR[r] }; }).sort(function(a, b) { return a.nama.localeCompare(b.nama, 'id', { numeric: true }); }),
    kop: kuKop_(), dicetak: absHariIni_() };
}

// ---------- v1.94.0: petugas membuat kode akses untuk SEMUA siswa yang belum punya (tanpa membuka mapel satu per satu) ----------
// Kode yang sudah ada TIDAK diubah (kartu yang sudah dicetak tetap berlaku). Hasil: {dibuat, sudahAda, total}
function waStafMasaKodeAkses(token) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var kunci = kmKunciUnik_();
  kunci.waitLock(30000);
  try {
    var sheet = getSheet(CONFIG.SHEETS.SISWA), n = sheet.getLastRow();
    if (n < 2) return { dibuat: 0, sudahAda: 0, total: 0 };
    var v = sheet.getRange(1, 1, n, 4).getValues(), dipakai = {}, kol = [], dibuat = 0, sudah = 0, total = 0;
    for (var a = 1; a < v.length; a++) { var k0 = String(v[a][3] || '').trim().toUpperCase(); if (k0) dipakai[k0] = true; }
    for (var i = 1; i < v.length; i++) {
      var lama = String(v[i][3] || '').trim(), nama = sTeks_(v[i][1]).trim(), idR = sTeks_(v[i][0]).trim();
      kol.push([v[i][3]]);
      if (!nama || !idR) continue;
      total++;
      if (lama) { sudah++; continue; }
      var baru = '', coba = 0;
      do { baru = buatKodeAkses_(CONFIG.PANJANG_KODE_AKSES); coba++; } while (dipakai[baru] && coba < 500);
      if (dipakai[baru]) throw new Error('Gagal membuat kode yang unik. Coba lagi.');
      dipakai[baru] = true;
      kol[kol.length - 1] = [baru];
      dibuat++;
    }
    if (dibuat) sheet.getRange(2, 4, kol.length, 1).setValues(kol);
    catat_(p.peran, '-', p.nama, 'Generate kode akses massal', dibuat + ' kode baru (' + sudah + ' sudah punya)', 'OK');
    return { dibuat: dibuat, sudahAda: sudah, total: total };
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} kunci.releaseLock(); }
}
