/** The browser preview has no private file storage, so it doesn't offer a photo face. */
export function photoUri(_name: string | undefined): string | undefined {
	return undefined;
}

export async function pickPaddlePhoto(_previous: string | undefined): Promise<string | undefined> {
	return undefined;
}
