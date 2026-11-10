import 'package:flutter/material.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

String rp(dynamic n) {
  final v = (n is num ? n : num.tryParse('$n') ?? 0).round();
  final s = v.abs().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => '.');
  return '${v < 0 ? '-' : ''}Rp$s';
}

const _namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
String bulanIndo(String ym) {
  final p = ym.split('-');
  final b = p.length == 2 ? int.tryParse(p[1]) ?? 0 : 0;
  return b >= 1 && b <= 12 ? '${_namaBulan[b - 1]} ${p[0]}' : ym;
}

String _geser(String ym, int d) {
  final p = ym.split('-');
  final t = DateTime(int.parse(p[0]), int.parse(p[1]) + d, 1);
  return '${t.year}-${t.month.toString().padLeft(2, '0')}';
}

Color warnaHonor(BuildContext c, String s) => switch (s) {
      'Dibayar' => Colors.green,
      'Disetujui' || 'Dibayar Sebagian' => const Color(0xFF3B82F6),
      'Ditahan' => Theme.of(c).colorScheme.error,
      _ => const Color(0xFFE9A23B),
    };

class _KotakTunggakan extends StatelessWidget {
  const _KotakTunggakan({required this.t, this.batasHari});
  final Map<String, dynamic> t;
  final dynamic batasHari;

  @override
  Widget build(BuildContext context) {
    final d = daftar(t['diskusiMapel']).map(peta).toList();
    final u = daftar(t['ujianMapel']).map(peta).toList();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Theme.of(context).colorScheme.errorContainer, borderRadius: BorderRadius.circular(16)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Honor ditahan: masih ada tunggakan e-learning', style: TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        if (d.isNotEmpty) Text('Jawaban diskusi belum dinilai${batasHari != null ? ' (lebih dari $batasHari hari)' : ''}:'),
        for (final x in d) Text('• ${teks(x['mapel'])}: ${x['jumlah']} jawaban'),
        if (u.isNotEmpty) const Text('Pengajuan ujian siswa belum diproses:'),
        for (final x in u) Text('• ${teks(x['mapel'])}: ${x['jumlah']} pengajuan'),
        const SizedBox(height: 4),
        const Text('Selesaikan dulu agar honor bisa disetujui dan dibayarkan.', style: TextStyle(fontSize: 12.5)),
      ]),
    );
  }
}

class _RincianSesi extends StatelessWidget {
  const _RincianSesi({required this.sesi});
  final List<Map<String, dynamic>> sesi;

  @override
  Widget build(BuildContext context) => Column(children: [
        for (final s in sesi)
          ListTile(
            dense: true,
            visualDensity: VisualDensity.compact,
            leading: Icon(s['darurat'] == true ? Icons.warning_amber_rounded : Icons.check_circle_rounded, size: 18, color: s['darurat'] == true ? const Color(0xFFE9A23B) : Colors.green),
            title: Text('${tglIndo(teks(s['tanggal']))} · ${teks(s['mapel'])}'),
            subtitle: Text('Rombel ${teks(s['rombel'])} · ${teks(s['jam'])}${s['darurat'] == true ? ' · absen darurat' : ''}'),
            trailing: angka(s['tarif']) > 0 ? Text(rp(s['tarif'])) : null,
          ),
      ]);
}

/// Rincian honor bulanan: pertemuan wajib, tidak hadir, potongan, jadwal bayar.
class _RincianBulanan extends StatelessWidget {
  const _RincianBulanan({required this.b});
  final Map<String, dynamic> b;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final wajib = daftar(b['tanggalWajib']).map(teks).toList();
    final tidak = daftar(b['tidakHadir']).map(teks).toList();
    final libur = daftar(b['libur']).map(peta).toList();
    final total = angka(b['honor']) - angka(b['potongan']);
    Widget baris(String k, String v, {bool tebal = false, Color? warna}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(children: [
            Expanded(child: Text(k)),
            Text(v, style: TextStyle(fontWeight: tebal ? FontWeight.w800 : FontWeight.w600, color: warna)),
          ]),
        );
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: cs.surfaceContainerHighest.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        baris('Honor bulanan', rp(b['honor'])),
        baris('Pertemuan wajib (sesuai jadwal)', '${wajib.length} kali'),
        baris('Tidak hadir', '${tidak.length} kali', warna: tidak.isEmpty ? Colors.green : cs.error),
        if (wajib.isNotEmpty) baris('Potongan per pertemuan', rp(b['potonganPer'])),
        if (angka(b['potongan']) > 0) baris('Total potongan', '- ${rp(b['potongan'])}', warna: cs.error),
        const Divider(height: 14),
        baris('Honor diterima', rp(total < 0 ? 0 : total), tebal: true),
        if (teks(b['tanggalBayar']).isNotEmpty) baris('Jadwal bayar', tglIndo(teks(b['tanggalBayar']))),
        if (wajib.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Belum ada jadwal mengajar pada bulan ini, jadi tidak ada potongan. Atur di menu Jadwal Tatap Muka.',
                style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
          ),
        if (tidak.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text('Tanggal tidak hadir: ${tidak.map(tglIndo).join(', ')}', style: TextStyle(fontSize: 12.5, color: cs.error)),
        ],
        if (wajib.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text('Jadwal: ${wajib.map(tglIndo).join(', ')}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
        ],
        if (libur.isNotEmpty)
          Text('Libur: ${libur.map((l) => '${tglIndo(teks(l['tanggal']))} (${teks(l['ket'])})').join(', ')}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
      ]),
    );
  }
}

