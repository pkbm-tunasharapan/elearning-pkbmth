import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../alarm_ujian.dart';
import '../api.dart';
import '../theme.dart';
import '../ujian_aman.dart';
import '../widgets.dart';
import '../ruang.dart';
import 'sesi_siswa.dart';

SesiSiswa get _s => SesiSiswa.instance;

String _teksHtml(String s) => s
    .replaceAll(RegExp(r'<br\s*/?>|</p>|</div>|</li>|</h\d>', caseSensitive: false), '\n')
    .replaceAll(RegExp(r'<li[^>]*>', caseSensitive: false), '• ')
    .replaceAll(RegExp(r'<[^>]+>'), '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll(RegExp(r'\n{3,}'), '\n\n')
    .trim();

IconData _ikon(String j) => switch (j) {
      'Diskusi' => Icons.forum_rounded,
      'Ujian' => Icons.quiz_rounded,
      'Absensi' => Icons.how_to_reg_rounded,
      _ => Icons.article_rounded,
    };

Color _warna(String j) => switch (j) {
      'Diskusi' => const Color(0xFF2F9E8F),
      'Ujian' => const Color(0xFFE9A23B),
      'Absensi' => const Color(0xFFE0789B),
      _ => const Color(0xFF3B82F6),
    };

Future<void> _buka(String url) async {
  if (url.isEmpty) return;
  await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
}

/// Isi satu mata pelajaran untuk siswa, dikelompokkan per sesi.
class MapelSiswaScreen extends StatefulWidget {
  const MapelSiswaScreen({super.key, required this.idMapel, required this.namaMapel, this.tutor = ''});
  final String idMapel;
  final String namaMapel;
  final String tutor;

  @override
  State<MapelSiswaScreen> createState() => _MapelSiswaScreenState();
}

class _MapelSiswaScreenState extends State<MapelSiswaScreen> {
  int _versi = 0;

  void _muatUlang() => setState(() => _versi++);

  Future<void> _buka(Map<String, dynamic> item, Map<String, dynamic> riwayat) async {
    final jenis = teks(item['jenis']);
    final rw = riwayat[teks(item['id'])] == null ? null : peta(riwayat[teks(item['id'])]);
    Widget layar;
    final buka = peta(riwayat['__buka'])[teks(item['sesiKey'])] != null;
    final terkunci = item['terkunciSesi'] == true && !buka;
    if ((jenis == 'Diskusi' || jenis == 'Ujian') && terkunci && rw == null) {
      layar = SesiTerkunciScreen(item: item);
    } else if (jenis == 'Diskusi') {
      layar = DiskusiSiswaScreen(idMapel: widget.idMapel, item: item, riwayat: rw, terkunci: terkunci);
    } else if (jenis == 'Ujian') {
      layar = UjianSiswaScreen(idMapel: widget.idMapel, item: item);
    } else if (jenis == 'Absensi') {
      layar = AbsensiSiswaScreen(idMapel: widget.idMapel, item: item, riwayat: rw, dibuka: buka);
    } else {
      layar = MateriSiswaScreen(idMapel: widget.idMapel, item: item);
    }
    final ubah = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => layar));
    if (ubah == true) _muatUlang();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.namaMapel, overflow: TextOverflow.ellipsis),
          if (widget.tutor.isNotEmpty) Text('Tutor: ${widget.tutor}', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: cs.onSurfaceVariant)),
        ]),
        actions: [
          IconButton(
            tooltip: 'Obrolan mapel',
            onPressed: () => bukaChatSiswa(Navigator.of(context), 'MAPEL:${widget.idMapel}'),
            icon: const Icon(Icons.chat_rounded),
          ),
        ],
      ),
      body: Muatan<List<dynamic>>(
        key: ValueKey(_versi),
        muat: () => Future.wait([
          Api.instance('waGetMateri', [widget.idMapel]),
          Api.instance('waGetRiwayatJawaban', [widget.idMapel, _s.nama]),
        ]),
        bangun: (context, d, _) {
          final items = daftar(d[0]).map(peta).toList();
          final riwayat = peta(d[1]);
          final grup = <String, List<Map<String, dynamic>>>{};
          for (final x in items) {
            grup.putIfAbsent(teks(x['sesi'], 'Sesi 1'), () => []).add(x);
          }
          final sesi = grup.keys.toList();
          final selesai = items.where((x) => riwayat[teks(x['id'])] != null).length;
          final tugas = items.where((x) => teks(x['jenis']) != 'Materi').length;
          return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
            if (items.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(gradient: Gaya.gradasi, borderRadius: BorderRadius.circular(Gaya.radius)),
                child: Row(children: [
                  const Icon(Icons.emoji_events_rounded, color: Colors.white, size: 34),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Progres belajar', style: TextStyle(color: Colors.white70)),
                      Text('$selesai dari $tugas tugas selesai', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17)),
                    ]),
                  ),
                ]),
              ),
            if (items.isEmpty) const Kosong(pesan: 'Belum ada materi untuk mata pelajaran ini.', ikon: Icons.menu_book_outlined),
            for (final sn in sesi) ...[
              JudulBagian(sn),
              Card(
                child: Column(children: [
                  for (final x in grup[sn]!)
                    Builder(builder: (context) {
                      final j = teks(x['jenis']);
                      final rw = riwayat[teks(x['id'])] == null ? null : peta(riwayat[teks(x['id'])]);
                      final nilai = rw == null ? '' : teks(rw['nilai']);
                      final dibuka = peta(riwayat['__buka'])[teks(x['sesiKey'])] != null;
                      final tutup = x['terkunciSesi'] == true && !dibuka;
                      Widget belum;
                      if (j == 'Materi') {
                        belum = const Icon(Icons.chevron_right_rounded);
                      } else if (j == 'Absensi') {
                        belum = (absBerjalan(x) || dibuka) ? const Lencana('Isi sekarang', warna: Color(0xFFE0789B)) : Lencana('Tidak terisi', warna: cs.error);
                      } else if (tutup) {
                        belum = Lencana('Ditutup', warna: cs.error);
                      } else {
                        belum = Lencana('Belum', warna: cs.outline);
                      }
                      return ListTile(
                        onTap: () => _buka(x, riwayat),
                        leading: IkonBulat(_ikon(j), warna: _warna(j), ukuran: 42, sudut: 14),
                        title: Text(teks(x['judul']), maxLines: 2, overflow: TextOverflow.ellipsis),
                        subtitle: Text([j, if (teks(x['batasWaktu']).isNotEmpty) 'batas ${teks(x['batasWaktu'])}'].join(' · ')),
                        trailing: rw == null
                            ? belum
                            : (nilai.isNotEmpty ? Lencana('Nilai $nilai', warna: Colors.green) : const Lencana('Selesai', warna: Colors.green)),
                      );
                    }),
                ]),
              ),
            ],
          ]);
        },
      ),
    );
  }
}

