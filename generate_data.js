const fs = require('fs');
const path = require('path');

const years = [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033];

const regions = {
  'North America': ['U.S.', 'Canada'],
  Europe: ['U.K.', 'Germany', 'Italy', 'France', 'Spain', 'Russia', 'Rest of Europe'],
  'Asia Pacific': ['China', 'India', 'Japan', 'South Korea', 'ASEAN', 'Australia', 'Rest of Asia Pacific'],
  'Latin America': ['Brazil', 'Argentina', 'Mexico', 'Rest of Latin America'],
  'Middle East & Africa': ['GCC', 'South Africa', 'Rest of Middle East & Africa'],
};

const regionBaseValues = {
  'North America': 118,
  Europe: 92,
  'Asia Pacific': 68,
  'Latin America': 24,
  'Middle East & Africa': 18,
};

const countryShares = {
  'North America': { 'U.S.': 0.82, Canada: 0.18 },
  Europe: { 'U.K.': 0.18, Germany: 0.22, Italy: 0.12, France: 0.16, Spain: 0.1, Russia: 0.08, 'Rest of Europe': 0.14 },
  'Asia Pacific': { China: 0.28, India: 0.12, Japan: 0.25, 'South Korea': 0.12, ASEAN: 0.1, Australia: 0.07, 'Rest of Asia Pacific': 0.06 },
  'Latin America': { Brazil: 0.45, Argentina: 0.15, Mexico: 0.25, 'Rest of Latin America': 0.15 },
  'Middle East & Africa': { GCC: 0.45, 'South Africa': 0.25, 'Rest of Middle East & Africa': 0.3 },
};

const regionGrowthRates = {
  'North America': 0.092,
  Europe: 0.078,
  'Asia Pacific': 0.105,
  'Latin America': 0.088,
  'Middle East & Africa': 0.081,
};

/** Leaf paths (segment > sub-segment > …) with relative weights; normalized per segment type. */
const BY_TYPE_LEAVES = [
  // Image 1 — By Product Type
  [['Connectors', 'Power Connectors'], 1],
  [['Connectors', 'Control and Signal Connectors'], 1],
  [['Connectors', 'Data and Communication Connectors'], 1],
  [['Connectors', 'Fiber Optic Connectors'], 1],
  [['Cable Termination Products', 'Lugs'], 1],
  [['Cable Termination Products', 'Ferrules'], 1],
  [['Cable Termination Products', 'Crimp Terminals'], 1],
  [['Cable Termination Products', 'Splices and Joints'], 1],
  [['Terminal Blocks', 'Feed-Through Terminal Blocks'], 1],
  [['Terminal Blocks', 'Ground Terminal Blocks'], 1],
  [['Terminal Blocks', 'Fuse and Disconnect Terminal Blocks'], 1],
  [['Terminal Blocks', 'Interface and Relay Terminal Blocks'], 1],
  [
    ['Power Distribution and Busway Systems', 'Power Distribution Blocks', 'Fixed Distribution Blocks'],
    0.9,
  ],
  [
    ['Power Distribution and Busway Systems', 'Power Distribution Blocks', 'Modular Distribution Blocks'],
    0.95,
  ],
  [
    ['Power Distribution and Busway Systems', 'Power Distribution Blocks', 'Covered Distribution Blocks'],
    0.85,
  ],
  [
    ['Power Distribution and Busway Systems', 'Power Distribution Blocks', 'High-Current Distribution Blocks'],
    1.1,
  ],
  [['Power Distribution and Busway Systems', 'Busbar Trunking / Busway Systems'], 1.15],
  [['Power Distribution and Busway Systems', 'Busway Tap-Off Units and Accessories'], 1],
  [['Cable Entry and Fittings', 'Cable Glands'], 1.2],
  [['Cable Entry and Fittings', 'Conduit Fittings'], 1],
  [
    ['Cable Entry and Fittings', 'Adapters, Reducers, Locknuts, and Seals'],
    0.95,
  ],
  [['Cable Entry and Fittings', 'Cable Entry Sealing Systems'], 1],
  [['Cable Entry and Fittings', 'Brush Entry Plates'], 0.8],
  [['Cable Routing and Support Systems'], 1.25],
  // Image 2 — additional product-type lines
  [['Cable Trays and Ladders'], 1.1],
  [['Trunking, Ducts, and Raceways'], 1.05],
  [['Wire Basket Trays'], 0.95],
  [['Ladder Rack and Overhead Runway Systems'], 0.9],
  [['Cable Clips, Clamps, and Saddles'], 1],
  [['Cable Identification and Fastening Products', 'Cable Ties'], 1],
  [['Cable Identification and Fastening Products', 'Cable Markers and Labels'], 0.9],
  [
    ['Cable Identification and Fastening Products', 'Heat-Shrink Identification Sleeves'],
    0.85,
  ],
  [
    ['Cable Identification and Fastening Products', 'Hook-and-Loop Fastening Systems'],
    0.75,
  ],
  [['Conduit and Mechanical Protection Systems', 'Rigid Conduit'], 1.1],
  [['Conduit and Mechanical Protection Systems', 'Flexible Conduit'], 1],
  [['Conduit and Mechanical Protection Systems', 'Sleeves and Protective Tubing'], 0.95],
  [['Grounding and Bonding Products', 'Ground Lugs'], 1],
  [['Grounding and Bonding Products', 'Bonding Jumpers'], 0.9],
  [['Grounding and Bonding Products', 'Ground Bars'], 0.95],
  [['Grounding and Bonding Products', 'Earthing Accessories'], 0.85],
  [['Junction and Installation Accessories', 'Junction Boxes and Enclosures'], 1.15],
  [['Junction and Installation Accessories', 'Mounting and Fixing Accessories'], 1],
  [['Junction and Installation Accessories', 'Sealing and Insulating Accessories'], 0.95],
];

