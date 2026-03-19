
import { createLogger } from '@vitamin/shared'
import { createFdExecutor } from './fd'
import { createRipgrepExecutor } from './rg'
import type { BinaryTool } from './binary-executor'


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

	registerWithOptions(
		name: string, 
		options?: { preset?: string; category?: string; builtin?: boolean }
	): void {

	}

	unregister(tool: string): void {
		if (this.binaries.has(tool)) {
			this.binaries.delete(tool)
		} else {
			logger.warn(`Tool ${tool} is not registered, skipping`)
		}
	}

	async ensure(tool: string): Promise<BinaryTool> {
		if (this.binaries.has(tool)) {
			return this.binaries.get(tool) as BinaryTool;
		}

		throw new Error(`Tool ${tool} not found in registry`)
	}
}

export const createBinaryExecutorRegistry = (projectRoot: string): BinaryToolExecutorRegistry => {
	const registry = new BinaryToolExecutorRegistry()

	registry.register(createFdExecutor(projectRoot))
	registry.register(createRipgrepExecutor(projectRoot))

	return registry
}