import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

class LogScreen extends StatefulWidget {
  const LogScreen({super.key});

  @override
  State<LogScreen> createState() => _LogScreenState();
}

class _LogScreenState extends State<LogScreen> {
  String _kunci = '';
  int _versi = 0;

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey('$_kunci#$_versi'),
      muat: () async => peta(await Api.instance('waAdminLog', [Sesi.instance.token, _kunci])),
      bangun: (context, d, segarkan) {
        final orang = daftar(d['orang']).map(peta).toList();
        final riwayat = daftar(d['riwayat']).map(peta).toList();
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            DropdownButtonFormField<String>(
              initialValue: _kunci,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Orang'),
              items: [
                const DropdownMenuItem(value: '', child: Text('Semua orang (catatan terbaru)')),
                for (final o in orang)
                  DropdownMenuItem(
                    value: teks(o['kunci']),
                    child: Text('${teks(o['nama'])} (${teks(o['peran'])}) · ${angka(o['jumlah'])} catatan', overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (v) => setState(() {
                _kunci = v ?? '';
                _versi++;
              }),
            ),
            const SizedBox(height: 8),
            if (riwayat.isEmpty) const Kosong(pesan: 'Belum ada catatan.'),
            for (final r in riwayat)
              Card(
                margin: const EdgeInsets.symmetric(vertical: 5),
                child: ListTile(
                  leading: Icon(
                    teks(r['hasil']) == 'GAGAL' ? Icons.error_outline : Icons.check_circle_outline,
                    color: teks(r['hasil']) == 'GAGAL' ? Theme.of(context).colorScheme.error : Colors.green,
                  ),
                  title: Text('${teks(r['nama'])} · ${teks(r['aksi'])}'),
                  subtitle: Text([
                    teks(r['waktu']),
                    if (teks(r['peran']).isNotEmpty) teks(r['peran']),
                    if (teks(r['kelas']).isNotEmpty) teks(r['kelas']),
                    if (teks(r['detail']).isNotEmpty) teks(r['detail']),
                  ].join(' · ')),
                  isThreeLine: teks(r['detail']).length > 40,
                ),
              ),
            if (d['dibatasi'] == true)
              const Padding(padding: EdgeInsets.all(12), child: Text('Menampilkan catatan terbaru saja.', textAlign: TextAlign.center)),
          ],
        );
      },
    );
  }
}
