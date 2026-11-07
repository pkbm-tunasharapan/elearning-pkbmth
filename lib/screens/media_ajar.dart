import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// (kode, label, ikon, keterangan, gambar?)
const jenisMediaAjar = <(String, String, IconData, String, bool)>[
  ('mindmap', 'Mindmap', Icons.account_tree_rounded, 'Peta pikiran bergambar: konsep inti dan cabang subtopik', true),
  ('infografis', 'Infografis', Icons.insert_chart_rounded, 'Gambar 1 halaman: fakta kunci, poin utama, kesimpulan', true),
  ('ringkasan', 'Poster Ringkasan', Icons.image_rounded, 'Poster bergambar: poin penting dan istilah kunci', true),
  ('lks', 'LKPD', Icons.edit_note_rounded, 'Lembar Kerja Peserta Didik: 8 soal + kunci terpisah untuk tutor', false),
];

IconData _ikon(String j) => j == 'kunci' ? Icons.key_rounded : jenisMediaAjar.firstWhere((x) => x.$1 == j, orElse: () => jenisMediaAjar.first).$3;

const _urlGemini = 'https://gemini.google.com/app';

/// Media ajar satu materi (tutor pengampu & Admin): gambar lewat prompt + unggah, LKPD otomatis; pratinjau, terbitkan, hapus.
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

  Future<void> _buatLkpd() async {
    final r = await jalankan(context, () => Api.instance('waStafMediaAjarBuat', [_t, widget.idMapel, _idMateri, 'lks'], const Duration(minutes: 5)),
        teksProses: 'Menyusun LKPD & membuat PDF...');
    if (r.ok && mounted) {
      kabar(context, 'LKPD dan kuncinya dibuat sebagai Draf. Pratinjau lalu terbitkan untuk siswa.');
      setState(() => _v++);
    }
  }

  Future<void> _prompt(String jenis, String label) async {
    final r = await jalankan(context, () => Api.instance('waStafMediaAjarPrompt', [_t, widget.idMapel, _idMateri, jenis]), teksProses: 'Menyiapkan prompt...');
    if (!r.ok || !mounted) return;
    final prompt = teks(peta(r.data)['prompt']);
    await Clipboard.setData(ClipboardData(text: prompt));
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Prompt $label'),
        content: SizedBox(
          width: 560,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Prompt sudah disalin. Langkahnya:', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            const Text('1. Buka Gemini, tempel prompt, lalu kirim.\n'
                '2. Periksa ejaan tulisan pada gambar. Bila ada yang salah, minta Gemini memperbaikinya.\n'
                '3. Unduh gambarnya (PNG/JPG), lalu kembali ke sini dan tekan "Unggah hasil".'),
            const SizedBox(height: 10),
            Flexible(
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Theme.of(c).colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(10)),
                child: SingleChildScrollView(child: SelectableText(prompt, style: const TextStyle(fontSize: 12))),
              ),
            ),
          ]),
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: prompt));
              if (c.mounted) kabar(c, 'Prompt disalin.');
            },
            child: const Text('Salin lagi'),
          ),
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup')),
          FilledButton.icon(
            onPressed: () => launchUrl(Uri.parse(_urlGemini), mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.open_in_new_rounded, size: 18),
            label: const Text('Buka Gemini'),
          ),
        ],
      ),
    );
  }

  Future<void> _unggah(String jenis, String label) async {
    final p = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['png', 'jpg', 'jpeg', 'pdf'], withData: true);
    final f = p?.files.firstOrNull;
    if (f == null || f.bytes == null || !mounted) return;
    final bytes = f.bytes!;
    if (bytes.length > 9 * 1024 * 1024) {
      kabar(context, 'Berkas terlalu besar (maks 9 MB).', galat: true);
      return;
    }
    final ext = (f.extension ?? '').toLowerCase();
    final mime = switch (ext) { 'png' => 'image/png', 'pdf' => 'application/pdf', _ => 'image/jpeg' };
    var w = 0, h = 0;
    if (mime != 'application/pdf') {
      try {
        final img = await decodeImageFromList(bytes);
        w = img.width;
        h = img.height;
        img.dispose();
      } catch (_) {
        if (mounted) kabar(context, 'Gambar tidak dapat dibaca. Pastikan berkasnya PNG atau JPG.', galat: true);
        return;
      }
    }
    if (!mounted) return;
    final b64 = base64Encode(bytes);
    final r = await jalankan(context, () => Api.instance('waStafMediaAjarUnggah', [_t, widget.idMapel, _idMateri, jenis, b64, mime, w, h], const Duration(minutes: 3)),
        teksProses: 'Mengunggah & membuat PDF $label...');
    if (r.ok && mounted) {
      kabar(context, '$label tersimpan sebagai Draf. Pratinjau lalu terbitkan untuk siswa.');
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
          final boleh = d['bolehBuat'] == true && !Sesi.instance.isDinas;
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Text('Media disimpan sebagai PDF di Drive lembaga (folder per rombel · mapel · sesi) dengan kop dan catatan hak milik PKBM Tunas Harapan. '
                'Status Draf sampai Anda terbitkan.', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            if (boleh) ...[
              const JudulBagian('Media gambar', sub: 'Salin prompt → buat di Gemini → unggah hasilnya'),
              Card(
                child: Column(children: [
                  for (final j in jenisMediaAjar.where((j) => j.$5))
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        ListTile(
                          leading: Icon(j.$3, color: cs.primary),
                          title: Text(j.$2, style: const TextStyle(fontWeight: FontWeight.w700)),
                          subtitle: Text(j.$4),
                          trailing: media.any((m) => teks(m['jenis']) == j.$1) ? const Lencana('Ada', warna: Colors.green) : null,
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
                          child: Wrap(spacing: 8, runSpacing: 6, children: [
                            OutlinedButton.icon(onPressed: () => _prompt(j.$1, j.$2), icon: const Icon(Icons.content_copy_rounded, size: 18), label: const Text('Salin prompt')),
                            FilledButton.tonalIcon(onPressed: () => _unggah(j.$1, j.$2), icon: const Icon(Icons.upload_rounded, size: 18), label: const Text('Unggah hasil')),
                          ]),
                        ),
                      ]),
                    ),
                ]),
              ),
              const JudulBagian('Lembar kerja'),
              Card(
                child: ListTile(
                  leading: Icon(Icons.edit_note_rounded, color: cs.primary),
                  title: const Text('LKPD', style: TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: const Text('Disusun otomatis dari teks materi: 8 soal + kunci terpisah untuk tutor'),
                  trailing: FilledButton.tonal(
                    onPressed: _buatLkpd,
                    child: Text(media.any((m) => teks(m['jenis']) == 'lks') ? 'Buat ulang' : 'Buat'),
                  ),
                ),
              ),
            ],
            JudulBagian('Media materi ini', sub: '${media.length} file'),
            if (media.isEmpty) const Kosong(pesan: 'Belum ada media ajar untuk materi ini.', ikon: Icons.collections_rounded),
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

