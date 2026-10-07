import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'icon.svg',
        'icon-192.png',
        'icon-512.png',
        'apple-touch-icon.png',
        'dictionaries.json',
      ],
      manifest: {
        name: 'Алиас',
        short_name: 'Алиас',
        lang: 'ru',
        description: 'Алиас с личным счётом. Игра работает офлайн.',
        theme_color: '#f5f3ef',
        background_color: '#f5f3ef',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
