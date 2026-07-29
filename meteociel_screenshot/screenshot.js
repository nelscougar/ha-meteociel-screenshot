const { chromium } = require('playwright');

const URL = 'https://www.meteociel.fr/temps-reel/obs_villes.php?code2=7681&affint=1';
const OUTPUT = '/config/www/meteociel_vent.png';

// ┌─────────────────────────────────────────────────────────────┐
// │  RECADRAGE — JUSTE LE GRAPHIQUE                             │
// │  Viewport: 2000×1200  →  zone du graphique en pixels          │
// │  Axe Y (0-30) + Axe X (0-13) + courbes + légende            │
// │  Rien d'autre !  —  Pas besoin de sharp, Playwright gère    │
// └─────────────────────────────────────────────────────────────┘
const CLIP = {
  x: 605,       // ← après la bordure bleue, avant l'axe Y
  y: 435,       // ← juste sous la barre "Date : 29 juillet"
  width: 485,   // ← jusqu'à la fin de l'axe X
  height: 180   // ← du "30" jusqu'à la légende "Vent moyen/en rafales"
};

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

async function captureOnce() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await closeCookieBanner(page);
    await page.waitForTimeout(2000);

    // Capture UNIQUEMENT la zone du graphique — pas besoin de sharp !
    await page.screenshot({
      path: OUTPUT,
      clip: CLIP
    });

    console.log(`✅ Graphique recadré : ${OUTPUT}`);
    console.log(`   Dimensions finales : ${CLIP.width}×${CLIP.height}`);
    console.log(`   Zone extraite      : x=${CLIP.x}, y=${CLIP.y}`);
    console.log(`   Heure              : ${new Date().toISOString()}`);

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
