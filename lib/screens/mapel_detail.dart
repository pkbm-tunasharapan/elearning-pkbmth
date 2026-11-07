import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'soal_ujian.dart';
import 'ujian.dart';
import '../kalender.dart';
import '../ruang.dart';
import 'admin_lain.dart';
import 'buat_otomatis.dart';
import 'kurikulum.dart';
import 'rpp.dart';
import 'media_ajar.dart';

String? get _t => Sesi.instance.token;

/// Mengubah HTML sederhana menjadi teks biasa untuk pratinjau.
String htmlKeTeks(String s) => s
    .replaceAll(RegExp(r'<br\s*/?>|</p>|</div>|</li>', caseSensitive: false), '\n')
    .replaceAll(RegExp(r'<[^>]+>'), '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll(RegExp(r'\n{3,}'), '\n\n')
    .trim();

IconData _ikonJenis(String j) => switch (j) {
      'Diskusi' => Icons.forum_rounded,
      'Ujian' => Icons.quiz_rounded,
      'Materi' => Icons.article_rounded,
      _ => Icons.description_rounded,
    };

Color _warnaJenis(String j) => switch (j) {
      'Diskusi' => const Color(0xFF2F9E8F),
      'Ujian' => const Color(0xFFE9A23B),
      'Materi' => const Color(0xFF3B82F6),
      _ => const Color(0xFF8B5CF6),
    };

Color _warnaStatus(BuildContext c, String s) => switch (s) {
      'Aktif' => Colors.green,
      'Selesai' => Theme.of(c).colorScheme.outline,
      _ => const Color(0xFFE9A23B),
    };

/// Detail satu mata pelajaran: konten, absensi, nilai, siswa.
class MapelDetailScreen extends StatelessWidget {
  const MapelDetailScreen({super.key, required this.idMapel, required this.namaMapel, required this.namaRombel});
  final String idMapel;
  final String namaMapel;
  final String namaRombel;

  @override
  Widget build(BuildContext context) {
    final lihat = Sesi.instance.hanyaLihat;
    return DefaultTabController(
      length: lihat ? 6 : 7,
      child: Scaffold(
        appBar: AppBar(
          titleSpacing: 0,
          title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(namaMapel, overflow: TextOverflow.ellipsis),
            Text(namaRombel, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ]),
          actions: [
            IconButton(
              tooltip: 'Chat kelas',
              onPressed: () => bukaChatStaf(Navigator.of(context), 'MAPEL:$idMapel', namaRombel: namaRombel),
              icon: const Icon(Icons.chat_rounded),
            ),
            PopupMenuButton<String>(
              tooltip: 'Lainnya',
              icon: const Icon(Icons.more_vert_rounded),
              onSelected: (v) {
                if (v == 'media') {
                  buatMediaAjarMassal(context, idMapel);
                  return;
                }
                final nav = Navigator.of(context);
                final m = Sesi.instance.mapel.where((x) => teks(x['idMapel']) == idMapel).firstOrNull;
                nav.push(MaterialPageRoute(
                  builder: (_) => KalenderStafScreen(idRombel: teks(m?['idRombel']).isEmpty ? null : teks(m?['idRombel']), idMapel: idMapel, denganAppBar: true),
                ));
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'kalender', child: ListTile(leading: Icon(Icons.calendar_month_rounded), title: Text('Kalender akademik'))),
                if (!lihat)
                  const PopupMenuItem(value: 'media', child: ListTile(leading: Icon(Icons.edit_note_rounded), title: Text('LKPD untuk semua materi'))),
              ],
            ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(52),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: TabBar(
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                tabs: [
                  const Tab(text: 'Konten'), const Tab(text: 'Kurikulum'), const Tab(text: 'Jadwal Ujian'), const Tab(text: 'Absensi'), const Tab(text: 'Nilai'),
                  if (!lihat) const Tab(text: 'Siswa'),
                  const Tab(text: 'RPP'),
                ],
              ),
            ),
          ),
        ),
        body: TabBarView(children: [
          _TabKonten(idMapel: idMapel, judul: '$namaMapel · $namaRombel'),
          KurikulumTab(idMapel: idMapel, judul: '$namaMapel · $namaRombel'),
          JadwalUjianTab(idMapel: idMapel),
          _TabAbsensi(idMapel: idMapel),
          _TabNilai(idMapel: idMapel),
          if (!lihat) _TabSiswa(idMapel: idMapel),
          RppTab(idMapel: idMapel),
        ]),
      ),
    );
  }
}

// ───────────────────────────── KONTEN ─────────────────────────────

class _TabKonten extends StatefulWidget {
  const _TabKonten({required this.idMapel, required this.judul});
  final String idMapel;
  final String judul;

  @override
  State<_TabKonten> createState() => _TabKontenState();
}

class _TabKontenState extends State<_TabKonten> with AutomaticKeepAliveClientMixin {
  int _versi = 0;
  String _saring = 'Semua';
  final Set<String> _pilih = {};

  @override
  bool get wantKeepAlive => true;

  void _muatUlang() => setState(() {
        _versi++;
        _pilih.clear();
      });

