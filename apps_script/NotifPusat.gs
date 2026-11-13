// ============================================================================
// PUSAT NOTIFIKASI PER PERAN (v1.50.0)
// - Kejadian (tagihan, pembayaran, persetujuan, honor, referral, pajak) dicatat di tab NOTIF PENGGUNA.
// - Dikirim lewat jalur waNotifCek yang sudah ada (aplikasi terbuka ~20-90 detik; Android latar belakang ~15 menit),
//   jadi tampil sebagai notifikasi ponsel walau aplikasi tertutup. Ditandai tipe 'event' (tanpa dialog).
// - Kotak masuk (lonceng): waNotifKotak - 30 hari terakhir + pengumuman aktif.
// - Admin mengatur jenis notifikasi per peran (Script Property TH_NOTIF_MATRIKS). Sasaran:
//     siswa  -> warga belajar tertentu (ID WB)     tutor -> tutor tertentu (ID TUTOR)
//     peran  -> semua akun staf dengan peran yang dicentang
// - Pemicu harian 06.00: pengingat jatuh tempo tagihan (H-3, H, H+1), Senin: pajak belum disetor & ringkasan.
// ============================================================================
var NP = {
  TAB: 'NOTIF PENGGUNA',
  HDR: ['ID', 'WAKTU', 'WAKTU MS', 'JENIS', 'JUDUL', 'ISI', 'AKSI', 'SISWA', 'TUTOR', 'STAF', 'REF'],
  PROP: 'TH_NOTIF_MATRIKS', CACHE: 'np_aktif_v1', HARI_TAMPIL: 3, HARI_KOTAK: 30, PEMICU: 'pemicuNotifHarian',
  // urutan = urutan tampil di pengaturan
  JENIS: [
    { kode: 'tagihan_baru', nama: 'Tagihan baru', grup: 'Siswa', sasaran: 'siswa', peran: ['Siswa'] },
    { kode: 'tagihan_ingat', nama: 'Pengingat jatuh tempo tagihan (H-3, H, H+1)', grup: 'Siswa', sasaran: 'siswa', peran: ['Siswa'] },
    { kode: 'pembayaran_diterima', nama: 'Pembayaran tagihan diterima', grup: 'Siswa', sasaran: 'siswa', peran: ['Siswa'] },
    { kode: 'transfer_ditolak', nama: 'Bukti transfer ditolak', grup: 'Siswa', sasaran: 'siswa', peran: ['Siswa'] },
    { kode: 'keringanan', nama: 'Keringanan tagihan diberikan', grup: 'Siswa', sasaran: 'siswa', peran: ['Siswa'] },
    { kode: 'honor_disetujui', nama: 'Honor disetujui', grup: 'Tutor', sasaran: 'tutor', peran: ['Tutor'] },
    { kode: 'honor_dibayar', nama: 'Honor dibayar', grup: 'Tutor', sasaran: 'tutor', peran: ['Tutor'] },
    { kode: 'honor_batal', nama: 'Pembayaran honor dibatalkan', grup: 'Tutor', sasaran: 'tutor', peran: ['Tutor'] },
    { kode: 'bayar_online_masuk', nama: 'Pembayaran online masuk', grup: 'Keuangan', sasaran: 'peran', peran: ['Bendahara', 'Admin'] },
    { kode: 'transfer_masuk', nama: 'Bukti transfer tagihan perlu diperiksa', grup: 'Keuangan', sasaran: 'peran', peran: ['Bendahara', 'Admin'] },
    { kode: 'pengeluaran_menunggu', nama: 'Pengeluaran menunggu persetujuan', grup: 'Keuangan', sasaran: 'peran', peran: ['Superadmin'] },
    { kode: 'pengeluaran_diputus', nama: 'Pengeluaran disetujui / ditolak', grup: 'Keuangan', sasaran: 'peran', peran: ['Bendahara'] },
    { kode: 'honor_perlu_setuju', nama: 'Rekap honor perlu disetujui', grup: 'Keuangan', sasaran: 'peran', peran: ['Superadmin'] },
    { kode: 'tarik_menunggu', nama: 'Penarikan cashback menunggu persetujuan', grup: 'Keuangan', sasaran: 'peran', peran: ['Superadmin'] },
    { kode: 'tarik_disetujui', nama: 'Penarikan cashback disetujui (perlu dibayar)', grup: 'Keuangan', sasaran: 'peran', peran: ['Bendahara'] },
    { kode: 'pajak_belum_setor', nama: 'Potongan pajak belum disetor (tiap Senin)', grup: 'Keuangan', sasaran: 'peran', peran: ['Bendahara'] },
    { kode: 'ringkasan_keuangan', nama: 'Ringkasan keuangan mingguan (tiap Senin)', grup: 'Keuangan', sasaran: 'peran', peran: ['Kepala Sekolah', 'Superadmin'] },
    { kode: 'referral_baru', nama: 'Pendaftaran referral baru', grup: 'Pendaftaran', sasaran: 'peran', peran: ['Admin', 'Front Office'] },
    { kode: 'referral_bukti', nama: 'Bukti bayar pendaftaran masuk', grup: 'Pendaftaran', sasaran: 'peran', peran: ['Admin', 'Front Office', 'Bendahara'] },
    // v1.53.0: hanya untuk pengguna yang bisa membuka menu Pengajuan Tutor (fitur)
    { kode: 'ujian_minta_buka', nama: 'Pengawas meminta kunci ujian dibuka', grup: 'Ujian', sasaran: 'peran', peran: ['Koordinator Kurikulum', 'Kepala Sekolah', 'Admin'], fitur: 'pengawasUjian' },
    { kode: 'ujian_pelanggaran_berat', nama: 'Pelanggaran berat saat ujian (perlu ditinjau)', grup: 'Ujian', sasaran: 'peran', peran: ['Kepala Sekolah', 'Admin'], fitur: 'masaUjian' },
    { kode: 'ujian_dispensasi_minta', nama: 'Pengajuan ikut ujian (kehadiran kurang dari syarat)', grup: 'Ujian', sasaran: 'peran', peran: ['Kepala Sekolah'], fitur: 'dispensasi' },
    { kode: 'remedial_diajukan', nama: 'Pengajuan remedial siswa (tutor mapel + pemantau)', grup: 'Ujian', sasaran: 'peran', peran: ['Admin', 'Kepala Sekolah'] },
    { kode: 'remedial_lewat', nama: 'Remedial belum diputuskan tutor lebih dari 2 hari', grup: 'Ujian', sasaran: 'peran', peran: ['Admin', 'Kepala Sekolah'] },
    { kode: 'remedial_diputus', nama: 'Remedial disetujui / ditolak', grup: 'Siswa', sasaran: 'siswa', peran: ['Siswa'] },
    // v1.61.0: hanya ke koordinator unit siswa terkait (hanyaStaf); kolom peran = sakelar aktif/nonaktif
    { kode: 'unit_pelanggaran', nama: 'Siswa unit Anda melakukan pelanggaran berat saat ujian', grup: 'Unit Belajar', sasaran: 'peran', peran: ['Koordinator Unit'], hanyaStaf: true },
    { kode: 'unit_mingguan', nama: 'Ringkasan mingguan unit (kehadiran kurang & tunggakan)', grup: 'Unit Belajar', sasaran: 'peran', peran: ['Koordinator Unit'], hanyaStaf: true },
    // v1.64.0: agenda lembaga
    { kode: 'agenda_minta_sah', nama: 'Agenda lembaga menunggu pengesahan', grup: 'Agenda', sasaran: 'peran', peran: ['Kepala Sekolah'], fitur: 'agendaLembaga' },
    { kode: 'agenda_staf', nama: 'Agenda lembaga disahkan / dibatalkan', grup: 'Agenda', sasaran: 'peran', peran: ['Admin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Koordinator Unit', 'Front Office'] },
    { kode: 'agenda_tutor', nama: 'Jadwal tatap muka ditiadakan karena agenda', grup: 'Agenda', sasaran: 'tutor', peran: ['Tutor'] },
    { kode: 'agenda_sasaran', nama: 'Agenda untuk siswa sasaran', grup: 'Siswa', sasaran: 'siswa', peran: ['Siswa'] },
    { kode: 'agenda_libur', nama: 'Libur / belajar mandiri karena agenda', grup: 'Siswa', sasaran: 'siswa', peran: ['Siswa'] },
    // v1.67.0: Front Office melaporkan pembayaran aktivasi QR diterima
    { kode: 'aqr_lapor', nama: 'Pembayaran aktivasi QR diterima FO (perlu diaktifkan)', grup: 'Warga Belajar', sasaran: 'peran', peran: ['Admin', 'Kepala Sekolah'], fitur: 'aktivasiQr' },
    // v1.68.0: VA custom dibayar online
    { kode: 'va_custom_lunas', nama: 'VA custom dibayar', grup: 'Keuangan', sasaran: 'peran', peran: ['Admin', 'Kepala Sekolah', 'Front Office', 'Bendahara'], fitur: 'vaCustom' },
    // v1.70.0: kelayakan ujian. v1.76.1: Admin & KS selalu menerima semua (wajib); peran lain hanya sesuai konteksnya
    // (batas: akademik -> Koordinator Kurikulum, keuangan -> Bendahara), walau Pengaturan Notifikasi diubah.
    { kode: 'kl_aju_akademik', nama: 'Permohonan kelayakan ujian (akademik)', grup: 'Ujian', sasaran: 'peran', peran: ['Koordinator Kurikulum', 'Admin', 'Kepala Sekolah'], fitur: 'kelayakanUjian',
      wajib: ['Admin', 'Kepala Sekolah'], batas: ['Admin', 'Kepala Sekolah', 'Koordinator Kurikulum'] },
    { kode: 'kl_aju_keuangan', nama: 'Permohonan kelayakan ujian (keuangan)', grup: 'Ujian', sasaran: 'peran', peran: ['Bendahara', 'Admin', 'Kepala Sekolah'], fitur: 'kelayakanUjian',
      wajib: ['Admin', 'Kepala Sekolah'], batas: ['Admin', 'Kepala Sekolah', 'Bendahara'] },
    { kode: 'kl_ks', nama: 'Permohonan kelayakan ujian menunggu keputusan', grup: 'Ujian', sasaran: 'peran', peran: ['Kepala Sekolah', 'Admin'], fitur: 'kelayakanUjian',
      wajib: ['Admin', 'Kepala Sekolah'], batas: ['Admin', 'Kepala Sekolah'] },
    { kode: 'kl_janji', nama: 'Janji bayar kelayakan ujian tidak ditepati', grup: 'Ujian', sasaran: 'peran', peran: ['Bendahara', 'Kepala Sekolah', 'Admin'], fitur: 'kelayakanUjian',
      wajib: ['Admin', 'Kepala Sekolah'], batas: ['Admin', 'Kepala Sekolah', 'Bendahara'] },
    { kode: 'kl_putus', nama: 'Keputusan / perubahan kelayakan ujian', grup: 'Siswa', sasaran: 'siswa', peran: ['Siswa'] },
    { kode: 'kl_panggil', nama: 'Panggilan dari bagian kurikulum / keuangan', grup: 'Siswa', sasaran: 'siswa', peran: ['Siswa'] },
    { kode: 'tutor_mapel_baru', nama: 'Tutor baru mengajukan mapel', grup: 'Pengguna', sasaran: 'peran', peran: ['Admin'], fitur: 'pengajuanTutor' }
  ]
};
if (typeof API_FLUTTER !== 'undefined' && API_FLUTTER && API_FLUTTER.TAMBAHAN) API_FLUTTER.TAMBAHAN.waNotifKotak = true;

