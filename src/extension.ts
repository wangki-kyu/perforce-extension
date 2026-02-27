import * as vscode from 'vscode';
import * as fs from 'fs';

function isReadOnly(document: vscode.TextDocument): boolean {
  try {
    const stats = fs.statSync(document.uri.fsPath);
    // Check if file is read-only (no write permission for owner)
    // On Windows, check the readonly attribute
    // On Unix, check if write permission bit is set
    return (stats.mode & 0o200) === 0;
  } catch {
    return false;
  }
}

async function executePerforceEdit(fileUri: vscode.Uri): Promise<boolean> {
  try {
    // Try the primary command name
    await vscode.commands.executeCommand('perforce.edit', fileUri);
    return true;
  } catch (error) {
    try {
      // Try alternative command name
      await vscode.commands.executeCommand('perforce.menuFunctionEdit', fileUri);
      return true;
    } catch (error2) {
      vscode.window.showErrorMessage('Failed to run Perforce edit command. Make sure Perforce for VS Code extension is installed.');
      return false;
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  let pendingPrompt: Promise<void> | null = null;
  const dismissedFiles = new Map<string, NodeJS.Timeout>();

  // Override the 'type' command to intercept text input
  const typeDisposable = vscode.commands.registerCommand('type', async (args: any) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      // No active editor, just type normally
      return vscode.commands.executeCommand('default:type', args);
    }

    const document = editor.document;
    const filePath = document.uri.fsPath;

    // Only process file:// scheme documents
    if (document.uri.scheme !== 'file') {
      return vscode.commands.executeCommand('default:type', args);
    }

    // Skip if extension is disabled
    const config = vscode.workspace.getConfiguration('perforceAutoEdit');
    if (!config.get('enabled', true)) {
      return vscode.commands.executeCommand('default:type', args);
    }

    // Check if file is read-only
    if (!isReadOnly(document)) {
      // File is not read-only, type normally
      return vscode.commands.executeCommand('default:type', args);
    }

    // File is read-only - show dialog
    // Skip if already dismissed in the last 100ms
    if (dismissedFiles.has(filePath)) {
      return; // Silently prevent typing
    }

    // Skip if a prompt is already pending
    if (pendingPrompt) {
      return;
    }

    // Show modal dialog
    pendingPrompt = (async () => {
      try {
        const fileName = document.fileName.split(/[\\/]/).pop() || document.fileName;
        const result = await vscode.window.showWarningMessage(
          `Do you want to edit ${fileName} in Perforce?`,
          { modal: true },
          'Yes',
          'No'
        );

        if (result === 'Yes') {
          const success = await executePerforceEdit(document.uri);
          if (success) {
            // File edit succeeded
            dismissedFiles.delete(filePath);

            // Reload the file to update readonly status
            setTimeout(async () => {
              try {
                // Close and reopen the file to refresh its state
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                await vscode.commands.executeCommand('vscode.open', document.uri);
              } catch (error) {
                // If reload fails, just show success message
                vscode.window.showInformationMessage(`File is now open for editing in Perforce`);
              }
            }, 500);
          }
        } else {
          // User clicked No or dismissed - mark file to ignore for a short duration
          const timeout = setTimeout(() => {
            dismissedFiles.delete(filePath);
          }, 100);
          dismissedFiles.set(filePath, timeout);
        }
      } finally {
        pendingPrompt = null;
      }
    })();
  });

  context.subscriptions.push(typeDisposable);

  console.log('Perforce Auto Edit extension is now active');
}

export function deactivate() {
  console.log('Perforce Auto Edit extension is now deactivated');
}
