const { chromium } = require('playwright');

const URL = 'https://www.meteociel.fr/temps-reel/obs_villes.php?code2=7681&affint=1';
const OUTPUT = '/config/www/meteociel_vent.png';

async function captureOnce() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    try {
      const consentButton = page.getByText('Continue without accepting', { exact: false });
      await consentButton.click({ timeout: 5000 });
    } catch (e) {
      // pas de bandeau, on continue
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: OUTPUT });
    console.log(`Capture enregistrée: ${new Date().toISOString()}`);
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
