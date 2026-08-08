import { defineConfig } from 'vite'
import { analyzePlugin } from './server/analyzePlugin'

export default defineConfig({
  plugins: [analyzePlugin()],
  // strictPort matters more than the number. Vite's default is to silently walk to
  // the next free port, and because localStorage is scoped per origin *including the
  // port*, a session served on :5181 cannot see the calibration saved on :5180 — you
  // just get sent back through the wizard with no explanation. Failing loudly on a
  // busy port is far better than quietly serving from a different storage bucket.
  server: { port: 5183, strictPort: true },
})
