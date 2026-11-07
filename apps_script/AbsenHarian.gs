// ============================================================================
// ABSENSI HARIAN GLOBAL (aplikasi 1.20): Admin & Kepala Sekolah mencatat kehadiran warga belajar
// di lembaga per hari, tanpa memilih rombel/mapel. Scan QR pertama = jam datang, scan berikutnya
// (minimal 5 menit kemudian) = jam pulang. Izin/Sakit/Alpa diisi manual dari daftar.
// Terpisah dari absensi per mapel (PRESENSI WB) yang tetap diisi tutor pengampu.
// Data: tab PRESENSI HARIAN di spreadsheet MENU (dibuat otomatis).
// ============================================================================
var AH = {
  TAB: 'PRESENSI HARIAN',
  HDR: ['ID', 'TANGGAL', 'WARGA BELAJAR', 'NAMA', 'ROMBEL', 'STATUS', 'JAM DATANG', 'JAM PULANG', 'KETERANGAN', 'DICATAT OLEH', 'DIUBAH PADA'],
  STATUS: ['Hadir', 'Izin', 'Sakit', 'Alpa'],
  JEDA_PULANG_MENIT: 5
};

function ahWajib_(token) {
  var p = stafDariToken_(token), q = absPeran_(p);
  if (!(q.admin || q.ks)) throw new Error('Absensi harian global hanya untuk Admin dan Kepala Sekolah. Tutor memakai absensi per mapel.');
  return p;
}

function ahBaca_() { return absBaca_(AH.TAB, AH.HDR); }

function ahCari_(t, tanggal, idWb) {
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (absTgl_(absNilai_(t, r, 'TANGGAL')) === tanggal && sTeks_(absNilai_(t, r, 'WARGA BELAJAR')).trim() === idWb) return { baris: i + 1, r: r };
  }
  return null;
}

function ahSet_(t, baris, kolom, nilai) {
  var c = absCol_(t, kolom);
  if (c >= 0) t.sh.getRange(baris, c + 1).setValue(nilai);
}

