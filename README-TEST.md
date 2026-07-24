# Test in VS Code

1. Open this folder in VS Code:
   `C:\Users\WexZ\Downloads\LINK`

2. Press `Ctrl+Shift+P`, run `Tasks: Run Task`, then choose:
   `Open LINK local server`

3. Open this URL in your browser:
   `http://127.0.0.1:5500/`

Alternative: open VS Code Terminal and run:
`.\start-server.bat`

You can also install the VS Code extension `Live Server`, then right-click
`index.html` and choose `Open with Live Server`.

## Discord live status

Discord ID is already set in `script.js`:

```js
const DISCORD_USER_ID = "1021433794705768518";
```

The page uses Lanyard WebSocket for live status. Join Lanyard first:
`https://discord.gg/lanyard`
