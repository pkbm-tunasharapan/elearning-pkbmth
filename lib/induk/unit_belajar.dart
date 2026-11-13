import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';
import 'laporan_pemetaan.dart';

String? get _t => Sesi.instance.token;

/// v1.60.0: Unit Belajar (Tahap 1). Admin/Superadmin mengelola daftar unit dan memberi label
/// Unit + Layanan (Reguler/Flexi) pada siswa. Rombel, materi, soal, dan keuangan tetap terpusat.
class UnitBelajarScreen extends StatefulWidget {
  const UnitBelajarScreen({super.key});

  @override
  State<UnitBelajarScreen> createState() => _UnitBelajarScreenState();
}

class _UnitBelajarScreenState extends State<UnitBelajarScreen> {
  int _ulang = 0;
  final _saring = _Saringan(); // bertahan saat data dimuat ulang

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Unit Belajar'),
          actions: [
            // v1.74.0: laporan pemetaan siswa
            IconButton(
              tooltip: 'Laporan pemetaan siswa',
              icon: const Icon(Icons.summarize_outlined),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LaporanPemetaanScreen())),
            ),
            if (!Sesi.instance.hanyaLihat)
              PopupMenuButton<String>(
                tooltip: 'Impor dari Excel',
                icon: const Icon(Icons.upload_file_rounded),
                onSelected: (v) async {
                  if (v == 'unggah') {
                    final ok = await _unggahLabel(context);
                    if (ok && mounted) setState(() => _ulang++);
                  } else {
                    await _unduhTemplat(context, hanyaKosong: v == 'kosong');
                  }
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'kosong', child: ListTile(leading: Icon(Icons.download_rounded), title: Text('Unduh templat'), subtitle: Text('Siswa yang belum lengkap labelnya'))),
                  PopupMenuItem(value: 'semua', child: ListTile(leading: Icon(Icons.download_rounded), title: Text('Unduh templat'), subtitle: Text('Semua siswa aktif'))),
                  PopupMenuItem(value: 'unggah', child: ListTile(leading: Icon(Icons.upload_rounded), title: Text('Unggah templat terisi'))),
                ],
              ),
          ],
          bottom: const TabBar(tabs: [Tab(text: 'Unit'), Tab(text: 'Siswa')]),
        ),
        body: Muatan<Map<String, dynamic>>(
          key: ValueKey('ub$_ulang'),
          muat: () async => peta(await Api.instance('waStafUnitData', [_t])),
          bangun: (c, d, segar) {
            void muatUlang() => setState(() => _ulang++);
            return TabBarView(children: [
              _TabUnit(d: d, muatUlang: muatUlang),
              _TabSiswa(d: d, muatUlang: muatUlang, f: _saring),
            ]);
          },
        ),
      ),
    );
  }
}

// ───────────────────────── tab unit ─────────────────────────

class _TabUnit extends StatelessWidget {
  const _TabUnit({required this.d, required this.muatUlang});
  final Map<String, dynamic> d;
  final VoidCallback muatUlang;

