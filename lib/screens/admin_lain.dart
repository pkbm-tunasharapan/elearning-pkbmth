import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'mapel_detail.dart';

String? get _t => Sesi.instance.token;

// ───────────────────────── PENGATURAN AI (admin) ─────────────────────────

class PengaturanAiScreen extends StatefulWidget {
  const PengaturanAiScreen({super.key});

  @override
  State<PengaturanAiScreen> createState() => _PengaturanAiScreenState();
}

class _PengaturanAiScreenState extends State<PengaturanAiScreen> {
  int _v = 0;
  final _kunci = TextEditingController();
  final _model = TextEditingController();
  bool _lihat = false;

  @override
  void dispose() {
    _kunci.dispose();
    _model.dispose();
    super.dispose();
  }

  Future<void> _simpan() async {
    final r = await jalankan(context, () => Api.instance('waAdminAiSimpan', [_t, _kunci.text, _model.text]), teksProses: 'Menyimpan...');
    if (!r.ok || !mounted) return;
    kabar(context, 'Pengaturan AI disimpan.');
    _kunci.clear();
    _model.clear();
    setState(() => _v++);
  }

  Future<void> _uji() async {
    final r = await jalankan(context, () => Api.instance('waAdminAiUji', [_t]), teksProses: 'Menguji koneksi...');
    if (!r.ok || !mounted) return;
    kabar(context, 'Terhubung ke Gemini (${teks(peta(r.data)['model'])}).');
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waAdminAiStatus', [_t])),
      bangun: (context, st, _) {
        final cs = Theme.of(context).colorScheme;
        final terisi = st['kunciTerisi'] == true;
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Card(
            child: ListTile(
              leading: IkonBulat(Icons.smart_toy_rounded, warna: Gaya.warnaMenu('ai'), ukuran: 44, sudut: 14),
              title: const Text('Pengaturan AI (Gemini)', style: TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text('Model: ${teks(st['model'])}${teks(st['model']) == teks(st['modelDefault']) ? ' (bawaan)' : ''}'),
              trailing: Lencana(terisi ? 'Sudah diisi' : 'Belum diisi', warna: terisi ? Colors.green : cs.error),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _kunci,
            obscureText: !_lihat,
            autocorrect: false,
            enableSuggestions: false,
            decoration: InputDecoration(
              labelText: 'Kunci API Gemini',
              hintText: terisi ? 'Tersimpan. Kosongkan jika tidak ingin mengubah.' : 'Tempel kunci dari aistudio.google.com',
              suffixIcon: IconButton(onPressed: () => setState(() => _lihat = !_lihat), icon: Icon(_lihat ? Icons.visibility_off_rounded : Icons.visibility_rounded)),
            ),
          ),
          const SizedBox(height: 12),
          TextField(controller: _model, maxLength: 60, decoration: InputDecoration(labelText: 'Model (opsional)', hintText: teks(st['model']))),
          Text('Kunci disimpan hanya di server (Script Properties) dan tidak pernah dikirim ke perangkat tutor.',
              style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: FilledButton.icon(onPressed: _simpan, icon: const Icon(Icons.save_rounded), label: const Text('Simpan'))),
            const SizedBox(width: 10),
            Expanded(child: OutlinedButton.icon(onPressed: _uji, icon: const Icon(Icons.wifi_tethering_rounded), label: const Text('Uji koneksi'))),
          ]),
          const SizedBox(height: 16),
          Text(
            'Catatan pemilik script: sekali saja, jalankan fungsi menuSetujuiIzinGemini dari editor Apps Script dan setujui izin '
            '"menghubungkan ke layanan eksternal", lalu buat versi deploy baru.',
            style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
          ),
        ]);
      },
    );
  }
}

// ───────────────────────── MAINTENANCE (admin) ─────────────────────────

class MaintenanceScreen extends StatefulWidget {
  const MaintenanceScreen({super.key});

  @override
  State<MaintenanceScreen> createState() => _MaintenanceScreenState();
}

