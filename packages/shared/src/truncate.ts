export interface TruncatedResult {
	// content 可能是完整内容，也可能是被截断的内容，取决于是否超过限制
	content: string 
	// 是否发生了截断
	truncated: boolean 
	// 哪个限制被触发: "lines", "bytes", 先判断是否有截断
	truncatedBy: 'lines' | 'bytes'
	// 原始内容的总行数
	totalLines: number
	// 原始内容的总字节数
	totalBytes: number
	// 截断输出的完整行数
	outputLines: number
	// 截断输出的字节数
	outputBytes: number
	// 最后一行是否被部分截断（仅适用于尾部截断的边缘情况）
	lastLinePartial: boolean
	// 第一行是否超过字节限制（用于头部截断）
	firstLineExceedsLimit: boolean
	// 使用的行数限制
	options: TruncateOptions
}


export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes}B`
	} else if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)}KB`
	} else {
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
	}
}

export interface TruncateOptions {
	maxLines: number
	maxBytes: number
}

function createResult(params: {
	content: string
	truncated: boolean
	truncatedBy: 'lines' | 'bytes'
	totalLines: number
	totalBytes: number
	lastLinePartial: boolean
	firstLineExceedsLimit: boolean
	options: TruncateOptions
	outputLines?: number
	outputBytes?: number
}): TruncatedResult {
	const bytes = params.outputBytes ?? Buffer.byteLength(params.content, 'utf-8')
	const lines = params.outputLines ?? params.content.split('\n').length

	return {
		content: params.content,
		truncated: params.truncated,
		truncatedBy: params.truncatedBy,
		totalLines: params.totalLines,
		totalBytes: params.totalBytes,
		outputLines: lines,
		outputBytes: bytes,
		lastLinePartial: params.lastLinePartial,
		firstLineExceedsLimit: params.firstLineExceedsLimit,
		options: params.options,
	}
}

export function truncateHead(
	content: string, 
	options: TruncateOptions
): TruncatedResult {
	const { maxLines, maxBytes } = options

	const totalBytes = Buffer.byteLength(content, 'utf-8')
	const lines = content.split('\n')
	const totalLines = lines.length

	// 如果内容行数和字节数都在限制内，直接返回原内容和相关信息
	if (lines.length <= maxLines && totalBytes <= maxBytes) {
		return createResult({
			content,
			truncated: false,
			truncatedBy: 'lines',
			totalLines,
			totalBytes,
			lastLinePartial: false,
			firstLineExceedsLimit: false,
			options: { maxLines, maxBytes },
			outputLines: totalLines,
			outputBytes: totalBytes,
		})
	}

	if (maxLines === 0) {
		return createResult({
			content: '',
			truncated: true,
			truncatedBy: 'lines',
			totalLines,
			totalBytes,
			lastLinePartial: false,
			firstLineExceedsLimit: false,
			options: { maxLines, maxBytes },
			outputLines: 0,
			outputBytes: 0,
		})
	}

	// 如果第一行就超过字节限制，直接返回空内容并标记为被字节限制截断
	const bytes = Buffer.byteLength(lines[0] as string, 'utf-8')
	if (bytes > maxBytes) {
		return createResult({
			content: '',
			truncated: true,
			truncatedBy: 'bytes',
			totalLines,
			totalBytes,
			lastLinePartial: false,
			firstLineExceedsLimit: true,
			options: { maxLines, maxBytes },
			outputLines: 0,
			outputBytes: 0,
		})
	}

	// 先按行数限制截断，再按字节数限制截断
	const outputLines: string[] = []
	let outputBytes = 0
	let truncatedBy: 'lines' | 'bytes' = 'lines'

	for (let i = 0; i < lines.length && i < maxLines; i++) {
		const line = lines[i] as string
		const lineBytes = Buffer.byteLength(line, 'utf-8') + (outputLines.length > 0 ? 1 : 0)

		if (outputBytes + lineBytes > maxBytes) {
			truncatedBy = 'bytes'
			break
		}

		outputLines.push(line)
		outputBytes += lineBytes
	}

	// If we exited due to line limit
	if (outputLines.length >= maxLines && outputBytes <= maxBytes) {
		truncatedBy = 'lines'
	}

	const output = outputLines.join('\n')

	return createResult({
		content: output,
		truncated: true,
		truncatedBy,
		totalLines,
		totalBytes,
		lastLinePartial: false,
		firstLineExceedsLimit: false,
		options: { maxLines, maxBytes },
		outputLines: outputLines.length,
		outputBytes,
	})
}

