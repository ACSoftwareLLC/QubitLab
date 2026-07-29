import { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; username: string; pfp_key: string | null } | null;
  }
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: { id: string; username: string; pfp_key: string | null };
}
