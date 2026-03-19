import { 
	BinaryToolExecutor, 
	type BinaryTool 
} from './binary-executor'

export class FdExecutor extends BinaryToolExecutor {
	public readonly name = 'fd'
	public readonly repository = 'sharkdp/fd'

	constructor(projectRoot: string) {
		super(projectRoot)
	}

	getAsset(
		version: string, 
		platform: string, 
		arch: string
	): string | null {
		if (platform === 'darwin') {
			const str = arch === 'arm64' ? 'aarch64' : 'x86_64'
			return `fd-v${version}-${str}-apple-darwin.tar.gz`
		} else if (platform === 'linux') {
			const str = arch === 'arm64' ? 'aarch64' : 'x86_64'
			return `fd-v${version}-${str}-unknown-linux-gnu.tar.gz`
		} else if (platform === 'win32') {
			const str = arch === 'arm64' ? 'aarch64' : 'x86_64'
			return `fd-v${version}-${str}-pc-windows-msvc.zi
			p`
		}
		return null
	}
}

export const createFdExecutor = (projectRoot: string): BinaryTool => {
  return new FdExecutor(projectRoot)
}