import { type ToolBinary } from '../types'

export class Fd implements ToolBinary {
	name = 'fd'
	repository = 'sharkdp/fd'

	getAssetName(version: string, platform: string, architecture: string): string | null {
		if (platform === "darwin") {
			const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
			return `fd-v${version}-${archStr}-apple-darwin.tar.gz`;
		} else if (platform === "linux") {
			const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
			return `fd-v${version}-${archStr}-unknown-linux-gnu.tar.gz`;
		} else if (platform === "win32") {
			const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
			return `fd-v${version}-${archStr}-pc-windows-msvc.zip`;
		}
		return null
	}
}

export const createFdBinary = (): ToolBinary => {
  return new Fd()
}