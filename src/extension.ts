import type { RuffRule } from './rules'
import * as toml from '@iarna/toml'
import * as vscode from 'vscode'
import { prefixToLinterMap, rules } from './rules'
// Define decoration type
let ruleDecorator: vscode.TextEditorDecorationType

const outputChannel = vscode.window.createOutputChannel('Ruff Ignore Explainer')

function kebabToTitleCase(str: string): string {
  return str
    .replace(/-/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase())
}

// Activate extension
export function activate(context: vscode.ExtensionContext) {
  outputChannel.appendLine('Ruff Ignore Explainer is now active')

  // Create decorator type
  ruleDecorator = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 3px',
      color: new vscode.ThemeColor('editorInlayHint.foreground'),
      fontStyle: 'italic',
    },
    isWholeLine: false,
  })

  // Register hover provider for pyproject.toml files
  const hoverProvider = vscode.languages.registerHoverProvider({ language: 'toml', pattern: '**/pyproject.toml' }, {
    provideHover(document, position, _token) {
      // Get the word under cursor
      const range = document.getWordRangeAtPosition(position, /["'][A-Z0-9]+["']/)
      if (!range) {
        return null
      }

      // Extract the rule code from the text (removing quotes)
      const text = document.getText(range)
      const ruleCode = text.replace(/["']/g, '')

      // Find the rule information
      const rule = findRule(ruleCode)
      if (rule) {
        // Return hover with markdown explanation
        return new vscode.Hover(new vscode.MarkdownString(rule.explanation), range)
      }

      // If rule not found but recognized as a linter prefix
      const linter = prefixToLinterMap.get(ruleCode)
      if (linter) {
        return new vscode.Hover(`${linter} (No detailed explanation available)`, range)
      }

      return null
    },
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
    hoverProvider,
  )
}

// Update decorations
async function updateDecorations(editor: vscode.TextEditor) {
  // Only process pyproject.toml files
  if (!editor.document.fileName.endsWith('pyproject.toml')) {
    return
  }

  const { document } = editor
  const text = document.getText()

  try {
    // Parse TOML
    const config = toml.parse(text) as any

    // Check if [tool.ruff] config exists
    if (!config.tool || !config.tool.ruff) {
      return
    }

    // Get list of ignored and selected rules
    const ignoreRules = config.tool.ruff.ignore || []
    const selectRules = config.tool.ruff.select || []

    // Combine ignore and select rules
    const allRules = new Set([...ignoreRules, ...selectRules])

    // Create decoration objects array
    const decorations: vscode.DecorationOptions[] = []

    // For each rule in the combined list, find ALL occurrences in the document
    for (const rule of allRules) {
      // Find all instances of rule in document (with quotes)
      const rulePattern = new RegExp(`["']${rule}["']`, 'g')

      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i)
        const lineText = line.text

        // Look for matches of the rule in this line
        const matches = [...lineText.matchAll(rulePattern)]

        for (const match of matches) {
          if (match.index !== undefined) {
            // Calculate position at the end of the rule code (after the closing quote)
            const startPos = match.index + match[0].length
            const position = new vscode.Position(i, startPos)

            // Get rule info
            const ruleInfo = findRule(rule)

            if (!ruleInfo) {
              const linter = prefixToLinterMap.get(rule)
              if (linter) {
                const decoration: vscode.DecorationOptions = {
                  range: new vscode.Range(position, position),
                  renderOptions: {
                    after: {
                      contentText: ` (${kebabToTitleCase(linter)})`,
                    },
                  },
                }
                decorations.push(decoration)
              }
              continue
            }

            // Create decoration with rule name and hover explanation
            const decoration: vscode.DecorationOptions = {
              range: new vscode.Range(position, position),
              renderOptions: {
                after: {
                  contentText: ` (${kebabToTitleCase(ruleInfo.name)})`,
                },
              },
              hoverMessage: new vscode.MarkdownString(ruleInfo.explanation),
            }

            decorations.push(decoration)
          }
        }
      }
    }

    outputChannel.appendLine(`Applied ${decorations.length} decorations to ignore and select rules`)
    // Apply decorations
    editor.setDecorations(ruleDecorator, decorations)
  }
  catch (error) {
    console.error('Error parsing TOML or applying decorations:', error)
    outputChannel.appendLine(`Error: ${error}`)
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