  Future<void> _ubah(Map<String, dynamic>? item, List<String> sesi, {String? jenis}) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => EditorItemScreen(idMapel: widget.idMapel, item: item, daftarSesi: sesi, jenisBaru: jenis),
    ));
    if (ok == true) _muatUlang();
  }

  Future<void> _status(List<String> ids, String status) async {
    final r = await jalankan(context, () => Api.instance('waStafMateriStatus', [_t, widget.idMapel, ids, status]), teksProses: 'Mengubah status...');
    if (!r.ok || !mounted) return;
    final d = peta(r.data);
    final gagal = daftar(d['gagal']).map(peta).toList();
    if (gagal.isEmpty) {
      kabar(context, '${daftar(d['berhasil']).length} item menjadi $status.');
    } else {
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text('${daftar(d['berhasil']).length} berhasil, ${gagal.length} gagal'),
          content: SingleChildScrollView(child: Text(gagal.map((g) => '• ${teks(g['judul'])}: ${teks(g['alasan'])}').join('\n'))),
          actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup'))],
        ),
      );
    }
    _muatUlang();
  }

  Future<void> _hapus(Map<String, dynamic> item) async {
    final ok = await konfirmasi(context, 'Hapus ${teks(item['jenis']).toLowerCase()}?',
        '"${teks(item['judul'])}" akan dihapus${teks(item['jenis']) == 'Ujian' ? ' beserta semua soalnya' : ''}.',
        ya: 'Hapus');
    if (!ok || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafMateriHapus', [_t, widget.idMapel, teks(item['id'])]), teksProses: 'Menghapus...');
    if (r.ok) _muatUlang();
  }

  void _menuItem(Map<String, dynamic> item, List<String> sesi) {
    final jenis = teks(item['jenis']);
    final status = teks(item['status']);
    final boleh = item['boleh'] == true;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: IkonBulat(_ikonJenis(jenis), warna: _warnaJenis(jenis), ukuran: 40, sudut: 12),
            title: Text(teks(item['judul']), maxLines: 2, overflow: TextOverflow.ellipsis),
            subtitle: Text('$jenis · ${teks(item['sesi'])} · $status'),
          ),
          const Divider(),
          if (boleh) ListTile(leading: const Icon(Icons.edit_rounded), title: const Text('Ubah'), onTap: () { Navigator.pop(c); _ubah(item, sesi); }),
          if (jenis == 'Materi')
            ListTile(
              leading: const Icon(Icons.collections_rounded),
              title: const Text('Media ajar: mindmap, infografis, poster, LKPD'),
              onTap: () {
                Navigator.pop(c);
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => MediaAjarScreen(idMapel: widget.idMapel, item: item)));
              },
            ),
          if (jenis == 'Materi')
            ListTile(
              leading: const Icon(Icons.visibility_rounded),
              title: const Text('Siapa yang sudah membaca'),
              onTap: () {
                Navigator.pop(c);
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => PembacaScreen(idMapel: widget.idMapel, item: item)));
              },
            ),
          if (jenis == 'Diskusi')
            ListTile(
              leading: const Icon(Icons.grading_rounded),
              title: Text(item['bolehNilai'] == true ? 'Lihat & nilai tanggapan' : 'Lihat tanggapan'),
              subtitle: item['bolehNilai'] == true || teks(item['pengampu']).isEmpty ? null : Text('Dinilai oleh ${teks(item['pengampu'])}'),
              onTap: () {
                Navigator.pop(c);
                Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => DiskusiScreen(idMapel: widget.idMapel, item: item, bolehNilai: item['bolehNilai'] == true),
                ));
              },
            ),
          if (jenis == 'Ujian')
            ListTile(
              leading: const Icon(Icons.list_alt_rounded),
              title: Text('Soal ujian (${angka(item['jumlahSoal'])})'),
              onTap: () async {
                Navigator.pop(c);
                await Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => SoalUjianScreen(idMapel: widget.idMapel, idUjian: teks(item['id']), judul: teks(item['judul'])),
                ));
                _muatUlang();
              },
            ),
          if (boleh && status != 'Aktif')
            ListTile(leading: const Icon(Icons.publish_rounded, color: Colors.green), title: const Text('Terbitkan (Aktif)'), onTap: () { Navigator.pop(c); _status([teks(item['id'])], 'Aktif'); }),
          if (boleh && status != 'Draft')
            ListTile(leading: const Icon(Icons.edit_note_rounded), title: const Text('Kembalikan ke Draft'), onTap: () { Navigator.pop(c); _status([teks(item['id'])], 'Draft'); }),
          if (boleh && status != 'Selesai')
            ListTile(leading: const Icon(Icons.task_alt_rounded), title: const Text('Tandai Selesai'), onTap: () { Navigator.pop(c); _status([teks(item['id'])], 'Selesai'); }),
          if (boleh)
            ListTile(
              leading: Icon(Icons.delete_rounded, color: Theme.of(context).colorScheme.error),
              title: Text('Hapus', style: TextStyle(color: Theme.of(context).colorScheme.error)),
              onTap: () { Navigator.pop(c); _hapus(item); },
            ),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_versi),
      muat: () async => peta(await Api.instance('waStafMateriLengkap', [_t, widget.idMapel])),
      bangun: (context, d, segarkan) {
        final semua = daftar(d['items']).map(peta).toList();
        final paket = peta(d['sesiPaket']);
        final sesi = daftar(paket['sesi']).map((s) => teks(peta(s)['nama'])).where((s) => s.isNotEmpty).toList();
        final list = semua.where((x) => _saring == 'Semua' || teks(x['jenis']) == _saring).toList();
        final grup = <String, List<Map<String, dynamic>>>{};
        for (final x in list) {
          grup.putIfAbsent(teks(x['sesi'], 'Sesi 1'), () => []).add(x);
        }
        final urutSesi = grup.keys.toList()
          ..sort((a, b) {
            final ia = sesi.indexOf(a), ib = sesi.indexOf(b);
            return (ia < 0 ? 999 : ia).compareTo(ib < 0 ? 999 : ib);
          });
        final kini = teks(paket['sekarang']);
        final cs = Theme.of(context).colorScheme;

        return Scaffold(
          backgroundColor: Colors.transparent,
          floatingActionButton: _pilih.isNotEmpty || Sesi.instance.hanyaLihat
              ? null
              : FloatingActionButton.extended(
                  onPressed: () => showModalBottomSheet<void>(
                    context: context,
                    showDragHandle: true,
                    builder: (c) => SafeArea(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        for (final j in ['Materi', 'Diskusi', 'Ujian'])
                          ListTile(
                            leading: IkonBulat(_ikonJenis(j), warna: _warnaJenis(j), ukuran: 40, sudut: 12),
                            title: Text('$j baru'),
                            onTap: () { Navigator.pop(c); _ubah(null, sesi, jenis: j); },
                          ),
                        const SizedBox(height: 8),
                      ]),
                    ),
                  ),
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Tambah'),
                ),
          bottomNavigationBar: _pilih.isEmpty
              ? null
              : SafeArea(
                  child: Container(
                    margin: const EdgeInsets.all(12),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                    decoration: BoxDecoration(color: cs.inverseSurface, borderRadius: BorderRadius.circular(18)),
                    child: Row(children: [
                      IconButton(onPressed: () => setState(_pilih.clear), icon: Icon(Icons.close_rounded, color: cs.onInverseSurface)),
                      Text('${_pilih.length} dipilih', style: TextStyle(color: cs.onInverseSurface, fontWeight: FontWeight.w700)),
                      const Spacer(),
                      TextButton(onPressed: () => _status(_pilih.toList(), 'Aktif'), child: const Text('Terbitkan')),
                      TextButton(onPressed: () => _status(_pilih.toList(), 'Draft'), child: const Text('Draft')),
                    ]),
                  ),
                ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  for (final j in ['Semua', 'Materi', 'Diskusi', 'Ujian'])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(j == 'Semua' ? 'Semua (${semua.length})' : '$j (${semua.where((x) => teks(x['jenis']) == j).length})'),
                        selected: _saring == j,
                        onSelected: (_) => setState(() => _saring = j),
                      ),
                    ),
                ]),
              ),
              if (!Sesi.instance.hanyaLihat) Builder(builder: (_) {
                final pending = semua.where((x) => x['boleh'] == true && teks(x['status']) == 'Draft' && !(teks(x['jenis']) == 'Ujian' && x['terjadwal'] == true)).toList();
                return Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Wrap(spacing: 8, runSpacing: 4, children: [
                    FilledButton.icon(
                      onPressed: () async {
                        final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
                          builder: (_) => BuatOtomatisScreen(idMapel: widget.idMapel, judul: widget.judul, paket: paket),
                        ));
                        if (ok == true) _muatUlang();
                      },
                      icon: const Icon(Icons.auto_awesome_rounded, size: 18),
                      label: const Text('Upload PDF & Buat Otomatis'),
                    ),
                    if (pending.length > 1)
                      FilledButton.tonalIcon(
                        onPressed: () => _status(pending.map((x) => teks(x['id'])).toList(), 'Aktif'),
                        icon: const Icon(Icons.done_all_rounded, size: 18),
                        label: Text('Post semua yang pending (${pending.length})'),
                      ),
                    if (semua.isNotEmpty)
                      OutlinedButton.icon(
                        onPressed: () async {
                          if (await hapusSerentak(context, widget.idMapel, widget.judul)) _muatUlang();
                        },
                        icon: const Icon(Icons.delete_sweep_rounded, size: 18),
                        label: const Text('Hapus Serentak'),
                      ),
                  ]),
                );
              }),
              if (list.isEmpty) const Kosong(pesan: 'Belum ada konten. Ketuk "Tambah" untuk membuat materi, diskusi, atau ujian.', ikon: Icons.library_add_rounded),
              for (final s in urutSesi) ...[
                JudulBagian(s, aksi: s == kini ? Lencana('Berjalan', warna: Colors.green) : null),
                Card(
                  child: Column(children: [
                    for (final x in grup[s]!)
                      ListTile(
                        onLongPress: x['boleh'] == true && !Sesi.instance.hanyaLihat ? () => setState(() => _pilih.contains(teks(x['id'])) ? _pilih.remove(teks(x['id'])) : _pilih.add(teks(x['id']))) : null,
                        onTap: _pilih.isNotEmpty
                            ? () => setState(() => _pilih.contains(teks(x['id'])) ? _pilih.remove(teks(x['id'])) : _pilih.add(teks(x['id'])))
                            : () => _menuItem(x, sesi),
                        leading: _pilih.contains(teks(x['id']))
                            ? IkonBulat(Icons.check_rounded, warna: cs.primary, ukuran: 42, sudut: 14)
                            : IkonBulat(_ikonJenis(teks(x['jenis'])), warna: _warnaJenis(teks(x['jenis'])), ukuran: 42, sudut: 14),
                        title: Text(teks(x['judul']), maxLines: 2, overflow: TextOverflow.ellipsis),
                        subtitle: Text([
                          teks(x['jenis']),
                          if (teks(x['jenis']) == 'Ujian') '${angka(x['jumlahSoal'])} soal${angka(x['durasi']) > 0 ? ' · ${angka(x['durasi'])} mnt' : ''}',
                          if (teks(x['batas']).isNotEmpty) 'batas ${teks(x['batas'])}',
                        ].join(' · ')),
                        trailing: Lencana(teks(x['status']), warna: _warnaStatus(context, teks(x['status']))),
                      ),
                  ]),
                ),
              ],
              if (semua.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text('Tekan lama untuk memilih beberapa item sekaligus.', textAlign: TextAlign.center, style: TextStyle(color: cs.outline, fontSize: 12)),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// Tambah / ubah materi, diskusi, atau ujian.
class EditorItemScreen extends StatefulWidget {
  const EditorItemScreen({super.key, required this.idMapel, this.item, required this.daftarSesi, this.jenisBaru});
  final String idMapel;
  final Map<String, dynamic>? item;
  final List<String> daftarSesi;
  final String? jenisBaru;

  @override
  State<EditorItemScreen> createState() => _EditorItemScreenState();
}

class _EditorItemScreenState extends State<EditorItemScreen> {
  late final _judul = TextEditingController(text: teks(widget.item?['judul']));
  late final _konten = TextEditingController(text: teks(widget.item?['konten']));
  late final _youtube = TextEditingController(text: teks(widget.item?['youtube']));
  late final _file = TextEditingController(text: teks(widget.item?['file']));
  late final _durasi = TextEditingController(text: angka(widget.item?['durasi']) > 0 ? '${angka(widget.item?['durasi'])}' : '');
  late String _jenis = teks(widget.item?['jenis'], widget.jenisBaru ?? 'Materi');
  late String? _sesi = widget.daftarSesi.contains(teks(widget.item?['sesi'])) ? teks(widget.item?['sesi']) : (widget.daftarSesi.isEmpty ? null : widget.daftarSesi.first);
  bool _sibuk = false;

  bool get _baru => widget.item == null;

  Future<void> _simpan() async {
    if (_judul.text.trim().isEmpty) {
      kabar(context, 'Judul wajib diisi.', galat: true);
      return;
    }
    setState(() => _sibuk = true);
    try {
      await Api.instance('waStafMateriSimpan', [
        _t,
        widget.idMapel,
        {
          if (!_baru) 'id': teks(widget.item?['id']),
          'jenis': _jenis,
          'judul': _judul.text.trim(),
          'konten': _konten.text,
          'youtube': _youtube.text.trim(),
          'file': _file.text.trim(),
          'sesi': _sesi ?? '',
          'durasi': int.tryParse(_durasi.text.trim()) ?? 0,
        }
      ]);
      if (!mounted) return;
      kabar(context, _baru ? 'Tersimpan sebagai Draft.' : 'Perubahan disimpan.');
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) kabar(context, e.ramah, galat: true);
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final labelKonten = switch (_jenis) {
      'Diskusi' => 'Pertanyaan / instruksi diskusi',
      'Ujian' => 'Petunjuk ujian (opsional)',
      _ => 'Isi materi',
    };
    final adaHtml = RegExp(r'<[a-z][^>]*>', caseSensitive: false).hasMatch(_konten.text);
    return Scaffold(
      appBar: AppBar(
        title: Text(_baru ? '$_jenis baru' : 'Ubah ${_jenis.toLowerCase()}'),
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
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          if (_baru)
            SegmentedButton<String>(
              segments: [for (final j in ['Materi', 'Diskusi', 'Ujian']) ButtonSegment(value: j, label: Text(j), icon: Icon(_ikonJenis(j)))],
              selected: {_jenis},
              onSelectionChanged: (s) => setState(() => _jenis = s.first),
            ),
          const SizedBox(height: 14),
          TextField(controller: _judul, maxLength: 200, decoration: const InputDecoration(labelText: 'Judul')),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            initialValue: _sesi,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Sesi'),
            items: [for (final s in widget.daftarSesi) DropdownMenuItem(value: s, child: Text(s))],
            onChanged: (v) => setState(() => _sesi = v),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _konten,
            minLines: 6,
            maxLines: 18,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(labelText: labelKonten, alignLabelWithHint: true),
          ),
          if (adaHtml)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('Isi ini berformat HTML (dari editor web). Tanda <…> adalah format; biarkan bila tidak yakin.', style: TextStyle(fontSize: 12, color: cs.outline)),
            ),
          if (_jenis == 'Materi') ...[
            const SizedBox(height: 12),
            TextField(controller: _youtube, keyboardType: TextInputType.url, decoration: const InputDecoration(labelText: 'Tautan YouTube (opsional)', prefixIcon: Icon(Icons.smart_display_rounded))),
            const SizedBox(height: 12),
            TextField(controller: _file, keyboardType: TextInputType.url, decoration: const InputDecoration(labelText: 'Tautan file / Drive (opsional)', prefixIcon: Icon(Icons.attach_file_rounded))),
          ],
          if (_jenis == 'Ujian') ...[
            const SizedBox(height: 12),
            TextField(controller: _durasi, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Durasi (menit, 0 = tanpa batas)', prefixIcon: Icon(Icons.timer_rounded))),
            const SizedBox(height: 8),
            Text('Soal ujian ditambahkan setelah ujian disimpan.', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
          ],
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: cs.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(14)),
            child: Row(children: [
              Icon(Icons.info_rounded, color: cs.primary, size: 20),
              const SizedBox(width: 10),
              Expanded(child: Text(_baru ? 'Item baru tersimpan sebagai Draft. Terbitkan dari daftar konten bila sudah siap.' : 'Status: ${teks(widget.item?['status'])}', style: const TextStyle(fontSize: 12.5))),
            ]),
          ),
        ],
      ),
    );
  }
}

