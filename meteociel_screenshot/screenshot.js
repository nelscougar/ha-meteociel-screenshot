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
  // 1. Recherche par proximite de texte "vent" (le plus fiable)
  const byText = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'))
      .map(img => {
        const r = img.getBoundingClientRect();
        return { img, x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
      })
      .filter(b => b.width > 250 && b.width < 900 && b.height > 100 && b.height < 350 && b.y > 200);

    const scored = imgs.map(b => {
      // Cherche le texte le plus proche AU-DESSUS de l'image (titre du graphique)
      let label = '';
      let el = b.img.previousElementSibling;
      let hops = 0;
      while (el && hops < 6 && !label) {
        label += ' ' + (el.textContent || '');
        el = el.previousElementSibling;
        hops++;
      }
      // Remonte aussi dans le parent si rien trouve au meme niveau
      if (!label.trim() && b.img.parentElement) {
        label = b.img.parentElement.textContent || '';
      }
      return {
        x: b.x, y: b.y, width: b.width, height: b.height,
        src: b.img.src || '', alt: b.img.alt || '',
        label: label.toLowerCase()
      };
    });

    return scored;
  });

  console.log('  Candidats (texte proche):');
  byText.forEach(c => console.log('    - ' + c.width + 'x' + c.height + ' @ ' + c.x + ',' + c.y + ' | label: "' + c.label.substring(0,60).trim() + '..."'));

  // Priorite 1 : contient "vent" et pas "temp" ni "pression"
  let match = byText.find(c => c.label.includes('vent') && !c.label.includes('temp') && !c.label.includes('pression'));

  // Priorite 2 : fallback -> le graphique le plus bas dans la page (vent = sous la temperature par defaut)
  if (!match && byText.length > 0) {
    const sortedByY = [...byText].sort((a, b) => b.y - a.y);
    match = sortedByY[0];
    console.log('  -> Aucun label "vent" trouve, fallback sur le graphique le plus bas');
  }

  if (match) {
    console.log('  -> Choisi: ' + match.width + 'x' + match.height + ' @ ' + match.x + ',' + match.y);
    return match;
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
