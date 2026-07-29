import { FastifyReply, FastifyRequest } from 'fastify';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) {
    reply.code(401);
    return reply.send({ error: 'Unauthorized' });
  }
}