// ───────────────────────── MATERI ─────────────────────────

class MateriSiswaScreen extends StatefulWidget {
  const MateriSiswaScreen({super.key, required this.idMapel, required this.item});
  final String idMapel;
  final Map<String, dynamic> item;

  @override
  State<MateriSiswaScreen> createState() => _MateriSiswaScreenState();
}

class _MateriSiswaScreenState extends State<MateriSiswaScreen> {
  late final Future<dynamic> _media = Api.instance('waMediaAjarSiswa', [_s.nama, _s.idRombel, widget.idMapel, teks(widget.item['id'])]).catchError((_) => null);

  @override
  void initState() {
    super.initState();
    // Catat bahwa siswa membuka materi (untuk laporan "siapa yang sudah membaca").
    Api.instance('waTandaiBaca', [_s.idRombel, widget.idMapel, _s.nama, teks(widget.item['id'])]).catchError((_) => null);
  }

  @override
  Widget build(BuildContext context) {
    final it = widget.item;
    final yt = teks(it['youtube']);
    final file = teks(it['file']);
    return Scaffold(
      appBar: AppBar(title: Text(teks(it['judul']), overflow: TextOverflow.ellipsis)),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        Text(teks(it['judul']), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text(teks(it['sesi']), style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        const SizedBox(height: 16),
        if (yt.isNotEmpty || file.isNotEmpty)
          Wrap(spacing: 8, runSpacing: 8, children: [
            if (yt.isNotEmpty) FilledButton.icon(onPressed: () => _buka(yt), icon: const Icon(Icons.smart_display_rounded), label: const Text('Tonton video')),
            if (file.isNotEmpty) OutlinedButton.icon(onPressed: () => _buka(file), icon: const Icon(Icons.description_rounded), label: const Text('Buka file')),
          ]),
        if (teks(it['konten']).isNotEmpty) ...[
          const SizedBox(height: 16),
          Card(child: Padding(padding: const EdgeInsets.all(16), child: SelectableText(_teksHtml(teks(it['konten'])), style: const TextStyle(height: 1.55, fontSize: 15)))),
        ],
        FutureBuilder<dynamic>(
          future: _media,
          builder: (context, snap) {
            final media = daftar(peta(snap.data)['media']).map(peta).toList();
            if (media.isEmpty) return const SizedBox.shrink();
            final cs = Theme.of(context).colorScheme;
            return Card(
              margin: const EdgeInsets.only(top: 16),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Icon(Icons.collections_rounded, color: cs.primary),
                    const SizedBox(width: 8),
                    const Text('Media ajar', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  ]),
                  const SizedBox(height: 4),
                  Text('Unduh untuk belajar dengan cara yang lebih menarik.', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                  const SizedBox(height: 10),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    for (final m in media)
                      FilledButton.tonalIcon(
                        onPressed: () => _buka(teks(m['url'])),
                        icon: Icon(switch (teks(m['jenis'])) {
                          'mindmap' => Icons.account_tree_rounded,
                          'infografis' => Icons.insert_chart_rounded,
                          'lks' => Icons.edit_note_rounded,
                          _ => Icons.summarize_rounded,
                        }),
                        label: Text('${teks(m['label'])} (PDF)'),
                      ),
                  ]),
                ]),
              ),
            );
          },
        ),
      ]),
    );
  }
}

// ───────────────────────── ATURAN (sama dengan web) ─────────────────────────

/// Syarat tanggapan diskusi, sama persis dengan halaman web siswa.
const syaratDiskusiKata = 150;
const syaratDiskusiTautan = 3;
const syaratDiskusiPenanda = 'Sumber berita:';

int hitungKataDiskusi(String teks) {
  final t = teks.replaceAll(RegExp(r'''https?://[^\s<>"')\]]+''', caseSensitive: false), ' ');
  return t.split(RegExp(r'\s+')).where((w) => RegExp(r'[A-Za-z0-9À-ɏ]').hasMatch(w)).length;
}

bool tautanSahDiskusi(String u) => RegExp(r'^https?://[^\s/?#]+\.[^\s/?#]+[^\s]*$', caseSensitive: false).hasMatch(u.trim());

/// Memisahkan uraian dan daftar tautan dari jawaban tersimpan ("... Sumber berita: 1. https://...").
({String uraian, List<String> tautan}) pisahJawabanDiskusi(String teks) {
  final i = teks.toLowerCase().lastIndexOf(syaratDiskusiPenanda.toLowerCase());
  final uraian = i >= 0 ? teks.substring(0, i) : teks;
  final sisa = i >= 0 ? teks.substring(i) : '';
  final tautan = RegExp(r'''https?://[^\s<>"')\]]+''', caseSensitive: false).allMatches(sisa).map((m) => m.group(0)!).toList();
  return (uraian: uraian.trim(), tautan: tautan);
}

/// Absensi masih bisa diisi (sesi berjalan), sama dengan absBerjalan_ di web.
bool absBerjalan(Map<String, dynamic> m) {
  final a = peta(m['absen']);
  return teks(a['status']) == 'berjalan' && DateTime.now().millisecondsSinceEpoch <= angka(a['selesaiMs']);
}

String _tglMs(dynamic ms) {
  final n = angka(ms);
  if (n <= 0) return '';
  final d = DateTime.fromMillisecondsSinceEpoch(n);
  const b = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return '${d.day} ${b[d.month - 1]} ${d.year}';
}

