import 'package:flutter/material.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Daftar siswa per rombel (admin: semua rombel; tutor: rombel yang diampu).
class SiswaRombelScreen extends StatefulWidget {
  const SiswaRombelScreen({super.key});

  @override
  State<SiswaRombelScreen> createState() => _SiswaRombelScreenState();
}

class _SiswaRombelScreenState extends State<SiswaRombelScreen> {
  String _cari = '';

  void _ekspor(BuildContext context, String judul, List<Map<String, dynamic>> rombel, String q) {
    final baris = <List<String>>[];
    for (final r in rombel) {
      var no = 0;
      for (final x in daftar(r['siswa']).map(peta).where((s) => q.isEmpty || teks(s['nama']).toLowerCase().contains(q))) {
        no++;
        baris.add(['$no', teks(r['namaRombel']), teks(x['nama']), teks(x['lahir']), teks(x['kontak']), teks(x['daftar'])]);
      }
    }
    pilihEkspor(context, judul: judul, kepala: const ['No', 'Rombel', 'Nama', 'Tanggal lahir', 'Kontak', 'Daftar mandiri'], baris: baris, sub: 'Dicetak ${tanggalIni()}');
  }

  // v1.39.0: reset PIN warga belajar (Admin / tutor rombel)
  Future<void> _resetPin(BuildContext context, String idRombel, String nama, Future<void> Function() segarkan) async {
    final ok = await konfirmasi(context, 'Reset PIN $nama?',
        'PIN lama tidak berlaku lagi. Siswa masuk sekali dengan TH- tanggal lahir (8 angka), lalu wajib membuat PIN baru.', ya: 'Reset PIN');
    if (!ok || !context.mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafPinReset', [Sesi.instance.token, idRombel, nama]), teksProses: 'Me-reset PIN...');
    if (!r.ok || !context.mounted) return;
    final d = peta(r.data);
    kabar(context, teks(d['pesan'], 'PIN sudah di-reset.'), galat: d['sukses'] != true);
    if (d['sukses'] == true) segarkan();
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<List<dynamic>>(
      muat: () async => daftar(await Api.instance('waStafRombelSiswa', [Sesi.instance.token])),
      bangun: (context, data, segarkan) {
        final rombel = data.map(peta).toList();
        final q = _cari.toLowerCase();
        final total = rombel.fold<int>(0, (n, r) => n + daftar(r['siswa']).length);
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Cari nama siswa'),
              onChanged: (v) => setState(() => _cari = v),
            ),
            Row(children: [
              Expanded(child: Text('${rombel.length} rombel · $total siswa', style: Theme.of(context).textTheme.bodySmall)),
              if (bolehUnduh) TextButton.icon(
                onPressed: () => _ekspor(context, 'Daftar Siswa Semua Rombel', rombel, q),
                icon: const Icon(Icons.download_rounded, size: 18),
                label: const Text('Ekspor semua'),
              ),
            ]),
            if (rombel.isEmpty) const Kosong(pesan: 'Belum ada rombel.'),
            for (final r in rombel)
              Builder(builder: (context) {
                final siswa = daftar(r['siswa']).map(peta).where((s) => q.isEmpty || teks(s['nama']).toLowerCase().contains(q)).toList();
                if (q.isNotEmpty && siswa.isEmpty) return const SizedBox.shrink();
                final terdaftar = siswa.where((s) => teks(s['kontak']).isNotEmpty).length;
                return Card(
                  margin: const EdgeInsets.symmetric(vertical: 5),
                  child: ExpansionTile(
                    initiallyExpanded: q.isNotEmpty,
                    leading: IkonBulat(Icons.groups_rounded, warna: Gaya.warnaMenu(teks(r['namaRombel'])), ukuran: 42, sudut: 14),
                    title: Text(teks(r['namaRombel']), style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text('${siswa.length} siswa · $terdaftar sudah daftar mandiri'),
                    childrenPadding: const EdgeInsets.only(bottom: 8),
                    children: [
                      if (bolehUnduh) Align(
                        alignment: Alignment.centerRight,
                        child: Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: TextButton.icon(
                            onPressed: () => _ekspor(context, 'Daftar Siswa ${teks(r['namaRombel'])}', [r], q),
                            icon: const Icon(Icons.download_rounded, size: 18),
                            label: const Text('Ekspor rombel ini'),
                          ),
                        ),
                      ),
                      if (daftar(r['mapel']).isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                          child: Wrap(spacing: 6, runSpacing: 6, children: [for (final m in daftar(r['mapel'])) Lencana('$m')]),
                        ),
                      for (final s in siswa)
                        ListTile(
                          dense: true,
                          leading: CircleAvatar(
                            radius: 18,
                            backgroundColor: Gaya.warnaMenu(teks(s['nama'])).withValues(alpha: 0.15),
                            child: Text(teks(s['nama'], '?')[0].toUpperCase(), style: TextStyle(color: Gaya.warnaMenu(teks(s['nama'])), fontWeight: FontWeight.w800)),
                          ),
                          title: Text(teks(s['nama'])),
                          subtitle: Text([
                            if (teks(s['lahir']).isNotEmpty) 'lahir ${teks(s['lahir'])}',
                            if (teks(s['kontak']).isNotEmpty) teks(s['kontak']),
                            if (teks(s['daftar']).isNotEmpty) 'daftar ${teks(s['daftar'])}',
                            if (teks(s['unit']).isNotEmpty) teks(s['unit']),
                            if (teks(s['layanan']).isNotEmpty) teks(s['layanan']),
                          ].join(' · ')),
                          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                            if (teks(s['kontak']).isNotEmpty) const Icon(Icons.verified_outlined, color: Colors.green, size: 18),
                            _TandaPin(
                              status: teks(s['pin'], 'Belum'),
                              onReset: Sesi.instance.hanyaLihat ? null : () => _resetPin(context, teks(r['idRombel']), teks(s['nama']), segarkan),
                            ),
                          ]),
                        ),
                    ],
                  ),
                );
              }),
          ],
        );
      },
    );
  }
}

/// Penanda status PIN siswa; ketuk untuk reset bila PIN aktif.
class _TandaPin extends StatelessWidget {
  const _TandaPin({required this.status, this.onReset});
  final String status;
  final VoidCallback? onReset;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    if (status == 'Aktif') {
      return IconButton(
        tooltip: onReset == null ? 'Sudah punya PIN' : 'Sudah punya PIN · ketuk untuk reset',
        onPressed: onReset,
        icon: const Icon(Icons.lock_rounded, color: Color(0xFF2F9E8F), size: 20),
      );
    }
    return Tooltip(
      message: status == 'Reset' ? 'PIN sudah di-reset, menunggu siswa membuat PIN baru' : 'Belum membuat PIN',
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Icon(status == 'Reset' ? Icons.lock_reset_rounded : Icons.lock_open_rounded, color: cs.outline, size: 20),
      ),
    );
  }
}
