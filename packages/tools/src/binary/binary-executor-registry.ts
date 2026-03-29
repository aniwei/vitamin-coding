
import { createLogger } from '@vitamin/shared'
import { createFindExecutor } from './find'
import { createRipgrepExecutor } from './ripgrep'
import { BinaryToolExecutor, type BinaryTool } from './binary-executor'


const logger = createLogger('@vitamin/tools:binary-executor-registry')

export class BinaryToolExecutorRegistry {
	private binaries: Map<string, BinaryTool> = new Map()

	has(tool: string): boolean {
		return this.binaries.has(tool);
	}

	get(tool: string): BinaryTool | undefined {
		return this.binaries.get(tool)
	}

	register(tool: BinaryTool): void {
		if (!this.binaries.has(tool.name)) {
			this.binaries.set(tool.name, tool)
		} else {
			logger.warn(`Tool ${tool.name} is already registered, skipping`)
		}
	}

	// 为已注册的二进制工具更新配置选项
	registerWithOptions(
		name: string, 
		options?: { preset?: string; category?: string; builtin?: boolean }
	): void {
		const tool = this.binaries.get(name)
		if (!tool) {
			logger.warn(`Tool ${name} is not registered, cannot apply options`)
			return
		}
		// 选项记录在 metadata 中，供工具注册表查询
		if (options) {
			;(tool as unknown as Record<string, unknown>).__metadata = options
		}
	}

	unregister(tool: string): void {
		if (this.binaries.has(tool)) {
			this.binaries.delete(tool)
		} else {
			logger.warn(`Tool ${tool} is not registered, skipping`)
		}
	}

	async ensureAll(): Promise<void> {
		for (const tool of this.binaries.values()) {
			if (tool instanceof BinaryToolExecutor) {
				await tool.ensure()
			}
		}
	}

	async ensure(tool: string): Promise<BinaryTool> {
		const binary = this.binaries.get(tool)
		if (!binary) {
			throw new Error(`Tool ${tool} not found in registry`)
		}

		if (binary instanceof BinaryToolExecutor) {
			await binary.ensure()
		}

		return binary
	}
}

export const createBinaryToolExecutorRegistry = (projectRoot: string): BinaryToolExecutorRegistry => {
	const registry = new BinaryToolExecutorRegistry()

	registry.register(createFindExecutor(projectRoot))
	registry.register(createRipgrepExecutor(projectRoot))

	return registry
}