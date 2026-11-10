import 'dart:ui_web' as ui_web;

import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

int _urut = 0;

/// Web: dokumen ditampilkan di dalam iframe (tanpa tombol unduh/cetak dari aplikasi).
Widget bingkaiHtml(String html) {
  final id = 'pratinjau-html-${_urut++}';
  ui_web.platformViewRegistry.registerViewFactory(id, (int _) {
    final f = web.HTMLIFrameElement();
    f.src = 'data:text/html;charset=utf-8,${Uri.encodeComponent(html)}';
    f.style.border = 'none';
    f.style.width = '100%';
    f.style.height = '100%';
    return f;
  });
  return HtmlElementView(viewType: id);
}
