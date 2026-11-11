import 'package:flutter/material.dart';

import '../api.dart';
import '../menu.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

const _peranDasar = ['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Tutor', 'Front Office', 'Bendahara', 'Dinas Pendidikan'];
const _labelTingkat = {'tidak': 'Tidak', 'lihat': 'Lihat', 'ubah': 'Ubah'};

/// v1.41.0 (Tahap 1): daftar peran (bawaan & kustom) dan izin per fitur. Khusus Admin utama.
class PeranIzinScreen extends StatefulWidget {
  const PeranIzinScreen({super.key});

  @override
  State<PeranIzinScreen> createState() => _PeranIzinScreenState();
}

class _PeranIzinScreenState extends State<PeranIzinScreen> {
  int _v = 0;

  Future<void> _buka(Map<String, dynamic> d, Map<String, dynamic>? peran, {Map<String, dynamic>? salinDari}) async {
    final ubah = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => _EditorPeran(fitur: daftar(d['fitur']).map(peta).toList(), peran: peran, salinDari: salinDari),
    ));
    if (ubah == true && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waAdminPeranDaftar', [_t])),
      bangun: (context, d, segarkan) {
        final peran = daftar(d['peran']).map(peta).toList();
        return Scaffold(
          floatingActionButton: FloatingActionButton.extended(onPressed: () => _buka(d, null), icon: const Icon(Icons.add_rounded), label: const Text('Tambah peran')),
          body: RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 96), children: [
              Card(
                color: cs.primaryContainer,
                child: const ListTile(
                  leading: Icon(Icons.admin_panel_settings_rounded),
                  title: Text('Peran & Izin', style: TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text('Peran baru selalu berdasar salah satu peran bawaan (menentukan cakupan data). Izin dapat diturunkan per fitur: '
                      'Tidak / Lihat / Ubah. Tahap ini belum bisa memberi fitur di luar peran dasarnya.'),
                ),
              ),
              for (final p in peran)
                Card(
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  child: ListTile(
                    leading: Icon(p['bawaan'] == true ? Icons.verified_user_rounded : Icons.person_pin_rounded, color: p['terkunci'] == true ? cs.outline : cs.primary),
                    title: Text(teks(p['nama']), style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text([
                      if (p['bawaan'] == true) 'Peran bawaan' else 'Dasar: ${teks(p['dasar'])}',
                      '${angka(p['pengguna'])} pengguna',
                      if (teks(p['status']) == 'Nonaktif') 'Nonaktif',
                      if (teks(p['deskripsi']).isNotEmpty) teks(p['deskripsi']),
                    ].join(' · ')),
                    trailing: p['terkunci'] == true ? const Lencana('Penuh', warna: Colors.green) : const Icon(Icons.chevron_right_rounded),
                    onTap: p['terkunci'] == true ? () => kabar(context, 'Peran Admin selalu memiliki semua izin dan tidak dapat diubah.') : () => _buka(d, p),
                    onLongPress: p['terkunci'] == true ? null : () => _buka(d, null, salinDari: p),
                  ),
                ),
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text('Tekan lama sebuah peran untuk menduplikatnya.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12)),
              ),
            ]),
          ),
        );
      },
    );
  }
}

class _EditorPeran extends StatefulWidget {
  const _EditorPeran({required this.fitur, this.peran, this.salinDari});
  final List<Map<String, dynamic>> fitur;
  final Map<String, dynamic>? peran;
  final Map<String, dynamic>? salinDari;

  @override
  State<_EditorPeran> createState() => _EditorPeranState();
}

class _EditorPeranState extends State<_EditorPeran> {
  late final bool _baru = widget.peran == null;
  late final bool _bawaan = widget.peran?['bawaan'] == true;
  late final TextEditingController _nama = TextEditingController(
      text: widget.peran != null ? teks(widget.peran!['nama']) : (widget.salinDari != null ? 'Salinan ${teks(widget.salinDari!['nama'])}' : ''));
  late final TextEditingController _desk = TextEditingController(text: teks((widget.peran ?? widget.salinDari)?['deskripsi']));
  late String _dasar = teks((widget.peran ?? widget.salinDari)?['dasar'], 'Tutor');
  late bool _aktif = teks(widget.peran?['status'], 'Aktif') != 'Nonaktif';
  Map<String, String> _izin = {};
  bool _muat = true;
  String? _galat;

  String get _maks => _dasar == 'Dinas Pendidikan' ? 'lihat' : 'ubah';

  @override
  void initState() {
    super.initState();
    _ambil();
  }

  @override
  void dispose() {
    _nama.dispose();
    _desk.dispose();
    super.dispose();
  }

  Future<void> _ambil() async {
    final sumber = widget.peran ?? widget.salinDari;
    try {
      if (sumber != null) {
        final r = peta(await Api.instance('waAdminPeranIzin', [_t, teks(sumber['nama'])]));
        _izin = {for (final e in peta(r['izin']).entries) e.key: teks(e.value)};
      }
    } catch (e) {
      _galat = e is ApiException ? e.ramah : '$e';
    }
    if (mounted) setState(() => _muat = false);
  }

  List<Map<String, dynamic>> get _fiturDasar => widget.fitur.where((f) => daftar(f['peran']).map(teks).contains(_dasar)).toList();

  String _tingkat(String id) {
    final t = _izin[id] ?? _maks;
    return t == 'ubah' && _maks == 'lihat' ? 'lihat' : t;
  }

