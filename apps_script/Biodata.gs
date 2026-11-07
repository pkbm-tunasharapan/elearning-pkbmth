// ============================================================================
// BIODATA PESERTA DIDIK (aplikasi 1.21): data diri lengkap untuk halaman biodata rapor.
// - Data inti (NISN, NIK, nama, JK, tempat/tanggal lahir, rombel) dari tab WARGA BELAJAR.
// - Data tambahan (agama, alamat, orang tua/wali, anak ke, sekolah asal) di tab BIODATA WB
//   (spreadsheet MENU), diisi otomatis oleh Impor Dapodik.
// ============================================================================
var BIO = {
  TAB: 'BIODATA WB',
  HDR: ['ID WB', 'NAMA', 'AGAMA', 'ALAMAT', 'RT', 'RW', 'DUSUN', 'KELURAHAN', 'KECAMATAN', 'KODE POS', 'HP', 'ANAK KE',
    'SEKOLAH ASAL', 'NAMA AYAH', 'PEKERJAAN AYAH', 'NAMA IBU', 'PEKERJAAN IBU', 'NAMA WALI', 'PEKERJAAN WALI', 'DIPERBARUI']
};

function bioBaca_() { return absBaca_(BIO.TAB, BIO.HDR); }

function bioTeks_(s) {
  s = String(s === null || s === undefined ? '' : s).trim();
  return /^[=+\-@]/.test(s) ? ' ' + s : s;
}

// Menyimpan biodata dari baris Dapodik ke tab BIODATA WB (perbarui bila ID WB sudah ada, tambah bila belum).
function bioSimpanDariDapodik_(pd) {
  var d = dpkDataSim_(), idx = dpkIndeks_(d.sim);
  var t = bioBaca_(), barisPerId = {};
  for (var i = 1; i < t.v.length; i++) {
    var id = sTeks_(absNilai_(t, t.v[i], 'ID WB')).trim();
    if (id) barisPerId[id] = i + 1;
  }
  var lebar = t.v[0].length, baru = [], n = 0, waktu = absWaktu_();
  pd.forEach(function(p) {
    var s = dpkCari_(idx, p);
    if (!s || !s.id) return;
    var row = absBaris_(t, {
      'ID WB': s.id, 'NAMA': bioTeks_(p.nama), 'AGAMA': bioTeks_(p.agama), 'ALAMAT': bioTeks_(p.alamat), 'RT': bioTeks_(p.rt), 'RW': bioTeks_(p.rw),
      'DUSUN': bioTeks_(p.dusun), 'KELURAHAN': bioTeks_(p.kelurahan), 'KECAMATAN': bioTeks_(p.kecamatan), 'KODE POS': bioTeks_(p.kodePos),
      'HP': bioTeks_(p.hp), 'ANAK KE': bioTeks_(p.anakKe), 'SEKOLAH ASAL': bioTeks_(p.sekolahAsal),
      'NAMA AYAH': bioTeks_(p.ayah), 'PEKERJAAN AYAH': bioTeks_(p.kerjaAyah), 'NAMA IBU': bioTeks_(p.ibu), 'PEKERJAAN IBU': bioTeks_(p.kerjaIbu),
      'NAMA WALI': bioTeks_(p.wali), 'PEKERJAAN WALI': bioTeks_(p.kerjaWali), 'DIPERBARUI': waktu
    });
    if (barisPerId[s.id]) t.sh.getRange(barisPerId[s.id], 1, 1, lebar).setNumberFormat('@').setValues([row]);
    else { baru.push(row); barisPerId[s.id] = -1; }
    n++;
  });
  if (baru.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, baru.length, lebar).setNumberFormat('@').setValues(baru);
  return n;
}

// Biodata semua warga belajar aktif satu rombel (untuk cover & halaman biodata rapor).
function waStafBiodataRombel(token, idRombel) {
  var p = stafDariToken_(token);
  idRombel = String(idRombel || '').trim();
  if (!nilAksesRapor_(p, idRombel)) throw new Error('Biodata rapor hanya dapat dibuka Wali Kelas rombel ini, Kepala Sekolah atau Admin.');
  var t = bioBaca_(), bio = {};
  for (var i = 1; i < t.v.length; i++) {
    var id = sTeks_(absNilai_(t, t.v[i], 'ID WB')).trim();
    if (!id) continue;
    var o = {};
    BIO.HDR.forEach(function(h) { o[h] = sTeks_(absNilai_(t, t.v[i], h)).trim(); });
    bio[id] = o;
  }
  var w = absBaca_('WARGA BELAJAR'), siswa = [];
  for (var j = 1; j < w.v.length; j++) {
    var r = w.v[j];
    if (sTeks_(absNilai_(w, r, 'ROMBEL')).trim() !== idRombel) continue;
    var st = sTeks_(absNilai_(w, r, 'STATUS')).trim();
    if (st && st !== 'Aktif') continue;
    var idWb = sTeks_(absNilai_(w, r, 'ID WB')).trim(), b = bio[idWb] || {};
    var alamat = [b['ALAMAT'], b['RT'] || b['RW'] ? 'RT ' + (b['RT'] || '-') + '/RW ' + (b['RW'] || '-') : '', b['DUSUN'], b['KELURAHAN'], b['KECAMATAN'], b['KODE POS']]
      .filter(function(x) { return x && String(x).trim(); }).join(', ');
    siswa.push({
      idWb: idWb, nisn: sTeks_(absNilai_(w, r, 'NISN')).trim(), nik: sTeks_(absNilai_(w, r, 'NIK')).trim(), nama: sTeks_(absNilai_(w, r, 'NAMA WB')).trim(),
      jk: sTeks_(absNilai_(w, r, 'JENIS KELAMIN')).trim(), tempatLahir: sTeks_(absNilai_(w, r, 'TEMPAT LAHIR')).trim(), tglLahir: absTgl_(absNilai_(w, r, 'TANGGAL LAHIR')),
      hp: b['HP'] || sTeks_(absNilai_(w, r, 'NO HP')).trim(), agama: b['AGAMA'] || '', alamat: alamat, anakKe: b['ANAK KE'] || '', sekolahAsal: b['SEKOLAH ASAL'] || '',
      ayah: b['NAMA AYAH'] || '', kerjaAyah: b['PEKERJAAN AYAH'] || '', ibu: b['NAMA IBU'] || '', kerjaIbu: b['PEKERJAAN IBU'] || '',
      wali: b['NAMA WALI'] || '', kerjaWali: b['PEKERJAAN WALI'] || '', adaBiodata: !!bio[idWb]
    });
  }
  siswa.sort(function(a, b2) { return a.nama.localeCompare(b2.nama); });
  var rb = honProgramRombel_()[idRombel] || { nama: idRombel, program: '' };
  return { lembaga: nilLembaga_(), rombel: { id: idRombel, nama: rb.nama, program: rb.program }, siswa: siswa };
}
