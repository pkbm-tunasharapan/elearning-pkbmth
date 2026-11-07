import 'package:flutter/material.dart';

import '../absensi/umum.dart' show tglIso, tglIndo;
import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

const _tabel = [
  ('wb', 'Warga Belajar', Icons.school_rounded),
  ('tutor', 'Tutor', Icons.badge_rounded),
  ('rombel', 'Rombel', Icons.groups_2_rounded),
  ('mapel', 'Mata Pelajaran', Icons.menu_book_rounded),
  ('enroll', 'Enroll Mapel (rombel · mapel · tutor)', Icons.link_rounded),
  ('pengaturan', 'Pengaturan Lembaga', Icons.apartment_rounded),
];

/// Menu "Data Induk": daftar tabel master SIM SETARA yang dikelola dari aplikasi.
class DataIndukScreen extends StatelessWidget {
  const DataIndukScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      const Text('Kelola data master langsung dari aplikasi. Data yang dihapus hanya dinonaktifkan, tidak hilang.', style: TextStyle(fontSize: 12.5)),
      const SizedBox(height: 8),
      for (final t in _tabel.where((t) => !(Sesi.instance.isDinas && t.$1 == 'pengaturan')))
        Card(
          child: ListTile(
            leading: CircleAvatar(backgroundColor: Gaya.ungu.withValues(alpha: 0.12), child: Icon(t.$3, color: Gaya.ungu)),
            title: Text(t.$2, style: const TextStyle(fontWeight: FontWeight.w700)),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TabelIndukScreen(tabel: t.$1, judul: t.$2))),
          ),
        ),
    ]);
  }
}

class TabelIndukScreen extends StatefulWidget {
  const TabelIndukScreen({super.key, required this.tabel, required this.judul});
  final String tabel;
  final String judul;

  @override
  State<TabelIndukScreen> createState() => _TabelIndukScreenState();
}

class _TabelIndukScreenState extends State<TabelIndukScreen> {
  int _v = 0;
  String _cari = '';
  bool _nonaktif = false;
  String? _urut;
  bool _naik = true;
  final _filter = <String, String>{};
  final _pilih = <String>{};

  String _namaRef(Map<String, dynamic> d, String ref, String id) {
    for (final x in daftar(peta(d['ref'])[ref]).map(peta)) {
      if (teks(x['id']) == id) return teks(x['nama']);
    }
    return id;
  }

  String _tampil(Map<String, dynamic> d, Map<String, dynamic> k, dynamic v) {
    final j = teks(k['jenis']);
    if (j == 'bool') return v == true ? 'Ya' : 'Tidak';
    if (j == 'ref') return teks(v).isEmpty ? '' : _namaRef(d, teks(k['ref']), teks(v));
    if (j == 'tanggal') return teks(v).isEmpty ? '' : tglIndo(teks(v));
    return teks(v);
  }

  bool _aktif(Map<String, dynamic> b) {
    if (b.containsKey('AKTIF')) return b['AKTIF'] == true;
    if (b.containsKey('STATUS') && widget.tabel == 'wb') return teks(b['STATUS'], 'Aktif') == 'Aktif';
    return true;
  }

