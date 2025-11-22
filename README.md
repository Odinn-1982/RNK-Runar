# RNK Runar

RÃºnar is a chat-management module for Foundry VTT that offers private and group chats with GM moderation tools, sound notifications, and a UI hub for players and GMs.

## Install

1. Place the `rnk-runar` folder in your Foundry `modules/` directory.
2. Enable the module in Foundry's Module Settings.
3. Optionally set sounds in the RÃºnar Settings window.
 
Note: The local module folder name must exactly match the module `id` in `module.json` (default: `rnk-runar`).
If the folder name contains spaces or punctuation (for example "RNK Runar"), Foundry may fail to find and serve files using the expected URL path, resulting in errors such as "No such file" or 404s for `modules/rnk-runar/*` assets.
If you copied the code from this repository directly into the `modules` folder, rename the folder to `rnk-runar` and restart Foundry to resolve these issues.

## Features

- Private & Group Chats
- GM Monitor & Group Manager
- Player Hub for quick access
- Notification sound settings (include module sounds)

## Development

To add build tooling, use the included `package.json` for local development.

## License

MIT â€” see `LICENSE` for details.


