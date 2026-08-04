import { config } from 'dotenv';
config({ path: '.env' });

const TOKEN = process.env.META_ACCESS_TOKEN;
const ACCT  = process.env.META_AD_ACCOUNT_ID;
const PAGE  = '1087394517790815'; // Estrevia FB Page
const API   = 'https://graph.facebook.com/v23.0';

// 4 EN + 4 ES creatives to add to Lead campaign.
// image_hash values are already in Meta's image pool for this ad account
// (uploaded during LPV/EN-launch campaigns). We're only creating new
// adcreative + ad records that reference them.
const SPEC = [
  // ─── EN angles ────────────────────────────────────────────────────────
  {
    nick: 'en_swiss',
    locale: 'en',
    utm_content: '1hjqz970n7gROjXMSWoIf',
    image_hash: 'b8526af3f4c1acda484541cc41f36e63',
    name: 'Estrevia calculates planetary positions',
    message:
      'Estrevia calculates planetary positions using Swiss Ephemeris — the same data set used by professional astronomers.',
  },
  {
    nick: 'en_lahiri',
    locale: 'en',
    utm_content: 'YOfR7iH3dWukHy_QRiUA8',
    image_hash: '240513a2f58e4cfc5a877e189a3070bf',
    name: 'Estrevia uses the Lahiri ayanamsa',
    message:
      'Estrevia uses the Lahiri ayanamsa — the official standard adopted by the Indian Government in 1957.',
  },
  {
    nick: 'en_combinations',
    locale: 'en',
    utm_content: 'hCJDyrhbX4eo4paA7yXtk',
    image_hash: 'd41bb66ef020be1982ae7221c970107b',
    name: '1,728 distinct natal configurations',
    message:
      '12 sun signs × 12 moon signs × 12 ascendants = 1,728 distinct configurations. Each occurs in roughly 0.06% of natal charts.',
  },
  {
    nick: 'en_passport',
    locale: 'en',
    utm_content: '10yyJJib6xRab1oOCGh0r',
    image_hash: '8cd3d6f76b62c8fe973f328c9bc1e095',
    name: 'The Cosmic Passport is shareable',
    message:
      'The Cosmic Passport is shareable. Calculate, get the rarity score, post it.',
  },
  // ─── ES angles (CTA upgraded to LEARN_MORE) ───────────────────────────
  {
    nick: 'es_swiss',
    locale: 'es',
    utm_content: 'jIH2zZN3jqkr7pUDkTqWR',
    image_hash: 'b48b550e83c91b2d460b8cb2b3154f9d',
    name: 'Estrevia calcula posiciones planetarias',
    message:
      'Estrevia calcula posiciones planetarias con Swiss Ephemeris — el mismo conjunto de datos que usan los astrónomos profesionales.',
  },
  {
    nick: 'es_lahiri',
    locale: 'es',
    utm_content: 'gIxaJDLc5DjblVOLN_MEh',
    image_hash: '11e291566ace5307779ba66e89f24947',
    name: 'Estrevia usa el ayanamsa Lahiri',
    message:
      'Estrevia usa el ayanamsa Lahiri — el estándar oficial adoptado por el Gobierno de la India en 1957.',
  },
  {
    nick: 'es_combinations',
    locale: 'es',
    utm_content: 'sO1_DWaqethKHCSsOl2Z2',
    image_hash: 'fe12f02b0b99552d3558164e3d29a98d',
    name: '1.728 configuraciones distintas',
    message:
      '12 signos solares × 12 signos lunares × 12 ascendentes = 1.728 configuraciones distintas. Cada una ocurre en aproximadamente el 0,06% de las cartas natales.',
  },
  {
    nick: 'es_passport',
    locale: 'es',
    utm_content: 'OJDe0Ohnrrk1WEr6-v9WE',
    image_hash: '93586e489a25564b839f0e8f729e71ba',
    name: 'El Pasaporte Cósmico se puede compartir',
    message:
      'El Pasaporte Cósmico se puede compartir. Calcula, obtén el puntaje de rareza, publícalo.',
  },
];

const AD_SET_BY_LOCALE = {
  en: '120243116854610527', // EN — Launch — Lead — Tier-1 (no EU)
  es: '120243116822500527', // ES — Launch — Lead — LATAM USD
};

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { _raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

async function createAdcreative(spec) {
  const link = `https://estrevia.app/?utm_source=meta&utm_medium=image&utm_campaign=estrevia_lead_${spec.locale}&utm_content=${spec.utm_content}&utm_term=${spec.locale}`;
  const body = {
    name: `lead_${spec.nick}_2026-05-17`,
    object_story_spec: {
      page_id: PAGE,
      link_data: {
        link,
        message: spec.message,
        name: spec.name,
        image_hash: spec.image_hash,
        call_to_action: {
          type: 'LEARN_MORE',
          value: { link },
        },
      },
    },
    access_token: TOKEN,
  };
  return postJson(`${API}/${ACCT}/adcreatives`, body);
}

async function createAd(adsetId, creativeId, nick) {
  const body = {
    name: `ad_lead_${nick}_2026-05-17`,
    adset_id: adsetId,
    creative: { creative_id: creativeId },
    status: 'ACTIVE',
    access_token: TOKEN,
  };
  return postJson(`${API}/${ACCT}/ads`, body);
}

console.log(`Adding ${SPEC.length} creatives to Lead campaign…\n`);

const results = [];
for (const spec of SPEC) {
  process.stdout.write(`[${spec.nick}] adcreative … `);
  const c = await createAdcreative(spec);
  if (!c.ok) {
    console.log(`FAIL ${c.status}: ${JSON.stringify(c.data).slice(0, 200)}`);
    results.push({ nick: spec.nick, step: 'creative', ok: false, err: c.data });
    continue;
  }
  const creativeId = c.data.id;
  process.stdout.write(`#${creativeId} → ad … `);

  const adsetId = AD_SET_BY_LOCALE[spec.locale];
  const a = await createAd(adsetId, creativeId, spec.nick);
  if (!a.ok) {
    console.log(`FAIL ${a.status}: ${JSON.stringify(a.data).slice(0, 200)}`);
    results.push({ nick: spec.nick, step: 'ad', ok: false, creativeId, err: a.data });
    continue;
  }
  console.log(`#${a.data.id} ACTIVE`);
  results.push({ nick: spec.nick, creativeId, adId: a.data.id, ok: true });
}

console.log('\n=== Summary ===');
console.log(`OK:    ${results.filter((r) => r.ok).length}/${results.length}`);
console.log(`FAIL:  ${results.filter((r) => !r.ok).length}/${results.length}`);
console.log(JSON.stringify(results, null, 2));
