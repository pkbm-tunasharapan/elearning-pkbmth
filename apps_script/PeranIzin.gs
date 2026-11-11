// ============================================================================
// PERAN & IZIN (v1.41.0, Tahap 1)
// ----------------------------------------------------------------------------
// - Peran bawaan: 8 peran lama. Peran baru (kustom) dibuat admin dan selalu punya PERAN DASAR (salah satu peran
//   bawaan) yang menentukan cakupan data & logika (mis. "Wali Kelas" berdasar Tutor tetap hanya melihat kelasnya).
// - Pengguna berperan kustom: di server diperlakukan sebagai peran dasarnya (p.peran = dasar, p.peranKustom = nama).
// - Izin per fitur: 'tidak' | 'lihat' | 'ubah'. Bawaan = sama dengan perilaku sekarang (tidak ada yang berubah
//   sebelum admin menurunkan izin). Tahap 1 hanya MEMBATASI di bawah peran dasar; menambah fitur di luar peran
//   dasar = Tahap 2.
// - Penegakan: menu aplikasi mengikuti izin (waStafProfil.izin) DAN setiap panggilan server diperiksa di
//   stafDariToken_ lewat peta fungsi -> fitur (IZN.FITUR) + jenis aksi (baca/ubah).
// - Admin bawaan selalu penuh dan tidak dapat diubah/dihapus. Semua perubahan tercatat di Log Aktivitas.
// ============================================================================
var IZN = {
  TAB_PERAN: 'Peran', HDR_PERAN: ['NAMA', 'PERAN DASAR', 'DESKRIPSI', 'STATUS', 'DIUBAH OLEH', 'DIUBAH PADA', 'CAKUPAN'],
  // v1.41.2 (Tahap 3): cakupan data peran kustom: '' = sesuai peran dasar, 'semua' = semua rombel untuk MELIHAT
  CAKUPAN_LUAS: ['Kepala Sekolah', 'Koordinator Kurikulum', 'Superadmin', 'Admin'],
  TAB_IZIN: 'Izin Peran', HDR_IZIN: ['PERAN', 'FITUR', 'TINGKAT', 'DIUBAH OLEH', 'DIUBAH PADA'],
  BAWAAN: ['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Front Office', 'Bendahara', 'Dinas Pendidikan'],
  CK: 'izn_v1', TINGKAT: ['tidak', 'lihat', 'ubah'],
  // fungsi untuk semua staf (profil, beranda, notifikasi, cetak, kalender, ...): tidak diatur per peran
  UMUM: /^waStaf(Login|MasukGoogle|MasukSso|Keluar|Profil|ProfilAkun|ProfilAkunSimpan|ProfilAsliDt|VersiApp|Beranda|Dasbor|UlangTahun|UcapkanUlangTahun|LaporGalat|Hangatkan|HtmlPdf|RuangCek|RuangPoll|Kartu|UjianKotak|Kalender|KalenderDaftar|NilaiAturan|SesiDaftar|Kerangka|Promosi)$/,
  // fungsi BACA (cukup izin "lihat"); selain ini dianggap UBAH
  BACA: /(Daftar\w*|Baca\w*|Konteks|Info|Lengkap|Rekap|Laporan\w*|Leger|Kelas|Rapor|Cari|Pratinjau|Format|Pdf|Peta|Isi|Tab|Log|Berkas|Hari|Aturan|Data|Naskah|Rinci|Aktif|Saya|Tunggakan\w*|Prompt\w*|BiodataRombel|Jawaban|Terkunci|Qr|Performa|Semua|Bacaan|Soal|Status|SesiDiskusi|CatatanNilai|KinerjaTutor|BelumDinilai|^waStaf(Nilai|Absensi|Siswa|Materi|RombelSiswa|LaporanHadir)$)$/,
  TULIS_PAKSA: { waStafMateriStatus: true, waAdminCekDataJadwal: true, waAdminSusulanAkhiri: true },
  BACA_PAKSA: { waStafAsesmenPeserta: true, waStafKartuPeserta: true, waStafRefAdmin: true, waStafTranskrip: true },
  // [id fitur (= id menu), judul, kelompok, peran bawaan yang punya fitur ini, pola fungsi]
  FITUR: [
    ['pengguna', 'Kelola Tutor & Enrollment', 'Pengguna & Komunikasi', ['Admin'], /^waAdmin(Daftar|SimpanPengguna|SetEnrollment|ResetKode)$/],
    ['peranIzin', 'Peran & Izin', 'Sistem', ['Admin'], /^waAdminPeran\w*$/],
    ['mapelSaya', 'Mata Pelajaran (konten, kurikulum, ujian, media ajar)', 'Akademik', ['Admin', 'Tutor', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Superadmin', 'Dinas Pendidikan'],
      /^waStaf(Materi|MateriLengkap|MateriSimpan|MateriStatus|MateriHapus|MateriHapusMassal|SesiBaca|SesiDiskusi|DiskusiJawaban|DiskusiNilaiAi|DiskusiSimpanNilai|CatatanNilai|Nilai|Absensi|Siswa|KodeAkses(Daftar|Generate)|BukaKunci|BukaSesi|BukaSesiCabut|BukaSesiDaftar|Ujian(Terkunci|Info|Simpan|Pratinjau|PerubahanAjukan)|Soal(Daftar|Simpan|Hapus)|MediaAjar\w*|Ai\w*|Kurikulum\w*|AjuTutorProses)$/],
    ['absensi', 'Absensi Warga Belajar', 'Absensi', ['Admin', 'Tutor', 'Kepala Sekolah'], /^waStafAbsen(Harian\w*|Konteks|WbCatat|WbDaftar)$/],
    ['absenTutor', 'Absen Tutor', 'Absensi', ['Admin', 'Kepala Sekolah', 'Front Office'], /^waStafAbsenTutor(Cari|Catat)$/],
    ['absenSaya', 'Absen Saya (Kepala Sekolah)', 'Absensi', ['Kepala Sekolah'], /^waStafKs(AbsenMasuk|AbsenStatus|Foto|IzinAjukan)$/],
    ['persetujuanKs', 'Persetujuan Kehadiran KS', 'Absensi', ['Superadmin'], /^waStafKs(PresensiDaftar|PresensiDaftarInti|Putus)$/],
    ['laporanHadir', 'Laporan Kehadiran', 'Absensi', ['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Front Office', 'Dinas Pendidikan'], /^waStafLaporanHadir$/],
    ['kodeDarurat', 'Kode Darurat FO', 'Absensi', ['Kepala Sekolah'], /^waStafKodeDarurat(Buat|Daftar)$/],
    ['aturAbsensi', 'Pengaturan Absensi', 'Absensi', ['Admin'], /^waAdminAbsen\w*$/],
    ['jadwal', 'Jadwal', 'Jadwal', ['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Front Office', 'Dinas Pendidikan'], /^waStaf(JadwalHari|Pemetaan(Daftar|Simpan|SimpanBanyak|Hapus))$/],
    ['usulanJadwal', 'Usulan Jadwal', 'Jadwal', ['Admin', 'Kepala Sekolah', 'Tutor'], /^waStafUsulan(Ajukan|Daftar|Putus)$/],
    ['aturJadwal', 'Pengaturan Jadwal', 'Jadwal', ['Admin'], /^wa(StafJadwalAturan|AdminJadwalAturanSimpan)$/],
    ['kalender', 'Kalender Akademik', 'Jadwal', ['Admin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Dinas Pendidikan'], null],
    ['nilaiRapor', 'Nilai & Rapor', 'Nilai & Ujian', ['Admin', 'Kepala Sekolah', 'Tutor', 'Dinas Pendidikan'],
      /^wa(Staf(NilaiKelas|NilaiRekap|NilaiInput|NilaiFormat|NilaiUnggah\w*|Leger|Rapor|Transkrip|Kenaikan(Daftar|Simpan)|BiodataRombel|KartuPeserta)|AdminNilaiOtomatis)$/],
    ['waliKelas', 'Wali Kelas', 'Nilai & Ujian', ['Admin', 'Kepala Sekolah'], /^waStafWali(Daftar|Simpan)$/],
    ['asesmen', 'Asesmen Tatap Muka', 'Nilai & Ujian', ['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Front Office'], /^waStafAsesmen\w*$/],
    ['ujianTerpusat', 'Jadwal Ujian Tatap Muka', 'Nilai & Ujian', ['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor'], /^waStafUjt\w*$/],
    ['kotakUjian', 'Kotak Ujian (pengajuan ujian)', 'Nilai & Ujian', ['Admin', 'Tutor', 'Kepala Sekolah', 'Koordinator Kurikulum'], /^waAdminUjian(BukaAkses|Disposisi|Tolak)$/],
    ['dispensasi', 'Dispensasi Ujian', 'Nilai & Ujian', ['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum'], /^waStafDispensasi\w*$/],
    ['nilai', 'Belum Dinilai', 'Nilai & Ujian', ['Admin', 'Tutor', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Dinas Pendidikan'], /^wa(StafBelumDinilai|AdminTugasNilaiOtomatis)$/],
    ['otoNilai', 'Penilaian Otomatis', 'Nilai & Ujian', ['Admin', 'Superadmin'], /^waAdminOtoNilai\w*$/],
    ['aturNilai', 'Aturan Nilai', 'Nilai & Ujian', ['Admin'], /^waAdminNilaiAturanSimpan$/],
    ['rpp', 'Dokumen RPP', 'Akademik', ['Admin', 'Tutor', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Superadmin', 'Dinas Pendidikan'], /^waStafRpp\w*$/],
    ['progres', 'Progres Kelas & Kesiapan', 'Akademik', ['Admin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Dinas Pendidikan'], /^waStaf(Progres\w*|KesiapanSemua)$/],
    ['kinerja', 'Kinerja Tutor', 'Akademik', ['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor'], /^waStafKinerjaTutor$/],
    ['cp', 'CP · TP · ATP', 'Akademik', ['Admin'], /^waAdminKerangka\w*$/],
    ['kelolaMapel', 'Kelola Mata Pelajaran', 'Akademik', ['Admin'], /^waAdmin(DaftarMapel|SimpanMapel)$/],
    ['ta', 'Tahun Ajaran', 'Akademik', ['Admin'], /^wa(AdminTa(Baca|Simpan)|StafTahunBaru\w*)$/],
    ['susulan', 'Buka Susulan Massal', 'Akademik', ['Admin'], /^waAdminSusulan\w*$/],
    ['siswaRombel', 'Siswa per Rombel (termasuk reset PIN)', 'Warga Belajar', ['Admin', 'Tutor', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Dinas Pendidikan'], /^waStaf(RombelSiswa|PinReset)$/],
    ['dataInduk', 'Data Induk', 'Warga Belajar', ['Admin', 'Superadmin', 'Kepala Sekolah'], /^waStafInduk\w*$/],
    ['imporDapodik', 'Impor Dapodik & data master', 'Warga Belajar', ['Admin'], /^waAdmin(Dapodik\w*|Impor\w*|Siswa(Pratinjau|Terapkan))$/],
    ['kartuQr', 'Kartu QR Siswa (ID Card)', 'Warga Belajar', ['Admin', 'Front Office'], /^waAdminKartuQr$/],
    ['daftar', 'Pendaftaran Siswa', 'Warga Belajar', ['Admin'], /^waAdmin(DaftarPendaftaran|AturDaftar)$/],
    ['ganda', 'Sinkron & Data Ganda', 'Warga Belajar', ['Admin'], /^waAdmin(Ganda\w*|Sinkron\w*|KirimKeMenu|SamakanInduk)$/],
    ['referral', 'Referral Pendaftaran', 'Warga Belajar', ['Admin', 'Superadmin', 'Tutor', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Front Office', 'Bendahara'], /^waStafRef(Aturan|Berkas)$/],
    ['referralAdmin', 'Kelola Referral & Pendaftaran', 'Warga Belajar', ['Admin', 'Superadmin', 'Kepala Sekolah', 'Front Office', 'Bendahara'], /^wa(StafRef(Admin|Verif\w*|Tarik\w*|Kembali\w*)|AdminRefAturanSimpan)$/],
    ['keuangan', 'Keuangan & Tagihan', 'Keuangan', ['Admin', 'Bendahara', 'Superadmin', 'Kepala Sekolah'], /^waStaf(Keu\w*|Tagihan\w*|TunggakanWb)$/],
    ['rekapHonor', 'Rekap Honor', 'Keuangan', ['Admin', 'Superadmin', 'Kepala Sekolah', 'Bendahara'], /^waStafHonor(Rekap|Hitung|Setujui|BatalSetuju|Bayar|BayarBatal|Bukti|Tunggakan|Aturan)$/],
    ['honorSaya', 'Saldo Honor (tutor)', 'Keuangan', ['Tutor'], /^waStafHonorSaya$/],
    ['aturHonor', 'Aturan Honor', 'Keuangan', ['Admin'], /^waAdminHonorAturanSimpan$/],
    ['broadcast', 'Broadcast Pemberitahuan', 'Pengguna & Komunikasi', ['Admin'], /^waAdminBroadcast\w*$/],
    ['promosi', 'Popup Promosi', 'Pengguna & Komunikasi', ['Admin'], /^wa(AdminPromosiSimpan|StafPromosiAtur)$/],
    ['ruangStaf', 'Ruang Staf & chat kelas', 'Pengguna & Komunikasi', ['Admin', 'Tutor', 'Kepala Sekolah', 'Koordinator Kurikulum'], /^waStafRuang(Daftar|Kirim)$/],
    ['pengajuanTutor', 'Pengajuan Tutor', 'Pengguna & Komunikasi', ['Admin'], /^waAdminTutor\w*$/],
    ['arsip', 'Arsip Data & data offline', 'Sistem', ['Admin', 'Kepala Sekolah'], /^wa(StafArsip\w*|AdminArsip\w*|AdminOffline\w*)$/],
    ['log', 'Log Aktivitas & performa', 'Sistem', ['Admin'], /^waAdmin(Log|Performa)$/],
    ['pemeliharaan', 'Pemeliharaan Sistem (versi, cek data, galat, cadangan)', 'Sistem', ['Admin'], /^waAdmin(Rilis\w*|CekData\w*|LogGalat\w*|CadanganSekarang)$/],
    ['maintenance', 'Maintenance', 'Sistem', ['Admin'], /^waStafMaintenance\w*$/],
    ['ai', 'Pengaturan AI', 'Sistem', ['Admin'], /^waAdminAi\w*$/],
    ['reset', 'Reset Data', 'Sistem', ['Admin'], /^waAdminReset(Data|Rencana)$/]
  ],
  // menu aplikasi yang memakai fitur lain (id menu -> id fitur)
  MENU_ALIAS: { rppSemua: 'rpp' },
  // v1.41.1 (Tahap 2): fitur yang TIDAK dapat diberikan di luar peran dasarnya (keamanan / melekat pada orangnya)
  KUNCI: { peranIzin: true, pengguna: true, reset: true, maintenance: true, pemeliharaan: true, ai: true, absenSaya: true, honorSaya: true },
  // urutan peran "pelaksana" untuk fitur tambahan: lihat = paling ringan yang punya fitur; ubah = Admin bila ada
  URUT_LIHAT: ['Kepala Sekolah', 'Koordinator Kurikulum', 'Superadmin', 'Bendahara', 'Front Office', 'Tutor', 'Admin'],
  URUT_UBAH: ['Admin', 'Kepala Sekolah', 'Superadmin', 'Koordinator Kurikulum', 'Bendahara', 'Front Office', 'Tutor']
};

// Peran bawaan yang menjalankan fitur tambahan (fitur di luar peran dasar yang diberikan admin).
function izProksi_(f, tingkat) {
  var urut = tingkat === 'ubah' ? IZN.URUT_UBAH : IZN.URUT_LIHAT;
  for (var i = 0; i < urut.length; i++) if (f[3].indexOf(urut[i]) >= 0) return urut[i];
  return '';
}
function izBisaTambah_(f, dasar) { return !IZN.KUNCI[f[0]] && f[3].indexOf(dasar) < 0 && !!izProksi_(f, 'lihat'); }
function izMaks_(dasar) { return dasar === 'Dinas Pendidikan' ? 'lihat' : 'ubah'; }   // Dinas selalu hanya lihat

// ---------- katalog ----------
function izFitur_(fn) {
  fn = String(fn || '');
  if (IZN.UMUM.test(fn)) return 'umum';
  for (var i = 0; i < IZN.FITUR.length; i++) { var f = IZN.FITUR[i]; if (f[4] && f[4].test(fn)) return f[0]; }
  return '';
}
function izAksi_(fn) { return IZN.TULIS_PAKSA[fn] ? 'ubah' : (IZN.BACA_PAKSA[fn] || IZN.BACA.test(String(fn)) ? 'lihat' : 'ubah'); }
function izNilai_(t) { return IZN.TINGKAT.indexOf(t); }

// ---------- data peran & izin (cache 10 menit) ----------
var IZN_MEMO_ = null;   // per eksekusi: bacaPengguna_ memanggil izPeranKustom_ untuk setiap baris
function izData_() {
  if (IZN_MEMO_) return IZN_MEMO_;
  var c = CacheService.getScriptCache();
  try { var lama = c.get(IZN.CK); if (lama) return (IZN_MEMO_ = JSON.parse(lama)); } catch (e) {}
  var out = { peran: {}, izin: {} };
  try {
    var tp = absBaca_(IZN.TAB_PERAN, IZN.HDR_PERAN);
    for (var i = 1; i < tp.v.length; i++) {
      var nm = sTeks_(absNilai_(tp, tp.v[i], 'NAMA')).trim();
      if (!nm) continue;
      out.peran[nm.toLowerCase()] = { nama: nm, dasar: sTeks_(absNilai_(tp, tp.v[i], 'PERAN DASAR')).trim(), deskripsi: sTeks_(absNilai_(tp, tp.v[i], 'DESKRIPSI')),
        status: sTeks_(absNilai_(tp, tp.v[i], 'STATUS')).trim() || 'Aktif', cakupan: sTeks_(absNilai_(tp, tp.v[i], 'CAKUPAN')).trim() === 'semua' ? 'semua' : '' };
    }
    var ti = absBaca_(IZN.TAB_IZIN, IZN.HDR_IZIN);
    for (var j = 1; j < ti.v.length; j++) {
      var pr = sTeks_(absNilai_(ti, ti.v[j], 'PERAN')).trim(), ft = sTeks_(absNilai_(ti, ti.v[j], 'FITUR')).trim(), tk = sTeks_(absNilai_(ti, ti.v[j], 'TINGKAT')).trim().toLowerCase();
      if (pr && ft && izNilai_(tk) >= 0) (out.izin[pr] = out.izin[pr] || {})[ft] = tk;
    }
  } catch (e2) {}
  try { c.put(IZN.CK, JSON.stringify(out), 600); } catch (e3) {}
  return (IZN_MEMO_ = out);
}
function izHapusCache_() {
  IZN_MEMO_ = null;
  try { CacheService.getScriptCache().remove(IZN.CK); } catch (e) {}
  try { CacheService.getScriptCache().remove(PERF.CACHE_PENGGUNA); } catch (e2) {}
}

// Nama peran kustom yang sah -> {nama, dasar}; null bila bukan peran kustom aktif.
function izPeranKustom_(nama) {
  var k = String(nama || '').trim().toLowerCase();
  if (!k) return null;
  var r = izData_().peran[k];
  return r && r.status !== 'Nonaktif' && IZN.BAWAAN.indexOf(r.dasar) >= 0 ? r : null;
}

// Izin satu peran (kunci = nama peran kustom atau peran bawaan): {fitur: tingkat}
function izPetaPeran_(kunci, dasar) {
  var d = izData_(), simpan = d.izin[kunci] || {}, out = {};
  IZN.FITUR.forEach(function(f) {
    if (f[3].indexOf(dasar) < 0) {
      // v1.41.1 (Tahap 2): fitur tambahan hanya bila diberikan admin ('lihat' / 'ubah')
      if (izBisaTambah_(f, dasar) && izNilai_(simpan[f[0]]) > 0) out[f[0]] = izNilai_(simpan[f[0]]) > izNilai_(izMaks_(dasar)) ? izMaks_(dasar) : simpan[f[0]];
      return;
    }
    var bawaan = dasar === 'Dinas Pendidikan' ? 'lihat' : 'ubah';
    out[f[0]] = simpan[f[0]] || bawaan;
    if (izNilai_(out[f[0]]) > izNilai_(bawaan)) out[f[0]] = bawaan;
  });
  return out;
}
function izPetaPengguna_(p) {
  if (!p) return {};
  var kunci = p.peranKustom || (p.peranAsli || p.peran), dasar = p.peranAsli || p.peran;
  if (!p.peranKustom && dasar === 'Admin') { var semua = {}; IZN.FITUR.forEach(function(f) { semua[f[0]] = 'ubah'; }); return semua; }
  return izPetaPeran_(kunci, dasar);
}

// Penjaga pusat: dipanggil stafDariToken_ untuk fungsi tingkat atas (globalThis.__API_FN).
// Mengembalikan p yang dipakai fungsi: p apa adanya, atau (Tahap 2) salinan p dengan peran pelaksana bila fungsi
// ini milik fitur tambahan yang diberikan admin. Wewenang pelaksana hanya berlaku untuk fungsi fitur itu.
function izPeriksa_(p) {
  var fn = String(globalThis.__API_FN || '');
  if (!fn || !/^wa(Staf|Admin)/.test(fn)) return p;
  if (globalThis.__IZN_OK === fn) return globalThis.__IZN_PROKSI ? izTerapkanProksi_(p, globalThis.__IZN_PROKSI) : p;
  globalThis.__IZN_PROKSI = null;
  var fitur = izFitur_(fn);
  if (!fitur || fitur === 'umum') { globalThis.__IZN_OK = fn; return p; }
  var dasar = p.peranAsli || p.peran;
  if (!p.peranKustom && dasar === 'Admin') { globalThis.__IZN_OK = fn; return p; }
  var peta = izPetaPengguna_(p), punya = peta[fitur], perlu = izAksi_(fn);
  var ftr = IZN.FITUR.filter(function(f) { return f[0] === fitur; })[0];
  if (ftr && ftr[3].indexOf(dasar) < 0) {
    // fitur di luar peran dasar: bila diberikan admin dan tingkatnya cukup -> jalankan sebagai peran pelaksana;
    // selain itu pemeriksaan lama yang berlaku (perilaku sebelum Tahap 2 tidak berubah)
    if (izNilai_(punya) >= izNilai_(perlu) && izNilai_(perlu) > 0) {
      var prx = { fitur: fitur, peran: izProksi_(ftr, perlu === 'ubah' ? 'ubah' : 'lihat') };
      if (prx.peran) { globalThis.__IZN_OK = fn; globalThis.__IZN_PROKSI = prx; return izTerapkanProksi_(p, prx); }
    }
    globalThis.__IZN_OK = fn;
    return p;
  }
  if (izNilai_(punya) >= izNilai_(perlu) && perlu === 'lihat' && p.peranKustom && dasar !== 'Dinas Pendidikan') {
    var kp = izData_().peran[String(p.peranKustom).toLowerCase()], pl = ftr ? izProksi_(ftr, 'lihat') : '';
    if (kp && kp.cakupan === 'semua' && pl && pl !== dasar && IZN.CAKUPAN_LUAS.indexOf(pl) >= 0 && IZN.CAKUPAN_LUAS.indexOf(dasar) < 0) {
      var prc = { fitur: fitur, peran: pl };
      globalThis.__IZN_OK = fn; globalThis.__IZN_PROKSI = prc;
      return izTerapkanProksi_(p, prc);
    }
  }
  if (izNilai_(punya) < izNilai_(perlu)) {
    throw new Error('Peran ' + (p.peranKustom || dasar) + ' tidak memiliki izin ' + (perlu === 'ubah' ? 'mengubah' : 'membuka') + ' fitur "' + (ftr ? ftr[1] : fitur) + '". Hubungi admin.');
  }
  globalThis.__IZN_OK = fn;
  return p;
}
// v1.41.2: Dinas (atau peran berdasar Dinas) boleh memanggil fungsi BACA dari fitur yang izinnya >= lihat.
function izDinasBoleh_(fn, p) {
  var fitur = izFitur_(fn);
  if (!fitur || fitur === 'umum' || IZN.KUNCI[fitur] || izAksi_(fn) !== 'lihat') return false;
  var peta = izPetaPeran_((p && p.peranKustom) || 'Dinas Pendidikan', 'Dinas Pendidikan');
  return izNilai_(peta[fitur]) >= izNilai_('lihat');
}
function izTerapkanProksi_(p, prx) {
  var q = {};
  Object.keys(p).forEach(function(k) { q[k] = p[k]; });
  q.peranDasarAsli = p.peranAsli || p.peran;
  q.peran = prx.peran;
  q.proksi = prx.fitur;
  if (!q.peranKustom) q.peranKustom = q.peranDasarAsli;   // tetap ditandai bukan Admin utama
  return q;
}

// ---------- endpoint admin ----------
function izWajibAdminBawaan_(token) {
  var p = wajibAdmin_(token);
  if (p.peranKustom) throw new Error('Pengaturan peran hanya untuk Admin utama.');
  return p;
}
function izRingkasPeran_() {
  var d = izData_(), jumlah = {};
  bacaPengguna_().forEach(function(u) { var k = u.peranKustom || u.peran; jumlah[k] = (jumlah[k] || 0) + 1; });
  var out = IZN.BAWAAN.map(function(n) { return { nama: n, dasar: n, deskripsi: '', status: 'Aktif', bawaan: true, terkunci: n === 'Admin', pengguna: jumlah[n] || 0 }; });
  Object.keys(d.peran).forEach(function(k) {
    var r = d.peran[k];
    out.push({ nama: r.nama, dasar: r.dasar, deskripsi: r.deskripsi, status: r.status, cakupan: r.cakupan || '', bawaan: false, terkunci: false, pengguna: jumlah[r.nama] || 0 });
  });
  return out;
}
function waAdminPeranDaftar(token) {
  izWajibAdminBawaan_(token);
  return {
    peran: izRingkasPeran_(),
    fitur: IZN.FITUR.map(function(f) { return { id: f[0], judul: f[1], kelompok: f[2], peran: f[3], kunci: !!IZN.KUNCI[f[0]], pelaksanaLihat: izProksi_(f, 'lihat'), pelaksanaUbah: izProksi_(f, 'ubah') }; }),
    menuAlias: IZN.MENU_ALIAS
  };
}
function waAdminPeranIzin(token, nama) {
  izWajibAdminBawaan_(token);
  var r = izRingkasPeran_().filter(function(x) { return x.nama === nama; })[0];
  if (!r) throw new Error('Peran tidak ditemukan.');
  return { peran: r, izin: r.terkunci ? izPetaPengguna_({ peran: 'Admin' }) : izPetaPeran_(r.nama, r.dasar) };   // termasuk fitur tambahan
}
function izNamaSah_(nama) {
  nama = String(nama || '').trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z0-9][A-Za-z0-9 .&()\-\/]{1,39}$/.test(nama)) throw new Error('Nama peran 2-40 huruf/angka.');
  if (normPeran_(nama)) throw new Error('Nama itu sudah dipakai peran bawaan.');
  return nama;
}
// d: {namaLama ('' = peran baru), nama, dasar, deskripsi, status, izin: {fitur: tingkat}}
function waAdminPeranSimpan(token, d) {
  var p = izWajibAdminBawaan_(token);
  d = d || {};
  var bawaan = !!d.namaLama && IZN.BAWAAN.indexOf(String(d.namaLama)) >= 0;   // peran bawaan: hanya izinnya yang diatur
  if (String(d.namaLama || d.nama) === 'Admin') throw new Error('Peran Admin selalu penuh dan tidak dapat diubah.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var dataLama = izData_(), nama, dasar, sebelum = '';
    if (bawaan) { nama = String(d.namaLama || d.nama); dasar = nama; }
    else {
      nama = izNamaSah_(d.nama);
      dasar = String(d.dasar || '');
      if (IZN.BAWAAN.indexOf(dasar) < 0) throw new Error('Pilih peran dasar.');
      var ada = dataLama.peran[nama.toLowerCase()], lama = d.namaLama ? dataLama.peran[String(d.namaLama).toLowerCase()] : null;
      if (ada && (!lama || lama.nama.toLowerCase() !== nama.toLowerCase())) throw new Error('Peran "' + nama + '" sudah ada.');
      izPastikanKolom_(absTab_(IZN.TAB_PERAN, IZN.HDR_PERAN), IZN.HDR_PERAN);
      var tp = absBaca_(IZN.TAB_PERAN, IZN.HDR_PERAN), baris = 0;
      for (var i = 1; i < tp.v.length; i++) if (sTeks_(absNilai_(tp, tp.v[i], 'NAMA')).trim().toLowerCase() === String(d.namaLama || nama).toLowerCase()) baris = i + 1;
      var row = absBaris_(tp, { 'NAMA': nama, 'PERAN DASAR': dasar, 'DESKRIPSI': String(d.deskripsi || '').slice(0, 200), 'STATUS': d.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif', 'DIUBAH OLEH': p.nama, 'DIUBAH PADA': absWaktu_(),
        'CAKUPAN': d.cakupan === 'semua' && dasar !== 'Dinas Pendidikan' && dasar !== 'Admin' ? 'semua' : '' });
      if (baris) { sebelum = JSON.stringify(lama || {}); tp.sh.getRange(baris, 1, 1, row.length).setValues([row]); }
      else tp.sh.appendRow(row);
      // ganti nama: ikut ganti di Pengguna & Izin
      if (lama && lama.nama !== nama) izGantiNamaPeran_(lama.nama, nama);
    }
    // izin
    var izin = d.izin || {}, ti = absBaca_(IZN.TAB_IZIN, IZN.HDR_IZIN), hapus = [];
    for (var j = ti.v.length - 1; j >= 1; j--) if (sTeks_(absNilai_(ti, ti.v[j], 'PERAN')).trim() === nama) hapus.push(j + 1);
    hapus.forEach(function(b) { ti.sh.deleteRow(b); });
    var baru = [], ringkas = [];
    IZN.FITUR.forEach(function(f) {
      if (f[3].indexOf(dasar) < 0) {
        var tt = String(izin[f[0]] || '').toLowerCase();
        if (!izBisaTambah_(f, dasar) || izNilai_(tt) <= 0) return;   // fitur tambahan disimpan hanya bila diberikan
        if (izNilai_(tt) > izNilai_(izMaks_(dasar))) tt = izMaks_(dasar);
        baru.push(absBaris_(ti, { 'PERAN': nama, 'FITUR': f[0], 'TINGKAT': tt, 'DIUBAH OLEH': p.nama, 'DIUBAH PADA': absWaktu_() }));
        ringkas.push('+' + f[0] + '=' + tt);
        return;
      }
      var t = String(izin[f[0]] || '').toLowerCase();
      if (izNilai_(t) < 0) return;
      var bawaanT = dasar === 'Dinas Pendidikan' ? 'lihat' : 'ubah';
      if (t === bawaanT) return;                                  // sama dengan bawaan: tidak perlu disimpan
      baru.push(absBaris_(ti, { 'PERAN': nama, 'FITUR': f[0], 'TINGKAT': t, 'DIUBAH OLEH': p.nama, 'DIUBAH PADA': absWaktu_() }));
      ringkas.push(f[0] + '=' + t);
    });
    if (baru.length) ti.sh.getRange(ti.sh.getLastRow() + 1, 1, baru.length, baru[0].length).setValues(baru);
    izHapusCache_();
    catat_(p.peran, '', p.nama, d.namaLama ? 'Ubah peran & izin' : 'Tambah peran', nama + ' (dasar ' + dasar + ') · izin diubah: ' + (ringkas.join(', ') || 'tidak ada') + (sebelum ? ' · sebelum: ' + sebelum.slice(0, 150) : ''), 'OK');
    return { sukses: true, nama: nama };
  } finally { lock.releaseLock(); }
}
function izPastikanKolom_(sh, hdr) {
  var ada = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(function(x) { return String(x).trim().toUpperCase(); });
  hdr.forEach(function(h) { if (ada.indexOf(h) < 0) { ada.push(h); sh.getRange(1, ada.length).setValue(h).setFontWeight('bold'); } });
}
function izGantiNamaPeran_(lama, baru) {
  var sh = getSheet(PERAN.SHEET_PENGGUNA), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][2]).trim().toLowerCase() === lama.toLowerCase()) sh.getRange(i + 1, 3).setValue(baru);
  var ti = absBaca_(IZN.TAB_IZIN, IZN.HDR_IZIN), k = absCol_(ti, 'PERAN');
  for (var j = 1; j < ti.v.length; j++) if (sTeks_(ti.v[j][k]).trim() === lama) ti.sh.getRange(j + 1, k + 1).setValue(baru);
}
function waAdminPeranHapus(token, nama) {
  var p = izWajibAdminBawaan_(token);
  if (IZN.BAWAAN.indexOf(String(nama)) >= 0) throw new Error('Peran bawaan tidak dapat dihapus.');
  var dipakai = bacaPengguna_().filter(function(u) { return u.peranKustom === nama; });
  if (dipakai.length) throw new Error('Peran "' + nama + '" masih dipakai ' + dipakai.length + ' pengguna (' + dipakai.slice(0, 3).map(function(u) { return u.nama; }).join(', ') + '). Pindahkan dulu ke peran lain.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var tp = absBaca_(IZN.TAB_PERAN, IZN.HDR_PERAN);
    for (var i = tp.v.length - 1; i >= 1; i--) if (sTeks_(absNilai_(tp, tp.v[i], 'NAMA')).trim() === nama) tp.sh.deleteRow(i + 1);
    var ti = absBaca_(IZN.TAB_IZIN, IZN.HDR_IZIN);
    for (var j = ti.v.length - 1; j >= 1; j--) if (sTeks_(absNilai_(ti, ti.v[j], 'PERAN')).trim() === nama) ti.sh.deleteRow(j + 1);
    izHapusCache_();
  } finally { lock.releaseLock(); }
  catat_(p.peran, '', p.nama, 'Hapus peran', nama, 'OK');
  return { sukses: true };
}
