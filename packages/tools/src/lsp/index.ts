// 类型
export type {
  LSPServerConfig,
  Position,
  Range,
  Location,
  LocationLink,
  SymbolInfo,
  DocumentSymbol,
  Diagnostic,
  TextDocumentIdentifier,
  VersionedTextDocumentIdentifier,
  TextEdit,
  TextDocumentEdit,
  CreateFile,
  RenameFile,
  DeleteFile,
  WorkspaceEdit,
  PrepareRenameResult,
  PrepareRenameDefaultBehavior,
  ServerLookupInfo,
  ServerLookupResult,
  ResolvedServer,
} from './types'

// 常量
export {
  SYMBOL_KIND_MAP,
  SEVERITY_MAP,
  EXT_TO_LANG,
  DEFAULT_MAX_REFERENCES,
  DEFAULT_MAX_SYMBOLS,
  DEFAULT_MAX_DIAGNOSTICS,
  LSP_INSTALL_HINTS,
  BUILTIN_SERVERS,
} from './constants'

// 客户端
export { LSPClient, lspManager, validateCwd } from './lsp-client'

// 配置
export {
  getLanguageId,
  isServerInstalled,
  findServerForExtension,
  getAllServers,
  getConfigPaths,
} from './server-config'

// 封装层
export { withLspClient, findWorkspaceRoot, formatServerLookupError } from './lsp-wrapper'

// 格式化工具
export {
  formatLocation,
  formatSymbolKind,
  formatSeverity,
  formatDocumentSymbol,
  formatSymbolInfo,
  formatDiagnostic,
  filterDiagnosticsBySeverity,
  formatPrepareRenameResult,
  formatTextEdit,
  formatWorkspaceEdit,
  formatApplyResult,
} from './lsp-formatters'

// Workspace 编辑
export { uriToPath, applyWorkspaceEdit } from './workspace-edit'
export type { ApplyResult } from './workspace-edit'

// 工具工厂函数
export { createLspDefinition } from './definition'
export { createLspReferences } from './references'
export { createLspSymbols } from './symbols'
export { createLspDiagnostics } from './diagnostics'
export { createLspPrepareRename, createLspRename } from './rename'
