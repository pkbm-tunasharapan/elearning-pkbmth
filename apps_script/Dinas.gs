// ============================================================================
// PERAN DINAS PENDIDIKAN (aplikasi 1.29): akun pengawasan, pemantauan, dan penilaian proses kerja lembaga.
// - HANYA MEMBACA. Setiap panggilan dari akun Dinas diperiksa di stafDariToken_ (lihat Peran.gs):
//   fungsi yang tidak ada di DINAS.BACA ditolak di server, apa pun tombol yang tampil di aplikasi.
// - Tidak termasuk pengaturan, data teknis, keuangan/honor, chat internal staf, dan soal ujian.
// - Hanya lewat aplikasi TH.E-Course (Android/web GitHub Pages, pintu doPost); halaman web Apps Script lama ditolak.
// - Di dalam fungsi baca yang diizinkan, akun Dinas diperlakukan setara pimpinan khusus-baca (Kepala Sekolah),
//   lalu peran pada hasil dikembalikan menjadi "Dinas Pendidikan" (dinasRapikan_).
// ============================================================================
var DINAS = {
  PERAN: 'Dinas Pendidikan',
  BACA: {
    waStafProfil: true, waStafProfilAkun: true, waStafKeluar: true, waStafVersiApp: true, waStafBeranda: true,
    waStafDasbor: true, waStafUlangTahun: true,
    waStafAbsenHarianKonteks: true, waStafAbsenHarianDaftar: true, waStafLaporanHadir: true, waStafKsPresensiDaftar: true,
    waStafAbsenKonteks: true, waStafAbsenWbDaftar: true,
    waStafJadwalHari: true, waStafKalender: true, waStafKalenderDaftar: true,
    waStafMateriLengkap: true, waStafSesiBaca: true, waStafSesiDiskusi: true,
    waStafKurikulumBaca: true, waStafKurikulumBacaan: true, waStafKurikulumPeta: true, waStafKerangka: true,
    waStafRppDaftarMapel: true, waStafRppBaca: true, waStafRppPdf: true, waStafRppCp: true,
    waStafMediaAjarDaftar: true, waStafCatatanNilai: true,
    waStafBelumDinilai: true, waStafNilaiKelas: true, waStafNilaiRekap: true, waStafNilaiAturan: true,
    waStafLeger: true, waStafKenaikanDaftar: true, waStafBiodataRombel: true, waStafHtmlPdf: true, waStafWaliDaftar: true,
    waStafProgresDaftar: true, waStafProgresKelas: true, waStafKesiapanSemua: true,
    waStafRombelSiswa: true, waStafIndukDaftar: true, waStafKinerjaTutor: true
  },
  TABEL_INDUK_DILARANG: { pengaturan: true }
};

function dinasSaring_(p) {
  var fn = String(globalThis.__API_FN || '');
  if (!fn) throw new Error('Akun Dinas Pendidikan hanya dapat dipakai lewat aplikasi TH.E-Course (Android atau web).');
  if (DINAS.BACA[fn] !== true) throw new Error('Akun Dinas Pendidikan hanya dapat melihat data untuk pengawasan. Tindakan ini tidak diizinkan.');
  var args = globalThis.__API_ARGS || [];
  if (fn === 'waStafIndukDaftar' && DINAS.TABEL_INDUK_DILARANG[String(args[1] || '')]) throw new Error('Data pengaturan tidak tersedia untuk akun Dinas Pendidikan.');
  globalThis.__DINAS = true;
  var q = {};
  Object.keys(p).forEach(function(k) { q[k] = p[k]; });
  q.peran = 'Kepala Sekolah';
  q.peranAsli = DINAS.PERAN;
  return q;
}

// Mengembalikan label peran pada hasil (mis. profil) menjadi "Dinas Pendidikan".
function dinasRapikan_(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (data.peran === 'Kepala Sekolah') data.peran = DINAS.PERAN;
  if (data.saya && data.saya.peran === 'Kepala Sekolah') data.saya.peran = DINAS.PERAN;
  if (data.profil && data.profil.peran === 'Kepala Sekolah') data.profil.peran = DINAS.PERAN;
  data.hanyaBaca = true;
  return data;
}

// Jalankan sekali dari editor (Run): menambahkan "Dinas Pendidikan" ke pilihan peran pada sheet Pengguna.
function aturValidasiPeranDinas() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PERAN.SHEET_PENGGUNA);
  if (!sh) return 'Sheet pengguna tidak ditemukan.';
  var aturan = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Front Office', 'Bendahara', DINAS.PERAN], true)
    .setAllowInvalid(false).build();
  sh.getRange(2, 3, Math.max(1, sh.getMaxRows() - 1), 1).setDataValidation(aturan);
  return 'Pilihan peran diperbarui.';
}