  Future<void> _form(Map<String, dynamic> d, [Map<String, dynamic>? b]) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => FormInduk(data: d, baris: b)));
    if (ok == true && mounted) setState(() => _v++);
  }

  /// Nilai mentah untuk filter (id ref, pilihan, Ya/Tidak).
  String _kunciFilter(Map<String, dynamic> k, dynamic v) => teks(k['jenis']) == 'bool' ? (v == true ? 'Ya' : 'Tidak') : teks(v);

  // ───── ekspor ─────
  void _ekspor(Map<String, dynamic> d, List<Map<String, dynamic>> kolom, List<Map<String, dynamic>> baris) {
    pilihEkspor(
      context,
      judul: 'Data ${widget.judul}',
      sub: 'Dicetak ${tanggalIni()}',
      kepala: [for (final k in kolom) teks(k['label'], teks(k['nama']))],
      baris: [for (final r in baris) [for (final k in kolom) _tampil(d, k, r[teks(k['nama'])])]],
    );
  }

  // ───── aksi massal ─────
  Map<String, dynamic> _barisLengkap(List<Map<String, dynamic>> kolom, Map<String, dynamic> b) => {
        '_id': teks(b['_id']),
        for (final k in kolom)
          if (k['ro'] != true) teks(k['nama']): teks(k['jenis']) == 'bool' ? b[teks(k['nama'])] == true : teks(b[teks(k['nama'])]),
      };

  Future<void> _hasilMassal(Hasil<dynamic> r, String aksi) async {
    if (!r.ok || !mounted) return;
    final h = peta(r.data);
    final gagal = daftar(h['gagal']).map(peta).toList();
    kabar(context, '$aksi: ${angka(h['ok'])} berhasil${gagal.isEmpty ? '' : ', ${gagal.length} gagal (${teks(gagal.first['pesan'])})'}.', galat: gagal.isNotEmpty);
    setState(() {
      _pilih.clear();
      _v++;
    });
  }

  Future<void> _ubahMassal(Map<String, dynamic> d, List<Map<String, dynamic>> kolom, List<Map<String, dynamic>> dipilih) async {
    final bisa = kolom.where((k) => k['ro'] != true && teks(k['nama']) != teks(d['kunci'])).toList();
    final hasil = await showDialog<(String, dynamic)>(context: context, builder: (_) => _DialogUbahMassal(data: d, kolom: bisa, jumlah: dipilih.length));
    if (hasil == null || !mounted) return;
    final kirim = [for (final b in dipilih) {..._barisLengkap(kolom, b), hasil.$1: hasil.$2}];
    final r = await jalankan(context, () => Api.instance('waStafIndukSimpanBanyak', [_t, widget.tabel, kirim], const Duration(minutes: 5)),
        teksProses: 'Menyimpan ${kirim.length} baris...');
    await _hasilMassal(r, 'Ubah massal');
  }

  Future<void> _nonaktifMassal(List<Map<String, dynamic>> dipilih) async {
    if (!await konfirmasi(context, 'Nonaktifkan ${dipilih.length} data?', 'Data tidak dihapus, hanya dinonaktifkan dan bisa diaktifkan lagi.', ya: 'Nonaktifkan')) return;
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafIndukNonaktifBanyak', [_t, widget.tabel, [for (final b in dipilih) teks(b['_id'])]], const Duration(minutes: 5)),
        teksProses: 'Menonaktifkan ${dipilih.length} data...');
    await _hasilMassal(r, 'Nonaktifkan');
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(widget.judul), actions: [
        IconButton(tooltip: 'Muat ulang', onPressed: () => setState(() => _v++), icon: const Icon(Icons.refresh_rounded)),
      ]),
      body: Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waStafIndukDaftar', [_t, widget.tabel], const Duration(minutes: 2))),
      bangun: (context, d, segarkan) {
        final kolom = daftar(d['kolom']).map(peta).toList();
        final kk = {for (final k in kolom) teks(k['nama']): k};
        final semua = daftar(d['baris']).map(peta).toList();
        if (d['tunggal'] == true) {
          return FormInduk(data: d, baris: semua.isEmpty ? null : semua.first, tertanam: true);
        }
        final label = teks(d['label']);
        final sub = daftar(d['sub']).map((e) => teks(e)).where(kk.containsKey).toList();
        final tampilKolom = [if (kk.containsKey(label)) label, ...sub.where((x) => x != label)];
        final saring = kolom.where((k) => {'pilihan', 'ref', 'bool'}.contains(teks(k['jenis'])) && k['ro'] != true).take(4).toList();
        final urut = _urut ?? label;
        final baris = semua.where((b) {
          if (!_nonaktif && !_aktif(b)) return false;
          for (final f in _filter.entries) {
            final k = kk[f.key];
            if (k != null && _kunciFilter(k, b[f.key]) != f.value) return false;
          }
          if (_cari.isEmpty) return true;
          return b.values.any((v) => '$v'.toLowerCase().contains(_cari)) || tampilKolom.any((s) => _tampil(d, kk[s]!, b[s]).toLowerCase().contains(_cari));
        }).toList()
          ..sort((a, b) {
            final k = kk[urut] ?? {};
            final c = _tampil(d, k, a[urut]).toLowerCase().compareTo(_tampil(d, k, b[urut]).toLowerCase());
            return _naik ? c : -c;
          });
        final idTampil = {for (final b in baris) teks(b['_id'])};
        _pilih.removeWhere((id) => !idTampil.contains(id));
        final dipilih = baris.where((b) => _pilih.contains(teks(b['_id']))).toList();
        final tulis = d['tulis'] == true && !Sesi.instance.isDinas;
        final lebar = MediaQuery.of(context).size.width >= 800;
        final semuaDipilih = baris.isNotEmpty && dipilih.length == baris.length;

        void pilihSemua(bool? v) => setState(() {
              if (v == true) {
                _pilih.addAll(idTampil);
              } else {
                _pilih.clear();
              }
            });
        void toggle(Map<String, dynamic> b) => setState(() {
              final id = teks(b['_id']);
              if (!_pilih.remove(id)) _pilih.add(id);
            });

        final alat = Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
              SizedBox(
                width: lebar ? 320 : double.infinity,
                child: TextField(
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari di semua kolom', isDense: true),
                  onChanged: (v) => setState(() => _cari = v.trim().toLowerCase()),
                ),
              ),
              for (final k in saring)
                _FilterKolom(
                  label: teks(k['label'], teks(k['nama'])),
                  nilai: _filter[teks(k['nama'])],
                  pilihan: switch (teks(k['jenis'])) {
                    'bool' => const [('Ya', 'Ya'), ('Tidak', 'Tidak')],
                    'ref' => [for (final x in daftar(peta(d['ref'])[teks(k['ref'])]).map(peta)) (teks(x['id']), teks(x['nama']))],
                    _ => [for (final x in daftar(k['pilihan']).map((e) => teks(e)).where((e) => e.isNotEmpty)) (x, x)],
                  },
                  onPilih: (v) => setState(() => v == null ? _filter.remove(teks(k['nama'])) : _filter[teks(k['nama'])] = v),
                ),
              FilterChip(label: const Text('Termasuk nonaktif'), selected: _nonaktif, onSelected: (v) => setState(() => _nonaktif = v)),
            ]),
            const SizedBox(height: 6),
            Row(children: [
              Expanded(child: Text('${baris.length} data${_filter.isNotEmpty || _cari.isNotEmpty ? ' (tersaring)' : ''}', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant))),
              TextButton.icon(onPressed: baris.isEmpty ? null : () => _ekspor(d, kolom, baris), icon: const Icon(Icons.grid_on_rounded, size: 18), label: const Text('Ekspor')),
            ]),
          ]),
        );

        final aksiPilih = dipilih.isEmpty
            ? null
            : Material(
                color: cs.primaryContainer,
                child: SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
                    child: Row(children: [
                      IconButton(tooltip: 'Batal pilih', onPressed: () => setState(_pilih.clear), icon: const Icon(Icons.close_rounded)),
                      Expanded(child: Text('${dipilih.length} dipilih', style: const TextStyle(fontWeight: FontWeight.w800))),
                      TextButton.icon(onPressed: () => _ekspor(d, kolom, dipilih), icon: const Icon(Icons.download_rounded, size: 18), label: const Text('Ekspor')),
                      if (tulis) TextButton.icon(onPressed: () => _ubahMassal(d, kolom, dipilih), icon: const Icon(Icons.edit_note_rounded, size: 18), label: const Text('Ubah')),
                      if (tulis && d['bisaHapus'] == true)
                        TextButton.icon(
                          onPressed: () => _nonaktifMassal(dipilih),
                          icon: Icon(Icons.block_rounded, size: 18, color: cs.error),
                          label: Text('Nonaktifkan', style: TextStyle(color: cs.error)),
                        ),
                    ]),
                  ),
                ),
              );

        Widget isi;
        if (baris.isEmpty) {
          isi = const Kosong(pesan: 'Tidak ada data.');
        } else if (lebar) {
          isi = Card(
            margin: const EdgeInsets.fromLTRB(12, 4, 12, 90),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                showCheckboxColumn: true,
                sortColumnIndex: tampilKolom.contains(urut) ? tampilKolom.indexOf(urut) : null,
                sortAscending: _naik,
                headingRowHeight: 44,
                dataRowMinHeight: 40,
                dataRowMaxHeight: 52,
                onSelectAll: pilihSemua,
                columns: [
                  for (final n in tampilKolom)
                    DataColumn(
                      label: Text(teks(kk[n]!['label'], n), style: const TextStyle(fontWeight: FontWeight.w800)),
                      onSort: (_, naik) => setState(() {
                        _urut = n;
                        _naik = naik;
                      }),
                    ),
                  const DataColumn(label: Text('')),
                ],
                rows: [
                  for (final b in baris)
                    DataRow(
                      selected: _pilih.contains(teks(b['_id'])),
                      onSelectChanged: (_) => toggle(b),
                      cells: [
                        for (final n in tampilKolom)
                          DataCell(ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 260),
                            child: Text(_tampil(d, kk[n]!, b[n]),
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontWeight: n == label ? FontWeight.w700 : null, color: _aktif(b) ? null : cs.outline)),
                          )),
                        DataCell(
                          IconButton(tooltip: 'Buka / ubah', icon: const Icon(Icons.open_in_new_rounded, size: 18), onPressed: () => _form(d, b)),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          );
        } else {
          isi = Card(
            margin: const EdgeInsets.fromLTRB(12, 4, 12, 90),
            child: Column(children: [
              CheckboxListTile(
                dense: true,
                value: semuaDipilih ? true : (dipilih.isEmpty ? false : null),
                tristate: true,
                onChanged: (_) => pilihSemua(!semuaDipilih),
                title: const Text('Pilih semua', style: TextStyle(fontWeight: FontWeight.w700)),
                controlAffinity: ListTileControlAffinity.leading,
              ),
              const Divider(height: 1),
              for (final b in baris)
                ListTile(
                  dense: true,
                  selected: _pilih.contains(teks(b['_id'])),
                  leading: Checkbox(value: _pilih.contains(teks(b['_id'])), onChanged: (_) => toggle(b)),
                  title: Text(_tampil(d, kk[label] ?? {}, b[label]), style: TextStyle(fontWeight: FontWeight.w600, color: _aktif(b) ? null : cs.outline)),
                  subtitle: Text([for (final s in sub) if (_tampil(d, kk[s]!, b[s]).isNotEmpty) _tampil(d, kk[s]!, b[s])].join(' · ')),
                  trailing: _aktif(b) ? const Icon(Icons.chevron_right_rounded) : const Text('nonaktif', style: TextStyle(fontSize: 11)),
                  onTap: () => dipilih.isEmpty ? _form(d, b) : toggle(b),
                  onLongPress: () => toggle(b),
                ),
            ]),
          );
        }

        return Column(children: [
          Expanded(
            child: Stack(children: [
              RefreshIndicator(onRefresh: segarkan, child: ListView(padding: EdgeInsets.zero, children: [alat, isi])),
              if (tulis && dipilih.isEmpty)
                Positioned(
                  right: 16,
                  bottom: 16,
                  child: FloatingActionButton.extended(heroTag: 'induk${widget.tabel}', onPressed: () => _form(d), icon: const Icon(Icons.add_rounded), label: const Text('Tambah')),
                ),
            ]),
          ),
          if (aksiPilih != null) aksiPilih,
        ]);
      },
    ),
    );
  }
}

