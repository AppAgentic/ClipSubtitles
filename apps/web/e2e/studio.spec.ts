import { expect, test, type Page, type Response } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { MeSchema } from '@clipsubtitles/contracts';

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
  const responses: Array<{ path: string; status: number }> = [];
  const observe = (response: Response) => {
    const path = new URL(response.url()).pathname;
    if (
      ['/auth/login', '/auth/mock/sign-in', '/auth/callback', '/app', '/v1/me'].includes(path) &&
      responses.length < 30
    )
      responses.push({ path, status: response.status() });
  };
  page.on('response', observe);
  try {
    await page.goto('/auth/login?returnTo=/app');
    await expect(page.getByRole('heading', { name: 'Choose a local identity' })).toBeVisible();
    await page.getByRole('button', { name: /Joe \(mock\)/ }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('navigation', { name: 'Workspace' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    // A fresh workspace shows onboarding, while returning users see a greeting.
    // Verify the cookie-backed identity independently of project-dependent home copy.
    const identity = await page.request.get('/v1/me');
    expect(identity.status()).toBe(200);
    const me = MeSchema.parse(await identity.json());
    expect(me.authKind).toBe('session');
    expect(me.user.displayName).toBe('Joe (mock)');
  } catch (error) {
    // Paths/statuses distinguish callback, session and page-load failures without cookies or query values.
    const diagnostics = test.info().outputPath('sign-in-network.json');
    await writeFile(
      diagnostics,
      JSON.stringify({ finalPath: new URL(page.url()).pathname, responses }, null, 2),
    );
    await test.info().attach('sign-in-network.json', {
      path: diagnostics,
      contentType: 'application/json',
    });
    throw error;
  } finally {
    page.off('response', observe);
  }
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

test('landing headline stays inside its column', async ({ page }) => {
  if (test.info().project.name === 'desktop') {
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Connect your agent' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const heroAgent = page.getByRole('region', { name: 'Connect ClipSubtitles to your agent' });
  await expect(heroAgent.getByRole('button', { name: 'Copy setup prompt' })).toBeVisible();
  await heroAgent.getByRole('radio', { name: 'MCP' }).click();
  await expect(heroAgent.getByRole('radio', { name: 'MCP' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await shot(page, 'landing-agent-mcp');
  await heroAgent.getByRole('radio', { name: 'Claude' }).click();
  await shot(page, 'landing-agent');
  await page.getByRole('tab', { name: 'Use in browser' }).click();
  await expect(page.getByRole('button', { name: /Upload a video/ })).toBeVisible();
  await noHorizontalOverflow(page, 'landing');
  const lines = page.locator('.tg-hero h1 > *');
  for (let index = 0; index < (await lines.count()); index += 1) {
    const dimensions = await lines.nth(index).evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(
      dimensions.scrollWidth,
      `headline line ${index + 1} must not overflow`,
    ).toBeLessThanOrEqual(dimensions.clientWidth);
  }
  await shot(page, 'landing');
});

test('brand icon switches cleanly between light and dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const lightMark = page.locator('.cs-wordmark__mark-image--light').first();
  const darkMark = page.locator('.cs-wordmark__mark-image--dark').first();
  await expect(lightMark).toBeVisible();
  await expect(darkMark).toBeHidden();

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(lightMark).toBeHidden();
  await expect(darkMark).toBeVisible();

  await expect(
    page.locator('link[rel~="icon"][media="(prefers-color-scheme: light)"]'),
  ).toHaveAttribute('href', '/brand/clipsubtitles-mark-light.png');
  await expect(
    page.locator('link[rel~="icon"][media="(prefers-color-scheme: dark)"]'),
  ).toHaveAttribute('href', '/brand/clipsubtitles-mark-dark.png');
});

test('every agent selector updates the visible setup and handoff', async ({ page }) => {
  await page.goto('/');
  const heroAgent = page.getByRole('region', { name: 'Connect ClipSubtitles to your agent' });
  const cases = ['ChatGPT', 'Codex', 'MCP', 'Gemini', 'Cursor', 'VS Code', 'Claude'] as const;

  for (const client of cases) {
    const choice = heroAgent.getByRole('radio', { name: client });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-checked', 'true');
    await expect(heroAgent.getByRole('button', { name: 'Copy setup prompt' })).toBeVisible();
  }
});

test('AI connections explains the first ChatGPT action after connecting', async ({ page }) => {
  await signIn(page);
  await page.goto('/app/connections');
  const firstChatHeading = page.getByRole('heading', {
    name: 'Start your first caption in ChatGPT',
  });
  await expect(firstChatHeading).toBeVisible();
  await expect(page.getByText('What to do after connecting')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy request' })).toBeVisible();
  await expect(page.getByText(/Use ClipSubtitles to caption this attached video/)).toBeVisible();
  await noHorizontalOverflow(page, 'AI connections');
  await firstChatHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot(page, 'connections-first-chat');
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
  // Style is the intended first inspector on every editor load.
  await expect(page.getByRole('tab', { name: 'Style' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('radio', { name: 'Top' })).toBeChecked();
  await page.getByRole('region', { name: 'Inspector' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot(page, 'editor-style-default');

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
