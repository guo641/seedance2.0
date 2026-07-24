import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 柔和低对比暗色(非纯黑/纯白,护眼)
        ink: '#16181d', // 底
        panel: '#1c1f26', // 卡片面
        panel2: '#242833', // 悬浮/嵌套
        line: '#2b2f3a', // 柔和边框
        accent: '#7c83f3', // 去饱和靛蓝(点缀)
        accent2: '#5eb6ad', // 次点缀·柔和青
        danger: '#f0736b',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
