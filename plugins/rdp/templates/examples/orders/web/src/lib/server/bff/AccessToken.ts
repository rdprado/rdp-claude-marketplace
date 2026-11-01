// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Application — reads the user id (`sub`) from an access token, for log lines only.
// The token is not verified here: the API verifies it on every call.
import { isObject } from './isObject.ts';

export const AccessToken = {
  subject(accessToken: string): string | null {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    try {
      const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!isObject(claims)) return null;
      const sub = claims.sub;
      return typeof sub === 'string' ? sub : null;
    } catch {
      return null; // not a JWT: logs go without a user id
    }
  }
};
