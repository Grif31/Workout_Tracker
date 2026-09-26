import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import type { WidgetImages } from './widgetProps';

// iOS widget layouts can only show an image from a file URL (Image uiImage),
// and the extension can only read files in the App Group it shares with the
// app, so the bundled logos are copied into expo-widgets' widgetsDirectory.
// The version is in the file name: a changed logo is a new file, never a stale
// copy an earlier release left behind.
const LOGOS = [
  { key: 'logoDark', file: 'logo_on_dark_v1.png', module: require('../assets/widgets/logo_on_dark.png') },
  { key: 'logoLight', file: 'logo_on_light_v1.png', module: require('../assets/widgets/logo_on_light.png') },
] as const;

const NONE: WidgetImages = { logoDark: null, logoLight: null };

/** The logos' URLs in the App Group, copying them there the first time. Null for a logo that couldn't be copied: widgets draw without it. */
export async function prepareWidgetImages(widgetsDirectory: string | null | undefined): Promise<WidgetImages> {
  if (!widgetsDirectory) return NONE;
  const images: WidgetImages = { ...NONE };
  for (const logo of LOGOS) {
    try {
      const dest = new File(widgetsDirectory, logo.file);
      if (!dest.exists) {
        const asset = Asset.fromModule(logo.module);
        await asset.downloadAsync();
        if (!asset.localUri) continue;
        await new File(asset.localUri).copy(dest);
      }
      images[logo.key] = dest.uri;
    } catch { /* this logo stays null */ }
  }
  return images;
}
