import 'dart:async';

import 'package:flutter/material.dart';

import 'api.dart';
import 'theme.dart';
import 'widgets.dart';

/// Ruang obrolan (sama dengan BuatChat di web): poll tiap 4 detik, daftar online, kirim pesan.
class RuangChatScreen extends StatefulWidget {
  const RuangChatScreen({
    super.key,
    required this.judul,
    this.subjudul = '',
    required this.namaSaya,
    required this.peranSaya,
    required this.poll,
    required this.kirim,
    this.pesanKosong = 'Belum ada pesan.',
    this.petunjuk = 'Tulis pesan...',
  });

  final String judul;
  final String subjudul;
  final String namaSaya;
  final String peranSaya;
  final Future<dynamic> Function(int sejakMs) poll;
  final Future<dynamic> Function(String teks) kirim;
  final String pesanKosong;
  final String petunjuk;

  @override
  State<RuangChatScreen> createState() => _RuangChatScreenState();
}

class _RuangChatScreenState extends State<RuangChatScreen> with WidgetsBindingObserver {
  final _pesan = <Map<String, dynamic>>[];
  final _kunci = <String>{};
  List<Map<String, dynamic>> _online = [];
  int _sejak = 0;
  bool _awal = true;
  bool _sibuk = false;
  bool _mengirim = false;
  String? _galat;
  Timer? _timer;
  final _input = TextEditingController();
  final _gulir = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _tarik();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) => _tarik());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _tarik();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _input.dispose();
    _gulir.dispose();
    super.dispose();
  }

  bool get _dekatBawah => !_gulir.hasClients || _gulir.position.maxScrollExtent - _gulir.position.pixels < 120;

  void _keBawah() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_gulir.hasClients) _gulir.jumpTo(_gulir.position.maxScrollExtent);
    });
  }

  Future<void> _tarik() async {
    if (_sibuk) return;
    _sibuk = true;
    try {
      final d = peta(await widget.poll(_sejak));
      if (!mounted) return;
      final bawah = _dekatBawah;
      var tambah = false;
      for (final x in daftar(d['chatBaru']).map(peta)) {
        final k = '${angka(x['waktu'])}|${teks(x['nama'])}|${teks(x['pesan'])}';
        if (_kunci.add(k)) {
          _pesan.add(x);
          tambah = true;
        }
        if (angka(x['waktu']) > _sejak) _sejak = angka(x['waktu']);
      }
      setState(() {
        _online = daftar(d['online']).map(peta).toList();
        _galat = null;
      });
      if (tambah && (bawah || _awal)) _keBawah();
      _awal = false;
    } on ApiException catch (e) {
      if (mounted && _awal) setState(() => _galat = e.ramah);
    } catch (_) {
    } finally {
      _sibuk = false;
    }
  }

  Future<void> _kirim() async {
    final t = _input.text.trim();
    if (t.isEmpty || _mengirim) return;
    setState(() => _mengirim = true);
    _input.clear();
    try {
      final r = peta(await widget.kirim(t));
      if (!mounted) return;
      if (r['sukses'] != true) {
        kabar(context, teks(r['pesan'], 'Pesan gagal dikirim.'), galat: true);
        if (_input.text.isEmpty) _input.text = t;
      } else {
        await _tarik();
        _keBawah();
      }
    } on ApiException catch (e) {
      if (mounted) {
        kabar(context, e.ramah, galat: true);
        if (_input.text.isEmpty) _input.text = t;
      }
    } finally {
      if (mounted) setState(() => _mengirim = false);
    }
  }

  String _jam(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms);
    final n = DateTime.now();
    final j = '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    if (d.year == n.year && d.month == n.month && d.day == n.day) return j;
    return '${d.day}/${d.month} $j';
  }

  bool _milikSaya(Map<String, dynamic> p) =>
      teks(p['nama']).trim().toLowerCase() == widget.namaSaya.trim().toLowerCase() && teks(p['peran'], 'Siswa') == widget.peranSaya;

  void _lihatOnline() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
        Text('${_online.length} online', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        const SizedBox(height: 8),
        if (_online.isEmpty) const Text('-'),
        for (final o in _online)
          ListTile(
            dense: true,
            leading: const Icon(Icons.circle, color: Colors.green, size: 12),
            title: Text(teks(o['nama'])),
            subtitle: teks(o['peran'], 'Siswa') == 'Siswa' ? null : Text(teks(o['peran'])),
          ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.judul, overflow: TextOverflow.ellipsis),
          Text(widget.subjudul.isNotEmpty ? '${widget.subjudul} · ${_online.length} online' : '${_online.length} online',
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: cs.onSurfaceVariant)),
        ]),
        actions: [IconButton(tooltip: 'Yang online', onPressed: _lihatOnline, icon: const Icon(Icons.people_alt_rounded))],
      ),
      body: Column(children: [
        Expanded(
          child: _galat != null && _pesan.isEmpty
              ? PesanGalat(pesan: _galat!, ulangi: () {
                  setState(() => _galat = null);
                  _tarik();
                })
              : _awal
                  ? const Center(child: CircularProgressIndicator())
                  : _pesan.isEmpty
                      ? Kosong(pesan: widget.pesanKosong, ikon: Icons.forum_outlined)
                      : ListView.builder(
                          controller: _gulir,
                          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                          itemCount: _pesan.length,
                          itemBuilder: (c, i) {
                            final p = _pesan[i];
                            final saya = _milikSaya(p);
                            final sebelum = i > 0 ? _pesan[i - 1] : null;
                            final sambung = sebelum != null && teks(sebelum['nama']) == teks(p['nama']) && angka(p['waktu']) - angka(sebelum['waktu']) < 120000;
                            final peran = teks(p['peran'], 'Siswa');
                            return Align(
                              alignment: saya ? Alignment.centerRight : Alignment.centerLeft,
                              child: ConstrainedBox(
                                constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                                child: Container(
                                  margin: EdgeInsets.only(top: sambung ? 2 : 10),
                                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
                                  decoration: BoxDecoration(
                                    color: saya ? cs.primary : (peran != 'Siswa' ? const Color(0xFFFFF4DB) : cs.surfaceContainerHigh),
                                    borderRadius: BorderRadius.only(
                                      topLeft: const Radius.circular(18),
                                      topRight: const Radius.circular(18),
                                      bottomLeft: Radius.circular(saya ? 18 : 4),
                                      bottomRight: Radius.circular(saya ? 4 : 18),
                                    ),
                                  ),
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    if (!saya && !sambung)
                                      Text(peran == 'Siswa' ? teks(p['nama']) : '${teks(p['nama'])} · $peran',
                                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: peran != 'Siswa' ? const Color(0xFFB45309) : Gaya.warnaMenu(teks(p['nama'])))),
                                    SelectableText(teks(p['pesan']), style: TextStyle(color: saya ? cs.onPrimary : (peran != 'Siswa' ? Colors.black87 : null), height: 1.35)),
                                    Align(
                                      alignment: Alignment.bottomRight,
                                      child: Text(_jam(angka(p['waktu'])),
                                          style: TextStyle(fontSize: 10.5, color: saya ? cs.onPrimary.withValues(alpha: 0.75) : (peran != 'Siswa' ? Colors.black54 : cs.onSurfaceVariant))),
                                    ),
                                  ]),
                                ),
                              ),
                            );
                          },
                        ),
        ),
        SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
            decoration: BoxDecoration(color: cs.surface, border: Border(top: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.5)))),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  maxLength: 500,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _kirim(),
                  decoration: InputDecoration(hintText: widget.petunjuk, counterText: '', isDense: true),
                ),
              ),
              const SizedBox(width: 6),
              IconButton.filled(
                onPressed: _mengirim ? null : _kirim,
                icon: _mengirim ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send_rounded),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}