function ahMenit_(jam) {
  var m = /^(\d{1,2}):(\d{2})/.exec(String(jam || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

function ahPetaRombel_() {
  var rb = absBaca_('ROMBEL'), out = {};
  for (var i = 1; i < rb.v.length; i++) {
    var id = sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim();
    if (id) out[id] = { nama: sTeks_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL')).trim(), aktif: absBenar_(absNilai_(rb, rb.v[i], 'AKTIF')) };
  }
  return out;
}

function waStafAbsenHarianKonteks(token) {
  var p = ahWajib_(token);
  var sim = absSim_(), rb = ahPetaRombel_();
  var rombel = Object.keys(rb).filter(function(id) { return rb[id].aktif; }).map(function(id) { return { id: id, nama: rb[id].nama }; })
    .sort(function(a, b) { return a.nama.localeCompare(b.nama, 'id', { numeric: true }); });
  return { peran: p.peran, hariIni: absHariIni_(), jam: { buka: sim.jamBuka, tutup: sim.jamTutup, aktif: sim.aktif }, rombel: rombel, status: AH.STATUS };
}

// d: {kode (isi QR), kodeBuka}
function waStafAbsenHarianPindai(token, d) {
  var p = ahWajib_(token);
  d = d || {};
  absJendela_(absSim_(), d.kodeBuka);
  var wb = absCariWb_(d.kode);
  if (!wb) throw new Error('QR tidak dikenali sebagai kartu warga belajar.');
  if (wb.status && wb.status !== 'Aktif') throw new Error(wb.nama + ' berstatus ' + wb.status + ', tidak dapat diabsen.');
  var namaRb = (ahPetaRombel_()[wb.rombel] || {}).nama || wb.rombel || '-';
  var hari = absHariIni_(), jam = absJamKini_().slice(0, 5);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var t = ahBaca_();
    var ada = ahCari_(t, hari, wb.id);
    if (!ada) {
      t.sh.appendRow(absBaris_(t, {
        'ID': absId_(), 'TANGGAL': hari, 'WARGA BELAJAR': wb.id, 'NAMA': wb.nama, 'ROMBEL': wb.rombel,
        'STATUS': 'Hadir', 'JAM DATANG': jam, 'DICATAT OLEH': p.nama, 'DIUBAH PADA': absWaktu_()
      }));
      return { aksi: 'datang', nama: wb.nama, rombel: namaRb, jam: jam, pesan: wb.nama + ' (' + namaRb + ') datang ' + jam };
    }
    var datang = absJam_(absNilai_(t, ada.r, 'JAM DATANG')), pulang = absJam_(absNilai_(t, ada.r, 'JAM PULANG'));
    var status = sTeks_(absNilai_(t, ada.r, 'STATUS')).trim();
    if (status !== 'Hadir' || !datang) {
      ahSet_(t, ada.baris, 'STATUS', 'Hadir');
      ahSet_(t, ada.baris, 'JAM DATANG', jam);
      ahSet_(t, ada.baris, 'DICATAT OLEH', p.nama);
      ahSet_(t, ada.baris, 'DIUBAH PADA', absWaktu_());
      return { aksi: 'datang', nama: wb.nama, rombel: namaRb, jam: jam, pesan: wb.nama + ' (' + namaRb + ') datang ' + jam + (status && status !== 'Hadir' ? ' (sebelumnya ' + status + ')' : '') };
    }
    if (pulang) return { aksi: 'sudah', nama: wb.nama, rombel: namaRb, pesan: wb.nama + ' sudah tercatat datang ' + datang + ' dan pulang ' + pulang + '.' };
    if (ahMenit_(jam) - ahMenit_(datang) < AH.JEDA_PULANG_MENIT) {
      return { aksi: 'sudah', nama: wb.nama, rombel: namaRb, pesan: wb.nama + ' sudah tercatat datang ' + datang + '. Scan lagi saat pulang.' };
    }
    ahSet_(t, ada.baris, 'JAM PULANG', jam);
    ahSet_(t, ada.baris, 'DIUBAH PADA', absWaktu_());
    return { aksi: 'pulang', nama: wb.nama, rombel: namaRb, jam: jam, pesan: wb.nama + ' (' + namaRb + ') pulang ' + jam };
  } finally { kunci.releaseLock(); }
}

// q: {tanggal, idRombel ('' = semua)}
function waStafAbsenHarianDaftar(token, q) {
  ahWajib_(token);
  q = q || {};
  var tanggal = absTglSah_(q.tanggal || absHariIni_()), idRb = String(q.idRombel || '').trim();
  var rb = ahPetaRombel_();
  var t = ahBaca_(), catat = {};
  for (var i = 1; i < t.v.length; i++) {
    var r = t.v[i];
    if (absTgl_(absNilai_(t, r, 'TANGGAL')) !== tanggal) continue;
    catat[sTeks_(absNilai_(t, r, 'WARGA BELAJAR')).trim()] = {
      status: sTeks_(absNilai_(t, r, 'STATUS')).trim(), datang: absJam_(absNilai_(t, r, 'JAM DATANG')), pulang: absJam_(absNilai_(t, r, 'JAM PULANG')),
      ket: sTeks_(absNilai_(t, r, 'KETERANGAN')).trim(), oleh: sTeks_(absNilai_(t, r, 'DICATAT OLEH')).trim()
    };
  }
  var w = absBaca_('WARGA BELAJAR'), siswa = [];
  for (var j = 1; j < w.v.length; j++) {
    var x = w.v[j];
    var st = sTeks_(absNilai_(w, x, 'STATUS')).trim();
    if (st && st !== 'Aktif') continue;
    var id = sTeks_(absNilai_(w, x, 'ID WB')).trim(), rId = sTeks_(absNilai_(w, x, 'ROMBEL')).trim();
    if (!id || (idRb && rId !== idRb)) continue;
    var c = catat[id] || {};
    siswa.push({ id: id, nama: sTeks_(absNilai_(w, x, 'NAMA WB')).trim(), rombel: (rb[rId] || {}).nama || rId, status: c.status || '', datang: c.datang || '', pulang: c.pulang || '', ket: c.ket || '', oleh: c.oleh || '' });
  }
  siswa.sort(function(a, b) { return a.rombel.localeCompare(b.rombel, 'id', { numeric: true }) || a.nama.localeCompare(b.nama); });
  return { tanggal: tanggal, siswa: siswa };
}

// d: {tanggal, idWb, status, keterangan}
function waStafAbsenHarianCatat(token, d) {
  var p = ahWajib_(token);
  d = d || {};
  var tanggal = absTglSah_(d.tanggal || absHariIni_());
  if (tanggal > absHariIni_()) throw new Error('Tidak dapat mengabsen untuk tanggal yang akan datang.');
  var status = String(d.status || '');
  if (AH.STATUS.indexOf(status) < 0) throw new Error('Status tidak dikenal.');
  var w = absBaca_('WARGA BELAJAR'), wb = null;
  for (var i = 1; i < w.v.length && !wb; i++) {
    if (sTeks_(absNilai_(w, w.v[i], 'ID WB')).trim() === String(d.idWb || '')) {
      wb = { id: String(d.idWb), nama: sTeks_(absNilai_(w, w.v[i], 'NAMA WB')).trim(), rombel: sTeks_(absNilai_(w, w.v[i], 'ROMBEL')).trim() };
    }
  }
  if (!wb) throw new Error('Warga belajar tidak ditemukan.');
  var ket = String(d.keterangan || '').slice(0, 200);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var t = ahBaca_(), ada = ahCari_(t, tanggal, wb.id), jam = absJamKini_().slice(0, 5);
    if (!ada) {
      t.sh.appendRow(absBaris_(t, {
        'ID': absId_(), 'TANGGAL': tanggal, 'WARGA BELAJAR': wb.id, 'NAMA': wb.nama, 'ROMBEL': wb.rombel, 'STATUS': status,
        'JAM DATANG': status === 'Hadir' && tanggal === absHariIni_() ? jam : '', 'KETERANGAN': ket, 'DICATAT OLEH': p.nama, 'DIUBAH PADA': absWaktu_()
      }));
    } else {
      ahSet_(t, ada.baris, 'STATUS', status);
      if (status !== 'Hadir') { ahSet_(t, ada.baris, 'JAM DATANG', ''); ahSet_(t, ada.baris, 'JAM PULANG', ''); }
      ahSet_(t, ada.baris, 'KETERANGAN', ket);
      ahSet_(t, ada.baris, 'DICATAT OLEH', p.nama);
      ahSet_(t, ada.baris, 'DIUBAH PADA', absWaktu_());
    }
    return { sukses: true, nama: wb.nama, status: status };
  } finally { kunci.releaseLock(); }
}
