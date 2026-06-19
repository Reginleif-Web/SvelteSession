import type { ClientSession, SessionUser } from '../../shared/types.js';

export const sessionState = $state<ClientSession>({
	status: 'loading',
	data: null,
	accessToken: null
});

export function applySession(user: SessionUser | null, accessToken: string | null): void {
	sessionState.data = user;
	sessionState.accessToken = accessToken;
	sessionState.status = user ? 'authorized' : 'unauthorized';
}

export function setSessionLoading(): void {
	sessionState.status = 'loading';
}

export function hydrateSession(user: SessionUser | null, accessToken: string | null): void {
	if (user) {
		applySession(user, accessToken ?? null);
		return;
	}
	applySession(null, null);
}