const BY_ORGAN_TYPE_LEAVES = [
  [['New Build Installation'], 1.15],
  [['Expansion and Brownfield Addition'], 1.05],
  [['Retrofit and Modernization'], 1],
  [['Maintenance, Repair, and Replacement'], 0.9],
];

const APPLICATION_LEAVES = [
  [['Power Distribution and Termination'], 1.2],
  [['Control and Instrumentation Wiring'], 1.05],
  [['Data, Telecom, and Low-Voltage Networking'], 1.1],
  [['Grounding, Bonding, and Safety'], 0.95],
  [['Cable Routing, Support, and Protection'], 1],
];

const BY_END_USER_LEAVES = [
  // Image 3
  [['Industrial Facilities', 'Discrete Manufacturing'], 1.1],
  [['Industrial Facilities', 'Process Industries'], 1.05],
  [['Industrial Facilities', 'Warehousing and Logistics Sites'], 0.95],
  [['Infrastructure Projects', 'Transport Infrastructure'], 1.08],
  [['Infrastructure Projects', 'Water and Wastewater Infrastructure'], 0.92],
  [['Infrastructure Projects', 'Telecom and Digital Infrastructure'], 1.12],
  [['Infrastructure Projects', 'Urban and Civic Infrastructure'], 1],
  [['Commercial Buildings'], 1.05],
  // Image 4
  [['Offices and Mixed-Use Buildings'], 1],
  [['Retail and Shopping Centers'], 0.95],
  [['Hotels and Hospitality Buildings'], 0.88],
  [['Residential Buildings', 'Single-Family Housing'], 0.92],
  [['Residential Buildings', 'Multi-Family Housing'], 1.02],
  [['Institutional and Public Buildings', 'Healthcare Facilities'], 1.05],
  [['Institutional and Public Buildings', 'Education Facilities'], 1],
  [['Institutional and Public Buildings', 'Government and Public Buildings'], 0.9],
  [['Utilities and Energy Sites', 'Power Generation Sites'], 1.1],
  [['Utilities and Energy Sites', 'Transmission and Distribution Sites'], 1.08],
  [['Utilities and Energy Sites', 'Renewable Energy Sites'], 1.15],
  [['Data Centers', 'Hyperscale Data Centers'], 1.2],
  [['Data Centers', 'Colocation Data Centers'], 1.05],
  [['Data Centers', 'Enterprise Data Centers'], 0.98],
  [['Data Centers', 'Edge and Micro Data Centers'], 1.1],
  [
    [
      'Others',
      'Marine and Offshore Non-Energy, Agriculture and Rural Installations',
    ],
    0.75,
  ],
];

