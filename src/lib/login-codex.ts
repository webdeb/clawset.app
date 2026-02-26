import { generatePKCE } from './pkce';
import { jwtDecode } from 'jwt-decode';

const OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

export async function createAuthorizationFlow(originator = "pi") {
    const { challenge, verifier } = await generatePKCE();
    const stateArray = new Uint8Array(16);
    crypto.getRandomValues(stateArray);
    const state = Array.from(stateArray, byte => byte.toString(16).padStart(2, '0')).join('');

    const queryParams = new URLSearchParams({
        response_type: "code",
        client_id: OAUTH_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPE,
        audience: "https://api.openai.com/v1",
        state: state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        id_token_add_organizations: "true",
        codex_cli_simplified_flow: "true",
        originator,
    });

    const url = `${AUTHORIZE_URL}?${queryParams.toString()}`;

    return { url, state, verifier };
}

export async function exchangeAuthorizationCode(code: string, verifier: string) {
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: OAUTH_CLIENT_ID,
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
        }),
    });

    if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const tokenResult = await response.json();
    
    // Attempt to extract account ID from JWT
    let accountId = "default";
    try {
        const payload: any = jwtDecode(tokenResult.access_token);
        const auth = payload?.[JWT_CLAIM_PATH];
        if (auth?.chatgpt_account_id) {
            accountId = auth.chatgpt_account_id;
        }
    } catch (e) {
        console.warn("Could not parse JWT account ID", e);
    }

    return {
        access: tokenResult.access_token,
        refresh: tokenResult.refresh_token,
        expires: Date.now() + (tokenResult.expires_in * 1000),
        accountId
    };
}