class _MaintenanceScreenState extends State<MaintenanceScreen> {
  final _pesan = TextEditingController();
  bool? _aktif;
  String? _galat;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  @override
  void dispose() {
    _pesan.dispose();
    super.dispose();
  }

  Future<void> _muat() async {
    try {
      final r = peta(await Api.instance('waStafMaintenanceBaca', [_t]));
      if (!mounted) return;
      setState(() {
        _aktif = r['aktif'] == true;
        _pesan.text = teks(r['pesan']);
        _galat = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Future<void> _atur() async {
    final nyalakan = _aktif != true;
    if (nyalakan &&
        !await konfirmasi(context, 'Aktifkan maintenance?', 'Sistem akan ditutup untuk siswa dan tutor sampai maintenance dimatikan.', ya: 'Aktifkan')) {
      return;
    }
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafMaintenanceAtur', [_t, nyalakan, _pesan.text]));
    if (!r.ok || !mounted) return;
    final d = peta(r.data);
    setState(() => _aktif = d['aktif'] == true);
    kabar(context, _aktif == true ? 'Maintenance AKTIF.' : 'Maintenance dimatikan.');
  }

  @override
  Widget build(BuildContext context) {
    if (_galat != null) return PesanGalat(pesan: _galat!, ulangi: _muat);
    if (_aktif == null) return const Center(child: CircularProgressIndicator());
    final on = _aktif!;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      Card(
        color: on ? Colors.red.withValues(alpha: 0.1) : Colors.green.withValues(alpha: 0.1),
        child: ListTile(
          leading: Icon(on ? Icons.construction_rounded : Icons.check_circle_rounded, color: on ? Colors.red.shade700 : Colors.green.shade700, size: 34),
          title: Text(on ? 'Status: ON (sistem ditutup)' : 'Status: OFF (sistem normal)',
              style: TextStyle(fontWeight: FontWeight.w800, color: on ? Colors.red.shade700 : Colors.green.shade700)),
        ),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _pesan,
        maxLength: 300,
        minLines: 3,
        maxLines: 6,
        decoration: const InputDecoration(labelText: 'Pesan untuk pengguna (opsional)', hintText: 'Contoh: Sistem sedang diperbarui, coba lagi pukul 20.00.'),
      ),
      const SizedBox(height: 8),
      FilledButton.icon(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50), backgroundColor: on ? null : Colors.red.shade700),
        onPressed: _atur,
        icon: Icon(on ? Icons.power_settings_new_rounded : Icons.construction_rounded),
        label: Text(on ? 'Matikan maintenance' : 'Aktifkan maintenance'),
      ),
    ]);
  }
}

// ───────────────────────── PENGAJUAN TUTOR (admin) ─────────────────────────

class PengajuanTutorScreen extends StatefulWidget {
  const PengajuanTutorScreen({super.key});

  @override
  State<PengajuanTutorScreen> createState() => _PengajuanTutorScreenState();
}

class _PengajuanTutorScreenState extends State<PengajuanTutorScreen> {
  int _v = 0;
  final Map<String, bool> _cek = {};

  void _muatUlang() => setState(() {
        _v++;
        _cek.clear();
      });

  Future<void> _atur(Map<String, dynamic> opsi, String pesan) async {
    final r = await jalankan(context, () => Api.instance('waAdminTutorUndanganAtur', [_t, opsi]));
    if (!r.ok || !mounted) return;
    kabar(context, pesan);
    _muatUlang();
  }

  Future<void> _putus(List<Map<String, dynamic>> item, String aksi) async {
    final pilih = item.where((it) => _cek[teks(it['idPengajuan'])] ?? (it['aktif'] == true)).toList();
    final daftarAksi = [
      for (final it in pilih) {'idPengajuan': teks(it['idPengajuan']), 'aksi': aksi}
    ];
    if (daftarAksi.isEmpty) return kabar(context, 'Centang dulu mapel yang diputuskan.');
    final r = await jalankan(context, () => Api.instance('waAdminTutorKeputusan', [_t, daftarAksi, '']));
    if (!r.ok || !mounted) return;
    final d = peta(r.data);
    kabar(context,
        '${angka(d['disetujui'])} disetujui, ${angka(d['ditolak'])} ditolak${angka(d['dilewati']) > 0 ? ', ${angka(d['dilewati'])} sudah diputuskan sebelumnya' : ''}.');
    _muatUlang();
  }

