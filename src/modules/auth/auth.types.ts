import type { JWTPayload } from 'jose';
import type { Request } from 'express';
import { Role } from './roles.enum';

export type AuthenticatedUser = JWTPayload & {
  sub: string;
  email: string;
  roles: Role[];
  authzVersion: number;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export type IssuedSession = {
  accessToken: string;
  accessExpiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
};

export type AuthenticationResult = IssuedSession | {
  mfaRequired: true;
  challengeToken: string;
  expiresIn: number;
};
