// Types
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

// Constants
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

// Client
export { LSPClient, lspManager, validateCwd } from './lsp-client'

// Config
export {
  getLanguageId,
  isServerInstalled,
  findServerForExtension,
  getAllServers,
  getConfigPaths,
} from './server-config'

// Wrapper
export { withLspClient, findWorkspaceRoot, formatServerLookupError } from './lsp-wrapper'

// Formatters
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

// Workspace edit
export { uriToPath, applyWorkspaceEdit } from './workspace-edit'
export type { ApplyResult } from './workspace-edit'

// Tool factories
export { createLspDefinition } from './definition'
export { createLspReferences } from './references'
export { createLspSymbols } from './symbols'
export { createLspDiagnostics } from './diagnostics'
export { createLspPrepareRename, createLspRename } from './rename'
