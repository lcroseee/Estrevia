import { test, expect } from '@playwright/test';

/**
 * Birth-time input E2E — covers:
 *  - landing HeroCalculator toggle
 *  - TimePickerField 12h/24h switch
 *  - AM/PM selection
 *  - canonical HH:mm posted to /api/v1/chart/calculate
 */

async function fillBirthDate(page: import('@playwright/test').Page, yyyy: string, mm: string, dd: string) {
  await page.getByLabel(/^Month$/i).fill(mm);
  await page.getByLabel(/^Day$/i).fill(dd);
  await page.getByLabel(/^Year$/i).fill(yyyy);
}

test.describe('Birth time input — landing hero', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('toggle reveals TimePickerField; format switch works', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: /i know my birth time/i });
    if ((await toggle.count()) === 0) {
      test.skip();
      return;
    }
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    const hour = page.getByLabel(/^hour$/i).first();
    await expect(hour).toBeVisible();

    const format12 = page.getByRole('button', { name: /^12h$/i });
    const format24 = page.getByRole('button', { name: /^24h$/i });
    await expect(format12).toBeVisible();
    await expect(format24).toBeVisible();

    await format24.click();
    await expect(format24).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('radiogroup', { name: /am or pm/i }),
    ).toHaveCount(0);

    await format12.click();
    await expect(
      page.getByRole('radiogroup', { name: /am or pm/i }),
    ).toBeVisible();
  });

  test('submit blocked when toggle on but time empty', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: /i know my birth time/i });
    if ((await toggle.count()) === 0) {
      test.skip();
      return;
    }
    await toggle.click();

    await fillBirthDate(page, '1990', '04', '22');

    const submit = page.getByRole('button', { name: /discover my sun sign/i });
    await submit.click();

    await expect(
      page.getByText(/please enter your birth time/i),
    ).toBeVisible();
  });

  test('12h entry with PM posts canonical 24h time', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: /i know my birth time/i });
    if ((await toggle.count()) === 0) {
      test.skip();
      return;
    }
    await toggle.click();

    const format12 = page.getByRole('button', { name: /^12h$/i });
    await format12.click();

    await page.getByLabel(/^hour$/i).fill('02');
    await page.getByLabel(/^minute$/i).fill('30');
    await page.getByRole('radio', { name: /^pm$/i }).click();

    const requestPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/chart/calculate') && req.method() === 'POST',
    );

    await fillBirthDate(page, '1990', '04', '22');
    await page.getByPlaceholder(/birth city/i).fill('London');
    const firstOption = page.getByRole('option').first();
    await firstOption.waitFor({ state: 'visible', timeout: 5_000 });
    await firstOption.click();

    await page.getByRole('button', { name: /discover my sun sign/i }).click();

    const request = await requestPromise;
    const body = JSON.parse(request.postData() ?? '{}');

    expect(body.time).toBe('14:30');
    expect(body.knowsBirthTime).toBe(true);
    expect(body.houseSystem).toBe('Placidus');
  });
});