/** Keys match UI / taxonomy slide headers (By Product Type, By Project Type, …). */
const SEGMENT_TYPE_LEAF_SPECS = {
  'By Product Type': BY_TYPE_LEAVES,
  'By Project Type': BY_ORGAN_TYPE_LEAVES,
  'By Application': APPLICATION_LEAVES,
  'By End-Use Sector': BY_END_USER_LEAVES,
};

let seed = 42;
function seededRandom() {
  seed = (seed * 16807 + 0) % 2147483647;
  return (seed - 1) / 2147483646;
}

function addNoise(value, noiseLevel = 0.03) {
  return value * (1 + (seededRandom() - 0.5) * 2 * noiseLevel);
}

function roundTo1(val) {
  return Math.round(val * 10) / 10;
}

function roundToInt(val) {
  return Math.round(val);
}

function growthMultiplierForPath(pathParts) {
  const s = pathParts.join('|');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const t = (h % 1000) / 1000;
  return 0.88 + t * 0.28;
}

function normalizeWeights(specs) {
  const sum = specs.reduce((a, [, w]) => a + w, 0);
  return specs.map(([p, w]) => [p, w / sum]);
}

function generateTimeSeries(baseValue, growthRate, roundFn) {
  const series = {};
  for (let i = 0; i < years.length; i++) {
    const year = years[i];
    const rawValue = baseValue * Math.pow(1 + growthRate, i);
    series[year] = roundFn(addNoise(rawValue));
  }
  return series;
}

function insertLeaf(root, path, leafObj) {
  let n = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!n[key]) n[key] = {};
    n = n[key];
  }
  n[path[path.length - 1]] = leafObj;
}

function aggregateUp(node, roundFn) {
  const childKeys = Object.keys(node).filter(
    (k) =>
      !/^\d{4}$/.test(k) &&
      k !== 'CAGR' &&
      k !== '_aggregated' &&
      k !== '_level'
  );
  if (childKeys.length === 0) return;

  const yearTotals = {};
  for (const k of childKeys) {
    aggregateUp(node[k], roundFn);
    const c = node[k];
    if (c && typeof c === 'object') {
      for (const y of years) {
        if (typeof c[y] === 'number') yearTotals[y] = (yearTotals[y] || 0) + c[y];
      }
    }
  }
  for (const y of years) {
    node[y] = roundFn(yearTotals[y] || 0);
  }
  node._aggregated = true;
}

function buildSegmentTypeTree(segmentType, regionGrowth, regionBase, roundFn) {
  const specs = SEGMENT_TYPE_LEAF_SPECS[segmentType];
  const normalized = normalizeWeights(specs);
  const root = {};
  for (const [path, share] of normalized) {
    const mult = growthMultiplierForPath([segmentType, ...path]);
    const segGrowth = regionGrowth * mult;
    const leafBase = regionBase * share;
    const series = generateTimeSeries(leafBase, segGrowth, roundFn);
    insertLeaf(root, path, series);
  }
  for (const k of Object.keys(root)) {
    aggregateUp(root[k], roundFn);
  }
  return root;
}

function buildAllSegmentTrees(regionGrowth, regionBase, roundFn) {
  const out = {};
  for (const segmentType of Object.keys(SEGMENT_TYPE_LEAF_SPECS)) {
    out[segmentType] = buildSegmentTypeTree(segmentType, regionGrowth, regionBase, roundFn);
  }
  return out;
}

