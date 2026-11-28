/// Alamat backend Apps Script (deployment web app yang aktif, akhiran /exec).
/// Bila deployment diganti, cukup ubah nilai ini lalu build ulang.
const String kApiUrl =
    'https://script.google.com/macros/s/AKfycbyNaVNpk4IJ4d-JrZbIGlP0vaYB2Fh1uRwvWgUK7u18eusfWmh7u_xVBNyi3YFoD-_1xg/exec';

/// Halaman staf versi web (dipakai untuk menu yang belum dibuat native).
const String kWebUrl = kApiUrl;

const String kNamaAplikasi = kBeta ? 'TH.E-Course Beta' : 'TH.E-Course';
const String kNamaSekolah = 'PKBM Tunas Harapan';

/// Versi aplikasi yang tampil di laci menu & beranda (samakan dengan pubspec.yaml).
/// Versi bisa ditimpa saat build (--dart-define=TH_VERSI=...). APK beta memakai nomor berbeda (mis. 1.91.90)
/// agar tidak terhitung sebagai pemakai rilis uji resmi dan tidak memicu tawaran pembaruan.
const String kVersi = String.fromEnvironment('TH_VERSI', defaultValue: '1.96.1');

/// APK beta pengembangan (package terpisah, terpasang berdampingan dengan aplikasi produksi).
const bool kBeta = bool.fromEnvironment('TH_BETA');

/// Nomor build APK beta (github.run_number) dan alamat info versi beta (diterbitkan workflow build-beta.yml
/// bersama web beta). APK beta membandingkan nomor build ini, bukan versi rilis produksi.
const int kBetaBuild = int.fromEnvironment('TH_BETA_BUILD');
const String kBetaVersiUrl = 'https://th-ecourse-beta.pages.dev/versi-beta.json';

/// v1.92.0: Supabase (migrasi bertahap). Kunci publishable memang publik; akses dibatasi RLS & fungsi di server.
const String kSupabaseUrl = 'https://illiooqaguxfrsvtzntd.supabase.co';
const String kSupabaseKunciPublik = 'sb_publishable__A_AfEI_sfx1WNPsuOmfrA_K4RT0zfc';

/// Client ID OAuth jenis "Web application" (proyek Google Cloud Master Classroom Control).
/// Dipakai sebagai serverClientId agar Google memberi ID token yang dapat diperiksa server.
/// Klien Android (paket + SHA-1 kunci tanda tangan) terdaftar di proyek yang sama.
const String kGoogleServerClientId = '375397226722-ljic4gfj1c0iv8oskjheh5mii88lii5p.apps.googleusercontent.com';

/// Identitas lembaga untuk cover & biodata rapor.
const String kNpsn = 'P9908207';
const String kAlamatLembaga = 'Keandra Living Sampiran, Jl. Living Raya No 63, Sampiran, Talun, Kab. Cirebon';
const String kEmailLembaga = 'akademik.pkbmtunasharapan@gmail.com';
