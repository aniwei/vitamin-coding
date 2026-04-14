import path from 'node:path'
import { access, appendFile, mkdir, open, readdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseXml, XmlElement, XmlNode, type JsonObject } from '@rgrove/parse-xml'
import { camelCase, template } from 'es-toolkit/compat'
import type { FileHandle } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iconsDir = path.resolve(__dirname, '../src/components/icons')
const assetsDir = path.resolve(__dirname, '../assets')

type SvgData = {
  icon: JsonObject
  name: string
}

const mkdirp = async (currentPath: string): Promise<void> => {
  try {
    await mkdir(currentPath, { recursive: true })
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error))
  }
}

const cleanIconsDir = async (): Promise<void> => {
  const entries = await readdir(iconsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isFile() && entry.name === 'IconBase.tsx')
      continue

    await rm(path.resolve(iconsDir, entry.name), { recursive: true, force: true })
  }
}

const processSvgStructure = (svgStructure: XmlElement, replaceFillOrStrokeColor: boolean): void => {
  svgStructure.children = svgStructure.children.filter(child => child.type !== XmlNode.TYPE_TEXT)

  svgStructure.children.forEach((child) => {
    if (!(child instanceof XmlElement))
      return

    if (child.name === 'path' && replaceFillOrStrokeColor) {
      if (child.attributes.stroke) {
        child.attributes.stroke = 'currentColor'
      }

      if (child.attributes.fill) {
        child.attributes.fill = 'currentColor'
      }
    }

    processSvgStructure(child, replaceFillOrStrokeColor)
  })
}

const createSVGComponent = async (
  fileHandle: FileHandle,
  entry: string,
  relativeSegments: string[],
  replaceFillOrStrokeColor: boolean,
): Promise<void> => {
  const currentPath = path.resolve(iconsDir, ...relativeSegments)

  try {
    await access(currentPath)
  } catch {
    await mkdirp(currentPath)
  }

  const svgString = await fileHandle.readFile({ encoding: 'utf8' })
  const svgDoc = parseXml(svgString)
  const svgStructure = svgDoc.root

  if (!svgStructure)
    throw new Error(`SVG root element is missing: ${entry}`)

  processSvgStructure(svgStructure, replaceFillOrStrokeColor)
  const prefixFileName = camelCase(entry.split('.')[0])
  const fileName = prefixFileName.charAt(0).toUpperCase() + prefixFileName.slice(1)
  const svgData: SvgData = {
    icon: svgStructure.toJSON(),
    name: fileName,
  }

  const componentRender = template(`
import * as React from 'react'
import data from './<%= svgName %>.json'
import IconBase from '@/components/icons/IconBase'
import type { IconData } from '@/components/icons/IconBase'

export const <%= svgName %> = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  ref?: React.RefObject<React.RefObject<HTMLOrSVGElement>>;
}) => <IconBase {...props} ref={ref} data={data as IconData} />

<%= svgName %>.displayName = '<%= svgName %>'

export default <%= svgName %>
`.trim())

  await writeFile(path.resolve(currentPath, `${fileName}.json`), `${JSON.stringify(svgData, null, '\t')}\n`)
  await writeFile(path.resolve(currentPath, `${fileName}.tsx`), `${componentRender({ svgName: fileName })}\n`)

  const indexingRender = template(`
export { <%= svgName %> } from './<%= svgName %>'
`.trim())

  await appendFile(path.resolve(currentPath, 'index.ts'), `${indexingRender({ svgName: fileName })}\n`)
}

const walk = async (
  basePath: string,
  entry: string,
  relativeSegments: string[],
  replaceFillOrStrokeColor: boolean,
): Promise<void> => {
  const currentPath = path.resolve(basePath, ...relativeSegments, entry)
  let fileHandle: FileHandle | undefined

  try {
    fileHandle = await open(currentPath)
    const stat = await fileHandle.stat()

    if (stat.isDirectory()) {
      const files = await readdir(currentPath)

      for (const file of files) {
        await walk(basePath, file, [...relativeSegments, entry], replaceFillOrStrokeColor)
      }
    }

    if (stat.isFile() && /.+\.svg$/.test(entry)) {
      await createSVGComponent(fileHandle, entry, relativeSegments, replaceFillOrStrokeColor)
    }
  } finally {
    await fileHandle?.close()
  }
}

const walkFromRoot = async (basePath: string, replaceFillOrStrokeColor: boolean): Promise<void> => {
  const entries = await readdir(basePath)

  for (const entry of entries) {
    await walk(basePath, entry, [], replaceFillOrStrokeColor)
  }
}

(async () => {
  await cleanIconsDir()
  await walkFromRoot(assetsDir, false)
})()
