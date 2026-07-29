const { chromium } = require('playwright');

const URL = 'https://www.meteociel.fr/temps-reel/obs_villes.php?code2=7681&affint=1';
const OUTPUT = '/config/www/meteociel_vent.png';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Fermer le bandeau cookies s'il apparaît
    try {
      const consentButton = page.getByText('Continue without accepting', { exact: false });
      await consentButton.click({ timeout: 5000 });
      console.log('Bandeau cookies fermé.');
    } catch (e) {
      console.log('Pas de bandeau cookies détecté (ou déjà fermé).');
    }

    await page.waitForTimeout(2000); // laisse le graphique JS finir de se dessiner
    await page.screenshot({ path: OUTPUT });
    console.log(`Capture enregistrée: ${new Date().toISOString()}`);
  } catch (err) {
    console.error('Erreur capture:', err);
  } finally {
    await browser.close();
  }
})();
