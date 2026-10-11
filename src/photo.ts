import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';

/**
 * The app's documents folder moves when the app updates, so settings keep only
 * the file name and the full path is rebuilt each launch.
 */
export function photoUri(name: string | undefined) {
	return name ? new File(Paths.document, name).uri : undefined;
}

/** Lets someone pick a photo for the paddle face and keeps a private copy. Returns the new file name. */
export async function pickPaddlePhoto(previous: string | undefined): Promise<string | undefined> {
	const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
	const asset = result.canceled ? undefined : result.assets[0];
	if (!asset) return undefined;
	const extension = /\.([a-z0-9]{1,5})$/i.exec(asset.uri)?.[1]?.toLowerCase() ?? 'jpg';
	const name = `paddle-photo-${Date.now()}.${extension}`;
	await new File(asset.uri).copy(new File(Paths.document, name));
	if (previous) {
		try { new File(Paths.document, previous).delete(); } catch (cause) { console.warn('Could not remove old photo', cause); }
	}
	return name;
}
