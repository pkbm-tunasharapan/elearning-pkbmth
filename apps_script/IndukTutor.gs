// ============================================================================
// TULIS-TEMBUS TUTOR: e-learning -> Data Induk (v1.38.5)
// ----------------------------------------------------------------------------
// Masalah yang dicegah: tutor dibuat langsung di e-learning (Kelola Tutor & Enrollment / pendaftaran tutor)
// tidak tercatat di Data Induk (tab TUTOR & ENROLL MAPEL). Akibatnya nama tutor tidak tampil di leger/rapor,
// tutor tidak melihat kelasnya di menu Nilai, dan sinkron Data Induk menonaktifkan akunnya serta menghapus
// enrollment-nya.
// Setiap kali akun tutor disimpan atau enrollment-nya berubah di e-learning, fungsi di sini memastikan:
//  1. tutor ada di tab TUTOR (dicocokkan lewat email, lalu nomor HP, lalu nama; bila belum ada, dibuat);
//  2. setiap mapel yang diampu di e-learning tercatat di ENROLL MAPEL dengan ID tutornya;
//     penugasan yang dilepas di e-learning dilepas juga di ENROLL MAPEL (kolom TUTOR dikosongkan).
// Penugasan yang di ENROLL MAPEL sudah milik tutor LAIN tidak ditimpa (dicatat sebagai bentrok).
// ============================================================================

function itAcak_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

function itLupakan_(idPengguna, idTutor) {
  absLupakan_('TUTOR'); absLupakan_('ENROLL MAPEL');
  var c = CacheService.getScriptCache();
  try { c.removeAll(['abs_kelas2_*', 'abs_tt_' + idPengguna, idTutor ? 'abs_kelas2_' + idTutor : 'abs_kelas2_-']); } catch (e) {}
}

// Pastikan tutor (akun e-learning) ada di tab TUTOR. Mengembalikan ID TUTOR, atau '' bila bukan tutor aktif.
function itPastikanTutor_(u) {
  if (!u || u.peran !== 'Tutor') return '';
  absLupakan_('TUTOR');
  var ada = absTutorSayaInti_(u);
  if (ada && ada.id) return ada.id;
  if (u.status !== 'Aktif') return '';
  var pr = {};
  try { pr = profilCari_('P|' + u.id) || {}; } catch (e) {}
  var kontak = String(u.hp || '').trim();
  var email = String(pr.email || (kontak.indexOf('@') > 0 ? kontak : '')).trim().toLowerCase();
  var hp = String(pr.hp || (kontak.indexOf('@') < 0 ? kontak : '')).replace(/[^\d+]/g, '');
  var t = absBaca_('TUTOR'), id = 'TT-' + itAcak_();
  var baris = absBaris_(t, { 'ID TUTOR': id, 'NAMA TUTOR': u.nama, 'EMAIL': email, 'NO HP': hp, 'AKTIF': true });
  var r0 = t.sh.getLastRow() + 1;
  t.sh.getRange(r0, 1, 1, baris.length).setNumberFormat('@');
  t.sh.getRange(r0, 1, 1, baris.length).setValues([baris]);
  var kAktif = absCol_(t, 'AKTIF');
  if (kAktif >= 0) t.sh.getRange(r0, kAktif + 1).setNumberFormat('General').setValue(true);
  absLupakan_('TUTOR');
  try { catat_('Sistem', '', 'Data Induk', 'Tambah tutor ke Data Induk', u.nama + ' (' + id + ', dari akun e-learning ' + u.id + ')', 'OK'); } catch (e2) {}
  return id;
}

