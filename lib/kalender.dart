import 'package:flutter/material.dart';

import 'api.dart';
import 'berkas.dart';
import 'session.dart';
import 'theme.dart';
import 'widgets.dart';

const _bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const _bulanP = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const _hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

DateTime? _tgl(dynamic iso) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(teks(iso));
  return m == null ? null : DateTime(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
}

String _iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
String _pendek(dynamic iso) {
  final d = _tgl(iso);
  return d == null ? '' : '${d.day} ${_bulanP[d.month - 1]}';
}

String _panjang(dynamic iso) {
  final d = _tgl(iso);
  return d == null ? '' : '${_hari[d.weekday % 7]}, ${d.day} ${_bulan[d.month - 1]} ${d.year}';
}

String _rentang(Map<String, dynamic> s) {
  final a = _tgl(s['mulai']), b = _tgl(s['selesai']);
  if (a == null || b == null) return teks(s['rentang']);
  return '${a.day}${a.month == b.month ? '' : ' ${_bulanP[a.month - 1]}'} – ${b.day} ${_bulanP[b.month - 1]} ${b.year}';
}

String _ujianTeks(Map<String, dynamic> u) {
  if (teks(u['tanggal']).isEmpty) return 'belum dijadwalkan';
  return '${_panjang(u['tanggal'])} pukul ${teks(u['jam'])} (${angka(u['durasi'])} menit)';
}

const _wBerjalan = Color(0xFF16A34A);
const _wUts = Color(0xFF7C3AED);
const _wUas = Color(0xFFDC2626);
const _wUpk = Color(0xFF0F766E); // v1.63.0: UPK (ujian kelulusan kelas akhir)
Color _wJenis(String j) => j == 'UTS' ? _wUts : (j == 'UPK' ? _wUpk : _wUas);
String _namaJenisSesi(String j) => j == 'UTS' ? 'Ujian Tengah Semester' : (j == 'UPK' ? 'Ujian Pendidikan Kesetaraan (UPK)' : 'Ujian Akhir Semester');
const _wTatapMuka = Color(0xFF1D4ED8);

/// Tampilan kalender akademik (sama dengan kalGambar_ di web): daftar sesi per semester dan kisi bulanan.
class KalenderView extends StatefulWidget {
  const KalenderView({super.key, required this.data, this.idMapelAwal = '', this.muatUlang, this.bisaCetak = false});
  final Map<String, dynamic> data;
  final String idMapelAwal;
  final Future<void> Function()? muatUlang;
  final bool bisaCetak;

  @override
  State<KalenderView> createState() => _KalenderViewState();
}

class _KalenderViewState extends State<KalenderView> {
  late String _mapel;
  bool _bulanan = false;
  int _smt = 1;
  late DateTime _bln;
  String _pilihSesi = '';

  Map<String, dynamic> get d => widget.data;
  List<Map<String, dynamic>> get _sesi => daftar(d['sesi']).map(peta).toList();
  List<Map<String, dynamic>> get _mapelSemua => daftar(d['mapel']).map(peta).toList();
  List<Map<String, dynamic>> get _mapelDipakai => _mapelSemua.where((m) => _mapel.isEmpty || teks(m['idMapel']) == _mapel).toList();

  @override
  void initState() {
    super.initState();
    _mapel = _mapelSemua.any((m) => teks(m['idMapel']) == widget.idMapelAwal) ? widget.idMapelAwal : '';
    final s = _sesi;
    Map<String, dynamic>? fokus = s.where((x) => teks(x['status']) == 'berjalan').firstOrNull;
    fokus ??= s.where((x) => teks(x['status']) == 'mendatang').firstOrNull;
    fokus ??= s.isEmpty ? null : s.last;
    _smt = fokus == null ? 1 : angka(fokus['smt'], 1);
    _pilihSesi = fokus == null ? '' : teks(fokus['key']);
    final t = fokus == null ? DateTime.now() : (_tgl(fokus['mulai']) ?? DateTime.now());
    _bln = DateTime(t.year, t.month);
  }

