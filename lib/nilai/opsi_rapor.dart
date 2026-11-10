import 'package:flutter/material.dart';

import '../api.dart';

/// Pilihan cetak rapor: nama kepala sekolah penanda tangan (bisa berbeda untuk tahun ajaran lalu)
/// dan tanggal rapor.
class OpsiRapor {
  const OpsiRapor({required this.kepala, this.nip = '', this.tanggal = ''});

  /// Nama kepala sekolah yang dicetak di rapor.
  final String kepala;

  /// NIP kepala sekolah (opsional, kosong = tidak dicetak).
  final String nip;

  /// Tanggal rapor dalam teks siap cetak (kosong = tanggal hari ini).
  final String tanggal;
}

const _bulanPanjang = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

String tglPanjang(DateTime d) => '${d.day} ${_bulanPanjang[d.month - 1]} ${d.year}';

/// Dialog sebelum mencetak rapor. Mengembalikan null bila dibatalkan.
Future<OpsiRapor?> opsiCetakRapor(BuildContext context, Map<String, dynamic> leger) {
  final l = peta(leger['lembaga']);
  final per = peta(leger['periode']);
  return showDialog<OpsiRapor>(
    context: context,
    builder: (_) => _DialogOpsiRapor(
      kepalaKini: teks(l['kepala']).trim(),
      periode: 'Semester ${teks(per['semester'])} ${teks(per['tahun'])}',
    ),
  );
}

class _DialogOpsiRapor extends StatefulWidget {
  const _DialogOpsiRapor({required this.kepalaKini, required this.periode});
  final String kepalaKini;
  final String periode;

  @override
  State<_DialogOpsiRapor> createState() => _DialogOpsiRaporState();
}

class _DialogOpsiRaporState extends State<_DialogOpsiRapor> {
  late bool _sama = widget.kepalaKini.isNotEmpty;
  final _nama = TextEditingController();
  final _nip = TextEditingController();
  DateTime? _tgl;
  String? _galat;

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
    Navigator.pop(context, OpsiRapor(kepala: nama, nip: _sama ? '' : _nip.text.trim(), tanggal: _tgl == null ? '' : tglPanjang(_tgl!)));
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return AlertDialog(
      title: const Text('Cetak rapor'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.periode, style: const TextStyle(fontWeight: FontWeight.w700)),
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
