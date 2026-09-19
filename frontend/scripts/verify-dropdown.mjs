import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];

async function newSession(width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${tag}] ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => errors.push(`[${tag} pageerror] ${e.message.slice(0, 160)}`));
  const email = `v_${Date.now()}_${width}@test.dev`;
  await page.goto("http://localhost:3000/register", { waitUntil: "networkidle" });
  await page.locator("#name").fill("V");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("Password1");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/overview", { timeout: 20000 });
  await page.waitForTimeout(1200);
  return page;
}

async function coversAll(page) {
  return page.evaluate(() => {
    const dd = [...document.querySelectorAll("header div")].find(
      (d) => getComputedStyle(d).position === "absolute" && d.className.includes("card")
    );
    if (!dd) return "no-dropdown";
    const r = dd.getBoundingClientRect();
    const bad = [];
    for (let y = r.top + 15; y < r.bottom - 5; y += 35) {
      const el = document.elementFromPoint(r.left + 40, Math.min(y, r.bottom - 6));
      if (el && !dd.contains(el)) bad.push(`${el.tagName}.${String(el.className?.baseVal ?? el.className).slice(0, 40)}`);
    }
    const inView = r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
    return { bad, rect: { top: Math.round(r.top), left: Math.round(r.left), h: Math.round(r.height) }, inView };
  });
}

// ── Desktop 1440×900 ──
let page = await newSession(1440, 900, "desktop");
await page.locator('header button.max-w-52').click();
await page.waitForTimeout(400);
console.log("desktop dropdown:", JSON.stringify(await coversAll(page)));
await page.screenshot({ path: "scripts/v-dropdown.png" });
// open create panel — entire form must be on top + in viewport
await page.locator('button:has-text("+ New project")').click();
await page.waitForTimeout(300);
console.log("desktop create-panel:", JSON.stringify(await coversAll(page)));
await page.screenshot({ path: "scripts/v-create.png" });
// cancel returns to list
await page.locator('button:has-text("Cancel")').click();
await page.waitForTimeout(300);
console.log("after cancel:", JSON.stringify(await coversAll(page)));
// create project via the panel
await page.locator('button:has-text("+ New project")').click();
await page.locator('input[placeholder="Project name"]').fill("Layered");
await page.locator('header div.card button:has-text("Create")').click();
await page.waitForTimeout(1200);
console.log("project created, trigger text:", await page.locator('header button.max-w-52').textContent());
// outside click closes
await page.mouse.click(700, 500);
await page.waitForTimeout(300);
console.log("after outside click:", JSON.stringify(await coversAll(page)));
// reopen + pick project
await page.locator('header button.max-w-52').click();
await page.waitForTimeout(300);
await page.locator('header div.card button:has-text("Layered")').click();
await page.waitForTimeout(600);
console.log("selected:", await page.locator('header button.max-w-52').textContent());
// scroll main — dropdown must stay attached & on top
await page.locator('header button.max-w-52').click();
await page.mouse.wheel(0, 800);
await page.waitForTimeout(300);
console.log("after scroll:", JSON.stringify(await coversAll(page)));
await page.close();

// ── Tablet 768×1024 ──
page = await newSession(768, 1024, "tablet");
await page.locator('header button.max-w-52').click();
await page.waitForTimeout(400);
console.log("tablet dropdown:", JSON.stringify(await coversAll(page)));
await page.screenshot({ path: "scripts/v-tablet.png" });
await page.close();

// ── Mobile 375×720 ──
page = await newSession(375, 720, "mobile");
await page.locator('header button.max-w-52').click();
await page.waitForTimeout(400);
console.log("mobile dropdown:", JSON.stringify(await coversAll(page)));
await page.screenshot({ path: "scripts/v-mobile.png" });
await page.close();

console.log("console/page errors:", errors.length ? errors : "none");
await browser.close();
