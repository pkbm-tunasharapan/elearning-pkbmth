import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

const _daftarPeran = ['Admin', 'Superadmin', 'Tutor', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Front Office', 'Bendahara'];

/// Kelola pengguna staf (admin, tutor, kepala sekolah) dan enrollment mapel tutor.
class PenggunaScreen extends StatefulWidget {
  const PenggunaScreen({super.key});

  @override
  State<PenggunaScreen> createState() => _PenggunaScreenState();
}

class _PenggunaScreenState extends State<PenggunaScreen> {
  int _versi = 0;
  String _cari = '';
  final Set<String> _kodeTampil = {};

  void _muatUlang() => setState(() => _versi++);

  Future<void> _ubah(Map<String, dynamic>? p) async {
    final hasil = await showDialog<Map<String, dynamic>>(context: context, builder: (_) => _DialogPengguna(awal: p));
    if (hasil == null || !mounted) return;
    final ok = await jalankan(context, () => Api.instance('waAdminSimpanPengguna', [Sesi.instance.token, hasil]), teksProses: 'Menyimpan pengguna...');
    if (ok.ok) {
      if (mounted) kabar(context, 'Pengguna disimpan.');
      _muatUlang();
    }
  }

  Future<void> _resetKode(Map<String, dynamic> p) async {
    if (!await konfirmasi(context, 'Reset kode akses', 'Buat kode akses baru untuk ${teks(p['nama'])}? Kode lama tidak bisa dipakai lagi.', ya: 'Reset')) return;
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminResetKode', [Sesi.instance.token, teks(p['id'])]), teksProses: 'Membuat kode baru...');
    if (r.ok && mounted) {
      final d = r.data;
      final kode = d is Map ? teks(d['kode'], '') : teks(d);
      kabar(context, kode.isNotEmpty ? 'Kode baru ${teks(p['nama'])}: $kode' : 'Kode akses direset.');
      _muatUlang();
    }
  }

  Future<void> _aturMapel(Map<String, dynamic> p, List<Map<String, dynamic>> mapel, List<Map<String, dynamic>> enr) async {
    final dipilih = enr.where((e) => teks(e['idPengguna']) == teks(p['id'])).map((e) => teks(e['idMapel'])).toSet();
    final hasil = await Navigator.of(context).push<Set<String>>(MaterialPageRoute(
      builder: (_) => _PilihMapel(nama: teks(p['nama']), mapel: mapel, awal: dipilih),
    ));
    if (hasil == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminSetEnrollment', [Sesi.instance.token, teks(p['id']), hasil.toList()]), teksProses: 'Menyimpan enrollment...');
    if (r.ok) {
      if (mounted) {
        final nama = mapel.where((m) => hasil.contains(teks(m['idMapel']))).map((m) => _kunciMapel(teks(m['namaMapel']))).toSet();
        kabar(context, 'Enrollment ${teks(p['nama'])} disimpan (${nama.length} mapel, ${hasil.length} rombel).');
      }
      _muatUlang();
    }
  }

  /// Mapel dengan nama sama dihitung satu, lalu disebut jumlah rombelnya (mis. Bahasa Indonesia · 9 rombel).
  String _ringkasAmpu(Map<String, dynamic> p, List<Map<String, dynamic>> mapel, List<Map<String, dynamic>> enr) {
    final ids = enr.where((e) => teks(e['idPengguna']) == teks(p['id'])).map((e) => teks(e['idMapel'])).toSet();
    final grup = <String, ({String nama, int n})>{};
    for (final m in mapel.where((m) => ids.contains(teks(m['idMapel'])))) {
      final k = _kunciMapel(teks(m['namaMapel']));
      final g = grup[k];
      grup[k] = (nama: g?.nama ?? teks(m['namaMapel']), n: (g?.n ?? 0) + 1);
    }
    if (grup.isEmpty) return angka(p['jumlahMapel']) > 0 ? 'Mengampu ${angka(p['jumlahMapel'])} mapel' : 'Belum di-enroll ke mapel mana pun';
    final urut = grup.values.toList()..sort((a, b) => a.nama.compareTo(b.nama));
    return 'Mengampu ${urut.length} mapel: ${urut.map((g) => '${g.nama} (${g.n} rombel)').join(', ')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(onPressed: () => _ubah(null), icon: const Icon(Icons.person_add_alt), label: const Text('Tambah')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_versi),
        muat: () async => peta(await Api.instance('waAdminDaftar', [Sesi.instance.token])),
        bangun: (context, d, segarkan) {
          final semua = daftar(d['pengguna']).map(peta).toList();
          final mapel = daftar(d['mapel']).map(peta).toList();
          final enr = daftar(d['enrollment']).map(peta).toList();
          final q = _cari.toLowerCase();
          final list = semua.where((p) => q.isEmpty || '${teks(p['nama'])} ${teks(p['peran'])}'.toLowerCase().contains(q)).toList();
          final cs = Theme.of(context).colorScheme;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
            children: [
              TextField(
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Cari nama atau peran'),
                onChanged: (v) => setState(() => _cari = v),
              ),
              const SizedBox(height: 6),
              Text('${semua.length} pengguna · tutor hanya melihat mapel yang di-enroll-kan.', style: Theme.of(context).textTheme.bodySmall),
              for (final p in list)
                Card(
                  margin: const EdgeInsets.symmetric(vertical: 5),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 12, 8, 6),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                        Text(teks(p['nama']), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                        Lencana(teks(p['peran'], 'tanpa peran'), warna: teks(p['peran']) == 'Admin' ? Colors.deepPurple : null),
                        if (teks(p['status']) != 'Aktif') Lencana(teks(p['status'], 'Nonaktif'), warna: cs.outline),
                      ]),
                      const SizedBox(height: 4),
                      Text(
                        teks(p['peran']) == 'Tutor'
                            ? _ringkasAmpu(p, mapel, enr)
                            : (teks(p['peran']) == 'Admin' ? 'Akses penuh' : 'Pemantauan'),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      Row(children: [
                        Text('Kode akses: ', style: Theme.of(context).textTheme.bodySmall),
                        Text(_kodeTampil.contains(teks(p['id'])) ? teks(p['kode'], '-') : '••••••••', style: const TextStyle(fontFamily: 'monospace')),
                        TextButton(
                          onPressed: () => setState(() {
                            final id = teks(p['id']);
                            _kodeTampil.contains(id) ? _kodeTampil.remove(id) : _kodeTampil.add(id);
                          }),
                          child: Text(_kodeTampil.contains(teks(p['id'])) ? 'sembunyikan' : 'tampilkan'),
                        ),
                      ]),
                      Wrap(spacing: 4, children: [
                        if (teks(p['peran']) == 'Tutor')
                          TextButton.icon(onPressed: () => _aturMapel(p, mapel, enr), icon: const Icon(Icons.library_add_check_outlined, size: 18), label: const Text('Atur Mapel')),
                        TextButton.icon(onPressed: () => _ubah(p), icon: const Icon(Icons.edit_outlined, size: 18), label: const Text('Ubah')),
                        TextButton.icon(onPressed: () => _resetKode(p), icon: const Icon(Icons.key_outlined, size: 18), label: const Text('Reset Kode')),
                      ]),
                    ]),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _DialogPengguna extends StatefulWidget {
  const _DialogPengguna({this.awal});
  final Map<String, dynamic>? awal;

  @override
  State<_DialogPengguna> createState() => _DialogPenggunaState();
}

class _DialogPenggunaState extends State<_DialogPengguna> {
  late final TextEditingController _nama = TextEditingController(text: teks(widget.awal?['nama']));
  late final TextEditingController _hp = TextEditingController(text: teks(widget.awal?['hp']));
  late String _peran = _daftarPeran.contains(teks(widget.awal?['peran'])) ? teks(widget.awal?['peran']) : 'Tutor';
  late bool _aktif = widget.awal == null || teks(widget.awal?['status']) == 'Aktif';

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.awal == null ? 'Tambah pengguna' : 'Ubah pengguna'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: _nama, decoration: const InputDecoration(labelText: 'Nama')),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _peran,
            decoration: const InputDecoration(labelText: 'Peran'),
            items: [for (final p in _daftarPeran) DropdownMenuItem(value: p, child: Text(p))],
            onChanged: (v) => setState(() => _peran = v ?? _peran),
          ),
          const SizedBox(height: 12),
          TextField(controller: _hp, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'No. HP (opsional)')),
          SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Aktif'), value: _aktif, onChanged: (v) => setState(() => _aktif = v)),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(
          onPressed: () {
            if (_nama.text.trim().isEmpty) return;
            final data = <String, dynamic>{
              'nama': _nama.text.trim(),
              'peran': _peran,
              'status': _aktif ? 'Aktif' : 'Nonaktif',
              'hp': _hp.text.trim(),
            };
            if (widget.awal != null) data['id'] = teks(widget.awal!['id']);
            Navigator.pop(context, data);
          },
          child: const Text('Simpan'),
        ),
      ],
    );
  }
}

