import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Dedicated port for the TeamMatch demo so it doesn't collide with other
    // projects running on Vite's default 5173.
    port: 5180,
    open: true,
  },
  preview: {
    port: 5180,
  },
})