// ---------- aturan per peran ----------
function npAturan_() {
  var s = {};
  try { s = JSON.parse(PropertiesService.getScriptProperties().getProperty(NP.PROP) || '{}') || {}; } catch (e) {}
  var out = {};
  NP.JENIS.forEach(function(j) { out[j.kode] = Array.isArray(s[j.kode]) ? s[j.kode] : j.peran.slice(); });
  return out;
}
function npJenis_(kode) { return NP.JENIS.filter(function(j) { return j.kode === kode; })[0] || null; }

function waAdminNotifAturan(token) {
  wajibAdmin_(token);
  var at = npAturan_();
  return { jenis: NP.JENIS.map(function(j) { return { kode: j.kode, nama: j.nama, grup: j.grup, sasaran: j.sasaran, bawaan: j.peran, peran: at[j.kode] }; }),
    peranStaf: BC.PERAN.filter(function(p) { return p !== 'Dinas Pendidikan'; }) };
}
// d: {kode: [peran...]}
function waAdminNotifAturanSimpan(token, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  var simpan = {};
  NP.JENIS.forEach(function(j) {
    if (!Array.isArray(d[j.kode])) return;
    var boleh = j.sasaran === 'siswa' ? ['Siswa'] : j.sasaran === 'tutor' ? ['Tutor'] : BC.PERAN;
    simpan[j.kode] = d[j.kode].map(String).filter(function(x) { return boleh.indexOf(x) >= 0; });
  });
  PropertiesService.getScriptProperties().setProperty(NP.PROP, JSON.stringify(simpan));
  try { npPastikanPemicu_(true); } catch (e) {}
  catat_(p.peran, '', p.nama, 'Atur notifikasi', Object.keys(simpan).length + ' jenis', 'OK');
  return waAdminNotifAturan(token);
}

