// ============================================================================
// KENAIKAN KELAS & KELULUSAN (aplikasi 1.22): keputusan di rapor semester Genap.
// - Wali kelas / Kepala Sekolah / Admin mencentang siapa yang Naik (kelas akhir: Lulus).
//   Yang tidak dicentang = Tinggal di kelas (kelas akhir: Tidak Lulus).
// - Kelas & tingkatan diambil dari nama rombel (mis. B8 = Paket B kelas 8) dan kolom TINGKAT
//   di tab ROMBEL. Kelas akhir: A6, B9, C12.
// Data: tab KENAIKAN KELAS di spreadsheet MENU (dibuat otomatis).
// ============================================================================
var KNK = {
  TAB: 'KENAIKAN KELAS',
  HDR: ['TAHUN', 'ID ROMBEL', 'ID WB', 'NAMA', 'KEPUTUSAN', 'DIUBAH OLEH', 'DIUBAH PADA'],
  AKHIR: { A: 6, B: 9, C: 12 },
  TINGKAT_BAWAAN: [1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 6]
};

function knkBaca_() { return absBaca_(KNK.TAB, KNK.HDR); }

function knkRomawi_(n) {
  n = Number(n) || 0;
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][n] || (n ? String(n) : '');
}

function knkUraiNama_(nama) {
  var m = /^\s*(?:PAKET\s*|PKT-?)?([ABC])\s*-?\s*(\d{1,2})\b/i.exec(String(nama || ''));
  return m ? { paket: m[1].toUpperCase(), kelas: Number(m[2]) } : null;
}

// Info kelas sebuah rombel: {nama, paket, kelas, akhir, tingkat, kelasBerikut, tingkatBerikut} (kelas 0 = tidak dikenali).
function knkInfoRombel_(idRombel) {
  var rb = absBaca_('ROMBEL'), baris = null, tingkatPer = {};
  for (var i = 1; i < rb.v.length; i++) {
    var r = rb.v[i];
    var u = knkUraiNama_(absNilai_(rb, r, 'NAMA ROMBEL'));
    var tk = Number(sTeks_(absNilai_(rb, r, 'TINGKAT')).replace(/\D/g, '')) || 0;
    if (u && tk && !tingkatPer[u.paket + u.kelas]) tingkatPer[u.paket + u.kelas] = tk;
    if (sTeks_(absNilai_(rb, r, 'ID ROMBEL')).trim() === String(idRombel)) baris = r;
  }
  if (!baris) throw new Error('Rombel tidak ditemukan.');
  var nama = sTeks_(absNilai_(rb, baris, 'NAMA ROMBEL')).trim();
  var u2 = knkUraiNama_(nama) || {};
  if (!u2.paket) {
    var pg = /PKT-?([ABC])/i.exec(sTeks_(absNilai_(rb, baris, 'PROGRAM')));
    if (pg) u2.paket = pg[1].toUpperCase();
  }
  var kelas = u2.kelas || 0, paket = u2.paket || '';
  var tingkat = Number(sTeks_(absNilai_(rb, baris, 'TINGKAT')).replace(/\D/g, '')) || (kelas ? KNK.TINGKAT_BAWAAN[kelas - 1] : 0);
  var berikut = kelas ? kelas + 1 : 0;
  return {
    nama: nama, paket: paket, kelas: kelas,
    akhir: !!(kelas && paket && KNK.AKHIR[paket] === kelas),
    tingkat: tingkat, tingkatRomawi: knkRomawi_(tingkat),
    kelasBerikut: berikut,
    tingkatBerikut: berikut ? (tingkatPer[paket + berikut] || KNK.TINGKAT_BAWAAN[berikut - 1] || 0) : 0,
    tingkatBerikutRomawi: berikut ? knkRomawi_(tingkatPer[paket + berikut] || KNK.TINGKAT_BAWAAN[berikut - 1] || 0) : ''
  };
}

function knkTahunSah_(tahun) {
  tahun = String(tahun || '').trim();
  if (!/^\d{4}\/\d{4}$/.test(tahun)) throw new Error('Tahun pelajaran tidak valid.');
  return tahun;
}

