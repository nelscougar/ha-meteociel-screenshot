const { chromium } = require('playwright');

// ── Date du jour pour l'URL knots ──
const now = new Date();
const day = now.getDate();
const month = now.getMonth() + 1; // 1-12
const year = now.getFullYear();

const CAPTURES = [
  {
    name: 'km/h',
    url: 'https://www.meteociel.fr/temps-reel/obs_villes.php?code2=7681&affint=1',
    output: '/config/www/meteociel_vent.png'
  },
  {
    name: 'knots',
    url: `https://www.meteociel.fr/temps-reel/obs_villes.php?affint=1&code2=7681&jour2=${day}&mois2=${month}&annee2=${year}&option=1`,
    output: '/config/www/meteociel_vent_knots.png'
  }
];

async function closeCookieBanner(page) {
  const texts = ['Continue without accepting', 'continuer sans accepter'];
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const frame of page.frames()) {
      for (const text of texts) {
        try {
          const btn = frame.getByText(text, { exact: false });
          if (await btn.count() > 0) {
            await btn.first().click({ timeout: 2000 });
            console.log(`Bandeau cookies fermé (frame: ${frame.url()})`);
            return true;
          }
        } catch (e) {}
      }
    }
    await page.waitForTimeout(1000);
  }
  console.log('Pas de bandeau cookies trouvé.');
  return false;
}

async function findGraphBox(page) {
  const selectors = [
    'img[src*="graphique"]',
    'img[src*="obs_villes"]',
    'img[alt*="vent"]',
    'img[alt*="température"]',
    'img[width="500"]',
    'img[width="520"]',
    'img[width="530"]',
    'table + img',
    'td > img',
  ];

  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() > 0) {
        const box = await el.boundingBox();
        if (box && box.width > 200 && box.height > 80) {
          console.log(`  → Graphique trouvé via: ${sel} (${Math.round(box.width)}×${Math.round(box.height)})`);
          return box;
        }
      }
    } catch (e) {}
  }

  // Fallback : plus grand <img>
  const candidates = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img'))
      .map(img => {
        const r = img.getBoundingClientRect();
        return {
          x: Math.round(r.x), y: Math.round(r.y),
          width: Math.round(r.width), height: Math.round(r.height)
        };
      })
      .filter(b => b.width > 250 && b.height > 80 && b.width < 1000);
  });

  if (candidates.length > 0) {
    candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const best = candidates[0];
    console.log(`  → Graphique trouvé via scan: ${best.width}×${best.height}`);
    return best;
  }

  console.log('  ⚠️ Fallback manuel');
  return { x: 560, y: 410, width: 530, height: 195 };
}

async function captureOne(browser, config) {
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
  try {
    console.log(`\n📸 Capture [${config.name}]`);
    console.log(`   URL: ${config.url}`);

    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 30000 });
    await closeCookieBanner(page);
    await page.waitForTimeout(2000);

    const box = await findGraphBox(page);

    const clip = {
      x: Math.max(0, Math.round(box.x) - 2),
      y: Math.max(0, Math.round(box.y) - 2),
      width: Math.round(box.width) + 4,
      height: Math.round(box.height) + 4
    };

    await page.screenshot({ path: config.output, clip });

    console.log(`   ✅ Sauvegardé: ${config.output}`);
    console.log(`   📐 ${clip.width}×${clip.height}`);

  } catch (err) {
    console.error(`   ❌ Échec [${config.name}]: ${err.message}`);
    throw err;
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const config of CAPTURES) {
      try {
        await captureOne(browser, config);
      } catch (err) {
        console.log(`   🔄 Nouvelle tentative [${config.name}] dans 10s...`);
        await new Promise(r => setTimeout(r, 10000));
        await captureOne(browser, config);
      }
    }
    console.log(`\n🏁 Terminé à ${new Date().toISOString()}`);
  } finally {
    await browser.close();
  }
})();
