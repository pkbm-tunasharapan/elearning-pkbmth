// ============================================
// CETAK REKAP NILAI (PDF) - dari sheet Jawaban lokal
// ============================================
// Pola HTML->PDF sama seperti generateNilaiPdf() di sistem produksi
// (PrintForms.gs), tapi datanya dari sheet 'Jawaban' lokal, bukan Classroom,
// dan penyimpanan berkas pakai DriveApp bawaan (tidak perlu mengaktifkan
// Advanced Drive Service seperti di sistem produksi).
//
// Rekap dicetak PER MAPEL (bukan per rombel) - karena satu rombel bisa
// punya banyak mapel dengan nilai masing-masing.

function getSemuaMapelAktifDenganRombel_() {
  var out = [];
  getDaftarRombelAktif_().forEach(function(r) {
    getMapelAktifUntukRombel_(r.id).forEach(function(m) {
      out.push({ id: m.id, nama: m.nama, idRombel: r.id, namaRombel: r.nama });
    });
  });
  return out;
}

function showRekapNilaiPanel() {
  var daftarMapel = getSemuaMapelAktifDenganRombel_();
  if (!daftarMapel.length) {
    showDialog_({ tone: 'warning', icon: '⚠️', title: 'Belum Ada Mapel', message: 'Isi dulu sheet "Rombel" dan "Mapel" (set Status = Aktif pada keduanya) sebelum mencetak rekap nilai.' });
    return;
  }
  showDialog_({
    tone: 'question', icon: '🖨️', title: 'Cetak Rekap Nilai', width: 480,
    message: 'Pilih mata pelajaran yang ingin dicetak rekap nilainya (Diskusi + Absensi/Ujian).',
    inputs: [{
      key: 'idMapel', label: 'Mata Pelajaran', type: 'select', required: true,
      options: daftarMapel.map(function(m) { return { value: m.id, label: m.namaRombel + ' - ' + m.nama }; })
    }],
    action: 'cetakRekapNilai', confirmLabel: 'Cetak PDF'
  });
}

function cetakRekapNilai(inputs) {
  var idMapel = inputs.idMapel;
  var daftarMapel = getSemuaMapelAktifDenganRombel_();
  var mapel = daftarMapel.filter(function(m) { return String(m.id) === String(idMapel); })[0];
  if (!mapel) {
    return { tone: 'danger', icon: '❌', title: 'Mapel Tidak Ditemukan', message: 'Mapel ini mungkin baru saja dinonaktifkan. Coba lagi dari menu.' };
  }
  var url = generateRekapNilaiPdf_(mapel.idRombel, mapel.namaRombel, mapel.id, mapel.nama);
  return {
    tone: 'success', icon: '✅', title: 'PDF Siap',
    message: 'Rekap nilai "' + mapel.nama + '" (' + mapel.namaRombel + ') berhasil dibuat.',
    links: [{ label: 'Buka PDF', url: url }]
  };
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getIdentitasSekolah_() {
  var sheet = getSheet(CONFIG.SHEETS.IDENTITAS_SEKOLAH);
  var values = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < values.length; i++) {
    if (values[i][0]) map[values[i][0]] = values[i][1];
  }
  return {
    namaSatuan: map.namaSatuan || 'PKBM Tunas Harapan',
    alamat: map.alamat || '',
    kotaTtd: map.kotaTtd || '',
    namaKepala: map.namaKepala || ''
  };
}

function buildHeaderHtml_(judul, subjudul) {
  var sekolah = getIdentitasSekolah_();
  var html = '';
  html += '<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px;">';
  html += '<div style="font-size:16px;font-weight:bold;">' + esc_(sekolah.namaSatuan) + '</div>';
  if (sekolah.alamat) html += '<div style="font-size:11px;">' + esc_(sekolah.alamat) + '</div>';
  html += '</div>';
  html += '<div style="text-align:center;font-weight:bold;font-size:14px;text-decoration:underline;margin-bottom:4px;">' + esc_(judul) + '</div>';
  if (subjudul) html += '<div style="text-align:center;font-size:11px;margin-bottom:10px;">' + subjudul + '</div>';
  return html;
}

function buildSignatureHtml_(namaTutor, labelKanan) {
  var sekolah = getIdentitasSekolah_();
  var kota = sekolah.kotaTtd || '';
  var tgl = Utilities.formatDate(new Date(), 'GMT+7', 'dd MMMM yyyy');
  var label = labelKanan || 'Tutor Pengampu';
  var html = '';
  html += '<table style="width:100%;margin-top:30px;font-size:11px;border:none;"><tr>';
  html += '<td style="width:50%;text-align:center;border:none;">Mengetahui,<br>Kepala Satuan Pendidikan<br><br><br><br>' + esc_(sekolah.namaKepala) + '</td>';
  html += '<td style="width:50%;text-align:center;border:none;">' + esc_(kota) + ', ' + tgl + '<br>' + esc_(label) + '<br><br><br><br>' + esc_(namaTutor || '.........................') + '</td>';
  html += '</tr></table>';
  return html;
}

function getOrCreateLaporanFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('LAPORAN_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* folder dihapus, buat lagi */ }
  }
  var folder = DriveApp.createFolder('Laporan Belajar Mandiri - PKBM Tunas Harapan');
  props.setProperty('LAPORAN_FOLDER_ID', folder.getId());
  return folder;
}

function htmlToPdf_(html, filename, orientation) {
  var fullHtml = '<html><head><meta charset="utf-8"><style>' +
    '@page { size: ' + (orientation === 'landscape' ? '330mm 215mm' : '215mm 330mm') + '; margin: 1cm; } ' +
    'body{font-family:Arial,sans-serif;font-size:12px;} ' +
    'table{border-collapse:collapse;width:100%;} ' +
    'td,th{border:1px solid #000;padding:4px 6px;font-size:11px;}' +
    '</style></head><body>' + html + '</body></html>';
  var blob = Utilities.newBlob(fullHtml, 'text/html', filename + '.html').getAs('application/pdf');
  blob.setName(filename + '.pdf');
  var file = getOrCreateLaporanFolder_().createFile(blob);
  return file.getUrl();
}

function generateRekapNilaiPdf_(idRombel, namaRombel, idMapel, namaMapel) {
  var siswaList = getDaftarSiswaUntukRombel_(idRombel);
  var jawabanSheet = getSheet(CONFIG.SHEETS.JAWABAN);
  var values = jawabanSheet.getDataRange().getValues();

  // Kolom Jawaban: ID Rombel(0), ID Mapel(1), Nama Mapel(2), ID Materi(3),
  // Judul Materi(4), Jenis(5), Nama Siswa(6), Jawaban(7), Nilai(8), Waktu Kirim(9)
  // Kelompokkan nilai per siswa: Diskusi (rata-rata semua Diskusi yang sudah
  // dijawab) dan pilihan ganda (rata-rata semua Absensi+Ujian).
  var nilaiDiskusi = {}, nilaiPg = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[1]) !== String(idMapel)) continue;
    var jenis = row[5], nama = row[6], nilai = row[8];
    if (nilai === '' || nilai === null || nilai === undefined) continue;
    if (jenis === 'Diskusi') {
      (nilaiDiskusi[nama] = nilaiDiskusi[nama] || []).push(Number(nilai) || 0);
    } else if (jenis === 'Absensi' || jenis === 'Ujian') {
      (nilaiPg[nama] = nilaiPg[nama] || []).push(Number(nilai) || 0);
    }
  }
  function rata(arr) { return arr && arr.length ? (arr.reduce(function(a, b) { return a + b; }, 0) / arr.length).toFixed(1) : ''; }

  var html = buildHeaderHtml_('REKAP NILAI SISWA - BELAJAR MANDIRI',
    'Rombel: ' + esc_(namaRombel) + ' &nbsp;|&nbsp; Mata Pelajaran: ' + esc_(namaMapel));
  html += '<table><tr><th style="width:30px;">No</th><th>Nama Siswa</th>' +
    '<th>Rata-rata Diskusi</th><th>Rata-rata Absensi/Ujian</th><th>Jumlah Diskusi Dinilai</th><th>Jumlah Absensi/Ujian Dinilai</th></tr>';
  siswaList.forEach(function(nama, idx) {
    html += '<tr><td style="text-align:center;">' + (idx + 1) + '</td><td>' + esc_(nama) + '</td>' +
      '<td style="text-align:center;">' + rata(nilaiDiskusi[nama]) + '</td>' +
      '<td style="text-align:center;">' + rata(nilaiPg[nama]) + '</td>' +
      '<td style="text-align:center;">' + (nilaiDiskusi[nama] ? nilaiDiskusi[nama].length : 0) + '</td>' +
      '<td style="text-align:center;">' + (nilaiPg[nama] ? nilaiPg[nama].length : 0) + '</td></tr>';
  });
  if (!siswaList.length) {
    html += '<tr><td colspan="6" style="text-align:center;color:#999;">(Belum ada siswa terdaftar untuk rombel ini di sheet Siswa)</td></tr>';
  }
  html += '</table>';
  html += '<div style="font-size:10px;margin-top:4px;color:#666;">Nilai terisi otomatis dari jawaban siswa lewat Web App. Jalankan menu ini lagi setelah ada jawaban baru untuk memperbarui rekap.</div>';
  html += buildSignatureHtml_('', 'Tutor Pengampu');
  return htmlToPdf_(html, 'Rekap Nilai - ' + namaRombel + ' - ' + namaMapel, 'portrait');
}
