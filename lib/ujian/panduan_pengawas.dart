import 'package:flutter/material.dart';

import '../berkas.dart';
import '../session.dart';

/// v1.83.0: panduan langkah demi langkah untuk pengawas ujian (tampil di aplikasi & bisa dicetak PDF).
const panduanPengawas = <(String, IconData, List<String>)>[
  ('Sebelum hari ujian', Icons.event_note_rounded, [
    'Buka menu Pengawas Ujian. Di sana tampil semua ruang yang Anda awasi, dikelompokkan per tanggal: jam, mata pelajaran, rombel, dan ruang.',
    'Cocokkan dengan Jadwal Pengawas cetak dari admin. Bila ada yang tidak sesuai atau berhalangan, segera hubungi admin agar diganti.',
    'Perbarui aplikasi TH.E-Course ke versi terbaru, isi daya HP, dan pastikan kuota/internet cukup.',
  ]),
  ('30 menit sebelum ujian', Icons.alarm_rounded, [
    'Datang ke ruang ujian, lalu ketuk kartu ruang tersebut di menu Pengawas Ujian untuk membuka layar Pantau ruang.',
    'TOKEN UJIAN tampil 30 menit sebelum ujian. Simpan dulu, jangan diumumkan sebelum siswa siap.',
    'Bila perlu tanda tangan siswa, cetak daftar hadir dari menu titik tiga (⋮) → Cetak daftar hadir.',
    'Periksa siswa: sudah masuk aplikasi dengan akunnya sendiri, HP cukup daya, dan aplikasi lain ditutup.',
  ]),
  ('Saat ujian dimulai', Icons.play_circle_outline_rounded, [
    'Tepat jam mulai, umumkan TOKEN. Siswa menekan Mulai, memasukkan PIN (bila punya) dan token.',
    'Batas masuk 15 menit setelah jam mulai. Siswa yang terlambat melewati batas tidak bisa mulai: arahkan untuk mengajukan ujian susulan dari halaman ujian.',
    'Waktu pengerjaan dihitung penuh sejak siswa menekan Mulai.',
    'Bila token diduga tersebar ke luar ruang, tekan ikon putar pada kartu token untuk mengganti token. Siswa yang sudah mengerjakan tidak terpengaruh.',
  ]),
  ('Memantau siswa', Icons.monitor_heart_outlined, [
    'Status siswa: Belum hadir, Mengerjakan, Terputus (tidak tersambung lebih dari 3 menit), Terkunci, Selesai, Waktu habis. Tarik layar ke bawah atau tekan Muat ulang untuk memperbarui.',
    'Siswa yang perlu perhatian tampil paling atas: merah = terkunci/terputus, oranye/kuning = baru saja melanggar.',
    'Ketuk nama siswa untuk melihat riwayat kejadian (keluar aplikasi, terputus, token salah, dsb.) dan tombol tindakan.',
  ]),
  ('Menangani masalah', Icons.build_circle_outlined, [
    'Terkunci (siswa keluar aplikasi / membuka aplikasi lain): tanyakan alasannya, lalu tekan Buka kunci dan tulis alasannya. Mulai kunci ke-sekian, kunci hanya bisa dibuka pimpinan: tekan "Minta pimpinan membuka".',
    'Pelanggaran berat: jawaban dikirim otomatis apa adanya dan menunggu keputusan Kepala Sekolah. Catat kejadiannya di berita acara.',
    'Terputus / HP mati / sinyal hilang: minta siswa menyambung ulang. Waktu tetap berjalan; bila gangguan bukan kesalahan siswa, beri Tambah waktu (maksimal 60 menit) dengan alasan.',
    'Ganti HP: satu siswa hanya boleh satu perangkat. Bila HP siswa rusak, tekan "Izinkan perangkat baru" pada siswa itu.',
    'Siswa tidak bisa mulai karena belum layak ujian (ketuntasan, absensi, atau keuangan): jangan dipaksakan; arahkan ke admin / Kepala Sekolah. Jangan meminjamkan akun siswa lain.',
    'Semua tindakan pengawas tercatat atas nama Anda beserta alasannya.',
  ]),
  ('Ujian tulis (offline)', Icons.edit_note_rounded, [
    'Untuk mapel bermode Tulis (offline), siswa mengerjakan di kertas. Naskah dicetak oleh admin / koordinator kurikulum.',
    'Bagikan naskah tepat waktu, kumpulkan lembar jawaban saat waktu habis, lalu serahkan ke tutor/admin untuk dinilai.',
    'Daftar hadir dan berita acara tetap dibuat seperti ujian online.',
  ]),
  ('Setelah ujian selesai', Icons.task_alt_rounded, [
    'Pastikan semua siswa berstatus Selesai atau Waktu habis.',
    'Buka menu titik tiga (⋮) → Berita acara. Jumlah terdaftar, hadir, tidak hadir, dan pelanggaran terisi otomatis. Tulis keterangan (wajib), tanda tangan di layar, lalu Simpan. Cetak PDF bila diminta.',
    'Serahkan daftar hadir yang sudah ditandatangani siswa kepada admin.',
  ]),
  ('Yang tidak boleh dilakukan', Icons.block_rounded, [
    'Membantu siswa menjawab soal atau membiarkan siswa saling bertukar jawaban.',
    'Membagikan token kepada orang di luar ruang ujian.',
    'Memotret atau menyebarkan soal ujian.',
    'Meninggalkan ruang ujian tanpa pengganti selama ujian berlangsung.',
  ]),
];

