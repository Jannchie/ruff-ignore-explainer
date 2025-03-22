import type { RuffRule } from './rules'
import * as toml from '@iarna/toml'
import * as vscode from 'vscode'
import { prefixToLinterMap, rules } from './rules'
// Define decoration type
let ruleDecorator: vscode.TextEditorDecorationType

const outputChannel = vscode.window.createOutputChannel('Ruff Ignore Explainer')

// Activate extension
export function activate(context: vscode.ExtensionContext) {
  outputChannel.appendLine('Ruff Ignore Explainer is now active')

  // Create decorator type
  ruleDecorator = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 20px',
      color: new vscode.ThemeColor('editorInlayHint.foreground'),
      fontStyle: 'italic',
    },
    isWholeLine: false,
  })

  // Add editor change listener
  const activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      outputChannel.appendLine(`Active editor changed to ${editor.document.fileName}`)
      updateDecorations(editor)
    }
  })

  // Document content change listener
  const documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor
    if (editor && event.document === editor.document) {
      outputChannel.appendLine(`Document ${event.document.fileName} changed`)
      updateDecorations(editor)
    }
  })

  // Handle currently open editor
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor)
  }

  // Add all subscriptions to context
  context.subscriptions.push(
    activeEditorListener,
    documentChangeListener,
    ruleDecorator,
  )
}

// Update decorations
async function updateDecorations(editor: vscode.TextEditor) {
  // Only process pyproject.toml files
  if (!editor.document.fileName.endsWith('pyproject.toml')) {
    return
  }

  const document = editor.document
  const text = document.getText()

  try {
    // Parse TOML
    const config = toml.parse(text) as any

    // Check if [tool.ruff] config and ignore field exist
    if (!config.tool || !config.tool.ruff || !config.tool.ruff.ignore || !Array.isArray(config.tool.ruff.ignore)) {
      return
    }

    // Get list of ignored rules
    const ignoreRules = config.tool.ruff.ignore

    // Create decoration objects array
    const decorations: vscode.DecorationOptions[] = []

    // Find ignore rules in document
    for (const rule of ignoreRules) {
      // Find all instances of rule in document
      const rulePattern = new RegExp(`["']${rule}["']`)

      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i)
        const position = new vscode.Position(i, line.text.length)
        if (rulePattern.test(line.text)) {
          // Get rule explanation
          const role = findRule(rule)
          if (!role) {
            const linter = prefixToLinterMap.get(rule)
            const decoration: vscode.DecorationOptions = {
              range: new vscode.Range(position, position),
              renderOptions: {
                after: {
                  contentText: `${linter}`,
                },
              },
            }
            decorations.push(decoration)
            continue
          }
          // Create decoration
          const decoration: vscode.DecorationOptions = {
            range: new vscode.Range(position, position),
            renderOptions: {
              after: {
                contentText: `${role.name}`,
              },
            },
            hoverMessage: new vscode.MarkdownString(role.explanation),
          }

          decorations.push(decoration)
          break // Stop after finding first instance
        }
      }
    }

    outputChannel.appendLine(`Found ${decorations.length} ignore rules`)
    // Apply decorations
    editor.setDecorations(ruleDecorator, decorations)
  }
  catch (error) {
    console.error('Error parsing TOML or applying decorations:', error)
  }
}

function findRule(ruleCode: string): RuffRule | undefined {
  return rules.find(r => r.code === ruleCode)
}

// Deactivate extension
export function deactivate() {
  // Clean up decorator
  if (ruleDecorator) {
    ruleDecorator.dispose()
  }
}