  Future<void> _form(BuildContext context, [Map<String, dynamic>? u]) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => _DialogUnit(u: u, calon: daftar(d['calonKoordinator']).map(peta).toList()));
    if (ok == true) muatUlang();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final unit = daftar(d['unit']).map(peta).toList();
    final r = peta(d['ringkas']);
    return Stack(children: [
      ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 96), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${angka(r['total'])} siswa aktif', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 8),
              Wrap(spacing: 6, runSpacing: 6, children: [
                Lencana('Belum ada unit: ${angka(r['tanpaUnit'])}', warna: angka(r['tanpaUnit']) > 0 ? Colors.orange : Colors.green),
                Lencana('Reguler: ${angka(r['reguler'])}'),
                Lencana('Flexi: ${angka(r['flexi'])}'),
                Lencana('Belum ada layanan: ${angka(r['tanpaLayanan'])}', warna: angka(r['tanpaLayanan']) > 0 ? Colors.orange : Colors.green),
              ]),
              const SizedBox(height: 8),
              Text('Unit dan layanan adalah label pada siswa. Rombel, materi, soal, dan keuangan tetap terpusat. '
                  'Atur label siswa di tab Siswa.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            ]),
          ),
        ),
        JudulBagian('Daftar unit', sub: '${unit.length} unit'),
        if (unit.isEmpty) const Kosong(pesan: 'Belum ada unit belajar. Ketuk "Tambah unit".', ikon: Icons.place_outlined),
        for (final u in unit)
          Card(
            child: ListTile(
              leading: Icon(Icons.place_rounded, color: u['aktif'] == true ? cs.primary : cs.outline),
              title: Text(teks(u['nama']), style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text([
                '${angka(u['jumlah'])} siswa',
                daftar(u['namaKoordinator']).isEmpty ? 'belum ada koordinator' : 'koordinator: ${daftar(u['namaKoordinator']).join(', ')}',
                if (teks(u['alamat']).isNotEmpty) teks(u['alamat']),
                if (teks(u['ket']).isNotEmpty) teks(u['ket']),
              ].join(' · ')),
              trailing: u['aktif'] != true
                  ? const Lencana('Nonaktif', warna: Colors.grey)
                  : (u['utama'] == true ? const Lencana('Utama', warna: Colors.teal) : const Icon(Icons.edit_outlined)),
              onTap: Sesi.instance.hanyaLihat ? null : () => _form(context, u),
            ),
          ),
      ]),
      if (!Sesi.instance.hanyaLihat)
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton.extended(onPressed: () => _form(context), icon: const Icon(Icons.add_location_alt_outlined), label: const Text('Tambah unit')),
        ),
    ]);
  }
}

class _DialogUnit extends StatefulWidget {
  const _DialogUnit({this.u, required this.calon});
  final Map<String, dynamic>? u;
  final List<Map<String, dynamic>> calon;

  @override
  State<_DialogUnit> createState() => _DialogUnitState();
}

class _DialogUnitState extends State<_DialogUnit> {
  late final _nama = TextEditingController(text: teks(widget.u?['nama']));
  late final _alamat = TextEditingController(text: teks(widget.u?['alamat']));
  late final _ket = TextEditingController(text: teks(widget.u?['ket']));
  late bool _aktif = widget.u == null || widget.u!['aktif'] == true;
  late bool _utama = widget.u?['utama'] == true;
  late final Set<String> _koord = {for (final k in daftar(widget.u?['koordinator'])) '$k'};

  @override
  void dispose() {
    for (final c in [_nama, _alamat, _ket]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _simpan() async {
    if (_nama.text.trim().length < 2) return kabar(context, 'Isi nama unit.', galat: true);
    final r = await jalankan(
      context,
      () => Api.instance('waStafUnitSimpan', [_t, {'id': teks(widget.u?['id']), 'nama': _nama.text.trim(), 'alamat': _alamat.text.trim(), 'ket': _ket.text.trim(), 'aktif': _aktif, 'koordinator': _koord.toList(), 'utama': _utama}]),
      teksProses: 'Menyimpan...',
    );
    if (r.ok && mounted) {
      kabar(context, 'Unit disimpan.');
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.u == null ? 'Tambah unit belajar' : 'Ubah unit belajar'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: _nama, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nama unit', hintText: 'mis. Unit 1 Cibinong')),
          const SizedBox(height: 8),
          TextField(controller: _alamat, decoration: const InputDecoration(labelText: 'Alamat (opsional)')),
          const SizedBox(height: 8),
          TextField(controller: _ket, maxLines: 2, decoration: const InputDecoration(labelText: 'Keterangan (opsional)')),
          const SizedBox(height: 12),
          Align(alignment: Alignment.centerLeft, child: Text('Koordinator unit', style: Theme.of(context).textTheme.labelLarge)),
          const SizedBox(height: 6),
          if (widget.calon.isEmpty)
            Text('Belum ada pengguna berperan Koordinator Unit. Tambahkan di menu Kelola Pengguna.',
                style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant))
          else
            Wrap(spacing: 6, runSpacing: 6, children: [
              for (final c in widget.calon)
                FilterChip(
                  label: Text(teks(c['nama'])),
                  selected: _koord.contains(teks(c['id'])),
                  onSelected: (v) => setState(() => v ? _koord.add(teks(c['id'])) : _koord.remove(teks(c['id']))),
                ),
            ]),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _utama,
            onChanged: (v) => setState(() => _utama = v),
            title: const Text('Unit utama'),
            subtitle: const Text('Siswa yang belum berlabel unit dianggap anggota unit ini. Hanya satu unit utama.'),
          ),
          if (widget.u != null)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _aktif,
              onChanged: (v) => setState(() => _aktif = v),
              title: const Text('Unit aktif'),
              subtitle: const Text('Unit nonaktif tidak bisa dipilih. Pindahkan siswanya dulu.'),
            ),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(onPressed: _simpan, child: const Text('Simpan')),
      ],
    );
  }
}