/// Daftar siswa yang sudah / belum membaca materi.
class PembacaScreen extends StatelessWidget {
  const PembacaScreen({super.key, required this.idMapel, required this.item});
  final String idMapel;
  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(teks(item['judul']), overflow: TextOverflow.ellipsis)),
      body: Muatan<Map<String, dynamic>>(
        muat: () async => peta(await Api.instance('waStafSesiBaca', [_t, idMapel, teks(item['id'])])),
        bangun: (context, d, _) {
          final siswa = daftar(d['siswa']).map(peta).toList()..sort((a, b) => (a['sudah'] == true ? 1 : 0).compareTo(b['sudah'] == true ? 1 : 0));
          final total = angka(d['total']);
          final sudah = angka(d['sudah']);
          return ListView(padding: const EdgeInsets.all(16), children: [
            _KartuProgres(judul: 'Sudah membaca', nilai: sudah, total: total),
            const SizedBox(height: 8),
            Card(
              child: Column(children: [
                for (final s in siswa)
                  ListTile(
                    leading: Icon(s['sudah'] == true ? Icons.check_circle_rounded : Icons.radio_button_unchecked, color: s['sudah'] == true ? Colors.green : Theme.of(context).colorScheme.outline),
                    title: Text(teks(s['nama'])),
                    subtitle: s['sudah'] == true ? Text('terakhir ${teks(s['terakhir'])} · ${angka(s['jumlah'])}× dibuka') : const Text('belum membuka'),
                  ),
              ]),
            ),
          ]);
        },
      ),
    );
  }
}

