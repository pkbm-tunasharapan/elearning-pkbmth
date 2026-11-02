import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

const _huruf = ['A', 'B', 'C', 'D', 'E'];

/// Daftar soal pilihan ganda satu ujian: tambah, ubah, hapus.
class SoalUjianScreen extends StatefulWidget {
  const SoalUjianScreen({super.key, required this.idMapel, required this.idUjian, required this.judul});
  final String idMapel;
  final String idUjian;
  final String judul;

  @override
  State<SoalUjianScreen> createState() => _SoalUjianScreenState();
}

class _SoalUjianScreenState extends State<SoalUjianScreen> {
  int _versi = 0;
  String? get _t => Sesi.instance.token;

  Future<void> _ubah(Map<String, dynamic>? soal, int nomor) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => _EditorSoal(idMapel: widget.idMapel, idUjian: widget.idUjian, soal: soal, nomor: nomor),
    ));
    if (ok == true) setState(() => _versi++);
  }

  Future<void> _hapus(Map<String, dynamic> s, int nomor) async {
    if (!await konfirmasi(context, 'Hapus soal $nomor?', 'Soal ini akan dihapus dari ujian.', ya: 'Hapus')) return;
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafSoalHapus', [_t, widget.idMapel, widget.idUjian, teks(s['id'])]), teksProses: 'Menghapus...');
    if (r.ok) setState(() => _versi++);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_versi),
      muat: () async => peta(await Api.instance('waStafSoalDaftar', [_t, widget.idMapel, widget.idUjian])),
      bangun: (context, d, _) {
        final soal = daftar(d['soal']).map(peta).toList();
        final total = soal.fold<int>(0, (n, s) => n + angka(s['poin'], 100));
        return Scaffold(
          appBar: AppBar(
            titleSpacing: 0,
            title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(teks(d['judul'], widget.judul), overflow: TextOverflow.ellipsis),
              Text('${soal.length} soal · total poin $total · ${teks(d['status'])}',
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: cs.onSurfaceVariant)),
            ]),
          ),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () => _ubah(null, soal.length + 1),
            icon: const Icon(Icons.add_rounded),
            label: const Text('Soal baru'),
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
            children: [
              if (teks(d['status']) == 'Aktif')
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: const Color(0xFFE9A23B).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                  child: const Row(children: [
                    Icon(Icons.warning_amber_rounded, color: Color(0xFFE9A23B)),
                    SizedBox(width: 10),
                    Expanded(child: Text('Ujian sudah aktif. Perubahan soal langsung berlaku untuk siswa.', style: TextStyle(fontSize: 12.5))),
                  ]),
                ),
              if (soal.isEmpty) const Kosong(pesan: 'Belum ada soal. Ketuk "Soal baru" untuk menambah.', ikon: Icons.quiz_outlined),
              for (var i = 0; i < soal.length; i++)
                Card(
                  child: InkWell(
                    onTap: () => _ubah(soal[i], i + 1),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          CircleAvatar(radius: 14, backgroundColor: cs.primary.withValues(alpha: 0.12), child: Text('${i + 1}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: cs.primary))),
                          const SizedBox(width: 10),
                          Expanded(child: Lencana('${angka(soal[i]['poin'], 100)} poin', warna: cs.tertiary)),
                          IconButton(icon: Icon(Icons.delete_outline_rounded, color: cs.error), onPressed: () => _hapus(soal[i], i + 1)),
                        ]),
                        const SizedBox(height: 6),
                        Padding(padding: const EdgeInsets.only(right: 8), child: Text(teks(soal[i]['pertanyaan']), style: const TextStyle(fontWeight: FontWeight.w600))),
                        const SizedBox(height: 8),
                        for (final h in _huruf)
                          if (teks(peta(soal[i]['opsi'])[h]).isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 4, right: 8),
                              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Icon(teks(soal[i]['kunci']) == h ? Icons.check_circle_rounded : Icons.circle_outlined,
                                    size: 18, color: teks(soal[i]['kunci']) == h ? Colors.green : cs.outline),
                                const SizedBox(width: 8),
                                Expanded(child: Text('$h. ${teks(peta(soal[i]['opsi'])[h])}')),
                              ]),
                            ),
                      ]),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _EditorSoal extends StatefulWidget {
  const _EditorSoal({required this.idMapel, required this.idUjian, this.soal, required this.nomor});
  final String idMapel;
  final String idUjian;
  final Map<String, dynamic>? soal;
  final int nomor;

  @override
  State<_EditorSoal> createState() => _EditorSoalState();
}

