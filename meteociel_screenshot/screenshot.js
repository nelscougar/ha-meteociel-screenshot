const { chromium } = require('playwright');

const now = new Date();
const day = now.getDate();
const month = now.getMonth() + 1;
const year = now.getFullYear();

const CAPTURES = [
  {
    name: 'km/h',
    url: 'https://www.meteociel.fr/temps-reel/obs_villes.php?code2=7681&affint=1',
    output: '/config/www/meteociel_vent.png',
    wait: 2000
  },
  {
    name: 'knots',
    url: `https://www.meteociel.fr/temps-reel/obs_villes.php?affint=1&code2=7681&jour2=${day}&mois2=${month}&annee2=${year}&option=1`,
    output: '/config/www/meteociel_vent_knots.png',
    wait: 4000  // ← page knots plus lente à générer le graphique
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
            console.log(`  Cookies fermés`);
            return true;
          }
        } catch (e) {}
      }
    }
    await page.waitForTimeout(1000);
  }
  return false;
}

async function findGraphBox(page) {
  // ── 1. Sélecteurs directs ──
  const selectors = [
    'img[src*="graphique"]',
    'img[src*="graph"]',
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
        // ⛔ EXCLUT la bannière : doit être assez bas ET avoir une hauteur de graphique
        if (box && box.width > 200 && box.height > 80 && box.height < 350 && box.y > 150) {
          console.log(`  → Graphique trouvé via: ${sel} (${Math.round(box.width)}×${Math.round(box.height)})`);
          return box;
        }
      }
    } catch (e) {}
  }

  // ── 2. Fallback : scan tous les <img> ──
  const candidates = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img'))
      .map(img => {
        const r = img.getBoundingClientRect();
        return {
          x: Math.round(r.x), y: Math.round(r.y),
          width: Math.round(r.width), height: Math.round(r.height),
          src: img.src || '', alt: img.alt || ''
        };
      })
      .filter(b => {
        // Doit ressembler à un graphique, PAS une bannière
        return b.width > 250 && b.width < 900
            && b.height > 100 && b.height < 350   // ni icône, ni bannière
            && b.y > 200;                          // ⛔ PAS en haut de page
      });
  });

  console.log(`  Candidats trouvés: ${candidates.length}`);
  candidates.forEach(c => console.log(`    - ${c.width}×${c.height} @ ${c.x},${c.y} | ${c.src.substring(0,50)}...`));

  if (candidates.length > 0) {
    candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const best = candidates[0];
    console.log(`  → Choisi: ${best.width}×${best.height} @ ${best.x},${best.y}`);
    return best;
  }

  // ── 3. Dernier recours ──
  console.log('  ⚠️ Fallback manuel');
  return { x: 560, y: 410, width: 530, height: 195 };
}

async function captureOne(browser, config) {
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
  try {
    console.log(`\n📸 [${config.name}]`);
    console.log(`   URL: ${config.url}`);

    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 30000 });
    await closeCookieBanner(page);
    await page.waitForTimeout(config.wait || 2000);

    // Scroll au cas où le graphique serait plus bas
    await page.evaluate(() => window.scrollTo(0, 300));

    const box = await findGraphBox(page);

    const clip = {
      x: Math.max(0, Math.round(box.x) - 2),
      y: Math.max(0, Math.round(box.y) - 2),
      width: Math.round(box.width) + 4,
      height: Math.round(box.height) + 4
    };

    await page.screenshot({ path: config.output, clip });

    console.log(`   ✅ ${config.output} (${clip.width}×${clip.height})`);

  } catch (err) {
    console.error(`   ❌ [${config.name}]: ${err.message}`);
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
        console.log(`   🔄 Retry [${config.name}] dans 10s...`);
        await new Promise(r => setTimeout(r, 10000));
        await captureOne(browser, config);
      }
    }
    console.log(`\n🏁 Terminé à ${new Date().toISOString()}`);
  } finally {
    await browser.close();
  }
})();
