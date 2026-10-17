// Expo ships some iOS modules precompiled for one Swift compiler. When Xcode
// updates past it (Xcode 27.1 brought Swift 6.4), those binaries no longer
// load, so build every Expo module from source. Remove this once Expo ships
// precompiled modules for the installed Xcode.
const { withPodfileProperties } = require('expo/config-plugins');

module.exports = function withSourceBuiltModules(config) {
	return withPodfileProperties(config, mod => {
		mod.modResults.EXPO_USE_PRECOMPILED_MODULES = 'false';
		return mod;
	});
};