// ───────────────────────── tab siswa ─────────────────────────

const _semua = '*', _kosong = '-';

class _Saringan {
  String cari = '', rombel = _semua, unit = _semua, layanan = _semua;
}

class _TabSiswa extends StatefulWidget {
  const _TabSiswa({required this.d, required this.muatUlang, required this.f});
  final Map<String, dynamic> d;
  final VoidCallback muatUlang;
  final _Saringan f;

  @override
  State<_TabSiswa> createState() => _TabSiswaState();
}

class _TabSiswaState extends State<_TabSiswa> {
  final Set<String> _pilih = {};
  late final _cariC = TextEditingController(text: widget.f.cari);
  _Saringan get _f => widget.f;

  @override
  void dispose() {
    _cariC.dispose();
    super.dispose();
  }

  Map<String, String> get _namaUnit => {for (final u in daftar(widget.d['unit']).map(peta)) teks(u['id']): teks(u['nama'])};

  List<Map<String, dynamic>> _saring(List<Map<String, dynamic>> siswa) {
    final q = _f.cari.toLowerCase();
    return siswa.where((s) {
      if (q.isNotEmpty && !teks(s['nama']).toLowerCase().contains(q) && !teks(s['nisn']).contains(q)) return false;
      if (_f.rombel != _semua && teks(s['idRombel']) != _f.rombel) return false;
      if (_f.unit != _semua && (_f.unit == _kosong ? teks(s['unit']).isNotEmpty : teks(s['unit']) != _f.unit)) return false;
      if (_f.layanan != _semua && (_f.layanan == _kosong ? teks(s['layanan']).isNotEmpty : teks(s['layanan']) != _f.layanan)) return false;
      return true;
    }).toList();
  }

