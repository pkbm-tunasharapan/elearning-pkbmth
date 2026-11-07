// ============================================================================
// PERAN DINAS PENDIDIKAN (aplikasi 1.29): akun pengawasan, pemantauan, dan penilaian proses kerja lembaga.
// - HANYA MEMBACA. Setiap panggilan dari akun Dinas diperiksa di stafDariToken_ (lihat Peran.gs):
//   fungsi yang tidak ada di DINAS.BACA ditolak di server, apa pun tombol yang tampil di aplikasi.
// - Tidak termasuk pengaturan, data teknis, keuangan/honor, chat internal staf, dan soal ujian.
// - 1.34.1: HANYA LIHAT kegiatan belajar mengajar (operasional KBM). Hal manajerial (data induk, kinerja tutor,
//   presensi Kepala Sekolah, usulan/persetujuan, keuangan, kelengkapan data) tidak tersedia. Tanpa unduh/cetak/ekspor,
//   tanpa fungsi AI yang menulis data, dan tanpa kewajiban absen (Dinas bukan bagian lembaga).
// - Hanya lewat aplikasi TH.E-Course (Android/web GitHub Pages, pintu doPost); halaman web Apps Script lama ditolak.
// - Di dalam fungsi baca yang diizinkan, akun Dinas diperlakukan setara pimpinan khusus-baca (Kepala Sekolah),
//   lalu peran pada hasil dikembalikan menjadi "Dinas Pendidikan" (dinasRapikan_).
// ============================================================================
var DINAS = {
  PERAN: 'Dinas Pendidikan',
  BACA: {
    waStafProfil: true, waStafProfilAkun: true, waStafKeluar: true, waStafVersiApp: true, waStafBeranda: true,
    waStafDasbor: true, waStafUlangTahun: true,
    waStafAbsenHarianKonteks: true, waStafAbsenHarianDaftar: true, waStafLaporanHadir: true,
    waStafAbsenKonteks: true, waStafAbsenWbDaftar: true,
    waStafJadwalHari: true, waStafKalender: true, waStafKalenderDaftar: true,
    waStafMateriLengkap: true, waStafSesiBaca: true, waStafSesiDiskusi: true,
    waStafKurikulumBaca: true, waStafKerangka: true,
    waStafRppDaftarMapel: true, waStafRppBaca: true,
    waStafMediaAjarDaftar: true, waStafCatatanNilai: true,
    waStafBelumDinilai: true, waStafNilaiKelas: true, waStafNilaiRekap: true, waStafNilaiAturan: true,
    waStafLeger: true, waStafKenaikanDaftar: true, waStafWaliDaftar: true,
    waStafProgresDaftar: true, waStafProgresKelas: true, waStafKesiapanSemua: true,
    waStafRombelSiswa: true,
    // daftar pantauan (1.34.1): hanya membaca; tombol ubah dimatikan oleh dinasRapikan_
    waStafPemetaanDaftar: true, waStafAsesmenDaftar: true, waStafAsesmenPeserta: true
  },
  // Kartu beranda yang berisi tugas/aksi lembaga (absen, persetujuan, keuangan) tidak ditampilkan untuk Dinas.
  MENU_KARTU_DILARANG: { dataInduk: true, kinerja: true, pengguna: true, absenSaya: true, absenTutor: true, usulanJadwal: true, persetujuanKs: true, keuangan: true, rekapHonor: true, honor: true, kodeDarurat: true, referral: true, referralAdmin: true },
  // Penanda izin pada hasil API yang selalu dimatikan untuk Dinas.
  POLA_IZIN: /^(boleh|bisa|dapat)[A-Z]?|^(kelola|tulis|kartu|presensi|admin|milikSaya)$/,
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
  dinasMatikanIzin_(data, 0);
  if (globalThis.__API_FN === 'waStafLaporanHadir') delete data.ks;
  if (globalThis.__API_FN === 'waStafDasbor') ['tanpaNisn', 'tanpaNik', 'tanpaBiodata', 'tanpaRombel'].forEach(function(k) { delete data[k]; });
  if (Array.isArray(data.kartu)) {
    data.kartu = data.kartu.filter(function(k) {
      return !(k && (DINAS.MENU_KARTU_DILARANG[k.menu] || /absen saya|persetujuan|tagihan|honor/i.test(String(k.judul || ''))));
    });
  }
  data.hanyaBaca = true;
  return data;
}

// Mematikan penanda izin (boleh*, bisa*, dapat*, kelola, tulis, ...) bernilai true pada objek hasil.
// Isi larik (mis. daftar peserta dengan "boleh" = memenuhi syarat) tidak disentuh.
function dinasMatikanIzin_(o, dalam) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || dalam > 2) return;
  Object.keys(o).forEach(function(k) {
    var v = o[k];
    if (v === true && DINAS.POLA_IZIN.test(k)) o[k] = false;
    else if (v && typeof v === 'object' && !Array.isArray(v)) dinasMatikanIzin_(v, dalam + 1);
  });
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
