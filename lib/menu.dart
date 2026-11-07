import 'package:flutter/material.dart';

import 'absensi/absen_ks.dart';
import 'absensi/absen_tutor.dart';
import 'absensi/absen_harian.dart';
import 'absensi/atur.dart';
import 'absensi/laporan.dart';
import 'honor/honor.dart';
import 'induk/impor_dapodik.dart';
import 'induk/induk.dart';
import 'jadwal/jadwal.dart';
import 'keuangan/keuangan.dart';
import 'nilai/nilai.dart';
import 'kalender.dart';
import 'ruang.dart';
import 'screens/admin_lain.dart';
import 'screens/belum_dinilai.dart';
import 'screens/dokumen_rpp.dart';
import 'screens/kerangka.dart';
import 'screens/ganda.dart';
import 'screens/kelola_mapel.dart';
import 'screens/kinerja.dart';
import 'screens/oto_nilai.dart';
import 'screens/log.dart';
import 'screens/mapel.dart';
import 'screens/pendaftaran.dart';
import 'screens/pengguna.dart';
import 'screens/progres.dart';
import 'screens/reset.dart';
import 'screens/siswa_rombel.dart';
import 'screens/tahun_ajaran.dart';
import 'screens/ujian.dart';
import 'screens/web_menu.dart';
import 'pemeliharaan/sistem.dart';
import 'session.dart';
import 'siswa/kartu_qr_massal.dart';

/// Satu menu aplikasi. Bila [native] null, menu dibuka lewat versi web staf
/// (sudah mobile-friendly) di dalam aplikasi, langsung ke tab [tabWeb].
class MenuApp {
  const MenuApp({required this.id, required this.judul, required this.ikon, required this.peran, this.native, this.tabWeb, this.utama = false});

  final String id;
  final String judul;
  final IconData ikon;
  final Set<String> peran;
  final Widget Function()? native;
  final String? tabWeb;
  final bool utama;

  bool get isNative => native != null;

  Widget halaman() => native != null ? native!() : WebMenu(judul: judul, tab: tabWeb);
}

const _admin = {'Admin'};
const _pimpinan = {'Admin', 'Kepala Sekolah', 'Koordinator Kurikulum'};
const _semua = {'Admin', 'Tutor', 'Kepala Sekolah', 'Koordinator Kurikulum'};
const _pengampu = {'Admin', 'Tutor'};
const _lihatSemua = {'Kepala Sekolah', 'Koordinator Kurikulum', 'Superadmin', 'Dinas Pendidikan'};
const _absWb = {'Admin', 'Tutor', 'Kepala Sekolah'};
const _lapHadir = {'Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Front Office'};