class _KartuProgres extends StatelessWidget {
  const _KartuProgres({required this.judul, required this.nilai, required this.total});
  final String judul;
  final int nilai;
  final int total;

  @override
  Widget build(BuildContext context) {
    final p = total == 0 ? 0.0 : nilai / total;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(gradient: Gaya.gradasi, borderRadius: BorderRadius.circular(Gaya.radius)),
      child: Row(children: [
        SizedBox(
          width: 56,
          height: 56,
          child: Stack(alignment: Alignment.center, children: [
            CircularProgressIndicator(value: p, strokeWidth: 6, color: Colors.white, backgroundColor: Colors.white24),
            Text('${(p * 100).round()}%', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13)),
          ]),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(judul, style: const TextStyle(color: Colors.white70)),
            Text('$nilai dari $total siswa', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
          ]),
        ),
      ]),
    );
  }
}

/// Tanggapan diskusi + penilaian (manual atau dibantu AI).
class DiskusiScreen extends StatefulWidget {
  const DiskusiScreen({super.key, required this.idMapel, required this.item, required this.bolehNilai});
  final String idMapel;
  final Map<String, dynamic> item;
  final bool bolehNilai;

  @override
  State<DiskusiScreen> createState() => _DiskusiScreenState();
}

class _DiskusiScreenState extends State<DiskusiScreen> {
  Map<String, dynamic>? _d;
  String? _galat;
  final Map<String, TextEditingController> _skor = {};
  final Map<String, TextEditingController> _kom = {};
  final Map<String, Map<String, dynamic>> _ai = {};
  Map<String, dynamic> _catatan = {};
  bool _setuju = false;
  bool _aiJalan = false;
  String _aiPesan = '';