  Widget _kartuTutor(Map<String, dynamic> g) {
    final cs = Theme.of(context).colorScheme;
    final item = daftar(g['item']).map(peta).toList();
    final perPaket = <String, List<Map<String, dynamic>>>{};
    for (final it in item) {
      perPaket.putIfAbsent(teks(it['paket']), () => []).add(it);
    }
    final kode = perPaket.keys.toList()
      ..sort((a, b) {
        if (a.isEmpty) return 1;
        if (b.isEmpty) return -1;
        return a.compareTo(b);
      });
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(teks(g['nama']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          Text(
            [teks(g['email']), if (teks(g['diajukan']).isNotEmpty) 'mendaftar ${teks(g['diajukan'])}', if (teks(g['statusAkun']) != 'Aktif') 'akun ${teks(g['statusAkun'])}']
                .where((x) => x.isNotEmpty)
                .join(' · '),
            style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
          ),
          for (final k in kode) ...[
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(k.isEmpty ? 'Lainnya' : 'Paket $k', style: TextStyle(fontWeight: FontWeight.w800, color: cs.primary)),
            ),
            for (final entri in () {
              final perRombel = <String, List<Map<String, dynamic>>>{};
              for (final it in perPaket[k]!) {
                perRombel.putIfAbsent(teks(it['namaRombel']), () => []).add(it);
              }
              return perRombel.entries;
            }()) ...[
              Padding(padding: const EdgeInsets.only(top: 6, left: 4), child: Text(entri.key, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
              for (final it in entri.value)
                CheckboxListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: it['aktif'] == true && (_cek[teks(it['idPengajuan'])] ?? true),
                  onChanged: it['aktif'] != true ? null : (v) => setState(() => _cek[teks(it['idPengajuan'])] = v == true),
                  title: Text(teks(it['namaMapel'])),
                  subtitle: Text(
                    [
                      if (daftar(it['tutorLain']).isNotEmpty) 'sudah diampu: ${daftar(it['tutorLain']).join(', ')}',
                      if (it['aktif'] != true) 'mapel tidak aktif',
                    ].join(' · '),
                    style: TextStyle(fontSize: 12, color: it['aktif'] != true ? cs.error : cs.onSurfaceVariant),
                  ),
                ),
            ],
          ],
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            FilledButton(onPressed: () => _putus(item, 'setuju'), child: const Text('Setujui yang dicentang')),
            OutlinedButton(onPressed: () => _putus(item, 'tolak'), child: const Text('Tolak yang dicentang')),
            TextButton(
              onPressed: () => setState(() {
                final aktif = item.where((it) => it['aktif'] == true).toList();
                final penuh = aktif.every((it) => _cek[teks(it['idPengajuan'])] ?? true);
                for (final it in aktif) {
                  _cek[teks(it['idPengajuan'])] = !penuh;
                }
              }),
              child: const Text('Pilih semua / kosongkan'),
            ),
          ]),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async {
        final h = await Future.wait([Api.instance('waAdminTutorPengajuan', [_t]), Api.instance('waAdminTutorUndangan', [_t])]);
        return {...peta(h[0]), 'undangan': peta(h[1])};
      },
      bangun: (context, d, _) {
        final cs = Theme.of(context).colorScheme;
        final und = peta(d['undangan']);
        final buka = und['terbuka'] == true;
        final kode = teks(und['kode']);
        final tutor = daftar(d['tutor']).map(peta).toList();
        final riwayat = daftar(d['riwayat']).map(peta).toList();
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  const Expanded(child: Text('Pendaftaran Tutor dengan Kode Undangan', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                  Lencana(buka ? 'DIBUKA' : 'DITUTUP', warna: buka ? Colors.green : cs.error),
                ]),
                const SizedBox(height: 4),
                Text(
                  'Calon tutor mendaftar di aplikasi (halaman masuk → Tutor / Staf → "Daftar dengan kode undangan"), wajib memasukkan kode undangan di bawah, '
                  'lalu mencentang mapel yang diampu sebagai pengajuan. Mapel baru aktif setelah Anda menyetujuinya. Tombol daftar tidak tampil saat pendaftaran ditutup, '
                  'dan siswa tidak bisa mendaftar tanpa kode.',
                  style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
                ),
                if (buka && kode.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  const Text('Kode undangan (bagikan hanya ke calon tutor):', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(color: cs.primaryContainer, borderRadius: BorderRadius.circular(14)),
                    child: SelectableText(kode, textAlign: TextAlign.center, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 6, color: cs.onPrimaryContainer)),
                  ),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, children: [
                    TextButton.icon(
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(
                            text: 'Undangan menjadi tutor PKBM Tunas Harapan.\nBuka aplikasi TH.E-Course → Tutor / Staf → "Daftar dengan kode undangan".\nKode undangan: $kode'));
                        if (context.mounted) kabar(context, 'Pesan undangan disalin. Tempel di WhatsApp ke calon tutor.');
                      },
                      icon: const Icon(Icons.copy_rounded),
                      label: const Text('Salin pesan undangan'),
                    ),
                    TextButton.icon(
                      onPressed: () async {
                        if (await konfirmasi(context, 'Ganti kode undangan?', 'Kode lama ($kode) langsung tidak berlaku. Calon tutor yang belum mendaftar perlu kode baru.', ya: 'Ganti')) {
                          _atur({'kodeBaru': true}, 'Kode undangan diganti.');
                        }
                      },
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('Ganti kode'),
                    ),
                  ]),
                ],
                const SizedBox(height: 10),
                buka
                    ? OutlinedButton(onPressed: () => _atur({'buka': false}, 'Pendaftaran tutor ditutup.'), child: const Text('Tutup pendaftaran'))
                    : FilledButton(onPressed: () => _atur({'buka': true}, 'Pendaftaran tutor dibuka. Bagikan kode undangan ke calon tutor.'), child: const Text('Buka pendaftaran & buat kode')),
              ]),
            ),
          ),
          JudulBagian('Menunggu persetujuan', sub: '${angka(d['menunggu'])} mapel dari ${tutor.length} tutor'),
          if (tutor.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Tidak ada pengajuan yang menunggu.'))),
          for (final g in tutor) _kartuTutor(g),
          if (riwayat.isNotEmpty) ...[
            const JudulBagian('Keputusan terakhir'),
            Card(
              child: Column(children: [
                for (final x in riwayat)
                  ListTile(
                    dense: true,
                    leading: Icon(teks(x['status']) == 'Disetujui' ? Icons.check_circle_rounded : Icons.cancel_rounded,
                        color: teks(x['status']) == 'Disetujui' ? Colors.green : cs.error),
                    title: Text('${teks(x['nama'])} · ${teks(x['namaMapel'])} (${teks(x['namaRombel'])})'),
                    subtitle: Text([teks(x['status']), if (teks(x['oleh']).isNotEmpty) 'oleh ${teks(x['oleh'])}', teks(x['waktu'])].where((e) => e.isNotEmpty).join(' · ')),
                  ),
              ]),
            ),
          ],
        ]);
      },
    );
  }
}

