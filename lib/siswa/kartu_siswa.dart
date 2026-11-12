import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../api.dart';
import '../config.dart';
import '../profil.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'sesi_siswa.dart';

/// Buka kartu siswa digital (pengganti kartu yang hilang).
Future<void> bukaKartuSiswa(BuildContext context) =>
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const KartuSiswaScreen()));

/// Buka kartu digital tutor/staf (QR berisi ID Tutor SIM SETARA).
Future<void> bukaKartuStaf(BuildContext context) =>
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const KartuSiswaScreen(staf: true)));

/// Kartu siswa digital: QR berisi NISN, atau ID Warga Belajar bila NISN belum ada.
class KartuSiswaScreen extends StatelessWidget {
  const KartuSiswaScreen({super.key, this.staf = false});
  final bool staf;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(staf ? 'Kartu Tutor Digital' : 'Kartu Siswa Digital')),
      body: Muatan<Map<String, dynamic>>(
        muat: () async => peta(staf ? await Api.instance('waStafKartu', [Sesi.instance.token]) : await Api.instance('waKartuSiswa', [SesiSiswa.instance.token])),
        bangun: (context, d, segarkan) {
          final kode = teks(d['kode']);
          final terkunci = !staf && d['qrAktif'] == false;   // v1.67.1: QR belum diaktivasi
          return ListView(padding: const EdgeInsets.fromLTRB(20, 16, 20, 32), children: [
            Container(
              decoration: BoxDecoration(gradient: Gaya.gradasi, borderRadius: BorderRadius.circular(24), boxShadow: Gaya.bayangan(context)),
              padding: const EdgeInsets.all(20),
              child: Column(children: [
                Row(children: [
                  Image.asset('assets/logo.png', width: 34, height: 34),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(kNamaSekolah.toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, letterSpacing: 0.8)),
                      Text(staf ? 'Kartu Tutor · E-Course' : 'Kartu Siswa · E-Course', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    ]),
                  ),
                ]),
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
                  child: terkunci
                      ? SizedBox(
                          width: 230,
                          height: 230,
                          child: Center(
                            child: Column(mainAxisSize: MainAxisSize.min, children: [
                              Icon(Icons.lock_outline_rounded, size: 56, color: cs.error),
                              const SizedBox(height: 12),
                              Text(teks(d['pesanQr'], 'QR Belum diaktifkan, silahkan lakukan aktivasi terlebih dahulu di bagian akademik'),
                                  textAlign: TextAlign.center, style: const TextStyle(color: Colors.black87, fontWeight: FontWeight.w600)),
                            ]),
                          ),
                        )
                      : kode.isEmpty
                      ? const SizedBox(
                          width: 230,
                          height: 230,
                          child: Center(child: Text('Data belum tercatat di Data Induk.\nHubungi admin sekolah.', textAlign: TextAlign.center)),
                        )
                      : QrImageView(data: kode, version: QrVersions.auto, size: 230, backgroundColor: Colors.white),
                ),
                const SizedBox(height: 16),
                const AvatarAkun(radius: 26),
                const SizedBox(height: 8),
                Text(teks(d['nama']), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
                Text(staf ? teks(d['peran']) : teks(d['namaRombel']), style: const TextStyle(color: Colors.white70)),
                if (kode.isNotEmpty && !terkunci) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(20)),
                    child: Text('${teks(d['jenis'])}: $kode',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, letterSpacing: 1)),
                  ),
                ],
              ]),
            ),
            const SizedBox(height: 16),
            Card(
              color: cs.primaryContainer,
              child: const Padding(
                padding: EdgeInsets.all(14),
                child: Text('Tunjukkan QR ini kepada petugas sebagai pengganti kartu (misalnya bila kartu hilang atau tertinggal). '
                    'Naikkan kecerahan layar agar mudah dipindai.'),
              ),
            ),
            if (kode.isNotEmpty && !terkunci)
              TextButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: kode));
                  if (context.mounted) kabar(context, '${teks(d['jenis'])} disalin.');
                },
                icon: const Icon(Icons.copy_rounded),
                label: Text('Salin ${teks(d['jenis'])}'),
              ),
          ]);
        },
      ),
    );
  }
}