String _infoAturan(Map<String, dynamic> a, {dynamic honor}) {
  if (teks(a['mode'], 'bulanan') == 'kehadiran') {
    final tarif = a['tarifBerlaku'] ?? a['tarif'];
    return 'Tarif ${rp(tarif)} per ${a['satuan'] == 'hari' ? 'hari' : 'sesi'} hadir.';
  }
  final tgl = angka(a['tanggalBayar']) > 0 ? angka(a['tanggalBayar']) : 5;
  return 'Honor bulanan ${rp(honor ?? a['honorBulanan'])}. Setiap pertemuan terjadwal yang tidak dihadiri (apa pun alasannya) dipotong '
      'sebesar honor ÷ jumlah pertemuan bulan itu. Dibayar tanggal $tgl bulan berikutnya; bila hari Minggu, dibayar hari Senin.';
}

class _DaftarBayar extends StatelessWidget {
  const _DaftarBayar({required this.bayar});
  final List<Map<String, dynamic>> bayar;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (final b in bayar)
          ListTile(
            dense: true,
            leading: const Icon(Icons.payments_rounded, color: Colors.green),
            title: Text('${rp(b['jumlah'])} · ${tglIndo(teks(b['tanggal']))}'),
            subtitle: Text([teks(b['metode']), teks(b['rekening']), if (teks(b['oleh']).isNotEmpty) 'oleh ${teks(b['oleh'])}'].where((x) => x.isNotEmpty).join(' · ')),
            trailing: b['adaBukti'] == true
                ? IconButton(
                    tooltip: 'Lihat bukti',
                    icon: const Icon(Icons.receipt_long_rounded),
                    onPressed: () => lihatFoto(context, () async => peta(await Api.instance('waStafHonorBukti', [_t, teks(b['id'])]))),
                  )
                : null,
          ),
      ]);
}

