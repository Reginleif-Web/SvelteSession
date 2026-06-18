import type { AuthData } from '../../shared/contracts.js';
import type { ClientSession } from '../../shared/types.js';
import { getAuthConfig } from '../../shared/config.js';
import {
	clearAccessToken,
	getAccessToken,
	getAccessTokenExpiresInSec,
	isAccessTokenExpired,
	setAccessToken
} from '../state/access-token-store.js';
import { loginClientSession, logoutClientSession, resolveClientSession } from './resolve-session.js';
import type { ResolvedSession } from './resolve-session.js';
import { applySession, sessionState, setSessionLoading } from '../state/session-state.svelte.js';

let refreshTimer: ReturnType<typeof setTimeout> | null;
let recoveryInterval: ReturnType<typeof setInterval> | null;
let recoveryListenersAttached = false;
let refreshInFlight: Promise<void> | null;
let refreshInFlightMode: 'soft' | 'hard' | null;
let lastNoTokenForegroundRefreshAt = 0;
const noTokenForegroundRefreshCooldownMs = 10_000;
type RefreshTrigger = 'interval' | 'foreground';
const recoveryIntervalTrigger = () => {
	void refreshIfNeeded('interval');
};
const recoveryForegroundTrigger = () => {
	void refreshIfNeeded('foreground');
};
const recoveryVisibilityTrigger = () => {
	if (document.visibilityState !== 'visible') {
		return;
	}
	void refreshIfNeeded('foreground');
};

function isTransientRefreshError(code: string | undefined): boolean {
	if (!code) {
		return false;
	}
	if (code === 'network_error' || code === 'invalid_response' || code === 'http_429') {
		return true;
	}
	return /^http_5\d\d$/.test(code);
}

function clearRefreshTimer(): void {
	if (refreshTimer != null) {
		clearTimeout(refreshTimer);
		refreshTimer = null;
	}
}

function clearRecoveryInterval(): void {
	if (recoveryInterval != null) {
		clearInterval(recoveryInterval);
		recoveryInterval = null;
	}
}

function scheduleAccessTokenRefresh(expiresInSec: number): void {
	const { paths, session } = getAuthConfig();
	clearRefreshTimer();
	if (expiresInSec <= 0) {
		return;
	}
	if (!paths.refresh) {
		refreshTimer = setTimeout(() => {
			commitSession({ user: null, accessToken: null, expiresInSec: 0 });
		}, expiresInSec * 1000);
		return;
	}
	const delayMs = Math.max(expiresInSec * 1000 - session.refreshBeforeExpiryMs, 5_000);
	refreshTimer = setTimeout(() => {
		void refreshTokens('soft');
	}, delayMs);
}

function commitSession(resolved: ResolvedSession): void {
	const { session } = getAuthConfig();
	if (resolved.user && resolved.accessToken) {
		const expiresInSec =
			resolved.expiresInSec > 0
				? resolved.expiresInSec
				: getAccessTokenExpiresInSec() || session.defaultAccessTokenTtlSec;
		setAccessToken(resolved.accessToken, expiresInSec);
		applySession(resolved.user, resolved.accessToken);
		scheduleAccessTokenRefresh(expiresInSec);
		return;
	}
	clearAccessToken();
	clearRefreshTimer();
	applySession(null, null);
}

async function refreshIfNeeded(trigger: RefreshTrigger): Promise<void> {
	const { paths } = getAuthConfig();
	if (!paths.refresh) {
		return;
	}
	const token = getAccessToken();
	if (!token) {
		if (sessionState.status === 'loading') {
			return;
		}
		const now = Date.now();
		if (now - lastNoTokenForegroundRefreshAt < noTokenForegroundRefreshCooldownMs) {
			return;
		}
		lastNoTokenForegroundRefreshAt = now;
		await refreshTokens('soft');
		return;
	}
	const shouldTryRefresh = isAccessTokenExpired() || sessionState.status !== 'authorized';
	if (!shouldTryRefresh) {
		return;
	}
	await refreshTokens('soft');
}

