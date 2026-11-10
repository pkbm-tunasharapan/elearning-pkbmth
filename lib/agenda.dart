import 'package:flutter/material.dart';

import 'api.dart';
import 'theme.dart';
import 'widgets.dart';

/// Kartu "Agenda & Informasi" di beranda. Data dari server (waStafBeranda / waSiswaBeranda):
/// {kartu: [{judul, ikon, menu, ringkas, item: [{t, s, n, w}], kosong}]}.
class AgendaBeranda extends StatefulWidget {
  const AgendaBeranda({super.key, required this.kunci, required this.muat, this.onPilih, this.bolehMenu = const {}});
  final String kunci;
  final Future<dynamic> Function(bool paksa) muat;
  final void Function(String menu)? onPilih;
  final Set<String> bolehMenu;

  static final _versi = ValueNotifier<int>(0);
  static bool _paksa = false;
  static final Map<String, Map<String, dynamic>> _cache = {};

  /// Muat ulang semua kartu agenda (dipanggil saat beranda ditarik ke bawah).
  static void segarkan() {
    _paksa = true;
    _versi.value++;
  }

  @override
  State<AgendaBeranda> createState() => _AgendaBerandaState();
}

class _AgendaBerandaState extends State<AgendaBeranda> {
  Map<String, dynamic>? _d;
  String? _galat;
  bool _sibuk = false;

  @override
  void initState() {
    super.initState();
    _d = AgendaBeranda._cache[widget.kunci];
    AgendaBeranda._versi.addListener(_muat);
    _muat();
  }

  @override
  void dispose() {
    AgendaBeranda._versi.removeListener(_muat);
    super.dispose();
  }

  Future<void> _muat() async {
    if (_sibuk) return;
    _sibuk = true;
    try {
      final paksa = AgendaBeranda._paksa;
      AgendaBeranda._paksa = false;
      final d = peta(await widget.muat(paksa));
      AgendaBeranda._cache[widget.kunci] = d;
      if (mounted) setState(() { _d = d; _galat = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    } catch (e) {
      if (mounted) setState(() => _galat = 'Gagal memuat agenda.');
    } finally {
      _sibuk = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _d;
    if (d == null) {
      if (_galat != null) return PesanGalat(pesan: _galat!, ulangi: _muat);
      return const Padding(padding: EdgeInsets.all(28), child: Center(child: CircularProgressIndicator()));
    }
    final kartu = daftar(d['kartu']).map(peta).toList();
    final status = d['status'] is Map ? peta(d['status']) : null;
    if (kartu.isEmpty && status == null) return const Kosong(pesan: 'Belum ada agenda untuk ditampilkan.', ikon: Icons.event_available_rounded);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (status != null) _SpandukStatus(s: status),
      for (final k in kartu) _KartuAgenda(k: k, onPilih: widget.onPilih, bolehMenu: widget.bolehMenu),
      if (_galat != null) Text(_galat!, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.error)),
    ]);
  }
}

/// v1.38.4: spanduk status kondisi belajar siswa (Bahaya / Perlu perhatian / Baik) di atas beranda.
class _SpandukStatus extends StatelessWidget {
  const _SpandukStatus({required this.s});
  final Map<String, dynamic> s;

  @override
  Widget build(BuildContext context) {
    final level = teks(s['level']);
    final (Color warna, IconData ikon) = switch (level) {
      'bahaya' => (const Color(0xFFDC2626), Icons.dangerous_rounded),
      'perhatian' => (const Color(0xFFD97706), Icons.warning_amber_rounded),
      _ => (const Color(0xFF16A34A), Icons.verified_rounded),
    };
    String p(dynamic v) => v == null ? '–' : '${(v is num && v == v.roundToDouble()) ? v.toInt() : v}%';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: warna.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: warna, width: level == 'bahaya' ? 2 : 1),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(ikon, color: warna, size: 30),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(teks(s['judul']), style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15.5, color: warna)),
              const SizedBox(height: 6),
              Wrap(spacing: 8, runSpacing: 6, children: [
                _Angka('Kehadiran', p(s['hadir']), warna),
                _Angka('Penyelesaian sesi', p(s['selesai']), warna),
              ]),
              const SizedBox(height: 6),
              Text(teks(s['pesan']), style: const TextStyle(fontSize: 12.5)),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _Angka extends StatelessWidget {
  const _Angka(this.label, this.nilai, this.warna);
  final String label;
  final String nilai;
  final Color warna;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: warna.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(99)),
        child: Text('$label $nilai', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: warna)),
      );
}