/// Tombol filter satu kolom (rombel, status, dll.).
class _FilterKolom extends StatelessWidget {
  const _FilterKolom({required this.label, required this.nilai, required this.pilihan, required this.onPilih});
  final String label;
  final String? nilai;
  final List<(String, String)> pilihan;
  final void Function(String? v) onPilih;

  @override
  Widget build(BuildContext context) {
    final terpilih = pilihan.where((p) => p.$1 == nilai).firstOrNull;
    return PopupMenuButton<String>(
      tooltip: 'Saring $label',
      onSelected: (v) => onPilih(v == '\u0000' ? null : v),
      itemBuilder: (_) => [
        PopupMenuItem(value: '\u0000', child: Text('Semua $label')),
        for (final p in pilihan) PopupMenuItem(value: p.$1, child: Text(p.$2.isEmpty ? '—' : p.$2)),
      ],
      child: Chip(
        avatar: Icon(nilai == null ? Icons.filter_list_rounded : Icons.filter_alt_rounded, size: 18),
        label: Text(terpilih == null ? label : '$label: ${terpilih.$2}'),
        backgroundColor: nilai == null ? null : Theme.of(context).colorScheme.primaryContainer,
      ),
    );
  }
}

/// Dialog ubah massal: pilih kolom lalu nilai barunya.
class _DialogUbahMassal extends StatefulWidget {
  const _DialogUbahMassal({required this.data, required this.kolom, required this.jumlah});
  final Map<String, dynamic> data;
  final List<Map<String, dynamic>> kolom;
  final int jumlah;

