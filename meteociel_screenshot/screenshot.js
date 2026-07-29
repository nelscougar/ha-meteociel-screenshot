const { chromium } = require('playwright');

const URL = 'https://www.meteociel.fr/temps-reel/obs_villes.php?code2=7681&affint=1';
const OUTPUT = '/config/www/meteociel_vent.png';

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
  console.log('Pas de bandeau cookies trouvé après plusieurs tentatives.');
  return false;
}

async function findGraphBox(page) {
  // ── 1. Essayer les sélecteurs connus pour Météociel ──
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
          console.log(`Graphique trouvé via sélecteur: ${sel}`);
          console.log(`  → x:${Math.round(box.x)} y:${Math.round(box.y)} w:${Math.round(box.width)} h:${Math.round(box.height)}`);
          return box;
        }
      }
    } catch (e) {}
  }

  // ── 2. Fallback : chercher le plus grand <img> de la page ──
  const candidates = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img'))
      .map(img => {
        const r = img.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
          src: img.src || '',
          alt: img.alt || ''
        };
      })
      .filter(b => b.width > 250 && b.height > 80 && b.width < 1000);
  });

  if (candidates.length > 0) {
    // Trier par aire décroissante
    candidates.sort((a, b) => (b.width * b.height) - (a.width * b.height));
    const best = candidates[0];
    console.log(`Graphique trouvé via scan (plus grand img) :`);
    console.log(`  → x:${best.x} y:${best.y} w:${best.width} h:${best.height}`);
    console.log(`  → src: ${best.src.substring(0, 80)}...`);
    return best;
  }

  // ── 3. Dernier recours : coordonnées manuelles corrigées ──
  console.log('⚠️ Graphique non détecté, fallback sur coordonnées manuelles');
  return { x: 560, y: 410, width: 530, height: 195 };
}

async function captureOnce() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await closeCookieBanner(page);
    await page.waitForTimeout(2000);

    const box = await findGraphBox(page);

    // Petit padding pour être sûr de tout capter (axes + légende)
    const clip = {
      x: Math.max(0, Math.round(box.x) - 2),
      y: Math.max(0, Math.round(box.y) - 2),
      width: Math.round(box.width) + 4,
      height: Math.round(box.height) + 4
    };

    await page.screenshot({ path: OUTPUT, clip });

    console.log(`✅ Capture enregistrée : ${OUTPUT}`);
    console.log(`   Dimensions : ${clip.width}×${clip.height}`);
    console.log(`   Heure      : ${new Date().toISOString()}`);

  } finally {
    await browser.close();
  }
}

(async () => {
  try {
    await captureOnce();
  } catch (err) {
    console.error('Échec, nouvelle tentative dans 10s:', err.message);
    await new Promise(r => setTimeout(r, 10000));
    try {
      await captureOnce();
    } catch (err2) {
      console.error('Deuxième échec, on abandonne ce cycle:', err2.message);
    }
  }
})();
