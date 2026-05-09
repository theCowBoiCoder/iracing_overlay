import crypto from 'node:crypto';

const API_BASE = 'https://members-ng.iracing.com';
const DATA_BASE = 'https://members-ng.iracing.com/data';
const TOKEN_URL = 'https://oauth.iracing.com/oauth2/token';

export class IRacingClient {
  constructor(config) {
    this.config = config;
    this.accessToken = config.accessToken || '';
    this.refreshToken = config.refreshToken || '';
    this.expiresAt = 0;
  }

  async getMemberProfile() {
    return this.getJson('/member/info');
  }

  async getJson(path) {
    const token = await this.getAccessToken();
    const response = await fetch(`${DATA_BASE}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`iRacing API ${path} failed with ${response.status}`);
    }

    const body = await response.json();
    if (body?.link) {
      const linked = await fetch(body.link, { headers: { accept: 'application/json' } });
      if (!linked.ok) throw new Error(`iRacing signed data link failed with ${linked.status}`);
      return linked.json();
    }

    return body;
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.expiresAt - 30_000) {
      return this.accessToken;
    }

    if (this.config.authMode === 'token' && this.accessToken && !this.refreshToken) {
      return this.accessToken;
    }

    if (this.refreshToken) {
      try {
        return await this.refreshAccessToken();
      } catch (error) {
        if (this.config.authMode === 'token') throw error;
      }
    }

    if (['password_limited', 'pw-limited', 'pw_limited'].includes(this.config.authMode)) {
      return this.passwordLimitedToken();
    }

    if (this.accessToken) return this.accessToken;
    throw new Error('No iRacing auth method configured');
  }

  async refreshAccessToken() {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      client_secret: maskSecret(this.config.clientSecret, this.config.clientId),
      refresh_token: this.refreshToken
    });
    return this.requestToken(body);
  }

  async passwordLimitedToken() {
    const { clientId, clientSecret, username, password } = this.config;
    if (!username || !password) {
      throw new Error('IRACING_USERNAME and IRACING_PASSWORD are required for password_limited auth');
    }

    const body = new URLSearchParams({
      grant_type: 'password_limited',
      client_id: clientId,
      client_secret: maskSecret(clientSecret, clientId),
      username,
      password: maskSecret(password, username),
      scope: 'iracing.auth'
    });
    return this.requestToken(body);
  }

  async requestToken(body) {
    const { clientId, clientSecret } = this.config;
    if (!clientId || !clientSecret) {
      throw new Error('IRACING_CLIENT_ID and IRACING_CLIENT_SECRET are required');
    }

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json'
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`iRacing OAuth failed with ${response.status}: ${text.slice(0, 180)}`);
    }

    const token = await response.json();
    this.accessToken = token.access_token;
    this.refreshToken = token.refresh_token || this.refreshToken;
    this.expiresAt = Date.now() + Number(token.expires_in || 3600) * 1000;
    return this.accessToken;
  }
}

function maskSecret(secret, identifier) {
  const normalizedIdentifier = String(identifier).trim().toLowerCase();
  return crypto
    .createHash('sha256')
    .update(`${secret}${normalizedIdentifier}`, 'utf8')
    .digest('base64');
}