// ───────────────────────── KESIAPAN ROMBEL ─────────────────────────

class KesiapanScreen extends StatefulWidget {
  const KesiapanScreen({super.key});

  @override
  State<KesiapanScreen> createState() => _KesiapanScreenState();
}

class _KesiapanScreenState extends State<KesiapanScreen> {
  static const _kolom = [
    ['kerangka', 'CP-TP-ATP'],
    ['rencana', 'Rencana'],
    ['bacaan', 'Bacaan'],
    ['soal', 'Bank soal'],
    ['materi', 'Materi'],
    ['diskusi', 'Diskusi'],
    ['rpp', 'RPP'],
  ];

  Map<String, dynamic>? _r;

  static const _cssLaporan = '.kc-kop{text-align:center;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:10px}'
      '.kc-sekolah{font-size:14pt;font-weight:700;letter-spacing:.5px}.kc-judul{font-size:12pt;font-weight:700;margin-top:2px}.kc-sub{font-size:9pt;margin-top:2px}'
      'table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #444;padding:3px 4px;font-size:8.5pt;text-align:center;vertical-align:top}'
      'th.kiri,td.kiri{text-align:left}th{background:#e5e7eb}tr{page-break-inside:avoid}thead{display:table-header-group}'
      'h3{font-size:10.5pt;margin:12px 0 4px;font-weight:700}.lap-ring{font-size:10pt;margin:4px 0}'
      '.cp-pil{display:inline-block;border-radius:999px;padding:1px 7px;font-weight:700;font-size:8pt;border:1px solid;white-space:nowrap}'
      '.pil-siap{background:#dcfce7;border-color:#16a34a}.pil-hampir{background:#fef3c7;border-color:#d97706}.pil-belum{background:#fee2e2;border-color:#dc2626}'
      '.lap-cat{font-size:8.5pt;margin-top:8px}.cp-ok{color:#166534}.cp-mid{color:#b45309}.cp-no{color:#b91c1c}';