/// Tutor: saldo honor, tunggakan, bulan berjalan, dan riwayat pembayaran.
class HonorSayaScreen extends StatelessWidget {
  const HonorSayaScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      muat: () async => peta(await Api.instance('waStafHonorSaya', [_t], const Duration(seconds: 150))),
      bangun: (context, d, _) {
        final saldo = peta(d['saldo']);
        final tg = peta(d['tunggakan']);
        final kini = peta(d['bulanIni']);
        final aturan = peta(d['aturan']);
        final rek = d['rekening'] == null ? null : peta(d['rekening']);
        final rekap = daftar(d['rekap']).map(peta).toList();
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(gradient: Gaya.gradasi, borderRadius: BorderRadius.circular(Gaya.radius)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Honor siap dibayar', style: TextStyle(color: Colors.white70)),
              Text(rp(saldo['belumDibayar']), style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
              const SizedBox(height: 8),
              Wrap(spacing: 16, runSpacing: 4, children: [
                Text('Sudah dibayar ${rp(saldo['sudahDibayar'])}', style: const TextStyle(color: Colors.white)),
                if (angka(saldo['ditahan']) > 0) Text('Ditahan ${rp(saldo['ditahan'])}', style: const TextStyle(color: Colors.white)),
              ]),
            ]),
          ),
          const SizedBox(height: 12),
          if (tg['ada'] == true) _KotakTunggakan(t: tg, batasHari: aturan['batasDiskusiHari']),
          if (tg['ada'] == true) const SizedBox(height: 12),
          Card(
            child: ExpansionTile(
              leading: const Icon(Icons.today_rounded),
              title: Text('${bulanIndo(teks(kini['bulan']))} (berjalan)', style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(kini['bulanan'] != null
                  ? 'Hadir ${angka(peta(kini['bulanan'])['wajib']) - daftar(peta(kini['bulanan'])['tidakHadir']).length} dari ${peta(kini['bulanan'])['wajib']} pertemuan sejauh ini · perkiraan ${rp(kini['total'])}'
                  : '${kini['jumlah']} ${aturan['satuan'] == 'hari' ? 'hari' : 'sesi'} hadir · perkiraan ${rp(kini['total'])}'),
              children: [
                if (kini['bulanan'] != null) _RincianBulanan(b: peta(kini['bulanan'])),
                _RincianSesi(sesi: daftar(kini['sesi']).map(peta).toList()),
              ],
            ),
          ),
          if (rek != null)
            Card(
              child: ListTile(
                leading: const Icon(Icons.account_balance_wallet_rounded),
                title: Text('${teks(rek['metode'])} · ${teks(rek['bank'])}'),
                subtitle: Text('${teks(rek['nomor'])} a.n. ${teks(rek['atasNama'])}'),
              ),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text('${_infoAturan({...aturan, 'tarifBerlaku': aturan['tarif']}, honor: aturan['honor'])} Kehadiran dicatat Kepala Sekolah.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
          ),
          JudulBagian('Riwayat honor', sub: '${rekap.length} bulan'),
          if (rekap.isEmpty) const Kosong(pesan: 'Belum ada rekap honor.', ikon: Icons.payments_outlined),
          for (final r in rekap)
            Card(
              child: ExpansionTile(
                title: Text(bulanIndo(teks(r['bulan'])), style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: Text('${r['jumlah']} hadir · ${rp(r['total'])}${angka(r['dibayar']) > 0 ? ' · dibayar ${rp(r['dibayar'])}' : ''}'
                    '${teks(r['tanggalBayar']).isNotEmpty && angka(r['sisa']) > 0 ? ' · jadwal bayar ${tglIndo(teks(r['tanggalBayar']))}' : ''}'),
                trailing: Lencana(teks(r['status']), warna: warnaHonor(context, teks(r['status']))),
                children: [
                  if (teks(r['catatan']).isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), child: Text(teks(r['catatan']), style: const TextStyle(fontSize: 12.5))),
                  _DaftarBayar(bayar: daftar(r['pembayaran']).map(peta).toList()),
                ],
              ),
            ),
        ]);
      },
    );
  }
}

/// Admin, Ketua Yayasan (Superadmin), Kepala Sekolah: rekap honor per bulan.
class RekapHonorScreen extends StatefulWidget {
  const RekapHonorScreen({super.key});

  @override
  State<RekapHonorScreen> createState() => _RekapHonorScreenState();
}

class _RekapHonorScreenState extends State<RekapHonorScreen> {
  late String _bulan;
  int _v = 0;

  @override
  void initState() {
    super.initState();
    final n = DateTime.now();
    _bulan = '${n.year}-${n.month.toString().padLeft(2, '0')}';
  }

  Future<void> _hitung() async {
    final r = await jalankan(context, () async => peta(await Api.instance('waStafHonorHitung', [_t, _bulan], const Duration(seconds: 200))), teksProses: 'Menghitung honor ${bulanIndo(_bulan)}...');
    if (r.ok && mounted) {
      final d = r.data!;
      kabar(context, '${d['baru']} rekap baru, ${d['diperbarui']} diperbarui${angka(d['terkunci']) > 0 ? ', ${d['terkunci']} terkunci (sudah disetujui/dibayar)' : ''}.');
      setState(() => _v++);
    }
  }

  Future<void> _setujui(Map<String, dynamic> r) async {
    final cat = await mintaTeks(context, 'Setujui honor ${teks(r['nama'])} ${rp(r['total'])}?', label: 'Catatan (opsional)');
    if (cat == null || !mounted) return;
    final h = await jalankan(context, () => Api.instance('waStafHonorSetujui', [_t, teks(r['id']), cat], const Duration(seconds: 150)), teksProses: 'Memeriksa tunggakan & menyetujui...');
    if (mounted) setState(() => _v++);
    if (h.ok && mounted) kabar(context, 'Honor disetujui.');
  }

