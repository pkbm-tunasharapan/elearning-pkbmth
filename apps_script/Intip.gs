// ============================================================================
// LIHAT SEBAGAI (v1.81.0): Admin membuka aplikasi dari sudut pandang Tutor atau Siswa, HANYA MEMBACA.
// - Admin memilih nama -> server menerbitkan sesi khusus (Tutor: token staf; Siswa: token sesi siswa) yang
//   ditandai "lihat" + kunci mode lihat (dikirim aplikasi di setiap permintaan sebagai body.intip).
// - Setiap permintaan ber-body.intip diperiksa di doPost (intipJaga_): hanya fungsi BACA yang diizinkan.
//   Token sesi lihat tidak dapat dipakai tanpa kunci mode lihat (stafDariToken_ / siswaDariSesi_ menolak).
// - Saat mode lihat: log aktivitas (catat_), catatan pemakaian rilis uji, dan pendaftaran notifikasi tidak dijalankan,
//   sehingga tidak meninggalkan jejak di akun yang dilihat.
// - Berlaku 1 jam (tidak diperpanjang). Setiap mulai mode lihat dicatat atas nama Admin.
// ============================================================================
var INTIP = {
  DURASI: 3600,
  AWAL: 'intip_', STAF: 'intipstaf_', SISWA: 'intipsis_',
  // fungsi staf yang namanya tidak tergolong BACA tetapi hanya membaca
  STAF_EKSTRA: { waStafProfil: true, waStafProfilAkun: true, waStafVersiApp: true, waStafBeranda: true, waStafDasbor: true, waStafUlangTahun: true,
    waStafKartu: true, waStafSesiDaftar: true, waStafKerangka: true, waStafUjianKotak: true, waStafKalender: true, waStafPromosi: true,
    waStafRuangCek: true, waStafRuangPoll: true, waNotifCek: true, waNotifKotak: true, waUrlStaf: true,
    waStafKelayakanSiswa: true, waStafKelayakanPermohonan: true, waStafUjianPratinjau: true },
  // tergolong BACA menurut namanya, tetapi mengubah data / membuat berkas -> ditolak
  STAF_TOLAK: /(TerbitSemua|SetujuiSemua|ResetData|Prompt|Pratinjau|Hangatkan|Pdf$|Format$)/,
  STAF_TOLAK_NAMA: { waNotifDaftar: true, waStafKeluar: true, waStafHtmlPdf: true },
  SISWA_BACA: { waProfilSiswa: true, waKartuSiswa: true, waSiswaBeranda: true, waSiswaPencapaian: true, waSiswaKelayakan: true, waSiswaTagihan: true,
    waGetMateri: true, waGetRiwayatJawaban: true, waGetDraftDiskusi: true, waStatusUjian: true, waSiswaKalender: true, waMediaAjarSiswa: true,
    waRuangPoll: true, waRuangCek: true, waRefKonteks: true, waRefDetail: true, waNotifCek: true, waNotifKotak: true, waUlangTahun: true, waDaftarRombel: true }
};
if (typeof API_FLUTTER !== 'undefined' && API_FLUTTER && API_FLUTTER.TAMBAHAN) {
  ['waAdminIntipDaftar', 'waAdminIntipMulai', 'waAdminIntipAkhiri'].forEach(function(f) { API_FLUTTER.TAMBAHAN[f] = true; });
}

// Apakah fungsi fn boleh dipanggil dalam mode lihat jenis tertentu ('tutor' | 'siswa').
function intipBoleh_(jenis, fn) {
  fn = String(fn || '');
  if (jenis === 'siswa') return INTIP.SISWA_BACA[fn] === true;
  if (INTIP.STAF_TOLAK_NAMA[fn]) return false;
  if (INTIP.STAF_EKSTRA[fn] === true) return true;
  if (typeof DINAS !== 'undefined' && DINAS.BACA[fn] === true) return true;
  if (!/^wa(Staf|Admin)/.test(fn) || INTIP.STAF_TOLAK.test(fn)) return false;
  return typeof izAksi_ === 'function' && izAksi_(fn) === 'lihat';
}

// Dipanggil doPost bila body.intip ada. Melempar galat bila mode lihat habis atau fungsi bukan fungsi baca.
function intipJaga_(fn, kunci) {
  var mentah = kunci ? CacheService.getScriptCache().get(INTIP.AWAL + String(kunci)) : null;
  if (!mentah) throw new Error('MODE_LIHAT_HABIS: Mode lihat sudah berakhir. Kembali ke akun Admin.');
  var info = JSON.parse(mentah);
  if (!intipBoleh_(info.jenis, fn)) throw new Error('Mode lihat (hanya baca): tindakan ini tidak dapat dilakukan saat melihat sebagai ' + info.nama + '.');
  globalThis.__INTIP = info;
  return info;
}

