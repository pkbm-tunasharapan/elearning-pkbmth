import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../honor/honor.dart' show rp;
import '../keuangan/bayar_online.dart';
import '../keuangan/kwitansi.dart';
import '../widgets.dart';
import 'sesi_siswa.dart';

String? get _t => SesiSiswa.instance.token;

/// v1.49.0: Tagihan Saya - tagihan aktif, bayar online (DOKU, di dalam aplikasi) atau transfer manual, riwayat.
class TagihanSiswaScreen extends StatefulWidget {
  const TagihanSiswaScreen({super.key});

  @override
  State<TagihanSiswaScreen> createState() => _TagihanSiswaScreenState();
}

class _TagihanSiswaScreenState extends State<TagihanSiswaScreen> {
  int _v = 0;

  Color _warna(BuildContext c, String s) => switch (s) {
        'Lunas' => Colors.green,
        'Sebagian' => const Color(0xFFE9A23B),
        _ => Theme.of(c).colorScheme.error,
      };

  Future<String> _cek(String invoice) async => teks(peta(await Api.instance('waSiswaCekBayar', [_t, invoice], const Duration(minutes: 1)))['status'], 'Menunggu');

  Future<void> _bayarOnline(Map<String, dynamic> d, Map<String, dynamic> t) async {
    final metode = daftar(d['metode']).map(peta).toList();
    final kode = await pilihMetodeBayar(context, pokok: angka(t['sisa']), metode: metode, judul: 'Bayar ${teks(t['nama'])}');
    if (kode == null || !mounted) return;
    final r = await jalankan(context, () async => peta(await Api.instance('waSiswaBayarOnline', [_t, teks(t['id']), kode], const Duration(minutes: 2))),
        teksProses: 'Menyiapkan pembayaran...');
    if (!r.ok || !mounted) return;
    final o = r.data!;
    if (!await konfirmasiTotalBayar(context, o) || !mounted) return;
    final lunas = await bukaPembayaranDoku(context, url: teks(o['url']), judul: teks(t['nama']), keterangan: keteranganBayar(o), cekStatus: () => _cek(teks(o['invoice'])));
    if (mounted) setState(() => _v++);
    if (lunas && mounted) kabar(context, '${teks(t['nama'])} lunas. Terima kasih!');
  }