  @override
  State<_DialogUbahMassal> createState() => _DialogUbahMassalState();
}

class _DialogUbahMassalState extends State<_DialogUbahMassal> {
  Map<String, dynamic>? _k;
  dynamic _nilai;
  final _c = TextEditingController();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Widget _input() {
    final k = _k!;
    switch (teks(k['jenis'])) {
      case 'bool':
        return SwitchListTile(contentPadding: EdgeInsets.zero, value: _nilai == true, onChanged: (v) => setState(() => _nilai = v), title: const Text('Ya / Tidak'));
      case 'pilihan':
        final p = daftar(k['pilihan']).map((e) => teks(e)).toList();
        return DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: p.contains(_nilai) ? _nilai as String : null,
          decoration: const InputDecoration(labelText: 'Nilai baru'),
          items: [for (final x in p) DropdownMenuItem(value: x, child: Text(x.isEmpty ? '—' : x))],
          onChanged: (v) => setState(() => _nilai = v ?? ''),
        );
      case 'ref':
        final r = daftar(peta(widget.data['ref'])[teks(k['ref'])]).map(peta).where((x) => x['aktif'] != false).toList();
        return DropdownButtonFormField<String>(
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Nilai baru'),
          items: [
            const DropdownMenuItem(value: '', child: Text('— (kosongkan)')),
            for (final x in r) DropdownMenuItem(value: teks(x['id']), child: Text(teks(x['nama']), overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => setState(() => _nilai = v ?? ''),
        );
      case 'tanggal':
        return OutlinedButton.icon(
          onPressed: () async {
            final now = DateTime.now();
            final p = await showDatePicker(context: context, firstDate: DateTime(1950), lastDate: DateTime(now.year + 1), initialDate: now);
            if (p != null) setState(() => _nilai = tglIso(p));
          },
          icon: const Icon(Icons.event_rounded),
          label: Text(teks(_nilai).isEmpty ? 'Pilih tanggal' : tglIndo(teks(_nilai))),
        );
      default:
        return TextField(controller: _c, decoration: const InputDecoration(labelText: 'Nilai baru'), onChanged: (v) => _nilai = v);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Ubah ${widget.jumlah} data sekaligus'),
      content: SizedBox(
        width: 420,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          DropdownButtonFormField<String>(
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Kolom yang diubah'),
            items: [for (final k in widget.kolom) DropdownMenuItem(value: teks(k['nama']), child: Text(teks(k['label'], teks(k['nama']))))],
            onChanged: (v) => setState(() {
              _k = widget.kolom.firstWhere((k) => teks(k['nama']) == v);
              _nilai = teks(_k!['jenis']) == 'bool' ? false : '';
              _c.clear();
            }),
          ),
          if (_k != null) ...[const SizedBox(height: 12), _input()],
          const SizedBox(height: 8),
          const Text('Kolom lain pada baris yang dipilih tidak berubah.', style: TextStyle(fontSize: 12)),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(
          onPressed: _k == null || (teks(_k!['jenis']) != 'bool' && teks(_k!['jenis']) != 'teks' && _nilai == null)
              ? null
              : () => Navigator.pop(context, (teks(_k!['nama']), teks(_k!['jenis']) == 'teks' ? _c.text : _nilai)),
          child: const Text('Terapkan'),
        ),
      ],
    );
  }
}

class FormInduk extends StatefulWidget {
  const FormInduk({super.key, required this.data, this.baris, this.tertanam = false});
  final Map<String, dynamic> data;
  final Map<String, dynamic>? baris;
  final bool tertanam;

  @override
  State<FormInduk> createState() => _FormIndukState();
}

class _FormIndukState extends State<FormInduk> {
  final _c = <String, TextEditingController>{};
  final _nilai = <String, dynamic>{};
  late final List<Map<String, dynamic>> _kolom;

  bool get _baru => widget.baris == null;

  @override
  void initState() {
    super.initState();
    _kolom = daftar(widget.data['kolom']).map(peta).toList();
    final bawaan = peta(widget.data['bawaan']);
    for (final k in _kolom) {
      final n = teks(k['nama']);
      final v = widget.baris != null ? widget.baris![n] : bawaan[n];
      final j = teks(k['jenis']);
      if (j == 'teks') {
        _c[n] = TextEditingController(text: teks(v));
      } else {
        _nilai[n] = j == 'bool' ? (v == true) : teks(v);
      }
    }
  }

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _simpan() async {
    final d = <String, dynamic>{if (!_baru) '_id': teks(widget.baris!['_id'])};
    for (final k in _kolom) {
      if (k['ro'] == true) continue;
      final n = teks(k['nama']);
      d[n] = _c.containsKey(n) ? _c[n]!.text : _nilai[n];
    }
    final r = await jalankan(context, () => Api.instance('waStafIndukSimpan', [_t, teks(widget.data['tabel']), d]), teksProses: 'Menyimpan...');
    if (!r.ok || !mounted) return;
    kabar(context, 'Tersimpan.');
    if (!widget.tertanam) Navigator.pop(context, true);
  }

  Future<void> _nonaktifkan() async {
    if (!await konfirmasi(context, 'Nonaktifkan data ini?', 'Data tidak dihapus, hanya dinonaktifkan dan bisa diaktifkan lagi dengan mengubahnya.', ya: 'Nonaktifkan')) return;
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafIndukNonaktif', [_t, teks(widget.data['tabel']), teks(widget.baris!['_id'])]), teksProses: 'Menyimpan...');
    if (r.ok && mounted) Navigator.pop(context, true);
  }

  Widget _field(Map<String, dynamic> k) {
    final n = teks(k['nama']);
    final lbl = '${teks(k['label'], n)}${k['wajib'] == true ? ' *' : ''}';
    final ro = k['ro'] == true || widget.data['tulis'] != true || Sesi.instance.isDinas || (n == teks(widget.data['kunci']) && !_baru);
    switch (teks(k['jenis'])) {
      case 'bool':
        return SwitchListTile(contentPadding: EdgeInsets.zero, value: _nilai[n] == true, onChanged: ro ? null : (v) => setState(() => _nilai[n] = v), title: Text(lbl));
      case 'pilihan':
        final p = daftar(k['pilihan']).map((e) => teks(e)).toList();
        if (!p.contains(_nilai[n]) && teks(_nilai[n]).isNotEmpty) p.add(teks(_nilai[n]));
        return DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: p.contains(_nilai[n]) ? _nilai[n] as String : null,
          decoration: InputDecoration(labelText: lbl),
          items: [for (final x in p) DropdownMenuItem(value: x, child: Text(x.isEmpty ? '—' : x))],
          onChanged: ro ? null : (v) => setState(() => _nilai[n] = v ?? ''),
        );
      case 'ref':
        final r = daftar(peta(widget.data['ref'])[teks(k['ref'])]).map(peta).toList();
        final ada = r.any((x) => teks(x['id']) == _nilai[n]);
        return DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: ada ? _nilai[n] as String : '',
          decoration: InputDecoration(labelText: lbl),
          items: [
            const DropdownMenuItem(value: '', child: Text('—')),
            for (final x in r) DropdownMenuItem(value: teks(x['id']), child: Text('${teks(x['nama'])}${x['aktif'] == false ? ' (nonaktif)' : ''}', overflow: TextOverflow.ellipsis)),
          ],
          onChanged: ro ? null : (v) => setState(() => _nilai[n] = v ?? ''),
        );
      case 'tanggal':
        return OutlinedButton.icon(
          onPressed: ro
              ? null
              : () async {
                  final now = DateTime.now();
                  final p = await showDatePicker(context: context, firstDate: DateTime(1950), lastDate: DateTime(now.year + 1), initialDate: DateTime.tryParse(teks(_nilai[n])) ?? DateTime(now.year - 15));
                  if (p != null) setState(() => _nilai[n] = tglIso(p));
                },
          icon: const Icon(Icons.event_rounded),
          label: Text(teks(_nilai[n]).isEmpty ? lbl : '$lbl: ${tglIndo(teks(_nilai[n]))}'),
        );
      default:
        final angka = RegExp(r'NIK|NISN|NO HP|NOMOR|HONOR|TINGKAT|NPSN').hasMatch(n);
        return TextField(controller: _c[n], enabled: !ro, keyboardType: angka ? TextInputType.number : TextInputType.text, decoration: InputDecoration(labelText: lbl));
    }
  }

  @override
  Widget build(BuildContext context) {
    final tulis = widget.data['tulis'] == true && !Sesi.instance.isDinas;
    final isi = ListView(padding: const EdgeInsets.all(16), children: [
      for (final k in _kolom)
        if (!(k['ro'] == true && _baru)) Padding(padding: const EdgeInsets.only(bottom: 12), child: _field(k)),
      if (tulis) FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: _simpan, child: const Text('Simpan')),
      if (tulis && !_baru && widget.data['bisaHapus'] == true && !widget.tertanam)
        TextButton.icon(onPressed: _nonaktifkan, icon: const Icon(Icons.block_rounded), label: const Text('Nonaktifkan')),
    ]);
    if (widget.tertanam) return isi;
    return Scaffold(appBar: AppBar(title: Text(_baru ? 'Tambah ${teks(widget.data['judul'])}' : 'Ubah ${teks(widget.data['judul'])}')), body: isi);
  }
}
