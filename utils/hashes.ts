const crypto = require('crypto');

export function generateUUID() {
  return crypto.randomUUID().replace(/-/gi, '');
}

export function btoa(text: string) {
  return Buffer.from(text).toString('base64');
}

export function atob(text: string) {
  return Buffer.from(text, 'base64').toString();
}

export function objectToQueryStr(obj: Object) {
  return Object.entries(obj)
    .map(([key, value]) => {
      return `${key}=${value}`;
    })
    .join('&');
}

export function strQueryToObject(text: string) {
  return text.split('&').reduce((acc, i) => {
    const [key, value] = i.split('=');
    return { ...acc, [key]: value };
  }, {});
}

export function decodeString(text: string) {
  return strQueryToObject(atob(text));
}

export function generateSignature(query: string) {
  const queryBase64 = btoa(query);

  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(queryBase64)
    .digest('base64');
  return signature.replace(/\+|\//g, '-').replace(/=+$/, '');
}

export function validateHashAndSignature(hash?: string, signature?: string) {
  if (!hash || !signature) return {};
  hash = decodeURIComponent(hash);
  signature = decodeURIComponent(signature);
  const query = atob(hash); // decode

  if (signature !== generateSignature(query)) return {};

  return strQueryToObject(query);
}

export function generateHashAndSignatureQueryParams(obj: Object) {
  const query = objectToQueryStr(obj);
  const signature = generateSignature(query);
  const hash = btoa(query);

  return `h=${encodeURIComponent(hash)}&s=${encodeURIComponent(signature)}`;
}
