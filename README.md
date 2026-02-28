# Perforce Extension

Automate your Perforce workflow with smart prompts for `p4 edit`, `p4 add`, and `p4 delete` operations in VS Code.

## Features

- **Edit**: Detects when you try to edit read-only files and prompts to run `p4 edit`
- **Add**: Automatically prompts to run `p4 add` when new files are created
- **Delete**: Automatically prompts to run `p4 delete` when files are deleted
- Shows modal dialogs asking for confirmation before running Perforce commands
- Integrates with [Perforce for VS Code](https://marketplace.visualstudio.com/items?itemName=mjcrouch.perforce) extension
- Improves workflow by eliminating manual Perforce commands

## Requirements

- VS Code 1.80.0 or higher
- [Perforce for VS Code](https://marketplace.visualstudio.com/items?itemName=mjcrouch.perforce) extension installed
- Perforce client configured and accessible
- `files.readonlyFromPermissions` setting enabled in VS Code settings

## Usage

1. Install this extension
2. Ensure [Perforce for VS Code](https://marketplace.visualstudio.com/items?itemName=mjcrouch.perforce) is installed
3. Enable the `files.readonlyFromPermissions` setting in VS Code:
   ```json
   {
     "files.readonlyFromPermissions": true
   }
   ```
4. When you try to edit a read-only file:
   - A modal dialog will appear asking "[filename] is read-only. Do you want to edit it in Perforce?"
   - Click "Yes" to execute `p4 edit` on that file
   - Click "No" to skip (the dialog will appear again on next edit attempt)

## Settings

### `perforceExtension.enabled`
- Type: `boolean`
- Default: `true`
- Description: Enable/disable Perforce Extension auto-prompts

```json
{
  "perforceExtension.enabled": false
}
```

## How It Works

1. Listens for document change events in the workspace
2. Checks if the changed file is read-only
3. Shows a modal dialog asking to run `p4 edit`
4. If accepted, executes the edit command from Perforce for VS Code extension
5. Prevents prompting again for the same file once successfully edited

## Example Workflows

### Editing a Read-Only File

**Before:**
1. Try to edit `readonly-file.txt` → No changes written (read-only)
2. Open Perforce panel → Right-click → "Edit"
3. Manually save and confirm

**After:**
1. Try to edit `readonly-file.txt` → Modal appears: "Do you want to edit readonly-file.txt in Perforce?"
2. Click "Yes" → Automatically runs `p4 edit`
3. File opens for editing

### Creating a New File

1. Create `newfile.txt` in workspace
2. Modal appears: "Do you want to add newfile.txt to Perforce?"
3. Click "Yes" → Automatically runs `p4 add`

### Deleting a File

1. Delete `oldfile.txt` from workspace
2. Modal appears: "Do you want to delete oldfile.txt from Perforce?"
3. Click "Yes" → Automatically runs `p4 delete`

## Troubleshooting

### Dialog doesn't appear when editing read-only files
- Ensure `files.readonlyFromPermissions` is enabled: `"files.readonlyFromPermissions": true`
- Ensure Perforce for VS Code extension is installed
- Check that `perforceAutoEdit.enabled` is not set to `false`

### "Failed to run Perforce edit command" error
- Make sure Perforce for VS Code extension is properly installed
- Verify Perforce client is configured and accessible from command line
- Check VS Code extension output for more details

## License

MIT
