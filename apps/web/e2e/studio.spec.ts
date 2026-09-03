import { expect, test, type Page } from '@playwright/test';

const SHOT_DIR = process.env.E2E_SHOT_DIR ?? 'e2e/.results/shots';

async function noHorizontalOverflow(page: Page, label: string): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${label}: document.scrollWidth must equal window.innerWidth`).toBe(
    innerWidth,
  );
}

async function shot(page: Page, name: string): Promise<void> {
  const project = test.info().project.name;
  await page.screenshot({ path: `${SHOT_DIR}/${project}-${name}.png`, fullPage: false });
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/auth/login?returnTo=/app');
  await expect(page.getByRole('heading', { name: 'Choose a local identity' })).toBeVisible();
  await page.getByRole('button', { name: /Joe \(mock\)/ }).click();
  await expect(
    page.getByRole('heading', { name: /Good (morning|afternoon|evening), Joe\./ }),
  ).toBeVisible();
}

test.beforeAll(async ({ request }) => {
  // /v1/prices is public and proxied to the API, so it proves both web and API are up.
  const res = await request.get('/v1/prices').catch(() => null);
  if (!res || !res.ok())
    throw new Error(
      'Local stack is not running: start it with `pnpm dev` (API :3101, worker, web :3100).',
    );
});

test('sign-in page renders without overflow', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('link', { name: /Continue to sign in/ })).toBeVisible();
  await noHorizontalOverflow(page, 'sign-in');
  await shot(page, 'sign-in');
});

test('library, editor, and render routes stay within the viewport and the caption workflow works', async ({
  page,
}) => {
  await signIn(page);
  await noHorizontalOverflow(page, 'library');
  await shot(page, 'library');

  // Start with the same bundled sample that a first-time customer sees. The redesigned
  // onboarding uploads it and generates the recommended captions automatically.
  await page.goto('/app/new');
  await noHorizontalOverflow(page, 'new-clip');
  const demo = page.getByRole('button', { name: /Try the sample video/ });
  await expect(demo).toBeVisible({ timeout: 10_000 });
  await demo.click();
  await expect(page).toHaveURL(/\/studio\/proj_/);
  await expect(
    page.getByRole('list', { name: 'Caption pages' }).getByRole('listitem').first(),
  ).toBeVisible({ timeout: 120_000 });
  await noHorizontalOverflow(page, 'editor');

  // Selecting a page seeks the video; the live overlay draws the same words the page lists.
  const firstPage = page.getByRole('list', { name: 'Caption pages' }).getByRole('button').first();
  await firstPage.click();
  await expect(page.locator('.caption-word').first()).toBeVisible();
  const overlayText = (await page.locator('.caption-word').allTextContents()).join(' ');
  expect(overlayText).toContain('mock1');
  await shot(page, 'editor');

  // Selecting a page switched the inspector to WORDS; go back to STYLE for the position control.
  await page.getByRole('tab', { name: 'style' }).click();
  // Style changes save automatically and survive a reload.
  await page.getByRole('radio', { name: 'Top' }).click();
  await expect(page.getByText('saved', { exact: true })).toBeVisible();
  await page.reload();
  // The inspector intentionally defaults to word correction after a reload;
  // reopen Style before asserting the saved project-level setting.
  await page.getByRole('tab', { name: 'Style' }).click();
  await expect(page.getByRole('radio', { name: 'Top' })).toBeChecked();

  // Render flow: quote → approve → task → downloads, credits refreshed in the header without a reload.
  const creditsBefore = Number(
    (
      await page
        .getByRole('link', { name: /credits available/ })
        .first()
        .getAttribute('aria-label')
    )?.match(/(\d+) credits/)?.[1],
  );
  await page.getByRole('link', { name: 'Continue to export' }).click();
  await expect(page.getByRole('heading', { name: /^Export /, level: 1 })).toBeVisible();
  await noHorizontalOverflow(page, 'render');
  await page.getByRole('button', { name: 'Review cost' }).click();
  const quoteCard = page.getByRole('region', { name: 'Export cost' });
  await expect(quoteCard).toBeVisible();
  await shot(page, 'render-quote');

  // Changing settings drops the visible quote (the card can never diverge from what Approve renders).
  await page.getByText('More file and quality options', { exact: true }).click();
  await page.getByRole('radio', { name: '720p' }).click();
  await expect(quoteCard).toHaveCount(0);
  await expect(page.getByText('Your options changed — review the updated cost.')).toBeVisible();
  await page.getByRole('button', { name: 'Review cost' }).click();
  await expect(quoteCard).toBeVisible();
  const approve = page.getByRole('button', { name: /Approve \d+ credits and export/ });
  const cost = Number((await approve.textContent())?.match(/Approve (\d+) credits/)?.[1]);
  await approve.click();
  // Locked form: segmented controls are truly disabled, not just visually.
  await expect(page.getByRole('radio', { name: '1080p' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Render again' }).first()).toBeVisible({
    timeout: 150_000,
  });
  await expect(page.getByRole('link', { name: 'Download' }).first()).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Export ready. Credits charged.' }),
  ).toBeVisible();
  await expect(quoteCard.getByText('Exported')).toBeVisible();
  await noHorizontalOverflow(page, 'render-done');
  await shot(page, 'render-done');
  const creditsAfter = Number(
    (
      await page
        .getByRole('link', { name: /credits available/ })
        .first()
        .getAttribute('aria-label')
    )?.match(/(\d+) credits/)?.[1],
  );
  expect(creditsAfter).toBe(creditsBefore - cost);

  // Render again unlocks the form.
  await page.getByRole('button', { name: 'Render again' }).first().click();
  await expect(page.getByRole('radio', { name: '1080p' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Review cost' })).toBeEnabled();
});