  String _htmlLaporan(Map<String, dynamic> r) {
    const lbl = {'siap': 'Siap', 'hampir': 'Hampir siap', 'belum': 'Belum siap'};
    final rombel = daftar(r['rombel']).map(peta).toList();
    final hit = {'siap': 0, 'hampir': 0, 'belum': 0};
    for (final g in rombel) {
      final st = teks(g['status']);
      if (hit.containsKey(st)) hit[st] = hit[st]! + 1;
    }
    String kelas(int ok, int total) => ok >= total ? 'cp-ok' : (ok == 0 ? 'cp-no' : 'cp-mid');
    final o = StringBuffer();
    o.write('<div class="kc-kop"><div class="kc-sekolah">PKBM TUNAS HARAPAN</div><div class="kc-judul">LAPORAN KESIAPAN ROMBEL</div>'
        '<div class="kc-sub">Kesiapan memulai e-learning · Dicetak ${tanggalIni()}</div></div>');
    o.write('<div class="lap-ring"><b>${hit['siap']} dari ${rombel.length} kelas siap</b> · ${hit['hampir']} hampir siap · ${hit['belum']} belum siap.</div>');
    o.write('<div class="lap-cat">Angka pada tabel adalah jumlah mata pelajaran yang sudah lengkap dari seluruh mapel di kelas itu. Target ${escHtml(r['targetSesi'])} sesi per mapel (${escHtml(r['perSemester'])} sesi per semester).</div>');
    o.write('<table><thead><tr><th class="kiri">Kelas</th><th>Mapel siap</th>');
    for (final k in _kolom) {
      o.write('<th>${k[1]}</th>');
    }
    o.write('<th>Status</th></tr></thead><tbody>');
    for (final g in rombel) {
      final j = angka(g['jumlah']);
      o.write('<tr><td class="kiri"><b>${escHtml(g['namaRombel'])}</b></td><td class="${kelas(angka(g['siap']), j)}"><b>${angka(g['siap'])}/$j</b></td>');
      for (final k in _kolom) {
        final c = peta(peta(g['komponen'])[k[0]]);
        o.write('<td class="${kelas(angka(c['ok']), j)}"><b>${angka(c['ok'])}/$j</b></td>');
      }
      final st = teks(g['status']);
      o.write('<td><span class="cp-pil pil-$st ${st == 'siap' ? 'cp-ok' : (st == 'hampir' ? 'cp-mid' : 'cp-no')}">${lbl[st] ?? st} ${angka(g['persen'])}%</span></td></tr>');
    }
    o.write('</tbody></table>');
    final baris = <String>[];
    for (final g in rombel) {
      for (final k in _kolom) {
        final kurang = daftar(peta(peta(g['komponen'])[k[0]])['kurang']);
        if (kurang.isNotEmpty) baris.add('<tr><td class="kiri">${escHtml(g['namaRombel'])}</td><td class="kiri">${k[1]}</td><td class="kiri">${kurang.map(escHtml).join('; ')}</td></tr>');
      }
    }
    o.write('<h3>Rincian yang belum lengkap</h3>');
    o.write(baris.isNotEmpty
        ? '<table><thead><tr><th class="kiri" style="width:22%">Kelas</th><th class="kiri" style="width:14%">Komponen</th><th class="kiri">Mapel yang belum lengkap (terisi/target)</th></tr></thead><tbody>${baris.join()}</tbody></table>'
        : '<div class="lap-cat">Seluruh kelas sudah lengkap.</div>');
    return o.toString();
  }