  Future<void> _batal(Map<String, dynamic> r) async {
    final alasan = await mintaTeks(context, 'Batalkan persetujuan?', label: 'Alasan');
    if (alasan == null || !mounted) return;
    final h = await jalankan(context, () => Api.instance('waStafHonorBatalSetuju', [_t, teks(r['id']), alasan]), teksProses: 'Membatalkan...');
    if (h.ok && mounted) setState(() => _v++);
  }

  Future<void> _bayar(Map<String, dynamic> r) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _FormBayar(r: r)));
    if (ok == true && mounted) setState(() => _v++);
  }

  Future<void> _tunggakan(Map<String, dynamic> r) async {
    final h = await jalankan(context, () async => peta(await Api.instance('waStafHonorTunggakan', [_t, teks(r['tutor'])], const Duration(seconds: 120))), teksProses: 'Memeriksa tunggakan...');
    if (!h.ok || !mounted) return;
    final t = h.data!;
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Tunggakan ${teks(r['nama'])}'),
        content: t['ada'] == true ? _KotakTunggakan(t: t) : const Text('Tidak ada tunggakan e-learning saat ini.'),
        actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup'))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(children: [
      Container(
        color: cs.surfaceContainerLowest,
        padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
        child: Row(children: [
          IconButton(onPressed: () => setState(() => _bulan = _geser(_bulan, -1)), icon: const Icon(Icons.chevron_left_rounded)),
          Expanded(child: Text(bulanIndo(_bulan), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
          IconButton(onPressed: () => setState(() => _bulan = _geser(_bulan, 1)), icon: const Icon(Icons.chevron_right_rounded)),
        ]),
      ),
      Expanded(
        child: Muatan<Map<String, dynamic>>(
          key: ValueKey('$_bulan|$_v'),
          muat: () async => peta(await Api.instance('waStafHonorRekap', [_t, _bulan], const Duration(seconds: 150))),
          bangun: (context, d, _) {
            final rekap = daftar(d['rekap']).map(peta).toList();
            final belum = daftar(d['belumDihitung']).map(peta).toList();
            final peran = peta(d['peran']);
            final aturan = peta(d['aturan']);
            final total = rekap.fold<num>(0, (s, r) => s + (r['total'] as num? ?? 0));
            final dibayar = rekap.fold<num>(0, (s, r) => s + (r['dibayar'] as num? ?? 0));
            return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Total honor ${rp(total)} · dibayar ${rp(dibayar)}', style: const TextStyle(fontWeight: FontWeight.w800)),
                    if (teks(d['tanggalBayar']).isNotEmpty) Text('Jadwal bayar: ${tglIndo(teks(d['tanggalBayar']))}', style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text('${_infoAturan(aturan)}${teks(aturan['mode'], 'bulanan') == 'kehadiran' && peta(aturan['tarifProgram']).isNotEmpty ? ' (ada tarif khusus per program)' : ''} '
                        'Honor ditahan bila ada tunggakan e-learning.',
                        style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                    if (peran['kelola'] == true) ...[
                      const SizedBox(height: 8),
                      FilledButton.icon(onPressed: _hitung, icon: const Icon(Icons.calculate_rounded), label: Text(rekap.isEmpty ? 'Hitung honor bulan ini' : 'Hitung ulang')),
                    ],
                  ]),
                ),
              ),
              if (belum.isNotEmpty) ...[
                JudulBagian('Belum dihitung', sub: '${belum.length} tutor'),
                for (final b in belum)
                  Card(
                    child: ExpansionTile(
                      title: Text(teks(b['nama'])),
                      subtitle: Text('${b['jumlah']} hadir · ${rp(b['total'])} (pratinjau)'),
                      children: [
                        if (b['bulanan'] != null) _RincianBulanan(b: peta(b['bulanan'])),
                        _RincianSesi(sesi: daftar(b['sesi']).map(peta).toList()),
                      ],
                    ),
                  ),
              ],
              if (rekap.isEmpty && belum.isEmpty) const Kosong(pesan: 'Belum ada jadwal atau kehadiran tutor (tatap muka) pada bulan ini.', ikon: Icons.payments_outlined),
              if (rekap.isNotEmpty) JudulBagian('Rekap', sub: '${rekap.length} tutor'),
              for (final r in rekap)
                Card(
                  child: ExpansionTile(
                    title: Text(teks(r['nama']), style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text('${r['jumlah']} hadir · ${rp(r['total'])}${angka(r['dibayar']) > 0 ? ' · dibayar ${rp(r['dibayar'])}' : ''}${r['berubah'] == true ? ' · kehadiran berubah, hitung ulang' : ''}'),
                    trailing: Lencana(teks(r['status']), warna: warnaHonor(context, teks(r['status']))),
                    childrenPadding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
                    children: [
                      if (teks(r['catatan']).isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(8, 0, 8, 6), child: Text(teks(r['catatan']), style: const TextStyle(fontSize: 12.5))),
                      if (r['rekening'] != null)
                        ListTile(
                          dense: true,
                          leading: const Icon(Icons.account_balance_wallet_rounded),
                          title: Text('${teks(peta(r['rekening'])['metode'])} · ${teks(peta(r['rekening'])['bank'])}'),
                          subtitle: Text('${teks(peta(r['rekening'])['nomor'])} a.n. ${teks(peta(r['rekening'])['atasNama'])}'),
                        ),
                      if (r['bulanan'] != null) _RincianBulanan(b: peta(r['bulanan'])),
                      _RincianSesi(sesi: daftar(r['sesi']).map(peta).toList()),
                      _DaftarBayar(bayar: daftar(r['pembayaran']).map(peta).toList()),
                      Wrap(spacing: 8, runSpacing: 6, children: [
                        OutlinedButton.icon(onPressed: () => _tunggakan(r), icon: const Icon(Icons.rule_rounded, size: 18), label: const Text('Cek tunggakan')),
                        if (peran['setuju'] == true && (teks(r['status']) == 'Draft' || teks(r['status']) == 'Ditahan'))
                          FilledButton.icon(onPressed: () => _setujui(r), icon: const Icon(Icons.verified_rounded, size: 18), label: const Text('Setujui')),
                        if (peran['setuju'] == true && teks(r['status']) == 'Disetujui' && angka(r['dibayar']) == 0)
                          TextButton(onPressed: () => _batal(r), child: const Text('Batalkan persetujuan')),
                        if (peran['bayar'] == true && (teks(r['status']) == 'Disetujui' || teks(r['status']) == 'Dibayar Sebagian'))
                          FilledButton.tonalIcon(onPressed: () => _bayar(r), icon: const Icon(Icons.payments_rounded, size: 18), label: Text('Bayar ${rp(r['sisa'])}')),
                      ]),
                    ],
                  ),
                ),
            ]);
          },
        ),
      ),
    ]);
  }
}