  Future<void> _terapkan() async {
    final unit = daftar(widget.d['unit']).map(peta).where((u) => u['aktif'] == true).toList();
    final hasil = await showDialog<Map<String, dynamic>>(context: context, builder: (_) => _DialogTerapkan(jumlah: _pilih.length, unit: unit));
    if (hasil == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafUnitTetapkan', [_t, {...hasil, 'ids': _pilih.toList()}]), teksProses: 'Menyimpan label...');
    if (!r.ok || !mounted) return;
    final d = peta(r.data);
    final lewat = daftar(d['lewat']);
    setState(_pilih.clear);
    kabar(context, '${angka(d['diubah'])} siswa diperbarui${angka(d['sama']) > 0 ? ', ${angka(d['sama'])} sudah sesuai' : ''}${lewat.isNotEmpty ? ', ${lewat.length} dilewati' : ''}.');
    widget.muatUlang();
  }

  Future<void> _riwayat(Map<String, dynamic> s) async {
    final r = await jalankan(context, () => Api.instance('waStafUnitRiwayat', [_t, teks(s['id'])]), teksProses: 'Memuat riwayat...');
    if (!r.ok || !mounted) return;
    final list = daftar(r.data).map(peta).toList();
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(teks(s['nama'])),
        content: SizedBox(
          width: double.maxFinite,
          child: list.isEmpty
              ? const Text('Belum ada riwayat perubahan unit atau layanan.')
              : ListView(shrinkWrap: true, children: [
                  for (final x in list)
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text('Unit: ${teks(x['unitLama'])} → ${teks(x['unitBaru'])}\nLayanan: ${teks(x['layananLama'])} → ${teks(x['layananBaru'])}'),
                      subtitle: Text('${teks(x['waktu'])} · ${teks(x['oleh'])}${teks(x['catatan']).isNotEmpty ? '\n${teks(x['catatan'])}' : ''}'),
                    ),
                ]),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup'))],
      ),
    );
  }

  Widget _saringan(String label, String nilai, List<DropdownMenuItem<String>> item, ValueChanged<String> ubah) => DropdownButtonFormField<String>(
        isExpanded: true,
        initialValue: nilai,
        decoration: InputDecoration(labelText: label, isDense: true),
        items: item,
        onChanged: (v) => setState(() {
          ubah(v ?? _semua);
          _pilih.clear();
        }),
      );

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final siswa = daftar(widget.d['siswa']).map(peta).toList();
    final namaUnit = _namaUnit;
    final rombel = <String, String>{for (final s in siswa) teks(s['idRombel']): teks(s['namaRombel'])};
    final hasil = _saring(siswa);
    final semuaDipilih = hasil.isNotEmpty && hasil.every((s) => _pilih.contains(teks(s['id'])));
    final bisaUbah = !Sesi.instance.hanyaLihat;
    return Column(children: [
      Container(
        color: cs.surfaceContainerLowest,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
        child: Column(children: [
          TextField(
            controller: _cariC,
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Cari nama atau NISN', isDense: true),
            onChanged: (v) => setState(() => _f.cari = v.trim()),
          ),
          const SizedBox(height: 8),
          _saringan('Rombel', _f.rombel, [
            const DropdownMenuItem(value: _semua, child: Text('Semua rombel')),
            for (final e in (rombel.entries.toList()..sort((a, b) => a.value.compareTo(b.value)))) DropdownMenuItem(value: e.key, child: Text(e.value, overflow: TextOverflow.ellipsis)),
          ], (v) => _f.rombel = v),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: _saringan('Unit', _f.unit, [
                const DropdownMenuItem(value: _semua, child: Text('Semua')),
                const DropdownMenuItem(value: _kosong, child: Text('Belum ada unit')),
                for (final e in namaUnit.entries) DropdownMenuItem(value: e.key, child: Text(e.value, overflow: TextOverflow.ellipsis)),
              ], (v) => _f.unit = v),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _saringan('Layanan', _f.layanan, const [
                DropdownMenuItem(value: _semua, child: Text('Semua')),
                DropdownMenuItem(value: 'Reguler', child: Text('Reguler')),
                DropdownMenuItem(value: 'Flexi', child: Text('Flexi')),
                DropdownMenuItem(value: _kosong, child: Text('Belum ada layanan')),
              ], (v) => _f.layanan = v),
            ),
          ]),
          if (bisaUbah)
            CheckboxListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: semuaDipilih,
              onChanged: hasil.isEmpty
                  ? null
                  : (v) => setState(() {
                        for (final s in hasil) {
                          v == true ? _pilih.add(teks(s['id'])) : _pilih.remove(teks(s['id']));
                        }
                      }),
              title: Text('Pilih semua hasil (${hasil.length} siswa)'),
            ),
        ]),
      ),
      Expanded(
        child: hasil.isEmpty
            ? const Kosong(pesan: 'Tidak ada siswa yang cocok.', ikon: Icons.person_search_outlined)
            : ListView.builder(
                padding: const EdgeInsets.only(bottom: 88),
                itemCount: hasil.length,
                itemBuilder: (c, i) {
                  final s = hasil[i];
                  final id = teks(s['id']);
                  final u = namaUnit[teks(s['unit'])] ?? '';
                  final l = teks(s['layanan']);
                  return CheckboxListTile(
                    dense: true,
                    controlAffinity: ListTileControlAffinity.leading,
                    value: _pilih.contains(id),
                    onChanged: bisaUbah ? (v) => setState(() => v == true ? _pilih.add(id) : _pilih.remove(id)) : null,
                    title: Text(teks(s['nama'])),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                        Text(teks(s['namaRombel']), style: const TextStyle(fontSize: 12)),
                        Lencana(u.isEmpty ? 'Belum ada unit' : u, warna: u.isEmpty ? Colors.orange : null),
                        Lencana(l.isEmpty ? 'Belum ada layanan' : l, warna: l.isEmpty ? Colors.orange : (l == 'Flexi' ? Colors.teal : Colors.indigo)),
                      ]),
                    ),
                    secondary: IconButton(tooltip: 'Riwayat', icon: const Icon(Icons.history_rounded), onPressed: () => _riwayat(s)),
                  );
                },
              ),
      ),
      if (_pilih.isNotEmpty && bisaUbah)
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(children: [
              TextButton(onPressed: () => setState(_pilih.clear), child: const Text('Batal pilih')),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _terapkan,
                  icon: const Icon(Icons.label_outline_rounded),
                  label: Text('Atur ${_pilih.length} siswa'),
                ),
              ),
            ]),
          ),
        ),
    ]);
  }
}