  List<Map<String, dynamic>> _baris(Map<String, dynamic> s) {
    final isi = peta(d['isi']);
    return [
      for (final m in _mapelDipakai)
        () {
          final c = peta(peta(isi[teks(m['idMapel'])])[teks(s['key'])]);
          final bag = <String>[];
          if (teks(c['topik']).isNotEmpty) {
            bag.add('Topik: ${teks(c['topik'])}${teks(c['bab']).isNotEmpty ? ' (${teks(c['bab'])})' : ''}${teks(c['halaman']).isNotEmpty ? ' · hlm. ${teks(c['halaman'])}' : ''}');
          }
          for (final j in daftar(c['materi'])) {
            if ('$j' != teks(c['topik'])) bag.add('Materi: $j');
          }
          for (final j in daftar(c['diskusi'])) {
            bag.add('Diskusi: $j');
          }
          // v1.53.0: jadwal tatap muka mingguan, asesmen tatap muka, dan ujian lain (Tryout / Ujian Lainnya)
          final jadwal = <String>[
            for (final a in daftar(c['asesmen']).map(peta))
              '${teks(a['jenis'], 'Asesmen')} tatap muka: ${_panjang(a['tanggal'])} pukul ${teks(a['mulai'])}–${teks(a['selesai'])}${teks(a['ruang']).isEmpty ? '' : ' · ${teks(a['ruang'])}'}',
            for (final u in daftar(c['ujianLain']).map(peta))
              '${teks(u['judul'], teks(u['jenis']))}: ${_panjang(u['tanggal'])} pukul ${teks(u['jam'])} (${angka(u['durasi'])} menit)',
          ];
          final tm = daftar(c['tatapMuka']).map(peta).toList();
          return {
            'mapel': teks(m['namaMapel']),
            'tutor': daftar(m['tutor']).join(', '),
            'bagian': bag,
            'ujian': c['ujian'] == null ? null : peta(c['ujian']),
            'jadwal': jadwal,
            'tatapMuka': tm.map((t) => '${teks(t['hari'])} ${_pendek(t['tanggal'])}, ${teks(t['mulai'])}–${teks(t['selesai'])}').toList(),
          };
        }(),
    ];
  }

  static const _cssCetak = '.kc-kop{text-align:center;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px}.kc-sekolah{font-size:13pt;font-weight:700}'
      '.kc-judul{font-size:11pt;font-weight:700}.kc-sub{font-size:9pt}table{border-collapse:collapse;width:100%}'
      'th,td{border:1px solid #444;padding:3px 4px;font-size:8pt;vertical-align:top;text-align:left}th{background:#e5e7eb}tr{page-break-inside:avoid}'
      'thead{display:table-header-group}.uj{font-weight:700;color:#b45309}.br{background:#dcfce7}.uts{background:#ede9fe}.uas{background:#fee2e2}.tm{color:#1d4ed8}.kc-hal{page-break-after:always}.kc-hal:last-child{page-break-after:auto}';

  String _htmlCetak() {
    final mapel = _mapelDipakai;
    final o = StringBuffer();
    final jmlSmt = _sesi.fold<int>(0, (a, s) => angka(s['smt']) > a ? angka(s['smt']) : a);
    for (var smt = 1; smt <= jmlSmt; smt++) {
      o.write('<div class="kc-hal"><div class="kc-kop"><div class="kc-sekolah">${escHtml(teks(peta(d['sekolah'])['nama'], 'PKBM TUNAS HARAPAN').toUpperCase())}</div>'
          '<div class="kc-judul">KALENDER AKADEMIK · ${escHtml(d['namaRombel'])}${teks(d['tahunAjaran']).isNotEmpty ? ' · ${escHtml(d['tahunAjaran'])}' : ''}</div>'
          '<div class="kc-sub">Semester $smt · Dicetak ${tanggalIni()}</div></div>');
      o.write('<table><thead><tr><th style="width:11%">Sesi</th><th style="width:13%">Tanggal</th>');
      for (final m in mapel) {
        o.write('<th>${escHtml(m['namaMapel'])}</th>');
      }
      o.write('</tr></thead><tbody>');
      for (final s in _sesi.where((s) => angka(s['smt']) == smt)) {
        final jenis = teks(s['jenis'], 'Biasa');
        final kls = jenis == 'UTS' ? 'uts' : (jenis == 'UAS' || jenis == 'UPK' ? 'uas' : (teks(s['status']) == 'berjalan' ? 'br' : ''));
        o.write('<tr class="$kls"><td><b>Sesi ${angka(s['n'])}</b>${jenis != 'Biasa' ? '<br>$jenis' : ''}</td><td>${escHtml(_rentang(s))}</td>');
        for (final r in _baris(s)) {
          final u = r['ujian'] as Map<String, dynamic>?;
          final bag = r['bagian'] as List<String>;
          final jd = r['jadwal'] as List<String>, tm = r['tatapMuka'] as List<String>;
          o.write('<td>${u != null ? '<div class="uj">${escHtml('${teks(u['jenis'])}: ${_ujianTeks(u)}')}</div>' : ''}${jd.map((b) => '<div class="uj">${escHtml(b)}</div>').join()}'
              '${tm.isEmpty ? '' : '<div class="tm">Tatap muka: ${escHtml(tm.join('; '))}</div>'}${bag.map((b) => '<div>${escHtml(b)}</div>').join()}</td>');
        }
        o.write('</tr>');
      }
      o.write('</tbody></table></div>');
    }
    return o.toString();
  }

