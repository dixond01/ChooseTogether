import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from the root of the custom domain https://choosetogether.app/.
  base: '/',
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true, // fail instead of silently switching to another port
  },
})
