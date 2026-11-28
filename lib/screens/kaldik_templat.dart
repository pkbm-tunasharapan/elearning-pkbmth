import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';
import 'kaldik.dart';

/// v1.95.0: templat Excel kalender akademik. Unduh (terisi data tersimpan bila ada) -> isi -> unggah -> pratinjau -> simpan.
Future<void> unduhTemplatKaldik(BuildContext context) async {
  final r = await jalankan(context, () async => peta(await Api.instance('waAdminTaKaldikTemplat', [Sesi.instance.token], const Duration(minutes: 2))),
      teksProses: 'Menyiapkan templat...');
  if (!r.ok || r.data == null || !context.mounted) return;
  await bagikanXlsx(context, base64Decode(teks(r.data!['b64'])), teks(r.data!['nama'], 'Templat_Kaldik.xlsx'));
}

/// Unggah templat terisi. [labelBaru] diisi = wizard tahun ajaran baru: tidak disimpan, kaldik dikembalikan.
/// Selain itu: disimpan setelah pratinjau, hasil = paket tahun ajaran terbaru.
Future<Map<String, dynamic>?> unggahTemplatKaldik(BuildContext context, {String? labelBaru}) async {
  final f = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['xlsx'], withData: true);
  if (f == null || f.files.isEmpty || !context.mounted) return null;
  final x = f.files.first;
  if (x.size > 4 * 1048576) {
    kabar(context, 'File terlalu besar (maksimal 4 MB).', galat: true);
    return null;
  }
  final Uint8List b = x.bytes ?? (x.path != null ? await File(x.path!).readAsBytes() : Uint8List(0));
  if (!context.mounted) return null;
  final b64 = base64Encode(b);
  final opsi = <String, dynamic>{if (labelBaru != null) 'label': labelBaru};
  final h = await jalankan(context, () async => peta(await Api.instance('waAdminTaKaldikUnggah', [Sesi.instance.token, b64, opsi], const Duration(minutes: 2))),
      teksProses: 'Memeriksa kalender akademik...');
  if (!h.ok || h.data == null || !context.mounted) return null;
  return Navigator.of(context).push<Map<String, dynamic>>(
      MaterialPageRoute(builder: (_) => _PratinjauTemplat(p: h.data!, b64: b64, tahunBaru: labelBaru != null)));
}

class _PratinjauTemplat extends StatefulWidget {
  const _PratinjauTemplat({required this.p, required this.b64, required this.tahunBaru});
  final Map<String, dynamic> p;
  final String b64;
  final bool tahunBaru;

  @override
  State<_PratinjauTemplat> createState() => _PratinjauTemplatState();
}

class _PratinjauTemplatState extends State<_PratinjauTemplat> {
  late Map<String, dynamic> _p = widget.p;
  bool _gantiMulai = false;

  Future<void> _muatUlang() async {
    final h = await jalankan(context,
        () async => peta(await Api.instance('waAdminTaKaldikUnggah', [Sesi.instance.token, widget.b64, {'gantiMulai': _gantiMulai}], const Duration(minutes: 2))),
        teksProses: 'Menyusun ulang...');
    if (h.ok && h.data != null && mounted) setState(() => _p = h.data!);
  }

  Future<void> _simpan() async {
    if (widget.tahunBaru) {
      Navigator.pop(context, peta(_p['kaldik']));
      return;
    }
    final h = await jalankan(context,
        () async => peta(await Api.instance('waAdminTaKaldikUnggah', [Sesi.instance.token, widget.b64, {'simpan': true, 'gantiMulai': _gantiMulai}], const Duration(minutes: 2))),
        teksProses: 'Menyimpan kalender akademik...');
    if (!h.ok || h.data == null || !mounted) return;
    kabar(context, 'Kalender akademik disimpan. Libur masuk Agenda Lembaga.');
    Navigator.pop(context, peta(h.data!['paket']));
  }

  String _tgl(dynamic s) {
    const b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(teks(s));
    return m == null ? '-' : '${int.parse(m[3]!)} ${b[int.parse(m[2]!) - 1]} ${m[1]}';
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final galat = daftar(_p['galat']).map(teks).toList();
    final info = daftar(_p['info']).map(teks).toList();
    final ringkas = daftar(_p['ringkas']).map(peta).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Pratinjau templat kaldik')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 96), children: [
        Text('${angka(_p['jumlah'])} baris terbaca${angka(_p['otomatis']) > 0 ? ' · ${angka(_p['otomatis'])} kategori ditebak dari nama kegiatan' : ''}.',
            style: TextStyle(color: cs.onSurfaceVariant)),
        if (galat.isNotEmpty) ...[
          JudulBagian('Perlu diperbaiki', sub: '${galat.length} masalah · perbaiki di Excel lalu unggah ulang'),
          for (final g in galat)
            Card(color: cs.errorContainer, child: Padding(padding: const EdgeInsets.all(12), child: Text(g, style: TextStyle(color: cs.onErrorContainer)))),
        ],
        for (final i in info) Card(child: ListTile(dense: true, leading: const Icon(Icons.info_outline), title: Text(i))),
        if (info.isNotEmpty && !widget.tahunBaru)
          SwitchListTile(
            value: _gantiMulai,
            onChanged: (v) {
              setState(() => _gantiMulai = v);
              _muatUlang();
            },
            title: const Text('Ganti juga hari pertama semester yang sudah berjalan'),
            subtitle: const Text('Tanggal sesi yang sudah lewat ikut bergeser.'),
          ),
        for (final r in ringkas)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Semester ${teks(r['smt'])}', style: const TextStyle(fontWeight: FontWeight.w800)),
                Text('Hari pertama masuk: ${_tgl(r['mulai'])} · Rapor: ${_tgl(r['rapor'])}'),
                Text('UTS: ${r['uts'] == null ? 'otomatis' : '${_tgl(peta(r['uts'])['dari'])} – ${_tgl(peta(r['uts'])['sampai'])}'}'
                    ' · UAS: ${r['uas'] == null ? 'otomatis' : '${_tgl(peta(r['uas'])['dari'])} – ${_tgl(peta(r['uas'])['sampai'])}'}'),
                Text('Libur: ${angka(r['libur'])} rentang'),
                for (final j in daftar(r['jenjang']).map(teks)) Text('Ujian jenjang (info): $j', style: const TextStyle(fontSize: 12)),
              ]),
            ),
          ),
        if (galat.isEmpty && _p['minggu'] != null) ...[
          JudulBagian('Pratinjau minggu', sub: 'Belum disimpan'),
          TabelMinggu(paket: _p),
        ],
      ]),
      floatingActionButton: galat.isNotEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: _simpan,
              icon: Icon(widget.tahunBaru ? Icons.check : Icons.save),
              label: Text(widget.tahunBaru ? 'Pakai kalender ini' : 'Simpan kalender akademik'),
            ),
    );
  }
}
