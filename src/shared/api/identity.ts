import type {
	ApiResponse,
	AuthData,
	AuthResult,
	CheckSessionResult,
	RefreshResult,
	SessionResult
} from '../contracts.js';
import { getAuthConfig } from '../config.js';
import { apiUrl } from '../api-url.js';

function requestCredentials(serverCookieHeader?: string): RequestCredentials | undefined {
	const { fetchCredentials } = getAuthConfig();
	if (serverCookieHeader) {
		return undefined;
	}
	return fetchCredentials ?? 'include';
}

function requestFailed<T>(code: string, message: string): T {
	return {
		success: false,
		error: { code, message }
	} as T;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<{
	result: T;
	setCookies: string[];
}> {
	const { session } = getAuthConfig();
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, session.requestTimeoutMs);
	try {
		const response = await fetch(input, { ...init, signal: controller.signal });
		const setCookies =
			typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];

		try {
			return { result: (await response.json()) as T, setCookies };
		} catch {
			return {
				result: requestFailed<T>(
					response.ok ? 'invalid_response' : `http_${response.status}`,
					response.ok ? 'Invalid API response' : response.statusText || 'Request failed'
				),
				setCookies
			};
		}
	} catch (error) {
		return {
			result: requestFailed<T>(
				error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'network_error',
				error instanceof DOMException && error.name === 'AbortError' ? 'Request timed out' : 'Network error'
			),
			setCookies: []
		};
	} finally {
		clearTimeout(timeout);
	}
}

export async function identityAuth(
	data: AuthData,
	cookieHeader?: string
): Promise<{ result: AuthResult; setCookies: string[] }> {
	const { paths } = getAuthConfig();
	const headers: HeadersInit = { 'Content-Type': 'application/json' };
	if (cookieHeader) {
		headers.cookie = cookieHeader;
	}
	return requestJson<AuthResult>(apiUrl(paths.auth), {
		method: 'POST',
		headers,
		credentials: requestCredentials(cookieHeader),
		body: JSON.stringify(data)
	});
}

export async function identityRefresh(
	cookieHeader?: string
): Promise<{ result: RefreshResult; setCookies: string[] }> {
	const { paths } = getAuthConfig();
	if (!paths.refresh) {
		return {
			result: requestFailed<RefreshResult>('refresh_not_configured', 'Refresh endpoint is not configured'),
			setCookies: []
		};
	}
	const headers: HeadersInit = {};
	if (cookieHeader) {
		headers.cookie = cookieHeader;
	}
	return requestJson<RefreshResult>(apiUrl(paths.refresh), {
		method: 'POST',
		headers,
		credentials: requestCredentials(cookieHeader)
	});
}

export async function identitySession(
	cookieHeader?: string
): Promise<{ result: SessionResult; setCookies: string[] }> {
	const { paths } = getAuthConfig();
	const headers: HeadersInit = {};
	if (cookieHeader) {
		headers.cookie = cookieHeader;
	}
	return requestJson<SessionResult>(apiUrl(paths.session), {
		method: 'GET',
		headers,
		credentials: requestCredentials(cookieHeader)
	});
}

export async function identityCheck(accessToken: string): Promise<CheckSessionResult> {
	const { paths } = getAuthConfig();
	const { result } = await requestJson<CheckSessionResult>(apiUrl(paths.check), {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	return result;
}

export async function identityLogout(cookieHeader?: string): Promise<ApiResponse<null>> {
	const { paths } = getAuthConfig();
	const headers: HeadersInit = {};
	if (cookieHeader) {
		headers.cookie = cookieHeader;
	}
	const { result } = await requestJson<ApiResponse<null>>(apiUrl(paths.logout), {
		method: 'POST',
		headers,
		credentials: requestCredentials(cookieHeader)
	});
	return result;
}
