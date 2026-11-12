// ============================================================================
// AGENDA LEMBAGA DI LUAR KALENDER AKADEMIK (v1.64.0)
// - Admin menambah agenda (mis. TKA, kegiatan, libur khusus) dengan sasaran: semua siswa, jenjang (program),
//   rombel, unit belajar, atau siswa tertentu; dan status siswa BUKAN sasaran: Belajar biasa / Libur /
//   Belajar mandiri (online).
// - Agenda berstatus Draft sampai DISAHKAN Kepala Sekolah. Setelah disahkan: tampil di kalender akademik,
//   notifikasi ke siswa sasaran, siswa bukan sasaran (bila libur / belajar mandiri), tutor rombel terkait, dan staf.
// - Jadwal tatap muka pada tanggal agenda tidak wajib (tidak dihitung pertemuan wajib, tidak tampil sebagai jadwal):
//   untuk rombel sasaran bila "gantikan jadwal tatap muka" aktif, dan untuk rombel bukan sasaran bila statusnya
//   Libur / Belajar mandiri.
// Data: tab AGENDA LEMBAGA.
// ============================================================================
var AG = {
  TAB: 'AGENDA LEMBAGA',
  HDR: ['ID', 'NAMA', 'JENIS', 'DARI', 'SAMPAI', 'SASARAN', 'STATUS LAIN', 'GANTI JADWAL', 'KETERANGAN', 'STATUS',
    'DIBUAT OLEH', 'DIBUAT PADA', 'DISAHKAN OLEH', 'DISAHKAN PADA', 'CATATAN'],
  JENIS: ['TKA', 'Kegiatan', 'Libur khusus', 'Lainnya'],
  MODE: ['semua', 'jenjang', 'rombel', 'unit', 'siswa'],
  LAIN: ['Belajar biasa', 'Libur', 'Belajar mandiri'],
  PERAN_BUAT: ['Admin'], PERAN_SAH: ['Kepala Sekolah'], PERAN_LIHAT: ['Admin', 'Kepala Sekolah', 'Superadmin', 'Koordinator Kurikulum'],
  MAKS_HARI: 62
};
var AG_MEMO_ = null;

function agObj_(r) {
  var s = {};
  try { s = JSON.parse(r['SASARAN'] || '{}') || {}; } catch (e) {}
  return { id: r['ID'], nama: r['NAMA'], jenis: r['JENIS'] || 'Lainnya', dari: ujTgl_(r['DARI']), sampai: ujTgl_(r['SAMPAI']),
    sasaran: { mode: AG.MODE.indexOf(s.mode) >= 0 ? s.mode : 'semua', nilai: Array.isArray(s.nilai) ? s.nilai.map(String) : [] },
    statusLain: AG.LAIN.indexOf(r['STATUS LAIN']) >= 0 ? r['STATUS LAIN'] : 'Belajar biasa', gantiJadwal: r['GANTI JADWAL'] !== 'Tidak',
    ket: r['KETERANGAN'] || '', status: r['STATUS'] || 'Draft', dibuatOleh: r['DIBUAT OLEH'], dibuatPada: r['DIBUAT PADA'],
    disahkanOleh: r['DISAHKAN OLEH'], disahkanPada: r['DISAHKAN PADA'], catatan: r['CATATAN'] || '', baris: r._baris };
}
function agSemua_() { return muBaca_(AG.TAB, AG.HDR).map(agObj_); }
function agSah_() {
  if (AG_MEMO_) return AG_MEMO_;
  var c = CacheService.getScriptCache(), l = null;
  try { l = c.get('ag_sah_v1'); } catch (e) {}
  if (l) { try { return (AG_MEMO_ = JSON.parse(l)); } catch (e1) {} }
  var a = [];
  try { a = agSemua_().filter(function(x) { return x.status === 'Disahkan'; }); } catch (e2) {}
  try { c.put('ag_sah_v1', JSON.stringify(a), 600); } catch (e3) {}
  return (AG_MEMO_ = a);
}
function agLupakan_() { AG_MEMO_ = null; try { CacheService.getScriptCache().remove('ag_sah_v1'); } catch (e) {} }
function agCari_(id) {
  var a = agSemua_().filter(function(x) { return x.id === String(id); })[0];
  if (!a) throw new Error('Agenda tidak ditemukan.');
  return a;
}

