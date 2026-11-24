import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Share the admin's .env (repo root): VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
  envDir: '..',
})
