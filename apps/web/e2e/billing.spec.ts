import { expect, test } from '@playwright/test';

test.beforeAll(async ({ request }) => {
  const response = await request.get('/v1/prices').catch(() => null);
  if (!response?.ok()) throw new Error('Local stack is not running; start it with `pnpm dev`.');
});

test('agent checkout preserves context and returns the customer to a clear resume instruction', async ({ page }) => {
  await page.goto('/auth/login?returnTo=/pricing');
  await page.getByRole('button', { name: /Joe \(mock\)/ }).click();

  let checkoutBody: Record<string, unknown> | undefined;
  await page.route('**/v1/billing/checkout', async (route) => {
    checkoutBody = route.request().postDataJSON() as Record<string, unknown>;
    const completion = new URL('/app/settings', page.url());
    completion.searchParams.set('checkout', 'complete');
    completion.searchParams.set('source', 'chatgpt');
    completion.searchParams.set('resume', 'render:project:quote');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'checkout_browser_test', url: completion.toString(), sku: 'plan_creator_annual' }),
    });
  });

  await page.goto('/pricing?source=chatgpt&resume=render%3Aproject%3Aquote');
  await expect(page.getByRole('button', { name: 'Annual Save up to 20%' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Choose Creator' }).click();

  await expect(page).toHaveURL(/\/app\/settings#billing$/);
  expect(checkoutBody).toMatchObject({
    sku: 'plan_creator_annual',
    source: 'chatgpt',
    resume: 'render:project:quote',
  });
  expect(String(checkoutBody?.returnTo)).toContain('checkout=complete');
  expect(String(checkoutBody?.returnTo)).toContain('source=chatgpt');
  await expect(page.getByText(/Return to ChatGPT and ask it to continue the caption export/)).toBeVisible();
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', await page.evaluate(() => window.innerWidth));
});

