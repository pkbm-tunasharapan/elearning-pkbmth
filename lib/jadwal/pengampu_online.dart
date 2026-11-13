import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// v1.73.0: Penugasan tutor per unit. Tutor Online per rombel × mapel × unit (bawaan "semua unit" + pengecualian per unit):
/// menilai siswa unit penugasannya & namanya di leger mapel unit itu. Tutor Tatap Muka diambil dari jadwal mingguan per unit.
/// Materi, tugas, dan soal disusun Admin, Kepala Sekolah, Koordinator Kurikulum.
class PengampuOnlineTab extends StatefulWidget {
  const PengampuOnlineTab({super.key});

  @override
  State<PengampuOnlineTab> createState() => _PengampuOnlineTabState();
}

class _PengampuOnlineTabState extends State<PengampuOnlineTab> {
  int _v = 0;
  String _cari = '';
  String _saring = '';   // '' | 'online' | 'tatap'
  bool _pilihMode = false;
  final Set<String> _pilih = {};

  String _kunci(Map<String, dynamic> x) => '${teks(x['idRombel'])}|${teks(x['kodeMapel'])}';

  Future<Map<String, dynamic>?> _pilihTutor(List<Map<String, dynamic>> tutor, String judul, {String teksKosong = 'Kosongkan'}) async {
    var q = '';
    return showDialog<Map<String, dynamic>>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, atur) {
          final daftarT = tutor.where((t) => q.isEmpty || teks(t['nama']).toLowerCase().contains(q)).toList();
          return AlertDialog(
            title: Text(judul, style: const TextStyle(fontSize: 17)),
            content: SizedBox(
              width: 420,
              height: 420,
              child: Column(children: [
                TextField(
                  autofocus: true,
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari tutor', isDense: true),
                  onChanged: (v) => atur(() => q = v.trim().toLowerCase()),
                ),
                const SizedBox(height: 6),
                Expanded(
                  child: ListView(children: [
                    ListTile(leading: const Icon(Icons.person_off_outlined), title: Text(teksKosong), onTap: () => Navigator.pop(c, const {'id': '', 'nama': ''})),
                    for (final t in daftarT)
                      ListTile(
                        leading: const Icon(Icons.person_rounded),
                        title: Text(teks(t['nama'])),
                        subtitle: Text(teks(t['id']), style: const TextStyle(fontSize: 11)),
                        onTap: () => Navigator.pop(c, t),
                      ),
                  ]),
                ),
              ]),
            ),
            actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Batal'))],
          );
        },
      ),
    );
  }

  /// Pilih unit untuk penetapan massal: '' = semua unit (bawaan).
  Future<String?> _pilihUnit(List<Map<String, dynamic>> unit) => showDialog<String>(
        context: context,
        builder: (c) => SimpleDialog(title: const Text('Berlaku untuk'), children: [
          SimpleDialogOption(onPressed: () => Navigator.pop(c, ''), child: const Text('Semua unit (tutor bawaan)')),
          for (final u in unit) SimpleDialogOption(onPressed: () => Navigator.pop(c, teks(u['id'])), child: Text('Unit ${teks(u['nama'])} saja')),
        ]),
      );

  Future<void> _simpan(List<Map<String, dynamic>> baris, String pesanOk) async {
    if (baris.isEmpty) return;
    final r = await jalankan(context, () async => peta(await Api.instance('waStafPengampuSimpan', [_t, baris], const Duration(minutes: 3))), teksProses: 'Menyimpan penugasan...');
    if (!r.ok || !mounted) return;
    final tanpa = daftar(r.data!['tanpaAkun']).map((e) => teks(e)).toList();
    kabar(context, '$pesanOk${tanpa.isEmpty ? '' : ' Catatan: ${tanpa.join(', ')} belum punya akun Tutor aktif (atau tugas tambahan Tutor), jadi belum bisa membuka mapelnya.'}');
    setState(() {
      _pilih.clear();
      _pilihMode = false;
      _v++;
    });
  }

  Future<void> _ubahSatu(Map<String, dynamic> k, String unit, String namaUnit, List<Map<String, dynamic>> tutor) async {
    final t = await _pilihTutor(tutor, 'Tutor Online · ${teks(k['namaMapel'])} ${teks(k['namaRombel'])} · ${unit.isEmpty ? 'semua unit' : namaUnit}',
        teksKosong: unit.isEmpty ? 'Kosongkan tutor bawaan' : 'Ikuti tutor bawaan (hapus pengecualian unit)');
    if (t == null || !mounted) return;
    await _simpan([{'idRombel': teks(k['idRombel']), 'kodeMapel': teks(k['kodeMapel']), 'unit': unit, 'idTutor': teks(t['id'])}],
        teks(t['id']).isEmpty ? 'Penugasan diperbarui.' : '${teks(t['nama'])} menjadi Tutor Online ${unit.isEmpty ? 'semua unit' : 'unit $namaUnit'}.');
  }

  Future<void> _ubahBanyak(List<Map<String, dynamic>> kelas, List<Map<String, dynamic>> unit, List<Map<String, dynamic>> tutor) async {
    final u = await _pilihUnit(unit);
    if (u == null || !mounted) return;
    final nmU = u.isEmpty ? 'semua unit' : 'unit ${teks(unit.firstWhere((x) => teks(x['id']) == u)['nama'])}';
    final t = await _pilihTutor(tutor, 'Tutor Online ${kelas.length} kelas · $nmU', teksKosong: u.isEmpty ? 'Kosongkan tutor bawaan' : 'Ikuti tutor bawaan');
    if (t == null || !mounted) return;
    await _simpan(kelas.map((k) => {'idRombel': teks(k['idRombel']), 'kodeMapel': teks(k['kodeMapel']), 'unit': u, 'idTutor': teks(t['id'])}).toList(),
        '${kelas.length} kelas diperbarui ($nmU).');
  }

  Future<void> _templat() async {
    final r = await jalankan(context, () async => peta(await Api.instance('waStafPengampuTemplat', [_t], const Duration(minutes: 3))), teksProses: 'Menyiapkan templat...');
    if (!r.ok || r.data == null || !mounted) return;
    await bagikanXlsx(context, base64Decode(teks(r.data!['b64'])), teks(r.data!['nama'], 'Templat_Penugasan_Online.xlsx'));
  }

  Future<void> _unggah() async {
    final f = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['xlsx'], withData: true);
    if (f == null || f.files.isEmpty || !mounted) return;
    final x = f.files.first;
    if (x.size > 4 * 1048576) {
      kabar(context, 'File terlalu besar (maksimal 4 MB).', galat: true);
      return;
    }
    final Uint8List b = x.bytes ?? (x.path != null ? await File(x.path!).readAsBytes() : Uint8List(0));
    if (!mounted) return;
    final h = await jalankan(context, () async => peta(await Api.instance('waStafPengampuImporPratinjau', [_t, {'b64': base64Encode(b)}], const Duration(minutes: 3))),
        teksProses: 'Memeriksa berkas...');
    if (!h.ok || h.data == null || !mounted) return;
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _PratinjauPengampu(p: h.data!)));
    if (ok != true || !mounted) return;
    final s = await jalankan(context, () async => peta(await Api.instance('waStafPengampuImporTerapkan', [_t, teks(h.data!['kunci'])], const Duration(minutes: 3))),
        teksProses: 'Menyimpan penugasan...');
    if (!s.ok || !mounted) return;
    final tanpa = daftar(s.data!['tanpaAkun']).map((e) => teks(e)).toList();
    kabar(context, '${angka(s.data!['diubah'])} penugasan diperbarui.${tanpa.isEmpty ? '' : ' Belum punya akun Tutor: ${tanpa.join(', ')}.'}');
    setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      key: ValueKey('pgo|$_v'),
      muat: () async => peta(await Api.instance('waStafPengampuDaftar', [_t], const Duration(minutes: 2))),
      bangun: (context, d, segarkan) {
        final ubah = d['ubah'] == true;
        final tutor = daftar(d['tutor']).map(peta).toList();
        final unit = daftar(d['unit']).map(peta).toList();
        final semua = daftar(d['item']).map(peta).toList();
        final kurang = peta(d['kurang']);
        bool kurangOnline(Map<String, dynamic> x) => daftar(x['unit']).map(peta).any((u) => u['adaSiswa'] == true && teks(u['idOnline']).isEmpty);
        bool kurangTatap(Map<String, dynamic> x) => daftar(x['unit']).map(peta).any((u) => u['adaSiswa'] == true && daftar(u['tatapMuka']).isEmpty);
        final q = _cari.toLowerCase();
        final list = semua.where((x) {
          if (_saring == 'online' && !kurangOnline(x)) return false;
          if (_saring == 'tatap' && !kurangTatap(x)) return false;
          final nama = daftar(x['unit']).map(peta).map((u) => '${teks(u['online'])} ${daftar(u['tatapMuka']).join(' ')}').join(' ');
          return q.isEmpty || '${teks(x['namaMapel'])} ${teks(x['namaRombel'])} ${teks(x['semua'])} $nama'.toLowerCase().contains(q);
        }).toList()
          ..sort((a, b) => '${teks(a['namaRombel'])}|${teks(a['namaMapel'])}'.compareTo('${teks(b['namaRombel'])}|${teks(b['namaMapel'])}'));
        final grup = <String, List<Map<String, dynamic>>>{};
        for (final x in list) {
          grup.putIfAbsent(teks(x['namaRombel'], '-'), () => []).add(x);
        }
        return Scaffold(
          floatingActionButton: _pilihMode && _pilih.isNotEmpty
              ? FloatingActionButton.extended(
                  onPressed: () => _ubahBanyak(semua.where((x) => _pilih.contains(_kunci(x))).toList(), unit, tutor),
                  icon: const Icon(Icons.person_add_alt_1_rounded),
                  label: Text('Tetapkan tutor (${_pilih.length})'),
                )
              : null,
          body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 96), children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Tutor Online menilai diskusi & nilai siswa di unit penugasannya, dan namanya tercetak di leger mapel unit itu. '
                      'Tutor bawaan berlaku untuk semua unit; tiap unit boleh punya Tutor Online sendiri. Tutor tatap muka diambil dari jadwal mingguan per unit. '
                      'Materi, tugas, dan soal disusun Admin, Kepala Sekolah, dan Koordinator Kurikulum.',
                      style: TextStyle(fontSize: 12.5)),
                  const SizedBox(height: 8),
                  Text('${semua.length} kelas · ${angka(kurang['online'])} unit belum punya Tutor Online · ${angka(kurang['tatapMuka'])} unit belum berjadwal tatap muka',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  if (ubah) ...[
                    const SizedBox(height: 8),
                    Wrap(spacing: 8, runSpacing: 6, children: [
                      OutlinedButton.icon(onPressed: _templat, icon: const Icon(Icons.download_rounded, size: 18), label: const Text('Unduh templat')),
                      OutlinedButton.icon(onPressed: _unggah, icon: const Icon(Icons.upload_file_rounded, size: 18), label: const Text('Unggah templat')),
                      TextButton.icon(
                        onPressed: () => setState(() {
                          _pilihMode = !_pilihMode;
                          _pilih.clear();
                        }),
                        icon: Icon(_pilihMode ? Icons.close_rounded : Icons.checklist_rounded, size: 18),
                        label: Text(_pilihMode ? 'Selesai memilih' : 'Pilih beberapa kelas'),
                      ),
                    ]),
                  ],
                ]),
              ),
            ),
            const SizedBox(height: 6),
            TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari mapel, rombel, atau tutor', isDense: true),
              onChanged: (v) => setState(() => _cari = v.trim()),
            ),
            const SizedBox(height: 6),
            Wrap(spacing: 6, children: [
              ChoiceChip(label: const Text('Semua'), selected: _saring.isEmpty, onSelected: (_) => setState(() => _saring = '')),
              ChoiceChip(label: const Text('Kurang Tutor Online'), selected: _saring == 'online', onSelected: (_) => setState(() => _saring = 'online')),
              ChoiceChip(label: const Text('Kurang jadwal tatap muka'), selected: _saring == 'tatap', onSelected: (_) => setState(() => _saring = 'tatap')),
            ]),
            if (list.isEmpty) const Kosong(pesan: 'Tidak ada kelas yang cocok.', ikon: Icons.class_outlined),
            for (final e in grup.entries) ...[
              JudulBagian(e.key, sub: '${e.value.length} mapel'),
              for (final x in e.value)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      ListTile(
                        dense: true,
                        leading: _pilihMode
                            ? Checkbox(value: _pilih.contains(_kunci(x)), onChanged: (v) => setState(() => v == true ? _pilih.add(_kunci(x)) : _pilih.remove(_kunci(x))))
                            : const Icon(Icons.menu_book_rounded),
                        title: Text(teks(x['namaMapel']), style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text('Tutor Online bawaan (semua unit): ${teks(x['semua'], 'belum ada')}'),
                        trailing: ubah && !_pilihMode ? const Icon(Icons.edit_rounded, size: 18) : null,
                        onTap: !ubah ? null : (_pilihMode ? () => setState(() => _pilih.contains(_kunci(x)) ? _pilih.remove(_kunci(x)) : _pilih.add(_kunci(x))) : () => _ubahSatu(x, '', '', tutor)),
                      ),
                      for (final u in daftar(x['unit']).map(peta))
                        InkWell(
                          onTap: !ubah || _pilihMode ? null : () => _ubahSatu(x, teks(u['unit']), teks(u['namaUnit']), tutor),
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              SizedBox(width: 92, child: Text(teks(u['namaUnit']), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5))),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text('Online: ${teks(u['online'], 'belum ada')}${u['khusus'] == true ? ' (khusus unit)' : ''}',
                                      style: TextStyle(fontSize: 12.5, color: u['adaSiswa'] == true && teks(u['idOnline']).isEmpty ? cs.error : null)),
                                  Text('Tatap muka: ${daftar(u['tatapMuka']).isEmpty ? 'belum ada jadwal' : daftar(u['tatapMuka']).join(', ')}',
                                      style: TextStyle(fontSize: 12, color: u['adaSiswa'] == true && daftar(u['tatapMuka']).isEmpty ? Colors.orange.shade800 : cs.onSurfaceVariant)),
                                  if (u['adaSiswa'] != true) Text('Belum ada siswa di unit ini', style: TextStyle(fontSize: 11.5, color: cs.outline)),
                                ]),
                              ),
                            ]),
                          ),
                        ),
                    ]),
                  ),
                ),
            ],
          ]),
        );
      },
    );
  }
}

