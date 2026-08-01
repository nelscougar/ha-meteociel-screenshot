const { chromium } = require('playwright');

const URL = 'https://www.weatherlink.com/embeddablePage/show/d8f389c51427467eb5c4f266caaf78a9/summary';
const HA_URL = 'http://supervisor/core/api/states';
const TOKEN = process.env.SUPERVISOR_TOKEN;

function parseNumber(str) {
  if (!str) return null;
  const match = str.replace(',', '.').match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

const toKmh = (knots) => (knots != null ? +(knots * 1.852).toFixed(1) : null);

async function pushSensor(entityId, state, attributes) {
  console.log(`--> Envoi ${entityId} = ${state}`);
  try {
    const res = await fetch(`${HA_URL}/${entityId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ state, attributes })
    });
    const text = await res.text();
    console.log(`    Réponse HA: HTTP ${res.status} - ${text.slice(0, 200)}`);
  } catch (err) {
    console.error(`    Exception réseau lors de l'envoi de ${entityId}:`, err.message);
  }
}

async function scrape() {
  console.log('=== Début du cycle ===');
  console.log('TOKEN présent ?', TOKEN ? `oui (longueur ${TOKEN.length})` : 'NON - PROBLEME');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  try {
    console.log('Chargement de la page WeatherLink...');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Page chargée.');

    try {
      await page.waitForFunction(
        () => document.body.innerText.includes('Vitesse du vent'),
        null,
        { timeout: 20000 }
      );
      console.log('Texte "Vitesse du vent" trouvé sur la page.');
    } catch (e) {
      console.log('ATTENTION: texte "Vitesse du vent" non trouvé après 20s, on tente quand même.');
      console.log('Aperçu texte page:', (await page.innerText('body')).slice(0, 500));
    }

    await page.waitForTimeout(1000);

    const rows = await page.$$eval('table tr', trs =>
      trs.map(tr => Array.from(tr.querySelectorAll('th,td')).map(td => td.textContent.trim()))
    );

    console.log(`Nombre de lignes de tableau trouvées: ${rows.length}`);
    console.log('DEBUG lignes extraites:', JSON.stringify(rows.slice(0, 15)));

    const findRow = (label) =>
      rows.find(cells => cells[0] && cells[0].toLowerCase().includes(label.toLowerCase()));

    const ventInstant = findRow('vitesse du vent');
    const direction = findRow('direction du vent');
    const ventMoyen = findRow('vitesse moyenne du vent');
    const rafales = findRow('vitesse des rafales de vent');

    console.log('Ligne ventInstant:', ventInstant);
    console.log('Ligne direction:', direction);
    console.log('Ligne ventMoyen:', ventMoyen);
    console.log('Ligne rafales:', rafales);

    if (ventInstant) {
      const kmh = toKmh(parseNumber(ventInstant[1]));
      if (kmh != null) {
        await pushSensor('sensor.weatherlink_vent_instantane', kmh, {
          unit_of_measurement: 'km/h',
          friendly_name: 'Vent instantané',
          device_class: 'wind_speed',
          state_class: 'measurement'
        });
      } else {
        console.log('kmh instantané = null, valeur non envoyée. Texte source:', ventInstant[1]);
      }
    } else {
      console.log('Aucune ligne "vitesse du vent" trouvée.');
    }

    if (direction) {
      const match = direction[1].match(/([A-Z]{1,3})\s*(\d+)?/);
      if (match && match[2]) {
        await pushSensor('sensor.weatherlink_direction_vent', parseInt(match[2], 10), {
          unit_of_measurement: '°',
          friendly_name: 'Direction du vent',
          compass: match[1]
        });
      } else {
        console.log('Direction non parsable. Texte source:', direction[1]);
      }
    } else {
      console.log('Aucune ligne "direction du vent" trouvée.');
    }

    if (ventMoyen) {
      const kmh = toKmh(parseNumber(ventMoyen[1]));
      if (kmh != null) {
        await pushSensor('sensor.weatherlink_vent_moyen', kmh, {
          unit_of_measurement: 'km/h',
          friendly_name: 'Vent moyen (2 min)',
          device_class: 'wind_speed',
          state_class: 'measurement'
        });
      } else {
        console.log('kmh moyen = null. Texte source:', ventMoyen[1]);
      }
    } else {
      console.log('Aucune ligne "vitesse moyenne du vent" trouvée.');
    }

    if (rafales) {
      const kmh = toKmh(parseNumber(rafales[1]) ?? parseNumber(rafales[2]));
      if (kmh != null) {
        await pushSensor('sensor.weatherlink_rafales', kmh, {
          unit_of_measurement: 'km/h',
          friendly_name: 'Rafales de vent',
          device_class: 'wind_speed',
          state_class: 'measurement'
        });
      } else {
        console.log('kmh rafales = null. Texte source:', rafales);
      }
    } else {
      console.log('Aucune ligne "vitesse des rafales de vent" trouvée.');
    }
  } finally {
    await browser.close();
    console.log('=== Fin du cycle ===');
  }
}

(async () => {
  try {
    await scrape();
  } catch (err) {
    console.error('Échec cycle:', err.message);
  }
})();
