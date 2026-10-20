// plugins/withHealthConnect.js edits Expo's generated MainActivity by regex at
// prebuild. If an SDK upgrade changes that template, permission requests throw
// again (an uninitialised launcher) or the Android build breaks, and nothing
// else would notice before a device does. These run its two mods directly.

const mockMods: Record<string, (cfg: any) => any> = {};
jest.mock('@expo/config-plugins', () => ({
  withMainActivity: (config: any, fn: any) => { mockMods.mainActivity = fn; return config; },
  withAndroidManifest: (config: any, fn: any) => { mockMods.manifest = fn; return config; },
}));

const withHealthConnect = require('../plugins/withHealthConnect');

// The shape of Expo SDK 57's generated MainActivity.kt
const MAIN_ACTIVITY = `package com.aretefitness.app

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "main"
}
`;

const DELEGATE = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

function runMainActivity(contents: string, language = 'kt') {
  withHealthConnect({});
  return mockMods.mainActivity({ modResults: { contents, language } }).modResults.contents as string;
}

function runManifest(application: any) {
  withHealthConnect({});
  return mockMods.manifest({ modResults: { manifest: { application: [application] } } }).modResults.manifest.application[0];
}

describe('withHealthConnect', () => {
  describe('MainActivity', () => {
    it('sets the permission delegate right after super.onCreate, and imports it', () => {
      const out = runMainActivity(MAIN_ACTIVITY);
      expect(out).toContain('import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate');
      expect(out).toMatch(/super\.onCreate\(null\)\n {4}HealthConnectPermissionDelegate\.setPermissionDelegate\(this\)\n/);
      // The import goes under the package line, where Kotlin requires it
      expect(out.indexOf('import dev.matinzd')).toBeGreaterThan(out.indexOf('package com.aretefitness.app'));
      expect(out.indexOf('import dev.matinzd')).toBeLessThan(out.indexOf('class MainActivity'));
    });

    it('does nothing the second time, so a repeated prebuild adds no duplicate', () => {
      const once = runMainActivity(MAIN_ACTIVITY);
      const twice = runMainActivity(once);
      expect(twice).toBe(once);
      expect(twice.split(DELEGATE)).toHaveLength(2);
    });

    it('fails the build loudly if the template has no super.onCreate to hook', () => {
      const changed = MAIN_ACTIVITY.replace('super.onCreate(null)\n', 'super.onCreate(savedInstanceState);\n');
      expect(() => runMainActivity(changed)).toThrow(/no super\.onCreate/);
    });

    it('refuses a Java MainActivity rather than writing Kotlin into it', () => {
      expect(() => runMainActivity(MAIN_ACTIVITY, 'java')).toThrow(/Kotlin/);
    });
  });

  describe('AndroidManifest', () => {
    const isAlias = (a: any) => a.$['android:name'] === 'ViewPermissionUsageActivity';

    it('adds the Android 14 permission-usage alias Health Connect needs to show its dialog', () => {
      const app = runManifest({ $: {}, activity: [] });
      const alias = app['activity-alias'].find(isAlias);
      expect(alias.$).toMatchObject({
        'android:exported': 'true',
        'android:targetActivity': '.MainActivity',
        'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
      });
      expect(alias['intent-filter'][0].action[0].$['android:name']).toBe('android.intent.action.VIEW_PERMISSION_USAGE');
      expect(alias['intent-filter'][0].category[0].$['android:name']).toBe('android.intent.category.HEALTH_PERMISSIONS');
    });

    it('keeps other aliases and never adds a second copy of its own', () => {
      const other = { $: { 'android:name': 'SomethingElse' } };
      const once = runManifest({ $: {}, 'activity-alias': [other] });
      const twice = runManifest(once);
      expect(twice['activity-alias'].filter(isAlias)).toHaveLength(1);
      expect(twice['activity-alias']).toContain(other);
    });
  });
});
