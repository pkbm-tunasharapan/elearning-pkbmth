import 'package:flutter/material.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../honor/honor.dart' show rp;
import '../session.dart';
import '../siswa/sesi_siswa.dart';
import '../widgets.dart';

/// v1.70.0: Analisa Kelayakan Ujian (UTS, UAS, dan UPK untuk kelas akhir).
/// Akademik: ketuntasan sesi & absensi (online + 10% x tatap muka) minimal sesuai syarat; keuangan: tagihan jatuh tempo lunas.
/// Permohonan: siswa (tombol saat Belum layak) / form orang tua oleh petugas -> rekomendasi bagian -> keputusan KS.

String? get _t => Sesi.instance.token;

Color warnaKelayakan(BuildContext c, String s) => switch (s) {
      'Layak' => Colors.green,
      'Layak dengan catatan' => const Color(0xFFE9A23B),
      'Belum layak' => Theme.of(c).colorScheme.error,
      _ => Theme.of(c).colorScheme.outline,
    };

String _pct(dynamic v) => v == null ? '–' : '${v is num ? (v == v.roundToDouble() ? v.round() : v) : v}%';

// ───────────────────────── tampilan bersama ─────────────────────────

/// Kartu satu jenis ujian (UTS / UAS / UPK) untuk satu siswa.
class KartuKelayakan extends StatelessWidget {
  const KartuKelayakan({super.key, required this.u, this.keu, this.syarat = 80, this.rinci = false, this.aksi = const []});
  final Map<String, dynamic> u;
  final Map<String, dynamic>? keu;
  final num syarat;
  final bool rinci;
  final List<Widget> aksi;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final st = teks(u['status']);
    final mapel = daftar(u['mapel']).map(peta).toList();
    final upk = teks(u['ujian']) == 'UPK';
    final aktif = peta(u['aktif']);
    final terakhir = peta(u['terakhir']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(upk ? 'UPK (kelas akhir)' : teks(u['ujian']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const Spacer(),
            Lencana(st, warna: warnaKelayakan(context, st)),
          ]),
          if (upk) Text('Hanya menilai keuangan.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
          for (final c in daftar(u['catatan'])) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Catatan · ${teks(c)}', style: const TextStyle(fontSize: 12.5, fontStyle: FontStyle.italic))),
          if (mapel.isNotEmpty) ...[
            const SizedBox(height: 8),
            for (final m in mapel) _BarisMapel(m: m, syarat: syarat, rinci: rinci),
          ],
          if (keu != null) ...[
            const Divider(height: 18),
            Row(children: [
              Icon(keu!['ok'] == true ? Icons.check_circle_rounded : Icons.error_outline_rounded, size: 18, color: keu!['ok'] == true ? Colors.green : cs.error),
              const SizedBox(width: 6),
              Expanded(child: Text(keu!['ok'] == true ? 'Tagihan jatuh tempo lunas' : 'Sisa tagihan ${rp(keu!['sisa'])}', style: const TextStyle(fontWeight: FontWeight.w600))),
              if (u['izinKeu'] == true && keu!['ok'] != true) const Text('(izin KS)', style: TextStyle(fontSize: 12)),
            ]),
            if (rinci)
              for (final tg in daftar(keu!['tagihan']).map(peta))
                Padding(
                  padding: const EdgeInsets.only(left: 24, top: 2),
                  child: Text('${teks(tg['nama'])} · sisa ${rp(tg['sisa'])}${teks(tg['jatuhTempo']).isEmpty ? '' : ' · jatuh tempo ${tglIndo(teks(tg['jatuhTempo']))}'}', style: const TextStyle(fontSize: 12.5)),
                ),
          ],
          if (aktif.isNotEmpty) _InfoAju(x: aktif, judul: 'Permohonan sedang diproses'),
          if (aktif.isEmpty && terakhir.isNotEmpty && teks(terakhir['status']) != 'Disetujui') _InfoAju(x: terakhir, judul: 'Permohonan terakhir'),
          if (aksi.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Wrap(spacing: 8, runSpacing: 6, children: aksi)),
        ]),
      ),
    );
  }
}

