import 'package:flutter/material.dart';

import 'api.dart';
import 'honor/honor.dart';
import 'keuangan/keuangan.dart';
import 'keuangan/va_custom.dart';
import 'pemberitahuan.dart';
import 'induk/pantauan_unit.dart';
import 'jadwal/agenda_lembaga.dart';
import 'referral/referral_admin.dart';
import 'screens/admin_lain.dart' show PengajuanTutorScreen;
import 'screens/ujian.dart' show KotakUjianScreen;
import 'siswa/aktivasi_qr.dart';
import 'siswa/pencapaian_siswa.dart';
import 'ujian/masa_ujian.dart' show MasaUjianScreen;
import 'ujian/pengawas.dart' show PengawasScreen;
import 'ujian/tinjauan.dart' show TinjauanPelanggaranScreen;
import 'session.dart';
import 'siswa/sesi_siswa.dart';
import 'siswa/tagihan_siswa.dart';
import 'widgets.dart';

/// v1.50.0: lonceng notifikasi dengan angka belum dibaca. Ketuk -> kotak masuk.
class LoncengNotif extends StatelessWidget {
  const LoncengNotif({super.key, this.warna});
  final Color? warna;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<int>(
        valueListenable: Pemberitahuan.instance.belumDibaca,
        builder: (context, n, _) => IconButton(
          tooltip: 'Notifikasi',
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const KotakNotifScreen())),
          icon: Badge(
            isLabelVisible: n > 0,
            label: Text(n > 99 ? '99+' : '$n'),
            child: Icon(Icons.notifications_rounded, color: warna),
          ),
        ),
      );
}

IconData _ikonJenis(String j) => switch (j) {
      'pengumuman' => Icons.campaign_rounded,
      'tagihan_baru' || 'tagihan_ingat' || 'keringanan' => Icons.request_quote_rounded,
      'pembayaran_diterima' || 'bayar_online_masuk' => Icons.verified_rounded,
      'transfer_masuk' || 'transfer_ditolak' => Icons.fact_check_rounded,
      'honor_disetujui' || 'honor_dibayar' || 'honor_batal' || 'honor_perlu_setuju' => Icons.payments_rounded,
      'referral_baru' || 'referral_bukti' || 'tarik_menunggu' || 'tarik_disetujui' => Icons.campaign_outlined,
      'pajak_belum_setor' => Icons.receipt_rounded,
      'ringkasan_keuangan' => Icons.assessment_rounded,
      _ => Icons.notifications_rounded,
    };

Widget _bungkus(String judul, Widget isi) => Scaffold(appBar: AppBar(title: Text(judul)), body: isi);

/// Buka layar terkait notifikasi.
Future<void> bukaAksiNotif(BuildContext context, String aksi) async {
  final nav = Navigator.of(context);
  final siswa = SesiSiswa.instance.masuk;
  Widget? layar;
  switch (aksi) {
    case 'tagihan_saya':
      if (siswa) layar = const TagihanSiswaScreen();
    case 'keuangan':
      if (!siswa) layar = _bungkus('Keuangan', const KeuanganScreen());
    case 'va_custom':
      if (!siswa) layar = _bungkus('VA Custom', const VaCustomScreen());
    case 'transfer':
      if (!siswa) layar = const TransferTagihanScreen();
    case 'referral_admin':
      if (!siswa) layar = _bungkus('Kelola Referral', const ReferralAdminScreen());
    case 'kotak_ujian':
      if (!siswa) layar = _bungkus('Kotak Ujian', const KotakUjianScreen());
    case 'rekap_nilai':
      if (siswa) layar = const PencapaianSiswaScreen();
    case 'masa_ujian':
      if (!siswa) layar = const MasaUjianScreen();
    case 'pengawas_ujian':
      if (!siswa) layar = const PengawasScreen();
    case 'tinjau_ujian':
      if (!siswa) layar = const TinjauanPelanggaranScreen();
    case 'pengajuan_tutor':
      if (!siswa) layar = _bungkus('Pengajuan Tutor', const PengajuanTutorScreen());
    case 'agenda_lembaga':
      if (!siswa) layar = const AgendaLembagaScreen();
    case 'aktivasi_qr':
      if (!siswa) layar = _bungkus('Aktivasi QR Siswa', const AktivasiQrScreen());
    case 'pantauan_unit':
      if (!siswa) layar = const PantauanUnitScreen();
    case 'honor':
      if (!siswa) layar = Sesi.instance.peran == 'Tutor' ? _bungkus('Saldo Honor', const HonorSayaScreen()) : _bungkus('Rekap Honor', const RekapHonorScreen());
  }
  if (layar != null) await nav.push(MaterialPageRoute(builder: (_) => layar!));
}

class KotakNotifScreen extends StatefulWidget {
  const KotakNotifScreen({super.key});

  @override
  State<KotakNotifScreen> createState() => _KotakNotifScreenState();
}

class _KotakNotifScreenState extends State<KotakNotifScreen> {
  int _v = 0;
  Set<String> _dibaca = {};

  Future<List<Map<String, dynamic>>> _muat() async {
    final p = await Pemberitahuan.instance.kotak();
    _dibaca = await Pemberitahuan.instance.dibaca();
    return p;
  }

  Future<void> _ketuk(Map<String, dynamic> p) async {
    final id = teks(p['id']);
    await Pemberitahuan.instance.tandaiDibaca([id]);
    if (!mounted) return;
    setState(() => _dibaca.add(id));
    final aksi = teks(p['aksi']);
    if (aksi.isNotEmpty) {
      await bukaAksiNotif(context, aksi);
      return;
    }
    await showDialog<void>(
      context: context,
      builder: (d) => AlertDialog(
        icon: Icon(_ikonJenis(teks(p['jenis']))),
        title: Text(teks(p['judul'], 'Pemberitahuan')),
        content: SingleChildScrollView(child: SelectableText(teks(p['isi']))),
        actions: [FilledButton(onPressed: () => Navigator.pop(d), child: const Text('Tutup'))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Notifikasi'), actions: [
        TextButton(
          onPressed: () async {
            final semua = await Pemberitahuan.instance.kotak();
            await Pemberitahuan.instance.tandaiDibaca(semua.map((p) => teks(p['id'])));
            if (mounted) setState(() => _v++);
          },
          child: const Text('Tandai semua dibaca'),
        ),
      ]),
      body: Muatan<List<Map<String, dynamic>>>(
        key: ValueKey(_v),
        muat: _muat,
        bangun: (context, data, segarkan) => RefreshIndicator(
          onRefresh: segarkan,
          child: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 32), children: [
            if (data.isEmpty) const Kosong(pesan: 'Belum ada notifikasi.', ikon: Icons.notifications_none_rounded),
            for (final p in data)
              Card(
                color: _dibaca.contains(teks(p['id'])) ? null : cs.primaryContainer.withValues(alpha: 0.45),
                child: ListTile(
                  onTap: () => _ketuk(p),
                  leading: Icon(_ikonJenis(teks(p['jenis'])), color: cs.primary),
                  title: Text(teks(p['judul'], 'Pemberitahuan'), style: TextStyle(fontWeight: _dibaca.contains(teks(p['id'])) ? FontWeight.w500 : FontWeight.w800)),
                  subtitle: Text('${teks(p['isi'])}\n${teks(p['waktu'])}', maxLines: 3, overflow: TextOverflow.ellipsis),
                  isThreeLine: true,
                  trailing: teks(p['aksi']).isEmpty ? null : const Icon(Icons.chevron_right_rounded),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}