/// Diskusi/ujian pada sesi yang sudah berakhir dan belum dikerjakan (sama dengan renderKunciSesi_ di web).
class SesiTerkunciScreen extends StatelessWidget {
  const SesiTerkunciScreen({super.key, required this.item});
  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final jenis = teks(item['jenis']);
    final selesai = _tglMs(item['sesiBerakhirMs']);
    return Scaffold(
      appBar: AppBar(title: Text(teks(item['judul']), overflow: TextOverflow.ellipsis)),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (teks(item['konten']).isNotEmpty)
          Card(child: Padding(padding: const EdgeInsets.all(16), child: Text(_teksHtml(teks(item['konten'])), style: const TextStyle(height: 1.5)))),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(children: [
              IkonBulat(Icons.lock_rounded, warna: cs.error, ukuran: 72),
              const SizedBox(height: 12),
              Text('Sesi ini sudah berakhir${selesai.isNotEmpty ? ' ($selesai)' : ''}',
                  textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Text(
                'Pengerjaan ${jenis == 'Ujian' ? 'ujian' : 'diskusi'} ini sudah ditutup. Jika Anda berhalangan, misalnya sakit atau terkendala jaringan, '
                'hubungi tutor pengampu agar sesi ini dibukakan untuk Anda.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: () => Navigator.pop(context, true),
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Sudah dibukakan tutor? Periksa lagi'),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

// ───────────────────────── DISKUSI ─────────────────────────

class DiskusiSiswaScreen extends StatefulWidget {
  const DiskusiSiswaScreen({super.key, required this.idMapel, required this.item, this.riwayat, this.terkunci = false});
  final String idMapel;
  final Map<String, dynamic> item;
  final Map<String, dynamic>? riwayat;
  final bool terkunci;

  @override
  State<DiskusiSiswaScreen> createState() => _DiskusiSiswaScreenState();
}

class _DiskusiSiswaScreenState extends State<DiskusiSiswaScreen> {
  final _uraian = TextEditingController();
  final List<TextEditingController> _tautan = [];
  bool _sibuk = false;
  bool _edit = false;

  String get _idMateri => teks(widget.item['id']);
  bool get _sudahDinilai => teks(widget.riwayat?['nilai']).isNotEmpty;
  bool get _terkirim => widget.riwayat != null;
  bool get _bolehTulis => !_sudahDinilai && !widget.terkunci && (!_terkirim || _edit);

  @override
  void initState() {
    super.initState();
    if (_terkirim) {
      _isi(teks(widget.riwayat?['jawaban']));
    } else {
      _isi('');
      Api.instance('waGetDraftDiskusi', [_s.idRombel, widget.idMapel, _idMateri, _s.nama]).then((r) {
        final d = peta(r);
        if (mounted && d['ada'] == true && _uraian.text.isEmpty) setState(() => _isi(teks(d['teks'])));
      }).catchError((_) {});
    }
  }

  void _isi(String teksJawaban) {
    final p = pisahJawabanDiskusi(teksJawaban);
    _uraian.text = p.uraian;
    for (final c in _tautan) {
      c.dispose();
    }
    _tautan.clear();
    final n = p.tautan.length > syaratDiskusiTautan ? p.tautan.length : syaratDiskusiTautan;
    for (var i = 0; i < n; i++) {
      _tautan.add(TextEditingController(text: i < p.tautan.length ? p.tautan[i] : ''));
    }
  }

  List<String> _ambilTautan() {
    final unik = <String>{};
    final out = <String>[];
    for (final c in _tautan) {
      final v = c.text.trim();
      if (v.isEmpty || !tautanSahDiskusi(v)) continue;
      final k = v.toLowerCase().replaceAll(RegExp(r'/+$'), '');
      if (unik.add(k)) out.add(v);
    }
    return out;
  }

  String _gabung(String uraian, List<String> tautan) =>
      '$uraian\n\n$syaratDiskusiPenanda\n${[for (var i = 0; i < tautan.length; i++) '${i + 1}. ${tautan[i]}'].join('\n')}';

  Map<String, dynamic> get _dasar => {'idRombel': _s.idRombel, 'idMapel': widget.idMapel, 'idMateri': _idMateri, 'nama': _s.nama};

  Future<void> _draft() async {
    final t = _ambilTautan();
    final teksDraft = t.isEmpty ? _uraian.text : _gabung(_uraian.text.trim(), t);
    final r = await jalankan(context, () => Api.instance('waSimpanDraftDiskusi', [{..._dasar, 'teks': teksDraft}]), teksProses: 'Menyimpan draft...');
    if (r.ok && mounted) {
      final d = peta(r.data);
      kabar(context, d['sukses'] == true ? 'Draft tersimpan.' : teks(d['pesan']), galat: d['sukses'] != true);
    }
  }

  Future<void> _kirim() async {
    final uraian = _uraian.text.trim();
    if (uraian.isEmpty) return kabar(context, 'Jawaban tidak boleh kosong.', galat: true);
    final k = hitungKataDiskusi(uraian);
    if (k < syaratDiskusiKata) {
      return kabar(context, 'Tanggapan baru $k kata. Minimal $syaratDiskusiKata kata (tautan tidak dihitung).', galat: true);
    }
    for (var j = 0; j < _tautan.length; j++) {
      final v = _tautan[j].text.trim();
      if (v.isNotEmpty && !tautanSahDiskusi(v)) {
        return kabar(context, 'Tautan ke-${j + 1} tidak valid. Awali dengan http:// atau https://.', galat: true);
      }
    }
    final tautan = _ambilTautan();
    if (tautan.length < syaratDiskusiTautan) {
      return kabar(context, 'Baru ${tautan.length} tautan sumber berita yang berbeda. Minimal $syaratDiskusiTautan tautan.', galat: true);
    }
    setState(() => _sibuk = true);
    try {
      final d = peta(await Api.instance('waSubmitJawaban', [{..._dasar, 'jawaban': _gabung(uraian, tautan)}]));
      if (!mounted) return;
      if (d['sukses'] == true) {
        kabar(context, teks(d['pesan'], 'Tanggapan terkirim.'));
        Navigator.pop(context, true);
      } else {
        kabar(context, teks(d['pesan'], 'Gagal mengirim.'), galat: true);
      }
    } on ApiException catch (e) {
      if (mounted) kabar(context, e.ramah, galat: true);
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final rw = widget.riwayat;
    final kata = hitungKataDiskusi(_uraian.text);
    final jmlTautan = _ambilTautan().length;
    final cukup = kata >= syaratDiskusiKata && jmlTautan >= syaratDiskusiTautan;
    return Scaffold(
      appBar: AppBar(title: Text(teks(widget.item['judul']), overflow: TextOverflow.ellipsis)),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                IkonBulat(Icons.forum_rounded, warna: _warna('Diskusi'), ukuran: 34, sudut: 10),
                const SizedBox(width: 10),
                const Text('Pertanyaan diskusi', style: TextStyle(fontWeight: FontWeight.w800)),
              ]),
              const SizedBox(height: 10),
              SelectableText(_teksHtml(teks(widget.item['konten'])), style: const TextStyle(height: 1.5)),
              if (teks(widget.item['batasWaktu']).isNotEmpty) ...[
                const SizedBox(height: 8),
                Text('Batas: ${teks(widget.item['batasWaktu'])}', style: TextStyle(fontSize: 12.5, color: cs.error)),
              ],
            ]),
          ),
        ),
        _KartuStatusDiskusi(riwayat: rw, terkunci: widget.terkunci),
        if (!_bolehTulis && _terkirim) ...[
          const SizedBox(height: 14),
          _JawabanTerkirim(teksJawaban: teks(rw?['jawaban']), waktu: teks(rw?['waktu'])),
          const SizedBox(height: 12),
          if (_terkirim && !_edit && !_sudahDinilai && !widget.terkunci)
            OutlinedButton.icon(onPressed: () => setState(() => _edit = true), icon: const Icon(Icons.edit_rounded), label: const Text('Ubah tanggapan')),
        ] else ...[
        const SizedBox(height: 14),
        Text(rw == null ? 'Tanggapan Anda' : 'Tanggapan Anda (terkirim ${teks(rw['waktu'])})', style: const TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        TextField(
          controller: _uraian,
          minLines: 6,
          maxLines: 16,
          readOnly: !_bolehTulis,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(hintText: _bolehTulis ? 'Tulis pendapat Anda dengan kalimat sendiri (minimal $syaratDiskusiKata kata)...' : ''),
        ),
        if (_bolehTulis)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('$kata / $syaratDiskusiKata kata · $jmlTautan / $syaratDiskusiTautan tautan',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: cukup ? Colors.green.shade700 : const Color(0xFFB45309))),
          ),
        const SizedBox(height: 14),
        Text('Sumber berita (minimal $syaratDiskusiTautan tautan berbeda)', style: const TextStyle(fontWeight: FontWeight.w800)),
        if (_bolehTulis)
          Text('Cantumkan tautan berita yang relevan dengan topik. Boleh menambah lebih dari $syaratDiskusiTautan.',
              style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
        const SizedBox(height: 6),
        for (var i = 0; i < _tautan.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: TextField(
              controller: _tautan[i],
              readOnly: !_bolehTulis,
              keyboardType: TextInputType.url,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'https://...',
                prefixIcon: const Icon(Icons.link_rounded),
                suffixIcon: _tautan[i].text.trim().isEmpty
                    ? null
                    : (tautanSahDiskusi(_tautan[i].text)
                        ? const Icon(Icons.check_circle_rounded, color: Colors.green)
                        : Icon(Icons.error_rounded, color: cs.error)),
              ),
            ),
          ),
        if (_bolehTulis)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() => _tautan.add(TextEditingController())),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Tambah tautan'),
            ),
          ),
        const SizedBox(height: 12),
        if (widget.terkunci && !_sudahDinilai)
          Text('Sesi ini sudah berakhir, jawaban tidak dapat diubah. Hubungi tutor pengampu bila perlu.', style: TextStyle(color: cs.error)),
        if (_terkirim && !_edit && !_sudahDinilai && !widget.terkunci)
          OutlinedButton.icon(onPressed: () => setState(() => _edit = true), icon: const Icon(Icons.edit_rounded), label: const Text('Ubah tanggapan')),
        if (_bolehTulis)
          Row(children: [
            if (!_terkirim) Expanded(child: OutlinedButton.icon(onPressed: _sibuk ? null : _draft, icon: const Icon(Icons.save_outlined), label: const Text('Simpan draft'))),
            if (!_terkirim) const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                onPressed: _sibuk ? null : _kirim,
                icon: _sibuk ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send_rounded),
                label: Text(_terkirim ? 'Kirim perubahan' : 'Kirim'),
              ),
            ),
          ]),
        ],
      ]),
    );
  }
}

