import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// Jenis nilai untuk format xlsx (sama dengan NXL di NilaiXlsx.gs).
const jenisNilaiXlsx = <String, String>{
  'UTS': 'UTS (Ujian Tengah Semester)',
  'UAS': 'UAS (Ujian Akhir Semester)',
  'Lainnya': 'Ujian Lainnya',
};

const _warnaJenis = <String, Color>{'UTS': Color(0xFF2563EB), 'UAS': Color(0xFFEA580C), 'Lainnya': Color(0xFF16A34A)};

Future<String?> _pilihJenis(BuildContext context, String judul, String keterangan) {
  return showDialog<String>(
    context: context,
    builder: (c) => SimpleDialog(
      title: Text(judul),
      children: [
        Padding(padding: const EdgeInsets.fromLTRB(24, 0, 24, 8), child: Text(keterangan, style: const TextStyle(fontSize: 13))),
        for (final e in jenisNilaiXlsx.entries)
          SimpleDialogOption(
            onPressed: () => Navigator.pop(c, e.key),
            child: Row(children: [
              Icon(Icons.circle, size: 14, color: _warnaJenis[e.key]),
              const SizedBox(width: 10),
              Text(e.value, style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),
          ),
      ],
    ),
  );
}

/// Unduh format nilai .xlsx untuk satu kelas (rombel x mapel).
Future<void> unduhFormatNilai(BuildContext context, Map<String, dynamic> kelas) async {
  final jenis = await _pilihJenis(context, 'Unduh format nilai', 'Pilih jenis nilai. Setiap jenis punya format sendiri (warna judul berbeda) agar tidak tertukar.');
  if (jenis == null || !context.mounted) return;
  final r = await jalankan(
    context,
    () async => peta(await Api.instance('waStafNilaiFormat', [_t, {'idRombel': teks(kelas['idRombel']), 'kodeMapel': teks(kelas['kodeMapel']), 'jenis': jenis}], const Duration(minutes: 2))),
    teksProses: 'Menyiapkan format ${jenisNilaiXlsx[jenis]}...',
  );
  if (!r.ok || r.data == null || !context.mounted) return;
  await bagikanXlsx(context, base64Decode(teks(r.data!['b64'])), teks(r.data!['nama'], 'Nilai_$jenis.xlsx'));
}

/// Unggah format nilai .xlsx yang sudah diisi: pilih jenis -> pilih file -> pratinjau -> konfirmasi -> simpan.
/// Mengembalikan true bila ada nilai yang tersimpan.
Future<bool> unggahNilaiXlsx(BuildContext context, Map<String, dynamic> kelas) async {
  final jenis = await _pilihJenis(context, 'Unggah nilai (.xlsx)',
      'Pilih jenis nilai yang akan diunggah. Harus sama dengan jenis yang tertulis di file; bila berbeda, unggahan ditolak dan tidak ada nilai yang berubah.');
  if (jenis == null || !context.mounted) return false;
  final f = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['xlsx'], withData: true);
  if (f == null || f.files.isEmpty || !context.mounted) return false;
  final x = f.files.first;
  if (x.size > 4 * 1048576) {
    kabar(context, 'File terlalu besar (maksimal 4 MB).', galat: true);
    return false;
  }
  final Uint8List b = x.bytes ?? (x.path != null ? await File(x.path!).readAsBytes() : Uint8List(0));
  if (!context.mounted) return false;
  if (b.isEmpty) {
    kabar(context, 'File tidak bisa dibaca.', galat: true);
    return false;
  }
  final h = await jalankan(
    context,
    () async => peta(await Api.instance('waStafNilaiUnggahPratinjau', [
      _t,
      {'idRombel': teks(kelas['idRombel']), 'kodeMapel': teks(kelas['kodeMapel']), 'jenis': jenis, 'b64': base64Encode(b)}
    ], const Duration(minutes: 3))),
    teksProses: 'Memeriksa file...',
  );
  if (!h.ok || h.data == null || !context.mounted) return false;
  final p = h.data!;
  final ubah = daftar(p['ubah']).map(peta).toList();
  final ditolak = daftar(p['ditolak']).map(teks).toList();
  if (ubah.isEmpty) {
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Tidak ada nilai yang berubah'),
        content: Text([
          '${angka(p['sama'])} nilai sama dengan yang tersimpan, ${angka(p['kosong'])} dikosongkan.',
          if (ditolak.isNotEmpty) 'Ditolak:\n• ${ditolak.join('\n• ')}',
        ].join('\n\n')),
        actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup'))],
      ),
    );
    return false;
  }
  final label = teks(p['label']);
  final ok = await showDialog<bool>(context: context, builder: (c) => _DialogPratinjau(p: p, ubah: ubah, ditolak: ditolak, warna: _warnaJenis[teks(p['jenis'])] ?? Colors.blue));
  if (ok != true || !context.mounted) return false;
  final s = await jalankan(context, () async => peta(await Api.instance('waStafNilaiUnggahTerapkan', [_t, teks(p['kunci'])], const Duration(minutes: 3))), teksProses: 'Menyimpan nilai $label...');
  if (!s.ok || s.data == null || !context.mounted) return false;
  final tolak2 = daftar(s.data!['ditolak']).map(teks).toList();
  kabar(context, '${angka(s.data!['tersimpan'])} nilai $label tersimpan.${tolak2.isEmpty ? '' : ' ${tolak2.length} ditolak: ${tolak2.take(3).join(', ')}'}');
  return angka(s.data!['tersimpan']) > 0;
}

