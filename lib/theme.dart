import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Warna & gaya "modern-lembut" BM Staf.
class Gaya {
  static const benih = Color(0xFF6C4CE0);
  static const ungu = Color(0xFF6C4CE0);
  static const ungu2 = Color(0xFF9B7BFF);
  static const latarTerang = Color(0xFFF5F3FB);
  static const latarGelap = Color(0xFF121019);

  static const radius = 20.0;

  /// Gradasi khas aplikasi (header beranda, login).
  static const gradasi = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF5B3FD6), Color(0xFF8C6CFF), Color(0xFFB59BFF)],
  );

  /// Bayangan halus untuk kartu.
  static List<BoxShadow> bayangan(BuildContext context) => Theme.of(context).brightness == Brightness.dark
      ? const []
      : [BoxShadow(color: const Color(0xFF5B3FD6).withValues(alpha: 0.07), blurRadius: 18, offset: const Offset(0, 6))];

  /// Palet pastel per menu: [warna ikon, warna latar ikon].
  static const _palet = <Color>[
    Color(0xFF6C4CE0), // ungu
    Color(0xFF2F9E8F), // hijau toska
    Color(0xFFE0789B), // merah muda
    Color(0xFFE9A23B), // jingga
    Color(0xFF3B82F6), // biru
    Color(0xFF8B5CF6), // violet
    Color(0xFF14B8A6), // teal
    Color(0xFFEF6B5B), // koral
  ];

  static Color warnaMenu(String id) {
    const tetap = {
      'pengguna': 0,
      'mapelSaya': 4,
      'progres': 1,
      'nilai': 3,
      'siswaRombel': 6,
      'kelolaMapel': 5,
      'daftar': 2,
      'ganda': 7,
      'ta': 1,
      'log': 4,
      'reset': 7,
      'kalender': 3,
      'ruangStaf': 2,
      'pengajuanTutor': 0,
      'cp': 6,
      'ai': 5,
    };
    return _palet[(tetap[id] ?? id.hashCode.abs()) % _palet.length];
  }

  static ThemeData tema(Brightness b) {
    final gelap = b == Brightness.dark;
    final cs = ColorScheme.fromSeed(seedColor: benih, brightness: b).copyWith(
      surface: gelap ? latarGelap : latarTerang,
      surfaceContainerLowest: gelap ? const Color(0xFF1A1724) : Colors.white,
    );
    final kartu = gelap ? const Color(0xFF1C1928) : Colors.white;
    final dasar = ThemeData(useMaterial3: true, colorScheme: cs, brightness: b);
    final huruf = GoogleFonts.plusJakartaSansTextTheme(dasar.textTheme);
    final bentukTombol = RoundedRectangleBorder(borderRadius: BorderRadius.circular(14));
    const isiTombol = EdgeInsets.symmetric(horizontal: 18, vertical: 14);

    return dasar.copyWith(
      textTheme: huruf,
      scaffoldBackgroundColor: cs.surface,
      appBarTheme: AppBarTheme(
        backgroundColor: cs.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: huruf.titleLarge?.copyWith(fontWeight: FontWeight.w800, color: cs.onSurface),
      ),
      cardTheme: CardThemeData(
        color: kartu,
        elevation: 0,
        margin: const EdgeInsets.symmetric(vertical: 5),
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radius),
          side: BorderSide(color: gelap ? Colors.white10 : const Color(0xFFECE8F7)),
        ),
        clipBehavior: Clip.antiAlias,
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
        titleTextStyle: huruf.bodyLarge?.copyWith(fontWeight: FontWeight.w600, color: cs.onSurface),
        subtitleTextStyle: huruf.bodySmall?.copyWith(color: cs.onSurfaceVariant),
        iconColor: cs.primary,
      ),
      expansionTileTheme: ExpansionTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius)),
        collapsedShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius)),
        tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: gelap ? const Color(0xFF241F33) : const Color(0xFFF0EDF9),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: cs.primary, width: 1.6)),
        errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: cs.error)),
        prefixIconColor: cs.primary,
        hintStyle: TextStyle(color: cs.onSurfaceVariant.withValues(alpha: 0.7)),
      ),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(shape: bentukTombol, padding: isiTombol, textStyle: const TextStyle(fontWeight: FontWeight.w700))),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(shape: bentukTombol, padding: isiTombol, side: BorderSide(color: cs.outlineVariant), textStyle: const TextStyle(fontWeight: FontWeight.w600)),
      ),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(shape: bentukTombol, textStyle: const TextStyle(fontWeight: FontWeight.w600))),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        elevation: 2,
        backgroundColor: cs.primary,
        foregroundColor: cs.onPrimary,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: kartu,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
        titleTextStyle: huruf.titleLarge?.copyWith(fontWeight: FontWeight.w800, color: cs.onSurface),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: kartu,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        height: 68,
        indicatorColor: cs.primary.withValues(alpha: 0.14),
        indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (s) => TextStyle(fontSize: 11.5, fontWeight: s.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w500),
        ),
      ),
      navigationDrawerTheme: NavigationDrawerThemeData(
        backgroundColor: kartu,
        surfaceTintColor: Colors.transparent,
        indicatorColor: cs.primary.withValues(alpha: 0.12),
        indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      switchTheme: SwitchThemeData(thumbIcon: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? const Icon(Icons.check, size: 14) : null)),
      tabBarTheme: TabBarThemeData(
        indicatorSize: TabBarIndicatorSize.tab,
        dividerColor: Colors.transparent,
        labelStyle: const TextStyle(fontWeight: FontWeight.w800),
        indicator: BoxDecoration(color: cs.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
        labelColor: cs.primary,
        unselectedLabelColor: cs.onSurfaceVariant,
        splashBorderRadius: BorderRadius.circular(12),
      ),
      dividerTheme: DividerThemeData(color: gelap ? Colors.white10 : const Color(0xFFEDEAF6), space: 1),
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      }),
    );
  }
}
