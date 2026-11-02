import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

Color _warnaStatus(String st) => switch (st) {
      'Disetujui' => Colors.green,
      'Draf' => const Color(0xFFE9A23B),
      'Belum ada' => Colors.grey,
      _ => const Color(0xFF3B82F6),
    };

/// Menu admin "CP · TP · ATP" (Kerangka kurikulum), sama dengan kfGambarDaftar_ di web.
class KerangkaScreen extends StatefulWidget {
  const KerangkaScreen({super.key});

  @override
  State<KerangkaScreen> createState() => _KerangkaScreenState();
}

class _KerangkaScreenState extends State<KerangkaScreen> {
  int _v = 0;
  String _cari = '';

  Future<void> _setujuiSemua(String nm, List<Map<String, dynamic>> arr) async {
    final fase = arr.map((x) => teks(x['fase'], '-')).join(', ');
    if (!await konfirmasi(context, 'Setujui semua fase?',
        'Setujui draf $nm di fase $fase dan pakai untuk tutor? Kerangka lama yang sudah disetujui pada fase itu akan diganti.',
        ya: 'Setujui')) {
      return;
    }
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminKerangkaSetujuiSemua', [_t, teks(arr.first['kunci'])]));
    if (r.ok && mounted) {
      kabar(context, teks(peta(r.data)['pesan'], 'Disetujui.'));
      setState(() => _v++);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waAdminKerangkaDaftar', [_t])),
      bangun: (context, d, _) {
        final cs = Theme.of(context).colorScheme;
        final item = daftar(d['item']).map(peta).toList();
        final q = _cari.toLowerCase().trim();
        final perMapel = <String, List<Map<String, dynamic>>>{};
        for (final x in item) {
          if (angka(x['jumlahTpDraf']) > 0) perMapel.putIfAbsent(teks(x['mapel']), () => []).add(x);
        }
        final tampil = item.where((x) => q.isEmpty || '${teks(x['mapel'])} fase ${teks(x['fase'])} ${daftar(x['rombel']).join(' ')} ${teks(x['status'])}'.toLowerCase().contains(q)).toList();
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Kerangka kurikulum: CP · TP · ATP', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 4),
                Text(
                  'Tetapkan Capaian Pembelajaran (CP), Tujuan Pembelajaran (TP), dan Alur TP (ATP) satu kali untuk tiap mata pelajaran dan fase. Unggah PDF sumber '
                  '(mis. Panduan Mata Pelajaran), AI menyusunnya, Anda memeriksa lalu menyetujui. Yang disetujui otomatis dipakai tutor: CP terisi di RPP dan TP resmi dipakai saat menyusun rencana sesi.',
                  style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
                ),
                if (d['siapAi'] != true)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text('Kunci Gemini belum diisi (menu Pengaturan AI). Anda tetap bisa memakai mode manual lewat Gemini web atau mengetik sendiri.',
                        style: TextStyle(fontSize: 12.5, color: cs.error)),
                  ),
              ]),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Cari mata pelajaran atau fase...'),
            onChanged: (v) => setState(() => _cari = v),
          ),
          const SizedBox(height: 8),
          for (final e in perMapel.entries)
            if (e.value.length >= 2)
              Card(
                color: cs.primaryContainer,
                child: ListTile(
                  title: Text('${e.key}: draf siap di ${e.value.length} fase', style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text('Fase ${e.value.map((x) => teks(x['fase'], '-')).join(', ')}. Periksa dulu bila perlu, lalu setujui semuanya sekaligus.'),
                  trailing: FilledButton(onPressed: () => _setujuiSemua(e.key, e.value), child: const Text('Setujui semua')),
                ),
              ),
          if (tampil.isEmpty) Kosong(pesan: item.isEmpty ? 'Belum ada mata pelajaran aktif. Tambahkan dulu lewat menu Kelola Mata Pelajaran.' : 'Tidak ada yang cocok.'),
          Card(
            child: Column(children: [
              for (final x in tampil)
                ListTile(
                  title: Text('${teks(x['mapel'])}${teks(x['fase']).isNotEmpty ? ' · Fase ${teks(x['fase'])}' : ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(() {
                    var ket = '${daftar(x['kelas']).isNotEmpty ? 'Satu kerangka untuk Kelas ${daftar(x['kelas']).join(' dan ')} · ' : ''}${daftar(x['rombel']).length} rombel';
                    if (angka(x['jumlahTp']) > 0) {
                      ket += ' · ${angka(x['jumlahCp'])} CP, ${angka(x['jumlahTp'])} TP dipakai tutor';
                    } else if (x['cpSudahAda'] == true) {
                      ket += ' · CP sudah ada di Identitas_CP, belum ada TP';
                    }
                    return ket;
                  }()),
                  trailing: Lencana(teks(x['status']), warna: _warnaStatus(teks(x['status']))),
                  onTap: () async {
                    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => KerangkaDetailScreen(kunci: teks(x['kunci']), semuaItem: item)));
                    if (mounted) setState(() => _v++);
                  },
                ),
            ]),
          ),
        ]);
      },
    );
  }
}

