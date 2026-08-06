import { Hono } from 'hono'

export type WorkerBindings = {
  DB: D1Database
  AVATARS: R2Bucket
  THUMBNAILS: R2Bucket
  SESSION_SECRET: string
  TURNSTILE_SECRET_KEY: string
  TURNSTILE_SITE_KEY: string
  ADMINS: string
}

const app = new Hono<{ Bindings: WorkerBindings }>()

const auth = new Hono<{ Bindings: WorkerBindings }>()

auth.get('/health', (c) => c.json({ status: 'ok' }))

auth.get('/turnstile-sitekey', (c) => {
  const siteKey = c.env.TURNSTILE_SITE_KEY
  if (!siteKey) {
    return c.json({ error: 'Turnstile site key not configured' }, 500)
  }
  return c.json({ siteKey })
})

app.route('/auth', auth)

export default app