// ---------- tabel ----------
function npTab_() { return bcSheet_(NP.TAB, NP.HDR); }
function npDariBaris_(r) {
  var j = function(s) { return String(s || '').split(',').map(function(x) { return x.trim(); }).filter(String); };
  return { id: String(r[0]), waktu: String(r[1]), ms: Number(r[2]) || 0, jenis: String(r[3]), judul: String(r[4]), isi: String(r[5]), aksi: String(r[6]),
    siswa: j(r[7]), tutor: j(r[8]), staf: j(r[9]), ref: String(r[10] || '') };
}
// Kejadian dalam [hari] terakhir (dibaca dari bawah, maks. baris).
function npBaca_(hari, maks) {
  var sh = npTab_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var ambil = Math.min(n, maks || 800), batas = Date.now() - hari * 86400000;
  return sh.getRange(sh.getLastRow() - ambil + 1, 1, ambil, NP.HDR.length).getValues().map(npDariBaris_)
    .filter(function(e) { return e.id && e.ms >= batas; });
}
function npAktif_() {
  var c = CacheService.getScriptCache();
  try { var lama = c.get(NP.CACHE); if (lama) return JSON.parse(lama); } catch (e) {}
  var a = npBaca_(NP.HARI_TAMPIL, 600);
  try { var s = JSON.stringify(a); if (s.length < 95000) c.put(NP.CACHE, s, 600); } catch (e2) {}
  return a;
}

