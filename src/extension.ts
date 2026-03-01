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
    const inPerforce = result.trim().length > 0;
    console.log(`[Perforce] isFileInPerforce("${filePath}"): ${inPerforce}`);
    return inPerforce;
  } catch (error) {
    // File is not in Perforce or p4 command failed
    console.log(`[Perforce] isFileInPerforce("${filePath}"): false (error: ${error})`);
    return false;
  }
}

async function isInPerforceWorkspace(filePath: string): Promise<boolean> {
  try {
    // Get workspace info using p4 info
    const infoResult = execSync(`p4 info`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`[Perforce] p4 info output:\n${infoResult}`);

    // Extract client root from p4 info output
    const clientRootMatch = infoResult.match(/Client root:\s*(.+)/);
    if (!clientRootMatch) {
      console.log(`[Perforce] isInPerforceWorkspace("${filePath}"): false (no client root found)`);
      return false;
    }

    const clientRoot = clientRootMatch[1].trim();
    console.log(`[Perforce] Extracted clientRoot: "${clientRoot}"`);

    // Check if the file is under the client root
    const normalizedFilePath = filePath.replace(/\\/g, '/').toLowerCase();
    const normalizedClientRoot = clientRoot.replace(/\\/g, '/').toLowerCase();

    console.log(`[Perforce] Normalized file path: "${normalizedFilePath}"`);
    console.log(`[Perforce] Normalized client root: "${normalizedClientRoot}"`);

    const inWorkspace = normalizedFilePath.startsWith(normalizedClientRoot);
    console.log(`[Perforce] isInPerforceWorkspace("${filePath}"): ${inWorkspace}`);
    return inWorkspace;
  } catch (error) {
    // Not in a Perforce workspace or p4 command failed
    console.log(`[Perforce] isInPerforceWorkspace("${filePath}"): false (error: ${error})`);
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
    console.log(`[Perforce] Executing p4 add for: ${fileUri.fsPath}`);
    execSync(`p4 add "${fileUri.fsPath}"`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const fileName = fileUri.fsPath.split(/[\\/]/).pop();
    console.log(`[Perforce] Successfully added: ${fileName}`);
    vscode.window.showInformationMessage(`${fileName} added to Perforce`);
    return true;
  } catch (error) {
    console.log(`[Perforce] Failed to add: ${fileUri.fsPath} - Error: ${error}`);
    vscode.window.showErrorMessage(`Failed to add to Perforce: ${error}`);
    return false;
  }
}

async function executePerforceDelete(fileUri: vscode.Uri): Promise<boolean> {
  try {
    console.log(`[Perforce] Executing p4 delete for: ${fileUri.fsPath}`);
    execSync(`p4 delete "${fileUri.fsPath}"`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const fileName = fileUri.fsPath.split(/[\\/]/).pop();
    console.log(`[Perforce] Successfully deleted: ${fileName}`);
    vscode.window.showInformationMessage(`${fileName} deleted from Perforce`);
    return true;
  } catch (error) {
    console.log(`[Perforce] Failed to delete: ${fileUri.fsPath} - Error: ${error}`);
    vscode.window.showErrorMessage(`Failed to delete from Perforce: ${error}`);
    return false;
  }
}

export function activate(context: vscode.ExtensionContext) {
  let pendingPrompt: Promise<void> | null = null;
  const dismissedFiles = new Map<string, NodeJS.Timeout>();
  const pendingDialogs = new Set<string>();

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
        const result = await vscode.window.showInformationMessage(
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

  // Use FileSystemWatcher to monitor file changes instead of VSCode events
  const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, true, false);

  // Listen for file creation using FileWatcher
  const createWatcherDisposable = watcher.onDidCreate(async (uri) => {
    console.log(`[Perforce] File created: ${uri.fsPath}`);
    const config = vscode.workspace.getConfiguration('perforceExtension');
    if (!config.get('enabled', true)) {
      console.log('[Perforce] Extension is disabled, skipping file creation');
      return;
    }

    // Skip if not in Perforce workspace
    console.log(`[Perforce] Checking if file is in workspace...`);
    const inWorkspace = await isInPerforceWorkspace(uri.fsPath);
    if (!inWorkspace) {
      console.log(`[Perforce] File is NOT in Perforce workspace, skipping`);
      return;
    }

    // Skip if dialog is already showing for this file
    if (pendingDialogs.has(uri.fsPath)) {
      console.log(`[Perforce] Dialog already pending for this file, skipping`);
      return;
    }

    // Check if file is already in Perforce depot
    console.log(`[Perforce] Checking if file is already in Perforce...`);
    const inPerforce = await isFileInPerforce(uri.fsPath);
    if (inPerforce) {
      // File is already in Perforce, don't ask to add it
      console.log(`[Perforce] File is already in Perforce, skipping`);
      return;
    }

    const fileName = uri.fsPath.split(/[\\/]/).pop() || uri.fsPath;
    console.log(`[Perforce] Showing add dialog for: ${fileName}`);
    pendingDialogs.add(uri.fsPath);

    try {
      const result = await vscode.window.showInformationMessage(
        `Do you want to add ${fileName} to Perforce?`,
        { modal: true },
        'Yes',
        'No'
      );

      console.log(`[Perforce] User response: ${result}`);
      if (result === 'Yes') {
        await executePerforceAdd(uri);
      }
    } finally {
      pendingDialogs.delete(uri.fsPath);
    }
  });

  // Listen for file deletion using FileWatcher
  const deleteWatcherDisposable = watcher.onDidDelete(async (uri) => {
    console.log(`[Perforce] File deleted: ${uri.fsPath}`);
    const config = vscode.workspace.getConfiguration('perforceExtension');
    if (!config.get('enabled', true)) {
      console.log('[Perforce] Extension is disabled, skipping file deletion');
      return;
    }

    // Skip if not in Perforce workspace
    console.log(`[Perforce] Checking if file is in workspace...`);
    const inWorkspace = await isInPerforceWorkspace(uri.fsPath);
    if (!inWorkspace) {
      console.log(`[Perforce] File is NOT in Perforce workspace, skipping`);
      return;
    }

    console.log(`[Perforce] Checking if file is in Perforce...`);
    const inPerforce = await isFileInPerforce(uri.fsPath);
    if (!inPerforce) {
      console.log(`[Perforce] File is NOT in Perforce, skipping`);
      return;
    }

    const fileName = uri.fsPath.split(/[\\/]/).pop() || uri.fsPath;

    // Skip if dialog is already showing for this file
    if (pendingDialogs.has(uri.fsPath)) {
      console.log(`[Perforce] Dialog already pending for this file, skipping`);
      return;
    }

    console.log(`[Perforce] Showing delete dialog for: ${fileName}`);
    pendingDialogs.add(uri.fsPath);

    try {
      const result = await vscode.window.showInformationMessage(
        `Do you want to delete ${fileName} from Perforce?`,
        { modal: true },
        'Yes',
        'No'
      );

      console.log(`[Perforce] User response: ${result}`);
      if (result === 'Yes') {
        await executePerforceDelete(uri);
      }
    } finally {
      pendingDialogs.delete(uri.fsPath);
    }
  });

  context.subscriptions.push(typeDisposable);
  context.subscriptions.push(createWatcherDisposable);
  context.subscriptions.push(deleteWatcherDisposable);
  context.subscriptions.push(watcher);

  console.log('[Perforce] ========================================');
  console.log('[Perforce] Perforce Auto Edit extension is now ACTIVE');
  console.log('[Perforce] ========================================');
}

export function deactivate() {
  console.log('[Perforce] Perforce Auto Edit extension is now deactivated');
}
