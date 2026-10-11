import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';

/** The one-time Pro unlock. Create a non-consumable with this ID in App Store Connect and Google Play Console. */
export const PRO_SKU = 'com.dinkclub.app.pro';
const KEY = 'dink-club/pro/v1';
const TESTING_KEY = 'dink-club/pro/testing';
// The store lives in the native app; Expo Go and the web preview don't have it.
const STORE = Platform.OS !== 'web' && requireOptionalNativeModule('ExpoIap') != null;

export type Pro = ReturnType<typeof usePro>;

/**
 * Whether Pro is unlocked, and the purchase flow. The store's own record decides;
 * a local copy only keeps Pro on while the store is still answering at launch.
 */
export function usePro() {
	const [owned, setOwned] = useState(false);
	const [testing, setTesting] = useState(false);
	const [price, setPrice] = useState<string>();
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string>();
	const offered = useRef(false);
	const grant = useCallback((value: boolean) => {
		setOwned(value);
		if (value) setMessage(undefined);
		AsyncStorage.setItem(KEY, value ? '1' : '0').catch(cause => console.warn('Could not save Pro', cause));
	}, []);

	useEffect(() => {
		let mounted = true;
		const subscriptions: { remove(): void }[] = [];
		AsyncStorage.getItem(KEY).then(saved => { if (mounted && saved === '1') setOwned(true); })
			.catch(cause => console.warn('Could not read Pro', cause));
		if (__DEV__) AsyncStorage.getItem(TESTING_KEY).then(saved => { if (mounted) setTesting(saved === '1'); }).catch(() => undefined);
		if (!STORE) return () => { mounted = false; };
		(async () => {
			const iap = await import('expo-iap');
			if (!mounted) return;
			subscriptions.push(iap.purchaseUpdatedListener(purchase => {
				if (purchase.productId !== PRO_SKU) return;
				if (purchase.purchaseState === 'pending') { setMessage('Waiting for the purchase to be approved…'); return; }
				if (purchase.purchaseState !== 'purchased') return;
				grant(true);
				setBusy(false);
				setMessage(undefined);
				// A non-consumable must be finished so the store stops replaying it.
				iap.finishTransaction({ purchase, isConsumable: false }).catch(cause => console.warn('Could not finish purchase', cause));
			}));
			subscriptions.push(iap.purchaseErrorListener(error => {
				setBusy(false);
				if (!iap.isUserCancelledError(error)) setMessage(error.message || 'The purchase didn’t go through.');
			}));
			await iap.initConnection();
			const products = await iap.fetchProducts({ skus: [PRO_SKU], type: 'in-app' });
			const product = products?.find(item => item.id === PRO_SKU);
			offered.current = product != null;
			if (mounted && product) setPrice(product.displayPrice);
			const purchases = await iap.getAvailablePurchases();
			if (mounted) grant(purchases.some(purchase => purchase.productId === PRO_SKU));
		})().catch(cause => console.warn('Store unavailable', cause));
		return () => {
			mounted = false;
			subscriptions.forEach(subscription => subscription.remove());
			import('expo-iap').then(iap => iap.endConnection()).catch(() => undefined);
		};
	}, [grant]);

	const buy = useCallback(async () => {
		if (!STORE) return;
		if (!offered.current) { setMessage('Pro isn’t available in the store yet.'); return; }
		setBusy(true);
		setMessage(undefined);
		try {
			const iap = await import('expo-iap');
			await iap.requestPurchase({ request: { apple: { sku: PRO_SKU }, google: { skus: [PRO_SKU] } }, type: 'in-app' });
		} catch (cause) {
			setBusy(false);
			setMessage(cause instanceof Error ? cause.message : 'The purchase didn’t go through.');
		}
	}, []);
	const restore = useCallback(async () => {
		if (!STORE) return;
		setBusy(true);
		setMessage(undefined);
		try {
			const iap = await import('expo-iap');
			await iap.restorePurchases();
			const has = (await iap.getAvailablePurchases()).some(purchase => purchase.productId === PRO_SKU);
			grant(has);
			if (!has) setMessage('No Pro purchase found for this account.');
		} catch (cause) {
			setMessage(cause instanceof Error ? cause.message : 'Couldn’t reach the store.');
		} finally {
			setBusy(false);
		}
	}, [grant]);
	/** Development builds only: flip Pro on and off without the store. Kept apart from the store's answer. */
	const toggleForTesting = __DEV__ ? () => {
		setTesting(!testing);
		setMessage(undefined);
		AsyncStorage.setItem(TESTING_KEY, testing ? '0' : '1').catch(() => undefined);
	} : undefined;

	return { owned: owned || testing, price, available: STORE, busy, message, buy, restore, toggleForTesting };
}
