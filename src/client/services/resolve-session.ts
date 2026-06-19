import type { AuthData } from '../../shared/contracts.js';
import type { SessionUser } from '../../shared/types.js';
import {
	identityAuth,
	identityCheck,
	identityLogout,
	identitySession,
	identityRefresh
} from '../../shared/api/identity.js';
import { getAuthConfig } from '../../shared/config.js';
import {
	clearAccessToken,
	getAccessToken,
	isAccessTokenExpired,
	setAccessToken
} from '../state/access-token-store.js';

export type ResolvedSession = {
	kind: 'authorized' | 'anonymous' | 'invalid' | 'transient';
	user: SessionUser | null;
	accessToken: string | null;
	expiresInSec: number;
	errorCode?: string;
};

function isTransientResolutionError(code: string | undefined): boolean {
	if (!code) {
		return false;
	}
	if (
		code === 'network_error' ||
		code === 'timeout' ||
		code === 'invalid_response' ||
		code === 'http_429'
	) {
		return true;
	}
	if (/^http_\d\d\d$/.test(code) && code !== 'http_401' && code !== 'http_403') {
		return true;
	}
	return false;
}

function resolveFailedRefreshKind(code: string | undefined): ResolvedSession['kind'] {
	if (code === 'http_401' || code === 'http_403') {
		return 'invalid';
	}
	return isTransientResolutionError(code) ? 'transient' : 'invalid';
}

export async function resolveClientSession(): Promise<ResolvedSession> {
	if (!isAccessTokenExpired()) {
		const token = getAccessToken();
		if (token) {
			const check = await identityCheck(token);
			if (check.success && check.data) {
				return {
					kind: 'authorized',
					user: check.data,
					accessToken: token,
					expiresInSec: 0
				};
			}
		}
	}

	const { result: sessionResult } = await identitySession();
	if (sessionResult.success) {
		setAccessToken(sessionResult.data.accessToken, sessionResult.data.expires);
		return {
			kind: 'authorized',
			user: sessionResult.data.user,
			accessToken: sessionResult.data.accessToken,
			expiresInSec: sessionResult.data.expires
		};
	}
	if (sessionResult.error.code === 'http_401' || sessionResult.error.code === 'http_403') {
		return {
			kind: 'anonymous',
			user: null,
			accessToken: null,
			expiresInSec: 0,
			errorCode: sessionResult.error.code
		};
	}

	const { paths } = getAuthConfig();
	if (!paths.refresh) {
		return {
			kind: isTransientResolutionError(sessionResult.error.code) ? 'transient' : 'invalid',
			user: null,
			accessToken: null,
			expiresInSec: 0,
			errorCode: sessionResult.error.code
		};
	}

	const { result } = await identityRefresh();
	if (!result.success) {
		return {
			kind: resolveFailedRefreshKind(result.error.code),
			user: null,
			accessToken: null,
			expiresInSec: 0,
			errorCode: result.error.code
		};
	}
	if (!result.data) {
		return {
			kind: 'transient',
			user: null,
			accessToken: null,
			expiresInSec: 0,
			errorCode: 'invalid_response'
		};
	}

	setAccessToken(result.data.accessToken, result.data.expires);

	return {
		kind: 'authorized',
		user: result.data.user,
		accessToken: result.data.accessToken,
		expiresInSec: result.data.expires
	};
}

export async function loginClientSession(credentials: AuthData): Promise<{
	ok: boolean;
	user: SessionUser | null;
	accessToken: string | null;
	expiresInSec: number;
	error?: { code: string; message: string };
}> {
	const { result } = await identityAuth(credentials);
	if (!result.success) {
		clearAccessToken();
		return {
			ok: false,
			user: null,
			accessToken: null,
			expiresInSec: 0,
			error: result.error
		};
	}

	setAccessToken(result.data.accessToken, result.data.expires);

	return {
		ok: true,
		user: result.data.user,
		accessToken: result.data.accessToken,
		expiresInSec: result.data.expires
	};
}

export async function logoutClientSession(): Promise<void> {
	await identityLogout();
	clearAccessToken();
}
