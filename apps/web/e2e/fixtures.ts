import { expect, test as base } from '@playwright/test';

/** General product journeys make a real essential-only choice before proceeding. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto('/');
    const choices = page.getByRole('region', { name: 'Privacy choices', exact: true });
    await expect(choices).toBeVisible();
    await choices.getByRole('button', { name: 'Essential only', exact: true }).click();
    await expect(choices).toHaveCount(0);
    await use(page);
  },
});
export { expect } from '@playwright/test';
export type { Page, Response } from '@playwright/test';
