import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

/// Kelola mata pelajaran per kelas (admin): tambah, ubah nama/status, sinkron & tarik dari SIM SETARA.
class KelolaMapelScreen extends StatefulWidget {
  const KelolaMapelScreen({super.key});

  @override
  State<KelolaMapelScreen> createState() => _KelolaMapelScreenState();
}

class _KelolaMapelScreenState extends State<KelolaMapelScreen> {
  int _versi = 0;
  String _cari = '';
  bool _tampilNonaktif = false;

  String? get _t => Sesi.instance.token;

  void _muatUlang() => setState(() => _versi++);

  Future<void> _ubah(Map<String, dynamic>? m, List<Map<String, dynamic>> rombel) async {
    final hasil = await showDialog<Map<String, dynamic>>(context: context, builder: (_) => _DialogMapel(awal: m, rombel: rombel));
    if (hasil == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminSimpanMapel', [_t, hasil]), teksProses: 'Menyimpan mata pelajaran...');
    if (r.ok && mounted) {
      kabar(context, 'Mata pelajaran disimpan.');
      _muatUlang();
    }
  }

  Future<void> _sinkron() async {
    final r = await jalankan(context, () => Api.instance('waAdminSinkronSekarang', [_t], const Duration(seconds: 300)), teksProses: 'Sinkron dengan SIM SETARA...');
    if (!r.ok || !mounted) return;
    final d = peta(r.data);
    final ubah = daftar(d['perubahan']);
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Sinkron selesai'),
        content: Text(ubah.isEmpty ? 'Tidak ada perubahan.' : ubah.map((x) => '• $x').join('\n')),
        actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup'))],
      ),
    );
    _muatUlang();
  }

  Future<void> _tarik() async {
    final r = await jalankan(context, () => Api.instance('waAdminImporPratinjau', [_t], const Duration(seconds: 180)), teksProses: 'Membaca SIM SETARA...');
    if (!r.ok || !mounted) return;
    final d = peta(r.data);
    final kelasBaru = daftar(d['kelasBaru']);
    final perKelas = daftar(d['mapelBaruPerKelas']).map(peta).toList();
    final adaBaru = kelasBaru.isNotEmpty || angka(d['jumlahMapelBaru']) > 0;
    final lanjut = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Tarik Kelas & Mapel dari SIM SETARA'),
        content: SingleChildScrollView(
          child: Text([
            'Kelas di SIM SETARA: ${angka(d['totalKelasMaster'])}',
            'Kelas baru: ${kelasBaru.isEmpty ? '-' : kelasBaru.join(', ')}',
            'Mapel baru: ${angka(d['jumlahMapelBaru'])} (sudah ada ${angka(d['jumlahMapelAda'])})',
            if (perKelas.isNotEmpty) '\n${perKelas.map((x) => '• ${teks(x['kelas'])}: ${angka(x['jumlah'])} mapel').join('\n')}',
          ].join('\n')),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Tutup')),
          if (adaBaru) FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Tambahkan')),
        ],
      ),
    );
    if (lanjut != true || !mounted) return;
    final h = await jalankan(context, () => Api.instance('waAdminImporTerapkan', [_t], const Duration(seconds: 240)), teksProses: 'Menambahkan kelas & mapel...');
    if (h.ok && mounted) {
      final x = peta(h.data);
      kabar(context, '${angka(x['kelasBaru'])} kelas baru dan ${angka(x['mapelBaru'])} mapel baru ditambahkan.');
      _muatUlang();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_versi),
      muat: () async => peta(await Api.instance('waAdminDaftarMapel', [_t])),
      bangun: (context, d, segarkan) {
        final rombel = daftar(d['rombel']).map(peta).toList();
        final semua = daftar(d['mapel']).map(peta).toList();
        final q = _cari.toLowerCase();
        final list = semua
            .where((m) => (_tampilNonaktif || teks(m['status']) == 'Aktif') && (q.isEmpty || '${teks(m['namaMapel'])} ${teks(m['namaRombel'])} ${teks(m['tutor'])}'.toLowerCase().contains(q)))
            .toList()
          ..sort((a, b) => '${teks(a['namaRombel'])}|${teks(a['namaMapel'])}'.compareTo('${teks(b['namaRombel'])}|${teks(b['namaMapel'])}'));
        final grup = <String, List<Map<String, dynamic>>>{};
        for (final m in list) {
          grup.putIfAbsent(teks(m['namaRombel'], '-'), () => []).add(m);
        }
        final cs = Theme.of(context).colorScheme;
        return Scaffold(
          floatingActionButton: FloatingActionButton.extended(onPressed: () => _ubah(null, rombel), icon: const Icon(Icons.add), label: const Text('Tambah Mapel')),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
            children: [
              Wrap(spacing: 8, runSpacing: 8, children: [
                FilledButton.tonalIcon(onPressed: _sinkron, icon: const Icon(Icons.sync), label: const Text('Sinkron SIM SETARA')),
                OutlinedButton.icon(onPressed: _tarik, icon: const Icon(Icons.download), label: const Text('Tarik Kelas & Mapel')),
              ]),
              const SizedBox(height: 10),
              TextField(
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Cari mapel, kelas, atau tutor'),
                onChanged: (v) => setState(() => _cari = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Tampilkan mapel nonaktif'),
                value: _tampilNonaktif,
                onChanged: (v) => setState(() => _tampilNonaktif = v),
              ),
              if (list.isEmpty) const Kosong(pesan: 'Belum ada mata pelajaran.'),
              for (final e in grup.entries) ...[
                JudulBagian(e.key, sub: '${e.value.length} mapel'),
                Card(
                  child: Column(children: [
                    for (final m in e.value)
                      ListTile(
                        title: Text(teks(m['namaMapel'])),
                        subtitle: Text([
                          teks(m['tutor']).isEmpty ? 'Belum ada tutor' : 'Tutor: ${teks(m['tutor'])}',
                          '${angka(m['jumlahMateri'])} materi',
                        ].join(' · ')),
                        trailing: teks(m['status']) == 'Aktif' ? const Icon(Icons.edit_outlined) : Lencana('Nonaktif', warna: cs.outline),
                        onTap: () => _ubah(m, rombel),
                      ),
                  ]),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _DialogMapel extends StatefulWidget {
  const _DialogMapel({this.awal, required this.rombel});
  final Map<String, dynamic>? awal;
  final List<Map<String, dynamic>> rombel;

  @override
  State<_DialogMapel> createState() => _DialogMapelState();
}

class _DialogMapelState extends State<_DialogMapel> {
  late final TextEditingController _nama = TextEditingController(text: teks(widget.awal?['namaMapel']));
  late String? _rombel = widget.rombel.isNotEmpty ? teks(widget.rombel.first['id']) : null;
  late bool _aktif = widget.awal == null || teks(widget.awal?['status']) == 'Aktif';

  bool get _baru => widget.awal == null;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(_baru ? 'Tambah mata pelajaran' : 'Ubah mata pelajaran'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (_baru)
            DropdownButtonFormField<String>(
              initialValue: _rombel,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Kelas'),
              items: [for (final r in widget.rombel) DropdownMenuItem(value: teks(r['id']), child: Text(teks(r['nama'])))],
              onChanged: (v) => setState(() => _rombel = v),
            )
          else
            Text('Kelas: ${teks(widget.awal?['namaRombel'])}'),
          const SizedBox(height: 12),
          TextField(controller: _nama, maxLength: 80, decoration: const InputDecoration(labelText: 'Nama mata pelajaran')),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Aktif'), value: _aktif, onChanged: (v) => setState(() => _aktif = v)),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(
          onPressed: () {
            if (_nama.text.trim().isEmpty || (_baru && _rombel == null)) return;
            Navigator.pop(context, <String, dynamic>{
              'idMapel': _baru ? '' : teks(widget.awal?['idMapel']),
              if (_baru) 'idRombel': _rombel,
              'nama': _nama.text.trim(),
              'status': _aktif ? 'Aktif' : 'Nonaktif',
            });
          },
          child: const Text('Simpan'),
        ),
      ],
    );
  }
}
