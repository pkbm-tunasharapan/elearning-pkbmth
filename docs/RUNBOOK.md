# Runbook TH.E-Course

Panduan operasional dan pemulihan. Simpan juga salinannya di luar repo (mis. Drive sekolah).

## 1. Peta sistem

| Bagian | Lokasi |
|---|---|
| Aplikasi Android + web | Repo GitHub `pkbm-tunasharapan/elearning-pkbmth` (`lib/`, Flutter) |
| Backend | Apps Script, Script ID `1wepXh2eIA282sP2ZZi3nlsdqR8xy-reaG2DINMdk0w2SeFx8I6gKpp5o` (kode di `apps_script/`) |
| Database | Spreadsheet Standalone `1IU7_o9Om-PNOT5LeslNESO_QQzSq2ou4riildjANPS8` (semua tab, termasuk eks-MENU) |
| Arsip MENU / SIM SETARA | Spreadsheet `1R3b9I0uv3n0qIQY-G11IEDp0TRzDXiHNy_fz8wmLJ7o` (hanya arsip, tidak dipakai) |
| Deployment web app (URL `/exec` di aplikasi) | `AKfycbyNaVNpk4IJ4d-JrZbIGlP0vaYB2Fh1uRwvWgUK7u18eusfWmh7u_xVBNyi3YFoD-_1xg` |
| Folder APK di Drive | `1F03EUa-ZROII7Sv4YVE_uveAWOZGV7h_` |
| Cadangan mingguan | Folder "Cadangan Mingguan TH.E-Course" (di folder spreadsheet) |
| Pemilik semua di atas | akademik.pkbmtunasharapan@gmail.com |

## 2. Aturan keras

1. **Jangan pernah membuat deployment baru.** Deploy selalu ke ID yang sama:
   `clasp deploy -i AKfycbyNaVNpk4IJ4d-JrZbIGlP0vaYB2Fh1uRwvWgUK7u18eusfWmh7u_xVBNyi3YFoD-_1xg -d "<keterangan>"`
   Deployment baru mengubah URL `/exec` dan memutus semua aplikasi yang terpasang.
2. `clasp push` hanya mengubah kode HEAD (pemicu memakai HEAD); aplikasi baru memakai kode baru setelah `clasp deploy`.
3. Jangan menyimpan token/kunci di repo. Rahasia ada di Script Properties (lihat bagian 7).

## 3. Alur rilis aplikasi

1. Ubah kode, naikkan `version:` di `pubspec.yaml` dan `kVersi` di `lib/config.dart`.
2. Push ke `main` -> GitHub Actions: `flutter analyze` -> **tes otomatis** (`node tool/tes_backend.js`, `flutter test`) -> build APK -> GitHub Release.
   Bila tes gagal, tidak ada APK dan tidak ada rilis.
3. Tiap jam backend memeriksa GitHub Releases. APK baru disimpan di Drive sebagai **RILIS UJI**: hanya akun penguji (semua Admin + akun yang ditandai di Pemeliharaan Sistem > Versi Aplikasi) yang ditawari, tidak wajib.
4. Rilis uji naik menjadi **RESMI (wajib untuk semua)** bila: minimal 2 akun penguji memakainya, sudah 12 jam, dan tidak ada galat aplikasi dari versi itu. Atau admin menekan **Resmikan sekarang**.
5. Commit yang hanya mengubah backend boleh diberi `[skip ci]` agar tidak membuat APK.

## 4. Bila rilis bermasalah

- **Masih rilis uji:** Pemeliharaan Sistem > Versi Aplikasi > **Tarik rilis uji**. Pengguna biasa tidak terdampak.
- **Sudah resmi:** tekan **Tarik rilis resmi** (versi resmi kembali ke versi sebelumnya untuk HP yang belum memperbarui).
  Android tidak bisa memasang versi lebih rendah di atas versi lebih tinggi, jadi HP yang sudah memasang versi bermasalah
  butuh **rilis perbaikan bernomor lebih tinggi**: perbaiki atau `git revert`, naikkan versi, push, lalu resmikan setelah diuji.
- **Backend bermasalah setelah deploy:** lihat nomor versi lama dengan `clasp deployments`, lalu
  `clasp deploy -i <ID deployment di atas> -V <nomor versi lama> -d "Kembali ke versi <n>"`.
- **Perlu menghentikan semua pengguna sementara:** Script Property `MODE_MAINTENANCE=1` (atau jalankan `pemeliharaanNyala` di editor),
  matikan dengan `pemeliharaanMati`. Admin tetap bisa masuk.

## 5. Pemulihan data

- Cadangan otomatis: tiap Minggu 02.00, 8 cadangan terbaru (Pemeliharaan Sistem > Versi Aplikasi > Buat cadangan sekarang untuk cadangan manual).
- Memulihkan satu tab: buka cadangan, klik kanan tab > Salin ke > spreadsheet Standalone, hapus tab lama, ganti nama salinan
  persis seperti nama tab lama (mis. `SIM ROMBEL`, bukan `Salinan SIM ROMBEL`).
