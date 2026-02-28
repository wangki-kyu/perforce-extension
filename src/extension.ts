import * as vscode from 'vscode';
import * as fs from 'fs';
import { execSync } from 'child_process';

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

async function isFileInPerforce(filePath: string): Promise<boolean> {
  try {
    // Use p4 fstat to check if file is in Perforce
    const result = execSync(`p4 fstat "${filePath}"`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return result.trim().length > 0;
  } catch (error) {
    // File is not in Perforce or p4 command failed
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
      vscode.window.showErrorMessage('Failed to run Perforce edit. Please check your Perforce login and configuration.');
      return false;
    }
  }
}

async function executePerforceAdd(fileUri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.commands.executeCommand('perforce.add', fileUri);
    return true;
  } catch (error) {
    try {
      await vscode.commands.executeCommand('perforce.menuFunctionAdd', fileUri);
      return true;
    } catch (error2) {
      vscode.window.showErrorMessage('Failed to run Perforce add. Please check your Perforce login and configuration.');
      return false;
    }
  }
}

async function executePerforceDelete(fileUri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.commands.executeCommand('perforce.delete', fileUri);
    return true;
  } catch (error) {
    try {
      await vscode.commands.executeCommand('perforce.menuFunctionDelete', fileUri);
      return true;
    } catch (error2) {
      vscode.window.showErrorMessage('Failed to run Perforce delete. Please check your Perforce login and configuration.');
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
    const config = vscode.workspace.getConfiguration('perforceExtension');
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
          `${fileName} is read-only. Do you want to edit it in Perforce?`,
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

  // Listen for file creation
  const createDisposable = vscode.workspace.onDidCreateFiles(async (event) => {
    const config = vscode.workspace.getConfiguration('perforceExtension');
    if (!config.get('enabled', true)) return;

    for (const file of event.files) {
      const fileName = file.fsPath.split(/[\\/]/).pop() || file.fsPath;
      const result = await vscode.window.showWarningMessage(
        `Do you want to add ${fileName} to Perforce?`,
        { modal: true },
        'Yes',
        'No'
      );

      if (result === 'Yes') {
        await executePerforceAdd(file);
      }
    }
  });

  // Listen for file deletion (before files are actually deleted)
  const deleteDisposable = vscode.workspace.onWillDeleteFiles(async (event) => {
    const config = vscode.workspace.getConfiguration('perforceExtension');
    if (!config.get('enabled', true)) return;

    // Process all files that are in Perforce
    event.waitUntil(
      (async () => {
        for (const file of event.files) {
          const inPerforce = await isFileInPerforce(file.fsPath);
          if (!inPerforce) continue;

          const fileName = file.fsPath.split(/[\\/]/).pop() || file.fsPath;

          const result = await vscode.window.showWarningMessage(
            `Do you want to delete ${fileName} from Perforce?`,
            { modal: true },
            'Yes',
            'No'
          );

          if (result === 'Yes') {
            // Execute p4 delete BEFORE file is deleted from workspace
            await executePerforceDelete(file);
          } else {
            // User clicked No - cancel the deletion
            throw new Error('File deletion cancelled by user');
          }
        }
      })()
    );
  });

  context.subscriptions.push(typeDisposable);
  context.subscriptions.push(createDisposable);
  context.subscriptions.push(deleteDisposable);

  console.log('Perforce Auto Edit extension is now active');
}

export function deactivate() {
  console.log('Perforce Auto Edit extension is now deactivated');
}