// Samakan ENROLL MAPEL dengan enrollment e-learning tutor ini. Mengembalikan ringkasan.
function itSelarasEnroll_(u, idTutor) {
  var out = { tambah: 0, isi: 0, lepas: 0, bentrok: [] };
  if (!u || !idTutor) return out;
  var peta = nilPetaBm_(), balik = {};
  Object.keys(peta.kelas).forEach(function(k) { peta.kelas[k].forEach(function(b) { balik[b.idMapel] = k; }); });
  var ingin = {};
  if (u.status === 'Aktif' && u.peran === 'Tutor') {
    bacaEnrollment_().forEach(function(e) { if (e.idPengguna === u.id && balik[e.idMapel]) ingin[balik[e.idMapel]] = true; });
  }
  absLupakan_('ENROLL MAPEL');
  var t = absBaca_('ENROLL MAPEL'), kT = absCol_(t, 'TUTOR'), kA = absCol_(t, 'AKTIF'), kS = absCol_(t, 'STATUS');
  if (kT < 0) return out;
  var selesai = {};
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i], key = sTeks_(absNilai_(t, r, 'ROMBEL')).trim() + '|' + sTeks_(absNilai_(t, r, 'MAPEL')).trim();
    var milik = sTeks_(r[kT]).trim();
    if (ingin[key] && !selesai[key]) {
      selesai[key] = true;
      if (milik === idTutor) continue;
      if (!milik) {
        t.sh.getRange(i + 1, kT + 1).setValue(idTutor);
        if (kA >= 0 && !absBenar_(r[kA])) t.sh.getRange(i + 1, kA + 1).setValue(true);
        if (kS >= 0 && sTeks_(r[kS]).trim() && sTeks_(r[kS]).trim() !== 'Disetujui') t.sh.getRange(i + 1, kS + 1).setValue('Disetujui');
        out.isi++;
      } else {
        out.bentrok.push(key + ' sudah diampu ' + milik);
      }
    } else if (!ingin[key] && milik === idTutor) {
      t.sh.getRange(i + 1, kT + 1).setValue('');   // dilepas di e-learning: lepas juga di Data Induk
      out.lepas++;
    }
  }
  var baru = [], kini = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  Object.keys(ingin).forEach(function(key) {
    if (selesai[key]) return;
    var p = key.split('|');
    baru.push(absBaris_(t, { 'ID ENROLL': itAcak_(), 'ROMBEL': p[0], 'MAPEL': p[1], 'TUTOR': idTutor, 'AKTIF': true, 'DICATAT PADA': kini,
      'STATUS': 'Disetujui', 'DIAJUKAN OLEH': 'Otomatis dari e-learning (' + u.nama + ')' }));
  });
  if (baru.length) {
    var r0 = t.sh.getLastRow() + 1;
    t.sh.getRange(r0, 1, baru.length, baru[0].length).setValues(baru);
    out.tambah = baru.length;
  }
  return out;
}

// Titik masuk: panggil setelah akun tutor disimpan atau enrollment-nya berubah di e-learning.
// Tidak pernah menggagalkan proses pemanggil.
function indukSelarasTutor_(idPengguna) {
  try {
    var u = bacaPengguna_().filter(function(p) { return p.id === String(idPengguna); })[0];
    if (!u || u.peran !== 'Tutor') return null;
    var idT = itPastikanTutor_(u);
    var h = itSelarasEnroll_(u, idT);
    itLupakan_(u.id, idT);
    if (h.tambah || h.isi || h.lepas || h.bentrok.length) {
      try { catat_('Sistem', '', 'Data Induk', 'Selaraskan penugasan tutor', u.nama + ': +' + h.tambah + ' baru, ' + h.isi + ' diisi, ' + h.lepas + ' dilepas' + (h.bentrok.length ? '; bentrok: ' + h.bentrok.join(', ') : ''), h.bentrok.length ? 'PERLU DICEK' : 'OK'); } catch (e) {}
    }
    return { idTutor: idT, ringkas: h };
  } catch (e2) {
    try { pmlCatatGalat_('server', 'indukSelarasTutor_', String(e2 && e2.message || e2), e2 && e2.stack, '', String(idPengguna)); } catch (e3) {}
    return null;
  }
}

// Sekali jalan (dipanggil di awal sinkron tutor): catat ke Data Induk semua tutor & penugasan yang sudah
// terlanjur dibuat langsung di e-learning, SEBELUM sinkron sempat menghapusnya.
function indukSelarasSemuaSekali_() {
  var sp = PropertiesService.getScriptProperties();
  if (sp.getProperty('INDUK_TUTOR_SELARAS_V1')) return 0;
  var n = 0;
  bacaPengguna_().forEach(function(u) { if (u.peran === 'Tutor' && u.status === 'Aktif' && indukSelarasTutor_(u.id)) n++; });
  sp.setProperty('INDUK_TUTOR_SELARAS_V1', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
  return n;
}