- Memulihkan seluruh database: jangan mengganti file Standalone (Apps Script menempel padanya). Pulihkan per tab seperti di atas.
- Cadangan yang dibuang masuk Sampah Drive (bisa dipulihkan 30 hari).

## 6. Akun cadangan (WAJIB disiapkan sekolah)

Sistem berjalan sebagai pemilik (akademik.pkbmtunasharapan@gmail.com). Agar tidak bergantung pada satu akun:

1. Tambahkan akun cadangan sebagai **Editor** di: spreadsheet Standalone, proyek Apps Script (Bagikan di editor Apps Script),
   folder APK, dan folder cadangan.
2. Tambahkan akun cadangan sebagai **Owner/Admin** repo GitHub.
3. Simpan nomor pemulihan dan email pemulihan akun pemilik di tempat aman milik sekolah.
4. Bila akun pemilik tidak bisa dipakai: akun cadangan membuat deployment **baru** dari proyek yang sama, lalu `kApiUrl` di
   `lib/config.dart` diganti ke URL baru dan aplikasi dirilis ulang (ini satu-satunya keadaan deployment baru boleh dibuat).

## 7. Script Properties penting

| Kunci | Isi |
|---|---|
| `GITHUB_TOKEN` | token fine-grained (Contents: Read-only) untuk mengambil rilis |
| `APP_VERSI_TERBARU`, `APP_URL_UNDUH`, `APP_WAJIB` | rilis resmi |
| `RILIS_UJI_*`, `RILIS_PENGUJI` | rilis uji dan daftar penguji |
| `MODE_MAINTENANCE`, `MODE_MAINTENANCE_PESAN` | mode pemeliharaan |
| `NILAI_XLSX_RAHASIA` | kunci tanda tangan format nilai xlsx (jangan dibagikan) |
| `TA_KONFIG`, `TA_SUSULAN_MASSAL` | tahun ajaran/sesi dan masa susulan |
| `CADANGAN_FOLDER`, `CADANGAN_TERAKHIR` | folder & waktu cadangan |

## 8. Pemicu (trigger) yang harus ada

`pemicuRilisApk` (tiap jam), `pemicuCadanganMingguan` (Minggu 02.00), `sinkronSimSetara` (15 menit, sinkron internal),
`pemicuCekDataHarian`, `pemicuOtoNilai`. Dua yang pertama dipasang ulang otomatis bila hilang.

## 9. Perkakas lokal

- `npm install -g @google/clasp`, `clasp login`, lalu di root repo: `clasp push` / `clasp deploy -i ...`
- Tes backend: `node tool/tes_backend.js`

## Arsip per semester (v1.40.0)

- **Folder Drive:** `Arsip TH.E-Course / 2026-2027 / Semester Ganjil / [Data Semester ...] / A1…C12 / Rapor | Foto | Lainnya`
  (folder induk dibuat di samping spreadsheet database; ID di Script Properties `ARSIP_FOLDER`).
- **Otomatis:** pemicu `pemicuArsipHarian` (01.00) mengarsipkan semester sebelumnya setelah semester berganti, lalu
  memindahkan baris semester itu dari tab transaksi (Jawaban, Absensi, Chat, Notifikasi, Log Aktivitas, Hasil/Percobaan
  Ujian, Penilaian Diskusi, Baca Materi, PRESENSI HARIAN, SESI BELAJAR, PRESENSI WB). Sebelum dihapus: nilai sistem dan
  rekap kehadiran dibekukan ke tab `NILAI` / `KEHADIRAN OFFLINE` (keterangan "Dibekukan saat arsip"), data disalin
  ulang, dan jumlah barisnya diperiksa. Tab induk, NILAI, KENAIKAN KELAS, PRESENSI KS tetap di database utama.
- **Manual:** menu *Arsip Data* → *Arsipkan semester* (Admin). Proses bertahap tiap ±1 menit (batas 6 menit Apps Script);
  progres & galat di tab `Indeks Arsip`. Bila status *Gagal*: perbaiki penyebab (lihat kolom CATATAN), tekan *Lanjutkan proses*.
- **Data offline (hardcopy):** *Arsip Data* → *Data offline* → unduh template per rombel sekarang + semester lampau,
  tutor mengisi nilai akhir/kehadiran/kenaikan, admin unggah (pratinjau → simpan). Arsip semester itu dibuat otomatis.
- **Membuka arsip:** Admin & Kepala Sekolah, hanya baca. Ubah data: kode akses dari admin (tab `Kode Arsip`, disimpan
  sebagai hash, berbatas waktu, dapat dicabut). Semua tindakan di tab `Log Arsip` (termasuk nilai sebelum/sesudah).
- **Memulihkan baris yang sudah dipindah:** buka spreadsheet arsip semester itu, salin baris dari tab yang sama ke
  tab database utama (kolom sama urutannya).