  Widget _chip(String t, Color w) => Container(
        margin: const EdgeInsets.only(left: 4),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: w.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(99)),
        child: Text(t, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: w)),
      );

  Widget _kartuSesi(Map<String, dynamic> s) {
    final cs = Theme.of(context).colorScheme;
    final st = teks(s['status']);
    final jenis = teks(s['jenis'], 'Biasa');
    final w = jenis != 'Biasa' ? _wJenis(jenis) : (st == 'berjalan' ? _wBerjalan : cs.outlineVariant);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(Gaya.radius),
        border: Border(left: BorderSide(color: w, width: 5)),
        boxShadow: Gaya.bayangan(context),
      ),
      child: Opacity(
        opacity: st == 'lewat' ? 0.75 : 1,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Text('Sesi ${angka(s['n'])}${jenis != 'Biasa' ? ' · ${_namaJenisSesi(jenis)}' : ''}',
                    style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
              if (st == 'berjalan') _chip('berjalan', _wBerjalan) else if (st == 'lewat') _chip('selesai', cs.outline),
              if (jenis != 'Biasa') _chip(jenis, _wJenis(jenis)),
            ]),
            Text(_rentang(s), style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            for (final r in _baris(s)) ...[
              const Divider(height: 18),
              Text(r['mapel'] as String, style: const TextStyle(fontWeight: FontWeight.w700)),
              if ((r['tutor'] as String).isNotEmpty) Text('Tutor: ${r['tutor']}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              if (r['ujian'] != null)
                Builder(builder: (_) {
                  final u = r['ujian'] as Map<String, dynamic>;
                  final ada = teks(u['tanggal']).isNotEmpty;
                  return Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('${teks(u['jenis'])}: ${_ujianTeks(u)}${ada && angka(u['kkm']) > 0 ? ' · KKM ${angka(u['kkm'])}' : ''}',
                        style: TextStyle(fontWeight: FontWeight.w700, color: ada ? const Color(0xFFB45309) : cs.error, fontSize: 13)),
                  );
                }),
              for (final j in r['jadwal'] as List<String>)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(j, style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFB45309), fontSize: 13)),
                ),
              if ((r['tatapMuka'] as List).isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Icon(Icons.groups_rounded, size: 16, color: _wTatapMuka),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text('Tatap muka: ${(r['tatapMuka'] as List<String>).join('; ')}',
                          style: const TextStyle(fontSize: 13, color: _wTatapMuka, fontWeight: FontWeight.w600)),
                    ),
                  ]),
                ),
              for (final b in r['bagian'] as List<String>) Padding(padding: const EdgeInsets.only(top: 3), child: Text(b, style: const TextStyle(fontSize: 13.5))),
              if ((r['bagian'] as List).isEmpty && r['ujian'] == null && (r['jadwal'] as List).isEmpty && (r['tatapMuka'] as List).isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text('Belum ada rencana materi', style: TextStyle(fontSize: 13, fontStyle: FontStyle.italic, color: cs.onSurfaceVariant)),
                ),
            ],
          ]),
        ),
      ),
    );
  }

  Map<String, dynamic>? _sesiPada(DateTime h) {
    for (final s in _sesi) {
      final a = _tgl(s['mulai']), b = _tgl(s['selesai']);
      if (a != null && b != null && !h.isBefore(a) && !h.isAfter(b)) return s;
    }
    return null;
  }

  Map<String, List<Map<String, dynamic>>> _petaUjian() {
    final isi = peta(d['isi']);
    final out = <String, List<Map<String, dynamic>>>{};
    for (final m in _mapelDipakai) {
      for (final s in _sesi) {
        final c = peta(peta(isi[teks(m['idMapel'])])[teks(s['key'])]);
        final u = peta(c['ujian']);
        if (teks(u['tanggal']).isNotEmpty) out.putIfAbsent(teks(u['tanggal']), () => []).add({...u, 'mapel': teks(m['namaMapel'])});
        // v1.53.0: Tryout / Ujian Lainnya dan asesmen tatap muka ikut tampil di kisi bulanan
        for (final x in daftar(c['ujianLain']).map(peta)) {
          out.putIfAbsent(teks(x['tanggal']), () => []).add({...x, 'jenis': teks(x['judul'], teks(x['jenis'])), 'mapel': teks(m['namaMapel'])});
        }
        for (final a in daftar(c['asesmen']).map(peta)) {
          out.putIfAbsent(teks(a['tanggal']), () => []).add({
            'jenis': '${teks(a['jenis'], 'Asesmen')} tatap muka',
            'mapel': teks(m['namaMapel']),
            'jam': '${teks(a['mulai'])}–${teks(a['selesai'])}',
            'ket': teks(a['ruang'], 'tatap muka'),
          });
        }
      }
    }
    return out;
  }

  Widget _kisi() {
    final cs = Theme.of(context).colorScheme;
    final ujian = _petaUjian();
    final tmHari = <String>{
      for (final m in _mapelDipakai)
        for (final c in peta(peta(d['isi'])[teks(m['idMapel'])]).values)
          for (final t in daftar(peta(c)['tatapMuka']).map(peta)) teks(t['tanggal'])
    };
    final awal = DateTime(_bln.year, _bln.month, 1);
    final geser = awal.weekday % 7;
    final jml = DateTime(_bln.year, _bln.month + 1, 0).day;
    final hariIni = _iso(DateTime.now());
    final sel = <Widget>[
      for (final h in ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'])
        Center(child: Text(h, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: cs.onSurfaceVariant))),
      for (var i = 0; i < geser; i++) const SizedBox(),
      for (var t = 1; t <= jml; t++)
        Builder(builder: (_) {
          final h = DateTime(_bln.year, _bln.month, t);
          final s = _sesiPada(h);
          final jenis = s == null ? '' : teks(s['jenis'], 'Biasa');
          final w = s == null
              ? null
              : jenis != 'Biasa'
                  ? _wJenis(jenis)
                  : (teks(s['status']) == 'berjalan' ? _wBerjalan : cs.primary);
          final adaUjian = ujian.containsKey(_iso(h));
          final adaTm = tmHari.contains(_iso(h));
          final dipilih = s != null && teks(s['key']) == _pilihSesi;
          return InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: s == null ? null : () => setState(() => _pilihSesi = teks(s['key'])),
            child: Container(
              margin: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: w?.withValues(alpha: dipilih ? 0.28 : 0.1),
                borderRadius: BorderRadius.circular(10),
                border: _iso(h) == hariIni ? Border.all(color: cs.primary, width: 2) : null,
              ),
              child: Stack(children: [
                Center(child: Text('$t', style: TextStyle(fontWeight: adaUjian ? FontWeight.w900 : FontWeight.w600, color: adaUjian ? _wUas : null))),
                if (adaUjian) const Positioned(right: 4, top: 4, child: Icon(Icons.circle, size: 7, color: _wUas)),
                if (adaTm) const Positioned(left: 4, bottom: 4, child: Icon(Icons.groups_rounded, size: 10, color: _wTatapMuka)),
              ]),
            ),
          );
        }),
    ];
    final sesiPilih = _sesi.where((x) => teks(x['key']) == _pilihSesi).firstOrNull;
    final ujianBulan = ujian.entries.where((e) {
      final t = _tgl(e.key);
      return t != null && t.year == _bln.year && t.month == _bln.month;
    }).toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Card(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 8, 10),
          child: Column(children: [
            Row(children: [
              IconButton(onPressed: () => setState(() => _bln = DateTime(_bln.year, _bln.month - 1)), icon: const Icon(Icons.chevron_left_rounded)),
              Expanded(child: Text('${_bulan[_bln.month - 1]} ${_bln.year}', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
              IconButton(onPressed: () => setState(() => _bln = DateTime(_bln.year, _bln.month + 1)), icon: const Icon(Icons.chevron_right_rounded)),
            ]),
            GridView.count(crossAxisCount: 7, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), childAspectRatio: 1.05, children: sel),
            if (tmHari.isNotEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.groups_rounded, size: 14, color: _wTatapMuka),
                  SizedBox(width: 4),
                  Text('ada pertemuan tatap muka', style: TextStyle(fontSize: 11.5)),
                  SizedBox(width: 12),
                  Icon(Icons.circle, size: 8, color: _wUas),
                  SizedBox(width: 4),
                  Text('ada ujian', style: TextStyle(fontSize: 11.5)),
                ]),
              ),
          ]),
        ),
      ),
      if (ujianBulan.isNotEmpty) ...[
        const JudulBagian('Jadwal ujian & asesmen bulan ini'),
        Card(
          child: Column(children: [
            for (final e in ujianBulan)
              for (final u in e.value)
                ListTile(
                  dense: true,
                  leading: Icon(Icons.event_rounded, color: teks(u['jenis']) == 'UTS' ? _wUts : _wUas),
                  title: Text('${teks(u['jenis'])} · ${teks(u['mapel'])}'),
                  subtitle: Text('${_panjang(e.key)} · ${teks(u['jam'])}${u['durasi'] != null ? ' (${angka(u['durasi'])} menit)' : ''}${teks(u['ket']).isEmpty ? '' : ' · ${teks(u['ket'])}'}'),
                ),
          ]),
        ),
      ],
      if (sesiPilih != null) ...[const SizedBox(height: 12), _kartuSesi(sesiPilih)],
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final sesi = _sesi;
    final jmlSmt = sesi.fold<int>(0, (a, s) => angka(s['smt']) > a ? angka(s['smt']) : a);
    final mulai = _tgl(d['mulai']), selesai = _tgl(d['selesai']);
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(gradient: Gaya.gradasi, borderRadius: BorderRadius.circular(Gaya.radius)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Kalender Akademik · ${teks(d['namaRombel'])}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 4),
          Text(
            '${teks(d['tahunAjaran']).isNotEmpty ? '${teks(d['tahunAjaran'])} · ' : ''}'
            '${mulai == null ? '' : '${_pendek(d['mulai'])} ${mulai.year}'} – ${selesai == null ? '' : '${_pendek(d['selesai'])} ${selesai.year}'} · ${sesi.length} sesi',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 12.5),
          ),
        ]),
      ),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(
          child: SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('Daftar sesi'), icon: Icon(Icons.view_agenda_rounded)),
              ButtonSegment(value: true, label: Text('Kisi bulanan'), icon: Icon(Icons.calendar_view_month_rounded)),
            ],
            selected: {_bulanan},
            onSelectionChanged: (v) => setState(() => _bulanan = v.first),
          ),
        ),
        if (widget.bisaCetak && bolehUnduh)
          IconButton(
            tooltip: 'Cetak / PDF',
            onPressed: () => htmlKePdf(context, nama: 'Kalender_Akademik_${tanggalBerkas()}.pdf', args: [Sesi.instance.token, dokumenA4(_htmlCetak(), _cssCetak, lanskap: true)]),
            icon: const Icon(Icons.print_rounded),
          ),
        if (widget.muatUlang != null) IconButton(tooltip: 'Ambil data terbaru', onPressed: widget.muatUlang, icon: const Icon(Icons.refresh_rounded)),
      ]),
      const SizedBox(height: 10),
      DropdownButtonFormField<String>(
        initialValue: _mapel,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Mata pelajaran', isDense: true),
        items: [
          const DropdownMenuItem(value: '', child: Text('Semua mata pelajaran')),
          for (final m in _mapelSemua) DropdownMenuItem(value: teks(m['idMapel']), child: Text(teks(m['namaMapel']), overflow: TextOverflow.ellipsis)),
        ],
        onChanged: (v) => setState(() => _mapel = v ?? ''),
      ),
      const SizedBox(height: 8),
      Wrap(spacing: 4, children: [_chip('berjalan', _wBerjalan), _chip('UTS', _wUts), _chip('UAS', _wUas), if (_sesi.any((s) => teks(s['jenis']) == 'UPK')) _chip('UPK', _wUpk)]),
      const SizedBox(height: 12),
      if (_bulanan)
        _kisi()
      else ...[
        if (jmlSmt > 1)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: SegmentedButton<int>(
              segments: [for (var i = 1; i <= jmlSmt; i++) ButtonSegment(value: i, label: Text('Semester $i'))],
              selected: {_smt},
              onSelectionChanged: (v) => setState(() => _smt = v.first),
            ),
          ),
        for (final s in sesi.where((s) => angka(s['smt']) == _smt)) _kartuSesi(s),
        if (sesi.isEmpty) Text('Belum ada sesi.', style: TextStyle(color: cs.onSurfaceVariant)),
      ],
    ]);
  }
}

