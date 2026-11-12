import 'package:flutter/material.dart';

import '../api.dart';
import '../honor/honor.dart' show rp;
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// v1.67.0: Aktivasi QR kartu siswa. QR baru dapat dipakai absen setelah biaya aktivasi dibayar.
/// Admin & Kepala Sekolah mencentang "QR Aktif" (tunai tercatat ke Arus Keuangan bila tagihan belum lunas).
/// Front Office hanya melaporkan bahwa pembayaran sudah diterima. Pembayaran VA dari aplikasi siswa mengaktifkan otomatis.
class AktivasiQrScreen extends StatefulWidget {
  const AktivasiQrScreen({super.key});

  @override
  State<AktivasiQrScreen> createState() => _AktivasiQrScreenState();
}

class _AktivasiQrScreenState extends State<AktivasiQrScreen> {
  final _cari = TextEditingController();
  String _saring = '';
  String _rombel = '';
  bool _aktif = false;
  int _v = 0;

  @override
  void dispose() {
    _cari.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _muat() async => peta(await Api.instance('waStafAqrDaftar', [_t], const Duration(seconds: 120)));

  Future<void> _atur(Map<String, dynamic> s, bool aktif) async {
    final nama = teks(s['nama']);
    final sisa = (s['sisa'] is num ? s['sisa'] as num : num.tryParse('${s['sisa']}') ?? 0);
    final isi = !aktif
        ? 'QR $nama akan dikunci lagi. Catatan keuangan yang sudah ada tidak berubah.'
        : sisa > 0
            ? 'Pembayaran tunai ${rp(sisa)} dari $nama akan dicatat ke Arus Keuangan (Kas Tunai), lalu QR diaktifkan.\n\nPastikan uangnya sudah diterima.'
            : 'Tagihan aktivasi $nama sudah lunas. QR akan diaktifkan.';
    if (!await konfirmasi(context, aktif ? 'Aktifkan QR?' : 'Nonaktifkan QR?', isi, ya: aktif ? 'Aktifkan' : 'Nonaktifkan')) return;
    if (!mounted) return;
    final h = await jalankan(context, () => Api.instance('waStafAqrAtur', [_t, {'idWb': teks(s['id']), 'aktif': aktif}]));
    if (!h.ok || !mounted) return;
    final j = peta(h.data)['jumlah'];
    kabar(context, aktif ? 'QR $nama aktif${j is num && j > 0 ? ' · ${rp(j)} tercatat' : ''}.' : 'QR $nama dinonaktifkan.');
    setState(() => _v++);
  }

  Future<void> _lapor(Map<String, dynamic> s) async {
    final ctl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Laporkan pembayaran'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Pembayaran aktivasi QR dari ${teks(s['nama'])} sudah diterima. Admin / Kepala Sekolah akan diberi tahu untuk mengaktifkan QR.'),
          const SizedBox(height: 12),
          TextField(controller: ctl, maxLength: 150, decoration: const InputDecoration(labelText: 'Catatan (opsional)', isDense: true)),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Laporkan')),
        ],
      ),
    );
    final catatan = ctl.text.trim();
    ctl.dispose();
    if (ok != true || !mounted) return;
    final h = await jalankan(context, () => Api.instance('waStafAqrLapor', [_t, {'idWb': teks(s['id']), 'catatan': catatan}]));
    if (!h.ok || !mounted) return;
    kabar(context, 'Laporan terkirim ke Admin dan Kepala Sekolah.');
    setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: _muat,
      bangun: (context, d, segarkan) {
        final cs = Theme.of(context).colorScheme;
        final boleh = d['bolehAtur'] == true;
        final semua = daftar(d['siswa']).map(peta).toList();
        final rombel = <String, String>{};
        for (final s in semua) {
          if (teks(s['idRombel']).isNotEmpty) rombel[teks(s['idRombel'])] = teks(s['rombel']);
        }
        final q = _saring.toLowerCase();
        final dicari = semua
            .where((s) => (_rombel.isEmpty || teks(s['idRombel']) == _rombel) && (q.isEmpty || teks(s['nama']).toLowerCase().contains(q)))
            .toList();
        final belum = dicari.where((s) => s['aktif'] != true).toList();
        final sudah = dicari.where((s) => s['aktif'] == true).toList();
        final tampil = _aktif ? sudah : belum;
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Card(
              color: cs.primaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                    'QR kartu siswa terkunci sampai biaya aktivasi ${rp(d['biaya'])} dibayar. Siswa bisa membayar lewat VA di menu Tagihan Saya '
                    '(QR aktif otomatis setelah lunas), atau tunai di bagian akademik.\n\n'
                    '${boleh ? 'Centang QR Aktif setelah uang tunai diterima. Pembayaran otomatis tercatat ke Arus Keuangan.' : 'Setelah menerima uang tunai, ketuk "Lapor bayar". Admin / Kepala Sekolah yang mengaktifkan QR.'}'),
              ),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _rombel,
              decoration: const InputDecoration(labelText: 'Rombel', isDense: true),
              items: [
                const DropdownMenuItem(value: '', child: Text('Semua rombel')),
                for (final e in (rombel.entries.toList()..sort((a, b) => a.value.compareTo(b.value)))) DropdownMenuItem(value: e.key, child: Text(e.value)),
              ],
              onChanged: (v) => setState(() => _rombel = v ?? ''),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _cari,
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari nama siswa', isDense: true),
              onChanged: (v) => setState(() => _saring = v.trim()),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: SegmentedButton<bool>(
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: false, label: Text('Belum aktif (${belum.length})'), icon: const Icon(Icons.lock_outline_rounded, size: 18)),
                  ButtonSegment(value: true, label: Text('Aktif (${sudah.length})'), icon: const Icon(Icons.qr_code_2_rounded, size: 18)),
                ],
                selected: {_aktif},
                onSelectionChanged: (v) => setState(() => _aktif = v.first),
              ),
            ),
            if (tampil.isEmpty) Kosong(pesan: _aktif ? 'Belum ada QR yang aktif.' : 'Semua QR siswa sudah aktif.', ikon: Icons.qr_code_2_rounded),
            if (tampil.isNotEmpty)
              Card(
                child: Column(children: [
                  for (final s in tampil) _baris(context, s, boleh),
                ]),
              ),
          ]);
      },
    );
  }

  Widget _baris(BuildContext context, Map<String, dynamic> s, bool boleh) {
    final cs = Theme.of(context).colorScheme;
    final aktif = s['aktif'] == true;
    final sisa = (s['sisa'] is num ? s['sisa'] as num : num.tryParse('${s['sisa']}') ?? 0);
    final ket = <String>[
      teks(s['rombel']),
      if (aktif) 'Aktif${teks(s['cara']).isEmpty ? '' : ' (${teks(s['cara'])})'}${teks(s['oleh']).isEmpty ? '' : ' · ${teks(s['oleh'])}'}',
      if (!aktif) sisa <= 0 ? 'Tagihan lunas' : 'Belum bayar ${rp(sisa)}',
    ].join(' · ');
    final lapor = !aktif && teks(s['lapor']).isNotEmpty;
    return ListTile(
      leading: boleh
          ? Checkbox(value: aktif, onChanged: (v) => _atur(s, v == true))
          : Icon(aktif ? Icons.qr_code_2_rounded : Icons.lock_outline_rounded, color: aktif ? cs.primary : cs.onSurfaceVariant),
      title: Text(teks(s['nama'])),
      subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(ket),
        if (lapor)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Lencana('Dilaporkan ${teks(s['laporOleh'])} · ${teks(s['laporPada']).split(' ').first}', warna: cs.tertiary),
          ),
      ]),
      trailing: !boleh && !aktif && !lapor ? TextButton(onPressed: () => _lapor(s), child: const Text('Lapor bayar')) : null,
      onTap: boleh ? () => _atur(s, !aktif) : null,
    );
  }
}
