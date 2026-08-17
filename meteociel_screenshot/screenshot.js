const { chromium } = require('playwright');

const CAPTURES = [
  {
    name: 'knots',
    url: 'https://www.meteociel.fr/temps-reel/obs_villes.php?affint=1&code2=7681&option=1',
    output: '/config/www/meteociel_vent_knots.png',
    wait: 4000
  },
  {
    name: 'kmh',
    url: 'https://www.meteociel.fr/temps-reel/obs_villes.php?code2=83061007&affint=1',
    output: '/config/www/meteociel_vent.png',
    wait: 2000
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
            console.log('  Cookies fermes');
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
  const selectors = [
    'img[src*="graphique"]',
    'img[src*="graph"]',
    'img[src*="obs_villes"]',
    'img[alt*="vent"]',
    'img[alt*="temperature"]',
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
        if (box && box.width > 200 && box.height > 80 && box.height < 350 && box.y > 150) {
          console.log('  -> Graphique trouve via: ' + sel + ' (' + Math.round(box.width) + 'x' + Math.round(box.height) + ')');
          return box;
        }
      }
    } catch (e) {}
  }

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
      .filter(b => b.width > 250 && b.width < 900 && b.height > 100 && b.height < 350 && b.y > 200);
  });

  console.log('  Candidats trouves: ' + candidates.length);
  candidates.forEach(c => console.log('    - ' + c.width + 'x' + c.height + ' @ ' + c.x + ',' + c.y + ' | ' + c.src.substring(0,50)));

  if (candidates.length > 0) {
    candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const best = candidates[0];
    console.log('  -> Choisi: ' + best.width + 'x' + best.height + ' @ ' + best.x + ',' + best.y);
    return best;
  }

  console.log('  ATTENTION Fallback manuel utilise - resultat probablement incorrect');
  return { x: 560, y: 410, width: 530, height: 195, isFallback: true };
}

async function captureOne(browser, config) {
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
  try {
    console.log('');
    console.log('CAPTURE [' + config.name + ']');
    console.log('  URL: ' + config.url);

    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 30000 });
    await closeCookieBanner(page);
    await page.waitForTimeout(config.wait || 2000);

    await page.evaluate(() => window.scrollTo(0, 300));

    const box = await findGraphBox(page);

    if (box.isFallback) {
      console.log('  ERREUR: aucun graphique detecte, capture annulee pour ' + config.name);
      return;
    }

    const clip = {
      x: Math.max(0, Math.round(box.x) - 2),
      y: Math.max(0, Math.round(box.y) - 2),
      width: Math.round(box.width) + 4,
      height: Math.round(box.height) + 4
    };

    await page.screenshot({ path: config.output, clip });
    console.log('  OK: ' + config.output + ' (' + clip.width + 'x' + clip.height + ')');

  } catch (err) {
    console.error('  ECHEC [' + config.name + ']: ' + err.message);
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
        console.log('  Retry [' + config.name + '] dans 10s...');
        await new Promise(r => setTimeout(r, 10000));
        await captureOne(browser, config);
      }
    }
    console.log('');
    console.log('Termine a ' + new Date().toISOString());
  } finally {
    await browser.close();
  }
})();