export function getSession(): ClientSession {
	return sessionState;
}

export async function refreshTokens(mode: 'soft' | 'hard' = 'hard'): Promise<void> {
	if (refreshInFlight) {
		const currentMode = refreshInFlightMode;
		await refreshInFlight;
		if (mode === 'hard' && currentMode === 'soft') {
			return refreshTokens('hard');
		}
		return;
	}
	refreshInFlightMode = mode;
	refreshInFlight = (async () => {
		try {
			const resolved = await resolveClientSession();
			if (
				mode === 'soft' &&
				!resolved.user &&
				sessionState.status === 'authorized' &&
				isTransientRefreshError(resolved.errorCode)
			) {
				return;
			}
			if (
				mode === 'soft' &&
				!resolved.user &&
				sessionState.status === 'authorized' &&
				typeof document !== 'undefined' &&
				document.visibilityState !== 'visible'
			) {
				return;
			}
			commitSession(resolved);
		} catch {
			if (mode === 'soft' && sessionState.status === 'authorized') {
				return;
			}
			commitSession({ user: null, accessToken: null, expiresInSec: 0 });
		}
	})();
	try {
		await refreshInFlight;
	} finally {
		refreshInFlight = null;
		refreshInFlightMode = null;
	}
}

export async function refresh(): Promise<void> {
	setSessionLoading();
	await refreshTokens('hard');
}

export async function signIn(
	credentials: AuthData
): Promise<{ ok: boolean; error?: { code: string; message: string } }> {
	setSessionLoading();
	const result = await loginClientSession(credentials);
	if (!result.ok) {
		commitSession({ user: null, accessToken: null, expiresInSec: 0 });
		return { ok: false, error: result.error };
	}
	commitSession({
		user: result.user,
		accessToken: result.accessToken,
		expiresInSec: result.expiresInSec
	});
	return { ok: true };
}

export async function signOut(): Promise<void> {
	const { onAfterSignOut } = getAuthConfig();
	setSessionLoading();
	clearRefreshTimer();
	clearRecoveryInterval();
	await logoutClientSession();
	commitSession({ user: null, accessToken: null, expiresInSec: 0 });
	await onAfterSignOut?.();
}

export async function initSession(): Promise<void> {
	const { paths } = getAuthConfig();
	if (sessionState.status === 'authorized' && sessionState.data) {
		const expiresInSec = getAccessTokenExpiresInSec();
		if (expiresInSec > 0) {
			scheduleAccessTokenRefresh(expiresInSec);
			return;
		}
		if (!paths.refresh) {
			commitSession({ user: null, accessToken: null, expiresInSec: 0 });
			return;
		}
		setSessionLoading();
		await refreshTokens('hard');
		return;
	}
	if (!paths.refresh) {
		commitSession({ user: null, accessToken: null, expiresInSec: 0 });
		return;
	}
	setSessionLoading();
	await refreshTokens('hard');
}

export function startSessionAutoRecovery(): void {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return;
	}
	clearRecoveryInterval();
	recoveryInterval = setInterval(recoveryIntervalTrigger, 15_000);
	if (recoveryListenersAttached) {
		return;
	}
	window.addEventListener('focus', recoveryForegroundTrigger);
	window.addEventListener('pageshow', recoveryForegroundTrigger);
	window.addEventListener('online', recoveryForegroundTrigger);
	document.addEventListener('visibilitychange', recoveryVisibilityTrigger);
	recoveryListenersAttached = true;
	void refreshIfNeeded('interval');
}

export function stopSessionAutoRecovery(): void {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return;
	}
	clearRecoveryInterval();
	if (!recoveryListenersAttached) {
		return;
	}
	window.removeEventListener('focus', recoveryForegroundTrigger);
	window.removeEventListener('pageshow', recoveryForegroundTrigger);
	window.removeEventListener('online', recoveryForegroundTrigger);
	document.removeEventListener('visibilitychange', recoveryVisibilityTrigger);
	recoveryListenersAttached = false;
}