  String get _idMateri => teks(widget.item['id']);

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    setState(() => _galat = null);
    try {
      final d = peta(await Api.instance('waStafSesiDiskusi', [_t, widget.idMapel, _idMateri]));
      for (final j in daftar(d['jawaban']).map(peta)) {
        final s = teks(j['siswa']);
        _skor[s] ??= TextEditingController(text: teks(j['nilai']));
        _kom[s] ??= TextEditingController(text: teks(j['komentar']));
      }
      if (mounted) setState(() => _d = d);
      // Keterangan internal penilaian otomatis (hanya KS, Admin, pengampu; tidak pernah dikirim ke siswa).
      try {
        final c = peta(peta(await Api.instance('waStafCatatanNilai', [_t, widget.idMapel, _idMateri]))['catatan']);
        if (mounted) setState(() => _catatan = {for (final e in c.entries) _kunciNama(e.key): e.value});
      } catch (_) {}
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Future<void> _nilaiAi() async {
    setState(() {
      _aiJalan = true;
      _aiPesan = 'AI sedang membaca tanggapan...';
    });
    var mulai = 0;
    try {
      while (mulai >= 0 && mounted) {
        final r = peta(await Api.instance('waStafDiskusiNilaiAi', [_t, widget.idMapel, _idMateri, mulai], const Duration(seconds: 300)));
        for (final h in daftar(r['hasil']).map(peta)) {
          final s = teks(h['siswa']);
          _ai[s] = h;
          if (h['skor'] != null && (_skor[s]?.text.trim().isEmpty ?? false)) _skor[s]!.text = teks(h['skor']);
        }
        mulai = angka(r['berikut'], -1);
        if (mounted) setState(() => _aiPesan = mulai < 0 ? 'Selesai. Periksa saran AI, lalu simpan.' : 'Dinilai $mulai dari ${angka(r['total'])}...');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _aiPesan = e.ramah);
    } finally {
      if (mounted) setState(() => _aiJalan = false);
    }
  }

  Future<void> _simpan() async {
    final daftarNilai = <Map<String, dynamic>>[];
    _skor.forEach((s, c) {
      if (c.text.trim().isEmpty) return;
      daftarNilai.add({
        'siswa': s,
        'skor': num.tryParse(c.text.trim().replaceAll(',', '.')),
        'komentar': _kom[s]?.text ?? '',
        'skorAi': _ai[s]?['skor'],
        'alasanAi': teks(_ai[s]?['alasan']),
      });
    });
    if (daftarNilai.isEmpty) {
      kabar(context, 'Belum ada nilai yang diisi.', galat: true);
      return;
    }
    final r = await jalankan(context, () => Api.instance('waStafDiskusiSimpanNilai', [_t, widget.idMapel, _idMateri, daftarNilai, _setuju]), teksProses: 'Menyimpan nilai...');
    if (r.ok && mounted) {
      kabar(context, '${angka(peta(r.data)['tersimpan'])} nilai tersimpan.');
      _muat();
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final d = _d;
    return Scaffold(
      appBar: AppBar(title: Text(teks(widget.item['judul']), overflow: TextOverflow.ellipsis)),
      bottomNavigationBar: !widget.bolehNilai || d == null || daftar(d['jawaban']).isEmpty
          ? null
          : SafeArea(
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
                decoration: BoxDecoration(color: cs.surfaceContainerLowest, boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, -4))]),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    value: _setuju,
                    onChanged: (v) => setState(() => _setuju = v == true),
                    title: const Text('Saya sudah memeriksa dan menyetujui nilai ini.', style: TextStyle(fontSize: 13)),
                  ),
                  Row(children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _aiJalan ? null : _nilaiAi,
                        icon: _aiJalan ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome_rounded),
                        label: const Text('Saran AI'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(child: FilledButton.icon(onPressed: _setuju ? _simpan : null, icon: const Icon(Icons.save_rounded), label: const Text('Simpan'))),
                  ]),
                ]),
              ),
            ),
      body: _galat != null
          ? PesanGalat(pesan: _galat!, ulangi: _muat)
          : d == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _muat,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              IkonBulat(Icons.forum_rounded, warna: _warnaJenis('Diskusi'), ukuran: 34, sudut: 10),
                              const SizedBox(width: 10),
                              const Text('Pertanyaan', style: TextStyle(fontWeight: FontWeight.w800)),
                            ]),
                            const SizedBox(height: 8),
                            Text(htmlKeTeks(teks(d['pertanyaan']))),
                          ]),
                        ),
                      ),
                      const SizedBox(height: 8),
                      _KartuProgres(judul: 'Sudah menanggapi', nilai: daftar(d['jawaban']).length, total: angka(d['total'])),
                      if (_aiPesan.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 10),
                          child: Row(children: [
                            Icon(Icons.auto_awesome_rounded, size: 16, color: cs.primary),
                            const SizedBox(width: 6),
                            Expanded(child: Text(_aiPesan, style: TextStyle(color: cs.primary, fontSize: 12.5))),
                          ]),
                        ),
                      JudulBagian('Tanggapan', sub: '${daftar(d['jawaban']).length} siswa'),
                      if (daftar(d['jawaban']).isEmpty) const Kosong(pesan: 'Belum ada tanggapan.', ikon: Icons.forum_outlined),
                      for (final j in daftar(d['jawaban']).map(peta))
                        _KartuJawaban(
                          j: j,
                          skor: _skor[teks(j['siswa'])]!,
                          komentar: _kom[teks(j['siswa'])]!,
                          ai: _ai[teks(j['siswa'])],
                          bolehNilai: widget.bolehNilai,
                          catatan: _catatan[_kunciNama(teks(j['siswa']))] == null ? null : peta(_catatan[_kunciNama(teks(j['siswa']))]),
                        ),
                      if (daftar(d['belum']).isNotEmpty) ...[
                        JudulBagian('Belum menanggapi', sub: '${daftar(d['belum']).length} siswa'),
                        Wrap(spacing: 6, runSpacing: 6, children: [for (final b in daftar(d['belum'])) Lencana('$b', warna: cs.outline)]),
                      ],
                    ],
                  ),
                ),
    );
  }
}

