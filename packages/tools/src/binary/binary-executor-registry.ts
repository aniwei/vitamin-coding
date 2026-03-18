import chalk from 'chalk'
import extractZip from 'extract-zip'
import { spawnSync } from 'child_process'
import { 
	chmodSync, 
	existsSync, 
	mkdirSync, 
	readdirSync, 
	renameSync, 
	rmSync 
} from 'node:fs'
import { arch, platform } from 'node:os'
import { join } from 'path'
import type { BinaryTool } from '../types'


function findBinaryRecursively(rootDir: string, binaryFileName: string): string | null {
	const stack: string[] = [rootDir];

	while (stack.length > 0) {
		const currentDir = stack.pop();
		if (!currentDir) continue;

		const entries = readdirSync(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(currentDir, entry.name);
			if (entry.isFile() && entry.name === binaryFileName) {
				return fullPath;
			}
			if (entry.isDirectory()) {
				stack.push(fullPath);
			}
		}
	}

	return null;
}

// Download and install a tool
async function downloadTool(tool: "fd" | "rg"): Promise<string> {
	const config = TOOLS[tool];
	if (!config) throw new Error(`Unknown tool: ${tool}`);

	const plat = platform();
	const architecture = arch();

	// Get latest version
	const version = await getLatestVersion(config.repo);

	// Get asset name for this platform
	const assetName = config.getAssetName(version, plat, architecture);
	if (!assetName) {
		throw new Error(`Unsupported platform: ${plat}/${architecture}`);
	}

	// Create tools directory
	mkdirSync(TOOLS_DIR, { recursive: true });

	const downloadUrl = `https://github.com/${config.repo}/releases/download/${config.tagPrefix}${version}/${assetName}`;
	const archivePath = join(TOOLS_DIR, assetName);
	const binaryExt = plat === "win32" ? ".exe" : "";
	const binaryPath = join(TOOLS_DIR, config.binaryName + binaryExt);

	// Download
	await downloadFile(downloadUrl, archivePath);

	// Extract into a unique temp directory. fd and rg downloads can run concurrently
	// during startup, so sharing a fixed directory causes races.
	const extractDir = join(
		TOOLS_DIR,
		`extract_tmp_${config.binaryName}_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
	);
	mkdirSync(extractDir, { recursive: true });

	try {
		if (assetName.endsWith(".tar.gz")) {
			const extractResult = spawnSync("tar", ["xzf", archivePath, "-C", extractDir], { stdio: "pipe" });
			if (extractResult.error || extractResult.status !== 0) {
				const errMsg = extractResult.error?.message ?? extractResult.stderr?.toString().trim() ?? "unknown error";
				throw new Error(`Failed to extract ${assetName}: ${errMsg}`);
			}
		} else if (assetName.endsWith(".zip")) {
			await extractZip(archivePath, { dir: extractDir });
		} else {
			throw new Error(`Unsupported archive format: ${assetName}`);
		}

		// Find the binary in extracted files. Some archives contain files directly
		// at root, others nest under a versioned subdirectory.
		const binaryFileName = config.binaryName + binaryExt;
		const extractedDir = join(extractDir, assetName.replace(/\.(tar\.gz|zip)$/, ""));
		const extractedBinaryCandidates = [join(extractedDir, binaryFileName), join(extractDir, binaryFileName)];
		let extractedBinary = extractedBinaryCandidates.find((candidate) => existsSync(candidate));

		if (!extractedBinary) {
			extractedBinary = findBinaryRecursively(extractDir, binaryFileName) ?? undefined;
		}

		if (extractedBinary) {
			renameSync(extractedBinary, binaryPath);
		} else {
			throw new Error(`Binary not found in archive: expected ${binaryFileName} under ${extractDir}`);
		}

		// Make executable (Unix only)
		if (plat !== "win32") {
			chmodSync(binaryPath, 0o755);
		}
	} finally {
		// Cleanup
		rmSync(archivePath, { force: true });
		rmSync(extractDir, { recursive: true, force: true });
	}

	return binaryPath;
}


export class BinaryExecutorRegistry {
	private binaries: Map<string, BinaryTool> = new Map()

	has(tool: string): boolean {
		return this.binaries.has(tool);
	}

	get(tool: string): BinaryTool | undefined {
		return this.binaries.get(tool)
	}

	register(binary: BinaryTool): void {}
	registerWithOptions(binary: BinaryTool, options?: { preset?: string; category?: string; builtin?: boolean }): void {}
	unregister(tool: string): void {}

	async ensure(tool: string): Promise<BinaryTool> {
		if (this.binaries.has(tool)) {
			return this.binaries.get(tool) as BinaryTool;
		}

		throw new Error(`Tool ${tool} not found in registry`)
	}
}

export const createBinaryExecutorRegistry = (projectRoot: string): BinaryToolRegistry => {
	const registry = new BinaryExecutorRegistry()

	registry.register(createFdExecutor())
	registry.register(createRgExecutor())

	return registry
}