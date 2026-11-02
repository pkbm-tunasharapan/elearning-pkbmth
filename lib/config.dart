/// Alamat backend Apps Script (deployment web app yang aktif, akhiran /exec).
/// Bila deployment diganti, cukup ubah nilai ini lalu build ulang.
const String kApiUrl =
    'https://script.google.com/macros/s/AKfycbyNaVNpk4IJ4d-JrZbIGlP0vaYB2Fh1uRwvWgUK7u18eusfWmh7u_xVBNyi3YFoD-_1xg/exec';

/// Halaman staf versi web (dipakai untuk menu yang belum dibuat native).
const String kWebUrl = kApiUrl;

const String kNamaAplikasi = 'E-Course TH';
const String kNamaSekolah = 'PKBM Tunas Harapan';

/// Versi aplikasi yang tampil di laci menu & beranda (samakan dengan pubspec.yaml).
const String kVersi = '1.5.0';