String _kunciNama(String s) => s.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');

class _KartuJawaban extends StatelessWidget {
  const _KartuJawaban({required this.j, required this.skor, required this.komentar, required this.ai, required this.bolehNilai, this.catatan});
  final Map<String, dynamic>? catatan;
  final Map<String, dynamic> j;
  final TextEditingController skor;
  final TextEditingController komentar;
  final Map<String, dynamic>? ai;
  final bool bolehNilai;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final nama = teks(j['siswa']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(
              radius: 17,
              backgroundColor: Gaya.warnaMenu(nama).withValues(alpha: 0.15),
              child: Text(nama.isEmpty ? '?' : nama[0].toUpperCase(), style: TextStyle(color: Gaya.warnaMenu(nama), fontWeight: FontWeight.w800)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(nama, style: const TextStyle(fontWeight: FontWeight.w700)),
                Text('${teks(j['waktu'])} · ${angka(j['kata'])} kata${angka(j['tautan']) > 0 ? ' · ${angka(j['tautan'])} tautan' : ''}', style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
              ]),
            ),
            if (teks(j['nilai']).isNotEmpty) Lencana('Nilai ${teks(j['nilai'])}', warna: Colors.green),
          ]),
          const SizedBox(height: 10),
          Text(htmlKeTeks(teks(j['jawaban']))),
          if (catatan != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: const Color(0x1FE9A23B), borderRadius: BorderRadius.circular(12)),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Icon(Icons.lock_clock_rounded, size: 16, color: Color(0xFFB7791F)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Catatan internal (tidak terlihat siswa): ${teks(catatan!['keterangan'])} · ${teks(catatan!['waktu'])}',
                      style: const TextStyle(fontSize: 12.5)),
                ),
              ]),
            ),
          ],
          if (ai != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: cs.primary.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(12)),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.auto_awesome_rounded, size: 16, color: cs.primary),
                const SizedBox(width: 8),
                Expanded(child: Text('AI: ${ai!['skor'] ?? '-'} — ${teks(ai!['alasan'])}', style: const TextStyle(fontSize: 12.5))),
              ]),
            ),
          ],
          if (bolehNilai) ...[
            const SizedBox(height: 10),
            Row(children: [
              SizedBox(
                width: 92,
                child: TextField(
                  controller: skor,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Skor', hintText: '0–100', isDense: true),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(child: TextField(controller: komentar, decoration: const InputDecoration(labelText: 'Komentar (opsional)', isDense: true))),
            ]),
          ] else if (teks(j['komentar']).isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Komentar: ${teks(j['komentar'])}', style: TextStyle(fontStyle: FontStyle.italic, color: cs.onSurfaceVariant)),
          ],
        ]),
      ),
    );
  }
}

// ───────────────────────────── ABSENSI ─────────────────────────────

