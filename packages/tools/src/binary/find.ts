import { 
	BinaryToolExecutor, 
	type BinaryTool 
} from './binary-executor'

export class FindExecutor extends BinaryToolExecutor {
	public readonly name = 'fd'
	public readonly repository = 'sharkdp/fd'

	constructor(projectRoot: string) {
		super(projectRoot)
	}

	resolveAsset(
		version: string, 
		platform: string, 
		arch: string
	): string | undefined {
		if (platform === 'darwin') {
			const str = arch === 'arm64' ? 'aarch64' : 'x86_64'
			return `fd-v${version}-${str}-apple-darwin.tar.gz`
		}
		
		if (platform === 'linux') {
			const str = arch === 'arm64' ? 'aarch64' : 'x86_64'
			return `fd-v${version}-${str}-unknown-linux-gnu.tar.gz`
		}  
		
		if (platform === 'win32') {
			const str = arch === 'arm64' ? 'aarch64' : 'x86_64'
			return `fd-v${version}-${str}-pc-windows-msvc.zip`
		}
	}
}

export const createFindExecutor = (projectRoot: string): BinaryTool => {
  return new FindExecutor(projectRoot)
}