// ---------- siapa sasaran ----------
// Rombel SIM termasuk sasaran? 'penuh' | 'sebagian' | ''. info: {program (rombel), unitPm (unit pemetaan, opsional)}
function agRombelSasaran_(a, idRombel, program, unitPm) {
  var s = a.sasaran, v = s.nilai;
  if (s.mode === 'semua') return 'penuh';
  if (s.mode === 'jenjang') return v.indexOf(String(program || '')) >= 0 ? 'penuh' : '';
  if (s.mode === 'rombel') return v.indexOf(String(idRombel)) >= 0 ? 'penuh' : '';
  if (s.mode === 'unit') {
    if (unitPm) return String(unitPm).split(',').every(function(u) { return v.indexOf(u) >= 0; }) ? 'penuh' : (String(unitPm).split(',').some(function(u) { return v.indexOf(u) >= 0; }) ? 'sebagian' : '');
    return 'sebagian';
  }
  return 'sebagian';   // siswa tertentu
}
// Jadwal tatap muka rombel ini pada tanggal itu ditiadakan oleh agenda? (dipakai jadBerlaku_)
function agJadwalLibur_(daftar, tanggal, idRombel, program, unitPm) {
  for (var i = 0; i < daftar.length; i++) {
    var a = daftar[i];
    if (tanggal < a.dari || tanggal > a.sampai) continue;
    var st = agRombelSasaran_(a, idRombel, program, unitPm);
    if (st === 'penuh' && a.gantiJadwal) return a;
    if (st === '' && (a.statusLain === 'Libur' || a.statusLain === 'Belajar mandiri')) return a;
    if (st === 'sebagian' && a.sasaran.mode === 'unit' && !unitPm && a.gantiJadwal && (a.statusLain === 'Libur' || a.statusLain === 'Belajar mandiri')) return a;
  }
  return null;
}
var AG_PROG_ = null;
function agLiburPm_(x, tanggal) {
  var d = agSah_();
  if (!d.length) return null;
  if (!AG_PROG_) { AG_PROG_ = {}; try { var rb = honProgramRombel_(); Object.keys(rb).forEach(function(k) { AG_PROG_[k] = rb[k].program; }); } catch (e) {} }
  return agJadwalLibur_(d, tanggal, x.idRombel, AG_PROG_[x.idRombel] || x.paket || '', x.unit || '');
}
// Siswa (ID WB) sasaran & bukan sasaran.
function agPenerima_(a) {
  var lab = {};
  try { lab = ubPetaSiswa_(); } catch (e) {}
  var s = a.sasaran, v = s.nilai, ya = [], tidak = [], rombel = {};
  keuWbSemua_().forEach(function(w) {
    if (!w.aktif) return;
    var masuk = s.mode === 'semua' || (s.mode === 'jenjang' && v.indexOf(String(w.program)) >= 0) || (s.mode === 'rombel' && v.indexOf(w.idRombel) >= 0) ||
      (s.mode === 'unit' && lab[w.id] && v.indexOf(lab[w.id].unit) >= 0) || (s.mode === 'siswa' && v.indexOf(w.id) >= 0);
    (masuk ? ya : tidak).push(w.id);
    if (masuk) rombel[w.idRombel] = true;
  });
  return { sasaran: ya, bukan: tidak, rombel: Object.keys(rombel) };
}
function agTeksSasaran_(a) {
  var s = a.sasaran, n = s.nilai.length;
  if (s.mode === 'semua') return 'Semua siswa';
  if (s.mode === 'jenjang') return 'Jenjang ' + s.nilai.join(', ');
  if (s.mode === 'rombel') { var rb = honProgramRombel_(); return 'Rombel ' + s.nilai.map(function(r) { return rb[r] ? rb[r].nama : r; }).join(', '); }
  if (s.mode === 'unit') return typeof ubNamaKunci_ === 'function' ? ubNamaKunci_(ubKunci_(s.nilai)) : n + ' unit';
  return n + ' siswa tertentu';
}
function agTglTeks_(a) { return a.dari === a.sampai ? agTeksTgl_(a.dari) : agTeksTgl_(a.dari) + ' s.d. ' + agTeksTgl_(a.sampai); }
function agTeksTgl_(iso) {
  var b = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var p = String(iso || '').split('-');
  return p.length === 3 ? Number(p[2]) + ' ' + b[Number(p[1]) - 1] + ' ' + p[0] : String(iso || '');
}