class _PratinjauPengampu extends StatelessWidget {
  const _PratinjauPengampu({required this.p});
  final Map<String, dynamic> p;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final j = peta(p['jumlah']);
    final item = daftar(p['item']).map(peta).toList();
    final galat = daftar(p['galat']).map(peta).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Pratinjau penugasan online')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 100), children: [
        Card(
          color: galat.isEmpty ? cs.primaryContainer : cs.errorContainer,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Text('${angka(j['siap'])} kelas berubah · ${angka(j['sama'])} tetap · ${angka(j['galat'])} baris bermasalah (dilewati)',
                style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
        ),
        if (galat.isNotEmpty) ...[
          JudulBagian('Baris bermasalah'),
          Card(
            child: Column(children: [
              for (final g in galat)
                ListTile(dense: true, leading: Icon(Icons.error_outline_rounded, color: cs.error), title: Text('Baris ${angka(g['baris'])}'), subtitle: Text(teks(g['alasan']))),
            ]),
          ),
        ],
        if (item.isNotEmpty) ...[
          JudulBagian('Akan diubah', sub: '${item.length} kelas'),
          Card(
            child: Column(children: [
              for (final x in item)
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.swap_horiz_rounded, color: Colors.green),
                  title: Text('${teks(x['namaMapel'])} · ${teks(x['namaRombel'])} · ${teks(x['namaUnit'])}'),
                  subtitle: Text('${teks(x['lama'], 'kosong')} → ${teks(x['baru'], 'kosong')}'),
                ),
            ]),
          ),
        ],
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            onPressed: item.isEmpty ? null : () => Navigator.pop(context, true),
            icon: const Icon(Icons.save_rounded),
            label: Text(item.isEmpty ? 'Tidak ada perubahan' : 'Simpan ${item.length} perubahan'),
          ),
        ),
      ),
    );
  }
}