class _FormBayar extends StatefulWidget {
  const _FormBayar({required this.r});
  final Map<String, dynamic> r;

  @override
  State<_FormBayar> createState() => _FormBayarState();
}

class _FormBayarState extends State<_FormBayar> {
  late final TextEditingController _jumlah;
  late final TextEditingController _metode;
  late final TextEditingController _rekening;
  final _sumber = TextEditingController(text: 'BOP');
  final _catatan = TextEditingController();
  DateTime _tgl = DateTime.now();
  String? _bukti;

  @override
  void initState() {
    super.initState();
    final rek = widget.r['rekening'] == null ? <String, dynamic>{} : peta(widget.r['rekening']);
    _jumlah = TextEditingController(text: '${angka(widget.r['sisa'])}');
    _metode = TextEditingController(text: teks(rek['metode']));
    _rekening = TextEditingController(text: [teks(rek['bank']), teks(rek['nomor']), teks(rek['atasNama'])].where((x) => x.isNotEmpty).join(' · '));
  }

  @override
  void dispose() {
    for (final c in [_jumlah, _metode, _rekening, _sumber, _catatan]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _simpan() async {
    final j = int.tryParse(_jumlah.text.replaceAll(RegExp(r'[^\d]'), '')) ?? 0;
    if (j <= 0) return kabar(context, 'Isi jumlah pembayaran.', galat: true);
    if (!await konfirmasi(context, 'Catat pembayaran ${rp(j)}?', 'Untuk ${teks(widget.r['nama'])} bulan ${bulanIndo(teks(widget.r['bulan']))}. Pembayaran otomatis tercatat sebagai pengeluaran honor (HON) di Keuangan.', ya: 'Catat')) return;
    if (!mounted) return;
    final h = await jalankan(context, () => Api.instance('waStafHonorBayar', [
          _t,
          teks(widget.r['id']),
          {'jumlah': j, 'tanggal': tglIso(_tgl), 'metode': _metode.text, 'rekening': _rekening.text, 'sumberDana': _sumber.text, 'catatan': _catatan.text, if (_bukti != null) 'bukti': _bukti}
        ], const Duration(seconds: 150)), teksProses: 'Mencatat pembayaran...');
    if (h.ok && mounted) {
      kabar(context, 'Pembayaran tercatat.');
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.r;
    return Scaffold(
      appBar: AppBar(title: const Text('Catat pembayaran honor')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('${teks(r['nama'])} · ${bulanIndo(teks(r['bulan']))}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        Text('Total ${rp(r['total'])} · sudah dibayar ${rp(r['dibayar'])} · sisa ${rp(r['sisa'])}'),
        const SizedBox(height: 14),
        TextField(controller: _jumlah, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah dibayar (Rp)')),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () async {
            final n = DateTime.now();
            final d = await showDatePicker(context: context, firstDate: n.subtract(const Duration(days: 365)), lastDate: n, initialDate: _tgl);
            if (d != null) setState(() => _tgl = d);
          },
          icon: const Icon(Icons.event_rounded),
          label: Text('Tanggal bayar ${tglIndo(tglIso(_tgl))}'),
        ),
        const SizedBox(height: 10),
        TextField(controller: _metode, decoration: const InputDecoration(labelText: 'Metode (Rekening Bank / E-Wallet / Tunai)')),
        const SizedBox(height: 10),
        TextField(controller: _rekening, decoration: const InputDecoration(labelText: 'Rekening tujuan')),
        const SizedBox(height: 10),
        TextField(controller: _sumber, decoration: const InputDecoration(labelText: 'Sumber dana', hintText: 'mis. BOP')),
        const SizedBox(height: 10),
        TextField(controller: _catatan, decoration: const InputDecoration(labelText: 'Catatan (opsional)')),
        const SizedBox(height: 10),
        Row(children: [
          OutlinedButton.icon(
            onPressed: () async {
              final f = await ambilFoto(bolehGaleri: true, context: context);
              if (f != null) setState(() => _bukti = f);
            },
            icon: const Icon(Icons.receipt_long_rounded),
            label: Text(_bukti == null ? 'Lampirkan bukti transfer (opsional)' : 'Ganti bukti'),
          ),
          if (_bukti != null) const Padding(padding: EdgeInsets.only(left: 8), child: Icon(Icons.check_circle_rounded, color: Colors.green)),
        ]),
        const SizedBox(height: 20),
        FilledButton.icon(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: _simpan, icon: const Icon(Icons.save_rounded), label: const Text('Catat pembayaran')),
      ]),
    );
  }
}

/// Admin: aturan honor (dapat diubah tanpa mengubah kode).
class AturanHonorScreen extends StatefulWidget {
  const AturanHonorScreen({super.key});

  @override
  State<AturanHonorScreen> createState() => _AturanHonorScreenState();
}

class _AturanHonorScreenState extends State<AturanHonorScreen> {
  Map<String, dynamic>? _a;
  String? _galat;
  bool _bolehUbah = false;
  String _mode = 'bulanan';
  String _satuan = 'sesi';
  bool _cekDiskusi = true;
  bool _cekUjian = true;
  final _honor = TextEditingController();
  final _tglBayar = TextEditingController();
  final _tarif = TextEditingController();
  final _batas = TextEditingController();
  final _sumber = TextEditingController();
  final _cariTutor = TextEditingController();
  final Map<String, TextEditingController> _prog = {for (final k in ['PKT-A', 'PKT-B', 'PKT-C']) k: TextEditingController()};
  final Map<String, TextEditingController> _honorTutor = {};
  List<Map<String, dynamic>> _tutor = [];
  List<Map<String, dynamic>> _libur = [];

  @override
  void initState() {
    super.initState();
    _muat();
  }

  @override
  void dispose() {
    for (final c in [_honor, _tglBayar, _tarif, _batas, _sumber, _cariTutor, ..._prog.values, ..._honorTutor.values]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _muat() async {
    try {
      final d = peta(await Api.instance('waStafHonorAturan', [_t]));
      final a = peta(d['aturan']);
      _bolehUbah = d['bolehUbah'] == true;
      _mode = teks(a['mode'], 'bulanan');
      _satuan = teks(a['satuan'], 'sesi');
      _cekDiskusi = a['cekDiskusi'] != false;
      _cekUjian = a['cekUjian'] != false;
      _honor.text = '${a['honorBulanan'] ?? 250000}';
      _tglBayar.text = '${a['tanggalBayar'] ?? 5}';
      _tarif.text = a['tarif'] == null ? '' : '${a['tarif']}';
      _batas.text = '${a['batasDiskusiHari'] ?? 7}';
      _sumber.text = teks(a['sumberDana'], 'BOP');
      final tp = peta(a['tarifProgram']);
      _prog.forEach((k, c) => c.text = tp[k] == null ? '' : '${tp[k]}');
      _tutor = daftar(d['tutor']).map(peta).toList();
      final ht = peta(a['honorTutor']);
      for (final t in _tutor) {
        final id = teks(t['id']);
        (_honorTutor[id] ??= TextEditingController()).text = ht[id] == null ? '' : '${ht[id]}';
      }
      _libur = daftar(a['libur']).map(peta).toList();
      if (mounted) setState(() { _a = a; _galat = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  int? _angka(TextEditingController c) => c.text.trim().isEmpty ? null : int.tryParse(c.text.replaceAll(RegExp(r'[^\d]'), ''));

  Future<void> _tambahLibur() async {
    final n = DateTime.now();
    final d = await showDatePicker(context: context, firstDate: DateTime(n.year - 1), lastDate: DateTime(n.year + 2), initialDate: n, helpText: 'Tanggal libur');
    if (d == null || !mounted) return;
    final ket = await mintaTeks(context, 'Keterangan libur ${tglIndo(tglIso(d))}', label: 'mis. Libur nasional');
    if (ket == null || !mounted) return;
    setState(() {
      _libur.removeWhere((l) => teks(l['tanggal']) == tglIso(d));
      _libur.add({'tanggal': tglIso(d), 'ket': ket.trim().isEmpty ? 'Libur' : ket.trim()});
      _libur.sort((x, y) => teks(x['tanggal']).compareTo(teks(y['tanggal'])));
    });
  }

  Future<void> _simpan() async {
    final tp = <String, dynamic>{};
    _prog.forEach((k, c) { final n = _angka(c); if (n != null && n > 0) tp[k] = n; });
    final ht = <String, dynamic>{};
    _honorTutor.forEach((k, c) { final n = _angka(c); if (n != null) ht[k] = n; });
    final tgl = int.tryParse(_tglBayar.text.trim()) ?? 5;
    if (tgl < 1 || tgl > 28) return kabar(context, 'Tanggal bayar harus 1–28.', galat: true);
    final r = await jalankan(context, () => Api.instance('waAdminHonorAturanSimpan', [
          _t,
          {
            'mode': _mode,
            'honorBulanan': _angka(_honor) ?? 250000,
            'honorTutor': ht,
            'tanggalBayar': tgl,
            'libur': _libur,
            'satuan': _satuan,
            'tarif': _angka(_tarif),
            'tarifProgram': tp,
            'cekDiskusi': _cekDiskusi,
            'batasDiskusiHari': int.tryParse(_batas.text.trim()) ?? 7,
            'cekUjian': _cekUjian,
            'sumberDana': _sumber.text.trim(),
          }
        ]), teksProses: 'Menyimpan aturan...');
    if (r.ok && mounted) { kabar(context, 'Aturan honor tersimpan. Berlaku untuk rekap yang belum disetujui (tekan Hitung ulang).'); _muat(); }
  }

  @override
  Widget build(BuildContext context) {
    if (_galat != null) return PesanGalat(pesan: _galat!, ulangi: _muat);
    final a = _a;
    if (a == null) return const Center(child: CircularProgressIndicator());
    final cs = Theme.of(context).colorScheme;
    final ro = !_bolehUbah;
    final bawaan = _angka(_honor) ?? 250000;
    final q = _cariTutor.text.trim().toLowerCase();
    final tutorTampil = _tutor.where((t) => q.isEmpty || teks(t['nama']).toLowerCase().contains(q)).toList();
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      if (ro) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('Hanya Admin yang dapat mengubah aturan ini.', style: TextStyle(color: cs.onSurfaceVariant))),
      const JudulBagian('Cara perhitungan'),
      SegmentedButton<String>(
        segments: const [ButtonSegment(value: 'bulanan', label: Text('Honor bulanan')), ButtonSegment(value: 'kehadiran', label: Text('Per kehadiran'))],
        selected: {_mode},
        onSelectionChanged: ro ? null : (s) => setState(() => _mode = s.first),
      ),
      const SizedBox(height: 12),
      if (_mode == 'bulanan') ...[
        TextField(controller: _honor, enabled: !ro, keyboardType: TextInputType.number, onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Honor bulanan bawaan (Rp)', helperText: 'Berlaku untuk tutor yang tidak diatur khusus di bawah')),
        const SizedBox(height: 12),
        TextField(controller: _tglBayar, enabled: !ro, keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Tanggal pembayaran (bulan berikutnya)', helperText: 'Bila jatuh hari Minggu, dibayar hari Senin')),
        const SizedBox(height: 8),
        Text('Potongan per pertemuan = honor bulanan ÷ jumlah pertemuan wajib bulan itu (sesuai Jadwal Tatap Muka tutor, dikurangi hari libur). '
            'Contoh ${rp(bawaan)}: 4 pertemuan → ${rp(bawaan / 4)} per pertemuan; 5 pertemuan → ${rp(bawaan / 5)}. Semua ketidakhadiran dipotong.',
            style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
        JudulBagian('Hari libur', sub: '${_libur.length} tanggal · tidak dihitung sebagai pertemuan wajib'),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final l in _libur)
            InputChip(
              label: Text('${tglIndo(teks(l['tanggal']))} · ${teks(l['ket'])}'),
              onDeleted: ro ? null : () => setState(() => _libur.remove(l)),
            ),
          if (!ro) ActionChip(avatar: const Icon(Icons.add_rounded, size: 18), label: const Text('Tambah libur'), onPressed: _tambahLibur),
        ]),
        JudulBagian('Honor khusus per tutor', sub: 'Kosong = ${rp(bawaan)}'),
        if (_tutor.length > 8)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: TextField(controller: _cariTutor, onChanged: (_) => setState(() {}), decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari tutor', isDense: true)),
          ),
        if (_tutor.isEmpty) Text('Tidak ada data tutor aktif.', style: TextStyle(color: cs.onSurfaceVariant)),
        for (final t in tutorTampil)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(children: [
              Expanded(child: Text(teks(t['nama']), style: const TextStyle(fontWeight: FontWeight.w600))),
              SizedBox(
                width: 150,
                child: TextField(
                  controller: _honorTutor[teks(t['id'])],
                  enabled: !ro,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(isDense: true, prefixText: 'Rp ', hintText: '$bawaan'),
                ),
              ),
            ]),
          ),
      ] else ...[
        SegmentedButton<String>(
          segments: const [ButtonSegment(value: 'sesi', label: Text('Per sesi hadir')), ButtonSegment(value: 'hari', label: Text('Per hari hadir'))],
          selected: {_satuan},
          onSelectionChanged: ro ? null : (s) => setState(() => _satuan = s.first),
        ),
        const SizedBox(height: 12),
        TextField(controller: _tarif, enabled: !ro, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: 'Tarif (Rp)', helperText: 'Kosongkan untuk mengikuti Pengaturan Lembaga (${rp(a['tarifSim'])})')),
        const SizedBox(height: 12),
        Text('Tarif khusus per program (opsional, kosong = tarif di atas)', style: TextStyle(color: cs.onSurfaceVariant)),
        const SizedBox(height: 6),
        Row(children: [
          for (final k in _prog.keys) ...[
            Expanded(child: TextField(controller: _prog[k], enabled: !ro, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: k, isDense: true))),
            if (k != _prog.keys.last) const SizedBox(width: 8),
          ],
        ]),
      ],
      const JudulBagian('Syarat honor cair (tunggakan e-learning)'),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        value: _cekDiskusi,
        onChanged: ro ? null : (v) => setState(() => _cekDiskusi = v),
        title: const Text('Tahan bila ada jawaban diskusi belum dinilai'),
      ),
      TextField(controller: _batas, enabled: _cekDiskusi && !ro, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Batas waktu menilai (hari sejak jawaban dikirim)')),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        value: _cekUjian,
        onChanged: ro ? null : (v) => setState(() => _cekUjian = v),
        title: const Text('Tahan bila ada pengajuan ujian siswa belum diproses tutor'),
      ),
      const SizedBox(height: 8),
      TextField(controller: _sumber, enabled: !ro, decoration: const InputDecoration(labelText: 'Sumber dana bawaan untuk pembayaran honor')),
      const SizedBox(height: 16),
      if (!ro) FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: _simpan, child: const Text('Simpan aturan')),
      const SizedBox(height: 8),
      Text('Perubahan aturan hanya berlaku untuk rekap yang belum disetujui. Rekap yang sudah disetujui/dibayar terkunci.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
    ]);
  }
}
