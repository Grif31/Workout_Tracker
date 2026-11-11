import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import ImportScreen, { type ImportPreview } from '../screens/ProfileTab/ImportScreen';

jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22 } } }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8' },
  readAsStringAsync: jest.fn(() => Promise.resolve('title,start_time,exercise_title\n')),
}));

const DocumentPicker = require('expo-document-picker');
const nav = createMockNavigation();
const route = createMockRoute('Import');

const PREVIEW: ImportPreview = {
  workouts: 3, sets: 7, already_imported: 1, first_date: '2024-01-15', last_date: '2024-03-22',
  matched_exercises: [
    { title: 'Bench Press (Barbell)', name: 'Bench Press', equipment: 'Barbell' },
    { title: 'Shoulder Press (Dumbbell)', name: 'Overhead Press', equipment: 'Dumbbell' },
  ],
  new_exercises: ['Cable Fly Crossovers (Band)'],
  weight_unit: 'lbs', unit_in_file: true,
};

type Reply = { status: number; body: any };

function mockServer(routes: Record<string, Reply>) {
  (global.fetch as jest.Mock) = jest.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(url).replace(/^.*?\/api/, '/api')}`;
    const reply = routes[key] ?? { status: 404, body: {} };
    return Promise.resolve({
      ok: reply.status < 300, status: reply.status,
      json: () => Promise.resolve(reply.body), text: () => Promise.resolve(JSON.stringify(reply.body)),
    });
  });
}

const calls = (key: string) => (global.fetch as jest.Mock).mock.calls.filter(
  ([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace(/^.*?\/api/, '/api')}` === key);

const bodyOf = (key: string) => JSON.parse(calls(key)[0][1].body);

const pickFile = (name = 'hevy.csv') =>
  DocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: `file:///${name}`, size: 1200 }] });

const renderScreen = () => render(<ImportScreen navigation={nav as any} route={route as any} />);

describe('ImportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServer({
      'GET /api/import': { status: 200, body: { imported: { hevy: 0, strong: 0 } } },
      'POST /api/import/preview': { status: 200, body: PREVIEW },
      'POST /api/import': { status: 201, body: { imported: 3, already_imported: 1, prs: 2, badges: 1 } },
    });
  });

  it('previews the picked file, then imports it', async () => {
    pickFile();
    const screen = renderScreen();
    fireEvent.press(screen.getByLabelText('Import from Hevy'));

    expect(await screen.findByText('3 workouts')).toBeTruthy();
    expect(screen.getByText('1 workout already imported, skipped')).toBeTruthy();
    expect(screen.getByText('Bench Press (Barbell)')).toBeTruthy();
    expect(screen.queryByText('Saved as Bench Press (Barbell)')).toBeNull();
    expect(screen.getByText('Saved as Overhead Press (Dumbbell)')).toBeTruthy();
    expect(screen.getByText('Cable Fly Crossovers (Band)')).toBeTruthy();
    expect(screen.queryByText('Weights in this file are in')).toBeNull();
    expect(bodyOf('POST /api/import/preview')).toEqual({
      source: 'hevy', csv: 'title,start_time,exercise_title\n', weight_unit: null,
    });

    fireEvent.press(screen.getByText('Import 3 Workouts'));
    expect(await screen.findByText('Imported 3 workouts')).toBeTruthy();
    expect(screen.getByText('2 PRs · 1 badge earned')).toBeTruthy();
    expect(bodyOf('POST /api/import').source).toBe('hevy');

    fireEvent.press(screen.getByText('Done'));
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('asks for the unit when the file has none and sends the choice', async () => {
    mockServer({
      'GET /api/import': { status: 200, body: { imported: { hevy: 0, strong: 0 } } },
      'POST /api/import/preview': { status: 200, body: { ...PREVIEW, unit_in_file: false } },
      'POST /api/import': { status: 201, body: { imported: 3, already_imported: 0, prs: 0, badges: 0 } },
    });
    pickFile('strong.csv');
    const screen = renderScreen();
    fireEvent.press(screen.getByLabelText('Import from Strong'));

    expect(await screen.findByText('Weights in this file are in')).toBeTruthy();
    fireEvent.press(screen.getByText('kg'));
    fireEvent.press(screen.getByText('Import 3 Workouts'));
    await screen.findByText('Imported 3 workouts');
    expect(bodyOf('POST /api/import')).toMatchObject({ source: 'strong', weight_unit: 'kg' });
  });

  it("shows the server's reason when the file isn't that app's export", async () => {
    mockServer({
      'GET /api/import': { status: 200, body: { imported: { hevy: 0, strong: 0 } } },
      'POST /api/import/preview': { status: 400, body: { message: "This doesn't look like a Strong export." } },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    pickFile();
    const screen = renderScreen();
    fireEvent.press(screen.getByLabelText('Import from Strong'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn't Read the File", "This doesn't look like a Strong export."));
    expect(calls('POST /api/import')).toHaveLength(0);
    alert.mockRestore();
  });

  it('does nothing when the picker is cancelled', async () => {
    DocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    const screen = renderScreen();
    fireEvent.press(screen.getByLabelText('Import from Hevy'));
    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalled());
    expect(calls('POST /api/import/preview')).toHaveLength(0);
  });

  it("removes an app's imported workouts after confirming", async () => {
    mockServer({
      'GET /api/import': { status: 200, body: { imported: { hevy: 12, strong: 0 } } },
      'DELETE /api/import/hevy': { status: 200, body: { removed: 12 } },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons?: any[]) => {
      buttons?.find(b => b.text === 'Remove')?.onPress?.();
    });
    const screen = renderScreen();
    expect(await screen.findByText('12 workouts imported')).toBeTruthy();
    expect(screen.queryByText('Remove Strong Workouts')).toBeNull();
    fireEvent.press(screen.getByText('Remove Hevy Workouts'));
    await waitFor(() => expect(calls('DELETE /api/import/hevy')).toHaveLength(1));
    alert.mockRestore();
  });
});