class PanduanPengawasScreen extends StatelessWidget {
  const PanduanPengawasScreen({super.key});

  Future<void> _cetak(BuildContext context) async {
    final b = StringBuffer('<h2>PANDUAN PENGAWAS UJIAN</h2><p class="sub">Aplikasi TH.E-Course · menu Pengawas Ujian</p>');
    var n = 0;
    for (final (judul, _, poin) in panduanPengawas) {
      n++;
      b.write('<h3>$n. ${escHtml(judul)}</h3><ol>');
      for (final p in poin) {
        b.write('<li>${escHtml(p)}</li>');
      }
      b.write('</ol>');
    }
    const css = 'h2{text-align:center;font-size:14pt;margin:0 0 2px}.sub{text-align:center;font-size:9.5pt;margin:0 0 10px;color:#444}'
        'h3{font-size:11pt;margin:12px 0 4px;color:#0F766E}ol{margin:0 0 0 18px;padding:0}li{font-size:10pt;margin:3px 0}';
    await htmlKePdf(context, nama: 'Panduan_Pengawas_Ujian.pdf', args: [Sesi.instance.token, dokumenA4(b.toString(), css)]);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Panduan Pengawas'), actions: [
        IconButton(tooltip: 'Cetak PDF', onPressed: () => _cetak(context), icon: const Icon(Icons.print_rounded)),
      ]),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        const Text('Langkah mengawasi ujian dari awal sampai selesai. Semua tindakan dilakukan dari menu Pengawas Ujian → ketuk ruang Anda.',
            style: TextStyle(fontSize: 13)),
        const SizedBox(height: 8),
        for (final (judul, ikon, poin) in panduanPengawas)
          Card(
            child: ExpansionTile(
              initiallyExpanded: true,
              leading: Icon(ikon, color: cs.primary),
              title: Text(judul, style: const TextStyle(fontWeight: FontWeight.w700)),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              children: [
                for (var i = 0; i < poin.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      SizedBox(width: 22, child: Text('${i + 1}.', style: const TextStyle(fontWeight: FontWeight.w700))),
                      Expanded(child: Text(poin[i], style: const TextStyle(fontSize: 13.5))),
                    ]),
                  ),
              ],
            ),
          ),
      ]),
    );
  }
}