/// Buat LKPD untuk semua materi di mapel yang belum punya (diproses bertahap).
/// Media gambar dibuat per materi (prompt + unggah) dari layar media ajar tiap materi.
Future<void> buatMediaAjarMassal(BuildContext context, String idMapel) async {
  if (!await konfirmasi(context, 'Buat LKPD untuk semua materi?',
      'LKPD dan kuncinya disusun untuk setiap materi yang belum punya, sebagai Draf. Media gambar (mindmap, infografis, poster) dibuat per materi lewat menu Media ajar.',
      ya: 'Buat')) {
    return;
  }
  if (!context.mounted) return;
  var total = 0;
  final lewat = <String>[];
  final ok = await jalankan(context, () async {
    while (true) {
      final r = peta(await Api.instance('waStafMediaAjarMassal', [_t, idMapel, 'lks'], const Duration(minutes: 6)));
      total += angka(r['dibuat']);
      lewat.addAll(daftar(r['lewat']).map(peta).map((x) => '${teks(x['judul'])}: ${teks(x['alasan'])}'));
      if (angka(r['sisa']) <= 0 || angka(r['dibuat']) == 0) break;
    }
    return total;
  }, teksProses: 'Menyusun LKPD untuk semua materi... (bisa beberapa menit)');
  if (!context.mounted) return;
  if (ok.ok) {
    kabar(context, '$total LKPD dibuat sebagai Draf${lewat.isEmpty ? '' : ' · ${lewat.length} materi dilewati (${lewat.first})'}. Buka tiap materi untuk pratinjau & terbitkan.');
  } else if (total > 0) {
    kabar(context, '$total LKPD sempat dibuat sebelum berhenti. Jalankan lagi nanti untuk melanjutkan.');
  }
}