class _TabAbsensi extends StatelessWidget {
  const _TabAbsensi({required this.idMapel});
  final String idMapel;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      muat: () async => peta(await Api.instance('waStafAbsensi', [_t, idMapel])),
      bangun: (context, d, _) {
        final kini = d['kini'] == null ? null : peta(d['kini']);
        final siswa = daftar(d['siswa']).map(peta).toList()..sort((a, b) => (a['persen'] as num? ?? 999).compareTo(b['persen'] as num? ?? 999));
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
          if (kini != null)
            _KartuProgres(judul: '${teks(kini['nama'])} · hadir', nilai: angka(kini['hadir']), total: angka(kini['dari']))
          else
            Card(child: ListTile(leading: const IkonBulat(Icons.event_busy_rounded), title: const Text('Tidak ada sesi berjalan'), subtitle: Text('${angka(d['sesiBerakhir'])} sesi sudah berakhir'))),
          JudulBagian('Kehadiran siswa', sub: 'dari ${angka(d['sesiBerakhir'])} sesi yang sudah berakhir'),
          if (siswa.isEmpty) const Kosong(pesan: 'Belum ada siswa.'),
          Card(
            child: Column(children: [
              for (final s in siswa)
                ListTile(
                  leading: Icon(
                    kini == null ? Icons.person_rounded : (s['sudahKini'] == true ? Icons.check_circle_rounded : Icons.schedule_rounded),
                    color: kini == null ? cs.outline : (s['sudahKini'] == true ? Colors.green : const Color(0xFFE9A23B)),
                  ),
                  title: Text(teks(s['nama'])),
                  subtitle: Text('${angka(s['jumlah'])} dari ${angka(s['dari'])} sesi'),
                  trailing: s['persen'] == null
                      ? null
                      : Lencana('${s['persen']}%', warna: (s['persen'] as num) >= 75 ? Colors.green : ((s['persen'] as num) >= 50 ? const Color(0xFFE9A23B) : cs.error)),
                ),
            ]),
          ),
        ]);
      },
    );
  }
}

// ───────────────────────────── NILAI ─────────────────────────────

class _TabNilai extends StatefulWidget {
  const _TabNilai({required this.idMapel});
  final String idMapel;

  @override
  State<_TabNilai> createState() => _TabNilaiState();
}

class _TabNilaiState extends State<_TabNilai> {
  String _cari = '';

  @override
  Widget build(BuildContext context) {
    return Muatan<List<dynamic>>(
      muat: () async => daftar(await Api.instance('waStafNilai', [_t, widget.idMapel])),
      bangun: (context, data, _) {
        final q = _cari.toLowerCase();
        final list = data.map(peta).where((x) => q.isEmpty || '${teks(x['siswa'])} ${teks(x['judul'])}'.toLowerCase().contains(q)).toList();
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
          TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Cari siswa atau judul'), onChanged: (v) => setState(() => _cari = v)),
          const SizedBox(height: 8),
          if (list.isEmpty) const Kosong(pesan: 'Belum ada nilai.', ikon: Icons.grading_rounded),
          for (final x in list)
            Card(
              child: ListTile(
                leading: IkonBulat(_ikonJenis(teks(x['jenis'])), warna: _warnaJenis(teks(x['jenis'])), ukuran: 40, sudut: 12),
                title: Text(teks(x['siswa'])),
                subtitle: Text('${teks(x['judul'])}\n${teks(x['waktu'])}'),
                isThreeLine: true,
                trailing: Text(teks(x['nilai'], '–'), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: Theme.of(context).colorScheme.primary)),
              ),
            ),
        ]);
      },
    );
  }
}

// ───────────────────────────── SISWA ─────────────────────────────

class _TabSiswa extends StatefulWidget {
  const _TabSiswa({required this.idMapel});
  final String idMapel;

  @override
  State<_TabSiswa> createState() => _TabSiswaState();
}

class _TabSiswaState extends State<_TabSiswa> {
  int _versi = 0;

  Future<void> _generate(Map<String, dynamic> opsi, String teksProses) async {
    final r = await jalankan(context, () => Api.instance('waStafKodeAksesGenerate', [_t, widget.idMapel, opsi]), teksProses: teksProses);
    if (r.ok && mounted) {
      kabar(context, '${angka(peta(r.data)['diubah'])} kode akses baru dibuat.');
      setState(() => _versi++);
    }
  }

  Future<void> _bukaKunci(Map<String, dynamic> x) async {
    final ok = await konfirmasi(context, 'Buka kunci ujian?', '${teks(x['nama'])} bisa mengerjakan "${teks(x['judul'])}" lagi dari awal.', ya: 'Buka kunci');
    if (!ok || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafBukaKunci', [_t, widget.idMapel, teks(x['idUjian']), teks(x['nama'])]), teksProses: 'Membuka kunci...');
    if (r.ok && mounted) setState(() => _versi++);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<List<dynamic>>(
      key: ValueKey(_versi),
      muat: () => Future.wait([
        Api.instance('waStafKodeAksesDaftar', [_t, widget.idMapel]),
        Api.instance('waStafUjianTerkunci', [_t, widget.idMapel]),
      ]),
      bangun: (context, d, _) {
        final siswa = daftar(peta(d[0])['siswa']).map(peta).toList();
        final kunci = daftar(d[1]).map(peta).toList();
        final tanpaKode = siswa.where((s) => teks(s['kode']).isEmpty).length;
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
          Card(
            child: ListTile(
              leading: const IkonBulat(Icons.event_repeat_rounded, warna: Color(0xFF2F9E8F)),
              title: const Text('Buka sesi untuk siswa'),
              subtitle: const Text('Izinkan siswa mengerjakan tugas sesi yang sudah lewat'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => BukaSesiScreen(idMapel: widget.idMapel))),
            ),
          ),
          if (kunci.isNotEmpty) ...[
            JudulBagian('Ujian terkunci', sub: '${kunci.length} siswa'),
            Card(
              child: Column(children: [
                for (final x in kunci)
                  ListTile(
                    leading: Icon(Icons.lock_rounded, color: cs.error),
                    title: Text(teks(x['nama'])),
                    subtitle: Text('${teks(x['judul'])} · percobaan ${teks(x['percobaan'])}'),
                    trailing: TextButton(onPressed: () => _bukaKunci(x), child: const Text('Buka')),
                  ),
              ]),
            ),
          ],
          JudulBagian('Kode akses ujian', sub: '${siswa.length} siswa${tanpaKode > 0 ? ' · $tanpaKode belum punya kode' : ''}',
              aksi: PopupMenuButton<String>(
                icon: const Icon(Icons.more_horiz_rounded),
                onSelected: (v) async {
                  if (v == 'kosong') {
                    _generate({'hanyaKosong': true}, 'Membuat kode...');
                  } else if (await konfirmasi(context, 'Buat ulang semua kode?', 'Kode lama seluruh kelas tidak berlaku lagi.', ya: 'Buat ulang')) {
                    _generate({'semua': true}, 'Membuat kode...');
                  }
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'kosong', child: Text('Buat kode untuk yang belum punya')),
                  PopupMenuItem(value: 'semua', child: Text('Buat ulang kode seluruh kelas')),
                ],
              )),
          if (siswa.isEmpty) const Kosong(pesan: 'Belum ada siswa di kelas ini.'),
          Card(
            child: Column(children: [
              for (final s in siswa)
                ListTile(
                  title: Text(teks(s['nama'])),
                  subtitle: teks(s['kode']).isEmpty
                      ? Text('belum ada kode', style: TextStyle(color: cs.error))
                      : Text(teks(s['kode']), style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700, letterSpacing: 2)),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    if (teks(s['kode']).isNotEmpty)
                      IconButton(
                        tooltip: 'Salin',
                        icon: const Icon(Icons.copy_rounded, size: 20),
                        onPressed: () async {
                          await Clipboard.setData(ClipboardData(text: teks(s['kode'])));
                          if (context.mounted) kabar(context, 'Kode ${teks(s['nama'])} disalin.');
                        },
                      ),
                    IconButton(
                      tooltip: 'Buat kode baru',
                      icon: const Icon(Icons.refresh_rounded, size: 20),
                      onPressed: () => _generate({'nama': teks(s['nama'])}, 'Membuat kode...'),
                    ),
                  ]),
                ),
            ]),
          ),
        ]);
      },
    );
  }
}