// Catat kejadian. o: {judul, isi, aksi, ref, siswa:[ID WB], tutor:[ID TUTOR], staf:[ID pengguna]}. Tidak pernah melempar galat.
function npKirim_(jenis, o) {
  try {
    o = o || {};
    var j = npJenis_(jenis), at = npAturan_();
    if (!j || !(at[jenis] || []).length) return '';
    if (j.sasaran === 'siswa' && !(o.siswa || []).length) return '';
    if (j.sasaran === 'tutor' && !(o.tutor || []).length) return '';
    if (o.ref && npAktif_().some(function(e) { return e.ref === o.ref && e.jenis === jenis; })) return '';   // tidak dobel
    var ms = Date.now(), id = 'NP-' + ms.toString(36).toUpperCase() + '-' + absId_().slice(0, 4).toUpperCase();
    npTab_().appendRow([id, Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'), ms, jenis,
      String(o.judul || j.nama).slice(0, 120), String(o.isi || '').slice(0, 500), String(o.aksi || ''),
      (o.siswa || []).join(','), (o.tutor || []).join(','), (o.staf || []).join(','), String(o.ref || '')]);
    try { CacheService.getScriptCache().remove(NP.CACHE); } catch (e1) {}
    try { npPastikanPemicu_(false); } catch (e2) {}
    return id;
  } catch (e) { return ''; }
}