// 截断内容从尾部（保留最后 N 行/字节），适用于 bash 输出等场景，优先保留行完整性但在极端情况下可能返回部分第一行
export function truncateTail(
	content: string, 
	options: TruncateOptions
): TruncatedResult {
	const { maxLines, maxBytes } = options

	const totalBytes = Buffer.byteLength(content, 'utf-8')
	const lines = content.split('\n')
	const totalLines = lines.length

	// 不需要截断，直接返回原内容和相关信息
	if (totalLines <= maxLines && totalBytes <= maxBytes) {
		return createResult({
			content,
			truncated: false,
			truncatedBy: 'lines',
			totalLines,
			totalBytes,
			lastLinePartial: false,
			firstLineExceedsLimit: false,
			options: { maxLines, maxBytes },
			outputLines: totalLines,
			outputBytes: totalBytes,
		})
	}

	if (maxLines === 0) {
		return createResult({
			content: '',
			truncated: true,
			truncatedBy: 'lines',
			totalLines,
			totalBytes,
			lastLinePartial: false,
			firstLineExceedsLimit: false,
			options: { maxLines, maxBytes },
			outputLines: 0,
			outputBytes: 0,
		})
	}

	const outputLines: string[] = []
	let outputBytesCount = 0
	let truncatedBy: 'lines' | 'bytes' = 'lines'
	let lastLinePartial = false

	for (let i = lines.length - 1; i >= 0 && outputLines.length < maxLines; i--) {
		const line = lines[i] as string
		const lineBytes = Buffer.byteLength(line, 'utf-8') + (outputLines.length > 0 ? 1 : 0)

		if (outputBytesCount + lineBytes > maxBytes) {
			truncatedBy = 'bytes'
			
			if (outputLines.length === 0) {
				const truncatedLine = truncateStringToBytesFromEnd(line, maxBytes)
				if (truncatedLine.length > 0) {
					outputLines.unshift(truncatedLine)
					outputBytesCount = Buffer.byteLength(truncatedLine, 'utf-8')
					lastLinePartial = true
				}
			}
			break
		}

		outputLines.unshift(line)
		outputBytesCount += lineBytes
	}

	if (outputLines.length >= maxLines && outputBytesCount <= maxBytes) {
		truncatedBy = 'lines'
	}

	const output = outputLines.join('\n')

	return createResult({
		content: output,
		truncated: true,
		truncatedBy,
		totalLines,
		totalBytes,
		lastLinePartial,
		firstLineExceedsLimit: false,
		options: { maxLines, maxBytes },
		outputLines: outputLines.length,
		outputBytes: outputBytesCount,
	})
}

// 从字符串末尾截断到指定字节数，确保不破坏 UTF-8 字符边界
function truncateStringToBytesFromEnd(string: string, maxBytes: number): string {
	const buffer = Buffer.from(string, 'utf-8')
	if (buffer.length <= maxBytes) {
		return string
	}

	let start = buffer.length - maxBytes

	while (start < buffer.length) {
		const byte = buffer[start]
		if (byte === undefined || (byte & 0xc0) !== 0x80) {
			break
		}

		start++
	}

	return buffer.subarray(start).toString('utf-8')
}

// 截断单行文本（适用于 grep 等工具输出中单行过长的情况）
export function truncateLine(
	line: string,
	maxChars: number,
): { text: string; wasTruncated: boolean } {
	if (line.length <= maxChars) {
		return { text: line, wasTruncated: false }
	}
	return { text: `${line.slice(0, maxChars)}... [truncated]`, wasTruncated: true }
}
