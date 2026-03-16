import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { v5 } from 'uuid'

export function createTempLoggerPath(): string {
	const id = v5(Date.now().toString(), v5.URL);
	return join(tmpdir(), `vitamin-coding-${id}.log`);
}
