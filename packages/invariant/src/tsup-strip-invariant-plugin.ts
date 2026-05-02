import { readFile } from 'node:fs/promises'

import { createStripInvariantInProductionPlugin as createRolldownStripInvariantPlugin } from './tsdown-strip-invariant-plugin'

type StripInvariantPluginOptions = {
  filter: RegExp
  invariantImportSource?: string
}

type EsbuildOnLoadArgs = { path: string }
type EsbuildOnLoadResult = { contents: string; loader: 'ts' }
type EsbuildBuild = {
  onLoad(
    options: { filter: RegExp },
    callback: (args: EsbuildOnLoadArgs) => Promise<EsbuildOnLoadResult>,
  ): void
}

export function createStripInvariantInProductionPlugin(options: StripInvariantPluginOptions) {
  const transformPlugin = createRolldownStripInvariantPlugin(options)

  return {
    name: transformPlugin.name,
    setup(build: EsbuildBuild): void {
      build.onLoad({ filter: options.filter }, async (args) => {
        const source = await readFile(args.path, 'utf8')
        const transformed = transformPlugin.transform(source, args.path)
        return {
          contents: transformed?.code ?? source,
          loader: 'ts',
        }
      })
    },
  }
}