  Future<void> _simpan() async {
    final data = {
      'namaLama': _baru ? '' : teks(widget.peran!['nama']),
      'nama': _bawaan ? teks(widget.peran!['nama']) : _nama.text.trim(),
      'dasar': _bawaan ? teks(widget.peran!['nama']) : _dasar,
      'deskripsi': _desk.text.trim(),
      'status': _aktif ? 'Aktif' : 'Nonaktif',
      'izin': {for (final f in _fiturDasar) teks(f['id']): _tingkat(teks(f['id']))},
    };
    final r = await jalankan(context, () => Api.instance('waAdminPeranSimpan', [_t, data]), teksProses: 'Menyimpan peran...');
    if (r.ok && mounted) {
      kabar(context, 'Peran disimpan. Berlaku dalam beberapa menit (pengguna yang sedang masuk: muat ulang aplikasi).');
      Navigator.pop(context, true);
    }
  }

  Future<void> _hapus() async {
    final nama = teks(widget.peran!['nama']);
    if (!await konfirmasi(context, 'Hapus peran $nama?', 'Peran hanya dapat dihapus bila tidak ada pengguna yang memakainya.', ya: 'Hapus')) return;
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminPeranHapus', [_t, nama]), teksProses: 'Menghapus...');
    if (r.ok && mounted) Navigator.pop(context, true);
  }

  void _pratinjau() {
    final menu = semuaMenu.where((m) {
      if (!m.peran.contains(_dasar) || m.id == 'peranIzin') return false;
      final id = m.id == 'rppSemua' ? 'rpp' : m.id;
      final ada = _fiturDasar.any((f) => teks(f['id']) == id);
      return !ada || _tingkat(id) != 'tidak';
    }).toList();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(c).size.height * 0.8),
          child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
            Text('Menu untuk peran ${_bawaan ? teks(widget.peran!['nama']) : (_nama.text.trim().isEmpty ? '(baru)' : _nama.text.trim())}',
                style: const TextStyle(fontWeight: FontWeight.w800)),
            Text('${menu.length} menu · dasar $_dasar', style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 8),
            for (final m in menu)
              ListTile(
                dense: true,
                leading: Icon(m.ikon),
                title: Text(m.judul),
                trailing: Text(_labelTingkat[_tingkat(m.id == 'rppSemua' ? 'rpp' : m.id)] ?? '', style: const TextStyle(fontSize: 12)),
              ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final kelompok = <String, List<Map<String, dynamic>>>{};
    for (final f in _fiturDasar) {
      kelompok.putIfAbsent(teks(f['kelompok'], 'Lainnya'), () => []).add(f);
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(_baru ? 'Peran baru' : teks(widget.peran!['nama'])),
        actions: [
          IconButton(tooltip: 'Lihat sebagai peran ini', onPressed: _muat ? null : _pratinjau, icon: const Icon(Icons.visibility_rounded)),
          if (!_baru && !_bawaan) IconButton(tooltip: 'Hapus peran', onPressed: _hapus, icon: Icon(Icons.delete_rounded, color: cs.error)),
        ],
      ),
      floatingActionButton: _muat ? null : FloatingActionButton.extended(onPressed: _simpan, icon: const Icon(Icons.save_rounded), label: const Text('Simpan')),
      body: _muat
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 96), children: [
              if (_galat != null) Text(_galat!, style: TextStyle(color: cs.error)),
              if (_bawaan)
                Card(child: ListTile(leading: const Icon(Icons.verified_user_rounded), title: Text('Peran bawaan ${teks(widget.peran!['nama'])}'), subtitle: const Text('Nama dan peran dasar tetap; hanya izin yang dapat diturunkan.')))
              else ...[
                TextField(controller: _nama, decoration: const InputDecoration(labelText: 'Nama peran', hintText: 'mis. Wali Kelas, Operator Data')),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: _peranDasar.contains(_dasar) ? _dasar : 'Tutor',
                  decoration: const InputDecoration(labelText: 'Peran dasar (cakupan data)'),
                  items: [for (final p in _peranDasar) DropdownMenuItem(value: p, child: Text(p))],
                  onChanged: (v) => setState(() => _dasar = v ?? _dasar),
                ),
                const SizedBox(height: 10),
                TextField(controller: _desk, decoration: const InputDecoration(labelText: 'Deskripsi (opsional)')),
                SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Aktif'), value: _aktif, onChanged: (v) => setState(() => _aktif = v)),
              ],
              const JudulBagian('Izin per fitur', sub: 'Tidak = menu disembunyikan & ditolak server · Lihat = hanya membuka · Ubah = penuh'),
              Wrap(spacing: 8, children: [
                for (final t in ['tidak', 'lihat', if (_maks == 'ubah') 'ubah'])
                  ActionChip(
                    label: Text('Semua: ${_labelTingkat[t]}'),
                    onPressed: () => setState(() {
                      for (final f in _fiturDasar) {
                        _izin[teks(f['id'])] = t;
                      }
                    }),
                  ),
              ]),
              for (final g in kelompok.entries) ...[
                JudulBagian(g.key),
                Card(
                  child: Column(children: [
                    for (final f in g.value)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
                        child: Row(children: [
                          Expanded(child: Text(teks(f['judul']), style: const TextStyle(fontSize: 13.5))),
                          SegmentedButton<String>(
                            showSelectedIcon: false,
                            style: const ButtonStyle(visualDensity: VisualDensity.compact),
                            segments: [
                              const ButtonSegment(value: 'tidak', label: Text('Tidak')),
                              const ButtonSegment(value: 'lihat', label: Text('Lihat')),
                              if (_maks == 'ubah') const ButtonSegment(value: 'ubah', label: Text('Ubah')),
                            ],
                            selected: {_tingkat(teks(f['id']))},
                            onSelectionChanged: (v) => setState(() => _izin[teks(f['id'])] = v.first),
                          ),
                        ]),
                      ),
                  ]),
                ),
              ],
            ]),
    );
  }
}