  Color _w(int ok, int total) => ok >= total ? const Color(0xFF16A34A) : (ok == 0 ? const Color(0xFFDC2626) : const Color(0xFFD97706));

  void _bukaKelas(Map<String, dynamic> g) {
    final ms = Sesi.instance.mapel.where((m) => teks(m['idRombel']) == teks(g['idRombel'])).toList()
      ..sort((a, b) => teks(a['namaMapel']).compareTo(teks(b['namaMapel'])));
    if (ms.isEmpty) return kabar(context, 'Kelas ini tidak memiliki mata pelajaran yang dapat dibuka.', galat: true);
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => ListView(shrinkWrap: true, padding: const EdgeInsets.only(bottom: 24), children: [
        Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), child: Text(teks(g['namaRombel']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
        for (final m in ms)
          ListTile(
            leading: IkonBulat(Icons.menu_book_rounded, warna: Gaya.warnaMenu(teks(m['namaMapel'])), ukuran: 38, sudut: 12),
            title: Text(teks(m['namaMapel'])),
            onTap: () {
              Navigator.pop(c);
              Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => MapelDetailScreen(idMapel: teks(m['idMapel']), namaMapel: teks(m['namaMapel']), namaRombel: teks(m['namaRombel'])),
              ));
            },
          ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Kesiapan Kelas'),
        actions: [
          if (bolehUnduh) IconButton(
            tooltip: 'Cetak laporan (PDF)',
            onPressed: _r == null
                ? null
                : () => htmlKePdf(context, nama: 'Laporan_Kesiapan_Rombel_${tanggalBerkas()}.pdf', args: [_t, dokumenA4(_htmlLaporan(_r!), _cssLaporan)]),
            icon: const Icon(Icons.print_rounded),
          ),
        ],
      ),
      body: Muatan<Map<String, dynamic>>(
        muat: () async {
          final r = peta(await Api.instance('waStafKesiapanSemua', [_t], const Duration(seconds: 240)));
          if (mounted) setState(() => _r = r);
          return r;
        },
        bangun: (context, r, _) {
          final cs = Theme.of(context).colorScheme;
          final rombel = daftar(r['rombel']).map(peta).toList();
          final siap = rombel.where((g) => teks(g['status']) == 'siap').length;
          const warna = {'siap': Color(0xFF16A34A), 'hampir': Color(0xFFD97706), 'belum': Color(0xFFDC2626)};
          const label = {'siap': 'Siap', 'hampir': 'Hampir siap', 'belum': 'Belum siap'};
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Text('$siap dari ${rombel.length} kelas siap memulai e-learning', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 4),
            Text(
              'Angka = jumlah mata pelajaran yang sudah lengkap dari seluruh mapel di kelas itu (target ${angka(r['targetSesi'])} sesi per mapel, '
              '${angka(r['perSemester'])} per semester). Ketuk sebuah komponen untuk melihat mapel yang belum lengkap.',
              style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
            ),
            const SizedBox(height: 12),
            for (final g in rombel)
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text(teks(g['namaRombel']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                        decoration: BoxDecoration(color: warna[teks(g['status'])] ?? cs.outline, borderRadius: BorderRadius.circular(99)),
                        child: Text('${label[teks(g['status'])] ?? ''} ${angka(g['persen'])}%',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 11.5)),
                      ),
                    ]),
                    Text('Mapel siap: ${angka(g['siap'])}/${angka(g['jumlah'])}',
                        style: TextStyle(fontWeight: FontWeight.w700, color: _w(angka(g['siap']), angka(g['jumlah'])))),
                    const SizedBox(height: 8),
                    Wrap(spacing: 6, runSpacing: 6, children: [
                      for (final k in _kolom)
                        Builder(builder: (_) {
                          final c = peta(peta(g['komponen'])[k[0]]);
                          final kurang = daftar(c['kurang']).map((e) => '$e').toList();
                          final w = _w(angka(c['ok']), angka(g['jumlah']));
                          return ActionChip(
                            side: BorderSide(color: w.withValues(alpha: 0.5)),
                            label: Text('${k[1]} ${angka(c['ok'])}/${angka(g['jumlah'])}', style: TextStyle(color: w, fontWeight: FontWeight.w700, fontSize: 12)),
                            onPressed: kurang.isEmpty
                                ? null
                                : () => showDialog<void>(
                                      context: context,
                                      builder: (d) => AlertDialog(
                                        title: Text('${teks(g['namaRombel'])} · ${k[1]}'),
                                        content: SingleChildScrollView(child: Text('Belum lengkap:\n• ${kurang.join('\n• ')}')),
                                        actions: [TextButton(onPressed: () => Navigator.pop(d), child: const Text('Tutup'))],
                                      ),
                                    ),
                          );
                        }),
                    ]),
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerRight,
                      child: OutlinedButton(onPressed: () => _bukaKelas(g), child: const Text('Buka kelas')),
                    ),
                  ]),
                ),
              ),
          ]);
        },
      ),
    );
  }
}

