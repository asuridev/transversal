import * as client from 'openid-client';

export interface AuthorizationRequest {
  readonly url: URL;
  readonly codeVerifier: string;
  readonly state: string;
  readonly nonce: string;
}

/** Construye la URL de autorización con PKCE S256 + `state`/`nonce` (D1, FR-003). */
export async function buildAuthorizationUrl(
  config: client.Configuration,
  redirectUri: string,
): Promise<AuthorizationRequest> {
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  return { url, codeVerifier, state, nonce };
}

export interface AuthorizationCodeGrantChecks {
  readonly pkceCodeVerifier: string;
  readonly expectedState: string;
  readonly expectedNonce: string;
}

export interface AuthorizationCodeResult {
  /** Claims decodificados del ID Token (identidad, roles, partner). */
  readonly claims: Record<string, unknown>;
  /** `id_token` original (JWT firmado) — se retiene sellado para `id_token_hint` del logout. */
  readonly idToken: string;
}

/**
 * Intercambia `code` por tokens y valida firma (JWKS)/`iss`/`aud`/`exp`/`nonce`
 * (D1, FR-003). Devuelve los claims del ID Token y el `id_token` crudo. El
 * `access_token` se descarta (FR-002); el `id_token` se conserva sellado solo
 * como `id_token_hint` del RP-initiated logout (Keycloak < 19).
 */
export async function authorizationCodeGrant(
  config: client.Configuration,
  currentUrl: URL,
  checks: AuthorizationCodeGrantChecks,
): Promise<AuthorizationCodeResult> {
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: checks.pkceCodeVerifier,
    expectedState: checks.expectedState,
    expectedNonce: checks.expectedNonce,
    idTokenExpected: true,
  });

  const claims = tokens.claims();
  if (!claims || !tokens.id_token) {
    throw new Error('OIDC callback sin ID Token válido');
  }
  return { claims: claims as Record<string, unknown>, idToken: tokens.id_token };
}

export interface EndSessionParams {
  readonly postLogoutRedirectUri: string;
  readonly idTokenHint?: string;
}

/** URL del `end_session_endpoint` del IdP (RP-initiated logout, D4, FR-014). */
export function buildEndSessionUrl(config: client.Configuration, params: EndSessionParams): URL {
  return client.buildEndSessionUrl(config, {
    post_logout_redirect_uri: params.postLogoutRedirectUri,
    ...(params.idTokenHint !== undefined ? { id_token_hint: params.idTokenHint } : {}),
  });
}
