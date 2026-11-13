import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// v1.70.5: impor jadwal mingguan dari Excel (Admin / Kepala Sekolah). Templat berisi pilihan (dropdown) rombel, mapel,
/// tutor, hari, sesi (durasi sama dengan form jadwal), dan unit. Unggah -> pratinjau -> simpan semua.
Future<void> unduhTemplatJadwal(BuildContext context) async {
  final r = await jalankan(context, () async => peta(await Api.instance('waStafPemetaanTemplat', [_t], const Duration(minutes: 3))), teksProses: 'Menyiapkan templat...');
  if (!r.ok || r.data == null || !context.mounted) return;
  await bagikanXlsx(context, base64Decode(teks(r.data!['b64'])), teks(r.data!['nama'], 'Templat_Jadwal.xlsx'));
}

/// Unggah templat terisi. true bila ada jadwal yang disimpan.
Future<bool> unggahJadwal(BuildContext context) async {
  final f = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['xlsx'], withData: true);
  if (f == null || f.files.isEmpty || !context.mounted) return false;
  final x = f.files.first;
  if (x.size > 4 * 1048576) {
    kabar(context, 'File terlalu besar (maksimal 4 MB).', galat: true);
    return false;
  }
  final Uint8List b = x.bytes ?? (x.path != null ? await File(x.path!).readAsBytes() : Uint8List(0));
  if (!context.mounted) return false;
  final h = await jalankan(context, () async => peta(await Api.instance('waStafPemetaanImporPratinjau', [_t, {'b64': base64Encode(b)}], const Duration(minutes: 3))),
      teksProses: 'Memeriksa jadwal...');
  if (!h.ok || h.data == null || !context.mounted) return false;
  final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _PratinjauJadwal(p: h.data!)));
  if (ok != true || !context.mounted) return false;
  final s = await jalankan(context, () async => peta(await Api.instance('waStafPemetaanImporTerapkan', [_t, teks(h.data!['kunci'])], const Duration(minutes: 3))),
      teksProses: 'Menyimpan jadwal...');
  if (!s.ok || s.data == null || !context.mounted) return false;
  final lewat = daftar(s.data!['lewat']).map(peta).toList();
  kabar(context, '${angka(s.data!['disimpan'])} jadwal disimpan.${lewat.isEmpty ? '' : ' ${lewat.length} dilewati karena bentrok dengan jadwal yang baru masuk.'}');
  return angka(s.data!['disimpan']) > 0;
}

class _PratinjauJadwal extends StatelessWidget {
  const _PratinjauJadwal({required this.p});
  final Map<String, dynamic> p;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final j = peta(p['jumlah']);
    final item = daftar(p['item']).map(peta).toList();
    final galat = daftar(p['galat']).map(peta).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Pratinjau impor jadwal')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 100), children: [
        Card(
          color: galat.isEmpty ? cs.primaryContainer : cs.errorContainer,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Text('${angka(j['siap'])} jadwal siap disimpan · ${angka(j['galat'])} baris bermasalah (tidak disimpan) · ${angka(j['kosong'])} baris kosong',
                style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
        ),
        if (galat.isNotEmpty) ...[
          JudulBagian('Baris bermasalah', sub: 'Perbaiki di Excel lalu unggah ulang, atau simpan yang sudah benar saja'),
          Card(
            child: Column(children: [
              for (final g in galat)
                ListTile(
                  dense: true,
                  leading: Icon(Icons.error_outline_rounded, color: cs.error),
                  title: Text('Baris ${angka(g['baris'])}${teks(g['isi']).isEmpty ? '' : ' · ${teks(g['isi'])}'}'),
                  subtitle: Text(teks(g['alasan'])),
                ),
            ]),
          ),
        ],
        if (item.isNotEmpty) ...[
          JudulBagian('Siap disimpan', sub: '${item.length} jadwal'),
          Card(
            child: Column(children: [
              for (final x in item)
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.event_available_rounded, color: Colors.green),
                  title: Text('${teks(x['mapel'])} · ${teks(x['rombel'])}'),
                  subtitle: Text('${teks(x['hari'])} ${teks(x['sesi'])} · ${teks(x['tutor'])}\n'
                      '${tglIndo(teks(x['dari']))}${teks(x['sampai']).isEmpty ? ' dst.' : ' s.d. ${tglIndo(teks(x['sampai']))}'} · ${teks(x['unit'])}'
                      '${teks(x['minggu']).isEmpty ? '' : ' · ${teks(x['minggu'])}'}'),
                ),
            ]),
          ),
        ],
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            onPressed: item.isEmpty ? null : () => Navigator.pop(context, true),
            icon: const Icon(Icons.save_rounded),
            label: Text(item.isEmpty ? 'Tidak ada jadwal yang bisa disimpan' : 'Simpan ${item.length} jadwal'),
          ),
        ),
      ),
    );
  }
}
