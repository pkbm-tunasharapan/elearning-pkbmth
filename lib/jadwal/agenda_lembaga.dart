import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

const _namaBulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
String _tgl(String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? iso : '${d.day} ${_namaBulan[d.month - 1]} ${d.year}';
}

String _isoDari(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// v1.64.0: Agenda lembaga di luar kalender akademik (TKA, kegiatan, libur khusus).
/// Admin membuat draf (sasaran + status siswa bukan sasaran); Kepala Sekolah mengesahkan. Setelah disahkan,
/// agenda tampil di kalender akademik dan notifikasi dikirim ke sasaran, siswa terdampak, tutor, dan staf.
class AgendaLembagaScreen extends StatefulWidget {
  const AgendaLembagaScreen({super.key});

  @override
  State<AgendaLembagaScreen> createState() => _AgendaLembagaScreenState();
}

class _AgendaLembagaScreenState extends State<AgendaLembagaScreen> {
  int _ulang = 0;

  Future<void> _form(Map<String, dynamic> d, [Map<String, dynamic>? a]) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _FormAgenda(data: d, a: a)));
    if (ok == true && mounted) setState(() => _ulang++);
  }

  Future<void> _sahkan(Map<String, dynamic> a) async {
    if (!await konfirmasi(context, 'Sahkan ${teks(a['nama'])}?',
        'Agenda tampil di kalender akademik dan notifikasi dikirim ke ${teks(a['sasaranTeks']).toLowerCase()}, siswa bukan sasaran (bila libur/belajar mandiri), tutor terdampak, dan staf.',
        ya: 'Sahkan')) {
      return;
    }
    if (!mounted) return;
    final r = await jalankan(context, () async => peta(await Api.instance('waStafAgendaSahkan', [_t, teks(a['id'])], const Duration(minutes: 2))), teksProses: 'Mengesahkan...');
    if (!r.ok || !mounted) return;
    final n = peta(r.data!['notif']);
    kabar(context, 'Disahkan. Notifikasi: ${angka(n['sasaran'])} siswa sasaran, ${angka(n['bukan'])} siswa lain, ${angka(n['tutor'])} tutor.');
    setState(() => _ulang++);
  }

  Future<void> _batal(Map<String, dynamic> a) async {
    final c = TextEditingController();
    final ya = await showDialog<bool>(
      context: context,
      builder: (x) => AlertDialog(
        title: const Text('Batalkan pengesahan?'),
        content: TextField(controller: c, decoration: const InputDecoration(labelText: 'Alasan (dikirim ke penerima)')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(x, false), child: const Text('Tidak')),
          FilledButton(onPressed: () => Navigator.pop(x, true), child: const Text('Batalkan')),
        ],
      ),
    );
    final alasan = c.text.trim();
    c.dispose();
    if (ya != true || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafAgendaBatal', [_t, teks(a['id']), alasan]), teksProses: 'Membatalkan...');
    if (r.ok && mounted) setState(() => _ulang++);
  }

  Future<void> _hapus(Map<String, dynamic> a) async {
    if (!await konfirmasi(context, 'Hapus draf ${teks(a['nama'])}?', 'Draf agenda dihapus.', ya: 'Hapus')) return;
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafAgendaHapus', [_t, teks(a['id'])]), teksProses: 'Menghapus...');
    if (r.ok && mounted) setState(() => _ulang++);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Agenda Lembaga')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey('ag$_ulang'),
        muat: () async => peta(await Api.instance('waStafAgendaData', [_t])),
        bangun: (c, d, segar) {
          final agenda = daftar(d['agenda']).map(peta).toList();
          final buat = d['bolehBuat'] == true, sah = d['bolehSah'] == true;
          return Stack(children: [
            ListView(padding: const EdgeInsets.fromLTRB(16, 10, 16, 96), children: [
              const Text(
                  'Agenda di luar kalender akademik (mis. TKA, kegiatan, libur khusus). Admin menyusun draf beserta sasaran dan status siswa lainnya; '
                  'Kepala Sekolah mengesahkan. Jadwal tatap muka yang terdampak otomatis tidak dihitung pertemuan wajib.',
                  style: TextStyle(fontSize: 12.5)),
              const SizedBox(height: 10),
              if (agenda.isEmpty) const Kosong(pesan: 'Belum ada agenda.', ikon: Icons.event_note_outlined),
              for (final a in agenda)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 10, 8, 6),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text(teks(a['nama']), style: const TextStyle(fontWeight: FontWeight.w800))),
                        Lencana(teks(a['status'], 'Draft'), warna: teks(a['status']) == 'Disahkan' ? Colors.green.shade700 : Colors.orange.shade800),
                      ]),
                      const SizedBox(height: 4),
                      Text('${teks(a['jenis'])} · ${teks(a['tanggalTeks'])}', style: const TextStyle(fontSize: 13)),
                      Text('Sasaran: ${teks(a['sasaranTeks'])} · Siswa lainnya: ${teks(a['statusLain'])}', style: const TextStyle(fontSize: 12.5)),
                      if (teks(a['ket']).isNotEmpty) Text(teks(a['ket']), style: const TextStyle(fontSize: 12.5, fontStyle: FontStyle.italic)),
                      if (teks(a['status']) == 'Disahkan')
                        Text('Disahkan ${teks(a['disahkanOleh'])} · ${teks(a['disahkanPada'])}', style: const TextStyle(fontSize: 12)),
                      if (teks(a['catatan']).isNotEmpty) Text(teks(a['catatan']), style: const TextStyle(fontSize: 12)),
                      Wrap(spacing: 4, children: [
                        if (buat && teks(a['status']) != 'Disahkan') TextButton(onPressed: () => _form(d, a), child: const Text('Ubah')),
                        if (buat && teks(a['status']) != 'Disahkan') TextButton(onPressed: () => _hapus(a), child: const Text('Hapus')),
                        if (sah && teks(a['status']) != 'Disahkan') FilledButton.tonal(onPressed: () => _sahkan(a), child: const Text('Sahkan')),
                        if (sah && teks(a['status']) == 'Disahkan') TextButton(onPressed: () => _batal(a), child: const Text('Batalkan pengesahan')),
                      ]),
                    ]),
                  ),
                ),
            ]),
            if (buat)
              Positioned(
                right: 16,
                bottom: 16,
                child: FloatingActionButton.extended(onPressed: () => _form(d), icon: const Icon(Icons.add_rounded), label: const Text('Agenda baru')),
              ),
          ]);
        },
      ),
    );
  }
}