/// Buka sesi yang sudah lewat untuk siswa tertentu (dengan alasan tercatat).
class BukaSesiScreen extends StatefulWidget {
  const BukaSesiScreen({super.key, required this.idMapel});
  final String idMapel;

  @override
  State<BukaSesiScreen> createState() => _BukaSesiScreenState();
}

class _BukaSesiScreenState extends State<BukaSesiScreen> {
  int _versi = 0;
  String? _siswa;
  String? _sesi;
  final _alasan = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Buka sesi siswa')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_versi),
        muat: () async => peta(await Api.instance('waStafBukaSesiDaftar', [_t, widget.idMapel])),
        bangun: (context, d, _) {
          final siswa = daftar(d['siswa']).map((x) => '$x').toList();
          final sesi = daftar(d['sesi']).map((s) => teks(peta(s)['nama'])).toList();
          final riwayat = daftar(d['riwayat']).map(peta).toList();
          final minAlasan = angka(d['minAlasan'], 10);
          return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text('Siswa dapat mengerjakan tugas sesi yang dipilih selama ${angka(d['masaBukaHari'])} hari.', style: TextStyle(color: cs.onSurfaceVariant)),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _siswa,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Siswa'),
                    items: [for (final s in siswa) DropdownMenuItem(value: s, child: Text(s))],
                    onChanged: (v) => setState(() => _siswa = v),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: _sesi,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Sesi yang dibuka'),
                    items: [for (final s in sesi) DropdownMenuItem(value: s, child: Text(s))],
                    onChanged: (v) => setState(() => _sesi = v),
                  ),
                  if (sesi.isEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Belum ada sesi lewat yang memiliki tugas.', style: TextStyle(color: cs.outline, fontSize: 12))),
                  const SizedBox(height: 10),
                  TextField(controller: _alasan, maxLines: 2, decoration: InputDecoration(labelText: 'Alasan (min. $minAlasan karakter)', hintText: 'mis. sakit, kendala jaringan')),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: () async {
                      if (_siswa == null || _sesi == null) {
                        kabar(context, 'Pilih siswa dan sesi.', galat: true);
                        return;
                      }
                      final r = await jalankan(context, () => Api.instance('waStafBukaSesi', [_t, widget.idMapel, _siswa, _sesi, _alasan.text]), teksProses: 'Membuka sesi...');
                      if (r.ok && context.mounted) {
                        kabar(context, 'Sesi dibuka sampai ${teks(peta(r.data)['berlaku'])}.');
                        _alasan.clear();
                        setState(() => _versi++);
                      }
                    },
                    icon: const Icon(Icons.lock_open_rounded),
                    label: const Text('Buka sesi'),
                  ),
                ]),
              ),
            ),
            JudulBagian('Riwayat', sub: '${riwayat.length} catatan'),
            if (riwayat.isEmpty) const Kosong(pesan: 'Belum ada sesi yang dibuka.', ikon: Icons.history_rounded),
            Card(
              child: Column(children: [
                for (final b in riwayat)
                  ListTile(
                    title: Text('${teks(b['nama'])} · ${teks(b['sesi'])}'),
                    subtitle: Text('${teks(b['alasan'])}\noleh ${teks(b['oleh'])} · berlaku s.d. ${teks(b['berlaku'])}'),
                    isThreeLine: true,
                    trailing: teks(b['status']) == 'Aktif'
                        ? TextButton(
                            onPressed: () async {
                              final r = await jalankan(context, () => Api.instance('waStafBukaSesiCabut', [_t, widget.idMapel, teks(b['id'])]), teksProses: 'Mencabut...');
                              if (r.ok && context.mounted) setState(() => _versi++);
                            },
                            child: const Text('Cabut'),
                          )
                        : Lencana(teks(b['status']), warna: cs.outline),
                  ),
              ]),
            ),
          ]);
        },
      ),
    );
  }
}

/// Membuka tautan (YouTube/file) di aplikasi luar.
Future<void> bukaTautan(String url) async {
  if (url.isEmpty) return;
  await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
}