/// Kalender untuk siswa (waSiswaKalender).
class KalenderSiswaScreen extends StatefulWidget {
  const KalenderSiswaScreen({super.key, required this.idRombel, required this.nama});
  final String idRombel;
  final String nama;

  @override
  State<KalenderSiswaScreen> createState() => _KalenderSiswaScreenState();
}

class _KalenderSiswaScreenState extends State<KalenderSiswaScreen> {

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Kalender Akademik')),
      body: Muatan<Map<String, dynamic>>(
        muat: () async => peta(await Api.instance('waSiswaKalender', [widget.idRombel, widget.nama])),
        bangun: (c, d, _) => KalenderView(data: d),
      ),
    );
  }
}

/// Kalender untuk staf. Admin & pimpinan memilih rombel; tutor bisa membukanya dari mapel.
class KalenderStafScreen extends StatefulWidget {
  const KalenderStafScreen({super.key, this.idRombel, this.idMapel = '', this.denganAppBar = false});
  final String? idRombel;
  final String idMapel;
  final bool denganAppBar;

  @override
  State<KalenderStafScreen> createState() => _KalenderStafScreenState();
}

class _KalenderStafScreenState extends State<KalenderStafScreen> {
  String? _idRombel;
  int _v = 0;
  bool _segar = false;