// ---------- endpoint ----------
function agPeran_(p) {
  return { lihat: AG.PERAN_LIHAT.indexOf(p.peran) >= 0, buat: AG.PERAN_BUAT.indexOf(p.peran) >= 0, sah: AG.PERAN_SAH.indexOf(p.peran) >= 0 };
}
function waStafAgendaData(token) {
  var p = stafDariToken_(token), r = agPeran_(p);
  if (!r.lihat) throw new Error('Agenda lembaga untuk Admin dan pimpinan.');
  var rb = honProgramRombel_(), program = {};
  var rombel = Object.keys(rb).map(function(k) { if (rb[k].program) program[rb[k].program] = true; return { id: k, nama: rb[k].nama, program: rb[k].program }; })
    .sort(function(a, b) { return String(a.nama).localeCompare(String(b.nama), 'id', { numeric: true }); });
  var unit = [];
  try { unit = ubUnit_().filter(function(u) { return u.aktif; }).map(function(u) { return { id: u.id, nama: u.nama }; }); } catch (e) {}
  var agenda = agSemua_().reverse().map(function(a) { a.sasaranTeks = agTeksSasaran_(a); a.tanggalTeks = agTglTeks_(a); delete a.baris; return a; });
  return {
    agenda: agenda, rombel: rombel, program: Object.keys(program).sort(), unit: unit,
    wb: r.buat ? keuWbSemua_().filter(function(w) { return w.aktif; }).map(function(w) { return { id: w.id, nama: w.nama, rombel: w.namaRombel }; }) : [],
    jenis: AG.JENIS, statusLain: AG.LAIN, bolehBuat: r.buat, bolehSah: r.sah
  };
}
// d: {id?, nama, jenis, dari, sampai, sasaran:{mode, nilai[]}, statusLain, gantiJadwal, ket}
function waStafAgendaSimpan(token, d) {
  var p = stafDariToken_(token);
  if (!agPeran_(p).buat) throw new Error('Agenda dibuat oleh Admin.');
  d = d || {};
  var nama = String(d.nama || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (nama.length < 3) throw new Error('Isi nama agenda.');
  var jenis = AG.JENIS.indexOf(d.jenis) >= 0 ? d.jenis : 'Lainnya';
  var dari = ujTgl_(d.dari), sampai = ujTgl_(d.sampai || d.dari);
  if (!dari || !sampai || sampai < dari) throw new Error('Isi tanggal mulai dan selesai yang benar.');
  if (ujtTambahHari_(dari, AG.MAKS_HARI) < sampai) throw new Error('Rentang agenda maksimal ' + AG.MAKS_HARI + ' hari.');
  var s = d.sasaran || {}, mode = AG.MODE.indexOf(s.mode) >= 0 ? s.mode : 'semua';
  var nilai = mode === 'semua' ? [] : (Array.isArray(s.nilai) ? s.nilai.map(String).filter(function(x, i, a) { return x && a.indexOf(x) === i; }) : []);
  if (mode !== 'semua' && !nilai.length) throw new Error('Pilih sasaran agenda.');
  var lain = AG.LAIN.indexOf(d.statusLain) >= 0 ? d.statusLain : 'Belajar biasa';
  if (mode === 'semua') lain = 'Belajar biasa';
  var isi = { 'NAMA': nama, 'JENIS': jenis, 'DARI': dari, 'SAMPAI': sampai, 'SASARAN': JSON.stringify({ mode: mode, nilai: nilai }), 'STATUS LAIN': lain,
    'GANTI JADWAL': d.gantiJadwal === false ? 'Tidak' : 'Ya', 'KETERANGAN': String(d.ket || '').trim().slice(0, 500) };
  var sh = muTab_(AG.TAB, AG.HDR);
  if (d.id) {
    var a = agCari_(d.id);
    if (a.status !== 'Draft') throw new Error('Agenda yang sudah disahkan tidak bisa diubah. Minta Kepala Sekolah membatalkannya dulu.');
    Object.keys(isi).forEach(function(k) { sh.getRange(a.baris, AG.HDR.indexOf(k) + 1).setValue(isi[k]); });
    catat_(p.peran, '', p.nama, 'Ubah agenda', a.id + ' ' + nama, 'OK');
    return { sukses: true, id: a.id };
  }
  var id = 'AG-' + absId_().toUpperCase();
  isi['ID'] = id; isi['STATUS'] = 'Draft'; isi['DIBUAT OLEH'] = p.nama; isi['DIBUAT PADA'] = ujNow_();
  sh.appendRow(AG.HDR.map(function(h) { return isi[h] === undefined ? '' : isi[h]; }));
  npKirim_('agenda_minta_sah', { judul: 'Agenda menunggu pengesahan: ' + nama, isi: p.nama + ' menambahkan agenda ' + nama + ' (' + agTglTeks_({ dari: dari, sampai: sampai }) + '). Periksa lalu sahkan di menu Agenda Lembaga.',
    aksi: 'agenda_lembaga', ref: 'agm|' + id });
  catat_(p.peran, '', p.nama, 'Agenda baru', id + ' ' + nama + ' ' + dari + '–' + sampai, 'OK');
  return { sukses: true, id: id };
}
function waStafAgendaHapus(token, id) {
  var p = stafDariToken_(token);
  if (!agPeran_(p).buat) throw new Error('Agenda dihapus oleh Admin.');
  var a = agCari_(id);
  if (a.status === 'Disahkan') throw new Error('Agenda yang sudah disahkan tidak bisa dihapus. Minta Kepala Sekolah membatalkannya.');
  muTab_(AG.TAB, AG.HDR).deleteRow(a.baris);
  catat_(p.peran, '', p.nama, 'Hapus agenda', a.id + ' ' + a.nama, 'OK');
  return { sukses: true };
}
// Sahkan (KS): tampil di kalender & kirim notifikasi.
function waStafAgendaSahkan(token, id) {
  var p = stafDariToken_(token);
  if (!agPeran_(p).sah) throw new Error('Agenda disahkan oleh Kepala Sekolah.');
  var a = agCari_(id);
  if (a.status === 'Disahkan') throw new Error('Agenda ini sudah disahkan.');
  var sh = muTab_(AG.TAB, AG.HDR);
  sh.getRange(a.baris, AG.HDR.indexOf('STATUS') + 1).setValue('Disahkan');
  sh.getRange(a.baris, AG.HDR.indexOf('DISAHKAN OLEH') + 1).setValue(p.nama);
  sh.getRange(a.baris, AG.HDR.indexOf('DISAHKAN PADA') + 1).setValue(ujNow_());
  agLupakan_();
  var n = agKirimNotif_(a);
  catat_(p.peran, '', p.nama, 'Sahkan agenda', a.id + ' ' + a.nama + ': notifikasi ' + n.sasaran + ' sasaran, ' + n.bukan + ' bukan sasaran, ' + n.tutor + ' tutor', 'OK');
  return { sukses: true, notif: n };
}
// Batalkan pengesahan (KS): kembali Draft + notifikasi pembatalan ke penerima yang sama.
function waStafAgendaBatal(token, id, alasan) {
  var p = stafDariToken_(token);
  if (!agPeran_(p).sah) throw new Error('Pembatalan agenda oleh Kepala Sekolah.');
  alasan = String(alasan || '').trim();
  if (alasan.length < 5) throw new Error('Tulis alasan pembatalan (minimal 5 huruf).');
  var a = agCari_(id);
  if (a.status !== 'Disahkan') throw new Error('Agenda ini belum disahkan.');
  var sh = muTab_(AG.TAB, AG.HDR);
  sh.getRange(a.baris, AG.HDR.indexOf('STATUS') + 1).setValue('Draft');
  sh.getRange(a.baris, AG.HDR.indexOf('CATATAN') + 1).setValue(('Pengesahan dibatalkan ' + p.nama + ' ' + ujNow_() + ': ' + alasan).slice(0, 300));
  agLupakan_();
  var pn = agPenerima_(a);
  npKirim_('agenda_sasaran', { judul: 'Agenda dibatalkan: ' + a.nama, isi: a.nama + ' (' + agTglTeks_(a) + ') dibatalkan. ' + alasan, siswa: pn.sasaran.concat(a.statusLain !== 'Belajar biasa' ? pn.bukan : []), ref: 'agb|' + a.id + '|' + ujNow_() });
  npKirim_('agenda_staf', { judul: 'Agenda dibatalkan: ' + a.nama, isi: a.nama + ' (' + agTglTeks_(a) + ') dibatalkan oleh ' + p.nama + '. ' + alasan, aksi: 'agenda_lembaga', ref: 'agbs|' + a.id + '|' + ujNow_() });
  catat_(p.peran, '', p.nama, 'Batal agenda', a.id + ' ' + a.nama + ': ' + alasan, 'OK');
  return { sukses: true };
}
function agKirimNotif_(a) {
  var pn = agPenerima_(a), tgl = agTglTeks_(a), out = { sasaran: pn.sasaran.length, bukan: 0, tutor: 0 };
  var ket = a.ket ? ' ' + a.ket : '';
  if (pn.sasaran.length) npKirim_('agenda_sasaran', { judul: a.nama + ' · ' + tgl, isi: 'Anda termasuk peserta ' + a.nama + ' pada ' + tgl + '.' + ket, siswa: pn.sasaran, ref: 'ags|' + a.id });
  if (a.statusLain !== 'Belajar biasa' && pn.bukan.length) {
    out.bukan = pn.bukan.length;
    npKirim_('agenda_libur', { judul: (a.statusLain === 'Libur' ? 'Libur: ' : 'Belajar mandiri: ') + tgl,
      isi: 'Selama ' + a.nama + ' (' + tgl + '), ' + (a.statusLain === 'Libur' ? 'kegiatan belajar Anda diliburkan.' : 'Anda belajar mandiri secara online; tidak ada tatap muka.') + ket,
      siswa: pn.bukan, ref: 'agl|' + a.id });
  }
  // tutor yang punya jadwal tatap muka pada tanggal agenda dan jadwalnya ditiadakan
  var tutor = {};
  try {
    jadBacaPm_().data.forEach(function(x) {
      if (!x.aktif || !x.idTutor) return;
      for (var t = a.dari, i = 0; t <= a.sampai && i <= AG.MAKS_HARI; t = ujtTambahHari_(t, 1), i++) {
        if (x.hari !== jadHariDari_(t) || (x.dari && t < x.dari) || (x.sampai && t > x.sampai)) continue;
        if (agJadwalLibur_([a], t, x.idRombel, (honProgramRombel_()[x.idRombel] || {}).program, x.unit)) tutor[x.idTutor] = true;
      }
    });
  } catch (e) {}
  out.tutor = Object.keys(tutor).length;
  if (out.tutor) npKirim_('agenda_tutor', { judul: 'Jadwal tatap muka ditiadakan · ' + tgl, isi: 'Karena ' + a.nama + ' (' + tgl + '), sebagian jadwal tatap muka Anda pada tanggal itu ditiadakan dan tidak dihitung pertemuan wajib.' + ket,
    tutor: Object.keys(tutor), ref: 'agt|' + a.id });
  npKirim_('agenda_staf', { judul: 'Agenda disahkan: ' + a.nama, isi: a.nama + ' · ' + tgl + ' · sasaran: ' + agTeksSasaran_(a) + ' · bukan sasaran: ' + a.statusLain + '.', aksi: 'agenda_lembaga', ref: 'agst|' + a.id });
  return out;
}

// ---------- kalender akademik: agenda yang menyangkut rombel ini ----------
function agKalender_(idRombelSim, program, dari, sampai) {
  return agSah_().filter(function(a) { return a.sampai >= dari && a.dari <= sampai; }).map(function(a) {
    var st = agRombelSasaran_(a, idRombelSim, program, '');
    return { nama: a.nama, jenis: a.jenis, dari: a.dari, sampai: a.sampai, ket: a.ket,
      status: st === 'penuh' ? 'Sasaran' : (st === 'sebagian' ? 'Sebagian siswa sasaran' + (a.statusLain !== 'Belajar biasa' ? '; lainnya ' + a.statusLain.toLowerCase() : '') : a.statusLain) };
  }).sort(function(x, y) { return x.dari.localeCompare(y.dari); });
}
