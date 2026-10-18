import * as Haptics from 'expo-haptics';
import type { Buzz } from './rally';

/** Feel the ball coming without looking: a soft tap, a double tap when you can swing, a quickening pulse, then a thump on the bounce. */
export function buzz(name: Buzz) {
	const { ImpactFeedbackStyle: Style } = Haptics;
	const tap = (style: Haptics.ImpactFeedbackStyle) => Haptics.impactAsync(style).catch(() => undefined);
	switch (name) {
		case 'coming': return tap(Style.Soft);
		case 'open': tap(Style.Medium); setTimeout(() => tap(Style.Medium), 90); return;
		case 'beat': return tap(Style.Light);
		case 'now': return tap(Style.Heavy);
	}
}

/** A happy or a sad buzz when a point ends. */
export function pointFeel(won: boolean) {
	Haptics.notificationAsync(won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}