function buildByCountryTree(regionName, regionBase, regionGrowth, roundFn) {
  const countries = regions[regionName];
  const root = {};
  for (const country of countries) {
    const cShare = countryShares[regionName][country];
    const countryBase = regionBase * cShare;
    const countryGrowthVariation = 1 + (seededRandom() - 0.5) * 0.06;
    const countryGrowth = regionGrowth * countryGrowthVariation;
    root[country] = generateTimeSeries(countryBase, countryGrowth, roundFn);
  }
  return root;
}

function generateData(isVolume) {
  const data = {};
  const roundFn = isVolume ? roundToInt : roundTo1;
  const multiplier = isVolume ? 520 : 1;

  for (const [regionName, countries] of Object.entries(regions)) {
    const regionBase = regionBaseValues[regionName] * multiplier;
    const regionGrowth = regionGrowthRates[regionName];

    data[regionName] = {};
    const segTrees = buildAllSegmentTrees(regionGrowth, regionBase, roundFn);
    Object.assign(data[regionName], segTrees);

    data[regionName]['By Country'] = buildByCountryTree(
      regionName,
      regionBase,
      regionGrowth,
      roundFn
    );

    for (const country of countries) {
      const cShare = countryShares[regionName][country];
      const countryBase = regionBase * cShare;
      const countryGrowthVariation = 1 + (seededRandom() - 0.5) * 0.04;
      const countryGrowth = regionGrowth * countryGrowthVariation;

      data[country] = {};
      const segTreesC = buildAllSegmentTrees(countryGrowth, countryBase, roundFn);
      Object.assign(data[country], segTreesC);
    }
  }

  return data;
}

function stripToSegmentationStructure(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return {};
  const meta = (k) =>
    /^\d{4}$/.test(k) || k === 'CAGR' || k === '_aggregated' || k === '_level';
  const childKeys = Object.keys(node).filter((k) => !meta(k));
  if (childKeys.length === 0) return {};
  const out = {};
  for (const k of childKeys) {
    out[k] = stripToSegmentationStructure(node[k]);
  }
  return out;
}

// Generate datasets
seed = 42;
const valueData = generateData(false);
seed = 7777;
const volumeData = generateData(true);

const outDir = path.join(__dirname, 'public', 'data');
fs.writeFileSync(path.join(outDir, 'value.json'), JSON.stringify(valueData, null, 2));
fs.writeFileSync(path.join(outDir, 'volume.json'), JSON.stringify(volumeData, null, 2));

const naTemplate = stripToSegmentationStructure(valueData['North America']);
const segmentationAnalysis = {
  Global: {
    ...naTemplate,
    'By Region': {
      'North America': { 'U.S.': {}, Canada: {} },
      Europe: {
        'U.K.': {},
        Germany: {},
        Italy: {},
        France: {},
        Spain: {},
        Russia: {},
        'Rest of Europe': {},
      },
      'Asia Pacific': {
        China: {},
        India: {},
        Japan: {},
        'South Korea': {},
        ASEAN: {},
        Australia: {},
        'Rest of Asia Pacific': {},
      },
      'Latin America': {
        Brazil: {},
        Argentina: {},
        Mexico: {},
        'Rest of Latin America': {},
      },
      'Middle East & Africa': {
        GCC: {},
        'South Africa': {},
        'Rest of Middle East & Africa': {},
      },
    },
  },
};

fs.writeFileSync(
  path.join(outDir, 'segmentation_analysis.json'),
  JSON.stringify(segmentationAnalysis, null, 2)
);

console.log('Generated value.json, volume.json, segmentation_analysis.json');
console.log('Geographies (sample):', Object.keys(valueData).slice(0, 6));
console.log('Segment types:', Object.keys(valueData['North America']));
console.log(
  'By Product Type depth sample:',
  JSON.stringify(
    valueData['North America']['By Product Type']['Power Distribution and Busway Systems'],
    null,
    2
  ).slice(0, 400)
);
