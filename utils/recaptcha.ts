// Google reCAPTCHA check. The admin portal uses v2 (invisible), whose response has no `score`;
// a v3 response needs a score of at least 0.5. The secret and token go in the POST body.
export async function verifyCaptcha(token: string) {
  if (process.env.NODE_ENV === 'test') return true;
  if (!token || !process.env.RECAPTCHA_SECRET) return false;

  try {
    const response: any = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET,
        response: token,
      }).toString(),
    }).then((res: any) => res.json());

    if (!response?.success) return false;
    return response.score === undefined || response.score >= 0.5;
  } catch (e) {
    return false;
  }
}

// reCAPTCHA is required only when RECAPTCHA_SECRET is set, and only for ADMIN type apps
// (the admin portal sends a token; other apps have no reCAPTCHA and rely on login rate limiting).
export function captchaRequired(appType?: string) {
  return !!process.env.RECAPTCHA_SECRET && appType === 'ADMIN';
}