/// Ringkasan status diskusi untuk siswa: terbuka/ditutup, terkirim, dan nilai (bila sudah dinilai).
class _KartuStatusDiskusi extends StatelessWidget {
  const _KartuStatusDiskusi({required this.riwayat, required this.terkunci});
  final Map<String, dynamic>? riwayat;
  final bool terkunci;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final rw = riwayat;
    final nilai = teks(rw?['nilai']);
    final dinilai = nilai.isNotEmpty;
    final terkirim = rw != null;
    final status = dinilai ? 'Sudah dinilai' : (terkirim ? 'Terkirim · menunggu penilaian tutor' : (terkunci ? 'Ditutup' : 'Belum dikerjakan'));
    final warna = dinilai ? Colors.green : (terkirim ? const Color(0xFF3B82F6) : (terkunci ? cs.error : cs.outline));
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: warna.withValues(alpha: 0.09), borderRadius: BorderRadius.circular(16), border: Border.all(color: warna.withValues(alpha: 0.35))),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Wrap(spacing: 6, runSpacing: 6, children: [
              Lencana(status, warna: warna),
              Lencana(terkunci ? 'Diskusi ditutup' : 'Diskusi dibuka', warna: terkunci ? cs.outline : Colors.green),
            ]),
            if (terkirim && teks(rw?['waktu']).isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('Dikirim ${teks(rw?['waktu'])}', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            ],
            if (dinilai && teks(rw?['komentar']).isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('"${teks(rw?['komentar'])}"', style: const TextStyle(fontStyle: FontStyle.italic)),
            ],
            if (dinilai && teks(rw?['penilai']).isNotEmpty)
              Text('— ${teks(rw?['penilai'])}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            if (terkunci && !terkirim)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Sesi sudah berakhir. Hubungi tutor pengampu bila perlu dibukakan.', style: TextStyle(fontSize: 12.5, color: cs.error)),
              ),
          ]),
        ),
        if (dinilai)
          Container(
            margin: const EdgeInsets.only(left: 12),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(color: Colors.green, borderRadius: BorderRadius.circular(14)),
            child: Column(children: [
              const Text('Nilai', style: TextStyle(color: Colors.white, fontSize: 11.5)),
              Text(nilai, style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
            ]),
          ),
      ]),
    );
  }
}

