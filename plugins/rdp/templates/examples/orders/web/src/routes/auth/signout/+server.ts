// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// BFF entry: POST /auth/signout (a form post; the CSRF check in the hooks covers it).
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, locals }) => {
  await locals.auth.signOut(cookies, locals.trace.traceId);
  redirect(303, '/signed-out');
};
