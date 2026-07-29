const { chromium } = require('playwright');

const URL = 'https://www.meteociel.fr/temps-reel/obs_villes.php?code2=7681&affint=1';
const OUTPUT = '/config/www/meteociel_vent.png';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000); // laisse le graphique JS finir de se dessiner
    await page.screenshot({ path: OUTPUT }); // pleine page, pour repérer les coordonnées
    console.log(`Capture enregistrée: ${new Date().toISOString()}`);
  } catch (err) {
    console.error('Erreur capture:', err);
  } finally {
    await browser.close();
  }
})();