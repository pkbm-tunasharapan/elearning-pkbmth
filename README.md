# BM Staf — Aplikasi Flutter untuk Admin, Tutor & Kepala Sekolah

Aplikasi Android + Web untuk halaman staf **Belajar Mandiri PKBM Tunas Harapan**.
Backend tetap **Google Apps Script + Google Sheets** yang sudah berjalan; aplikasi memanggilnya
lewat satu pintu `doPost` (file `ApiFlutter.gs`, sudah terpasang di deployment versi 154).

## Isi versi 1.0

| Menu | Peran | Jenis |
|---|---|---|
| Beranda (pintasan semua menu) | semua | native |
| Kelola Tutor & Enrollment (tambah/ubah pengguna, reset kode, atur mapel tutor) | Admin | native |
| Mata Pelajaran (daftar per rombel → buka isi mapel) | semua | native + web |
| Progres Kelas (daftar rombel → detail per mapel) | Admin, Kepsek, Koordinator | native |
| Belum Dinilai | semua | native |
| Sinkron & Data Ganda (cek, lengkapi, kirim ke MENU, gabungkan, bukan ganda) | Admin | native |
| Log Aktivitas | Admin | native |
| Kelola Mapel, Pendaftaran Siswa, Siswa per Rombel, Kalender, Ruang Staf, Pengajuan Tutor, CP·TP·ATP, Tahun Ajaran, Pengaturan AI, Reset Data | sesuai peran | 🌐 halaman web di dalam aplikasi (langsung masuk & langsung ke menunya) |

Menu bertanda 🌐 akan dibuat native bertahap. Login di aplikasi memakai **nama + kode akses**;
login Google SIM SETARA sementara hanya di versi web.

## Cara build (otomatis lewat GitHub, tanpa instal apa pun)

1. Buat akun di github.com (gratis), lalu **New repository** → nama mis. `bm-staf` → *Public* atau *Private* → **Create**.
2. Di halaman repo: **uploading an existing file** → seret **seluruh isi** folder ini (termasuk folder `.github`) → **Commit changes**.
   - Bila folder `.github` tidak ikut terunggah: **Add file → Create new file**, ketik nama `.github/workflows/build.yml`, tempel isi file `build.yml` dari folder ini, lalu **Commit**.
3. (Untuk versi web) **Settings → Pages → Source: GitHub Actions**.
4. Buka tab **Actions** → tunggu "Build Aplikasi Staf" selesai (±8–12 menit, centang hijau).
5. Hasil:
   - **APK**: tab **Releases** (kanan halaman repo) → `app-release.apk` → unduh di HP → pasang (izinkan "instal dari sumber tidak dikenal").
   - **Web**: alamat `https://<nama-akun>.github.io/<nama-repo>/` (muncul di langkah *web* pada Actions).
6. Setiap ada perubahan kode yang di-commit, build berjalan lagi otomatis.

Bila build gagal (tanda silang merah), buka langkah yang merah di tab Actions, salin pesan galatnya, kirim ke Claude.

## Struktur

```
lib/
  config.dart        alamat backend (ubah bila deployment Apps Script diganti)
  api.dart           pemanggil doPost + penanganan sesi habis
  session.dart       token & profil staf (tersimpan di HP)
  menu.dart          daftar menu + peran yang boleh membuka
  widgets.dart       komponen bersama (muat data, kartu JSON, konfirmasi, dll.)
  screens/           layar per menu
apps_script/         salinan kode yang dipasang di Apps Script (ApiFlutter.gs, deep link Staf.html)
tool/siapkan_platform.py   menyiapkan folder android/ & web/ saat build
.github/workflows/build.yml  build APK + Web otomatis
```

## Catatan keamanan

- `doPost` hanya meneruskan ke fungsi publik `waStaf…`/`waAdmin…` yang memang sudah bisa dipanggil
  halaman web; setiap fungsi tetap memeriksa token dan peran sendiri.
- Untuk membuka menu 🌐, token sesi ikut di alamat halaman web di dalam aplikasi (berlaku selama sesi, maks. 6 jam sejak aktivitas terakhir).
