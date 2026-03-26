/**
 * Workday Timesheet Helper - Content Script
 *
 * Injects an hours-selection dropdown next to every numeric timesheet input
 * on Workday pages. Selecting a value from the dropdown converts standard
 * hours (1–8) into Workday's fractional format (× 0.95) and fires the
 * synthetic events needed for Workday's GWT/React framework to register
 * the change.
 *
 * Conversion table (Old Hours → New Hours → Days):
 *   8 → 7.6  → 1.0      5 → 4.75 → 0.625
 *   7 → 6.65 → 0.875    4 → 3.8  → 0.5
 *   6 → 5.7  → 0.75     3 → 2.85 → 0.375
 *                        2 → 1.9  → 0.25
 *                        1 → 0.95 → 0.125
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXTENSION_ATTR = 'data-wd-helper-attached';
const SELECTOR = '[data-automation-id="numericInput"]';
const ANCHOR_HOST_CLASS = 'wd-helper-anchor-host';

/** Map of display label → value to insert into the input. */
const HOUR_OPTIONS = [
  { label: '1h  → 0.95',  value: '0.95',  hours: 1 },
  { label: '2h  → 1.9',   value: '1.9',   hours: 2 },
  { label: '3h  → 2.85',  value: '2.85',  hours: 3 },
  { label: '4h  → 3.8',   value: '3.8',   hours: 4 },
  { label: '5h  → 4.75',  value: '4.75',  hours: 5 },
  { label: '6h  → 5.7',   value: '5.7',   hours: 6 },
  { label: '7h  → 6.65',  value: '6.65',  hours: 7 },
  { label: '8h  → 7.6',   value: '7.6',   hours: 8 },
];

/** Set of valid converted values for instant border-colour lookup. */
const VALID_VALUES = new Set(HOUR_OPTIONS.map((o) => o.value));

function getNumericWidget(input) {
  return input.closest('[data-automation-id="numericWidget"]');
}

function getNumericText(input) {
  const widget = getNumericWidget(input);
  return widget && widget.querySelector('[data-automation-id="numericText"]');
}

function syncNumericText(input, value = input.value.trim()) {
  const label = getNumericText(input);
  if (!label) return;
  label.textContent = value;
}

function getAnchorHost(input) {
  return (
    getNumericWidget(input) ||
    input.parentElement
  );
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Update the input's border colour to reflect its current value:
 *   – empty / zero  → no highlight (default Workday border)
 *   – valid value   → green
 *   – non-zero other → amber
 *
 * @param {HTMLInputElement} input
 */
function updateInputState(input) {
  // Workday keeps the <input> empty until the user focuses it; the displayed
  // value lives in a sibling [data-automation-id="numericText"] label inside
  // the same numericWidget container. Fall back to that label ONLY on the
  // initial decoration pass (before the user has interacted with the field),
  // so that manually clearing the input also clears the highlight.
  let raw = input.value.trim();
  if (raw === '' && !input.hasAttribute('data-wd-helper-touched')) {
    const label = getNumericText(input);
    raw = label ? label.textContent.trim() : '';
  }
  const num = parseFloat(raw);

  // Apply highlight to the numericWidget container — it is always visible,
  // whereas the <input> itself is transparent/invisible at rest in Workday
  // (Workday uses an absolutely-positioned numericText label for display).
  const target = getNumericWidget(input) || input;
  target.classList.remove('wd-helper-widget--valid', 'wd-helper-widget--nonstandard');
  if (raw === '' || raw === '0' || num === 0) return;
  if (VALID_VALUES.has(raw)) {
    target.classList.add('wd-helper-widget--valid');
  } else {
    target.classList.add('wd-helper-widget--nonstandard');
  }
}

/**
 * Dispatch the set of synthetic events that Workday's GWT framework needs
 * in order to treat a programmatic value change as a genuine user interaction.
 *
 * @param {HTMLInputElement} input
 * @param {string} value
 */
function setInputValue(input, value) {
  // Focus so the field is "active"
  input.focus();

  // Use the React / native setter to bypass any cached descriptor
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  );
  if (nativeInputValueSetter && nativeInputValueSetter.set) {
    nativeInputValueSetter.set.call(input, value);
  } else {
    input.value = value;
  }

  // Workday read mode displays the value via numericText. Keep that label
  // synchronized so the cell still shows the value after blur/unselect.
  syncNumericText(input, value);

  // Fire a sequence of events that covers both GWT and React listeners
  const events = [
    new Event('input',  { bubbles: true }),
    new Event('change', { bubbles: true }),
    new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }),
  ];
  events.forEach((e) => input.dispatchEvent(e));

  // Blur to commit the value
  input.blur();

  // Reflect the new value in the border colour
  updateInputState(input);
}

/**
 * Build the dropdown wrapper element for a given input.
 *
 * @param {HTMLInputElement} input
 * @returns {HTMLDivElement}
 */
