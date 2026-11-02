import 'package:flutter/material.dart';

import 'screens/belum_dinilai.dart';
import 'screens/ganda.dart';
import 'screens/log.dart';
import 'screens/mapel.dart';
import 'screens/pengguna.dart';
import 'screens/progres.dart';
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

final List<MenuApp> semuaMenu = [
  MenuApp(id: 'pengguna', judul: 'Kelola Tutor & Enrollment', ikon: Icons.groups_outlined, peran: _admin, native: () => const PenggunaScreen(), utama: true),
  MenuApp(id: 'mapelSaya', judul: 'Mata Pelajaran', ikon: Icons.menu_book_outlined, peran: _semua, native: () => const MapelScreen(), utama: true),
  MenuApp(id: 'progres', judul: 'Progres Kelas', ikon: Icons.insights_outlined, peran: _pimpinan, native: () => const ProgresScreen(), utama: true),
  MenuApp(id: 'nilai', judul: 'Belum Dinilai', ikon: Icons.rate_review_outlined, peran: _semua, native: () => const BelumDinilaiScreen(), utama: true),
  MenuApp(id: 'ganda', judul: 'Sinkron & Data Ganda', ikon: Icons.sync_alt, peran: _admin, native: () => const GandaScreen()),
  MenuApp(id: 'log', judul: 'Log Aktivitas', ikon: Icons.receipt_long_outlined, peran: _admin, native: () => const LogScreen()),
  // Menu berikut dibuka lewat versi web di dalam aplikasi (dibuat native bertahap).
  const MenuApp(id: 'kelolaMapel', judul: 'Kelola Mata Pelajaran', ikon: Icons.library_books_outlined, peran: _admin, tabWeb: 'tabMapel'),
  const MenuApp(id: 'daftar', judul: 'Pendaftaran Siswa', ikon: Icons.how_to_reg_outlined, peran: _admin, tabWeb: 'tabDaftar'),
  const MenuApp(id: 'siswaRombel', judul: 'Siswa per Rombel', ikon: Icons.school_outlined, peran: _admin, tabWeb: 'Siswa per Rombel'),
  const MenuApp(id: 'kalender', judul: 'Kalender Akademik', ikon: Icons.calendar_month_outlined, peran: _pimpinan, tabWeb: 'tabKalender'),
  const MenuApp(id: 'ruangStaf', judul: 'Ruang Staf', ikon: Icons.forum_outlined, peran: _semua, tabWeb: 'tabStaf'),
  const MenuApp(id: 'pengajuanTutor', judul: 'Pengajuan Tutor', ikon: Icons.assignment_ind_outlined, peran: _admin, tabWeb: 'Pengajuan Tutor'),
  const MenuApp(id: 'cp', judul: 'CP · TP · ATP', ikon: Icons.account_tree_outlined, peran: _admin, tabWeb: 'CP'),
  const MenuApp(id: 'ta', judul: 'Tahun Ajaran', ikon: Icons.event_note_outlined, peran: _admin, tabWeb: 'tabTa'),
  const MenuApp(id: 'ai', judul: 'Pengaturan AI', ikon: Icons.smart_toy_outlined, peran: _admin, tabWeb: 'tabAi'),
  const MenuApp(id: 'reset', judul: 'Reset Data', ikon: Icons.cleaning_services_outlined, peran: _admin, tabWeb: 'Reset Data'),
];

List<MenuApp> menuUntuk(Sesi s) => semuaMenu.where((m) => m.peran.contains(s.peran)).toList();
