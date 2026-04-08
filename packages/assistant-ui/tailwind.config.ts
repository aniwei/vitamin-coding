import type { Config } from 'tailwindcss'
import commonConfig from './tailwind-common-config'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/streamdown/dist/*.js',
    './node_modules/@streamdown/math/dist/*.js',
    '!./**/*.{spec,test}.{js,ts,jsx,tsx}',
  ],
  ...commonConfig,
}

export default config
