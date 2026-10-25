const { getDefaultConfig } = require('expo/metro-config');

// Expo SDK 52+ 会自动识别 pnpm workspace，无需手动改 watchFolders。
module.exports = getDefaultConfig(__dirname);