final List<MenuApp> semuaMenu = [
  MenuApp(id: 'pengguna', judul: 'Kelola Tutor & Enrollment', ikon: Icons.groups_outlined, peran: _admin, native: () => const PenggunaScreen(), utama: true),
  MenuApp(id: 'mapelSaya', judul: 'Mata Pelajaran', ikon: Icons.menu_book_outlined, peran: {..._semua, 'Superadmin', 'Dinas Pendidikan'}, native: () => const MapelScreen(), utama: true),
  MenuApp(id: 'absensi', judul: 'Absensi Warga Belajar', ikon: Icons.how_to_reg_outlined, peran: _absWb, native: () => const AbsensiMenuScreen(), utama: true),
  MenuApp(id: 'absenTutor', judul: 'Absen Tutor', ikon: Icons.badge_outlined, peran: {'Kepala Sekolah', 'Front Office'}, native: () => const AbsenTutorScreen(), utama: true),
  MenuApp(id: 'absenSaya', judul: 'Absen Saya', ikon: Icons.camera_front_outlined, peran: {'Kepala Sekolah'}, native: () => const AbsenSayaScreen(), utama: true),
  MenuApp(id: 'persetujuanKs', judul: 'Persetujuan Kehadiran KS', ikon: Icons.fact_check_outlined, peran: {'Superadmin'}, native: () => const PersetujuanKsScreen(), utama: true),
  MenuApp(id: 'laporanHadir', judul: 'Laporan Kehadiran', ikon: Icons.summarize_outlined, peran: {..._lapHadir, 'Dinas Pendidikan'}, native: () => const LaporanHadirScreen(), utama: true),
  MenuApp(id: 'jadwal', judul: 'Jadwal', ikon: Icons.event_note_outlined, peran: {'Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Front Office', 'Dinas Pendidikan'}, native: () => const JadwalScreen(), utama: true),
  MenuApp(id: 'usulanJadwal', judul: 'Usulan Jadwal', ikon: Icons.edit_calendar_outlined, peran: {'Admin', 'Kepala Sekolah', 'Tutor'}, native: () => const UsulanJadwalScreen()),
  MenuApp(id: 'aturJadwal', judul: 'Pengaturan Jadwal', ikon: Icons.schedule_rounded, peran: {'Admin'}, native: () => const AturJadwalScreen()),
  MenuApp(id: 'nilaiRapor', judul: 'Nilai & Rapor', ikon: Icons.grading_rounded, peran: {'Admin', 'Kepala Sekolah', 'Tutor', 'Dinas Pendidikan'}, native: () => const NilaiRaporScreen()),
  MenuApp(id: 'waliKelas', judul: 'Wali Kelas', ikon: Icons.supervisor_account_outlined, peran: {'Admin', 'Kepala Sekolah'}, native: () => const WaliKelasScreen()),
  MenuApp(id: 'asesmen', judul: 'Asesmen Tatap Muka', ikon: Icons.assignment_outlined, peran: {'Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Front Office'}, native: () => const AsesmenScreen()),
  MenuApp(id: 'dispensasi', judul: 'Dispensasi Ujian', ikon: Icons.verified_user_outlined, peran: {'Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum'}, native: () => const DispensasiScreen()),
  MenuApp(id: 'otoNilai', judul: 'Penilaian Otomatis', ikon: Icons.auto_fix_high_rounded, peran: {'Admin', 'Superadmin'}, native: () => const OtoNilaiScreen()),
  MenuApp(id: 'kinerja', judul: 'Kinerja Tutor', ikon: Icons.leaderboard_outlined, peran: {'Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Dinas Pendidikan'}, native: () => const KinerjaTutorScreen()),
  MenuApp(id: 'aturNilai', judul: 'Aturan Nilai', ikon: Icons.rule_rounded, peran: {'Admin'}, native: () => const AturNilaiScreen()),
  MenuApp(id: 'honorSaya', judul: 'Saldo Honor', ikon: Icons.account_balance_wallet_outlined, peran: {'Tutor'}, native: () => const HonorSayaScreen(), utama: true),
  MenuApp(id: 'dataInduk', judul: 'Data Induk', ikon: Icons.storage_rounded, peran: {'Admin', 'Superadmin', 'Kepala Sekolah', 'Dinas Pendidikan'}, native: () => const DataIndukScreen()),
  MenuApp(id: 'keuangan', judul: 'Keuangan', ikon: Icons.account_balance_outlined, peran: {'Admin', 'Bendahara', 'Superadmin', 'Kepala Sekolah'}, native: () => const KeuanganScreen(), utama: true),
  MenuApp(id: 'rekapHonor', judul: 'Rekap Honor', ikon: Icons.payments_outlined, peran: {'Admin', 'Superadmin', 'Kepala Sekolah', 'Bendahara'}, native: () => const RekapHonorScreen(), utama: true),
  MenuApp(id: 'aturHonor', judul: 'Aturan Honor', ikon: Icons.tune_rounded, peran: {'Admin'}, native: () => const AturanHonorScreen()),
  MenuApp(id: 'kodeDarurat', judul: 'Kode Darurat FO', ikon: Icons.password_rounded, peran: {'Kepala Sekolah'}, native: () => const KodeDaruratScreen()),
  MenuApp(id: 'aturAbsensi', judul: 'Pengaturan Absensi', ikon: Icons.share_location_outlined, peran: {'Admin'}, native: () => const AturAbsensiScreen()),
  MenuApp(id: 'rpp', judul: 'Dokumen RPP', ikon: Icons.description_outlined, peran: _lihatSemua, native: () => const DokumenRppScreen()),
  MenuApp(id: 'rppSemua', judul: 'Dokumen RPP', ikon: Icons.description_outlined, peran: _pengampu, native: () => const DokumenRppScreen()),
  MenuApp(id: 'progres', judul: 'Progres Kelas', ikon: Icons.insights_outlined, peran: {..._pimpinan, 'Dinas Pendidikan'}, native: () => const ProgresScreen(), utama: true),
  MenuApp(id: 'nilai', judul: 'Belum Dinilai', ikon: Icons.rate_review_outlined, peran: {..._semua, 'Dinas Pendidikan'}, native: () => const BelumDinilaiScreen(), utama: true),
  MenuApp(id: 'kotakUjian', judul: 'Kotak Ujian', ikon: Icons.assignment_turned_in_outlined, peran: _semua, native: () => const KotakUjianScreen()),
  MenuApp(id: 'siswaRombel', judul: 'Siswa per Rombel', ikon: Icons.school_outlined, peran: {..._semua, 'Dinas Pendidikan'}, native: () => const SiswaRombelScreen()),
  MenuApp(id: 'kelolaMapel', judul: 'Kelola Mata Pelajaran', ikon: Icons.library_books_outlined, peran: _admin, native: () => const KelolaMapelScreen()),
  MenuApp(id: 'imporDapodik', judul: 'Impor Dapodik', ikon: Icons.cloud_upload_outlined, peran: _admin, native: () => const ImporDapodikScreen()),
  MenuApp(id: 'kartuQr', judul: 'Kartu QR Siswa (ID Card)', ikon: Icons.qr_code_2_rounded, peran: _admin, native: () => const KartuQrMassalScreen()),
  MenuApp(id: 'daftar', judul: 'Pendaftaran Siswa', ikon: Icons.how_to_reg_outlined, peran: _admin, native: () => const PendaftaranScreen()),
  MenuApp(id: 'ganda', judul: 'Sinkron & Data Ganda', ikon: Icons.sync_alt, peran: _admin, native: () => const GandaScreen()),
  MenuApp(id: 'ta', judul: 'Tahun Ajaran', ikon: Icons.event_note_outlined, peran: _admin, native: () => const TahunAjaranScreen()),
  MenuApp(id: 'log', judul: 'Log Aktivitas', ikon: Icons.receipt_long_outlined, peran: _admin, native: () => const LogScreen()),
  MenuApp(id: 'reset', judul: 'Reset Data', ikon: Icons.cleaning_services_outlined, peran: _admin, native: () => const ResetScreen()),
  MenuApp(id: 'kalender', judul: 'Kalender Akademik', ikon: Icons.calendar_month_outlined, peran: {..._pimpinan, 'Dinas Pendidikan'}, native: () => const KalenderStafScreen()),
  MenuApp(id: 'ruangStaf', judul: 'Ruang Staf', ikon: Icons.forum_outlined, peran: _semua, native: () => const RuangStafScreen()),
  MenuApp(id: 'pengajuanTutor', judul: 'Pengajuan Tutor', ikon: Icons.assignment_ind_outlined, peran: _admin, native: () => const PengajuanTutorScreen()),
  MenuApp(id: 'ai', judul: 'Pengaturan AI', ikon: Icons.smart_toy_outlined, peran: _admin, native: () => const PengaturanAiScreen()),
  MenuApp(id: 'pemeliharaan', judul: 'Pemeliharaan Sistem', ikon: Icons.health_and_safety_outlined, peran: _admin, native: () => const PemeliharaanScreen()),
  MenuApp(id: 'maintenance', judul: 'Maintenance', ikon: Icons.construction_outlined, peran: _admin, native: () => const MaintenanceScreen()),
  MenuApp(id: 'cp', judul: 'CP · TP · ATP', ikon: Icons.account_tree_outlined, peran: _admin, native: () => const KerangkaScreen()),
];

