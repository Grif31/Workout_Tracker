import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { showToast } from './toast';

let capturing = false;

// Captures an (off-screen) share card view and opens the native share sheet.
// PNG keeps text and route lines crisp.
//
// Dismissing the share sheet resolves normally, so anything thrown here is a
// real failure to build or hand over the image, and the user is told. A second
// call while one is in flight is ignored: two of the share buttons have no
// spinner to stop a double tap.
export async function captureAndShare(
  ref: React.RefObject<any> | any,
  dialogTitle = 'Share your workout',
): Promise<void> {
  if (capturing) return;
  capturing = true;
  try {
    const uri = await captureRef(ref, { format: 'png', quality: 1 });
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle });
  } catch {
    showToast("Couldn't create the image. Try again.");
  } finally {
    capturing = false;
  }
}
