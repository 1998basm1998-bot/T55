const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3000;

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
    } catch (e) {}
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
        await page.type(selector, value, { delay: 20 });
        return selector;
      }
    } catch (e) {}
  }
  return null;
}

async function extractDownloadLinks(page) {
  return await page.evaluate(() => {
    const anchors = [...document.querySelectorAll("a[href]")];
    const data = anchors.map(a => ({
      href: a.href,
      text: (a.innerText || a.textContent || "").trim()
    }));

    const filtered = data.filter(item => {
      const h = (item.href || "").toLowerCase();
      const t = (item.text || "").toLowerCase();
      return h.startsWith("http") && (
        t.includes("download") ||
        t.includes("تحميل") ||
        t.includes("mp4") ||
        t.includes("mp3") ||
        h.includes(".mp4") ||
        h.includes(".mp3") ||
        h.includes("download")
      );
    });

    return [...new Map(filtered.map(x => [x.href, x])).values()];
  });
}

app.get("/", (req, res) => {
  res.json({ ok: true, message: "TikTok downloader backend is running" });
});

app.post("/api/tiktok-download", async (req, res) => {
  const { url } = req.body || {};

  if (!url || !isValidTikTokUrl(url)) {
    return res.status(400).json({ ok: false, message: "رابط تيك توك غير صالح" });
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
      'input[type="submit"]',
      '.btn',
      '.search-btn',
      '.download-btn',
      'button'
    ];

    const typed = await tryType(page, inputSelectors, url);

    if (!typed) {
      return res.status(500).json({ ok: false, message: "لم يتم العثور على حقل الإدخال" });
    }

    await new Promise(r => setTimeout(r, 1500));

    const clicked = await tryClick(page, buttonSelectors);
    if (!clicked) {
      await page.keyboard.press("Enter");
    }

    await new Promise(r => setTimeout(r, 6000));

    let links = await extractDownloadLinks(page);

    if (!links.length) {
      await new Promise(r => setTimeout(r, 5000));
      links = await extractDownloadLinks(page);
    }

    if (!links.length) {
      return res.status(404).json({
        ok: false,
        message: "لم يتم العثور على روابط تحميل"
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
      message: "حدث خطأ أثناء المعالجة",
      error: error.message
    });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