class _EditorSoalState extends State<_EditorSoal> {
  late final _tanya = TextEditingController(text: teks(widget.soal?['pertanyaan']));
  late final _poin = TextEditingController(text: '${angka(widget.soal?['poin'], 100)}');
  late final Map<String, TextEditingController> _opsi = {
    for (final h in _huruf) h: TextEditingController(text: teks(peta(widget.soal?['opsi'])[h])),
  };
  late String? _kunci = teks(widget.soal?['kunci']).isEmpty ? null : teks(widget.soal?['kunci']);
  bool _sibuk = false;

  Future<void> _simpan() async {
    final opsi = <String, String>{};
    for (final h in _huruf) {
      if (_opsi[h]!.text.trim().isNotEmpty) opsi[h] = _opsi[h]!.text.trim();
    }
    String? galat;
    if (_tanya.text.trim().isEmpty) {
      galat = 'Pertanyaan wajib diisi.';
    } else if (opsi.length < 2) {
      galat = 'Isi minimal 2 pilihan jawaban.';
    } else if (_kunci == null || !opsi.containsKey(_kunci)) {
      galat = 'Pilih kunci jawaban pada pilihan yang terisi.';
    }
    if (galat != null) {
      kabar(context, galat, galat: true);
      return;
    }
    setState(() => _sibuk = true);
    try {
      await Api.instance('waStafSoalSimpan', [
        Sesi.instance.token,
        widget.idMapel,
        widget.idUjian,
        {
          if (widget.soal != null) 'id': teks(widget.soal?['id']),
          'pertanyaan': _tanya.text.trim(),
          'opsi': opsi,
          'kunci': _kunci,
          'poin': int.tryParse(_poin.text.trim()) ?? 100,
        }
      ]);
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) kabar(context, e.ramah, galat: true);
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text('Soal ${widget.nomor}'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: FilledButton(
              onPressed: _sibuk ? null : _simpan,
              child: _sibuk ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Simpan'),
            ),
          ),
        ],
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        TextField(controller: _tanya, minLines: 3, maxLines: 10, maxLength: 1500, decoration: const InputDecoration(labelText: 'Pertanyaan', alignLabelWithHint: true)),
        const SizedBox(height: 4),
        Text('Pilihan jawaban — ketuk lingkaran untuk menandai kunci', style: TextStyle(color: cs.onSurfaceVariant, fontSize: 12.5)),
        const SizedBox(height: 8),
        for (final h in _huruf)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(children: [
              IconButton(
                tooltip: 'Jadikan kunci',
                onPressed: () => setState(() => _kunci = h),
                icon: Icon(_kunci == h ? Icons.check_circle_rounded : Icons.circle_outlined, color: _kunci == h ? Colors.green : cs.outline),
              ),
              Expanded(
                child: TextField(
                  controller: _opsi[h],
                  maxLength: 400,
                  decoration: InputDecoration(labelText: 'Pilihan $h${h == 'D' || h == 'E' ? ' (opsional)' : ''}', counterText: ''),
                ),
              ),
            ]),
          ),
        const SizedBox(height: 4),
        SizedBox(width: 140, child: TextField(controller: _poin, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Poin', prefixIcon: Icon(Icons.star_rounded)))),
      ]),
    );
  }
}
