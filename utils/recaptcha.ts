export async function verifyCaptcha(token: string) {
  if (process.env.NODE_ENV === 'test') return true;
  if (!token) return false;

  const url = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET}&response=${token}`;
  const response = await fetch(url, {
    method: 'POST',
  }).then((res: any) => res.json());

  if (!response.success) return false;
  return response.score >= 0.5;
}
