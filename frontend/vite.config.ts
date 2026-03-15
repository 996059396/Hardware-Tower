import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // 发现新版本代码时自动静默更新
      includeAssets: ['favicon.svg', 'fonts/*.woff2'], // 确保额外静态资源被识别
      manifest: {
        name: '硬件攻城狮通天塔',
        short_name: '硬核通天塔',
        description: '硬核硬件工程面试与刷题系统',
        theme_color: '#242424',
        background_color: '#242424',
        display: 'standalone', // 隐藏浏览器地址栏，呈现沉浸式 App 形态
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // 🚀 核心缓存策略：明确告诉 SW 缓存所有代码、图片、题库(json)和数学字体(woff2)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff,woff2,ttf}'],
        // 允许缓存较大的文件（防范日后题库体积变大）
        maximumFileSizeToCacheInBytes: 5000000 
      }
    })
  ],
})