class _BarisMapel extends StatelessWidget {
  const _BarisMapel({required this.m, required this.syarat, required this.rinci});
  final Map<String, dynamic> m;
  final num syarat;
  final bool rinci;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final t = peta(m['tuntas']), a = peta(m['absen']), on = peta(a['online']), tm = peta(a['tatapMuka']);
    final ok = m['ok'] == true;
    final kurang = daftar(t['kurang']).map(peta).toList();
    Widget nilai(String label, dynamic v, bool baik) => Text('$label ${_pct(v)}',
        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: v == null ? cs.onSurfaceVariant : (baik ? Colors.green.shade700 : cs.error)));
    final isi = Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(ok ? Icons.check_circle_outline_rounded : Icons.cancel_outlined, size: 18, color: ok ? Colors.green : cs.error),
        const SizedBox(width: 6),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(teks(m['nama']), style: const TextStyle(fontWeight: FontWeight.w600)),
            Wrap(spacing: 12, children: [
              nilai('Tuntas', t['persen'], m['okTuntas'] == true),
              nilai('Absensi', a['persen'], m['okAbsen'] == true),
            ]),
            if (rinci)
              Text('Sesi ${angka(t['done'])}/${angka(t['total'])} item · online ${angka(on['hadir'])}/${angka(on['total'])}'
                  '${angka(tm['total']) > 0 ? ' · tatap muka ${angka(tm['hadir'])}/${angka(tm['total'])} (+${_pct(tm['persen'] is num ? (tm['persen'] as num) / 10 : null)})' : ''}',
                  style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
          ]),
        ),
      ]),
    );
    if (!rinci || kurang.isEmpty) return isi;
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(left: 24, bottom: 6),
        title: isi,
        subtitle: Text('${kurang.length} item belum dikerjakan · ketuk untuk melihat', style: TextStyle(fontSize: 11.5, color: cs.error)),
        children: [
          for (final k in kurang)
            Align(
              alignment: Alignment.centerLeft,
              child: Text('Sesi ${angka(k['sesi'])} · ${teks(k['jenis']) == 'Materi' ? 'baca' : (teks(k['jenis']) == 'Diskusi' ? 'tanggapi diskusi' : 'kerjakan')}: ${teks(k['judul'])}',
                  style: const TextStyle(fontSize: 12.5)),
            ),
        ],
      ),
    );
  }
}

class _InfoAju extends StatelessWidget {
  const _InfoAju({required this.x, required this.judul});
  final Map<String, dynamic> x;
  final String judul;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final baris = <String>[
      '${teks(x['jenis'])} · ${teks(x['status'])} · ${teks(x['waktu']).split(' ').first}${teks(x['sumber']).isEmpty ? '' : ' · ${teks(x['sumber'])}'}',
      if (teks(x['alasan']).isNotEmpty) 'Alasan: ${teks(x['alasan'])}',
      if (teks(x['janjiTanggal']).isNotEmpty) 'Janji bayar ${rp(x['janjiNominal'])} sampai ${tglIndo(teks(x['janjiTanggal']))}',
      if (teks(x['pernyataan']).isNotEmpty) 'Pernyataan orang tua: ${teks(x['pernyataan'])}',
      if (teks(x['rekAkademik']).isNotEmpty) 'Kurikulum: ${teks(x['rekAkademik'])} – ${teks(x['rekAkademikCatatan'])} (${teks(x['rekAkademikOleh'])})',
      if (teks(x['rekKeuangan']).isNotEmpty) 'Keuangan: ${teks(x['rekKeuangan'])} – ${teks(x['rekKeuanganCatatan'])} (${teks(x['rekKeuanganOleh'])})',
      if (teks(x['ksCatatan']).isNotEmpty) 'Kepala Sekolah: ${teks(x['ksCatatan'])} (${teks(x['ksOleh'])})',
      if (teks(x['panggilan']).isNotEmpty) 'Panggilan:\n${teks(x['panggilan'])}',
      if (teks(x['catatanSistem']).isNotEmpty) teks(x['catatanSistem']),
    ];
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: cs.surfaceContainerHighest.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(10)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(judul, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
        for (final b in baris) Padding(padding: const EdgeInsets.only(top: 2), child: Text(b, style: const TextStyle(fontSize: 12.5))),
      ]),
    );
  }
}

