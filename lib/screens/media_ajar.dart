import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

const jenisMediaAjar = <(String, String, IconData, String)>[
  ('mindmap', 'Mindmap', Icons.account_tree_rounded, 'Peta pikiran konsep inti dan cabang subtopik'),
  ('infografis', 'Infografis', Icons.insert_chart_rounded, 'Poster 1 halaman: fakta kunci, poin utama, kesimpulan'),
  ('ringkasan', 'Ringkasan', Icons.summarize_rounded, 'Ringkasan, poin penting, istilah, contoh'),
  ('lks', 'Lembar Kerja', Icons.edit_note_rounded, '8 soal latihan + kunci terpisah untuk tutor'),
];

IconData _ikon(String j) => j == 'kunci' ? Icons.key_rounded : jenisMediaAjar.firstWhere((x) => x.$1 == j, orElse: () => jenisMediaAjar.first).$3;

/// Media ajar AI untuk satu materi (tutor pengampu & Admin): buat, pratinjau, terbitkan, hapus.
class MediaAjarScreen extends StatefulWidget {
  const MediaAjarScreen({super.key, required this.idMapel, required this.item});
  final String idMapel;
  final Map<String, dynamic> item;

  @override
  State<MediaAjarScreen> createState() => _MediaAjarScreenState();
}

class _MediaAjarScreenState extends State<MediaAjarScreen> {
  int _v = 0;
  String get _idMateri => teks(widget.item['id']);

  Future<void> _buat(String jenis, String label) async {
    final r = await jalankan(context, () => Api.instance('waStafMediaAjarBuat', [_t, widget.idMapel, _idMateri, jenis], const Duration(minutes: 5)),
        teksProses: 'Gemini menyusun $label & membuat PDF...');
    if (r.ok && mounted) {
      kabar(context, '$label dibuat sebagai Draf. Pratinjau lalu terbitkan untuk siswa.');
      setState(() => _v++);
    }
  }

  Future<void> _pratinjau(Map<String, dynamic> m) async {
    final r = await jalankan(context, () => Api.instance('waStafMediaAjarPdf', [_t, teks(m['id'])], const Duration(minutes: 2)), teksProses: 'Mengambil PDF...');
    if (!r.ok || !mounted) return;
    final d = peta(r.data);
    await bukaPdfB64(context, teks(d['b64']), teks(d['nama'], '${teks(m['label'])}.pdf'));
  }

  Future<void> _terbit(Map<String, dynamic> m, bool terbit) async {
    final r = await jalankan(context, () => Api.instance('waStafMediaAjarTerbit', [_t, teks(m['id']), terbit]), teksProses: terbit ? 'Menerbitkan...' : 'Menarik...');
    if (r.ok && mounted) setState(() => _v++);
  }

