import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Vitest 前端单元测试配置：jsdom 环境 + @ 别名，与 vite.config.ts 保持一致的路径解析
// 注意：此文件不纳入 tsc 检查范围（tsconfig.node.json include 仅为 vite.config.ts）
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})