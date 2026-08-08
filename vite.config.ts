import { defineConfig } from 'vite'
import { analyzePlugin } from './server/analyzePlugin'

export default defineConfig({
  plugins: [analyzePlugin()],
  server: { port: 5180 },
})
