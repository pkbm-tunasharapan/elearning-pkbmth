import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

const _daftarPeran = ['Admin', 'Superadmin', 'Tutor', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Front Office', 'Bendahara', 'Koordinator Unit', 'Dinas Pendidikan'];

/// Kelola pengguna staf (akun login & peran).
/// v1.73.0: mapel tutor tidak lagi diatur di sini. Tutor Online diatur di Jadwal -> Pengampu; tatap muka lewat jadwal mingguan.
class PenggunaScreen extends StatefulWidget {
  const PenggunaScreen({super.key});

  @override
  State<PenggunaScreen> createState() => _PenggunaScreenState();
}

class _PenggunaScreenState extends State<PenggunaScreen> {
  int _versi = 0;
  String _cari = '';
  final Set<String> _kodeTampil = {};
  // v1.41.0: peran bawaan + peran kustom dari menu Peran & Izin
  List<String> _peranTersedia = _daftarPeran;

  void _muatUlang() => setState(() => _versi++);

  Future<void> _ubah(Map<String, dynamic>? p) async {
    final hasil = await showDialog<Map<String, dynamic>>(context: context, builder: (_) => _DialogPengguna(awal: p, daftarPeran: _peranTersedia));
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

  /// v1.73.0: tugas tambahan sebagai Tutor (satu akun; beralih mode lewat Profil). Tidak menambah honor.
  Future<void> _tambahan(Map<String, dynamic> p) async {
    final beri = p['tambahanTutor'] != true;
    if (!await konfirmasi(
        context,
        beri ? 'Beri tugas tambahan Tutor' : 'Cabut tugas tambahan Tutor',
        beri
            ? '${teks(p['nama'])} tetap ${teks(p['peran'])} dan dapat beralih ke mode Tutor dari menu Profil. Penugasan mengajar diatur di Jadwal → Pengampu / jadwal mingguan. '
                'Tugas tambahan tidak menambah honor. Pastikan namanya tercatat di Data Induk tutor.'
            : '${teks(p['nama'])} tidak dapat lagi beralih ke mode Tutor.',
        ya: beri ? 'Beri' : 'Cabut')) {
      return;
    }
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminTugasTambahan', [Sesi.instance.token, teks(p['id']), beri]), teksProses: 'Menyimpan...');
    if (r.ok) {
      if (mounted) kabar(context, beri ? 'Tugas tambahan Tutor diberikan.' : 'Tugas tambahan Tutor dicabut.');
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
    if (grup.isEmpty) return angka(p['jumlahMapel']) > 0 ? 'Mengampu ${angka(p['jumlahMapel'])} mapel' : 'Belum menjadi Tutor Online di mapel mana pun';
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
          final pt = daftar(d['peranTersedia']).map(peta).map((x) => teks(x['nama'])).where((x) => x.isNotEmpty).toList();
          if (pt.isNotEmpty) _peranTersedia = pt;
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
              Text('${semua.length} pengguna · mapel tutor diatur di Jadwal → Pengampu (online) dan jadwal mingguan (tatap muka).', style: Theme.of(context).textTheme.bodySmall),
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
                        if (p['tambahanTutor'] == true) const Lencana('+ Tugas tambahan: Tutor', warna: Colors.teal),
                      ]),
                      const SizedBox(height: 4),
                      Text(
                        teks(p['peranDasar'], teks(p['peran'])) == 'Tutor'
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
                        TextButton.icon(onPressed: () => _ubah(p), icon: const Icon(Icons.edit_outlined, size: 18), label: const Text('Ubah')),
                        TextButton.icon(onPressed: () => _resetKode(p), icon: const Icon(Icons.key_outlined, size: 18), label: const Text('Reset Kode')),
                        if (teks(p['peranDasar'], teks(p['peran'])) != 'Tutor' && teks(p['status']) == 'Aktif')
                          TextButton.icon(
                            onPressed: () => _tambahan(p),
                            icon: Icon(p['tambahanTutor'] == true ? Icons.person_remove_outlined : Icons.school_outlined, size: 18),
                            label: Text(p['tambahanTutor'] == true ? 'Cabut tugas Tutor' : 'Tugas tambahan Tutor'),
                          ),
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
  const _DialogPengguna({this.awal, this.daftarPeran = _daftarPeran});
  final Map<String, dynamic>? awal;
  final List<String> daftarPeran;

  @override
  State<_DialogPengguna> createState() => _DialogPenggunaState();
}

class _DialogPenggunaState extends State<_DialogPengguna> {
  late final TextEditingController _nama = TextEditingController(text: teks(widget.awal?['nama']));
  late final TextEditingController _hp = TextEditingController(text: teks(widget.awal?['hp']));
  late String _peran = widget.daftarPeran.contains(teks(widget.awal?['peran'])) ? teks(widget.awal?['peran']) : 'Tutor';
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
            items: [for (final p in widget.daftarPeran) DropdownMenuItem(value: p, child: Text(p))],
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

String _kunciMapel(String n) => n.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
