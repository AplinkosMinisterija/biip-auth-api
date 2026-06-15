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

function signQuery(query: string, secret: string) {
  const signature = crypto.createHmac('sha256', secret).update(btoa(query)).digest('base64');
  return signature.replace(/\+|\//g, '-').replace(/=+$/, '');
}

export function generateSignature(query: string) {
  // always sign new links with the current secret
  return signQuery(query, process.env.JWT_SECRET);
}

export function validateHashAndSignature(hash?: string, signature?: string) {
  if (!hash || !signature) return {};
  hash = decodeURIComponent(hash);
  signature = decodeURIComponent(signature);
  const query = atob(hash); // decode

  // Accept the current secret and, during a rotation grace window, the previous
  // one — so invitation / password-reset links issued before the rotation stay
  // valid until they would normally expire.
  const accepted = [process.env.JWT_SECRET, process.env.JWT_SECRET_PREVIOUS]
    .filter((secret): secret is string => !!secret)
    .some((secret) => signature === signQuery(query, secret));
  if (!accepted) return {};

  return strQueryToObject(query);
}

export function generateHashAndSignatureQueryParams(obj: Object) {
  const query = objectToQueryStr(obj);
  const signature = generateSignature(query);
  const hash = btoa(query);

  return `h=${encodeURIComponent(hash)}&s=${encodeURIComponent(signature)}`;
}
