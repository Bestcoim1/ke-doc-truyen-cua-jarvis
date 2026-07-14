import { expect, test } from "@playwright/test";

/**
 * Authenticated happy path: sign in → open a story → read → move to the next
 * chapter → reload and confirm the reader resumes (AC-READ / AC-PROG smoke).
 *
 * Needs a seeded account whose library already contains at least one story
 * (run `npm run seed:fixtures` against the target Supabase project). It
 * self-skips unless KEDOC_E2E_AUTH=1 so a smoke-only run stays green instead
 * of failing for missing infrastructure — CI sets it on the `supabase start`
 * job. Unverified locally in the session that authored it; the selectors
 * track the real reader UI in components/reader/reader-view.tsx.
 */
const AUTH_ENABLED = process.env.KEDOC_E2E_AUTH === "1";
const EMAIL = process.env.KEDOC_E2E_EMAIL ?? "";
const PASSWORD = process.env.KEDOC_E2E_PASSWORD ?? "";

test.describe("authenticated read journey", () => {
  test.skip(!AUTH_ENABLED, "set KEDOC_E2E_AUTH=1 with a seeded account to run");

  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Mật khẩu").fill(PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/\/library/);
  });

  test("opens a story, advances a chapter, and resumes after reload", async ({
    page,
  }) => {
    // The library lists each story as a link into the reader.
    const storyLink = page.locator('a[href^="/read/"]').first();
    await expect(storyLink).toBeVisible();
    await storyLink.click();

    // Landing on a story resolves to a concrete chapter URL.
    await expect(page).toHaveURL(/\/read\/[0-9a-f-]+\/[0-9a-f-]+/);
    await expect(
      page.getByRole("button", { name: "Về thư viện" }),
    ).toBeVisible();

    const firstChapterUrl = page.url();

    // Advance to the next chapter via the footer control.
    await page.getByRole("button", { name: "Chương sau" }).click();
    await expect(page).toHaveURL(/\/read\/[0-9a-f-]+\/[0-9a-f-]+/);
    await expect(page).not.toHaveURL(firstChapterUrl);

    const secondChapterUrl = page.url();

    // Reload stays on the same chapter — the reader resumes rather than
    // bouncing back to the library or the first chapter.
    await page.reload();
    await expect(page).toHaveURL(secondChapterUrl);
    await expect(
      page.getByRole("button", { name: "Về thư viện" }),
    ).toBeVisible();
  });

  test("the table of contents opens and closes", async ({ page }) => {
    await page.locator('a[href^="/read/"]').first().click();
    await expect(page).toHaveURL(/\/read\//);

    await page.getByRole("button", { name: "Mục lục" }).click();
    await expect(page.getByPlaceholder("Tìm chương...")).toBeVisible();

    // Escape closes the overlay (keyboard a11y path in reader-view.tsx).
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder("Tìm chương...")).toBeHidden();
  });
});