List<MenuApp> menuUntuk(Sesi s) => semuaMenu.where((m) => m.peran.contains(s.peran)).toList();

// ───────────────────────── pengelompokan & pencarian menu ─────────────────────────

/// Urutan grup menu di laci, beranda, dan pencarian.
const urutanGrup = ['Pembelajaran', 'Nilai & Rapor', 'Kehadiran', 'Jadwal & Kalender', 'Warga Belajar', 'Keuangan & Honor', 'Pengguna & Komunikasi', 'Sistem'];

const _grupMenu = <String, String>{
  'mapelSaya': 'Pembelajaran', 'nilai': 'Pembelajaran', 'kotakUjian': 'Pembelajaran', 'rpp': 'Pembelajaran', 'rppSemua': 'Pembelajaran',
  'progres': 'Pembelajaran', 'cp': 'Pembelajaran', 'kelolaMapel': 'Pembelajaran', 'asesmen': 'Pembelajaran', 'dispensasi': 'Pembelajaran',
  'nilaiRapor': 'Nilai & Rapor', 'waliKelas': 'Nilai & Rapor', 'aturNilai': 'Nilai & Rapor', 'otoNilai': 'Nilai & Rapor', 'kinerja': 'Pengguna & Komunikasi',
  'absensi': 'Kehadiran', 'absenTutor': 'Kehadiran', 'absenSaya': 'Kehadiran', 'persetujuanKs': 'Kehadiran', 'laporanHadir': 'Kehadiran',
  'aturAbsensi': 'Kehadiran', 'kodeDarurat': 'Kehadiran',
  'jadwal': 'Jadwal & Kalender', 'usulanJadwal': 'Jadwal & Kalender', 'aturJadwal': 'Jadwal & Kalender', 'kalender': 'Jadwal & Kalender', 'ta': 'Jadwal & Kalender',
  'dataInduk': 'Warga Belajar', 'siswaRombel': 'Warga Belajar', 'imporDapodik': 'Warga Belajar', 'kartuQr': 'Warga Belajar', 'daftar': 'Warga Belajar', 'ganda': 'Warga Belajar',
  'keuangan': 'Keuangan & Honor', 'rekapHonor': 'Keuangan & Honor', 'aturHonor': 'Keuangan & Honor', 'honorSaya': 'Keuangan & Honor',
  'pengguna': 'Pengguna & Komunikasi', 'pengajuanTutor': 'Pengguna & Komunikasi', 'ruangStaf': 'Pengguna & Komunikasi',
  'log': 'Sistem', 'reset': 'Sistem', 'ai': 'Sistem', 'pemeliharaan': 'Sistem', 'maintenance': 'Sistem',
};