// Pilihan: null = tidak diubah, '' = kosongkan, selain itu nilai baru.
class _DialogTerapkan extends StatefulWidget {
  const _DialogTerapkan({required this.jumlah, required this.unit});
  final int jumlah;
  final List<Map<String, dynamic>> unit;

  @override
  State<_DialogTerapkan> createState() => _DialogTerapkanState();
}

class _DialogTerapkanState extends State<_DialogTerapkan> {
  static const _tetap = '=';
  String _unit = _tetap, _layanan = _tetap;
  final _catatan = TextEditingController();

  @override
  void dispose() {
    _catatan.dispose();
    super.dispose();
  }

  dynamic _nilai(String v) => v == _tetap ? null : (v == _kosong ? '' : v);

  @override
  Widget build(BuildContext context) {
    final berubah = _unit != _tetap || _layanan != _tetap;
    return AlertDialog(
      title: Text('Atur ${widget.jumlah} siswa'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _unit,
            decoration: const InputDecoration(labelText: 'Unit belajar'),
            items: [
              const DropdownMenuItem(value: _tetap, child: Text('Tidak diubah')),
              for (final u in widget.unit) DropdownMenuItem(value: teks(u['id']), child: Text(teks(u['nama']), overflow: TextOverflow.ellipsis)),
              const DropdownMenuItem(value: _kosong, child: Text('Kosongkan unit')),
            ],
            onChanged: (v) => setState(() => _unit = v ?? _tetap),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _layanan,
            decoration: const InputDecoration(labelText: 'Layanan'),
            items: const [
              DropdownMenuItem(value: _tetap, child: Text('Tidak diubah')),
              DropdownMenuItem(value: 'Reguler', child: Text('Setara Reguler')),
              DropdownMenuItem(value: 'Flexi', child: Text('Setara Flexi')),
              DropdownMenuItem(value: _kosong, child: Text('Kosongkan layanan')),
            ],
            onChanged: (v) => setState(() => _layanan = v ?? _tetap),
          ),
          const SizedBox(height: 10),
          TextField(controller: _catatan, decoration: const InputDecoration(labelText: 'Catatan (opsional)', hintText: 'mis. pindah domisili')),
          const SizedBox(height: 8),
          Text('Setiap perubahan tercatat di riwayat siswa.', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(
          onPressed: berubah ? () => Navigator.pop(context, {'unit': _nilai(_unit), 'layanan': _nilai(_layanan), 'catatan': _catatan.text.trim()}) : null,
          child: const Text('Simpan'),
        ),
      ],
    );
  }
}

