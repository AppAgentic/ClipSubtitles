import { expect, test } from '@playwright/test';

// Use the original fresh-page fixture: this journey must exercise first-visit defaults.
test('optional measurement starts off and essential-only persists across reload', async ({ page }) => {
  const events: string[] = [];
  await page.route('**/v1/analytics/funnel', async (route) => {
    events.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/?fbclid=consent-test');
  const choices = page.getByRole('region', { name: 'Privacy choices', exact: true });
  await expect(choices).toBeVisible();
  await expect(choices.getByRole('checkbox')).toHaveCount(2);
  for (const checkbox of await choices.getByRole('checkbox').all()) {
    await expect(checkbox).not.toBeChecked();
  }
  expect(events).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('clipsubtitles_attribution'))).toBeNull();
  await choices.getByRole('button', { name: 'Essential only', exact: true }).click();
  await page.reload();
  await expect(choices).toHaveCount(0);
  await page.getByRole('button', { name: 'Privacy choices', exact: true }).click();
  await expect(choices).toBeVisible();
  for (const checkbox of await choices.getByRole('checkbox').all()) {
    await expect(checkbox).not.toBeChecked();
  }
  expect(events).toEqual([]);
});
