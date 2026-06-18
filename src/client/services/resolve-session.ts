import type { AuthData } from '../../shared/contracts.js';
import type { SessionUser } from '../../shared/types.js';
import {
	identityAuth,
	identityCheck,
	identityLogout,
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
	user: SessionUser | null;
	accessToken: string | null;
	expiresInSec: number;
	errorCode?: string;
};

export async function resolveClientSession(): Promise<ResolvedSession> {
	if (!isAccessTokenExpired()) {
		const token = getAccessToken();
		if (token) {
			const check = await identityCheck(token);
			if (check.success && check.data) {
				return {
					user: check.data,
					accessToken: token,
					expiresInSec: 0
				};
			}
		}
	}

	const { paths } = getAuthConfig();
	if (!paths.refresh) {
		return {
			user: null,
			accessToken: null,
			expiresInSec: 0,
			errorCode: 'refresh_not_configured'
		};
	}

	const { result } = await identityRefresh();
	if (!result.success) {
		return {
			user: null,
			accessToken: null,
			expiresInSec: 0,
			errorCode: result.error.code
		};
	}
	if (!result.data) {
		return {
			user: null,
			accessToken: null,
			expiresInSec: 0,
			errorCode: 'invalid_response'
		};
	}

	setAccessToken(result.data.accessToken, result.data.expires);

	return {
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