// q: {idRombel, tahun} -> {info, tahun, keputusan: {idWb: 'Naik'|'Tinggal'|'Lulus'|'Tidak Lulus'}, oleh, pada}
function waStafKenaikanDaftar(token, q) {
  var p = stafDariToken_(token);
  q = q || {};
  var idRombel = String(q.idRombel || '').trim(), tahun = knkTahunSah_(q.tahun);
  if (!nilAksesRapor_(p, idRombel)) throw new Error('Kenaikan kelas hanya dapat diatur Wali Kelas rombel ini, Kepala Sekolah atau Admin.');
  var t = knkBaca_(), kep = {}, oleh = '', pada = '';
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (sTeks_(absNilai_(t, r, 'TAHUN')).trim() !== tahun || sTeks_(absNilai_(t, r, 'ID ROMBEL')).trim() !== idRombel) continue;
    kep[sTeks_(absNilai_(t, r, 'ID WB')).trim()] = sTeks_(absNilai_(t, r, 'KEPUTUSAN')).trim();
    oleh = sTeks_(absNilai_(t, r, 'DIUBAH OLEH')).trim();
    pada = sTeks_(absNilai_(t, r, 'DIUBAH PADA')).trim();
  }
  return { info: knkInfoRombel_(idRombel), tahun: tahun, keputusan: kep, oleh: oleh, pada: pada };
}

// d: {idRombel, tahun, daftar: [{idWb, nama, naik: true|false}]}
function waStafKenaikanSimpan(token, d) {
  var p = stafDariToken_(token);
  d = d || {};
  var idRombel = String(d.idRombel || '').trim(), tahun = knkTahunSah_(d.tahun);
  if (!nilAksesRapor_(p, idRombel)) throw new Error('Kenaikan kelas hanya dapat diatur Wali Kelas rombel ini, Kepala Sekolah atau Admin.');
  var info = knkInfoRombel_(idRombel);
  var daftarWb = Array.isArray(d.daftar) ? d.daftar : [];
  if (!daftarWb.length) throw new Error('Daftar warga belajar kosong.');
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var t = knkBaca_(), barisPer = {};
    for (var i = 1; i < t.v.length; i++) {
      var r = t.v[i];
      if (sTeks_(absNilai_(t, r, 'TAHUN')).trim() === tahun && sTeks_(absNilai_(t, r, 'ID ROMBEL')).trim() === idRombel) {
        barisPer[sTeks_(absNilai_(t, r, 'ID WB')).trim()] = i + 1;
      }
    }
    var lebar = t.v[0].length, baru = [], waktu = absWaktu_(), naik = 0;
    daftarWb.forEach(function(x) {
      var id = String((x && x.idWb) || '').trim();
      if (!id) return;
      var ya = x.naik === true;
      if (ya) naik++;
      var row = absBaris_(t, {
        'TAHUN': tahun, 'ID ROMBEL': idRombel, 'ID WB': id, 'NAMA': bioTeks_(x.nama),
        'KEPUTUSAN': info.akhir ? (ya ? 'Lulus' : 'Tidak Lulus') : (ya ? 'Naik' : 'Tinggal'),
        'DIUBAH OLEH': p.nama, 'DIUBAH PADA': waktu
      });
      if (barisPer[id]) t.sh.getRange(barisPer[id], 1, 1, lebar).setNumberFormat('@').setValues([row]);
      else baru.push(row);
    });
    if (baru.length) t.sh.getRange(t.sh.getLastRow() + 1, 1, baru.length, lebar).setNumberFormat('@').setValues(baru);
    try { catat_(p.peran, '', p.nama, info.akhir ? 'Kelulusan' : 'Kenaikan kelas', info.nama + ' ' + tahun + ': ' + naik + '/' + daftarWb.length + (info.akhir ? ' lulus' : ' naik'), 'OK'); } catch (e) {}
    return { sukses: true, naik: naik, jumlah: daftarWb.length, akhir: info.akhir };
  } finally { kunci.releaseLock(); }
}
