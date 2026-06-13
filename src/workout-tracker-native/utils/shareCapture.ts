import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

// Captures an (off-screen) share card view and opens the native share sheet.
// PNG keeps text and route lines crisp. Callers own loading state / error UI.
export async function captureAndShare(
  ref: React.RefObject<any> | any,
  dialogTitle = 'Share your workout',
): Promise<void> {
  const uri = await captureRef(ref, { format: 'png', quality: 1 });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle });
}
