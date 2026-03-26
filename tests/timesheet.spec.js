// @ts-check
/**
 * Workday Timesheet Helper – Playwright tests
 *
 * Loads a local mock-timesheet.html, manually injects the extension's
 * content.js and content.css (mirroring what Chrome does on a matched page),
 * and then verifies all expected behaviour.
 *
 * Run:   npx playwright test --project chromium-extension
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..');
const MOCK_PAGE = path.resolve(__dirname, 'mock-timesheet.html');
const CONTENT_JS  = path.resolve(EXTENSION_PATH, 'content.js');
const CONTENT_CSS = path.resolve(EXTENSION_PATH, 'content.css');

async function launchBrowser() {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
  });
  const page = await context.newPage();
  return { context, page };
}

/** Inject content script + CSS into the page (mirrors Extension auto-injection). */
async function injectExtension(page) {
  await page.addStyleTag({ path: CONTENT_CSS });
  const scriptSource = fs.readFileSync(CONTENT_JS, 'utf-8');
  await page.evaluate((src) => {
    const script = document.createElement('script');
    script.textContent = src;
    document.head.appendChild(script);
  }, scriptSource);
  // Allow MutationObserver and initial run to complete
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Workday Timesheet Helper – content script', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async () => {
    ({ context, page } = await launchBrowser());
    await page.goto(`file://${MOCK_PAGE}`, { waitUntil: 'domcontentloaded' });
    await injectExtension(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ── 1. Decoration ─────────────────────────────────────────────────────────

  test('attaches a dropdown wrapper next to each numericInput', async () => {
    const wrappers = page.locator('.wd-helper-dropdown-wrapper');
    // 2 inputs in the mock page (Monday, Tuesday); Wednesday is added dynamically
    await expect(wrappers).toHaveCount(2);
  });

  test('marks each decorated input with data-wd-helper-attached', async () => {
    const decorated = page.locator('[data-automation-id="numericInput"][data-wd-helper-attached]');
    await expect(decorated).toHaveCount(2);
  });

  test('renders a trigger button for each input', async () => {
    const triggers = page.locator('.wd-helper-trigger');
    await expect(triggers).toHaveCount(2);
  });

  // ── 2. Dropdown open / close ───────────────────────────────────────────────

  test('opens the dropdown menu when trigger is clicked', async () => {
    const trigger = page.locator('.wd-helper-trigger').first();
    await trigger.click();

    // Menu is now appended to <body> with position:fixed; check it's visible and not hidden
    const menu = page.locator('.wd-helper-menu:not([hidden])').first();
    await expect(menu).toBeVisible();
  });

  test('menu contains 8 hour-option items', async () => {
    // Ensure a menu is open
    const openMenus = page.locator('.wd-helper-menu:not([hidden])');
    if ((await openMenus.count()) === 0) {
      await page.locator('.wd-helper-trigger').first().click();
    }

    // Scope to the visible (open) menu only
    const options = page.locator('.wd-helper-menu:not([hidden]) .wd-helper-menu-item[data-value]');
    await expect(options).toHaveCount(8);
  });

  test('closes the dropdown when clicking outside', async () => {
    // Ensure menu is open
    const openWrappers = page.locator('.wd-helper-dropdown-wrapper--open');
    if ((await openWrappers.count()) === 0) {
      await page.locator('.wd-helper-trigger').first().click();
    }

    // Click somewhere neutral
    await page.locator('h1').click();

    await expect(page.locator('.wd-helper-menu:not([hidden])')).toHaveCount(0);
  });

  // ── 3. On-load border highlights (must run before any value-insertion tests)

  test('input shows green border on load when numericText label has a valid value', async () => {
    // Monday numericWidget has numericText="7.6" (valid) – no user interaction needed
    const widget = page.locator('[data-automation-id="numericWidget"]').first();
    await expect(widget).toHaveClass(/wd-helper-widget--valid/);
    await expect(widget).not.toHaveClass(/wd-helper-widget--nonstandard/);
  });

  test('input shows amber border on load when numericText label has a non-standard value', async () => {
    // Tuesday numericWidget has numericText="5" (non-standard)
    const widget = page.locator('[data-automation-id="numericWidget"]').nth(1);
    await expect(widget).toHaveClass(/wd-helper-widget--nonstandard/);
    await expect(widget).not.toHaveClass(/wd-helper-widget--valid/);
  });

  // ── 4. Value insertion ────────────────────────────────────────────────────

  test('fills the input with the 0.95× converted value on option selection', async () => {
    const firstTrigger = page.locator('.wd-helper-trigger').first();
    await firstTrigger.click();

    // Select "4h → 3.8" (4 old hours → 3.8 new hours)
    const fourHourOption = page.locator('.wd-helper-menu-item[data-value="3.8"]').first();
    await fourHourOption.click();

    const input = page.locator('[data-automation-id="numericInput"]').first();
    await expect(input).toHaveValue('3.8');
  });

  test('fills correctly for 8 hours (7.6)', async () => {
    const secondTrigger = page.locator('.wd-helper-trigger').nth(1);
    await secondTrigger.click();

    const eightHourOption = page.locator('.wd-helper-menu-item[data-value="7.6"]').nth(1);
    await eightHourOption.click();

    const input = page.locator('[data-automation-id="numericInput"]').nth(1);
    await expect(input).toHaveValue('7.6');
  });

  test('keeps read-mode numericText in sync after dropdown selection', async () => {
    const firstTrigger = page.locator('.wd-helper-trigger').first();
    await firstTrigger.click();

    const sixHourOption = page.locator('.wd-helper-menu-item[data-value="5.7"]').first();
    await sixHourOption.click();

    const label = page.locator('[data-automation-id="numericText"]').first();
    await expect(label).toHaveText('5.7');
  });

  test('fills correctly for 1 hour (0.95)', async () => {
    const firstTrigger = page.locator('.wd-helper-trigger').first();
    await firstTrigger.click();

    const oneHourOption = page.locator('.wd-helper-menu-item[data-value="0.95"]').first();
    await oneHourOption.click();

    const input = page.locator('[data-automation-id="numericInput"]').first();
    await expect(input).toHaveValue('0.95');
  });

  // ── 5. MutationObserver – dynamic inputs ──────────────────────────────────

  test('decorates dynamically added inputs via MutationObserver', async () => {
    // Click the button that reveals the hidden Wednesday row
    await page.locator('#add-dynamic').click();

    // Wait for the observer to fire and decorate the new input
    await page.waitForSelector('[data-automation-id="numericInput"][data-wd-helper-attached]:nth-of-type(3)', {
      timeout: 3000,
    }).catch(() => null); // may not use nth-of-type; check count instead

    await page.waitForFunction(() => {
      return document.querySelectorAll('[data-wd-helper-attached]').length >= 3;
    }, { timeout: 3000 });

    const decorated = page.locator('[data-automation-id="numericInput"][data-wd-helper-attached]');
    await expect(decorated).toHaveCount(3);

    const wrappers = page.locator('.wd-helper-dropdown-wrapper');
    await expect(wrappers).toHaveCount(3);
  });

  // ── 6. Conversion accuracy ────────────────────────────────────────────────

  test.describe('conversion accuracy for all hour values', () => {
    const EXPECTED = [
      { hours: 1, value: '0.95'  },
      { hours: 2, value: '1.9'   },
      { hours: 3, value: '2.85'  },
      { hours: 4, value: '3.8'   },
      { hours: 5, value: '4.75'  },
      { hours: 6, value: '5.7'   },
      { hours: 7, value: '6.65'  },
      { hours: 8, value: '7.6'   },
    ];

    for (const { hours, value } of EXPECTED) {
      test(`${hours}h → ${value}`, async () => {
        const trigger = page.locator('.wd-helper-trigger').first();
        await trigger.click();

        const option = page.locator(`.wd-helper-menu-item[data-value="${value}"]`).first();
        await option.click();

        const input = page.locator('[data-automation-id="numericInput"]').first();
        await expect(input).toHaveValue(value);
      });
    }
  });

  // ── 7. Accessibility ──────────────────────────────────────────────────────

  test('trigger button has aria-haspopup attribute', async () => {
    const trigger = page.locator('.wd-helper-trigger').first();
    await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
  });

  test('trigger button updates aria-expanded when menu opens/closes', async () => {
    const trigger = page.locator('.wd-helper-trigger').first();

    // Ensure closed
    await page.locator('h1').click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Open
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Close
    await page.locator('h1').click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('menu has role="listbox"', async () => {
    const menu = page.locator('.wd-helper-menu').first();
    await expect(menu).toHaveAttribute('role', 'listbox');
  });

  test('each option has role="option"', async () => {
    const options = page.locator('.wd-helper-menu-item').first();
    await expect(options).toHaveAttribute('role', 'option');
  });

  // ── 8. Input border highlights (post-interaction) ────────────────────────

  test('input gets green border after selecting a valid value via dropdown', async () => {
    const widget = page.locator('[data-automation-id="numericWidget"]').first();
    const trigger = page.locator('.wd-helper-trigger').first();
    await trigger.click();
    await page.locator('.wd-helper-menu-item[data-value="7.6"]').first().click();
    await expect(widget).toHaveClass(/wd-helper-widget--valid/);
    await expect(widget).not.toHaveClass(/wd-helper-widget--nonstandard/);
  });

  test('input gets amber border after manually typing a non-standard value', async () => {
    const input = page.locator('[data-automation-id="numericInput"]').first();
    const widget = page.locator('[data-automation-id="numericWidget"]').first();
    await input.fill('5');
    await input.blur();
    await expect(widget).toHaveClass(/wd-helper-widget--nonstandard/);
    await expect(widget).not.toHaveClass(/wd-helper-widget--valid/);
  });

  test('keeps read-mode numericText in sync after manual typing and blur', async () => {
    const input = page.locator('[data-automation-id="numericInput"]').first();
    const label = page.locator('[data-automation-id="numericText"]').first();
    await input.fill('4.75');
    await input.blur();
    await expect(label).toHaveText('4.75');
  });

  test('input has no highlight class when value is empty', async () => {
    const input = page.locator('[data-automation-id="numericInput"]').first();
    const widget = page.locator('[data-automation-id="numericWidget"]').first();
    await input.fill('');
    await input.blur();
    await expect(widget).not.toHaveClass(/wd-helper-widget--valid/);
    await expect(widget).not.toHaveClass(/wd-helper-widget--nonstandard/);
  });
});
