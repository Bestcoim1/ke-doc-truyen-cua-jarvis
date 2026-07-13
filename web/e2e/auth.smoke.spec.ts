import { expect, test } from "@playwright/test";

/**
 * Unauthenticated smoke net — no database writes, no seeded user. Exercises
 * the middleware + SSR redirect shell that vitest can't reach, and is safe to
 * run against the real Supabase project in .env.local (a signed-out visitor
 * only ever gets redirected to /auth/login).
 */

test.describe("unauthenticated shell", () => {
  test("login page renders the email/password form", async ({ page }) => {
    await page.goto("/auth/login");

    // CardTitle renders as a <div>, not a heading, so assert on the form
    // controls + submit button — that's what "the login form rendered" means.
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Mật khẩu")).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeVisible();
  });

  test("visiting the library while signed out redirects to login", async ({ page }) => {
    await page.goto("/library");

    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("the root route sends a signed-out visitor to login", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
