/**
 * Optional narrative coaching on top of the deterministic analysis.
 *
 * This is opt-in per session and never automatic: it sends your session findings
 * to Anthropic's API, and that is your call to make each time, not a default.
 * The deterministic findings in `analysis.ts` are the source of truth — this only
 * rephrases them. If the request fails or no API key is configured, the results
 * screen is fully usable without it.
 */

export interface CoachResult {
  text: string | null
  error: string | null
}

export async function requestCoaching(payload: unknown): Promise<CoachResult> {
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = (await res.json()) as { text?: string; error?: string }
    if (!res.ok) return { text: null, error: data.error ?? `Request failed (${res.status})` }
    return { text: data.text ?? null, error: null }
  } catch {
    return { text: null, error: 'Could not reach the local dev server.' }
  }
}
