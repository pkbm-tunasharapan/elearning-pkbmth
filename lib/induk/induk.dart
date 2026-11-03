import 'package:flutter/material.dart';

import '../absensi/umum.dart' show tglIso, tglIndo;
import '../api.dart';
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
      for (final t in _tabel)
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.judul)),
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
          final sub = daftar(d['sub']).map((e) => teks(e)).toList();
          final baris = semua.where((b) {
            if (!_nonaktif && !_aktif(b)) return false;
            if (_cari.isEmpty) return true;
            return b.values.any((v) => '$v'.toLowerCase().contains(_cari)) || sub.any((s) => kk[s] != null && _tampil(d, kk[s]!, b[s]).toLowerCase().contains(_cari));
          }).toList()
            ..sort((a, b) => _tampil(d, kk[label] ?? {}, a[label]).toLowerCase().compareTo(_tampil(d, kk[label] ?? {}, b[label]).toLowerCase()));
          final tulis = d['tulis'] == true;
          return Stack(children: [
            RefreshIndicator(
              onRefresh: segarkan,
              child: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 100), children: [
                TextField(
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari', isDense: true),
                  onChanged: (v) => setState(() => _cari = v.trim().toLowerCase()),
                ),
                SwitchListTile(contentPadding: EdgeInsets.zero, dense: true, value: _nonaktif, onChanged: (v) => setState(() => _nonaktif = v), title: Text('Tampilkan yang nonaktif · ${baris.length} data')),
                if (baris.isEmpty) const Kosong(pesan: 'Tidak ada data.'),
                if (baris.isNotEmpty)
                  Card(
                    child: Column(children: [
                      for (final b in baris)
                        ListTile(
                          dense: true,
                          title: Text(_tampil(d, kk[label] ?? {}, b[label]), style: TextStyle(fontWeight: FontWeight.w600, color: _aktif(b) ? null : Theme.of(context).colorScheme.outline)),
                          subtitle: Text([for (final s in sub) if (kk[s] != null && _tampil(d, kk[s]!, b[s]).isNotEmpty) _tampil(d, kk[s]!, b[s])].join(' · ')),
                          trailing: _aktif(b) ? const Icon(Icons.chevron_right_rounded) : const Text('nonaktif', style: TextStyle(fontSize: 11)),
                          onTap: () => _form(d, b),
                        ),
                    ]),
                  ),
              ]),
            ),
            if (tulis)
              Positioned(right: 16, bottom: 16, child: FloatingActionButton.extended(heroTag: 'induk${widget.tabel}', onPressed: () => _form(d), icon: const Icon(Icons.add_rounded), label: const Text('Tambah'))),
          ]);
        },
      ),
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
    final ro = k['ro'] == true || widget.data['tulis'] != true || (n == teks(widget.data['kunci']) && !_baru);
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
    final tulis = widget.data['tulis'] == true;
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
