# Workday Timesheet Helper

Workday Timesheet Helper is a Chromium extension that adds a clock picker next to Workday timesheet hour fields and inserts the matching fractional value used by Workday.

## Conversion table

| Old hours | New hours (×0.95) | Days  |
|-----------|-------------------|-------|
| 8         | 7.6               | 1.0   |
| 7         | 6.65              | 0.875 |
| 6         | 5.7               | 0.75  |
| 5         | 4.75              | 0.625 |
| 4         | 3.8               | 0.5   |
| 3         | 2.85              | 0.375 |
| 2         | 1.9               | 0.25  |
| 1         | 0.95              | 0.125 |

## Current behavior

- Adds a clock button to Workday numeric timesheet widgets
- Opens a menu with the supported hour conversions
- Inserts the converted value and triggers the events Workday expects
- Highlights standard converted values in green and non-standard non-zero values in amber
- Supports Workday SPA navigation by decorating newly inserted inputs automatically

## Included files

```text
manifest.json
content.js
content.css
popup.html
popup.js
icons/
```

## Install in developer mode

1. Open `chrome://extensions` in Chrome, Edge, or another Chromium browser.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this extension folder.
5. Open a Workday timesheet page.

## Run tests from the full source repository

```bash
npm install
npm test
```

## Privacy

This extension runs locally in the browser on Workday pages.
It does not send timesheet values to external services.

## Implementation summary

The content script runs at `document_idle` on matching Workday pages, finds `numericInput` fields, and attaches a dropdown trigger to each corresponding `numericWidget`.

When a value is selected, the script updates the input, synchronizes Workday's read-mode text node, and dispatches the events needed for Workday to register the change.

A `MutationObserver` watches for new hour inputs added by Workday navigation and decorates them automatically.