// ---------- pencocokan audiens ----------
// a: {jenis:'siswa'|'staf', id, nama, rombel, peran} dari Perangkat Notif.
function npKonteks_(a) {
  var ctx = {}, c = CacheService.getScriptCache();
  ctx.wb = function() {
    if (ctx._wb !== undefined) return ctx._wb;
    var k = 'npwb|' + Utilities.base64EncodeWebSafe(a.rombel + '|' + normNama_(a.nama)).slice(0, 200);
    try { var l = c.get(k); if (l) return (ctx._wb = l === '-' ? '' : l); } catch (e) {}
    var id = '';
    try { id = ksWb_({ nama: a.nama, idRombel: a.rombel }).id; } catch (e2) {}
    try { c.put(k, id || '-', 21600); } catch (e3) {}
    return (ctx._wb = id);
  };
  ctx.tutor = function() {
    if (ctx._tt !== undefined) return ctx._tt;
    var t = null;
    try { t = absTutorSaya_({ id: a.id, nama: a.nama }); } catch (e) {}
    return (ctx._tt = t ? t.id : '');
  };
  return ctx;
}
function npCocok_(e, a, at, ctx) {
  var j = npJenis_(e.jenis), boleh = at[e.jenis] || [];
  if (!j || !boleh.length) return false;
  if (j.sasaran === 'siswa') return a.jenis === 'siswa' && !!ctx.wb() && e.siswa.indexOf(ctx.wb()) >= 0;
  if (a.jenis !== 'staf') return false;
  if (j.sasaran === 'tutor') return !!ctx.tutor() && e.tutor.indexOf(ctx.tutor()) >= 0;
  if (j.hanyaStaf) return e.staf.indexOf(String(a.id)) >= 0;
  if (e.staf.length && e.staf.indexOf(String(a.id)) >= 0) return true;
  if (j.batas && j.batas.indexOf(a.peran) < 0) return false;   // v1.76.1: di luar konteksnya tidak pernah menerima
  if (j.fitur) {
    // notifikasi yang terikat fitur: penerima wajib punya izin fitur itu (peran bawaan atau izin tambahan dari admin)
    var izin = npIzinFitur_(a, j.fitur);
    if (!izin.boleh) return false;
    if (j.wajib && j.wajib.indexOf(a.peran) >= 0) return true;   // v1.76.1: Admin & KS selalu menerima
    return boleh.indexOf(a.peran) >= 0 || izin.tambahan;
  }
  return boleh.indexOf(a.peran) >= 0;
}
function npIzinFitur_(a, fitur) {
  try {
    var ftr = IZN.FITUR.filter(function(f) { return f[0] === fitur; })[0];
    var dasar = a.peranAsli || a.peran;
    if (!ftr) return { boleh: false, tambahan: false };
    if (dasar === 'Admin' && !a.peranKustom) return { boleh: ftr[3].indexOf('Admin') >= 0, tambahan: false };
    var punya = izNilai_(izPetaPengguna_(a)[fitur]) > 0;
    return { boleh: punya, tambahan: punya && ftr[3].indexOf(dasar) < 0 };
  } catch (e) { return { boleh: false, tambahan: false }; }
}
function npKePesan_(e) { return { id: e.id, judul: e.judul, isi: e.isi, waktu: e.waktu, oleh: 'TH.E-Course', tipe: 'event', jenis: e.jenis, aksi: e.aksi }; }
// Untuk waNotifCek: kejadian 3 hari terakhir yang cocok (maks. 15).
function npUntuk_(a) {
  if (!a) return [];
  var semua = npAktif_();
  if (!semua.length) return [];
  var at = npAturan_(), ctx = npKonteks_(a);
  return semua.filter(function(e) { return npCocok_(e, a, at, ctx); }).slice(-15).reverse().map(npKePesan_);
}
// Kotak masuk: 30 hari + pengumuman aktif.
function waNotifKotak(kunci) {
  var a = bcAudiens_(kunci), now = Date.now();
  if (!a) return { sah: false, pesan: [] };
  var at = npAturan_(), ctx = npKonteks_(a);
  var ev = npBaca_(NP.HARI_KOTAK, 3000).filter(function(e) { return npCocok_(e, a, at, ctx); }).reverse().slice(0, 150).map(npKePesan_);
  var bc = [];
  try {
    bc = bcAktif_().filter(function(b) { return b.berlakuMs > now && bcCocok_(b, a); }).slice(0, 20)
      .map(function(b) { return { id: b.id, judul: b.judul, isi: b.isi, waktu: b.waktu, oleh: b.oleh, tipe: 'pengumuman', jenis: 'pengumuman', aksi: '', sekali: !!(b.sasaran && b.sasaran.sekali) }; });
  } catch (e) {}
  return { sah: true, pesan: bc.concat(ev), sekarangMs: now };
}

