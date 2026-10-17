import { useCallback, useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

/** The one-time Pro unlock, a non-consumable in App Store Connect, sold through RevenueCat. */
export const PRO_SKU = 'com.pocketpickle.app.pro';
/** The RevenueCat entitlement the Pro product grants. */
const ENTITLEMENT = 'pocket_pickle_pro';
// Public SDK keys, which are meant to ship inside the app. Development builds use
// RevenueCat's Test Store, which simulates purchases without touching the App Store.
const SDK_KEYS = { test: 'test_UPiAJdrIfydGAizcoAxJHpBAaCV', ios: 'appl_sJBXupFGODbByZYKSgfXtOxzNnE' };
const API_KEY = __DEV__ ? SDK_KEYS.test : Platform.OS === 'ios' ? SDK_KEYS.ios : undefined;
const KEY = 'pocket-pickle/pro/v1';
const TESTING_KEY = 'pocket-pickle/pro/testing';
// The store lives in the native app; Expo Go and the web preview don't have it.
const STORE = Platform.OS !== 'web' && API_KEY != null && NativeModules.RNPurchases != null;
let configured = false;

async function purchases() {
	const { default: Purchases } = await import('react-native-purchases');
	if (!configured) {
		Purchases.configure({ apiKey: API_KEY! });
		configured = true;
	}
	return Purchases;
}

export type Pro = ReturnType<typeof usePro>;

/**
 * Whether Pro is unlocked, and the purchase flow. RevenueCat's record decides;
 * a local copy only keeps Pro on while it's still answering at launch.
 */
export function usePro() {
	const [owned, setOwned] = useState(false);
	const [testing, setTesting] = useState(false);
	const [offer, setOffer] = useState<PurchasesPackage>();
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string>();
	const grant = useCallback((value: boolean) => {
		setOwned(value);
		if (value) setMessage(undefined);
		AsyncStorage.setItem(KEY, value ? '1' : '0').catch(cause => console.warn('Could not save Pro', cause));
	}, []);
	const apply = useCallback((info: CustomerInfo) => grant(info.entitlements.active[ENTITLEMENT] != null), [grant]);

	useEffect(() => {
		let mounted = true;
		AsyncStorage.getItem(KEY).then(saved => { if (mounted && saved === '1') setOwned(true); })
			.catch(cause => console.warn('Could not read Pro', cause));
		if (__DEV__) AsyncStorage.getItem(TESTING_KEY).then(saved => { if (mounted) setTesting(saved === '1'); }).catch(() => undefined);
		if (!STORE) return () => { mounted = false; };
		const listener = (info: CustomerInfo) => { if (mounted) apply(info); };
		(async () => {
			const Purchases = await purchases();
			Purchases.addCustomerInfoUpdateListener(listener);
			const offerings = await Purchases.getOfferings();
			const lifetime = offerings.current?.lifetime ?? offerings.current?.availablePackages[0];
			if (mounted && lifetime) setOffer(lifetime);
			listener(await Purchases.getCustomerInfo());
		})().catch(cause => console.warn('Store unavailable', cause));
		return () => {
			mounted = false;
			purchases().then(Purchases => Purchases.removeCustomerInfoUpdateListener(listener)).catch(() => undefined);
		};
	}, [apply]);

	const buy = useCallback(async () => {
		if (!STORE) return;
		if (!offer) { setMessage('Pro isn’t available in the store yet.'); return; }
		setBusy(true);
		setMessage(undefined);
		try {
			const { customerInfo } = await (await purchases()).purchasePackage(offer);
			apply(customerInfo);
		} catch (cause) {
			if (!(cause as { userCancelled?: boolean | null }).userCancelled) {
				setMessage(cause instanceof Error ? cause.message : 'The purchase didn’t go through.');
			}
		} finally {
			setBusy(false);
		}
	}, [offer, apply]);
	const restore = useCallback(async () => {
		if (!STORE) return;
		setBusy(true);
		setMessage(undefined);
		try {
			const info = await (await purchases()).restorePurchases();
			apply(info);
			if (info.entitlements.active[ENTITLEMENT] == null) setMessage('No Pro purchase found for this account.');
		} catch (cause) {
			setMessage(cause instanceof Error ? cause.message : 'Couldn’t reach the store.');
		} finally {
			setBusy(false);
		}
	}, [apply]);
	/** Development builds only: flip Pro on and off without the store. Kept apart from the store's answer. */
	const toggleForTesting = __DEV__ ? () => {
		setTesting(!testing);
		setMessage(undefined);
		AsyncStorage.setItem(TESTING_KEY, testing ? '0' : '1').catch(() => undefined);
	} : undefined;

	return { owned: owned || testing, price: offer?.product.priceString, available: STORE, busy, message, buy, restore, toggleForTesting };
}
