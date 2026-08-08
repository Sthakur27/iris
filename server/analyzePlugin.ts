import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Reads `KEY=value` pairs from a local secrets file into this Node process.
 *
 * `.api` is gitignored and never reaches the browser — the key is used only here,
 * inside the dev server. Values are read verbatim apart from trimming and stripping
 * one layer of surrounding quotes; nothing is logged.
 */
function loadSecrets(root: string, filenames: string[]): void {
  for (const name of filenames) {
    let contents: string
    try {
      contents = readFileSync(resolve(root, name), 'utf8')
    } catch {
      continue
    }
    for (const line of contents.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (key && !process.env[key]) process.env[key] = value
    }
  }
}

/**
 * Dev-server middleware for post-session coaching.
 *
 * The API key stays in this Node process and is never sent to the browser.
 * The alternative — calling Anthropic directly from the page with
 * `dangerouslyAllowBrowser` — would put the key in localStorage where any script
 * on the page can read it. This costs one Vite plugin and avoids that entirely.
 *
 * The page sends the *deterministic* findings produced by `src/ui/analysis.ts`,
 * not raw trial data. The model narrates and prioritises findings that plain
 * rules already established; it does not get to invent clinical conclusions.
 */

const SYSTEM = `You are a coach for a home vision therapy app called SidVision, used by one adult
training convergence and accommodative skills alone at home. They are a software engineer with no
optometry background.

You will be given deterministic findings computed from their session data, plus their goals. Your job
is to turn those findings into a short, plain-English debrief. You are narrating analysis that has
already been done — do not invent findings that are not in the input.

Rules:
- Never diagnose, and never estimate clinical measures the app cannot measure. It cannot measure eye
  position, near point of convergence, fusional ranges, or symptom scores.
- Reaction time is keyboard response time. It is a noisy proxy, not vergence velocity. Say so if you
  cite it.
- If integrity flags fired (guessing at chance, false alarms on catch trials, anticipatory responses),
  frame it as the demand being too high, never as the user cheating. The remedy is to lower difficulty.
- If a red flag is present (symptoms reported, or several sessions of decline), say plainly that they
  should book an eye exam, and do not pair it with advice to keep training.
- One session is never a trend. Say so when the data is a single session.
- Gloss any clinical term the first time you use it.

Format: 3 short paragraphs maximum, or fewer. Lead with the single most important thing. No headings,
no bullet lists, no praise, no filler.`

export function analyzePlugin(): Plugin {
  return {
    name: 'sidvision-analyze',
    configureServer(server) {
      loadSecrets(server.config.root, ['.api', '.env.local', '.env'])
      if (!process.env.ANTHROPIC_API_KEY) {
        server.config.logger.info(
          '[sidvision] No ANTHROPIC_API_KEY found in .api or .env — post-session coaching is disabled. Everything else works.',
        )
      }

      server.middlewares.use('/api/analyze', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('POST only')
          return
        }

        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
          res.statusCode = 503
          res.setHeader('content-type', 'application/json')
          res.end(
            JSON.stringify({
              error:
                'No ANTHROPIC_API_KEY in the dev server environment. Export it and restart `pnpm dev` to enable coaching. Everything else works without it.',
            }),
          )
          return
        }

        let body = ''
        for await (const chunk of req) body += chunk

        try {
          const client = new Anthropic({ apiKey })
          const message = await client.messages.create({
            model: 'claude-opus-5',
            max_tokens: 4000,
            system: SYSTEM,
            output_config: { effort: 'medium' },
            messages: [{ role: 'user', content: body }],
          })

          if (message.stop_reason === 'refusal') {
            res.statusCode = 502
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'The model declined to answer.' }))
            return
          }

          const text = message.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n')

          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ text }))
        } catch (err) {
          res.statusCode = 502
          res.setHeader('content-type', 'application/json')
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Coaching request failed.',
            }),
          )
        }
      })
    },
  }
}