function intipAktif_() { return !!globalThis.__INTIP; }

// Token sesi lihat hanya sah bila permintaan membawa kunci mode lihat.
function intipTolakTanpaKunci_(awal, token) {
  if (!token || intipAktif_()) return;
  var ada = null;
  try { ada = CacheService.getScriptCache().get(awal + String(token)); } catch (e) {}
  if (ada) throw new Error('SESI_HABIS');
}

// Daftar yang bisa dilihat: tutor (akun aktif berperan Tutor) dan siswa (terdaftar di aplikasi).
function waAdminIntipDaftar(token) {
  wajibAdmin_(token);
  var tutor = bacaPengguna_().filter(function(u) { return u.peran === 'Tutor' && u.status === 'Aktif'; })
    .map(function(u) { return { id: u.id, nama: u.nama, peran: u.peranKustom || u.peran }; })
    .sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  var nmR = {}, siswa = [];
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (i === 0) return;
    var idR = sTeks_(r[0]).trim(), nama = sTeks_(r[1]).trim();
    if (!idR || !nama) return;
    if (nmR[idR] === undefined) { try { nmR[idR] = getNamaRombel_(idR) || idR; } catch (e) { nmR[idR] = idR; } }
    siswa.push({ id: idR + '|' + nama, nama: nama, idRombel: idR, rombel: nmR[idR] });
  });
  siswa.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
  return { tutor: tutor, siswa: siswa, menitBerlaku: INTIP.DURASI / 60 };
}

// jenis: 'tutor' | 'siswa'; id: ID pengguna tutor, atau "idRombel|nama" siswa.
function waAdminIntipMulai(token, jenis, id) {
  var p = wajibAdmin_(token);
  var c = CacheService.getScriptCache(), sesi = Utilities.getUuid() + Utilities.getUuid(), kunci = Utilities.getUuid() + Utilities.getUuid();
  var hasil = { jenis: jenis, intip: kunci, menitBerlaku: INTIP.DURASI / 60 };
  if (jenis === 'tutor') {
    var u = bacaPengguna_().filter(function(x) { return x.id === String(id || '') && x.peran === 'Tutor' && x.status === 'Aktif'; })[0];
    if (!u) throw new Error('Tutor tidak ditemukan atau akunnya tidak aktif.');
    c.put('staf_' + sesi, u.id, INTIP.DURASI);
    c.put(INTIP.STAF + sesi, '1', INTIP.DURASI);
    hasil.nama = u.nama; hasil.token = sesi;
  } else if (jenis === 'siswa') {
    var s = String(id || ''), i = s.indexOf('|'), idR = i > 0 ? s.slice(0, i) : '', nama = i > 0 ? s.slice(i + 1) : '';
    if (!idR || !siswaTerdaftar_(nama, idR)) throw new Error('Siswa tidak ditemukan.');
    c.put(SS.AWAL + sesi, JSON.stringify({ nama: nama, idRombel: idR }), INTIP.DURASI);
    c.put(INTIP.SISWA + sesi, '1', INTIP.DURASI);
    hasil.nama = nama;
    hasil.siswa = { sukses: true, idRombel: idR, namaRombel: getNamaRombel_(idR), nama: nama, daftarMapel: getMapelAktifUntukRombel_(idR), sesi: sesi,
      pin: { ada: true, perlu: false, wajib: false } };
  } else {
    throw new Error('Pilih Tutor atau Siswa.');
  }
  c.put(INTIP.AWAL + kunci, JSON.stringify({ jenis: jenis, nama: hasil.nama, sesi: sesi, admin: p.id, adminNama: p.nama }), INTIP.DURASI);
  catat_(p.peran, p.id, p.nama, 'Lihat sebagai', (jenis === 'tutor' ? 'Tutor ' : 'Siswa ') + hasil.nama + ' (hanya baca)', 'OK');
  return hasil;
}

function waAdminIntipAkhiri(token, kunci) {
  wajibAdmin_(token);
  var c = CacheService.getScriptCache(), mentah = kunci ? c.get(INTIP.AWAL + String(kunci)) : null;
  if (mentah) {
    try {
      var info = JSON.parse(mentah);
      if (info.jenis === 'tutor') c.removeAll(['staf_' + info.sesi, INTIP.STAF + info.sesi]);
      else c.removeAll([SS.AWAL + info.sesi, INTIP.SISWA + info.sesi]);
    } catch (e) {}
    c.remove(INTIP.AWAL + String(kunci));
  }
  return { sukses: true };
}
