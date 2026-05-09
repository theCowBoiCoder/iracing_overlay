const CATEGORY_ALIASES = {
  oval: ['oval'],
  sports_car: ['sports_car', 'sports car', 'road'],
  formula_car: ['formula_car', 'formula car', 'formula'],
  dirt_oval: ['dirt_oval', 'dirt oval'],
  dirt_road: ['dirt_road', 'dirt road']
};

export function emptyState(defaultCategory) {
  return {
    status: 'loading',
    driver: null,
    selectedCategory: defaultCategory,
    categories: [],
    baseline: {},
    previous: {},
    lastUpdatedAt: null,
    lastCheckedAt: null,
    error: null
  };
}

export function buildOverlayState({ previous, profile, defaultCategory }) {
  const categories = extractLicenses(profile);
  const now = new Date().toISOString();
  const previousById = Object.fromEntries((previous.categories || []).map((item) => [item.id, item]));
  const baseline = { ...(previous.baseline || {}) };

  for (const category of categories) {
    if (!baseline[category.id]) {
      baseline[category.id] = {
        irating: category.irating,
        safetyRating: category.safetyRating,
        capturedAt: now
      };
    }

    const base = baseline[category.id];
    const prior = previousById[category.id];
    category.iratingDelta = nullableDiff(category.irating, base.irating);
    category.safetyDelta = roundedDiff(category.safetyRating, base.safetyRating);
    category.lastIRatingDelta = nullableDiff(category.irating, prior?.irating);
    category.lastSafetyDelta = roundedDiff(category.safetyRating, prior?.safetyRating);
  }

  return {
    status: 'ok',
    driver: extractDriver(profile),
    selectedCategory: pickCategory(previous.selectedCategory || defaultCategory, categories),
    categories,
    baseline,
    previous: Object.fromEntries(categories.map((item) => [item.id, {
      irating: item.irating,
      safetyRating: item.safetyRating
    }])),
    lastUpdatedAt: now,
    lastCheckedAt: now,
    error: null
  };
}

function extractDriver(profile) {
  const member = profile?.member_info || profile?.member || profile;
  return {
    custId: member?.cust_id ?? profile?.cust_id ?? null,
    displayName: member?.display_name || member?.displayName || null
  };
}

export function resetBaseline(state) {
  const now = new Date().toISOString();
  return {
    ...state,
    baseline: Object.fromEntries((state.categories || []).map((category) => [category.id, {
      irating: category.irating,
      safetyRating: category.safetyRating,
      capturedAt: now
    }]))
  };
}

function extractLicenses(profile) {
  const source = profile?.member_info?.licenses || profile?.licenses || profile?.member?.licenses || [];
  const licenses = Array.isArray(source)
    ? source
    : Object.entries(source).map(([key, value]) => ({ ...value, _categoryKey: key }));

  return licenses
    .map(normalizeLicense)
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

function normalizeLicense(license) {
  const groupName = String(
    license._categoryKey ||
    license.category ||
    license.category_name ||
    license.group_name ||
    license.license_group ||
    license.license_category ||
    ''
  );
  const id = categoryId(groupName);
  if (!id) return null;

  return {
    id,
    label: labelFor(id),
    className: licenseClassName(license),
    classColor: license.color || license.license_color || '#ffffff',
    safetyRating: numberOrNull(license.safety_rating ?? license.sr ?? license.safety),
    irating: numberOrNull(license.irating ?? license.i_rating ?? license.rating),
    ttRating: numberOrNull(license.tt_rating ?? license.ttrating),
    order: orderFor(id)
  };
}

function categoryId(value) {
  const key = value.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (CATEGORY_ALIASES[key]) return key;

  for (const [id, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((alias) => key === alias.replaceAll(' ', '_'))) return id;
  }
  return null;
}

function licenseClassName(license) {
  const direct = [
    license.license_class,
    license.license_class_name,
    license.class_name,
    license.class,
    license.license,
    license.group_name
  ].find((value) => {
    if (!value) return false;
    const text = String(value).toLowerCase();
    return !categoryId(text);
  });

  if (direct) return cleanClassName(direct);

  const level = numberOrNull(license.license_level ?? license.licenseLevel);
  const groupId = numberOrNull(license.group_id ?? license.groupId);
  return classFromGroup(groupId) || classFromLevel(level);
}

function cleanClassName(value) {
  const text = String(value).trim();
  if (/^class\s+/i.test(text) || /^pro/i.test(text) || /^rookie/i.test(text)) return text;
  if (/^[abcdr]$/i.test(text)) return `Class ${text.toUpperCase()}`;
  return text;
}

function classFromLevel(level) {
  if (level >= 17) return 'Class A';
  if (level >= 13) return 'Class B';
  if (level >= 9) return 'Class C';
  if (level >= 5) return 'Class D';
  if (level >= 0) return 'Rookie';
  return 'License';
}

function classFromGroup(groupId) {
  return {
    1: 'Rookie',
    2: 'Class D',
    3: 'Class C',
    4: 'Class B',
    5: 'Class A',
    6: 'Pro',
    7: 'Pro/WC'
  }[groupId] || null;
}

function labelFor(id) {
  return {
    oval: 'Oval',
    sports_car: 'Sports Car',
    formula_car: 'Formula Car',
    dirt_oval: 'Dirt Oval',
    dirt_road: 'Dirt Road'
  }[id] || id;
}

function orderFor(id) {
  return ['sports_car', 'formula_car', 'oval', 'dirt_oval', 'dirt_road'].indexOf(id);
}

function pickCategory(preferred, categories) {
  if (categories.some((category) => category.id === preferred)) return preferred;
  return categories[0]?.id || preferred;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableDiff(current, base) {
  if (current === null || current === undefined || base === null || base === undefined) return null;
  return current - base;
}

function roundedDiff(current, base) {
  const diff = nullableDiff(current, base);
  return diff === null ? null : Math.round(diff * 100) / 100;
}
