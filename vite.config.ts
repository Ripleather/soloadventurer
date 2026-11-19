import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  base: '/soloadventurer/',
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: { main: 'index.html', probe: 'probe.html' },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
