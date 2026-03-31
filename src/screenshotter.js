import { mkdir } from "node:fs/promises";
import path from "node:path";
import { debug } from "./utils/logger.js";

export async function captureScreenshots(page, pageResult, outputDir) {
  const screenshotsDir = path.join(outputDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });

  // Sanitize URL for filename
  const safeName = pageResult.url
    .replace(/https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .slice(0, 100);

  // Full page screenshot
  const fullPagePath = path.join(screenshotsDir, `${safeName}_full.png`);
  await page.screenshot({ path: fullPagePath, fullPage: true });
  pageResult.screenshotPath = fullPagePath;
  debug(`Full-page screenshot: ${fullPagePath}`);

  // Element-level screenshots with red highlight
  for (const violation of pageResult.violations) {
    for (let i = 0; i < violation.nodes.length; i++) {
      const node = violation.nodes[i];
      const selector = node.target[0];
      if (!selector) continue;

      try {
        const element = await page.locator(selector).first();
        if (!(await element.isVisible())) continue;

        // Add red highlight
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) {
            el.style.outline = "3px solid red";
            el.style.outlineOffset = "2px";
          }
        }, selector);

        const elemPath = path.join(
          screenshotsDir,
          `${safeName}_${violation.id}_${i}.png`
        );
        await element.screenshot({ path: elemPath });
        node.screenshotPath = elemPath;
        debug(`Element screenshot: ${elemPath}`);

        // Remove highlight
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) {
            el.style.outline = "";
            el.style.outlineOffset = "";
          }
        }, selector);
      } catch {
        debug(`Could not screenshot element: ${selector}`);
      }
    }
  }

  return pageResult;
}
