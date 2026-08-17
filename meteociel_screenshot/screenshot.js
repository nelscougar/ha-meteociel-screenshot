const { chromium } = require('playwright');

const CAPTURES = [
  {
    name: 'knots',
    url: 'https://www.meteociel.fr/temps-reel/obs_villes.php?code2=7681&affint=1',
    output: '/config/www/meteociel_vent_knots.png',
    wait: 3000,
    mode: 'single'      // une seule image sur toute la page
  },
  {
    name: 'kmh',
    url: 'https://www.meteociel.fr/temps-reel/obs_villes.php?code2=83061007&affint=1',
    output: '/config/www/meteociel_vent.png',
    wait: 2000,
    mode: 'grid',        // grille de graphiques, on prend ligne 2 / colonne 1
    targetRow: 2,
    targetCol: 1
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

async function getCandidateImages(page) {
  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img'))
      .map(img => {
        const r = img.getBoundingClientRect();
        return {
          x: Math.round(r.x), y: Math.round(r.y),
          width: Math.round(r.width), height: Math.round(r.height)
        };
      })
      .filter(b => b.width > 250 && b.width < 900 && b.height > 100 && b.height < 350 && b.y > 150);
  });
}

async function findGraphBoxSingle(page) {
  const imgs = await getCandidateImages(page);
  console.log('  ' + imgs.length + ' image(s) candidate(s) trouvee(s)');

  if (imgs.length === 0) {
    return { isFallback: true };
  }

  // Une seule image attendue : on prend la premiere
  const chosen = imgs[0];
  console.log('  -> Choisi (image unique): ' + chosen.width + 'x' + chosen.height + ' @ ' + chosen.x + ',' + chosen.y);
  return chosen;
}

async function findGraphBoxGrid(page, targetRow, targetCol) {
  const imgs = await getCandidateImages(page);
  console.log('  ' + imgs.length + ' image(s) candidate(s) trouvee(s)');

  if (imgs.length === 0) {
    return { isFallback: true };
  }

  const rows = [];
  const sortedByY = [...imgs].sort((a, b) => a.y - b.y);
  for (const img of sortedByY) {
    let row = rows.find(r => Math.abs(r[0].y - img.y) < 30);
    if (row) {
      row.push(img);
    } else {
      rows.push([img]);
    }
  }
  rows.forEach(row => row.sort((a, b) => a.x - b.x));

  console.log('  Grille detectee: ' + rows.length + ' ligne(s)');
  rows.forEach((row, i) => {
    console.log('    Ligne ' + (i + 1) + ': ' + row.length + ' colonne(s)');
    row.forEach((img, j) => {
      console.log('      Col ' + (j + 1) + ': ' + img.width + 'x' + img.height + ' @ ' + img.x + ',' + img.y);
    });
  });

  const rowIndex = targetRow - 1;
  const colIndex = targetCol - 1;

  if (rows[rowIndex] && rows[rowIndex][colIndex]) {
    const chosen = rows[rowIndex][colIndex];
    console.log('  -> Choisi: ligne ' + targetRow + ', colonne ' + targetCol + ' = ' + chosen.width + 'x' + chosen.height + ' @ ' + chosen.x + ',' + chosen.y);
    return chosen;
  }

  console.log('  ATTENTION: position ligne ' + targetRow + '/colonne ' + targetCol + ' introuvable');
  return { isFallback: true };
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

    const box = config.mode === 'single'
      ? await findGraphBoxSingle(page)
      : await findGraphBoxGrid(page, config.targetRow, config.targetCol);

    if (box.isFallback) {
      console.log('  ERREUR: graphique introuvable, capture annulee pour ' + config.name);
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
