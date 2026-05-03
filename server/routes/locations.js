const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const db = require('../db');
const { sendServerError } = require('../utils/httpError');

const router = express.Router();
const BD_API = 'https://bdapis.com/api/v1.2';
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';

let thanaSupplement = {};
try {
  thanaSupplement = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/bd-thana-supplement.json'), 'utf8')
  );
} catch {
  thanaSupplement = {};
}

/** Merge bdapis upazilas + local “thana / area” lists (dedupe, sort). */
function mergeThanasForDistrict(districtName, apiList) {
  const dn = String(districtName || '').trim();
  const extra = thanaSupplement[dn] || [];
  const map = new Map();
  [...(apiList || []), ...extra].forEach((name) => {
    const k = String(name).trim();
    if (!k) return;
    map.set(k.toLowerCase(), k);
  });
  return [...map.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

async function getInsideDhakaDistricts() {
  const [rows] = await db.query(
    'SELECT setting_value FROM settings WHERE setting_key = ?',
    ['inside_dhaka_districts']
  );
  const raw = rows[0]?.setting_value;
  if (!raw || !String(raw).trim()) {
    return ['Dhaka', 'Narayanganj', 'Gazipur', 'Munshiganj', 'Manikganj', 'Narsingdi'].map((x) =>
      x.toLowerCase()
    );
  }
  return String(raw)
    .split(/[,|]/g)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeDistrictToken(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/\s+district$/i, '')
    .trim();
}

function guessDistrictFromNominatim(addr) {
  if (!addr || typeof addr !== 'object') return '';
  const candidates = [
    addr.county,
    addr.city,
    addr.town,
    addr.state_district,
    addr.municipality,
    addr.hamlet,
    addr.village,
    addr.suburb,
  ].filter(Boolean);
  const joined = candidates.map((c) => String(c)).join(' ');
  for (const c of candidates) {
    const t = String(c).trim();
    if (t && t.length > 1) return t;
  }
  return joined.trim();
}

/** Districts list (public — used by checkout). */
router.get('/districts', async (req, res) => {
  try {
    const { data } = await axios.get(`${BD_API}/districts`, {
      timeout: 20000,
      headers: { Accept: 'application/json' },
    });
    const list = Array.isArray(data.data)
      ? data.data.map((d) => ({
          name: d.district,
          bn: d.districtbn,
          coordinates: d.coordinates,
        }))
      : [];
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    res.json(list);
  } catch (error) {
    return sendServerError(res, 'Unable to load districts', error);
  }
});

/** Thanas / areas for a district (bdapis upazilas + supplemental city thanas). */
router.get('/upazilas', async (req, res) => {
  try {
    const name = req.query.district;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Query "district" is required' });
    }
    const enc = encodeURIComponent(String(name).trim());
    const { data } = await axios.get(`${BD_API}/district/${enc}`, {
      timeout: 20000,
      headers: { Accept: 'application/json' },
    });
    const row = Array.isArray(data.data) ? data.data[0] : null;
    const apiList =
      row && Array.isArray(row.upazillas)
        ? row.upazillas
        : row && Array.isArray(row.upazilas)
          ? row.upazilas
          : [];
    const merged = mergeThanasForDistrict(String(name).trim(), apiList);
    res.json(merged);
  } catch (error) {
    if (error.response?.status === 404) {
      const name = req.query.district;
      const fallback = name ? mergeThanasForDistrict(String(name).trim(), []) : [];
      return res.json(fallback);
    }
    return sendServerError(res, 'Unable to load thanas', error);
  }
});

/**
 * Reverse geocode lat/lng → suggest district, inside/outside Dhaka (uses admin "inside_dhaka_districts").
 */
router.post('/reverse-geo', async (req, res) => {
  try {
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: 'lat and lng are required' });
    }

    const { data } = await axios.get(NOMINATIM, {
      params: {
        lat,
        lon: lng,
        format: 'json',
        addressdetails: 1,
        zoom: 10,
      },
      timeout: 20000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'QismatStore/1.0 (checkout location; contact via store website)',
      },
    });

    const addr = data.address || {};
    const displayName = data.display_name || '';
    const insideSet = await getInsideDhakaDistricts();

    const haystack = [
      addr.county,
      addr.city,
      addr.town,
      addr.state_district,
      addr.state,
      addr.region,
      displayName,
    ]
      .filter(Boolean)
      .map((x) => normalizeDistrictToken(x))
      .join(' ');

    const districtGuess = guessDistrictFromNominatim(addr);
    const dgNorm = districtGuess ? normalizeDistrictToken(districtGuess) : '';

    let matchedInside = false;
    for (const d of insideSet) {
      if (!d) continue;
      if (haystack.includes(d) || haystack.includes(d.replace(/\s+/g, ''))) {
        matchedInside = true;
        break;
      }
      if (dgNorm && (dgNorm === d || dgNorm.includes(d) || d.includes(dgNorm))) {
        matchedInside = true;
        break;
      }
    }
    const thanaGuess =
      addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city || '';

    res.json({
      insideDhaka: matchedInside,
      districtGuess: districtGuess || '',
      thanaGuess: thanaGuess ? String(thanaGuess) : '',
      displayName,
      lat,
      lng,
      rawAddress: addr,
    });
  } catch (error) {
    return sendServerError(res, 'Unable to resolve location', error);
  }
});

module.exports = router;
