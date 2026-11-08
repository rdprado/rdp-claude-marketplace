// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// BFF entry: GET /auth/signin sends the browser to the identity provider.
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies, locals }) => {
  // External on purpose: the URL is built by the BFF from IdentityProvider:Url, never from the request.
  redirect(302, locals.auth.startSignIn(cookies), { external: true });
};
