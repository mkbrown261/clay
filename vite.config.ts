import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'

// Two build modes:
//   CLIENT=1 vite build   -> bundles the three.js client app into public/static/
//   vite build            -> builds the Hono server into dist/ (Cloudflare Pages)
const isClient = process.env.CLIENT === '1'

export default defineConfig(
  isClient
    ? {
        build: {
          outDir: 'public/static',
          emptyOutDir: false,
          target: 'esnext',
          assetsInlineLimit: 0,
          lib: {
            entry: 'client/main.ts',
            formats: ['es'],
            fileName: () => 'clay.js'
          },
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
              assetFileNames: 'clay.[ext]',
              entryFileNames: 'clay.js'
            }
          }
        }
      }
    : {
        plugins: [
          build(),
          devServer({
            adapter,
            entry: 'src/index.tsx'
          })
        ]
      }
)
