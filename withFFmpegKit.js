const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withFFmpegKit(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      // Append the ext property that ffmpeg-kit-react-native looks for
      if (!config.modResults.contents.includes('ffmpegKitPackage')) {
        config.modResults.contents += `\n\next { ffmpegKitPackage = "https-lts" }\n`;
      }
    }
    return config;
  });
};