Future<String?> _isiTeks(BuildContext context, String judul, {String label = 'Catatan', String awal = '', String? keterangan, int minimal = 5}) async {
  final ctl = TextEditingController(text: awal);
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(judul),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (keterangan != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(keterangan, style: const TextStyle(fontSize: 13))),
        TextField(controller: ctl, minLines: 2, maxLines: 5, maxLength: 450, decoration: InputDecoration(labelText: label)),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Kirim'))],
    ),
  );
  final v = ctl.text.trim();
  ctl.dispose();
  if (ok != true) return null;
  if (v.length < minimal) {
    if (context.mounted) kabar(context, '$label minimal $minimal huruf.', galat: true);
    return null;
  }
  return v;
}

/// Dialog setuju / tidak + catatan. Hasil: (setuju, catatan) atau null.
Future<(bool, String)?> _pilihPutusan(BuildContext context, String judul, {String ya = 'Rekomendasikan', String tidak = 'Tidak direkomendasikan', String? keterangan}) async {
  final ctl = TextEditingController();
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(judul),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (keterangan != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(keterangan, style: const TextStyle(fontSize: 13))),
        TextField(controller: ctl, minLines: 2, maxLines: 5, maxLength: 400, decoration: const InputDecoration(labelText: 'Catatan')),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: const Text('Batal')),
        OutlinedButton(onPressed: () => Navigator.pop(c, false), child: Text(tidak)),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(ya)),
      ],
    ),
  );
  final v = ctl.text.trim();
  ctl.dispose();
  if (r == null) return null;
  if (v.length < 5) {
    if (context.mounted) kabar(context, 'Isi catatan minimal 5 huruf.', galat: true);
    return null;
  }
  return (r, v);
}

Future<({String tanggal, int nominal})?> _isiJanji(BuildContext context, num sisa, {String judul = 'Janji bayar'}) async {
  final nom = TextEditingController();
  var tgl = '';
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => StatefulBuilder(
      builder: (c, atur) => AlertDialog(
        title: Text(judul),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Sisa tagihan jatuh tempo ${rp(sisa)}. Tentukan kapan dan berapa yang akan dibayar.', style: const TextStyle(fontSize: 13)),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () async {
              final n = DateTime.now();
              final p = await showDatePicker(context: c, firstDate: n, lastDate: DateTime(n.year + 1), initialDate: n);
              if (p != null) atur(() => tgl = tglIso(p));
            },
            icon: const Icon(Icons.event_rounded),
            label: Text(tgl.isEmpty ? 'Pilih tanggal bayar' : tglIndo(tgl)),
          ),
          const SizedBox(height: 8),
          TextField(controller: nom, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Nominal yang akan dibayar', prefixText: 'Rp ')),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Lanjut'))],
      ),
    ),
  );
  final n = int.tryParse(nom.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
  nom.dispose();
  if (ok != true) return null;
  if (tgl.isEmpty || n <= 0) {
    if (context.mounted) kabar(context, 'Isi tanggal dan nominal janji bayar.', galat: true);
    return null;
  }
  return (tanggal: tgl, nominal: n);
}

// ───────────────────────── petugas ─────────────────────────

class KelayakanScreen extends StatefulWidget {
  const KelayakanScreen({super.key});

  @override
  State<KelayakanScreen> createState() => _KelayakanScreenState();
}

