import jwt, { VerifyErrors } from 'jsonwebtoken';
import { App } from '../services/apps.service';
import { User } from '../services/users.service';

export function verifyToken(token: string) {
  return new Promise<User | App | undefined>((resolve, reject) => {
    jwt.verify(token, process.env.JWT_SECRET, (err: VerifyErrors | null, decoded?: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}
export async function generateToken(payload: any, expiresIn: number = 60 * 60 * 24) {
  // default expires is 24 hours
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn,
  });
}
