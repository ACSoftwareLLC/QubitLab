import { FastifyRequest } from 'fastify';

export interface SessionUser {
  id: string;
  username: string;
  pfp_key: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: SessionUser;
}
