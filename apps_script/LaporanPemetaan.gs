// ============================================================================
// LAPORAN PEMETAAN SISWA (v1.74.0)
// Rekap siswa aktif per unit belajar × rombel × layanan (Reguler / Flexi / belum diisi) + daftar siswa per unit.
// - Admin, Superadmin, Kepala Sekolah, Koordinator Kurikulum: semua unit. Koordinator Unit: unit yang dipegangnya.
// - Siswa tanpa label unit dihitung ke unit utama (ditandai "ikut unit utama"); bila tidak ada unit utama -> "Tanpa unit"
//   (hanya terlihat oleh pimpinan).
// - PDF/Excel disusun aplikasi (kop lembaga dari kwKop_).
// ============================================================================
var LPS = { TANPA: '__tanpa__' };

function waStafLaporanPemetaanSiswa(token) {
  var p = stafDariToken_(token);
  if (UB.PERAN_PANTAU_SEMUA.indexOf(p.peran) < 0 && p.peran !== UB.PERAN_KOORD) throw new Error('Laporan pemetaan siswa untuk Koordinator Unit dan pimpinan.');
  var boleh = ubUnitSaya_(p), semua = UB.PERAN_PANTAU_SEMUA.indexOf(p.peran) >= 0;
  if (!boleh.length && !semua) throw new Error('Anda belum ditunjuk sebagai koordinator unit mana pun. Hubungi Admin.');
  var lab = ubPetaSiswa_(), utama = '', namaK = {};
  try { utama = ubUtama_(); } catch (e) {}
  try { ubCalonKoord_().forEach(function(c) { namaK[c.id] = c.nama; }); } catch (e1) {}
  var unit = {}, urut = [];
  boleh.forEach(function(u) {
    unit[u.id] = { id: u.id, nama: u.nama, utama: !!u.utama, koordinator: (u.koordinator || []).map(function(k) { return namaK[k] || k; }),
      total: 0, reguler: 0, flexi: 0, tanpaLayanan: 0, ikutUtama: 0, rombel: {} };
    urut.push(u.id);
  });
  if (semua) { unit[LPS.TANPA] = { id: '', nama: 'Tanpa unit', utama: false, koordinator: [], total: 0, reguler: 0, flexi: 0, tanpaLayanan: 0, ikutUtama: 0, rombel: {} }; urut.push(LPS.TANPA); }
  keuWbSemua_().forEach(function(w) {
    if (!w.aktif) return;
    var l = lab[w.id] || { unit: '', layanan: '' };
    var ikut = !l.unit && !!utama, u = l.unit || utama || LPS.TANPA;
    var x = unit[u];
    if (!x) return;
    var lay = l.layanan === 'Reguler' || l.layanan === 'Flexi' ? l.layanan : '';
    var r = x.rombel[w.idRombel] = x.rombel[w.idRombel] || { id: w.idRombel, nama: w.namaRombel || w.idRombel, program: w.program || '', total: 0, reguler: 0, flexi: 0, tanpaLayanan: 0, siswa: [] };
    [x, r].forEach(function(o) { o.total++; if (lay === 'Reguler') o.reguler++; else if (lay === 'Flexi') o.flexi++; else o.tanpaLayanan++; });
    if (ikut) x.ikutUtama++;
    r.siswa.push({ id: w.id, nisn: w.nisn, nama: w.nama, layanan: lay, ikutUtama: ikut });
  });
  var tot = { total: 0, reguler: 0, flexi: 0, tanpaLayanan: 0 };
  var hasil = urut.map(function(id) { return unit[id]; }).filter(function(x) { return x.id || x.total; }).map(function(x) {
    ['total', 'reguler', 'flexi', 'tanpaLayanan'].forEach(function(k) { tot[k] += x[k]; });
    var rb = Object.keys(x.rombel).map(function(k) { return x.rombel[k]; });
    rb.sort(function(a, b) { return a.nama.localeCompare(b.nama, 'id', { numeric: true }); });
    rb.forEach(function(r) { r.siswa.sort(function(a, b) { return a.nama.localeCompare(b.nama); }); });
    x.rombel = rb;
    return x;
  });
  var kop = {};
  try { kop = kwKop_(); } catch (e2) {}
  try { catat_(p.peran, '-', p.nama, 'Laporan pemetaan siswa', hasil.length + ' unit, ' + tot.total + ' siswa', 'OK'); } catch (e3) {}
  return { unit: hasil, total: tot, kop: kop, dibuat: absWaktu_(), oleh: p.nama, semua: semua };
}