// ───────────────────────── HAPUS SERENTAK ─────────────────────────

/// Hapus serentak materi/diskusi yang belum terpakai (waStafMateriHapusMassal). Mengembalikan true bila ada yang terhapus.
Future<bool> hapusSerentak(BuildContext context, String idMapel, String judul) async {
  final r = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _HapusSerentak(idMapel: idMapel, judul: judul),
  );
  return r == true;
}

class _HapusSerentak extends StatefulWidget {
  const _HapusSerentak({required this.idMapel, required this.judul});
  final String idMapel;
  final String judul;

  @override
  State<_HapusSerentak> createState() => _HapusSerentakState();
}

class _HapusSerentakState extends State<_HapusSerentak> {
  String _jenis = 'semua';
  bool _post = false;
  bool _memeriksa = true;
  bool _menghapus = false;
  bool _yakin = false;
  int _no = 0;
  Map<String, dynamic> _r = {};
  String? _galat;

  List<Map<String, dynamic>> get _calon => daftar(_r['calon']).map(peta).toList();

  @override
  void initState() {
    super.initState();
    _periksa();
  }

  Map<String, dynamic> _opsi(bool hapus) => {
        'jenis': _jenis,
        'termasukPost': _post,
        'hapus': hapus,
        'ids': hapus ? _calon.map((x) => teks(x['id'])).toList() : <String>[],
      };

  Future<void> _periksa() async {
    final ini = ++_no;
    setState(() {
      _memeriksa = true;
      _yakin = false;
      _galat = null;
    });
    try {
      final r = peta(await Api.instance('waStafMateriHapusMassal', [_t, widget.idMapel, _opsi(false)], const Duration(seconds: 120)));
      if (ini != _no || !mounted) return;
      setState(() {
        _r = r;
        _memeriksa = false;
      });
    } on ApiException catch (e) {
      if (ini != _no || !mounted) return;
      setState(() {
        _galat = e.ramah;
        _memeriksa = false;
      });
    }
  }