/// Kata kunci tambahan agar pencarian menemukan menu dengan istilah sehari-hari.
const _kataKunci = <String, String>{
  'nilaiRapor': 'raport leger cetak cover biodata kenaikan kelulusan naik kelas lulus',
  'absensi': 'presensi hadir qr scan datang pulang izin sakit alpa',
  'dataInduk': 'siswa warga belajar wb nisn nik',
  'imporDapodik': 'import excel xlsx dapodik biodata',
  'kartuQr': 'id card kartu siswa cetak',
  'keuangan': 'kas uang spp pembayaran',
  'rekapHonor': 'gaji bayar tutor',
  'pengguna': 'akun tutor enroll staf',
  'ruangStaf': 'chat obrolan pesan',
  'jadwal': 'jam pelajaran roster',
  'nilai': 'diskusi tugas koreksi',
  'kotakUjian': 'ujian soal pts pas',
  'pemeliharaan': 'versi update apk rilis galat',
  'otoNilai': 'ajaib otomatis selesaikan penilaian belum dinilai kkm',
  'kinerja': 'poin minus penilaian kinerja tutor terlambat',
};

String grupMenu(MenuApp m) => _grupMenu[m.id] ?? 'Lainnya';

/// Menu dikelompokkan sesuai [urutanGrup] (grup kosong dilewati).
List<MapEntry<String, List<MenuApp>>> kelompokkanMenu(List<MenuApp> menu) {
  final peta = <String, List<MenuApp>>{};
  for (final m in menu) {
    (peta[grupMenu(m)] ??= []).add(m);
  }
  final urut = [...urutanGrup, ...peta.keys.where((g) => !urutanGrup.contains(g))];
  return [for (final g in urut) if (peta[g] != null) MapEntry(g, peta[g]!)];
}

/// Pencarian sederhana tanpa membedakan huruf besar/kecil; semua kata harus cocok.
List<MenuApp> cariMenu(List<MenuApp> menu, String q) {
  final kata = q.toLowerCase().split(RegExp(r'\s+')).where((k) => k.isNotEmpty).toList();
  if (kata.isEmpty) return menu;
  return menu.where((m) {
    final t = '${m.judul} ${grupMenu(m)} ${_kataKunci[m.id] ?? ''}'.toLowerCase();
    return kata.every(t.contains);
  }).toList();
}
