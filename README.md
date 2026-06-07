# New API Key Info for SillyTavern

Minimal SillyTavern UI extension for the Chat Completion `Custom` connection page.
It shows the selected new-api model price and the current API key quota balance.

## Install

Copy this folder to one of these SillyTavern extension locations:

- `SillyTavern/data/default-user/extensions/sillytavern-new-api-key-info`
- `SillyTavern/public/scripts/extensions/third-party/sillytavern-new-api-key-info`

Then restart SillyTavern or reload the browser page and enable `New API Key Info`
in the Extensions manager.

## When data refreshes

- Automatically: about 1.5 seconds after clicking the Chat Completion connect button.
- Manually: click the `Refresh` button in the injected `New API info` panel.
- Model changes: re-render from cached pricing data; no balance request is sent.

## Required new-api endpoints

- `GET /api/pricing`
- `GET /api/usage/token`

The extension derives these endpoints from your Custom API URL. For example:

- `https://api.example.com/v1` -> `https://api.example.com/api/pricing`
- `https://api.example.com/v1/chat/completions` -> `https://api.example.com/api/usage/token`

## Notes

- Browser CORS must allow SillyTavern to request your new-api domain.
- The key balance query requires the full API key to be visible in the page.
- Token-based pricing is displayed as USD per 1M input/output tokens.
- Fixed pricing is displayed as USD per request.
