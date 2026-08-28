import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: 'apps/web',
  base: '/hubbrmkt/', // GitHub Pages serve em github.io/hubbrmkt/, não na raiz
  server: {
    port: 3000,
  },
})