class _KelayakanScreenState extends State<KelayakanScreen> {
  String _rombel = '';
  String _tab = 'siswa';
  bool _hanyaBelum = false;
  int _v = 0;

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey('$_v|$_rombel'),
      muat: () async => peta(await Api.instance('waStafKelayakanDaftar', [_t, {'idRombel': _rombel}], const Duration(minutes: 3))),
      bangun: (context, d, segarkan) {
        final cs = Theme.of(context).colorScheme;
        final pr = peta(d['peran']);
        final rombel = daftar(d['rombel']).map(peta).toList();
        final idR = teks(d['idRombel']);
        final siswa = daftar(d['siswa']).map(peta).toList();
        bool belum(Map<String, dynamic> s) => peta(s['ujian']).values.any((u) => teks(peta(u)['status']) == 'Belum layak');
        final tampil = _hanyaBelum ? siswa.where(belum).toList() : siswa;
        final bolehAju = pr['keu'] == true;
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Card(
            color: cs.primaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Text('Periode ${teks(d['periode'])}. Syarat: ketuntasan sesi & absensi minimal ${_pct(d['syarat'])} '
                  '(absensi = online + ${_pct(d['tambahTm'])} × persen tatap muka). UTS dihitung sampai sebelum sesi ${angka(d['uts'])}, UAS seluruh semester'
                  '${pr['keu'] == true ? '; keuangan: tagihan jatuh tempo lunas. UPK (kelas akhir) hanya keuangan.' : '.'}'
                  '${pr['tutor'] == true ? '\nSebagai acuan pembinaan (tanpa keuangan).' : ''}'),
            ),
          ),
          if (bolehAju)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SegmentedButton<String>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: 'siswa', label: Text('Analisa siswa'), icon: Icon(Icons.fact_check_outlined)),
                  ButtonSegment(value: 'aju', label: Text('Permohonan'), icon: Icon(Icons.inbox_outlined)),
                ],
                selected: {_tab},
                onSelectionChanged: (v) => setState(() => _tab = v.first),
              ),
            ),
          if (_tab == 'aju' && bolehAju)
            _AntreanPermohonan(onBerubah: () => setState(() => _v++))
          else ...[
            DropdownButtonFormField<String>(
              key: ValueKey('rb$idR'),
              isExpanded: true,
              initialValue: rombel.any((r) => teks(r['id']) == idR) ? idR : null,
              decoration: const InputDecoration(labelText: 'Rombel', isDense: true),
              items: [
                for (final r in rombel)
                  DropdownMenuItem(value: teks(r['id']), child: Text('${teks(r['nama'])} (${angka(r['jumlah'])})${r['akhir'] == true ? ' · kelas akhir' : ''}', overflow: TextOverflow.ellipsis)),
              ],
              onChanged: (v) => setState(() => _rombel = v ?? ''),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              value: _hanyaBelum,
              onChanged: (v) => setState(() => _hanyaBelum = v),
              title: Text('Hanya yang belum layak (${siswa.where(belum).length} dari ${siswa.length})'),
            ),
            if (tampil.isEmpty) const Kosong(pesan: 'Tidak ada siswa di sini.', ikon: Icons.fact_check_outlined),
            for (final s in tampil)
              Card(
                child: ListTile(
                  title: Text(teks(s['nama']), style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Wrap(spacing: 6, runSpacing: 4, children: [
                      for (final e in peta(s['ujian']).entries)
                        Lencana('${e.key}: ${teks(peta(e.value)['status'])}', warna: warnaKelayakan(context, teks(peta(e.value)['status']))),
                    ]),
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () async {
                    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => KelayakanSiswaStafScreen(idWb: teks(s['id']), nama: teks(s['nama']), peran: pr, pernyataan: teks(d['pernyataan']))));
                    if (mounted) setState(() => _v++);
                  },
                ),
              ),
          ],
        ]);
      },
    );
  }
}

/// Rincian satu siswa untuk petugas + tindakan (panggil, form orang tua).
class KelayakanSiswaStafScreen extends StatefulWidget {
  const KelayakanSiswaStafScreen({super.key, required this.idWb, required this.nama, required this.peran, this.pernyataan = ''});
  final String idWb;
  final String nama;
  final Map<String, dynamic> peran;
  final String pernyataan;

  @override
  State<KelayakanSiswaStafScreen> createState() => _KelayakanSiswaStafScreenState();
}

class _KelayakanSiswaStafScreenState extends State<KelayakanSiswaStafScreen> {
  int _v = 0;

