const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withConfig(config) {
  // Add Android Permissions for Camera and Mic
  config = withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest;
    if (!mainApplication['uses-permission']) {
      mainApplication['uses-permission'] = [];
    }
    
    const permissions = [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO'
    ];

    permissions.forEach((permission) => {
      const hasPermission = mainApplication['uses-permission'].some(
        (p) => p.$['android:name'] === permission
      );
      if (!hasPermission) {
        mainApplication['uses-permission'].push({
          $: { 'android:name': permission }
        });
      }
    });

    return config;
  });

  return config;
};