  Future<void> _hapus() async {
    if (!_yakin) return setState(() => _yakin = true);
    setState(() => _menghapus = true);
    try {
      final r = peta(await Api.instance('waStafMateriHapusMassal', [_t, widget.idMapel, _opsi(true)], const Duration(seconds: 240)));
      if (!mounted) return;
      kabar(context, '${angka(r['jumlah'])} item dihapus. Salinannya ada di sheet Cadangan_Hapus_Materi.');
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _menghapus = false);
      kabar(context, e.ramah, galat: true);
      _periksa();
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final calon = _calon;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Hapus Serentak Materi dan Diskusi', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
          const SizedBox(height: 4),
          Text(
            '${widget.judul}. Hanya materi dan diskusi yang belum terpakai yang ikut: belum ada jawaban, nilai, atau penilaian siswa. '
            'Ujian tidak pernah ikut terhapus. Sebelum dihapus, isinya disalin dulu ke sheet Cadangan_Hapus_Materi.',
            style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _jenis,
            decoration: const InputDecoration(labelText: 'Yang dihapus', isDense: true),
            items: const [
              DropdownMenuItem(value: 'semua', child: Text('Materi dan Diskusi')),
              DropdownMenuItem(value: 'Materi', child: Text('Materi saja')),
              DropdownMenuItem(value: 'Diskusi', child: Text('Diskusi saja')),
            ],
            onChanged: _menghapus
                ? null
                : (v) {
                    _jenis = v ?? 'semua';
                    _periksa();
                  },
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _post,
            onChanged: _menghapus
                ? null
                : (v) {
                    _post = v == true;
                    _periksa();
                  },
            title: const Text('Sertakan yang sudah di-Post (selama belum ada jawaban siswa)'),
          ),
          if (_memeriksa)
            const Padding(padding: EdgeInsets.all(12), child: Text('Memeriksa...'))
          else if (_galat != null)
            Text(_galat!, style: TextStyle(color: cs.error))
          else ...[
            Text(calon.isNotEmpty ? '${calon.length} item akan dihapus' : 'Tidak ada item yang bisa dihapus', style: const TextStyle(fontWeight: FontWeight.w800)),
            if (angka(_r['dipakai']) > 0)
              Text('${angka(_r['dipakai'])} item dilewati karena sudah ada jawaban atau nilai siswa', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            if (angka(_r['sudahPost']) > 0)
              Text('${angka(_r['sudahPost'])} item dilewati karena sudah di-Post (centang pilihan di atas untuk menyertakan)',
                  style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            if (calon.isNotEmpty)
              Container(
                margin: const EdgeInsets.only(top: 8),
                constraints: const BoxConstraints(maxHeight: 200),
                decoration: BoxDecoration(border: Border.all(color: cs.outlineVariant), borderRadius: BorderRadius.circular(12)),
                child: ListView(shrinkWrap: true, padding: const EdgeInsets.all(8), children: [
                  for (final x in calon)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Text('${teks(x['sesi'])} · ${teks(x['jenis'])} · ${teks(x['judul'])}${teks(x['status']) != 'Draft' ? ' (${teks(x['status'])})' : ''}',
                          style: const TextStyle(fontSize: 12.5)),
                    ),
                ]),
              ),
          ],
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: _menghapus ? null : () => Navigator.pop(context, false), child: const Text('Batal'))),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: cs.error, foregroundColor: cs.onError),
                onPressed: _memeriksa || _menghapus || calon.isEmpty ? null : _hapus,
                child: _menghapus
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(_yakin ? 'Yakin? Ketuk lagi untuk menghapus ${calon.length} item' : (calon.isEmpty ? 'Hapus' : 'Hapus ${calon.length} item'), textAlign: TextAlign.center),
              ),
            ),
          ]),
        ]),
      ),
    );
  }
}
