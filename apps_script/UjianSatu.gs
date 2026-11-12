// ============================================================================
// SATU PINTU UJIAN (v1.63.0)
// - Kalender akademik menandai area UTS, UAS (semua rombel) dan UPK (Ujian Pendidikan Kesetaraan, ujian kelulusan;
//   hanya rombel kelas akhir: kelas 6 / 9 / 12) sesuai pembagian materi kurikulum (pengaturan Tahun Ajaran).
// - Pelaksanaan ujian hanya lewat Masa Ujian Serentak. Saat dibuka, Masa Ujian menawarkan DRAF dari kalender
//   (nama, rentang tanggal, cakupan, peserta) yang bisa langsung disetujui atau diubah dulu.
// - Tiap jadwal mapel bisa Online (aplikasi) atau Offline (ujian tulis; naskah dari bank soal, nilai diinput tutor).
// - Menu lama (Jadwal Ujian Kertas Tatap Muka, Asesmen Tatap Muka) disembunyikan; datanya tetap tersimpan.
// ============================================================================

// Rombel kelas akhir dari nama rombel (angka kelas terakhir 6, 9, atau 12; mis. "A6", "B9", "C12", "Kelas 12 IPS").
function ujsKelasAkhir_(nama) {
  var m = /(\d{1,2})(?!.*\d)/.exec(String(nama || ''));
  return !!m && [6, 9, 12].indexOf(Number(m[1])) >= 0;
}
// ID rombel SIM kelas akhir yang aktif.
function muRombelAkhir_() {
  var rb = honProgramRombel_();
  return Object.keys(rb).filter(function(id) { return id && ujsKelasAkhir_(rb[id].nama); }).sort();
}

// Draf masa ujian dari kalender akademik (belum lewat & belum dibuat).
function ujsDraf_(cfg, nowMs, masa, rombelAkhir) {
  var hari = Utilities.formatDate(new Date(nowMs), Session.getScriptTimeZone(), 'yyyy-MM-dd'), out = [];
  var ada = {};
  masa.forEach(function(m) { if (m.jenis === 'UTS' || m.jenis === 'UAS' || m.jenis === 'UPK') ada[m.jenis + '|' + m.smt] = m.id; });
  var tambah = function(jenis, smt, n, cakupanTeks, peserta) {
    if (!(n >= 1 && n <= cfg.sesiPerSemester)) return;
    var info = taInfo_(cfg, smt, n, nowMs);
    if (info.selesaiIso < hari) return;
    out.push({ jenis: jenis, smt: smt, sesi: n, nama: (jenis === 'UPK' ? 'UPK' : jenis) + ' Semester ' + smt + ' ' + (cfg.label || ''),
      dari: info.mulaiIso, sampai: info.selesaiIso, rentang: info.rentang, cakupanTeks: cakupanTeks, peserta: peserta,
      sudah: ada[jenis + '|' + smt] || '' });
  };
  for (var smt = 1; smt <= Math.min(2, cfg.jumlahSemester); smt++) {
    tambah('UTS', smt, cfg.uts, 'Materi Sesi 1–' + (cfg.uts - 1) + ' Semester ' + smt + ' (sesuai kurikulum)', { mode: 'semua' });
    tambah('UAS', smt, cfg.uas, 'Seluruh materi Semester ' + smt + ' (sesuai kurikulum)', { mode: 'semua' });
  }
  if (cfg.upk > 0 && rombelAkhir.length) tambah('UPK', 2, cfg.upk, 'Seluruh materi jenjang untuk kelas akhir (6, 9, 12)', { mode: 'rombel', rombel: rombelAkhir });
  out.sort(function(a, b) { return a.dari.localeCompare(b.dari); });
  return out;
}
function waStafMasaDraf(token) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var cfg = taBaca_(), kkm = 70;
  try { kkm = nilAturan_().kkm; } catch (e) {}
  var masa = muSemua_();
  return { draf: ujsDraf_(cfg, Date.now(), masa, muRombelAkhir_()), kkm: kkm, upkDiatur: cfg.upk > 0 };
}
