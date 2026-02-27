# Perforce Auto Edit

Automatically prompt for `p4 edit` when attempting to modify read-only files in VS Code.

## Features

- Detects when you try to edit read-only files
- Shows a modal dialog asking if you want to run Perforce edit
- Integrates with [Perforce for VS Code](https://marketplace.visualstudio.com/items?itemName=swordev.perforce) extension
- Improves workflow by eliminating manual Perforce edit commands

## Requirements

- VS Code 1.80.0 or higher
- [Perforce for VS Code](https://marketplace.visualstudio.com/items?itemName=swordev.perforce) extension installed
- Perforce client configured and accessible
- `files.readonlyFromPermissions` setting enabled in VS Code settings

## Usage

1. Install this extension
2. Ensure [Perforce for VS Code](https://marketplace.visualstudio.com/items?itemName=swordev.perforce) is installed
3. Enable the `files.readonlyFromPermissions` setting in VS Code:
   ```json
   {
     "files.readonlyFromPermissions": true
   }
   ```
4. When you try to edit a read-only file:
   - A modal dialog will appear asking "Do you want to edit [filename] in Perforce?"
   - Click "Yes" to execute `p4 edit` on that file
   - Click "No" to skip (the dialog will appear again on next edit attempt)

## Settings

### `perforceAutoEdit.enabled`
- Type: `boolean`
- Default: `true`
- Description: Enable/disable the auto-prompt for Perforce edit

```json
{
  "perforceAutoEdit.enabled": false
}
```

## How It Works

1. Listens for document change events in the workspace
2. Checks if the changed file is read-only
3. Shows a modal dialog asking to run `p4 edit`
4. If accepted, executes the edit command from Perforce for VS Code extension
5. Prevents prompting again for the same file once successfully edited

## Example Workflow

**Before:**
1. Try to edit `readonly-file.txt` → No changes written (read-only)
2. Open Perforce panel
3. Right-click file → "Edit"
4. Confirm the change
5. Close Perforce panel
6. Try to edit again

**After:**
1. Try to edit `readonly-file.txt` → Modal dialog appears
2. Click "Yes"
3. File automatically marked for edit
4. Continue editing

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
