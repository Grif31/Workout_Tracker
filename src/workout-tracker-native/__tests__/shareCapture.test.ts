import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { captureAndShare } from '../utils/shareCapture';
import { showToast } from '../utils/toast';

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));

const mockCapture = captureRef as jest.Mock;
const mockShare = Sharing.shareAsync as jest.Mock;

describe('captureAndShare', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCapture.mockResolvedValue('file://card.png');
    mockShare.mockResolvedValue(undefined);
  });

  it('shares the captured card as a PNG', async () => {
    await captureAndShare({}, 'Share your week');
    expect(mockShare).toHaveBeenCalledWith('file://card.png', { mimeType: 'image/png', dialogTitle: 'Share your week' });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('tells the user when the image could not be made, instead of doing nothing', async () => {
    mockCapture.mockRejectedValue(new Error('view not found'));
    await expect(captureAndShare({})).resolves.toBeUndefined();
    expect(showToast).toHaveBeenCalledWith("Couldn't create the image. Try again.");
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('ignores a second tap while the first share is still open', async () => {
    let finish!: () => void;
    mockShare.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const first = captureAndShare({});
    await captureAndShare({});
    expect(mockCapture).toHaveBeenCalledTimes(1);
    finish();
    await first;
    await captureAndShare({});
    expect(mockCapture).toHaveBeenCalledTimes(2);
  });
});
