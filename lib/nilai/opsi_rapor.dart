import 'package:flutter/material.dart';

import '../api.dart';

/// Pilihan cetak rapor: semester/tahun pelajaran, nama kepala sekolah penanda tangan
/// (bisa berbeda untuk tahun ajaran lalu), dan tanggal rapor.
class OpsiRapor {
  const OpsiRapor({required this.kepala, this.nip = '', this.tanggal = '', this.tahun = '', this.semester = '', this.peringkat = true});

  /// Nama kepala sekolah yang dicetak di rapor.
  final String kepala;

  /// NIP kepala sekolah (opsional, kosong = tidak dicetak).
  final String nip;

  /// Tanggal rapor dalam teks siap cetak (kosong = tanggal hari ini).
  final String tanggal;

  /// Tahun pelajaran rapor, mis. "2026/2027" (kosong = periode leger yang sedang dibuka).
  final String tahun;

  /// "Ganjil" atau "Genap" (kosong = periode leger yang sedang dibuka).
  final String semester;

  /// v1.43.0: tampilkan peringkat di rapor.
  final bool peringkat;
}

const _bulanPanjang = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

String tglPanjang(DateTime d) => '${d.day} ${_bulanPanjang[d.month - 1]} ${d.year}';

/// Semester berjalan lalu mundur sampai tiga tahun pelajaran ke belakang (terbaru di atas).
/// Contoh dari Ganjil 2026/2027: Ganjil 26/27, Genap 25/26, Ganjil 25/26, ..., Ganjil 2023/2024.
List<Map<String, String>> semesterRapor(Map<String, dynamic> kini) {
  final m = RegExp(r'(\d{4})\s*/\s*(\d{4})').firstMatch(teks(kini['tahun']));
  var y1 = m == null ? (DateTime.now().month >= 7 ? DateTime.now().year : DateTime.now().year - 1) : int.parse(m.group(1)!);
  var genap = teks(kini['semester']) == 'Genap';
  final jumlah = genap ? 8 : 7;
  final out = <Map<String, String>>[];
  for (var i = 0; i < jumlah; i++) {
    out.add({'tahun': '$y1/${y1 + 1}', 'semester': genap ? 'Genap' : 'Ganjil'});
    if (genap) {
      genap = false;
    } else {
      genap = true;
      y1--;
    }
  }
  return out;
}

/// Dialog sebelum mencetak rapor. Mengembalikan null bila dibatalkan.
Future<OpsiRapor?> opsiCetakRapor(BuildContext context, Map<String, dynamic> leger) {
  final l = peta(leger['lembaga']);
  final per = peta(leger['periode']);
  final kini = leger['periodeKini'] == null ? per : peta(leger['periodeKini']);
  final daftar = semesterRapor(kini);
  // periode leger yang sedang dibuka selalu ada di pilihan
  if (!daftar.any((x) => x['tahun'] == teks(per['tahun']) && x['semester'] == teks(per['semester'])) && teks(per['tahun']).isNotEmpty) {
    daftar.add({'tahun': teks(per['tahun']), 'semester': teks(per['semester'])});
  }
  return showDialog<OpsiRapor>(
    context: context,
    builder: (_) => _DialogOpsiRapor(
      kepalaKini: teks(l['kepala']).trim(),
      semester: daftar,
      awal: daftar.indexWhere((x) => x['tahun'] == teks(per['tahun']) && x['semester'] == teks(per['semester'])),
    ),
  );
}

class _DialogOpsiRapor extends StatefulWidget {
  const _DialogOpsiRapor({required this.kepalaKini, required this.semester, required this.awal});
  final String kepalaKini;
  final List<Map<String, String>> semester;
  final int awal;

  @override
  State<_DialogOpsiRapor> createState() => _DialogOpsiRaporState();
}

class _DialogOpsiRaporState extends State<_DialogOpsiRapor> {
  late bool _sama = widget.kepalaKini.isNotEmpty;
  late int _smt = widget.awal < 0 ? 0 : widget.awal;
  final _nama = TextEditingController();
  final _nip = TextEditingController();
  DateTime? _tgl;
  String? _galat;
  bool _peringkat = true;

  @override
  void dispose() {
    _nama.dispose();
    _nip.dispose();
    super.dispose();
  }

  Future<void> _pilihTanggal() async {
    final n = DateTime.now();
    final d = await showDatePicker(context: context, firstDate: DateTime(n.year - 5), lastDate: DateTime(n.year + 1), initialDate: _tgl ?? n);
    if (d != null) setState(() => _tgl = d);
  }

  void _ok() {
    final nama = _sama ? widget.kepalaKini : _nama.text.trim();
    if (nama.isEmpty) {
      setState(() => _galat = 'Isi nama kepala sekolah.');
      return;
    }
    final s = widget.semester.isEmpty ? const <String, String>{} : widget.semester[_smt];
    Navigator.pop(
      context,
      OpsiRapor(
        kepala: nama,
        nip: _sama ? '' : _nip.text.trim(),
        tanggal: _tgl == null ? '' : tglPanjang(_tgl!),
        tahun: s['tahun'] ?? '',
        semester: s['semester'] ?? '',
        peringkat: _peringkat,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return AlertDialog(
      title: const Text('Cetak rapor'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (widget.semester.isNotEmpty)
            DropdownButtonFormField<int>(
              initialValue: _smt,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Semester rapor', prefixIcon: Icon(Icons.date_range_rounded)),
              items: [
                for (var i = 0; i < widget.semester.length; i++)
                  DropdownMenuItem(value: i, child: Text('Semester ${widget.semester[i]['semester']} ${widget.semester[i]['tahun']}')),
              ],
              onChanged: (i) => setState(() => _smt = i ?? _smt),
            ),
          const SizedBox(height: 8),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _sama,
            onChanged: widget.kepalaKini.isEmpty ? null : (v) => setState(() { _sama = v ?? true; _galat = null; }),
            title: const Text('Kepala sekolah sama dengan saat ini'),
            subtitle: Text(widget.kepalaKini.isEmpty ? 'Nama kepala sekolah saat ini belum diatur' : widget.kepalaKini),
          ),
          if (!_sama) ...[
            TextField(
              controller: _nama,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(labelText: 'Nama kepala sekolah pada periode ini', errorText: _galat),
              onChanged: (_) { if (_galat != null) setState(() => _galat = null); },
            ),
            const SizedBox(height: 8),
            TextField(controller: _nip, decoration: const InputDecoration(labelText: 'NIP (opsional)')),
          ],
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _peringkat,
            onChanged: (v) => setState(() => _peringkat = v ?? true),
            title: const Text('Tampilkan peringkat di rapor'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _pilihTanggal,
            icon: const Icon(Icons.event_rounded, size: 18),
            label: Text(_tgl == null ? 'Tanggal rapor: hari ini' : 'Tanggal rapor: ${tglPanjang(_tgl!)}'),
          ),
          if (_tgl != null) TextButton(onPressed: () => setState(() => _tgl = null), child: const Text('Pakai tanggal hari ini')),
          Text('Untuk rapor tahun ajaran lalu, pilih tanggal pembagian rapor periode tersebut.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(onPressed: _ok, child: const Text('Cetak')),
      ],
    );
  }
}
