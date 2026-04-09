import { defineConfig, type UserConfig } from 'tsdown'

export const baseConfig: UserConfig = {
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  outDir: 'dist',
  treeshake: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
}

export default defineConfig(baseConfig)