  @override
  void initState() {
    super.initState();
    _idRombel = widget.idRombel;
  }

  Widget _isi() {
    if (_idRombel == null) {
      return Muatan<Map<String, dynamic>>(
        muat: () async => peta(await Api.instance('waStafKalenderDaftar', [Sesi.instance.token])),
        bangun: (c, d, _) {
          final rb = daftar(d['rombel']).map(peta).toList()..sort((a, b) => teks(a['namaRombel']).compareTo(teks(b['namaRombel'])));
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
            const JudulBagian('Pilih rombel', sub: 'Kalender akademik per kelas'),
            if (rb.isEmpty) const Kosong(pesan: 'Belum ada rombel yang bisa ditampilkan.'),
            Card(
              child: Column(children: [
                for (final r in rb)
                  ListTile(
                    leading: IkonBulat(Icons.calendar_month_rounded, warna: Gaya.warnaMenu(teks(r['namaRombel'])), ukuran: 40, sudut: 12),
                    title: Text(teks(r['namaRombel'])),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => setState(() => _idRombel = teks(r['idRombel'])),
                  ),
              ]),
            ),
          ]);
        },
      );
    }
    return Muatan<Map<String, dynamic>>(
      key: ValueKey('$_idRombel|$_v'),
      muat: () async {
        final r = peta(await Api.instance('waStafKalender', [Sesi.instance.token, _idRombel, _segar]));
        _segar = false;
        return r;
      },
      bangun: (c, d, _) => KalenderView(
        data: d,
        bisaCetak: true,
        idMapelAwal: widget.idMapel,
        muatUlang: () async => setState(() {
          _segar = true;
          _v++;
        }),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bisaKembali = widget.idRombel == null && _idRombel != null;
    if (!widget.denganAppBar && !bisaKembali) return _isi();
    return PopScope(
      canPop: !bisaKembali,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && bisaKembali) setState(() => _idRombel = null);
      },
      child: widget.denganAppBar
          ? Scaffold(appBar: AppBar(title: const Text('Kalender Akademik')), body: _isi())
          : Column(children: [
              Material(
                child: ListTile(
                  dense: true,
                  leading: const Icon(Icons.arrow_back_rounded),
                  title: const Text('Pilih rombel lain'),
                  onTap: () => setState(() => _idRombel = null),
                ),
              ),
              Expanded(child: _isi()),
            ]),
    );
  }
}