class _PilihMapel extends StatefulWidget {
  const _PilihMapel({required this.nama, required this.mapel, required this.awal});
  final String nama;
  final List<Map<String, dynamic>> mapel;
  final Set<String> awal;

  @override
  State<_PilihMapel> createState() => _PilihMapelState();
}

String _kunciMapel(String n) => n.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

class _PilihMapelState extends State<_PilihMapel> {
  late final Set<String> _pilih = {...widget.awal};
  String _cari = '';

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    // kelompokkan per nama mapel: satu mapel, banyak rombel
    final grup = <String, List<Map<String, dynamic>>>{};
    for (final m in widget.mapel) {
      grup.putIfAbsent(_kunciMapel(teks(m['namaMapel'])), () => []).add(m);
    }
    final kunci = grup.keys.toList()..sort((a, b) => teks(grup[a]!.first['namaMapel']).compareTo(teks(grup[b]!.first['namaMapel'])));
    final q = _cari.toLowerCase().trim();
    final jumlahNama = kunci.where((k) => grup[k]!.any((m) => _pilih.contains(teks(m['idMapel'])))).length;
    return Scaffold(
      appBar: AppBar(title: Text('Mapel ${widget.nama}'), actions: [
        TextButton(onPressed: () => Navigator.pop(context, _pilih), child: Text('Simpan ($jumlahNama mapel)')),
      ]),
      body: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 24), children: [
        TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Cari mata pelajaran'), onChanged: (v) => setState(() => _cari = v)),
        const SizedBox(height: 6),
        Text('${kunci.length} mata pelajaran · ${_pilih.length} rombel dipilih. Mapel dengan nama sama dihitung satu; centang rombel yang diampu.',
            style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
        const SizedBox(height: 6),
        for (final k in kunci)
          if (q.isEmpty || k.contains(q))
            Builder(builder: (_) {
              final daftarM = [...grup[k]!]..sort((a, b) => teks(a['namaRombel']).compareTo(teks(b['namaRombel'])));
              final ids = daftarM.map((m) => teks(m['idMapel'])).toList();
              final n = ids.where(_pilih.contains).length;
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ExpansionTile(
                  shape: const Border(),
                  leading: Checkbox(
                    tristate: true,
                    value: n == 0 ? false : (n == ids.length ? true : null),
                    onChanged: (_) => setState(() => n == ids.length ? _pilih.removeAll(ids) : _pilih.addAll(ids)),
                  ),
                  title: Text(teks(daftarM.first['namaMapel']), style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text('${ids.length} rombel${n > 0 ? ' · $n diampu' : ''}'),
                  children: [
                    for (final m in daftarM)
                      CheckboxListTile(
                        dense: true,
                        value: _pilih.contains(teks(m['idMapel'])),
                        title: Text(teks(m['namaRombel'], 'Tanpa rombel')),
                        onChanged: (v) => setState(() => v == true ? _pilih.add(teks(m['idMapel'])) : _pilih.remove(teks(m['idMapel']))),
                      ),
                  ],
                ),
              );
            }),
      ]),
    );
  }
}