  Future<void> _panggil() async {
    final p = await _isiTeks(context, 'Panggil ${widget.nama}', label: 'Isi panggilan', minimal: 10,
        keterangan: 'Siswa menerima notifikasi berisi pesan ini, mis. waktu dan tempat menghadap untuk klarifikasi.');
    if (p == null || !mounted) return;
    final h = await jalankan(context, () => Api.instance('waStafKelayakanPanggil', [_t, {'idWb': widget.idWb, 'pesan': p}]));
    if (h.ok && mounted) kabar(context, 'Panggilan terkirim ke ${widget.nama}.');
  }

  Future<void> _ortu(String ujian, String bagian, num sisa) async {
    final args = <String, dynamic>{'idWb': widget.idWb, 'ujian': ujian, 'bagian': bagian};
    if (bagian == 'akademik') {
      final p = await _isiTeks(context, 'Pernyataan orang tua', label: 'Isi pernyataan', awal: widget.pernyataan, minimal: 20,
          keterangan: 'Orang tua/wali menghadap bagian kurikulum. Intinya: siap menjaga agar kejadian ini tidak terulang.');
      if (p == null || !mounted) return;
      args['pernyataan'] = p;
    } else {
      final j = await _isiJanji(context, sisa, judul: 'Janji bayar orang tua');
      if (j == null || !mounted) return;
      args['janjiTanggal'] = j.tanggal;
      args['janjiNominal'] = j.nominal;
    }
    if (!mounted) return;
    final r = await _pilihPutusan(context, 'Rekomendasi ${bagian == 'akademik' ? 'kurikulum' : 'keuangan'} · $ujian', keterangan: 'Permohonan diteruskan ke Kepala Sekolah untuk diputuskan.');
    if (r == null || !mounted) return;
    args['setuju'] = r.$1;
    args['catatan'] = r.$2;
    final h = await jalankan(context, () => Api.instance('waStafKelayakanOrtu', [_t, args]));
    if (h.ok && mounted) {
      kabar(context, 'Form orang tua tersimpan · ${teks(peta(h.data)['status'])}.');
      setState(() => _v++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pr = widget.peran;
    return Scaffold(
      appBar: AppBar(title: Text(widget.nama), actions: [
        if (pr['panggil'] == true) IconButton(tooltip: 'Panggil siswa', onPressed: _panggil, icon: const Icon(Icons.campaign_outlined)),
      ]),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async => peta(await Api.instance('waStafKelayakanSiswa', [_t, widget.idWb], const Duration(minutes: 2))),
        bangun: (context, d, segarkan) {
          final keu = d['keu'] == null ? null : peta(d['keu']);
          final riwayat = daftar(d['riwayat']).map(peta).toList();
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Text('${teks(d['rombel'])}${d['akhir'] == true ? ' · kelas akhir' : ''}', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            for (final e in peta(d['ujian']).entries)
              Builder(builder: (context) {
                final u = peta(e.value);
                final belum = teks(u['status']) == 'Belum layak';
                final aka = u['akaOk'] != true && u['izinAka'] != true, kurangKeu = u['keuOk'] != true && u['izinKeu'] != true;
                return KartuKelayakan(u: u, keu: keu, syarat: angka(d['syarat'], 80), rinci: true, aksi: [
                  if (belum && aka && pr['aka'] == true)
                    OutlinedButton.icon(onPressed: () => _ortu(e.key, 'akademik', 0), icon: const Icon(Icons.family_restroom_rounded, size: 18), label: const Text('Orang tua menghadap (kurikulum)')),
                  if (belum && kurangKeu && pr['keuAksi'] == true)
                    OutlinedButton.icon(onPressed: () => _ortu(e.key, 'keuangan', keu?['sisa'] ?? 0), icon: const Icon(Icons.family_restroom_rounded, size: 18), label: const Text('Orang tua menghadap (keuangan)')),
                ]);
              }),
            if (riwayat.isNotEmpty) ...[
              const JudulBagian('Riwayat permohonan'),
              for (final x in riwayat) _InfoAju(x: x, judul: '${teks(x['ujian'])} · ${teks(x['id'])}'),
            ],
          ]);
        },
      ),
    );
  }
}