class _DialogPratinjau extends StatefulWidget {
  const _DialogPratinjau({required this.p, required this.ubah, required this.ditolak, required this.warna});
  final Map<String, dynamic> p;
  final List<Map<String, dynamic>> ubah;
  final List<String> ditolak;
  final Color warna;

  @override
  State<_DialogPratinjau> createState() => _DialogPratinjauState();
}

class _DialogPratinjauState extends State<_DialogPratinjau> {
  bool _yakin = false;

  @override
  Widget build(BuildContext context) {
    final p = widget.p;
    final label = teks(p['label']);
    final timpa = angka(p['timpa']);
    return AlertDialog(
      titlePadding: EdgeInsets.zero,
      title: Container(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 14),
        decoration: BoxDecoration(color: widget.warna, borderRadius: const BorderRadius.vertical(top: Radius.circular(28))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('NILAI ${label.toUpperCase()}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)),
          Text('${teks(p['mapel'])} · ${teks(p['rombel'])} · ${teks(p['periode'])}', style: const TextStyle(color: Colors.white, fontSize: 12.5)),
        ]),
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: ListView(shrinkWrap: true, children: [
          Text('${widget.ubah.length} nilai akan disimpan${timpa > 0 ? ', $timpa di antaranya MENGGANTI nilai lama' : ''}. '
              '${angka(p['sama'])} sama, ${angka(p['kosong'])} dibiarkan kosong.'),
          const SizedBox(height: 8),
          for (final u in widget.ubah)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(children: [
                Expanded(child: Text(teks(u['nama']), maxLines: 1, overflow: TextOverflow.ellipsis)),
                Text(teks(u['lama']).isEmpty ? '–' : teks(u['lama']), style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                const Icon(Icons.arrow_right_alt_rounded, size: 18),
                Text(teks(u['baru']), style: const TextStyle(fontWeight: FontWeight.w800)),
              ]),
            ),
          if (widget.ditolak.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Tidak disimpan (${widget.ditolak.length}):', style: TextStyle(color: Theme.of(context).colorScheme.error, fontWeight: FontWeight.w700)),
            for (final t in widget.ditolak) Text('• $t', style: const TextStyle(fontSize: 12.5)),
          ],
          const SizedBox(height: 8),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _yakin,
            onChanged: (v) => setState(() => _yakin = v ?? false),
            title: Text('Saya yakin ini nilai $label', style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
        FilledButton(onPressed: _yakin ? () => Navigator.pop(context, true) : null, child: Text('Simpan ${widget.ubah.length} nilai')),
      ],
    );
  }
}