/// Detail satu mapel + fase: sumber PDF + AI, editor CP/TP, setujui (kfGambarDetail_).
class KerangkaDetailScreen extends StatefulWidget {
  const KerangkaDetailScreen({super.key, required this.kunci, required this.semuaItem});
  final String kunci;
  final List<Map<String, dynamic>> semuaItem;

  @override
  State<KerangkaDetailScreen> createState() => _KerangkaDetailScreenState();
}

class _KerangkaDetailScreenState extends State<KerangkaDetailScreen> {
  Map<String, dynamic>? d;
  String? _galat;
  List<Map<String, dynamic>> _cp = [];
  List<Map<String, dynamic>> _tp = [];
  final _sumber = TextEditingController();
  final _catatan = TextEditingController();
  bool _dariDraf = false;
  final List<BerkasPdf> _berkas = [];
  bool _sibuk = false;
  double? _frak;
  String _prog = '';
  int _versiEditor = 0;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    try {
      final r = peta(await Api.instance('waAdminKerangkaBaca', [_t, widget.kunci]));
      if (mounted) _pasang(r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  void _pasang(Map<String, dynamic> r) {
    final s = r['draf'] != null ? peta(r['draf']) : (r['setuju'] != null ? peta(r['setuju']) : null);
    List<Map<String, dynamic>> salin(dynamic v) => daftar(v).map((e) => Map<String, dynamic>.from(peta(e))).toList();
    setState(() {
      d = r;
      _galat = null;
      _dariDraf = r['draf'] != null;
      if (s != null) {
        _cp = salin(s['cp']);
        _tp = salin(s['tp']);
        _sumber.text = teks(s['sumber']);
      } else if (r['cpIdentitas'] != null) {
        _cp = [
          {'elemen': '', 'teks': teks(peta(r['cpIdentitas'])['teks'])}
        ];
        _tp = [];
        _sumber.text = teks(peta(r['cpIdentitas'])['sumber']);
      } else {
        _cp = [];
        _tp = [];
        _sumber.text = '';
      }
      _versiEditor++;
    });
  }

  Future<void> _tambahBerkas() async {
    final dd = d!;
    try {
      final fs = await pilihPdf(banyak: true);
      for (final f in fs) {
        if (f.ukuran > angka(dd['maksMB'], 50) * 1048576) {
          if (mounted) kabar(context, '"${f.nama}" terlalu besar (maksimal ${angka(dd['maksMB'], 50)} MB).', galat: true);
          continue;
        }
        if (_berkas.length >= angka(dd['maksPdf'], 3)) {
          if (mounted) kabar(context, 'Maksimal ${angka(dd['maksPdf'], 3)} PDF.', galat: true);
          break;
        }
        _berkas.add(f);
      }
      setState(() {});
    } catch (e) {
      if (mounted) kabar(context, '$e', galat: true);
    }
  }

  Future<void> _ai({bool semuaFase = false}) async {
    if (_sibuk) return;
    if (_berkas.isEmpty) return kabar(context, 'Pilih dulu PDF sumber.');
    setState(() => _sibuk = true);
    final total = _berkas.length;
    final refs = <Map<String, dynamic>>[];
    void atur(double f, String t) {
      if (!mounted) return;
      setState(() {
        _frak = f;
        _prog = t;
      });
    }

    try {
      for (var i = 0; i < total; i++) {
        final f = _berkas[i];
        atur(i / (total + 1), 'Menyiapkan unggahan ${f.nama}...');
        refs.add(await unggahPdf(f, () => Api.instance('waAdminKerangkaMulaiUnggah', [_t, f.nama, f.ukuran, 'application/pdf']),
            onProg: (p) => atur((i + p / 100) / (total + 1), 'Mengunggah ${f.nama} $p%')));
      }
      if (semuaFase) {
        final mp = teks(widget.semuaItem.where((x) => teks(x['kunci']) == widget.kunci).firstOrNull?['mapel']);
        var daftarK = widget.semuaItem.where((x) => teks(x['mapel']) == mp).toList();
        if (daftarK.isEmpty) daftarK = [{'kunci': widget.kunci, 'fase': ''}];
        final n = daftarK.length;
        var ok = 0;
        final gagal = <String>[];
        for (var i = 0; i < n; i++) {
          final g = daftarK[i];
          atur((total + i) / (total + n), 'Menyusun Fase ${teks(g['fase'], '-')} (${i + 1} dari $n). Sekitar 1 sampai 3 menit per fase...');
          try {
            await Api.instance('waAdminKerangkaAi', [_t, teks(g['kunci']), refs, {'catatan': _catatan.text}], batasAi);
            ok++;
          } on ApiException catch (e) {
            gagal.add('Fase ${teks(g['fase'], '-')}: ${bersihTanda(e.pesan)}');
          }
          if (i < n - 1) await Future.delayed(const Duration(seconds: 15));
        }
        for (final r in refs) {
          bersihkanRef(r);
        }
        _berkas.clear();
        if (mounted) {
          kabar(context,
              '$ok dari $n fase tersusun sebagai draf.${gagal.isNotEmpty ? ' Belum berhasil: ${gagal.join('; ')}.' : ''} Buka tiap fase, periksa drafnya, lalu setujui.');
        }
        await _muat();
      } else {
        atur(total / (total + 1), 'AI sedang membaca dokumen dan menyusun CP, TP, dan ATP. Ini bisa memakan 1 sampai 3 menit...');
        final hasil = peta(await Api.instance('waAdminKerangkaAi', [_t, widget.kunci, refs, {'catatan': _catatan.text}], batasAi));
        for (final r in refs) {
          bersihkanRef(r);
        }
        _berkas.clear();
        final dr = peta(hasil['draf']);
        if (mounted) kabar(context, 'Draf kerangka tersusun: ${daftar(dr['cp']).length} CP dan ${daftar(dr['tp']).length} TP. Periksa di langkah 2 lalu setujui.');
        _pasang(hasil);
      }
      setState(() {
        _frak = null;
        _prog = '';
      });
    } on ApiException catch (e) {
      final t = e.pesan;
      var teksG = bersihTanda(t);
      final tunggu = RegExp(r'\[tunggu:(\d+)\]').firstMatch(t);
      if (tunggu != null) {
        teksG += ' Coba lagi sekitar ${tunggu[1]} detik lagi.';
      } else if (t.contains('[harian]')) {
        teksG += ' Kuota harian habis; coba besok atau pakai mode manual.';
      }
      if (mounted) {
        setState(() {
          _frak = null;
          _prog = teksG;
        });
        kabar(context, teksG, galat: true);
      }
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Future<void> _manual() async {
    final mp = teks(widget.semuaItem.where((x) => teks(x['kunci']) == widget.kunci).firstOrNull?['mapel']);
    final banyakFase = widget.semuaItem.where((x) => teks(x['mapel']) == mp).length > 1;
    final r = await Navigator.of(context).push<Map<String, dynamic>>(MaterialPageRoute(
      builder: (_) => _ManualKerangka(kunci: widget.kunci, catatan: _catatan.text, banyakFase: banyakFase),
    ));
    if (r == null || !mounted) return;
    if (r['semua'] == true) {
      kabar(context, teks(r['pesan'], 'Tersimpan.'));
      Navigator.pop(context);
      return;
    }
    final dr = peta(r['draf']);
    kabar(context, 'Draf tersimpan: ${daftar(dr['cp']).length} CP dan ${daftar(dr['tp']).length} TP. Periksa di langkah 2.');
    _pasang(r);
  }

  Future<void> _simpan(bool setujui) async {
    final r = await jalankan(context, () => Api.instance('waAdminKerangkaSimpan', [_t, widget.kunci, {'cp': _cp, 'tp': _tp, 'sumber': _sumber.text}, setujui]),
        teksProses: 'Menyimpan...');
    if (!r.ok || !mounted) return;
    kabar(context, setujui ? 'Kerangka disetujui dan sudah dipakai tutor.' : 'Draf disimpan.');
    _pasang(peta(r.data));
  }

  Future<void> _hapus(String status) async {
    final dd = d!;
    final ok = await konfirmasi(
      context,
      status == 'Draf' ? 'Hapus draf?' : 'Cabut kerangka yang disetujui?',
      status == 'Draf'
          ? 'Draf untuk ${teks(dd['mapel'])} (Fase ${teks(dd['fase'])}) dihapus. Kerangka yang sudah disetujui tidak berubah.'
          : 'Tutor tidak lagi melihat TP resmi untuk ${teks(dd['mapel'])} (Fase ${teks(dd['fase'])}), dan prompt rencana sesi kembali ke cara lama. CP di sheet Identitas_CP tetap ada.',
      ya: status == 'Draf' ? 'Hapus draf' : 'Cabut',
    );
    if (!ok || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminKerangkaHapus', [_t, widget.kunci, status]));
    if (!r.ok || !mounted) return;
    kabar(context, status == 'Draf' ? 'Draf dihapus.' : 'Kerangka dicabut.');
    _pasang(peta(r.data));
  }

  Widget _editor() {
    final dd = d!;
    final cs = Theme.of(context).colorScheme;
    final kelas = [''] + daftar(dd['kelas']).map((e) => '$e').toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('2. Periksa dan setujui', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 4),
          Text(
            '${_dariDraf ? 'Sedang mengubah DRAF.' : (dd['setuju'] != null ? 'Sedang mengubah salinan dari kerangka yang disetujui. Perubahan baru dipakai tutor setelah Anda menyetujui.' : 'Belum ada draf. Isi manual atau susun lewat langkah 1.')} '
            'Periksa kesesuaian dengan dokumen resmi; nomor TP dipakai tutor sebagai rujukan.',
            style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 10),
          TextField(controller: _sumber, maxLength: 300, decoration: const InputDecoration(labelText: 'Sumber/acuan', hintText: 'mis. Panduan Mata Pelajaran Ekonomi Fase F (Kemendikdasmen 2025)')),
          const Text('Capaian Pembelajaran (CP)', style: TextStyle(fontWeight: FontWeight.w800)),
          if (_cp.isEmpty) Text('Belum ada CP.', style: TextStyle(color: cs.outline)),
          for (var i = 0; i < _cp.length; i++)
            Container(
              key: ValueKey('cp$_versiEditor-$i-${_cp.length}'),
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(border: Border.all(color: cs.outlineVariant), borderRadius: BorderRadius.circular(14)),
              child: Column(children: [
                Row(children: [
                  Expanded(
                    child: TextFormField(
                      initialValue: teks(_cp[i]['elemen']),
                      maxLength: 80,
                      decoration: const InputDecoration(hintText: 'Nama elemen (boleh kosong)', counterText: '', isDense: true),
                      onChanged: (v) => _cp[i]['elemen'] = v,
                    ),
                  ),
                  IconButton(onPressed: () => setState(() {
                        _cp.removeAt(i);
                        _versiEditor++;
                      }), icon: const Icon(Icons.close_rounded)),
                ]),
                const SizedBox(height: 6),
                TextFormField(
                  initialValue: teks(_cp[i]['teks']),
                  maxLength: 4000,
                  minLines: 3,
                  maxLines: 10,
                  decoration: const InputDecoration(counterText: '', isDense: true),
                  onChanged: (v) => _cp[i]['teks'] = v,
                ),
              ]),
            ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() {
                _cp.add({'elemen': '', 'teks': ''});
                _versiEditor++;
              }),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Tambah elemen CP'),
            ),
          ),
          const SizedBox(height: 10),
          const Text('Tujuan Pembelajaran dan Alur (ATP), urutan dari atas ke bawah', style: TextStyle(fontWeight: FontWeight.w800)),
          if (_tp.isEmpty) Text('Belum ada TP.', style: TextStyle(color: cs.outline)),
          for (var i = 0; i < _tp.length; i++)
            Container(
              key: ValueKey('tp$_versiEditor-$i-${_tp.length}'),
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(border: Border.all(color: cs.outlineVariant), borderRadius: BorderRadius.circular(14)),
              child: Column(children: [
                Row(children: [
                  SizedBox(
                    width: 64,
                    child: TextFormField(
                      initialValue: teks(_tp[i]['nomor']),
                      maxLength: 12,
                      decoration: const InputDecoration(hintText: 'No', counterText: '', isDense: true),
                      onChanged: (v) => _tp[i]['nomor'] = v,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: TextFormField(
                      initialValue: teks(_tp[i]['elemen']),
                      maxLength: 80,
                      decoration: const InputDecoration(hintText: 'Elemen', counterText: '', isDense: true),
                      onChanged: (v) => _tp[i]['elemen'] = v,
                    ),
                  ),
                  const SizedBox(width: 6),
                  SizedBox(
                    width: 56,
                    child: TextFormField(
                      initialValue: teks(_tp[i]['jp']),
                      maxLength: 2,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(hintText: 'JP', counterText: '', isDense: true),
                      onChanged: (v) => _tp[i]['jp'] = v,
                    ),
                  ),
                ]),
                const SizedBox(height: 6),
                Row(children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: kelas.contains(teks(_tp[i]['kelas'])) ? teks(_tp[i]['kelas']) : '',
                      isExpanded: true,
                      decoration: const InputDecoration(isDense: true),
                      items: [
                        for (final k in {...kelas, if (teks(_tp[i]['kelas']).isNotEmpty) teks(_tp[i]['kelas'])})
                          DropdownMenuItem(value: k, child: Text(k.isEmpty ? 'Semua kelas' : 'Kelas $k')),
                      ],
                      onChanged: (v) => _tp[i]['kelas'] = v ?? '',
                    ),
                  ),
                  const SizedBox(width: 6),
                  SizedBox(
                    width: 100,
                    child: DropdownButtonFormField<String>(
                      initialValue: ['', '1', '2'].contains(teks(_tp[i]['smt'])) ? teks(_tp[i]['smt']) : '',
                      decoration: const InputDecoration(isDense: true),
                      items: const [
                        DropdownMenuItem(value: '', child: Text('Smt ?')),
                        DropdownMenuItem(value: '1', child: Text('Smt 1')),
                        DropdownMenuItem(value: '2', child: Text('Smt 2')),
                      ],
                      onChanged: (v) => _tp[i]['smt'] = v ?? '',
                    ),
                  ),
                ]),
                const SizedBox(height: 6),
                TextFormField(
                  initialValue: teks(_tp[i]['teks']),
                  maxLength: 600,
                  minLines: 2,
                  maxLines: 6,
                  decoration: const InputDecoration(counterText: '', isDense: true),
                  onChanged: (v) => _tp[i]['teks'] = v,
                ),
                Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                  IconButton(
                    onPressed: i == 0
                        ? null
                        : () => setState(() {
                              final t = _tp[i - 1];
                              _tp[i - 1] = _tp[i];
                              _tp[i] = t;
                              _versiEditor++;
                            }),
                    icon: const Icon(Icons.arrow_upward_rounded),
                  ),
                  IconButton(
                    onPressed: i == _tp.length - 1
                        ? null
                        : () => setState(() {
                              final t = _tp[i + 1];
                              _tp[i + 1] = _tp[i];
                              _tp[i] = t;
                              _versiEditor++;
                            }),
                    icon: const Icon(Icons.arrow_downward_rounded),
                  ),
                  IconButton(
                    onPressed: () => setState(() {
                      _tp.removeAt(i);
                      _versiEditor++;
                    }),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ]),
              ]),
            ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() {
                var no = 1;
                for (final x in _tp) {
                  final n = int.tryParse(teks(x['nomor'])) ?? 0;
                  if (n >= no) no = n + 1;
                }
                _tp.add({'nomor': '$no', 'elemen': '', 'teks': '', 'kelas': '', 'smt': '', 'jp': ''});
                _versiEditor++;
              }),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Tambah TP'),
            ),
          ),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            OutlinedButton(onPressed: () => _simpan(false), child: const Text('Simpan draf')),
            FilledButton.icon(onPressed: () => _simpan(true), icon: const Icon(Icons.check_rounded), label: const Text('Setujui dan pakai')),
            if (dd['draf'] != null) TextButton(onPressed: () => _hapus('Draf'), child: const Text('Hapus draf')),
            if (dd['setuju'] != null) TextButton(onPressed: () => _hapus('Disetujui'), child: Text('Cabut kerangka yang disetujui', style: TextStyle(color: cs.error))),
          ]),
          if (dd['setuju'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('Menyetujui menggantikan kerangka lama dan memperbarui CP di sheet Identitas_CP. RPP yang sudah diisi tutor tidak berubah.',
                  style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final dd = d;
    return PopScope(
      canPop: !_sibuk,
      child: Scaffold(
        appBar: AppBar(title: Text(dd == null ? 'CP · TP · ATP' : '${teks(dd['mapel'])}${teks(dd['fase']).isNotEmpty ? ' · Fase ${teks(dd['fase'])}' : ''}')),
        body: _galat != null
            ? PesanGalat(pesan: _galat!, ulangi: _muat)
            : dd == null
                ? const Center(child: CircularProgressIndicator())
                : ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 40), children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Expanded(
                              child: Text('${daftar(dd['rombel']).join(', ')}${daftar(dd['kelas']).isNotEmpty ? ' (kelas ${daftar(dd['kelas']).join(', ')})' : ''}',
                                  style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                            ),
                            Builder(builder: (_) {
                              final st = dd['setuju'] != null && dd['draf'] != null
                                  ? 'Disetujui + draf baru'
                                  : dd['setuju'] != null
                                      ? 'Disetujui'
                                      : dd['draf'] != null
                                          ? 'Draf'
                                          : 'Belum ada';
                              return Lencana(st, warna: _warnaStatus(st));
                            }),
                          ]),
                          const SizedBox(height: 6),
                          Text(dd['setuju'] != null
                              ? 'Dipakai tutor sekarang: ${daftar(peta(dd['setuju'])['cp']).length} CP dan ${daftar(peta(dd['setuju'])['tp']).length} TP'
                                  '${teks(peta(dd['setuju'])['oleh']).isNotEmpty ? ' · ${teks(peta(dd['setuju'])['oleh'])}' : ''}${teks(peta(dd['setuju'])['waktu']).isNotEmpty ? ' · ${teks(peta(dd['setuju'])['waktu'])}' : ''}.'
                              : 'Belum ada kerangka yang disetujui untuk mapel ini. Tutor belum melihat CP/TP resmi.'),
                        ]),
                      ),
                    ),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          const Text('1. Sumber dan penyusunan otomatis', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                          const SizedBox(height: 4),
                          Text(
                            'Unggah PDF sumber, mis. "Panduan Mata Pelajaran ${teks(dd['mapel'])} Fase ${teks(dd['fase'])}" dari Kemendikdasmen (memuat Capaian Pembelajaran dan contoh Alur Tujuan Pembelajaran). '
                            'Maksimal ${angka(dd['maksPdf'], 3)} berkas, @ ${angka(dd['maksMB'], 50)} MB. AI mengutip CP apa adanya dan memakai nomor TP resmi bila ada.',
                            style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
                          ),
                          const SizedBox(height: 8),
                          for (var i = 0; i < _berkas.length; i++)
                            ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              leading: const Icon(Icons.picture_as_pdf_rounded),
                              title: Text('${_berkas[i].nama} (${_berkas[i].ukuranMb} MB)'),
                              trailing: IconButton(onPressed: _sibuk ? null : () => setState(() => _berkas.removeAt(i)), icon: const Icon(Icons.close_rounded)),
                            ),
                          OutlinedButton.icon(onPressed: _sibuk ? null : _tambahBerkas, icon: const Icon(Icons.attach_file_rounded), label: const Text('Pilih PDF sumber')),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _catatan,
                            maxLength: 500,
                            minLines: 2,
                            maxLines: 4,
                            decoration: const InputDecoration(hintText: 'Catatan untuk AI (opsional), mis. "Pakai tabel ATP halaman 55-58".'),
                          ),
                          if (_frak != null) ...[
                            ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: _frak, minHeight: 8)),
                            const SizedBox(height: 6),
                          ],
                          if (_prog.isNotEmpty) Text(_prog, style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                          const SizedBox(height: 8),
                          Wrap(spacing: 8, runSpacing: 8, children: [
                            FilledButton.icon(
                              onPressed: _sibuk || dd['siapAi'] != true ? null : () => _ai(),
                              icon: const Icon(Icons.auto_awesome_rounded, size: 18),
                              label: const Text('Susun dengan AI dari PDF'),
                            ),
                            FilledButton.tonalIcon(
                              onPressed: _sibuk || dd['siapAi'] != true ? null : () => _ai(semuaFase: true),
                              icon: const Icon(Icons.auto_awesome_motion_rounded, size: 18),
                              label: const Text('Susun SEMUA fase mapel ini dari PDF'),
                            ),
                            OutlinedButton(onPressed: _sibuk ? null : _manual, child: const Text('Mode manual (Gemini web)')),
                          ]),
                          const SizedBox(height: 6),
                          Text('Hasil AI disimpan sebagai DRAF. Tutor tidak melihatnya sebelum Anda menyetujui di langkah 2.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                        ]),
                      ),
                    ),
                    _editor(),
                  ]),
      ),
    );
  }
}

