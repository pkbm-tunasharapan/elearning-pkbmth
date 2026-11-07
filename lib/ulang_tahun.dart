import 'package:flutter/material.dart';

import 'api.dart';
import 'session.dart';
import 'siswa/sesi_siswa.dart';
import 'widgets.dart';

/// Daftar warga belajar yang berulang tahun hari ini (staf atau siswa, sesuai sesi yang aktif).
Future<Map<String, dynamic>> ambilUlangTahun() async {
  final ss = SesiSiswa.instance;
  if (ss.masuk) return peta(await Api.instance('waUlangTahun', [ss.nama, ss.idRombel]));
  return peta(await Api.instance('waStafUlangTahun', [Sesi.instance.token]));
}

String _depan(String nama) => nama.trim().split(RegExp(r'\s+')).first;

/// Dialog ucapan: teks bisa diubah, lalu dikirim ke Chatroom Rombel yang berulang tahun.
Future<bool> ucapkanSelamat(BuildContext context, Map<String, dynamic> x) async {
  final nama = teks(x['nama']);
  final c = TextEditingController(text: 'Selamat ulang tahun, ${_depan(nama)}! Semoga sehat selalu, bahagia, dan makin semangat belajar.');
  final kirim = await showDialog<bool>(
    context: context,
    builder: (d) => AlertDialog(
      icon: const Icon(Icons.cake_rounded, color: Color(0xFFE9A23B)),
      title: Text('Ucapkan selamat untuk $nama'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        TextField(controller: c, maxLines: 4, maxLength: 300, decoration: const InputDecoration(labelText: 'Ucapan')),
        Text('Dikirim ke Chatroom Rombel ${teks(x['rombel'])}, dibaca $nama dan teman sekelasnya.', style: const TextStyle(fontSize: 12)),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Batal')),
        FilledButton.icon(onPressed: () => Navigator.pop(d, true), icon: const Icon(Icons.send_rounded, size: 18), label: const Text('Kirim')),
      ],
    ),
  );
  final pesan = c.text.trim();
  c.dispose();
  if (kirim != true || !context.mounted) return false;
  final ss = SesiSiswa.instance;
  final r = await jalankan(
    context,
    () => ss.masuk
        ? Api.instance('waUcapkanUlangTahun', [ss.nama, ss.idRombel, teks(x['idWb']), pesan])
        : Api.instance('waStafUcapkanUlangTahun', [Sesi.instance.token, teks(x['idWb']), pesan]),
    teksProses: 'Mengirim ucapan...',
  );
  if (r.ok && context.mounted) kabar(context, 'Ucapan terkirim ke Chatroom Rombel ${teks(x['rombel'])}.');
  return r.ok;
}

class _BarisUlangTahun extends StatefulWidget {
  const _BarisUlangTahun(this.x);
  final Map<String, dynamic> x;

  @override
  State<_BarisUlangTahun> createState() => _BarisUlangTahunState();
}

class _BarisUlangTahunState extends State<_BarisUlangTahun> {
  bool _terkirim = false;

  @override
  Widget build(BuildContext context) {
    final x = widget.x;
    final sendiri = x['sendiri'] == true;
    final usia = angka(x['usia']);
    return ListTile(
      dense: true,
      contentPadding: const EdgeInsets.fromLTRB(12, 0, 8, 0),
      leading: const CircleAvatar(radius: 18, backgroundColor: Color(0x33E9A23B), child: Icon(Icons.cake_rounded, size: 18, color: Color(0xFFE9A23B))),
      title: Text(teks(x['nama']), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text([teks(x['rombel']), if (usia > 0) '$usia tahun', if (sendiri) 'Ini Anda!'].join(' · ')),
      trailing: sendiri || Sesi.instance.isDinas
          ? null
          : x['bisaUcap'] != true
              ? const Tooltip(message: 'Chatroom rombel belum tersedia', child: Icon(Icons.chat_bubble_outline_rounded, size: 20))
              : _terkirim
                  ? const Chip(label: Text('Terkirim'), avatar: Icon(Icons.check_rounded, size: 16), visualDensity: VisualDensity.compact)
                  : FilledButton.tonalIcon(
                      onPressed: () async {
                        final ok = await ucapkanSelamat(context, x);
                        if (ok && mounted) setState(() => _terkirim = true);
                      },
                      icon: const Icon(Icons.celebration_rounded, size: 18),
                      label: const Text('Ucapkan'),
                    ),
    );
  }
}

/// Lembar daftar ulang tahun (dibuka dari notifikasi).
Future<void> tampilkanUlangTahun(BuildContext context, List<Map<String, dynamic>> daftarUlt) {
  return showModalBottomSheet(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (c) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(c).size.height * 0.75),
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(4, 0, 4, 16), children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text('Ulang tahun hari ini (${daftarUlt.length})', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          ),
          for (final x in daftarUlt) _BarisUlangTahun(x),
        ]),
      ),
    ),
  );
}

/// Kartu beranda: tampil hanya bila ada yang berulang tahun hari ini.
class KartuUlangTahun extends StatefulWidget {
  const KartuUlangTahun({super.key, this.padding = EdgeInsets.zero});
  final EdgeInsets padding;

  @override
  State<KartuUlangTahun> createState() => _KartuUlangTahunState();
}

class _KartuUlangTahunState extends State<KartuUlangTahun> {
  List<Map<String, dynamic>> _d = const [];

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    try {
      final h = await ambilUlangTahun();
      if (mounted) setState(() => _d = daftar(h['daftar']).map(peta).toList());
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (_d.isEmpty) return const SizedBox.shrink();
    final saya = _d.where((x) => x['sendiri'] == true).firstOrNull;
    final tampil = _d.take(5).toList();
    return Padding(
      padding: widget.padding,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            color: const Color(0x22E9A23B),
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            child: Row(children: [
              const Icon(Icons.celebration_rounded, color: Color(0xFFE9A23B)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  saya != null ? 'Selamat ulang tahun, ${_depan(teks(saya['nama']))}!' : 'Ulang tahun hari ini',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              Text('${_d.length} orang', style: const TextStyle(fontSize: 12)),
            ]),
          ),
          for (final x in tampil) _BarisUlangTahun(x),
          if (_d.length > tampil.length)
            TextButton(onPressed: () => tampilkanUlangTahun(context, _d), child: Text('Lihat semua (${_d.length})')),
        ]),
      ),
    );
  }
}