function buildDropdown(input) {
  const wrapper = document.createElement('div');
  wrapper.className = 'wd-helper-dropdown-wrapper';
  wrapper.setAttribute('aria-label', 'Hour picker');

  const button = document.createElement('button');
  button.className = 'wd-helper-trigger';
  button.type = 'button';
  button.title = 'Select hours';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

  const menu = document.createElement('ul');
  menu.className = 'wd-helper-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'Hour options');
  menu.hidden = true;

  // Placeholder / reset option
  const resetItem = document.createElement('li');
  resetItem.className = 'wd-helper-menu-item wd-helper-menu-item--header';
  resetItem.setAttribute('role', 'option');
  resetItem.textContent = 'Old → New (×0.95)';
  menu.appendChild(resetItem);

  HOUR_OPTIONS.forEach(({ label, value }) => {
    const item = document.createElement('li');
    item.className = 'wd-helper-menu-item';
    item.setAttribute('role', 'option');
    item.setAttribute('data-value', value);
    item.textContent = label;

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      setInputValue(input, value);
      closeMenu(wrapper, button, menu);
      // Briefly highlight the trigger to confirm selection
      button.classList.add('wd-helper-trigger--confirmed');
      setTimeout(() => button.classList.remove('wd-helper-trigger--confirmed'), 600);
    });

    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
      if (e.key === 'Escape') {
        closeMenu(wrapper, button, menu);
        button.focus();
      }
    });

    menu.appendChild(item);
  });

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !menu.hidden;
    if (isOpen) {
      closeMenu(wrapper, button, menu);
    } else {
      openMenu(wrapper, button, menu);
    }
  });

  button.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu(wrapper, button, menu);
  });

  // Append menu to <body> so it escapes any ancestor overflow:hidden (e.g. Workday table cells)
  document.body.appendChild(menu);

  // Store direct references on the wrapper so the outside-click handler
  // can reach button/menu without a DOM descendant search.
  wrapper._wdButton = button;
  wrapper._wdMenu = menu;

  wrapper.appendChild(button);
  return wrapper;
}

function openMenu(wrapper, button, menu) {
  // Position the menu using fixed coordinates derived from the button's viewport rect.
  // This lets the menu escape table-cell / parent overflow:hidden clipping.
  const rect = button.getBoundingClientRect();
  const menuWidth = 176; // matches min-width in CSS
  const menuEstimatedHeight = 9 /* items */ * 32; // rough upper bound in px
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  // Prefer opening below; flip up only when there is not enough space below.
  const openUpward = spaceBelow < menuEstimatedHeight && spaceAbove > spaceBelow;

  // Align right edge with button's right edge; clamp to viewport left.
  let left = Math.max(0, rect.right - menuWidth);
  if (left + menuWidth > window.innerWidth) {
    left = Math.max(0, window.innerWidth - menuWidth - 4);
  }

  if (openUpward) {
    menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    menu.style.top = 'auto';
    wrapper.classList.add('wd-helper-dropdown-wrapper--upward');
  } else {
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.bottom = 'auto';
    wrapper.classList.remove('wd-helper-dropdown-wrapper--upward');
  }
  menu.style.left = `${left}px`;

  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  wrapper.classList.add('wd-helper-dropdown-wrapper--open');
  // Focus the first real option
  const firstItem = menu.querySelector('.wd-helper-menu-item:not(.wd-helper-menu-item--header)');
  if (firstItem) firstItem.focus();
}

function closeMenu(wrapper, button, menu) {
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  wrapper.classList.remove('wd-helper-dropdown-wrapper--open');
}

// ---------------------------------------------------------------------------
// Attachment logic
// ---------------------------------------------------------------------------

/**
 * Attach a dropdown to a single numeric input if not already done.
 *
 * @param {HTMLInputElement} input
 */
function attachDropdown(input) {
  if (input.hasAttribute(EXTENSION_ATTR)) return;
  input.setAttribute(EXTENSION_ATTR, 'true');

  const dropdown = buildDropdown(input);
  const host = getAnchorHost(input);

  // In Workday read mode the input is display:none, so anchoring off the input
  // collapses the trigger onto the visible text. Anchor directly to the
  // numeric widget, which exists in both read and edit states.
  if (host) {
    host.classList.add(ANCHOR_HOST_CLASS);
    host.appendChild(dropdown);
  } else {
    input.insertAdjacentElement('afterend', dropdown);
  }

  // Reflect any value the user types manually.
  // Mark as touched on first input event so the label fallback is suppressed
  // from that point on (allowing explicit clears to remove the highlight).
  input.addEventListener('input', () => {
    input.setAttribute('data-wd-helper-touched', 'true');
    syncNumericText(input);
    updateInputState(input);
  });
  input.addEventListener('change', () => {
    syncNumericText(input);
    updateInputState(input);
  });
  input.addEventListener('blur', () => {
    syncNumericText(input);
    updateInputState(input);
  });

  // Colour any value already present when the page loads
  updateInputState(input);
}

/**
 * Scan the document for undecorated inputs and attach dropdowns.
 */
function attachAll() {
  document.querySelectorAll(`${SELECTOR}:not([${EXTENSION_ATTR}])`).forEach(attachDropdown);
}

// ---------------------------------------------------------------------------
// Close menus on outside click
// ---------------------------------------------------------------------------

document.addEventListener('click', () => {
  document.querySelectorAll('.wd-helper-dropdown-wrapper--open').forEach((wrapper) => {
    // Use stored references – the menu is on <body>, not inside the wrapper
    if (wrapper._wdButton && wrapper._wdMenu) {
      closeMenu(wrapper, wrapper._wdButton, wrapper._wdMenu);
    }
  });
});

// ---------------------------------------------------------------------------
// MutationObserver – Workday is a SPA; new inputs appear dynamically
// ---------------------------------------------------------------------------

const observer = new MutationObserver(() => {
  attachAll();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial run
attachAll();
