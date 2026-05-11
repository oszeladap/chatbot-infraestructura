import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API requests to FastAPI during development
    proxy: {
      '/chat':           'http://localhost:8000',
      '/history':        'http://localhost:8000',
      '/profile':        'http://localhost:8000',
      '/health':         'http://localhost:8000',
      '/admin':          'http://localhost:8000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
