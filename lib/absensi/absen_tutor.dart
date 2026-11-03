import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'umum.dart';

String? get _t => Sesi.instance.token;
bool get _fo => Sesi.instance.peran == 'Front Office';

/// Absen tutor: Kepala Sekolah memindai QR tutor. Front Office hanya dalam keadaan darurat
/// dan wajib memasukkan kode approval yang dibuat Kepala Sekolah (satu tutor = satu kode).
class AbsenTutorScreen extends StatefulWidget {
  const AbsenTutorScreen({super.key});

  @override
  State<AbsenTutorScreen> createState() => _AbsenTutorScreenState();
}

class _AbsenTutorScreenState extends State<AbsenTutorScreen> {
  final _cari = TextEditingController();
  String _kodeBuka = '';
  final List<String> _riwayat = [];

  @override
  void dispose() {
    _cari.dispose();
    super.dispose();
  }

  Future<void> _buka(String kode) async {
    final r = await jalankan(context, () async => peta(await Api.instance('waStafAbsenTutorCari', [_t, kode])), teksProses: 'Mencari tutor...');
    if (!r.ok || !mounted) return;
    final d = r.data!;
    final tutor = peta(d['tutor']);
    final kelas = daftar(d['kelas']).map(peta).toList();
    final pilih = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(c).size.height * 0.75),
          child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
            Text(teks(tutor['nama']), style: Theme.of(c).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            Text('${teks(tutor['id'])} · ${tglIndo(teks(d['tanggal']))}', style: TextStyle(color: Theme.of(c).colorScheme.onSurfaceVariant)),
            const SizedBox(height: 10),
            if (kelas.isEmpty) const Text('Tutor ini belum terdaftar mengampu mapel di rombel mana pun.'),
            if (kelas.isNotEmpty) Text('Pilih kelas yang diajar sekarang (${teks(d['hari'])}):', style: const TextStyle(fontWeight: FontWeight.w700)),
            for (final k in kelas)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(k['hadir'] == true ? Icons.check_circle_rounded : (k['terjadwal'] == true ? Icons.event_available_rounded : Icons.event_busy_rounded),
                    color: k['hadir'] == true ? Colors.green : (k['terjadwal'] == true ? Gaya.ungu : Theme.of(c).colorScheme.outline)),
                title: Text(teks(k['namaMapel'])),
                subtitle: Text('Rombel ${teks(k['namaRombel'])}${k['terjadwal'] == true ? ' · terjadwal ${teks(k['jam'])}' : ' · tidak terjadwal hari ini'}${k['hadir'] == true ? ' · sudah tercatat hadir' : ''}'),
                onTap: k['hadir'] == true ? null : () => Navigator.pop(c, k),
              ),
          ]),
        ),
      ),
    );
    if (pilih == null || !mounted) return;
    String kodeDarurat = '';
    String alasanLuar = '';
    if (_fo) {
      final k = await mintaTeks(context, 'Kode approval darurat', label: 'Kode dari Kepala Sekolah untuk ${teks(tutor['nama'])}', huruf: true);
      if (k == null || k.isEmpty || !mounted) return;
      kodeDarurat = k.toUpperCase();
    }
    while (mounted) {
      try {
        final x = peta(await Api.instance('waStafAbsenTutorCatat', [
          _t,
          {'idTutor': teks(tutor['id']), 'idRombel': teks(pilih['idRombel']), 'kodeMapel': teks(pilih['kodeMapel']), 'kodeDarurat': kodeDarurat, 'kodeBuka': _kodeBuka, 'alasanLuarJadwal': alasanLuar}
        ]));
        final pesan = x['sudah'] == true ? teks(x['pesan']) : '${teks(x['nama'])} hadir · ${teks(pilih['namaMapel'])} ${teks(pilih['namaRombel'])}${x['darurat'] == true ? ' (darurat)' : ''}${x['luarJadwal'] == true ? ' (luar jadwal)' : ''}';
        if (mounted) {
          kabar(context, pesan);
          setState(() => _riwayat.insert(0, pesan));
        }
        return;
      } on ApiException catch (e) {
        if (!mounted) return;
        if (e.pesan.contains('LUAR_JADWAL')) {
          final a = await mintaTeks(context, 'Di luar jadwal', label: 'Alasan absen di luar jadwal (mis. jadwal pengganti)');
          if (a == null || !mounted) return;
          if (a.trim().length < 5) {
            kabar(context, 'Alasan minimal 5 huruf.', galat: true);
            return;
          }
          alasanLuar = a.trim();
          continue;
        }
        if (e.pesan.contains('Kode Buka')) {
          final k = await mintaTeks(context, 'Di luar jam absensi', label: 'Kode Buka dari admin', huruf: true);
          if (k == null || k.isEmpty) return;
          _kodeBuka = k;
          continue;
        }
        kabar(context, e.ramah, galat: true);
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 32), children: [
      if (_fo)
        Card(
          color: const Color(0xFFFFF4DB),
          child: const Padding(
            padding: EdgeInsets.all(14),
            child: Text('Mode DARURAT. Absen tutor oleh Front Office hanya bila Kepala Sekolah berhalangan. '
                'Minta kode approval ke Kepala Sekolah — satu kode hanya untuk satu tutor dan sekali pakai. Semua absen darurat ditandai di laporan.',
                style: TextStyle(color: Colors.black87)),
          ),
        ),
      const SizedBox(height: 8),
      FilledButton.icon(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
        onPressed: () async {
          final k = await pindaiSekali(context, judul: 'Pindai QR kartu tutor');
          if (k != null && mounted) _buka(k);
        },
        icon: const Icon(Icons.qr_code_scanner_rounded),
        label: const Text('Pindai QR kartu tutor', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
      ),
      const SizedBox(height: 16),
      Text('Tanpa kartu? Cari dengan ID atau nama lengkap tutor:', style: TextStyle(color: cs.onSurfaceVariant)),
      const SizedBox(height: 6),
      Row(children: [
        Expanded(child: TextField(controller: _cari, decoration: const InputDecoration(hintText: 'mis. TT-ab9a7252 atau Winda, S.Pd.'), onSubmitted: (v) { if (v.trim().isNotEmpty) _buka(v.trim()); })),
        const SizedBox(width: 8),
        OutlinedButton(onPressed: () { if (_cari.text.trim().isNotEmpty) _buka(_cari.text.trim()); }, child: const Text('Cari')),
      ]),
      if (_riwayat.isNotEmpty) ...[
        const JudulBagian('Tercatat sesi ini'),
        Card(child: Column(children: [for (final r in _riwayat) ListTile(leading: const Icon(Icons.check_circle_rounded, color: Colors.green), title: Text(r))])),
      ],
    ]);
  }
}

