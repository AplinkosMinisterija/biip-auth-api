import jwt, { VerifyErrors } from 'jsonwebtoken';
import { App } from '../services/apps.service';
import { User } from '../services/users.service';

// Secrets accepted on verify, current first. JWT_SECRET_PREVIOUS lets us roll
// JWT_SECRET with a grace window: tokens signed with the old secret keep
// verifying until they expire, so a rotation logs nobody out. Empty/unset is
// ignored. Signing always uses the current secret only.
function acceptedSecrets(): string[] {
  return [process.env.JWT_SECRET, process.env.JWT_SECRET_PREVIOUS].filter(
    (secret): secret is string => !!secret,
  );
}

export function verifyToken(token: string) {
  return new Promise<User | App | undefined>((resolve, reject) => {
    const secrets = acceptedSecrets();
    // Pin the algorithm so a token can't be accepted under an unexpected alg
    // (algorithm-confusion hardening).
    const tryVerify = (index: number) => {
      jwt.verify(
        token,
        secrets[index],
        { algorithms: ['HS256'] },
        (err: VerifyErrors | null, decoded?: any) => {
          if (!err) return resolve(decoded);
          // Fall back to the previous secret during a rotation grace window.
          if (index + 1 < secrets.length) return tryVerify(index + 1);
          reject(err);
        },
      );
    };
    tryVerify(0);
  });
}
export async function generateToken(payload: any, expiresIn: number = 60 * 60 * 24) {
  // default expires is 24 hours; always sign with the current secret
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn,
    algorithm: 'HS256',
  });
}
