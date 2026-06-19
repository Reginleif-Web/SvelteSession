export interface SessionUser {
	userId: string;
	email: string;
}

export type SessionStatus = 'loading' | 'authorized' | 'unauthorized';

export interface ClientSession {
	status: SessionStatus;
	data: SessionUser | null;
	accessToken: string | null;
}

export interface ServerSession {
	user: SessionUser | null;
	accessToken: string | null;
	accessTokenExpiresInSec: number;
	setCookies: string[];
}
