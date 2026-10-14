import fs from 'fs';
import path from 'path';

// How the map screen enters and what the tab bar does around it are navigator
// config that Jest can't render, so these read the source. They exist because
// the GPS screen once slid in from the side while a workout slides up, and the
// tab bar hung on screen for a moment as it opened.

const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

describe('the GPS screen opens like the workout log', () => {
  const stack = read('navigation/DashboardStack.tsx');
  const options = (name: string) => {
    const at = stack.indexOf(`name="${name}"`);
    return stack.slice(at, stack.indexOf('/>', at));
  };

  it('slides up from the bottom, as WorkoutLog does, and not in from the side', () => {
    expect(options('WorkoutLog')).toContain("animation: 'slide_from_bottom'");
    expect(options('GPSCardio')).toContain("animation: 'slide_from_bottom'");
  });

  it('has no swipe-back gesture, since it is minimized with the back button', () => {
    expect(options('GPSCardio')).toContain('gestureEnabled: false');
  });
});

describe('the tab bar', () => {
  const tabs = read('navigation/AppTabs.tsx');

  it('is gone at once while the map screen is open, as it is for an open workout', () => {
    expect(tabs).toMatch(/if \(isWorkoutOpen \|\| gpsScreenOpen \|\| focusedRoute === 'GPSCardio'\) return null;/);
  });

  it('goes by the route in navigation state, which is there before the screen mounts', () => {
    // Waiting for the screen's own flag left the bar's space on screen for the first frames
    expect(tabs).toContain("focusedRoute === 'GPSCardio'");
    expect(tabs).toMatch(/const focusedRoute = getFocusedRouteNameFromRoute\(activeRoute\)/);
  });
});
