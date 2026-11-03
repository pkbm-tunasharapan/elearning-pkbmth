import 'package:flutter/material.dart';

import 'absensi/absen_ks.dart';
import 'absensi/absen_tutor.dart';
import 'absensi/absen_wb.dart';
import 'absensi/atur.dart';
import 'absensi/laporan.dart';
import 'honor/honor.dart';
import 'jadwal/jadwal.dart';
import 'kalender.dart';
import 'ruang.dart';
import 'screens/admin_lain.dart';
import 'screens/belum_dinilai.dart';
import 'screens/dokumen_rpp.dart';
import 'screens/kerangka.dart';
import 'screens/ganda.dart';
import 'screens/kelola_mapel.dart';
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
import 'session.dart';

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
const _lihatSemua = {'Kepala Sekolah', 'Koordinator Kurikulum', 'Superadmin'};
const _absWb = {'Admin', 'Tutor', 'Kepala Sekolah'};
const _lapHadir = {'Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Front Office'};

final List<MenuApp> semuaMenu = [
  MenuApp(id: 'pengguna', judul: 'Kelola Tutor & Enrollment', ikon: Icons.groups_outlined, peran: _admin, native: () => const PenggunaScreen(), utama: true),
  MenuApp(id: 'mapelSaya', judul: 'Mata Pelajaran', ikon: Icons.menu_book_outlined, peran: {..._semua, 'Superadmin'}, native: () => const MapelScreen(), utama: true),
  MenuApp(id: 'absensi', judul: 'Absensi Warga Belajar', ikon: Icons.how_to_reg_outlined, peran: _absWb, native: () => const AbsensiWbScreen(), utama: true),
  MenuApp(id: 'absenTutor', judul: 'Absen Tutor', ikon: Icons.badge_outlined, peran: {'Kepala Sekolah', 'Front Office'}, native: () => const AbsenTutorScreen(), utama: true),
  MenuApp(id: 'absenSaya', judul: 'Absen Saya', ikon: Icons.camera_front_outlined, peran: {'Kepala Sekolah'}, native: () => const AbsenSayaScreen(), utama: true),
  MenuApp(id: 'persetujuanKs', judul: 'Persetujuan Kehadiran KS', ikon: Icons.fact_check_outlined, peran: {'Superadmin'}, native: () => const PersetujuanKsScreen(), utama: true),
  MenuApp(id: 'laporanHadir', judul: 'Laporan Kehadiran', ikon: Icons.summarize_outlined, peran: _lapHadir, native: () => const LaporanHadirScreen(), utama: true),
  MenuApp(id: 'jadwal', judul: 'Jadwal', ikon: Icons.event_note_outlined, peran: {'Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Front Office'}, native: () => const JadwalScreen(), utama: true),
  MenuApp(id: 'usulanJadwal', judul: 'Usulan Jadwal', ikon: Icons.edit_calendar_outlined, peran: {'Admin', 'Kepala Sekolah', 'Tutor'}, native: () => const UsulanJadwalScreen()),
  MenuApp(id: 'aturJadwal', judul: 'Pengaturan Jadwal', ikon: Icons.schedule_rounded, peran: {'Admin'}, native: () => const AturJadwalScreen()),
  MenuApp(id: 'honorSaya', judul: 'Saldo Honor', ikon: Icons.account_balance_wallet_outlined, peran: {'Tutor'}, native: () => const HonorSayaScreen(), utama: true),
  MenuApp(id: 'rekapHonor', judul: 'Rekap Honor', ikon: Icons.payments_outlined, peran: {'Admin', 'Superadmin', 'Kepala Sekolah'}, native: () => const RekapHonorScreen(), utama: true),
  MenuApp(id: 'aturHonor', judul: 'Aturan Honor', ikon: Icons.tune_rounded, peran: {'Admin'}, native: () => const AturanHonorScreen()),
  MenuApp(id: 'kodeDarurat', judul: 'Kode Darurat FO', ikon: Icons.password_rounded, peran: {'Kepala Sekolah'}, native: () => const KodeDaruratScreen()),
  MenuApp(id: 'aturAbsensi', judul: 'Pengaturan Absensi', ikon: Icons.share_location_outlined, peran: {'Admin'}, native: () => const AturAbsensiScreen()),
  MenuApp(id: 'rpp', judul: 'Dokumen RPP', ikon: Icons.description_outlined, peran: _lihatSemua, native: () => const DokumenRppScreen()),
  MenuApp(id: 'rppSemua', judul: 'Dokumen RPP', ikon: Icons.description_outlined, peran: _pengampu, native: () => const DokumenRppScreen()),
  MenuApp(id: 'progres', judul: 'Progres Kelas', ikon: Icons.insights_outlined, peran: _pimpinan, native: () => const ProgresScreen(), utama: true),
  MenuApp(id: 'nilai', judul: 'Belum Dinilai', ikon: Icons.rate_review_outlined, peran: _semua, native: () => const BelumDinilaiScreen(), utama: true),
  MenuApp(id: 'kotakUjian', judul: 'Kotak Ujian', ikon: Icons.assignment_turned_in_outlined, peran: _semua, native: () => const KotakUjianScreen()),
  MenuApp(id: 'siswaRombel', judul: 'Siswa per Rombel', ikon: Icons.school_outlined, peran: _semua, native: () => const SiswaRombelScreen()),
  MenuApp(id: 'kelolaMapel', judul: 'Kelola Mata Pelajaran', ikon: Icons.library_books_outlined, peran: _admin, native: () => const KelolaMapelScreen()),
  MenuApp(id: 'daftar', judul: 'Pendaftaran Siswa', ikon: Icons.how_to_reg_outlined, peran: _admin, native: () => const PendaftaranScreen()),
  MenuApp(id: 'ganda', judul: 'Sinkron & Data Ganda', ikon: Icons.sync_alt, peran: _admin, native: () => const GandaScreen()),
  MenuApp(id: 'ta', judul: 'Tahun Ajaran', ikon: Icons.event_note_outlined, peran: _admin, native: () => const TahunAjaranScreen()),
  MenuApp(id: 'log', judul: 'Log Aktivitas', ikon: Icons.receipt_long_outlined, peran: _admin, native: () => const LogScreen()),
  MenuApp(id: 'reset', judul: 'Reset Data', ikon: Icons.cleaning_services_outlined, peran: _admin, native: () => const ResetScreen()),
  MenuApp(id: 'kalender', judul: 'Kalender Akademik', ikon: Icons.calendar_month_outlined, peran: _pimpinan, native: () => const KalenderStafScreen()),
  MenuApp(id: 'ruangStaf', judul: 'Ruang Staf', ikon: Icons.forum_outlined, peran: _semua, native: () => const RuangStafScreen()),
  MenuApp(id: 'pengajuanTutor', judul: 'Pengajuan Tutor', ikon: Icons.assignment_ind_outlined, peran: _admin, native: () => const PengajuanTutorScreen()),
  MenuApp(id: 'ai', judul: 'Pengaturan AI', ikon: Icons.smart_toy_outlined, peran: _admin, native: () => const PengaturanAiScreen()),
  MenuApp(id: 'maintenance', judul: 'Maintenance', ikon: Icons.construction_outlined, peran: _admin, native: () => const MaintenanceScreen()),
  MenuApp(id: 'cp', judul: 'CP · TP · ATP', ikon: Icons.account_tree_outlined, peran: _admin, native: () => const KerangkaScreen()),
];

List<MenuApp> menuUntuk(Sesi s) => semuaMenu.where((m) => m.peran.contains(s.peran)).toList();