  Future<void> _hapus(Map<String, dynamic> m) async {
    if (!await konfirmasi(context, 'Hapus ${teks(m['label'])}?', 'File PDF dipindahkan ke tempat sampah Drive dan tidak lagi tampil untuk siswa.', ya: 'Hapus')) return;
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafMediaAjarHapus', [_t, teks(m['id'])]), teksProses: 'Menghapus...');
    if (r.ok && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text('Media ajar · ${teks(widget.item['judul'])}', overflow: TextOverflow.ellipsis)),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async => peta(await Api.instance('waStafMediaAjarDaftar', [_t, widget.idMapel, _idMateri])),
        bangun: (context, d, segarkan) {
          final media = daftar(d['media']).map(peta).toList();
          final boleh = d['bolehBuat'] == true;
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Text('Gemini menyusun media dari teks materi ini, lalu PDF disimpan di Drive (folder per rombel · mapel · sesi). '
                'Hasil berstatus Draf sampai Anda terbitkan.', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            if (boleh) ...[
              const JudulBagian('Buat media baru'),
              Card(
                child: Column(children: [
                  for (final j in jenisMediaAjar)
                    ListTile(
                      leading: Icon(j.$3, color: cs.primary),
                      title: Text(j.$2, style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(j.$4),
                      trailing: FilledButton.tonal(
                        onPressed: () => _buat(j.$1, j.$2),
                        child: Text(media.any((m) => teks(m['jenis']) == j.$1) ? 'Buat ulang' : 'Buat'),
                      ),
                    ),
                ]),
              ),
            ],
            JudulBagian('Media materi ini', sub: '${media.length} file'),
            if (media.isEmpty) const Kosong(pesan: 'Belum ada media ajar untuk materi ini.', ikon: Icons.auto_awesome_rounded),
            for (final m in media)
              Card(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    ListTile(
                      leading: Icon(_ikon(teks(m['jenis'])), color: cs.primary),
                      title: Text(teks(m['label']), style: const TextStyle(fontWeight: FontWeight.w800)),
                      subtitle: Text('Dibuat ${teks(m['pada'])} oleh ${teks(m['oleh'])}${teks(m['terbitPada']).isEmpty ? '' : ' · terbit ${teks(m['terbitPada'])}'}'),
                      trailing: Lencana(teks(m['jenis']) == 'kunci' ? 'Khusus tutor' : teks(m['status']),
                          warna: teks(m['status']) == 'Terbit' ? Colors.green : cs.outline),
                    ),
                    Wrap(spacing: 6, runSpacing: 6, children: [
                      const SizedBox(width: 8),
                      OutlinedButton.icon(onPressed: () => _pratinjau(m), icon: const Icon(Icons.picture_as_pdf_rounded, size: 18), label: const Text('Pratinjau')),
                      if (boleh && teks(m['jenis']) != 'kunci')
                        teks(m['status']) == 'Terbit'
                            ? OutlinedButton.icon(onPressed: () => _terbit(m, false), icon: const Icon(Icons.unpublished_rounded, size: 18), label: const Text('Tarik'))
                            : FilledButton.icon(onPressed: () => _terbit(m, true), icon: const Icon(Icons.publish_rounded, size: 18), label: const Text('Terbitkan')),
                      if (teks(m['url']).isNotEmpty)
                        TextButton.icon(
                          onPressed: () => launchUrl(Uri.parse(teks(m['url'])), mode: LaunchMode.externalApplication),
                          icon: const Icon(Icons.download_rounded, size: 18),
                          label: const Text('Unduh (Drive)'),
                        ),
                      if (boleh)
                        TextButton.icon(
                          onPressed: () => _hapus(m),
                          icon: Icon(Icons.delete_outline_rounded, size: 18, color: cs.error),
                          label: Text('Hapus', style: TextStyle(color: cs.error)),
                        ),
                    ]),
                  ]),
                ),
              ),
          ]);
        },
      ),
    );
  }
}

/// Buat satu jenis media untuk semua materi di mapel yang belum punya (diproses bertahap).
Future<void> buatMediaAjarMassal(BuildContext context, String idMapel) async {
  final pilih = await showModalBottomSheet<(String, String)>(
    context: context,
    showDragHandle: true,
    builder: (c) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Text('Buat media untuk semua materi yang belum punya', style: TextStyle(fontWeight: FontWeight.w800)),
        ),
        for (final j in jenisMediaAjar)
          ListTile(leading: Icon(j.$3), title: Text(j.$2), subtitle: Text(j.$4), onTap: () => Navigator.pop(c, (j.$1, j.$2))),
        const SizedBox(height: 8),
      ]),
    ),
  );
  if (pilih == null || !context.mounted) return;
  var total = 0;
  final lewat = <String>[];
  final ok = await jalankan(context, () async {
    while (true) {
      final r = peta(await Api.instance('waStafMediaAjarMassal', [_t, idMapel, pilih.$1], const Duration(minutes: 6)));
      total += angka(r['dibuat']);
      lewat.addAll(daftar(r['lewat']).map(peta).map((x) => '${teks(x['judul'])}: ${teks(x['alasan'])}'));
      if (angka(r['sisa']) <= 0 || angka(r['dibuat']) == 0) break;
    }
    return total;
  }, teksProses: 'Membuat ${pilih.$2} untuk semua materi... (bisa beberapa menit)');
  if (!context.mounted) return;
  if (ok.ok) {
    kabar(context, '$total ${pilih.$2} dibuat sebagai Draf${lewat.isEmpty ? '' : ' · ${lewat.length} materi dilewati (${lewat.first})'}. Buka tiap materi untuk pratinjau & terbitkan.');
  } else if (total > 0) {
    kabar(context, '$total ${pilih.$2} sempat dibuat sebelum berhenti. Jalankan lagi nanti untuk melanjutkan.');
  }
}