  Future<void> _transfer(Map<String, dynamic> d, Map<String, dynamic> t) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _FormTransfer(tagihan: t, rekening: daftar(d['rekening']).map(peta).toList())));
    if (ok == true && mounted) setState(() => _v++);
  }

  Future<void> _lanjutPending(Map<String, dynamic> p, Map<String, dynamic> t, Map<String, dynamic> d) async {
    final ket = keteranganBayar({'judul': teks(t['nama']), 'nama': teks(peta(d['wb'])['nama']), 'total': p['total']});
    final lunas = await bukaPembayaranDoku(context, url: teks(p['url']), judul: teks(t['nama']), keterangan: ket, cekStatus: () => _cek(teks(p['invoice'])));
    if (mounted) setState(() => _v++);
    if (lunas && mounted) kabar(context, '${teks(t['nama'])} lunas. Terima kasih!');
  }

  void _pilihBayar(Map<String, dynamic> d, Map<String, dynamic> t) {
    final pending = daftar(d['pending']).map(peta).where((p) => teks(p['idTagihan']) == teks(t['id'])).toList();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(title: Text(teks(t['nama']), style: const TextStyle(fontWeight: FontWeight.w800)), subtitle: Text('Sisa yang harus dibayar ${rp(t['sisa'])}')),
          for (final p in pending)
            ListTile(
              leading: const Icon(Icons.hourglass_top_rounded, color: Color(0xFFE9A23B)),
              title: Text('Lanjutkan pembayaran ${rp(p['total'])}'),
              subtitle: Text('Belum selesai${teks(p['kadaluarsa']).isEmpty ? '' : ' · berlaku sampai ${teks(p['kadaluarsa'])}'}'),
              onTap: () {
                Navigator.pop(c);
                _lanjutPending(p, t, d);
              },
            ),
          if (d['online'] == true)
            ListTile(
              leading: const Icon(Icons.credit_card_rounded),
              title: const Text('Bayar online'),
              subtitle: const Text('Virtual Account, QRIS, e-wallet, gerai · lunas otomatis'),
              onTap: () {
                Navigator.pop(c);
                _bayarOnline(d, t);
              },
            ),
          if (daftar(d['rekening']).isNotEmpty)
            ListTile(
              leading: const Icon(Icons.account_balance_rounded),
              title: const Text('Transfer ke rekening lembaga'),
              subtitle: const Text('Unggah bukti · diperiksa bendahara · boleh dicicil'),
              onTap: () {
                Navigator.pop(c);
                _transfer(d, t);
              },
            ),
          if (d['online'] != true && daftar(d['rekening']).isEmpty)
            const ListTile(leading: Icon(Icons.info_outline_rounded), title: Text('Bayar langsung ke bendahara / sekretariat.')),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Tagihan Saya')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async => peta(await Api.instance('waSiswaTagihan', [_t], const Duration(minutes: 2))),
        bangun: (context, d, segarkan) {
          final tg = daftar(d['tagihan']).map(peta).toList();
          final aktif = tg.where((t) => angka(t['sisa']) > 0).toList();
          final total = aktif.fold<num>(0, (s, t) => s + angka(t['sisa']));
          final riwayat = daftar(d['riwayat']).map(peta).toList();
          final tf = daftar(d['transfer']).map(peta).toList();
          return RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 32), children: [
              Card(
                color: total > 0 ? cs.errorContainer : cs.primaryContainer,
                child: ListTile(
                  leading: Icon(total > 0 ? Icons.request_quote_rounded : Icons.verified_rounded),
                  title: Text(total > 0 ? 'Total yang harus dibayar ${rp(total)}' : 'Tidak ada tagihan yang belum dibayar', style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text('${teks(peta(d['wb'])['nama'])} · ${teks(peta(d['wb'])['rombel'])}'),
                ),
              ),
              const JudulBagian('Tagihan'),
              if (tg.isEmpty) const Kosong(pesan: 'Belum ada tagihan.', ikon: Icons.request_quote_outlined),
              for (final t in tg)
                Card(
                  child: ListTile(
                    onTap: angka(t['sisa']) > 0 ? () => _pilihBayar(d, t) : null,
                    title: Text(teks(t['nama']), style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text([
                      '${teks(t['kategori'])} · ${rp(t['jumlah'])}',
                      if (teks(t['jatuhTempo']).isNotEmpty) 'Jatuh tempo ${tglIndo(teks(t['jatuhTempo']))}',
                      if (angka(t['dibayar']) > 0) 'Sudah dibayar ${rp(t['dibayar'])}',
                      if (angka(t['keringanan']) > 0) 'Keringanan ${rp(t['keringanan'])}',
                      if (angka(t['transferDiperiksa']) > 0) 'Transfer ${rp(t['transferDiperiksa'])} sedang diperiksa',
                    ].join('\n')),
                    isThreeLine: true,
                    trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Lencana(teks(t['status']) == 'Lunas' ? 'Lunas' : rp(t['sisa']), warna: _warna(context, teks(t['status']))),
                      if (angka(t['sisa']) > 0) const Padding(padding: EdgeInsets.only(top: 4), child: Text('Bayar ›', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700))),
                    ]),
                  ),
                ),
              if (tf.isNotEmpty) ...[
                const JudulBagian('Bukti transfer'),
                for (final x in tf)
                  ListTile(
                    dense: true,
                    leading: Icon(teks(x['status']) == 'Diterima' ? Icons.check_circle_rounded : teks(x['status']) == 'Ditolak' ? Icons.cancel_rounded : Icons.hourglass_top_rounded,
                        color: teks(x['status']) == 'Diterima' ? Colors.green : teks(x['status']) == 'Ditolak' ? cs.error : const Color(0xFFE9A23B)),
                    title: Text('${teks(x['tagihan'])} · ${rp(x['jumlah'])}'),
                    subtitle: Text('${teks(x['status'])} · ${teks(x['waktu'])}${teks(x['catatan']).isEmpty ? '' : '\n${teks(x['catatan'])}'}'),
                  ),
              ],
              const JudulBagian('Riwayat pembayaran'),
              if (riwayat.isEmpty) const Kosong(pesan: 'Belum ada pembayaran.', ikon: Icons.receipt_long_outlined),
              for (final r in riwayat)
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.receipt_long_rounded, color: Colors.green),
                  title: Text('${teks(r['tagihan'])} · ${rp(r['jumlah'])}'),
                  subtitle: Text('${tglIndo(teks(r['tanggal']))} · ${teks(r['cara'])} · No. ${teks(r['id'])}'),
                  trailing: IconButton(tooltip: 'Unduh kwitansi', icon: const Icon(Icons.download_rounded), onPressed: () => cetakKwitansi(context, [teks(r['id'])], siswa: true)),
                ),
            ]),
          );
        },
      ),
    );
  }
}