class _AntreanPermohonan extends StatefulWidget {
  const _AntreanPermohonan({required this.onBerubah});
  final VoidCallback onBerubah;

  @override
  State<_AntreanPermohonan> createState() => _AntreanPermohonanState();
}

class _AntreanPermohonanState extends State<_AntreanPermohonan> {
  bool _semua = false;
  int _v = 0;

  Future<void> _rek(Map<String, dynamic> x, String bagian) async {
    final r = await _pilihPutusan(context, 'Rekomendasi ${bagian == 'akademik' ? 'kurikulum' : 'keuangan'} · ${teks(x['nama'])}');
    if (r == null || !mounted) return;
    final h = await jalankan(context, () => Api.instance('waStafKelayakanRekomendasi', [_t, {'id': teks(x['id']), 'bagian': bagian, 'setuju': r.$1, 'catatan': r.$2}]));
    if (h.ok && mounted) {
      kabar(context, 'Rekomendasi tersimpan · ${teks(peta(h.data)['status'])}.');
      setState(() => _v++);
    }
  }

  Future<void> _putus(Map<String, dynamic> x) async {
    final r = await _pilihPutusan(context, 'Keputusan · ${teks(x['nama'])} (${teks(x['ujian'])})', ya: 'Setujui', tidak: 'Tolak',
        keterangan: 'Disetujui = status menjadi Layak dengan catatan untuk ${teks(x['ujian'])}. Catatan ini tampil di semua layar.');
    if (r == null || !mounted) return;
    final h = await jalankan(context, () => Api.instance('waStafKelayakanPutus', [_t, {'id': teks(x['id']), 'setuju': r.$1, 'catatan': r.$2}]));
    if (h.ok && mounted) {
      kabar(context, 'Permohonan ${r.$1 ? 'disetujui' : 'ditolak'}.');
      setState(() => _v++);
      widget.onBerubah();
    }
  }

  Future<void> _panggil(Map<String, dynamic> x) async {
    final p = await _isiTeks(context, 'Panggil ${teks(x['nama'])}', label: 'Isi panggilan', minimal: 10);
    if (p == null || !mounted) return;
    final h = await jalankan(context, () => Api.instance('waStafKelayakanPanggil', [_t, {'idWb': teks(x['idWb']), 'pesan': p}]));
    if (h.ok && mounted) {
      kabar(context, 'Panggilan terkirim.');
      setState(() => _v++);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey('$_v|$_semua'),
      muat: () async => peta(await Api.instance('waStafKelayakanPermohonan', [_t, {'status': _semua ? 'semua' : 'aktif'}], const Duration(minutes: 2))),
      bangun: (context, d, segarkan) {
        final pr = peta(d['peran']);
        final data = daftar(d['data']).map(peta).toList();
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          SwitchListTile(contentPadding: EdgeInsets.zero, dense: true, value: _semua, onChanged: (v) => setState(() => _semua = v), title: const Text('Tampilkan juga yang sudah diputus')),
          if (data.isEmpty) const Kosong(pesan: 'Tidak ada permohonan.', ikon: Icons.inbox_outlined),
          for (final x in data)
            Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text('${teks(x['nama'])} · ${teks(x['rombel'])}', style: const TextStyle(fontWeight: FontWeight.w800))),
                    Lencana(teks(x['ujian']), warna: Theme.of(context).colorScheme.primary),
                  ]),
                  if (teks(x['mapelKurang']).isNotEmpty) Text('Kurang: ${teks(x['mapelKurang'])}', style: const TextStyle(fontSize: 12.5)),
                  if (x['sisaSaatAju'] is num && x['sisaSaatAju'] > 0) Text('Sisa tagihan saat mengajukan ${rp(x['sisaSaatAju'])}', style: const TextStyle(fontSize: 12.5)),
                  _InfoAju(x: x, judul: 'Permohonan'),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, runSpacing: 6, children: [
                    if (x['bolehRekAka'] == true) OutlinedButton(onPressed: () => _rek(x, 'akademik'), child: Text(teks(x['rekAkademik']).isEmpty ? 'Rekomendasi kurikulum' : 'Ubah rekomendasi kurikulum')),
                    if (x['bolehRekKeu'] == true) OutlinedButton(onPressed: () => _rek(x, 'keuangan'), child: Text(teks(x['rekKeuangan']).isEmpty ? 'Rekomendasi keuangan' : 'Ubah rekomendasi keuangan')),
                    if (x['bolehPutus'] == true) FilledButton(onPressed: () => _putus(x), child: const Text('Putuskan')),
                    if (pr['panggil'] == true && teks(x['status']).startsWith('Menunggu')) TextButton.icon(onPressed: () => _panggil(x), icon: const Icon(Icons.campaign_outlined, size: 18), label: const Text('Panggil')),
                  ]),
                ]),
              ),
            ),
        ]);
      },
    );
  }
}