/// Dasbor Kepala Sekolah: buat kode approval darurat untuk Front Office.
class KodeDaruratScreen extends StatefulWidget {
  const KodeDaruratScreen({super.key});

  @override
  State<KodeDaruratScreen> createState() => _KodeDaruratScreenState();
}

class _KodeDaruratScreenState extends State<KodeDaruratScreen> {
  int _v = 0;

  Future<void> _buat(Map<String, dynamic> t) async {
    if (!await konfirmasi(context, 'Buat kode untuk ${teks(t['nama'])}?', 'Kode lama tutor ini yang belum dipakai otomatis dibatalkan.', ya: 'Buat kode')) return;
    if (!mounted) return;
    final r = await jalankan(context, () async => peta(await Api.instance('waStafKodeDaruratBuat', [_t, teks(t['id'])])), teksProses: 'Membuat kode...');
    if (!r.ok || !mounted) return;
    final d = r.data!;
    setState(() => _v++);
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Kode untuk ${teks(peta(d['tutor'])['nama'])}'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          SelectableText(teks(d['kode']), style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w900, letterSpacing: 6)),
          const SizedBox(height: 8),
          Text('Berlaku sampai pukul ${teks(d['berlakuSampai'])}, sekali pakai. Berikan hanya kepada petugas Front Office.', textAlign: TextAlign.center),
        ]),
        actions: [
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: teks(d['kode'])));
              if (c.mounted) Navigator.pop(c);
            },
            child: const Text('Salin & tutup'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waStafKodeDaruratDaftar', [_t])),
      bangun: (context, d, _) {
        final tutor = daftar(d['tutor']).map(peta).toList()..sort((a, b) => teks(a['nama']).compareTo(teks(b['nama'])));
        final kode = daftar(d['kode']).map(peta).toList();
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Card(
            color: Theme.of(context).colorScheme.primaryContainer,
            child: const Padding(
              padding: EdgeInsets.all(14),
              child: Text('Gunakan hanya bila Anda tidak dapat mengabsen tutor secara langsung. Kode berlaku untuk satu tutor, sekali pakai, dan terbatas waktunya.'),
            ),
          ),
          const JudulBagian('Buat kode untuk tutor'),
          Card(
            child: Column(children: [
              for (final t in tutor)
                ListTile(
                  leading: const Icon(Icons.person_rounded),
                  title: Text(teks(t['nama'])),
                  subtitle: Text(teks(t['id'])),
                  trailing: FilledButton.tonal(onPressed: () => _buat(t), child: const Text('Buat kode')),
                ),
            ]),
          ),
          if (kode.isNotEmpty) ...[
            const JudulBagian('Riwayat kode'),
            Card(
              child: Column(children: [
                for (final k in kode)
                  ListTile(
                    dense: true,
                    title: Text('${teks(k['kode'])} · ${teks(k['tutor'])}', style: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: 1)),
                    subtitle: Text('${tglIndo(teks(k['tanggal']))} · ${teks(k['status'])}'),
                  ),
              ]),
            ),
          ],
        ]);
      },
    );
  }
}
