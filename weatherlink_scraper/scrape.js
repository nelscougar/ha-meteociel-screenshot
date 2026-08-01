async function scrape() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Attendre que le tableau soit rempli (argument options en 3e position, pas 2e !)
    try {
      await page.waitForFunction(
        () => document.body.innerText.includes('Vitesse du vent'),
        null,
        { timeout: 20000 }
      );
    } catch (e) {
      console.log('Attente du texte "Vitesse du vent" expirée, on tente quand même l\'extraction.');
      console.log('Aperçu du texte de la page:', (await page.innerText('body')).slice(0, 500));
    }

    await page.waitForTimeout(1000);

    const rows = await page.$$eval('table tr', trs =>
      trs.map(tr => Array.from(tr.querySelectorAll('th,td')).map(td => td.textContent.trim()))
    );

    console.log('DEBUG lignes extraites:', JSON.stringify(rows.slice(0, 15)));

    const findRow = (label) =>
      rows.find(cells => cells[0] && cells[0].toLowerCase().includes(label.toLowerCase()));

    const ventInstant = findRow('vitesse du vent');
    const direction = findRow('direction du vent');
    const ventMoyen = findRow('vitesse moyenne du vent');
    const rafales = findRow('vitesse des rafales de vent');

    if (ventInstant) {
      const kmh = toKmh(parseNumber(ventInstant[1]));
      if (kmh != null) {
        await pushSensor('sensor.weatherlink_vent_instantane', kmh, {
          unit_of_measurement: 'km/h',
          friendly_name: 'Vent instantané',
          device_class: 'wind_speed',
          state_class: 'measurement'
        });
      }
    }

    if (direction) {
      const match = direction[1].match(/([A-Z]{1,3})\s*(\d+)?/);
      if (match && match[2]) {
        await pushSensor('sensor.weatherlink_direction_vent', parseInt(match[2], 10), {
          unit_of_measurement: '°',
          friendly_name: 'Direction du vent',
          compass: match[1]
        });
      }
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
      }
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
      }
    }
  } finally {
    await browser.close();
  }
}
