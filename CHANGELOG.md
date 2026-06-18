# Changelog

All notable changes to this package will be documented in this file.

This project follows semantic versioning where possible.

## 1.0.5-beta.5

- Fixed `SessionProvider` initialization to treat omitted `session` prop as "no initial SSR session" instead of forcing client state hydration to unauthorized.
- Synchronized provider hydration side effects by clearing in-memory access token only when `session` is explicitly provided without valid `{ user, accessToken }`.

## 1.0.5-beta.4
- Removed the session-cookie gate from no-token client recovery so revalidation requests are not blocked in runtime unauthorized state after long unfocus/unlock.
- Fixed client hydration to keep SSR user data authorized when access token is missing and to revalidate that state in `initSession()`.
- Aligned client session resolution with SSR by querying the session endpoint before refresh fallback in `resolveClientSession()`.
- Fixed SSR-authorized/client-unauthorized mismatch after idle/unlock by using the same server-backed session source for client revalidation.

## 1.0.5-beta.3

- Fixed no-token client recovery after long unfocus/unlock: recovery is no longer restricted to foreground trigger only, so interval recovery can revalidate session without page reload.
- Added session-cookie guard for no-token recovery attempts to avoid refresh calls when the user has no active session cookie.

## 1.0.5-beta.2

- Fixed client recovery loop to avoid `POST /refresh` calls when there is no in-memory session/token, preventing repeated backend `401` responses in unauthorized state.
- Fixed tab return recovery flow: session refresh is now triggered on foreground events (`focus`, `pageshow`, `online`, `visibilitychange`) even when access token is missing, so auth can recover without full page reload.
- Fixed client session resolver side effects by removing premature token clearing from `resolveClientSession()` failure branches; session state is now finalized only by session commit logic.

## 1.0.5-beta.0

- Switched `AuthUser`, `CheckSessionResponseData`, `SessionUser`, `ClientSession`, and `ServerSession` to interfaces for module augmentation.
- Removed fixed `{ userId, email }` remapping in check-session resolution to preserve extended user payload fields.

## 1.0.4

- Updated client refresh flow with `soft` and `hard` modes to avoid premature `unauthorized` during transient idle/network failures.
- Fixed concurrent refresh mode escalation so a queued `hard` refresh is not downgraded by an in-flight `soft` refresh.
- Fixed `initSession()` for hydrated-but-expired tokens: now it performs hard refresh (or resolves unauthorized when refresh is disabled) instead of exiting as authorized.
- Updated SSR `getServerSession()` to use request-scoped resolved config instead of module-global config mutation.
- Hardened server cookie detection by strict cookie-name matching.
- Added `accessTokenExpiresInSec` to `ServerSession` and `SessionProvider` SSR hydration path to preserve real token TTL on the client.
- Removed default `= null` initializers from nullable runtime vars in `src` and normalized null-safe reads/checks.

## 1.0.3

- fix imports to prevent error Unknown file extension ".svelte" for ....\node_modules\svelte-session\dist\client\provider\session-provider.svelte

## 1.0.2

- Added optional `paths.refresh` support for pure JWT lifetime mode without refresh endpoint calls.
- Updated session lifecycle to expire client session when refresh is not configured.
- Updated `AuthConfig` docs and README guidance for optional refresh behavior.
- Refactored source tree into explicit layers: `src/client`, `src/server`, `src/shared`, `src/core`, and `src/entrypoints`.
- Rebuilt package exports to use entrypoint modules:
  - `svelte-session`
  - `svelte-session/server`
  - `svelte-session/core`
  - `svelte-session/types`
- Moved auth API client and shared contracts into `src/shared` to remove client/server coupling in internal paths.
- Removed legacy internal source paths from the package surface as part of the structural refactor.

## 1.0.1

- Backend API contract — discriminated union
- Resolved Svelte prop warnings in package components
- Repository renamed from SvelteSession to svelte-session

## 1.0.0

- Initial workspace package version.
- Added package documentation for SvelteKit client and server usage.
- Documented the backend HTTP contract expected by the auth client.
- Added package-level contribution, security, and license files.