// ───────────────────────── siswa ─────────────────────────

class KelayakanSiswaScreen extends StatefulWidget {
  const KelayakanSiswaScreen({super.key});

  @override
  State<KelayakanSiswaScreen> createState() => _KelayakanSiswaScreenState();
}

class _KelayakanSiswaScreenState extends State<KelayakanSiswaScreen> {
  int _v = 0;

  Future<void> _aju(String ujian, Map<String, dynamic> u, Map<String, dynamic> keu) async {
    final perluJanji = u['keuOk'] != true && u['izinKeu'] != true;
    final alasan = await _isiTeks(context, 'Permohonan kelayakan $ujian', label: 'Alasan', minimal: 10,
        keterangan: 'Permohonan dikirim ke ${u['akaOk'] != true && perluJanji ? 'bagian kurikulum dan keuangan' : (perluJanji ? 'bagian keuangan' : 'bagian kurikulum')}, '
            'lalu diputuskan Kepala Sekolah. Bila perlu klarifikasi, Anda akan dipanggil lewat notifikasi.');
    if (alasan == null || !mounted) return;
    final args = <String, dynamic>{'ujian': ujian, 'alasan': alasan};
    if (perluJanji) {
      final j = await _isiJanji(context, keu['sisa'] ?? 0);
      if (j == null || !mounted) return;
      args['janjiTanggal'] = j.tanggal;
      args['janjiNominal'] = j.nominal;
    }
    if (!mounted) return;
    final h = await jalankan(context, () => Api.instance('waSiswaKelayakanAju', [SesiSiswa.instance.token, args]));
    if (h.ok && mounted) {
      kabar(context, teks(peta(h.data)['pesan'], 'Permohonan terkirim.'));
      setState(() => _v++);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Kelayakan Ujian')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async => peta(await Api.instance('waSiswaKelayakan', [SesiSiswa.instance.token], const Duration(minutes: 2))),
        bangun: (context, d, segarkan) {
          final keu = peta(d['keu']);
          final riwayat = daftar(d['riwayat']).map(peta).toList();
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Card(
              color: Theme.of(context).colorScheme.primaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text('${teks(d['nama'])} · ${teks(d['rombel'])}\nSyarat ikut ujian: ketuntasan sesi (materi dibaca, diskusi ditanggapi, tugas dikerjakan) dan absensi minimal '
                    '${_pct(d['syarat'])} (kehadiran tatap muka menambah ${_pct(d['tambahTm'])} × persentasenya), serta tagihan jatuh tempo lunas.'),
              ),
            ),
            for (final e in peta(d['ujian']).entries)
              Builder(builder: (context) {
                final u = peta(e.value);
                return KartuKelayakan(u: u, keu: keu, syarat: angka(d['syarat'], 80), rinci: true, aksi: [
                  if (u['bolehAju'] == true)
                    FilledButton.icon(onPressed: () => _aju(e.key, u, keu), icon: const Icon(Icons.send_rounded, size: 18), label: const Text('Ajukan Permohonan')),
                ]);
              }),
            if (riwayat.isNotEmpty) ...[
              const JudulBagian('Riwayat permohonan'),
              for (final x in riwayat) _InfoAju(x: x, judul: '${teks(x['ujian'])} · ${teks(x['status'])}'),
            ],
          ]);
        },
      ),
    );
  }
}