/// Jawaban diskusi yang sudah dikirim (tampil walaupun diskusi sudah ditutup).
class _JawabanTerkirim extends StatelessWidget {
  const _JawabanTerkirim({required this.teksJawaban, required this.waktu});
  final String teksJawaban;
  final String waktu;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final p = pisahJawabanDiskusi(teksJawaban);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Jawaban yang Anda kirim', style: TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          SelectableText(p.uraian.isEmpty ? '(kosong)' : p.uraian, style: const TextStyle(height: 1.5)),
          if (p.tautan.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(syaratDiskusiPenanda, style: const TextStyle(fontWeight: FontWeight.w700)),
            for (var i = 0; i < p.tautan.length; i++)
              InkWell(
                onTap: () => _buka(p.tautan[i]),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Text('${i + 1}. ${p.tautan[i]}', style: TextStyle(color: cs.primary, decoration: TextDecoration.underline)),
                ),
              ),
          ],
        ]),
      ),
    );
  }
}

// ───────────────────────── ABSENSI ─────────────────────────

class AbsensiSiswaScreen extends StatefulWidget {
  const AbsensiSiswaScreen({super.key, required this.idMapel, required this.item, this.riwayat, this.dibuka = false});
  final String idMapel;
  final Map<String, dynamic> item;
  final Map<String, dynamic>? riwayat;
  final bool dibuka;

  @override
  State<AbsensiSiswaScreen> createState() => _AbsensiSiswaScreenState();
}

class _AbsensiSiswaScreenState extends State<AbsensiSiswaScreen> {
  Map<String, dynamic>? _tercatat;

  @override
  void initState() {
    super.initState();
    _tercatat = widget.riwayat;
  }

  Future<void> _isi() async {
    final ok = await konfirmasi(context, 'Catat kehadiran Anda sekarang?', 'Setelah dikirim, absensi tidak dapat diubah.', ya: 'Ya, saya hadir');
    if (!ok || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waAbsenIsi', [
          {'idRombel': _s.idRombel, 'idMapel': widget.idMapel, 'nama': _s.nama, 'idMateri': teks(widget.item['id'])}
        ]), teksProses: 'Mencatat kehadiran...');
    if (!r.ok || !mounted) return;
    final d = peta(r.data);
    if (d['sukses'] == true) {
      setState(() => _tercatat = {'jawaban': 'Hadir', 'waktu': teks(d['waktu'])});
      if (d['sudah'] == true) kabar(context, teks(d['pesan']));
    } else {
      final pesan = teks(d['pesan'], 'Absensi gagal dicatat.');
      if (pesan.contains('sudah tidak aktif untuk kelas Anda')) {
        // v1.38.7: mapel sudah dinonaktifkan sekolah -> perbarui daftar mapel lalu kembali ke beranda
        kabar(context, pesan);
        await SesiSiswa.instance.segarkan(paksa: true);
        if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
        return;
      }
      kabar(context, pesan, galat: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final it = widget.item;
    final absen = peta(it['absen']);
    final berjalan = absBerjalan(it);
    final bisaIsi = _tercatat == null && (berjalan || widget.dibuka);
    final ditutup = _tercatat == null && !bisaIsi;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.pop(context, _tercatat != null && widget.riwayat == null);
      },
      child: Scaffold(
        appBar: AppBar(title: Text(teks(it['judul'], 'Absensi'))),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          Center(
            child: IkonBulat(
              _tercatat != null ? Icons.verified_rounded : (ditutup ? Icons.block_rounded : Icons.how_to_reg_rounded),
              warna: _tercatat != null ? Colors.green : (ditutup ? cs.error : _warna('Absensi')),
              ukuran: 96,
            ),
          ),
          const SizedBox(height: 16),
          Text(teks(it['judul'], 'Absensi'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          if (teks(absen['rentang']).isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 4), child: Text(teks(absen['rentang']), textAlign: TextAlign.center, style: TextStyle(color: cs.onSurfaceVariant))),
          const SizedBox(height: 20),
          if (_tercatat != null) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: Colors.green.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(16)),
              child: Text('Kehadiran Anda tercatat\n${teks(_tercatat!['waktu'])}${teks(_tercatat!['catatan']).isNotEmpty ? ' · ${teks(_tercatat!['catatan'])}' : ''}',
                  textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            const SizedBox(height: 10),
            Text('Absensi hanya diisi satu kali untuk setiap sesi dan tidak dapat diubah.', textAlign: TextAlign.center, style: TextStyle(color: cs.onSurfaceVariant)),
          ] else if (bisaIsi) ...[
            Text(
              'Setiap sesi, Anda wajib mengisi absensi. Absensi hanya dapat diisi satu kali, selama sesi berjalan'
              '${angka(absen['selesaiMs']) > 0 ? ' (sampai ${_tglMs(absen['selesaiMs'])} pukul 23:59)' : ''}. Kehadiran dihitung dalam penilaian.'
              '${widget.dibuka && !berjalan ? ' Sesi ini sudah berakhir tetapi dibukakan tutor untuk Anda.' : ''}',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54)),
              onPressed: _isi,
              icon: const Icon(Icons.check_rounded),
              label: const Text('Saya hadir di sesi ini'),
            ),
          ] else ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: cs.errorContainer, borderRadius: BorderRadius.circular(16)),
              child: Text(
                'Absensi sesi ini tidak terisi\nSesi berakhir pada ${_tglMs(absen['selesaiMs'])}. Bila Anda berhalangan, misalnya sakit atau terkendala jaringan, '
                'hubungi tutor pengampu agar sesi ini dibukakan untuk Anda.',
                textAlign: TextAlign.center,
                style: TextStyle(color: cs.onErrorContainer),
              ),
            ),
            const SizedBox(height: 16),
            const FilledButton(onPressed: null, child: Text('Saya hadir di sesi ini')),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => Navigator.pop(context, true),
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Sudah dibukakan tutor? Periksa lagi'),
            ),
          ],
        ]),
      ),
    );
  }
}

// ───────────────────────── UJIAN ─────────────────────────

class UjianSiswaScreen extends StatefulWidget {
  const UjianSiswaScreen({super.key, required this.idMapel, required this.item});
  final String idMapel;
  final Map<String, dynamic> item;

