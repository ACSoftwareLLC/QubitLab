import { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) {
    reply.code(401);
    return reply.send({ error: 'Unauthorized' });
  }
  if (!config.admins.includes(req.user.username)) {
    reply.code(403);
    return reply.send({ error: 'Forbidden' });
  }
}
