const { withAndroidManifest, withMainActivity } = require('@expo/config-plugins');

// Two things react-native-health-connect needs that its own plugin doesn't add:
//
// 1. Its requestPermission launches from a launcher that only
//    HealthConnectPermissionDelegate.setPermissionDelegate(activity) creates, and
//    that must run in MainActivity.onCreate. Without it the launcher is an
//    uninitialised lateinit and asking for permission throws.
// 2. On Android 14+, Health Connect won't show the permission dialog unless an
//    activity answers VIEW_PERMISSION_USAGE with the HEALTH_PERMISSIONS category
//    (the privacy-policy link). The plugin only adds the pre-14 rationale action.

const IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';

function withPermissionDelegate(config) {
  return withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes('HealthConnectPermissionDelegate.setPermissionDelegate')) return cfg;
    if (cfg.modResults.language !== 'kt') throw new Error('withHealthConnect: expected a Kotlin MainActivity');
    src = src.replace(/^(package [^\n]+\n)/m, `$1\n${IMPORT}\n`);
    const onCreate = /super\.onCreate\([^)]*\)\n/;
    if (!onCreate.test(src)) throw new Error('withHealthConnect: no super.onCreate in MainActivity');
    src = src.replace(onCreate, (m) => `${m}    HealthConnectPermissionDelegate.setPermissionDelegate(this)\n`);
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withPermissionUsageAlias(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    app['activity-alias'] = (app['activity-alias'] || []).filter(
      (a) => a.$['android:name'] !== 'ViewPermissionUsageActivity',
    );
    app['activity-alias'].push({
      $: {
        'android:name': 'ViewPermissionUsageActivity',
        'android:exported': 'true',
        'android:targetActivity': '.MainActivity',
        'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
      },
      'intent-filter': [{
        action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
        category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
      }],
    });
    return cfg;
  });
}

module.exports = (config) => withPermissionUsageAlias(withPermissionDelegate(config));