// ---------- pemicu harian ----------
function npPastikanPemicu_(paksa) {
  var pr = PropertiesService.getScriptProperties();
  if (!paksa && pr.getProperty('np_pemicu') === '1') return;
  var ada = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === NP.PEMICU; });
  if (!ada) ScriptApp.newTrigger(NP.PEMICU).timeBased().everyDays(1).atHour(6).create();
  pr.setProperty('np_pemicu', '1');
}
function pemicuNotifHarian() {
  try { sbPengingatRemedial_(); } catch (eR) {}   // v1.57.0
  try { npPengingatTagihan_(); } catch (e) { try { pmlCatatGalat_('pemicu', NP.PEMICU, String(e && e.message || e), e && e.stack, '', ''); } catch (e1) {} }
  try { if (new Date().getDay() === 1) npMingguan_(); } catch (e2) { try { pmlCatatGalat_('pemicu', NP.PEMICU, String(e2 && e2.message || e2), e2 && e2.stack, '', ''); } catch (e3) {} }
}
function npTglTambah_(iso, hari) {
  var d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + hari);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function npPengingatTagihan_() {
  var hari = absHariIni_(), wbs = keuWbSemua_(), pb = keuBayarPeta_();
  keuTagSemua_().data.forEach(function(t) {
    if (!t.aktif || !t.jatuhTempo) return;
    var ket = hari === npTglTambah_(t.jatuhTempo, -3) ? 'jatuh tempo 3 hari lagi' : hari === t.jatuhTempo ? 'jatuh tempo hari ini'
      : hari === npTglTambah_(t.jatuhTempo, 1) ? 'sudah lewat jatuh tempo' : '';
    if (!ket) return;
    var per = {};
    keuRinci_(t, wbs, pb).forEach(function(r) { if (r.sisa > 0) (per[r.sisa] = per[r.sisa] || []).push(r.idWb); });
    Object.keys(per).forEach(function(sisa) {
      npKirim_('tagihan_ingat', { judul: t.nama + ': ' + ket, isi: 'Sisa yang harus dibayar ' + honRp_(Number(sisa)) + ' (jatuh tempo ' + t.jatuhTempo + '). Ketuk untuk membayar.',
        aksi: 'tagihan_saya', siswa: per[sisa], ref: 'ingat|' + t.id + '|' + hari + '|' + sisa });
    });
  });
}
function npMingguan_() {
  var hari = absHariIni_();
  // pajak belum disetor
  var belum = 0;
  keuSemua_().forEach(function(x) { if (x.kategori === PJK.KAT && x.jenis === 'Pemasukan' && keuSah_(x) && !x.disetor) belum += x.jumlah; });
  if (belum > 0) npKirim_('pajak_belum_setor', { judul: 'Pajak belum disetor ' + honRp_(belum), isi: 'Ada potongan PPh yang belum disetor. Buka Keuangan → Pajak untuk menyetor dan mencatat NTPN.', aksi: 'keuangan', ref: 'pajak|' + hari });
  // ringkasan 7 hari
  var dari = npTglTambah_(hari, -7), masuk = 0, keluar = 0, menunggu = 0, nMenunggu = 0;
  keuSemua_().forEach(function(x) {
    if (x.status === 'Menunggu') { menunggu += x.jumlah; nMenunggu++; }
    if (!keuSah_(x) || x.jenis === 'Mutasi' || x.tanggal < dari || x.tanggal >= hari) return;
    if (x.jenis === 'Pengeluaran') keluar += x.jumlah; else masuk += x.jumlah;
  });
  try { if (typeof ubMingguan_ === 'function') ubMingguan_(hari); } catch (eU) {}   // v1.61.0
  var tunggak = 0, wbs = keuWbSemua_(), pb = keuBayarPeta_();
  keuTagSemua_().data.forEach(function(t) { if (t.aktif) keuRinci_(t, wbs, pb).forEach(function(r) { tunggak += r.sisa; }); });
  npKirim_('ringkasan_keuangan', { judul: 'Ringkasan keuangan 7 hari terakhir',
    isi: 'Pemasukan ' + honRp_(masuk) + ' · pengeluaran ' + honRp_(keluar) + ' · tunggakan tagihan ' + honRp_(tunggak) + (nMenunggu ? ' · ' + nMenunggu + ' pengeluaran menunggu persetujuan (' + honRp_(menunggu) + ')' : '') + '.',
    aksi: 'keuangan', ref: 'ringkas|' + hari });
}

// ---------- pembantu pemancar (dipanggil dari modul lain) ----------
function npTagihanBaru_(tagId) {
  try {
    var t = keuTagCari_(tagId);
    if (!t.aktif) return;
    var ids = keuWbSemua_().filter(function(w) { return keuKena_(t, w); }).map(function(w) { return w.id; });
    if (!ids.length) return;
    npKirim_('tagihan_baru', { judul: 'Tagihan baru: ' + t.nama, isi: 'Jumlah ' + honRp_(t.jumlah) + (t.jatuhTempo ? ', jatuh tempo ' + t.jatuhTempo : '') + '. Ketuk untuk melihat dan membayar.',
      aksi: 'tagihan_saya', siswa: ids, ref: 'baru|' + t.id });
  } catch (e) {}
}
function npBayarDiterima_(idWb, namaTagihan, jumlah, cara) {
  npKirim_('pembayaran_diterima', { judul: 'Pembayaran diterima: ' + namaTagihan, isi: honRp_(jumlah) + (cara ? ' (' + cara + ')' : '') + ' sudah tercatat. Terima kasih.', aksi: 'tagihan_saya', siswa: [idWb] });
}