  @override
  State<UjianSiswaScreen> createState() => _UjianSiswaScreenState();
}

class _UjianSiswaScreenState extends State<UjianSiswaScreen> {
  int _versi = 0;
  bool _berubah = false;

  String get _idUjian => teks(widget.item['id']);

  String _pin = '';
  // v1.53.0: token slot dari pengawas (Masa Ujian serentak)
  bool _perluToken = false;
  String _token = '';

  Future<String?> _mintaKode() async {
    final c = TextEditingController(text: _s.kodeAkses);
    final cPin = TextEditingController();
    final cTok = TextEditingController();
    final perluPin = _s.punyaPin;
    final perluToken = _perluToken;
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Kode akses ujian'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: c, autofocus: !perluPin || c.text.isEmpty, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Kode akses dari tutor')),
          // v1.39.0: PIN diminta lagi sebelum ujian
          if (perluPin)
            TextField(
              controller: cPin,
              autofocus: c.text.isNotEmpty,
              obscureText: true,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
              decoration: const InputDecoration(labelText: 'PIN Anda (6 angka)'),
            ),
          if (perluToken)
            TextField(
              controller: cTok,
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [LengthLimitingTextInputFormatter(6)],
              decoration: const InputDecoration(labelText: 'Token ujian dari pengawas', helperText: '6 huruf/angka yang diumumkan pengawas ruang'),
            ),
          const SizedBox(height: 12),
          const Text('Selama ujian jangan keluar dari aplikasi. Setiap kali keluar, alarm akan berbunyi keras (juga saat ponsel senyap) dan tercatat sebagai pelanggaran.',
              style: TextStyle(fontSize: 12.5)),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Mulai')),
        ],
      ),
    );
    if (ok != true || c.text.trim().isEmpty) return null;
    if (perluPin && cPin.text.trim().length != 6) {
      if (mounted) kabar(context, 'Isi PIN 6 angka untuk memulai ujian.', galat: true);
      return null;
    }
    if (perluToken && cTok.text.trim().isEmpty) {
      if (mounted) kabar(context, 'Isi token ujian dari pengawas.', galat: true);
      return null;
    }
    _token = cTok.text.trim().toUpperCase();
    _pin = cPin.text.trim();
    await _s.simpanKode(c.text);
    return _s.kodeAkses;
  }

  Future<void> _mulai() async {
    if (kIsWeb) {
      await showDialog<void>(
        context: context,
        builder: (d) => AlertDialog(
          icon: const Icon(Icons.phone_android_rounded, size: 36),
          title: const Text('Ujian hanya lewat aplikasi Android'),
          content: const Text('Demi kejujuran ujian, ujian hanya dapat dikerjakan melalui aplikasi TH.E-Course di ponsel Android. '
              'Silakan buka aplikasi di ponsel Anda, lalu mulai ujian dari sana.'),
          actions: [FilledButton(onPressed: () => Navigator.pop(d), child: const Text('Mengerti'))],
        ),
      );
      return;
    }
    final kode = await _mintaKode();
    if (kode == null || !mounted) return;
    final pd = await UjianAman.perangkat();   // v1.54.0: satu perangkat per siswa per ujian
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waMulaiUjian', [_idUjian, _s.idRombel, widget.idMapel, _s.nama, kode, _pin, _token, pd]), teksProses: 'Menyiapkan soal...');
    if (!r.ok || !mounted) return;
    final d = peta(r.data);
    if (d['sukses'] != true) {
      kabar(context, teks(d['pesan'], 'Ujian belum bisa dimulai.'), galat: true);
      return;
    }
    final hasil = await Navigator.of(context).push<Map<String, dynamic>>(MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => KerjakanUjianScreen(idMapel: widget.idMapel, idUjian: _idUjian, judul: teks(widget.item['judul']), kode: kode, data: d),
    ));
    _berubah = true;
    if (hasil != null && mounted) {
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Ujian selesai'),
          content: Text(hasil['sukses'] == true
              ? 'Nilai Anda: ${teks(hasil['nilaiTotal'])} dari ${teks(hasil['nilaiMaks'], '100')}\n${teks(hasil['jumlahBenar'])} dari ${teks(hasil['totalSoal'])} soal benar.'
              : teks(hasil['pesan'], 'Jawaban belum terkirim.')),
          actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('OK'))],
        ),
      );
    }
    if (mounted) setState(() => _versi++);
  }

  Future<void> _ajukan(String jenis) async {
    final c = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('Ajukan $jenis'),
        content: TextField(controller: c, maxLines: 3, decoration: const InputDecoration(labelText: 'Alasan')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Kirim')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waUjianAjukan', [_s.idRombel, _s.nama, _idUjian, c.text]), teksProses: 'Mengirim pengajuan...');
    if (r.ok && mounted) {
      kabar(context, 'Pengajuan ${teks(peta(r.data)['jenis']).toLowerCase()} dikirim ke tutor.');
      setState(() => _versi++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.pop(context, _berubah);
      },
      child: Scaffold(
        appBar: AppBar(title: Text(teks(widget.item['judul']), overflow: TextOverflow.ellipsis)),
        body: Muatan<Map<String, dynamic>>(
          key: ValueKey(_versi),
          muat: () async => peta(await Api.instance('waStatusUjian', [_idUjian, _s.idRombel, widget.idMapel, _s.nama])),
          bangun: (context, d, _) {
            final uj = peta(d['uj']);
            _perluToken = uj['perluToken'] == true;
            final selesai = d['selesai'] == true;
            final tombol = teks(uj['tombol']);
            final info = [teks(uj['pesan']), teks(uj['teks']), teks(uj['info']), teks(d['pesan'])].where((x) => x.isNotEmpty).toSet().join('\n');
            return ListView(padding: const EdgeInsets.all(20), children: [
              Center(child: IkonBulat(Icons.quiz_rounded, warna: _warna('Ujian'), ukuran: 92)),
              const SizedBox(height: 16),
              Text(teks(widget.item['judul']), textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(
                [
                  if (angka(d['jumlahSoal'] ?? widget.item['jumlahSoal']) > 0) '${angka(d['jumlahSoal'] ?? widget.item['jumlahSoal'])} soal',
                  if (angka(widget.item['durasiMenit']) > 0) '${angka(widget.item['durasiMenit'])} menit',
                ].join(' · '),
                textAlign: TextAlign.center,
                style: TextStyle(color: cs.onSurfaceVariant),
              ),
              const SizedBox(height: 20),
              if (selesai || d['nilaiTotal'] != null)
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(gradient: Gaya.gradasi, borderRadius: BorderRadius.circular(Gaya.radius)),
                  child: Column(children: [
                    const Text('Nilai Anda', style: TextStyle(color: Colors.white70)),
                    Text('${d['nilaiTotal'] ?? '-'}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 40)),
                    Text('dari ${d['nilaiMaks'] ?? 100}', style: const TextStyle(color: Colors.white70)),
                  ]),
                ),
              if (info.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 16), child: Text(info, textAlign: TextAlign.center)),
              const SizedBox(height: 20),
              if (!selesai && (uj.isEmpty || uj['bolehMulai'] == true || uj['berlangsung'] == true))
                FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54)),
                  onPressed: _mulai,
                  icon: const Icon(Icons.play_arrow_rounded),
                  label: Text(uj['berlangsung'] == true ? 'Lanjutkan ujian' : 'Mulai ujian'),
                ),
              if (tombol.isNotEmpty) ...[
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  onPressed: () => _ajukan(tombol.startsWith('remedial') ? 'remedial' : 'susulan'),
                  icon: const Icon(Icons.assignment_late_rounded),
                  label: Text(tombol.startsWith('remedial') ? 'Ajukan remedial' : 'Ajukan susulan'),
                ),
              ],
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: const Color(0xFFE9A23B).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                child: const Row(children: [
                  Icon(Icons.info_rounded, color: Color(0xFFE9A23B)),
                  SizedBox(width: 10),
                  Expanded(child: Text('Selama ujian jangan keluar dari aplikasi. Berpindah aplikasi dicatat dan bisa mengunci ujian.', style: TextStyle(fontSize: 12.5))),
                ]),
              ),
            ]);
          },
        ),
      ),
    );
  }
}

