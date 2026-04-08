import { defineConfig, type Options } from 'tsup'

export const baseConfig: Options = {
  entry: ['src/index.ts'],
  format: ['esm'],
  // tsup 8.5.1 internally injects `baseUrl` via rollup-plugin-dts.
  // `ignoreDeprecations` is scoped here only to suppress that tool-level issue.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  target: 'node22',
  outDir: 'dist',
  splitting: false,
  treeshake: true,
}

export default defineConfig(baseConfig)
