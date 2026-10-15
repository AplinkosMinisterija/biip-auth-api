import jwt, { VerifyErrors } from 'jsonwebtoken';
import { App } from '../services/apps.service';
import { User } from '../services/users.service';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TYPE } from '../types/constants';

export function verifyToken(token: string) {
  return new Promise<User | App | undefined>((resolve, reject) => {
    // Pin the algorithm so a token can't be accepted under an unexpected alg
    // (algorithm-confusion hardening).
    jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ['HS256'] },
      (err: VerifyErrors | null, decoded?: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded);
        }
      },
    );
  });
}
export async function generateToken(payload: any, expiresIn: number = ACCESS_TOKEN_TTL_SECONDS) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn,
    algorithm: 'HS256',
  });
}

export interface TokenClaims {
  typ?: string;
  iat?: number;
  exp?: number;
}

export function isRefreshToken(claims: TokenClaims): boolean {
  return claims.typ === REFRESH_TOKEN_TYPE;
}

// Untyped refresh tokens stay in circulation until they expire; they are the
// untyped tokens that outlive an access token. Bearer auth does not reject them,
// because long-lived untyped service tokens are used as bearer credentials.
export function isUntypedRefreshToken(claims: TokenClaims): boolean {
  if (claims.typ || !claims.iat || !claims.exp) return false;
  return claims.exp - claims.iat > ACCESS_TOKEN_TTL_SECONDS;
}