/// Layar mengerjakan ujian: soal pilihan ganda, penghitung waktu, deteksi keluar aplikasi.
class KerjakanUjianScreen extends StatefulWidget {
  const KerjakanUjianScreen({super.key, required this.idMapel, required this.idUjian, required this.judul, required this.kode, required this.data});
  final String idMapel;
  final String idUjian;
  final String judul;
  final String kode;
  final Map<String, dynamic> data;

  @override
  State<KerjakanUjianScreen> createState() => _KerjakanUjianScreenState();
}

class _KerjakanUjianScreenState extends State<KerjakanUjianScreen> with WidgetsBindingObserver {
  late final List<Map<String, dynamic>> _soal = daftar(widget.data['soal']).map(peta).toList();
  final Map<String, String> _jawab = {};
  final _halaman = PageController();
  int _idx = 0;
  Timer? _jam;
  Timer? _detak;
  int _sisaDetik = -1;
  int _akhirMs = 0;
  int _tambah = 0;
  bool _kirim = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final durasi = angka(widget.data['durasiMenit']);
    final mulai = angka(widget.data['waktuMulaiMs']);
    _tambah = angka(widget.data['tambahMenit']);
    if (durasi > 0) {
      _akhirMs = (mulai > 0 ? mulai : DateTime.now().millisecondsSinceEpoch) + durasi * 60000;
      _hitung(_akhirMs);
      _jam = Timer.periodic(const Duration(seconds: 1), (_) => _hitung(_akhirMs));
    }
    UjianAman.aman(true);   // v1.54.0: layar ujian tidak bisa di-screenshot / direkam
    // v1.53.0: detak ke server (status tersambung di layar pengawas) + menerima tambahan waktu dari pengawas
    _kirimDetak();
    _detak = Timer.periodic(const Duration(seconds: 60), (_) => _kirimDetak());
  }

  Future<void> _kirimDetak() async {
    if (_kirim) return;
    try {
      final pd = await UjianAman.perangkat();
      final d = peta(await Api.instance('waUjianDetak', [widget.idUjian, SesiSiswa.instance.idRombel, SesiSiswa.instance.nama, widget.kode, pd], const Duration(seconds: 25)));
      if (!mounted || _kirim) return;
      if (d['perangkatLain'] == true) {
        _kirim = true;
        Navigator.pop(context, {'sukses': false, 'pesan': '${teks(d['pesan'], 'Ujian ini terdaftar di perangkat lain.')} Hubungi pengawas.'});
        return;
      }
      // v1.54.0: layar terbagi / jendela mengambang dihitung sebagai pelanggaran
      if (await UjianAman.layarTerbagi() && mounted && !_kirim) _laporPelanggaran('layar_terbagi');
      final t = angka(d['tambahMenit']);
      if (!mounted || d['sukses'] != true || _akhirMs == 0) return;
      if (t > _tambah) {
        _akhirMs += (t - _tambah) * 60000;
        kabar(context, 'Pengawas menambah waktu ${t - _tambah} menit.');
        _tambah = t;
      }
    } catch (_) {}
  }

  void _laporPelanggaran(String jenis) {
    AlarmUjian.mulai();
    Future<void>.delayed(const Duration(seconds: 1), AlarmUjian.henti);
    Api.instance('waLaporPindahTab', [widget.idUjian, SesiSiswa.instance.idRombel, SesiSiswa.instance.nama, widget.kode, jenis]).then((r) {
      final d = peta(r);
      if (!mounted || _kirim) return;
      if (d['terkunci'] == true) {
        _kirim = true;
        Navigator.pop(context, {'sukses': false, 'pesan': 'Ujian terkunci karena pelanggaran berulang. Hubungi pengawas.'});
      } else if (angka(d['percobaan']) > 0) {
        kabar(context, 'Peringatan: layar terbagi / jendela mengambang terdeteksi (${angka(d['percobaan'])}/${angka(d['batasPercobaan'])}). Tutup aplikasi lain.', galat: true);
      }
    }).catchError((_) {});
  }

  void _hitung(int akhirMs) {
    final s = ((akhirMs - DateTime.now().millisecondsSinceEpoch) / 1000).floor();
    if (!mounted) return;
    setState(() => _sisaDetik = s < 0 ? 0 : s);
    if (s <= 0 && !_kirim) _kirimJawaban(otomatis: true);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    AlarmUjian.henti(segera: true);
    UjianAman.aman(false);
    _jam?.cancel();
    _detak?.cancel();
    _halaman.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      AlarmUjian.henti();
      return;
    }
    if (state == AppLifecycleState.paused && !_kirim) {
      AlarmUjian.mulai();
      Api.instance('waLaporPindahTab', [widget.idUjian, SesiSiswa.instance.idRombel, SesiSiswa.instance.nama, widget.kode]).then((r) {
        final d = peta(r);
        if (!mounted) return;
        if (d['terkunci'] == true) {
          _kirim = true;
          Navigator.pop(context, {'sukses': false, 'pesan': 'Ujian terkunci karena Anda keluar dari aplikasi terlalu sering. Hubungi tutor.'});
        } else if (angka(d['percobaan']) > 0) {
          kabar(context, 'Peringatan: Anda keluar dari aplikasi (${angka(d['percobaan'])}/${angka(d['batasPercobaan'])}).', galat: true);
        }
      }).catchError((_) {});
    }
  }

  Future<void> _kirimJawaban({bool otomatis = false}) async {
    if (_kirim) return;
    if (!otomatis) {
      final kosong = _soal.length - _jawab.length;
      final ok = await konfirmasi(context, 'Kirim jawaban?', kosong > 0 ? 'Masih ada $kosong soal belum dijawab. Tetap kirim?' : 'Jawaban tidak bisa diubah setelah dikirim.', ya: 'Kirim');
      if (!ok || !mounted) return;
    }
    _kirim = true;
    _jam?.cancel();
    final pd = await UjianAman.perangkat();
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waSubmitUjian', [
          {
            'perangkat': pd,
            'idUjian': widget.idUjian,
            'idRombel': SesiSiswa.instance.idRombel,
            'idMapel': widget.idMapel,
            'nama': SesiSiswa.instance.nama,
            'kodeAkses': widget.kode,
            'jawaban': _jawab,
          }
        ]), teksProses: 'Mengirim jawaban...');
    if (!mounted) return;
    if (r.ok) {
      Navigator.pop(context, peta(r.data));
    } else {
      _kirim = false;
    }
  }

  String get _waktu {
    if (_sisaDetik < 0) return '';
    final m = _sisaDetik ~/ 60, d = _sisaDetik % 60;
    return '${m.toString().padLeft(2, '0')}:${d.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await konfirmasi(context, 'Keluar dari ujian?', 'Jawaban belum terkirim. Anda bisa melanjutkan nanti selama waktu masih ada.', ya: 'Keluar') && context.mounted) {
          Navigator.pop(context);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.judul, overflow: TextOverflow.ellipsis),
          actions: [
            if (_waktu.isNotEmpty)
              Container(
                margin: const EdgeInsets.only(right: 12),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: (_sisaDetik < 300 ? cs.error : cs.primary).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99)),
                child: Row(children: [
                  Icon(Icons.timer_rounded, size: 18, color: _sisaDetik < 300 ? cs.error : cs.primary),
                  const SizedBox(width: 4),
                  Text(_waktu, style: TextStyle(fontWeight: FontWeight.w800, color: _sisaDetik < 300 ? cs.error : cs.primary)),
                ]),
              ),
          ],
        ),
        body: Column(children: [
          SizedBox(
            height: 56,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              itemCount: _soal.length,
              separatorBuilder: (context, i) => const SizedBox(width: 6),
              itemBuilder: (context, i) {
                final dijawab = _jawab.containsKey(teks(_soal[i]['id']));
                return InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => _halaman.animateToPage(i, duration: const Duration(milliseconds: 250), curve: Curves.easeOut),
                  child: Container(
                    width: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: i == _idx ? cs.primary : (dijawab ? cs.primary.withValues(alpha: 0.15) : cs.surfaceContainerLowest),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: i == _idx ? cs.primary : cs.outlineVariant),
                    ),
                    child: Text('${i + 1}', style: TextStyle(fontWeight: FontWeight.w800, color: i == _idx ? cs.onPrimary : null)),
                  ),
                );
              },
            ),
          ),
          Expanded(
            child: PageView.builder(
              controller: _halaman,
              itemCount: _soal.length,
              onPageChanged: (i) => setState(() => _idx = i),
              itemBuilder: (context, i) {
                final s = _soal[i];
                final id = teks(s['id']);
                final opsi = peta(s['opsi']);
                return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
                  Text('Soal ${i + 1} dari ${_soal.length}', style: TextStyle(color: cs.onSurfaceVariant)),
                  const SizedBox(height: 8),
                  Text(_teksHtml(teks(s['pertanyaan'])), style: const TextStyle(fontSize: 16.5, height: 1.5, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 16),
                  for (final e in opsi.entries)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Material(
                        color: _jawab[id] == e.key ? cs.primary.withValues(alpha: 0.12) : cs.surfaceContainerLowest,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: _jawab[id] == e.key ? cs.primary : cs.outlineVariant, width: _jawab[id] == e.key ? 2 : 1)),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(16),
                          onTap: () => setState(() => _jawab[id] = e.key),
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              CircleAvatar(
                                radius: 14,
                                backgroundColor: _jawab[id] == e.key ? cs.primary : cs.surfaceContainerHighest,
                                child: Text(e.key, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: _jawab[id] == e.key ? cs.onPrimary : cs.onSurface)),
                              ),
                              const SizedBox(width: 12),
                              Expanded(child: Text(_teksHtml('${e.value}'), style: const TextStyle(fontSize: 15, height: 1.4))),
                            ]),
                          ),
                        ),
                      ),
                    ),
                ]);
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: Row(children: [
                if (_idx > 0)
                  OutlinedButton.icon(
                    onPressed: () => _halaman.previousPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut),
                    icon: const Icon(Icons.chevron_left_rounded),
                    label: const Text('Sebelumnya'),
                  ),
                const Spacer(),
                if (_idx < _soal.length - 1)
                  FilledButton.icon(
                    onPressed: () => _halaman.nextPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut),
                    icon: const Icon(Icons.chevron_right_rounded),
                    label: const Text('Berikutnya'),
                  )
                else
                  FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: Colors.green),
                    onPressed: _kirim ? null : () => _kirimJawaban(),
                    icon: const Icon(Icons.send_rounded),
                    label: Text('Kirim (${_jawab.length}/${_soal.length})'),
                  ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}