// ───────────────────────── impor dari Excel ─────────────────────────

Future<void> _unduhTemplat(BuildContext context, {required bool hanyaKosong}) async {
  final r = await jalankan(context, () async => peta(await Api.instance('waStafUnitTemplat', [_t, {'hanyaKosong': hanyaKosong}], const Duration(minutes: 3))),
      teksProses: 'Menyiapkan templat...');
  if (!r.ok || r.data == null || !context.mounted) return;
  await bagikanXlsx(context, base64Decode(teks(r.data!['b64'])), teks(r.data!['nama'], 'Label_Unit_Siswa.xlsx'));
}

/// Unggah templat terisi: pratinjau -> terapkan. true bila ada yang disimpan.
Future<bool> _unggahLabel(BuildContext context) async {
  final f = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['xlsx'], withData: true);
  if (f == null || f.files.isEmpty || !context.mounted) return false;
  final x = f.files.first;
  if (x.size > 4 * 1048576) {
    kabar(context, 'File terlalu besar (maksimal 4 MB).', galat: true);
    return false;
  }
  final Uint8List b = x.bytes ?? (x.path != null ? await File(x.path!).readAsBytes() : Uint8List(0));
  if (!context.mounted) return false;
  final h = await jalankan(context, () async => peta(await Api.instance('waStafUnitImporPratinjau', [_t, {'b64': base64Encode(b)}], const Duration(minutes: 3))),
      teksProses: 'Memeriksa file...');
  if (!h.ok || h.data == null || !context.mounted) return false;
  final p = h.data!;
  final j = peta(p['jumlah']);
  final ubah = daftar(p['ubah']).map(peta).toList();
  final galat = daftar(p['galat']).map(peta).toList();
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: const Text('Pratinjau impor label'),
      content: SizedBox(
        width: double.maxFinite,
        child: ListView(shrinkWrap: true, children: [
          Text('${angka(j['ubah'])} siswa akan diperbarui · ${angka(j['sama'])} sudah sesuai · ${angka(j['kosong'])} baris kosong (tidak diubah)',
              style: const TextStyle(fontWeight: FontWeight.w700)),
          if (ubah.isNotEmpty) ...[
            const SizedBox(height: 8),
            for (final u in ubah.take(60))
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('• ${teks(u['nama'])}: unit ${teks(u['unit'])}, layanan ${teks(u['layanan'])}', style: const TextStyle(fontSize: 12)),
              ),
            if (ubah.length > 60) Text('… dan ${ubah.length - 60} lainnya', style: const TextStyle(fontSize: 12)),
          ],
          if (galat.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text('Tidak diproses (${angka(j['galat'])}):', style: TextStyle(color: Theme.of(c).colorScheme.error, fontWeight: FontWeight.w700)),
            for (final g in galat) Text('• Baris ${angka(g['baris'])} ${teks(g['nama'])}: ${teks(g['alasan'])}', style: const TextStyle(fontSize: 12)),
          ],
          const SizedBox(height: 8),
          const Text('Setiap perubahan tercatat di riwayat siswa dengan catatan "Impor Excel".', style: TextStyle(fontSize: 12)),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
        FilledButton(onPressed: ubah.isEmpty ? null : () => Navigator.pop(c, true), child: Text('Terapkan ${angka(j['ubah'])} perubahan')),
      ],
    ),
  );
  if (ok != true || !context.mounted) return false;
  final s = await jalankan(context, () async => peta(await Api.instance('waStafUnitImporTerapkan', [_t, teks(p['kunci'])], const Duration(minutes: 3))), teksProses: 'Menyimpan...');
  if (!s.ok || s.data == null || !context.mounted) return false;
  kabar(context, '${angka(s.data!['diubah'])} siswa diperbarui dari Excel.');
  return true;
}
