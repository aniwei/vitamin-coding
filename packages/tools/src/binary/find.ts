import os from 'os'
import { 
	BinaryToolExecutor, 
	type BinaryTool 
} from './binary-executor'

function resolveUrl(repository: string, version: string, asset: string): string {
  return `https://github.com/${repository}/releases/download/v${version}/${asset}`
}

export class FindExecutor extends BinaryToolExecutor {
	public readonly name = 'fd'
	public readonly version = '10.4.2'
	public readonly repository = 'sharkdp/fd'

	constructor(projectRoot: string) {
		super(projectRoot)
	}

	resolveUrl(): string | undefined {
		const platform = os.platform()
    const arch = os.arch()
		switch (platform) {
			case 'darwin': {
				return arch === 'arm64'
					? resolveUrl(this.repository, this.version, `fd-v${this.version}-aarch64-apple-darwin.tar.gz`)
					: resolveUrl(this.repository, this.version, `fd-v${this.version}-x86_64-apple-darwin.tar.gz`)
			}
			case 'linux': {
				return arch === 'arm64'
					? resolveUrl(this.repository, this.version, `fd-v${this.version}-aarch64-unknown-linux-gnu.tar.gz`)
					: resolveUrl(this.repository, this.version, `fd-v${this.version}-x86_64-unknown-linux-gnu.tar.gz`)
			}  
			case 'win32': {
				return arch === 'arm64'
					? resolveUrl(this.repository, this.version, `fd-v${this.version}-aarch64-pc-windows-msvc.zip`)
					: resolveUrl(this.repository, this.version, `fd-v${this.version}-x86_64-pc-windows-msvc.zip`)
			}
		}

		throw new Error(`Unsupported platform/architecture: ${platform}/${arch}`)
	}
}

export const createFindExecutor = (projectRoot: string): BinaryTool => {
  return new FindExecutor(projectRoot)
}