IconData _ikon(String s) => switch (s) {
      'agenda' => Icons.event_rounded,
      'tugas' => Icons.rate_review_rounded,
      'nilai' => Icons.grade_rounded,
      'ujian' => Icons.assignment_turned_in_rounded,
      'hadir' => Icons.how_to_reg_rounded,
      'honor' => Icons.account_balance_wallet_rounded,
      'jadwal' => Icons.schedule_rounded,
      'kas' => Icons.account_balance_rounded,
      'setuju' => Icons.fact_check_rounded,
      'tagihan' => Icons.request_quote_rounded,
      'peringatan' => Icons.warning_amber_rounded,
      _ => Icons.info_outline_rounded,
    };

Color? _warna(BuildContext c, String w) => switch (w) {
      'merah' => Theme.of(c).colorScheme.error,
      'kuning' => const Color(0xFFD08A1E),
      'hijau' => const Color(0xFF2E9E5B),
      'biru' => const Color(0xFF3B82F6),
      _ => null,
    };

class _KartuAgenda extends StatefulWidget {
  const _KartuAgenda({required this.k, this.onPilih, required this.bolehMenu});
  final Map<String, dynamic> k;
  final void Function(String menu)? onPilih;
  final Set<String> bolehMenu;

  @override
  State<_KartuAgenda> createState() => _KartuAgendaState();
}

class _KartuAgendaState extends State<_KartuAgenda> {
  bool _semua = false;

  @override
  Widget build(BuildContext context) {
    final k = widget.k;
    final cs = Theme.of(context).colorScheme;
    final item = daftar(k['item']).map(peta).toList();
    final menu = teks(k['menu']);
    final bisa = menu.isNotEmpty && widget.onPilih != null && (widget.bolehMenu.isEmpty || widget.bolehMenu.contains(menu));
    final tampil = _semua ? item : item.take(4).toList();
    final ikon = teks(k['ikon']);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: cs.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(Gaya.radius),
        child: InkWell(
          borderRadius: BorderRadius.circular(Gaya.radius),
          onTap: bisa ? () => widget.onPilih!(menu) : null,
          child: Ink(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(Gaya.radius), boxShadow: Gaya.bayangan(context)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                IkonBulat(_ikon(ikon), warna: Gaya.warnaMenu(ikon), ukuran: 34),
                const SizedBox(width: 10),
                Expanded(child: Text(teks(k['judul']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5))),
                if (teks(k['ringkas']).isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(color: Gaya.ungu.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(99)),
                    child: Text(teks(k['ringkas']), style: const TextStyle(fontWeight: FontWeight.w800, color: Gaya.ungu)),
                  ),
                if (bisa) Icon(Icons.chevron_right_rounded, color: cs.outline),
              ]),
              const SizedBox(height: 6),
              if (item.isEmpty && teks(k['kosong']).isNotEmpty)
                Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text(teks(k['kosong']), style: TextStyle(color: cs.onSurfaceVariant, fontSize: 13))),
              for (final x in tampil)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Container(margin: const EdgeInsets.only(top: 6, right: 8), width: 6, height: 6, decoration: BoxDecoration(shape: BoxShape.circle, color: _warna(context, teks(x['w'])) ?? cs.outlineVariant)),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(teks(x['t']), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                        if (teks(x['s']).isNotEmpty) Text(teks(x['s']), maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                      ]),
                    ),
                    if (teks(x['n']).isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(left: 8),
                        child: Text(teks(x['n']), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: _warna(context, teks(x['w'])))),
                      ),
                  ]),
                ),
              if (item.length > 4)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(onPressed: () => setState(() => _semua = !_semua), child: Text(_semua ? 'Tampilkan lebih sedikit' : 'Lihat ${item.length - 4} lainnya')),
                ),
            ]),
          ),
        ),
      ),
    );
  }
}
