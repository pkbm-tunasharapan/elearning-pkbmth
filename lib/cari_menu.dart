import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'menu.dart';
import 'theme.dart';
import 'widgets.dart';

/// Palet perintah: cari & buka menu mana pun (Ctrl+K / ⌘K / tombol cari).
Future<void> bukaCariMenu(BuildContext context, List<MenuApp> menu, void Function(String id) onPilih) async {
  final id = await showDialog<String>(
    context: context,
    builder: (_) => _CariMenuDialog(menu: menu),
  );
  if (id != null) onPilih(id);
}

class _CariMenuDialog extends StatefulWidget {
  const _CariMenuDialog({required this.menu});
  final List<MenuApp> menu;

  @override
  State<_CariMenuDialog> createState() => _CariMenuDialogState();
}

class _CariMenuDialogState extends State<_CariMenuDialog> {
  String _q = '';
  int _pilih = 0;

  List<MenuApp> get _hasil => cariMenu(widget.menu, _q);

  void _buka(List<MenuApp> h) {
    if (h.isEmpty) return;
    Navigator.pop(context, h[_pilih.clamp(0, h.length - 1)].id);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final h = _hasil;
    final layar = MediaQuery.of(context).size;
    return Dialog(
      alignment: Alignment.topCenter,
      insetPadding: EdgeInsets.fromLTRB(16, layar.height > 700 ? 80 : 24, 16, 24),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: 560, maxHeight: layar.height * 0.7),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: CallbackShortcuts(
              bindings: {
                const SingleActivator(LogicalKeyboardKey.arrowDown): () => setState(() => _pilih = (_pilih + 1).clamp(0, h.isEmpty ? 0 : h.length - 1)),
                const SingleActivator(LogicalKeyboardKey.arrowUp): () => setState(() => _pilih = (_pilih - 1).clamp(0, h.isEmpty ? 0 : h.length - 1)),
              },
              child: TextField(
                autofocus: true,
                textInputAction: TextInputAction.go,
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari menu… (mis. rapor, absensi, dapodik)'),
                onChanged: (v) => setState(() {
                  _q = v;
                  _pilih = 0;
                }),
                onSubmitted: (_) => _buka(h),
              ),
            ),
          ),
          Flexible(
            child: h.isEmpty
                ? Padding(padding: const EdgeInsets.all(24), child: Text('Tidak ada menu yang cocok.', style: TextStyle(color: cs.onSurfaceVariant)))
                : ListView.builder(
                    shrinkWrap: true,
                    padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                    itemCount: h.length,
                    itemBuilder: (context, i) {
                      final m = h[i];
                      return ListTile(
                        selected: i == _pilih,
                        selectedTileColor: cs.primary.withValues(alpha: 0.08),
                        leading: IkonBulat(m.ikon, warna: Gaya.warnaMenu(m.id), ukuran: 36, sudut: 12),
                        title: Text(m.judul),
                        subtitle: Text(grupMenu(m)),
                        trailing: i == _pilih ? const Icon(Icons.keyboard_return_rounded, size: 18) : null,
                        onTap: () => Navigator.pop(context, m.id),
                      );
                    },
                  ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Text('↑ ↓ pilih · Enter buka · Esc tutup', style: TextStyle(fontSize: 11.5, color: cs.outline)),
          ),
        ]),
      ),
    );
  }
}