class _FormAgenda extends StatefulWidget {
  const _FormAgenda({required this.data, this.a});
  final Map<String, dynamic> data;
  final Map<String, dynamic>? a;

  @override
  State<_FormAgenda> createState() => _FormAgendaState();
}

class _FormAgendaState extends State<_FormAgenda> {
  final _nama = TextEditingController();
  final _ket = TextEditingController();
  final _cariSiswa = TextEditingController();
  String _jenis = 'TKA', _mode = 'semua', _lain = 'Belajar biasa', _dari = '', _sampai = '';
  bool _ganti = true;
  final Set<String> _nilai = {};

  @override
  void initState() {
    super.initState();
    final a = widget.a;
    if (a != null) {
      _nama.text = teks(a['nama']);
      _ket.text = teks(a['ket']);
      _jenis = teks(a['jenis'], 'Lainnya');
      _dari = teks(a['dari']);
      _sampai = teks(a['sampai']);
      _lain = teks(a['statusLain'], 'Belajar biasa');
      _ganti = a['gantiJadwal'] != false;
      final s = peta(a['sasaran']);
      _mode = teks(s['mode'], 'semua');
      _nilai.addAll(daftar(s['nilai']).map((e) => '$e'));
    }
  }

  @override
  void dispose() {
    for (final c in [_nama, _ket, _cariSiswa]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pilihTgl(bool awal) async {
    final n = DateTime.now();
    final d = await showDatePicker(
      context: context,
      firstDate: DateTime(n.year - 1),
      lastDate: DateTime(n.year + 2),
      initialDate: DateTime.tryParse(awal ? _dari : (_sampai.isEmpty ? _dari : _sampai)) ?? n,
    );
    if (d == null) return;
    setState(() {
      if (awal) {
        _dari = _isoDari(d);
        if (_sampai.isEmpty || _sampai.compareTo(_dari) < 0) _sampai = _dari;
      } else {
        _sampai = _isoDari(d);
      }
    });
  }

  Future<void> _simpan() async {
    if (_nama.text.trim().length < 3) return kabar(context, 'Isi nama agenda.', galat: true);
    if (_dari.isEmpty) return kabar(context, 'Pilih tanggal.', galat: true);
    if (_mode != 'semua' && _nilai.isEmpty) return kabar(context, 'Pilih sasaran agenda.', galat: true);
    final r = await jalankan(context, () async => peta(await Api.instance('waStafAgendaSimpan', [
          _t,
          {
            if (widget.a != null) 'id': widget.a!['id'],
            'nama': _nama.text.trim(),
            'jenis': _jenis,
            'dari': _dari,
            'sampai': _sampai.isEmpty ? _dari : _sampai,
            'sasaran': {'mode': _mode, 'nilai': _nilai.toList()},
            'statusLain': _lain,
            'gantiJadwal': _ganti,
            'ket': _ket.text.trim(),
          }
        ])), teksProses: 'Menyimpan agenda...');
    if (r.ok && mounted) {
      kabar(context, widget.a == null ? 'Draf agenda disimpan dan diajukan ke Kepala Sekolah.' : 'Agenda diperbarui.');
      Navigator.pop(context, true);
    }
  }

  Widget _pilihan(List<(String, String)> item) => Wrap(spacing: 6, runSpacing: 6, children: [
        for (final x in item)
          FilterChip(
            label: Text(x.$2),
            selected: _nilai.contains(x.$1),
            onSelected: (v) => setState(() => v ? _nilai.add(x.$1) : _nilai.remove(x.$1)),
          ),
      ]);

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final rombel = daftar(d['rombel']).map(peta).toList();
    final program = daftar(d['program']).map((e) => '$e').toList();
    final unit = daftar(d['unit']).map(peta).toList();
    final q = _cariSiswa.text.trim().toLowerCase();
    final wb = daftar(d['wb']).map(peta).where((w) => _nilai.contains(teks(w['id'])) || (q.length >= 2 && teks(w['nama']).toLowerCase().contains(q))).take(60).toList();
    return Scaffold(
      appBar: AppBar(title: Text(widget.a == null ? 'Agenda baru' : 'Ubah agenda')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(controller: _nama, decoration: const InputDecoration(labelText: 'Nama agenda', hintText: 'mis. Tes Kemampuan Akademik (TKA)')),
        const SizedBox(height: 12),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final j in daftar(d['jenis']).map((e) => '$e')) ChoiceChip(label: Text(j), selected: _jenis == j, onSelected: (_) => setState(() => _jenis = j)),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: () => _pilihTgl(true), icon: const Icon(Icons.event_rounded), label: Text(_dari.isEmpty ? 'Tanggal mulai' : _tgl(_dari)))),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('s.d.')),
          Expanded(child: OutlinedButton.icon(onPressed: _dari.isEmpty ? null : () => _pilihTgl(false), icon: const Icon(Icons.event_rounded), label: Text(_sampai.isEmpty ? 'Tanggal selesai' : _tgl(_sampai)))),
        ]),
        const SizedBox(height: 16),
        const Text('Sasaran', style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final m in const [('semua', 'Semua siswa'), ('jenjang', 'Jenjang'), ('rombel', 'Rombel'), ('unit', 'Unit belajar'), ('siswa', 'Siswa tertentu')])
            if (m.$1 != 'unit' || unit.isNotEmpty)
              ChoiceChip(
                label: Text(m.$2),
                selected: _mode == m.$1,
                onSelected: (_) => setState(() {
                  _mode = m.$1;
                  _nilai.clear();
                  if (_mode == 'semua') _lain = 'Belajar biasa';
                }),
              ),
        ]),
        const SizedBox(height: 8),
        if (_mode == 'jenjang') _pilihan([for (final p in program) (p, p.replaceFirst('PKT-', 'Paket '))]),
        if (_mode == 'rombel') _pilihan([for (final r in rombel) (teks(r['id']), teks(r['nama']))]),
        if (_mode == 'unit') _pilihan([for (final u in unit) (teks(u['id']), teks(u['nama']))]),
        if (_mode == 'siswa') ...[
          TextField(
            controller: _cariSiswa,
            decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: 'Cari nama siswa (min. 2 huruf) · ${_nilai.length} dipilih', isDense: true),
            onChanged: (_) => setState(() {}),
          ),
          for (final w in wb)
            CheckboxListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              value: _nilai.contains(teks(w['id'])),
              onChanged: (v) => setState(() => v == true ? _nilai.add(teks(w['id'])) : _nilai.remove(teks(w['id']))),
              title: Text(teks(w['nama'])),
              subtitle: Text(teks(w['rombel'])),
            ),
        ],
        if (_mode != 'semua') ...[
          const SizedBox(height: 16),
          const Text('Siswa yang bukan sasaran', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final l in daftar(d['statusLain']).map((e) => '$e')) ChoiceChip(label: Text(l), selected: _lain == l, onSelected: (_) => setState(() => _lain = l)),
          ]),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
                _lain == 'Libur'
                    ? 'Siswa lain libur; jadwal tatap muka mereka ditiadakan dan mereka mendapat notifikasi libur.'
                    : _lain == 'Belajar mandiri'
                        ? 'Siswa lain belajar mandiri online; jadwal tatap muka ditiadakan dan mereka mendapat notifikasi.'
                        : 'Siswa lain belajar seperti biasa sesuai jadwal.',
                style: const TextStyle(fontSize: 12)),
          ),
        ],
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: _ganti,
          onChanged: (v) => setState(() => _ganti = v),
          title: const Text('Gantikan jadwal tatap muka sasaran'),
          subtitle: const Text('Jadwal tatap muka rombel sasaran pada tanggal agenda tidak dihitung pertemuan wajib (kehadiran & honor).'),
        ),
        TextField(controller: _ket, maxLines: 3, decoration: const InputDecoration(labelText: 'Keterangan untuk penerima (opsional)', hintText: 'mis. tempat, perlengkapan')),
        const SizedBox(height: 20),
        FilledButton.icon(onPressed: _simpan, icon: const Icon(Icons.save_rounded), label: Text(widget.a == null ? 'Simpan draf & ajukan' : 'Simpan')),
      ]),
    );
  }
}
