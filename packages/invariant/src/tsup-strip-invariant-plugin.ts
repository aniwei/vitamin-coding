import { readFile } from 'node:fs/promises'
import ts from 'typescript'

type OnLoadArgs = {
  path: string
}

type OnLoadResult = {
  contents: string
  loader: 'ts'
}

type EsbuildLike = {
  onLoad(options: { filter: RegExp }, callback: (args: OnLoadArgs) => Promise<OnLoadResult>): void
}

type Plugin = {
  name: string
  setup(build: EsbuildLike): void
}

type StripInvariantPluginOptions = {
  filter: RegExp
  invariantImportSource?: string
}

function isProcessEnvNodeEnv(node: ts.Node): boolean {
  if (!ts.isPropertyAccessExpression(node)) return false
  if (node.name.text !== 'NODE_ENV') return false

  const envExpr = node.expression
  if (!ts.isPropertyAccessExpression(envExpr)) return false
  if (envExpr.name.text !== 'env') return false

  const processExpr = envExpr.expression
  return ts.isIdentifier(processExpr) && processExpr.text === 'process'
}

function isProductionGuard(node: ts.Expression): boolean {
  if (!ts.isBinaryExpression(node)) return false

  const isNotEqual =
    node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken

  if (!isNotEqual) return false
  if (!isProcessEnvNodeEnv(node.left)) return false

  return ts.isStringLiteral(node.right) && node.right.text === 'production'
}

function collectInvariantLocalNames(
  sourceFile: ts.SourceFile,
  invariantImportSource: string,
): Set<string> {
  const localNames = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (statement.moduleSpecifier.text !== invariantImportSource) continue

    const clause = statement.importClause
    if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue

    for (const element of clause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text
      if (importedName === 'invariant') {
        localNames.add(element.name.text)
      }
    }
  }

  return localNames
}

function containsInvariantCall(node: ts.Node, invariantLocalNames: Set<string>): boolean {
  let found = false

  const visit = (current: ts.Node) => {
    if (found) return

    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      invariantLocalNames.has(current.expression.text)
    ) {
      found = true
      return
    }

    ts.forEachChild(current, visit)
  }

  visit(node)
  return found
}

function stripInvariantFromImport(
  importDecl: ts.ImportDeclaration,
  invariantImportSource: string,
  factory: ts.NodeFactory,
): ts.ImportDeclaration | undefined {
  if (!ts.isStringLiteral(importDecl.moduleSpecifier)) return importDecl
  if (importDecl.moduleSpecifier.text !== invariantImportSource) return importDecl

  const clause = importDecl.importClause
  if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
    return importDecl
  }

  const remaining = clause.namedBindings.elements.filter((element) => {
    const importedName = element.propertyName?.text ?? element.name.text
    return importedName !== 'invariant'
  })

  if (remaining.length === clause.namedBindings.elements.length) {
    return importDecl
  }

  if (remaining.length === 0 && !clause.name) {
    return undefined
  }

  const updatedClause = factory.updateImportClause(
    clause,
    clause.isTypeOnly,
    clause.name,
    remaining.length > 0 ? factory.updateNamedImports(clause.namedBindings, remaining) : undefined,
  )

  return factory.updateImportDeclaration(
    importDecl,
    importDecl.modifiers,
    updatedClause,
    importDecl.moduleSpecifier,
    importDecl.attributes,
  )
}

function transformSource(source: string, fileName: string, invariantImportSource: string): string {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const invariantLocalNames = collectInvariantLocalNames(sourceFile, invariantImportSource)
  const transformed = ts.transform(sourceFile, [
    (context) => {
      const visit: ts.Visitor = (node) => {
        if (ts.isImportDeclaration(node)) {
          return stripInvariantFromImport(node, invariantImportSource, context.factory)
        }

        if (
          ts.isIfStatement(node) &&
          isProductionGuard(node.expression) &&
          containsInvariantCall(node.thenStatement, invariantLocalNames)
        ) {
          return node.elseStatement ?? undefined
        }

        return ts.visitEachChild(node, visit, context)
      }

      return (rootNode) => ts.visitNode(rootNode, visit) as ts.SourceFile
    },
  ])

  const updatedSourceFile = transformed.transformed[0] as ts.SourceFile
  const printer = ts.createPrinter()
  const output = `${printer.printFile(updatedSourceFile)}\n`
  transformed.dispose()

  return output
}

export function createStripInvariantInProductionPlugin(
  options: StripInvariantPluginOptions,
): Plugin {
  const invariantImportSource = options.invariantImportSource ?? '@vitamin/invariant'

  return {
    name: 'strip-invariant-in-production',
    setup(build) {
      build.onLoad({ filter: options.filter }, async (args) => {
        const source = await readFile(args.path, 'utf8')
        const transformed = transformSource(source, args.path, invariantImportSource)

        return {
          contents: transformed,
          loader: 'ts',
        }
      })
    },
  }
}