class _ManualKerangka extends StatefulWidget {
  const _ManualKerangka({required this.kunci, required this.catatan, required this.banyakFase});
  final String kunci;
  final String catatan;
  final bool banyakFase;

  @override
  State<_ManualKerangka> createState() => _ManualKerangkaState();
}

class _ManualKerangkaState extends State<_ManualKerangka> {
  String _prompt = 'Memuat prompt...';
  String _cakupan = 'satu';
  final _isi = TextEditingController();
  String? _galat;
  bool _sibuk = false;

  @override
  void initState() {
    super.initState();
    _muatPrompt();
  }

  Future<void> _muatPrompt() async {
    setState(() => _prompt = 'Memuat...');
    try {
      final r = peta(await Api.instance('waAdminKerangkaPromptManual', [_t, widget.kunci, {'catatan': widget.catatan, 'semuaFase': widget.banyakFase && _cakupan == 'semua'}]));
      if (mounted) setState(() => _prompt = teks(r['prompt']));
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _prompt = '');
        kabar(context, e.ramah, galat: true);
      }
    }
  }

  Future<void> _impor() async {
    setState(() => _galat = null);
    if (_isi.text.trim().isEmpty) return setState(() => _galat = 'Tempel dulu jawaban Gemini.');
    setState(() => _sibuk = true);
    try {
      final r = await Api.instance('waAdminKerangkaImporManual', [_t, widget.kunci, _isi.text, widget.banyakFase && _cakupan == 'semua'], const Duration(minutes: 4));
      if (mounted) Navigator.pop(context, peta(r));
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Mode manual: lewat Gemini web')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        Text(
          'Dipakai bila kuota API habis. (1) Salin prompt. (2) Buka Gemini, lampirkan PDF sumber, tempel prompt. (3) Salin seluruh jawaban JSON Gemini, tempel di kotak bawah, lalu Periksa dan simpan sebagai draf.',
          style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
        ),
        if (widget.banyakFase) ...[
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _cakupan,
            decoration: const InputDecoration(labelText: 'Cakupan'),
            items: const [
              DropdownMenuItem(value: 'satu', child: Text('Fase ini saja')),
              DropdownMenuItem(value: 'semua', child: Text('Semua fase mata pelajaran ini')),
            ],
            onChanged: (v) {
              _cakupan = v ?? 'satu';
              _muatPrompt();
            },
          ),
        ],
        const SizedBox(height: 10),
        Container(
          constraints: const BoxConstraints(maxHeight: 180),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: cs.surfaceContainerHigh, borderRadius: BorderRadius.circular(12)),
          child: SingleChildScrollView(child: SelectableText(_prompt, style: const TextStyle(fontSize: 12, fontFamily: 'monospace'))),
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          FilledButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: _prompt));
              if (context.mounted) kabar(context, 'Prompt tersalin.');
            },
            icon: const Icon(Icons.copy_rounded, size: 18),
            label: const Text('Salin prompt'),
          ),
          OutlinedButton(onPressed: () => launchUrl(Uri.parse('https://gemini.google.com/app'), mode: LaunchMode.externalApplication), child: const Text('Buka Gemini')),
        ]),
        const SizedBox(height: 16),
        const Text('Tempel jawaban JSON dari Gemini (boleh berisi banyak fase: semua fase yang tertera diproses sekaligus)', style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        TextField(
          controller: _isi,
          minLines: 6,
          maxLines: 14,
          style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
          decoration: const InputDecoration(hintText: '{ "capaian_pembelajaran": [...], "alur_tujuan_pembelajaran": [...] }'),
        ),
        if (_galat != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_galat!, style: TextStyle(color: cs.error))),
        const SizedBox(height: 12),
        FilledButton(onPressed: _sibuk ? null : _impor, child: _sibuk ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Periksa dan simpan sebagai draf')),
      ]),
    );
  }
}
