// iOS 27 stops apps at launch unless they adopt the scene life cycle. Expo ships
// ExpoAppSceneDelegate for this, but the prebuild template doesn't use it yet, so
// this plugin hands window creation to it and declares the scene in Info.plist.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const START_IN_APP_DELEGATE = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function adoptScenes(source) {
	if (source.includes('ExpoReactNativeFactoryProvider')) return source;
	if (!START_IN_APP_DELEGATE.test(source) || !source.includes('class AppDelegate: ExpoAppDelegate {')) {
		throw new Error('with-scene-lifecycle: AppDelegate.swift no longer matches the Expo template; update the plugin.');
	}
	return source
		.replace('class AppDelegate: ExpoAppDelegate {', 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')
		.replace(START_IN_APP_DELEGATE, '\n    // ExpoAppSceneDelegate creates the window and starts React Native for each scene.\n');
}

module.exports = function withSceneLifecycle(config) {
	config = withAppDelegate(config, mod => {
		if (mod.modResults.language !== 'swift') throw new Error('with-scene-lifecycle expects a Swift AppDelegate.');
		mod.modResults.contents = adoptScenes(mod.modResults.contents);
		return mod;
	});
	return withInfoPlist(config, mod => {
		mod.modResults.UIApplicationSceneManifest = {
			UIApplicationSupportsMultipleScenes: false,
			UISceneConfigurations: {
				UIWindowSceneSessionRoleApplication: [{
					UISceneConfigurationName: 'Default Configuration',
					UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
				}],
			},
		};
		return mod;
	});
};