class _FormTransfer extends StatefulWidget {
  const _FormTransfer({required this.tagihan, required this.rekening});
  final Map<String, dynamic> tagihan;
  final List<Map<String, dynamic>> rekening;

  @override
  State<_FormTransfer> createState() => _FormTransferState();
}

class _FormTransferState extends State<_FormTransfer> {
  late final TextEditingController _jumlah = TextEditingController(text: '${angka(widget.tagihan['sisa'])}');
  final _catatan = TextEditingController();
  int _rek = 0;
  String? _bukti;

  String _teksRek(Map<String, dynamic> r) => [teks(r['bank']), teks(r['nomor']), 'a.n. ${teks(r['atasNama'])}'].join(' · ');

  @override
  void dispose() {
    _jumlah.dispose();
    _catatan.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.tagihan;
    return Scaffold(
      appBar: AppBar(title: const Text('Transfer ke rekening lembaga')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('${teks(t['nama'])} · sisa ${rp(t['sisa'])}', style: const TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        const Text('Transfer ke salah satu rekening resmi lembaga berikut:'),
        for (var i = 0; i < widget.rekening.length; i++)
          Card(
            child: ListTile(
              leading: Icon(i == _rek ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded),
              title: Text('${teks(widget.rekening[i]['bank'])} · ${teks(widget.rekening[i]['nomor'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('a.n. ${teks(widget.rekening[i]['atasNama'])}'),
              onTap: () => setState(() => _rek = i),
              trailing: IconButton(
                tooltip: 'Salin nomor',
                icon: const Icon(Icons.copy_rounded),
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: teks(widget.rekening[i]['nomor'])));
                  kabar(context, 'Nomor rekening disalin.');
                },
              ),
            ),
          ),
        const SizedBox(height: 8),
        TextField(controller: _jumlah, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah yang ditransfer', prefixText: 'Rp ', helperText: 'Boleh kurang dari sisa (dicicil).')),
        const SizedBox(height: 10),
        TextField(controller: _catatan, decoration: const InputDecoration(labelText: 'Catatan (opsional)', hintText: 'mis. transfer dari rekening ibu')),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () async {
            final f = await ambilFoto(bolehGaleri: true, context: context);
            if (f != null) setState(() => _bukti = f);
          },
          icon: Icon(_bukti == null ? Icons.add_a_photo_outlined : Icons.check_circle_rounded, color: _bukti == null ? null : Colors.green),
          label: Text(_bukti == null ? 'Foto bukti transfer' : 'Bukti terlampir — ganti'),
        ),
        const SizedBox(height: 20),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          onPressed: () async {
            if (_bukti == null) return kabar(context, 'Unggah foto bukti transfer.', galat: true);
            final j = int.tryParse(_jumlah.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
            final r = await jalankan(context, () async => peta(await Api.instance('waSiswaBayarTransfer', [
                  _t,
                  {'idTagihan': teks(t['id']), 'jumlah': j, 'rekening': _teksRek(widget.rekening[_rek]), 'bukti': _bukti, 'catatan': _catatan.text}
                ], const Duration(minutes: 2))), teksProses: 'Mengirim bukti...');
            if (r.ok && context.mounted) {
              kabar(context, teks(r.data!['pesan'], 'Bukti terkirim.'));
              Navigator.pop(context, true);
            }
          },
          child: const Text('Kirim bukti transfer'),
        ),
      ]),
    );
  }
}
