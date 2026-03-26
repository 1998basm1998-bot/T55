const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

function isValidTikTokUrl(url) {
  return /^(https?:\/\/)?(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)\//i.test(String(url || "").trim());
}

async function tryClick(page, selectors) {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click();
        return selector;
      }
    } catch (_) {}
  }
  return null;
}

async function tryType(page, selectors, value) {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await page.click(selector, { clickCount: 3 });
        await page.keyboard.press("Backspace");
        await page.type(selector, value, { delay: 25 });
        return selector;
      }
    } catch (_) {}
  }
  return null;
}

async function extractDownloadLinks(page) {
  return await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));

    const results = anchors
      .map((a) => {
        const href = a.href || "";
        const text = (a.innerText || a.textContent || "").trim();
        return { href, text };
      })
      .filter((item) => {
        if (!item.href) return false;

        const h = item.href.toLowerCase();
        const t = item.text.toLowerCase();

        return (
          h.startsWith("http") &&
          (
            t.includes("download") ||
            t.includes("تحميل") ||
            t.includes("mp4") ||
            t.includes("mp3") ||
            h.includes(".mp4") ||
            h.includes(".mp3") ||
            h.includes("download")
          )
        );
      });

    const unique = [];
    const seen = new Set();

    for (const item of results) {
      if (!seen.has(item.href)) {
        seen.add(item.href);
        unique.push(item);
      }
    }

    return unique;
  });
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "TikTok downloader backend is running"
  });
});

app.post("/api/tiktok-download", async (req, res) => {
  const { url } = req.body || {};

  if (!url || !isValidTikTokUrl(url)) {
    return res.status(400).json({
      ok: false,
      message: "رابط تيك توك غير صالح"
    });
  }

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]
    });

    const page = await browser.newPage();

    await page.setViewport({ width: 1366, height: 900 });

    await page.goto("https://savetik.app/ar", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    const inputSelectors = [
      'input[type="text"]',
      'input[type="url"]',
      'input[placeholder*="TikTok"]',
      'input[placeholder*="تيك"]',
      'input[name*="url"]',
      'input[id*="url"]',
      'input[class*="input"]'
    ];

    const buttonSelectors = [
      'button[type="submit"]',
      'button',
      'input[type="submit"]',
      '.btn',
      '.search-btn',
      '.download-btn'
    ];

    const typedSelector = await tryType(page, inputSelectors, url);

    if (!typedSelector) {
      return res.status(500).json({
        ok: false,
        message: "لم يتم العثور على حقل الإدخال داخل الصفحة"
      });
    }

    await page.waitForTimeout(1000);

    const clickedSelector = await tryClick(page, buttonSelectors);

    if (!clickedSelector) {
      await page.keyboard.press("Enter");
    }

    await page.waitForTimeout(5000);

    let links = await extractDownloadLinks(page);

    if (!links.length) {
      await page.waitForTimeout(5000);
      links = await extractDownloadLinks(page);
    }

    if (!links.length) {
      const html = await page.content();

      return res.status(404).json({
        ok: false,
        message: "لم يتم العثور على روابط تحميل. قد يكون الموقع غيّر تصميمه أو أضاف حماية.",
        debug: {
          usedInputSelector: typedSelector,
          usedButtonSelector: clickedSelector || "ENTER",
          htmlSnippet: html.slice(0, 2000)
        }
      });
    }

    return res.json({
      ok: true,
      message: "تم جلب روابط التحميل",
      links
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "حدث خطأ أثناء معالجة الرابط",
      error: error.message
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
