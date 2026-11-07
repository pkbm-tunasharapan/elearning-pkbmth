import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

/// Versi web: berkas langsung diunduh oleh browser (folder Unduhan), seperti tombol "Download".
Future<void> unduhBerkasWeb(List<int> bytes, String nama, String mime) async {
  final data = bytes is Uint8List ? bytes : Uint8List.fromList(bytes);
  final blob = web.Blob(<JSAny>[data.toJS].toJS, web.BlobPropertyBag(type: mime));
  final url = web.URL.createObjectURL(blob);
  final a = web.HTMLAnchorElement()
    ..href = url
    ..download = nama;
  a.style.display = 'none';
  web.document.body?.appendChild(a);
  a.click();
  a.remove();
  Timer(const Duration(minutes: 1), () => web.URL.revokeObjectURL(url));
}
