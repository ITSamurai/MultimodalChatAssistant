[
  "import { test, expect } from '@playwright/test';",
  "test('Click Դուք չունեք ընթացիկ պատվերներԳնել հիմա div', async ({ page }) => {",
  "  await page.goto('https://buy.am/');",
  "  await page.locator('#active-orders-btn-delivery').click();",
  "  await expect(page.locator('#query')).toHaveAttribute('style', /caret-color: transparent !important;/);",
  "  await expect(page.locator('a[href=\"/supermarkets\"]')).toHaveAttribute('style', /min-width: 786px; max-width: 786px; transform: translate3d(-1604px, 0px, 0px);/);",
  "  await expect(page.locator('a[href=\"/shops\"]')).toHaveAttribute('style', /min-width: 786px; max-width: 786px; transform: translate3d(-1588px, 0px, 0px);/);",
  "});"
]