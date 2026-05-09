const params = new URLSearchParams(window.location.search);
const categoryParam = params.get('category');
const refreshMs = Math.max(Number(params.get('refresh') || 15), 5) * 1000;

const els = {
  driverName: document.querySelector('#driverName'),
  category: document.querySelector('#category'),
  className: document.querySelector('#className'),
  statusDot: document.querySelector('#statusDot'),
  irating: document.querySelector('#irating'),
  iratingDelta: document.querySelector('#iratingDelta'),
  safetyRating: document.querySelector('#safetyRating'),
  safetyDelta: document.querySelector('#safetyDelta'),
  lastCheck: document.querySelector('#lastCheck')
};

await load();
setInterval(load, refreshMs);

async function load() {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    const state = await response.json();
    render(state);
  } catch (error) {
    setStatus('error');
    els.className.textContent = 'Offline';
    els.category.textContent = 'Server unavailable';
  }
}

function render(state) {
  const selectedId = categoryParam || state.selectedCategory;
  const category = state.categories?.find((item) => item.id === selectedId) || state.categories?.[0];

  setStatus(state.status);
  if (!category) {
    els.driverName.textContent = 'iRacing';
    els.category.textContent = state.status === 'error' ? 'API error' : 'No license data';
    els.className.textContent = '--';
    els.irating.textContent = '----';
    els.safetyRating.textContent = '--.--';
    els.iratingDelta.textContent = '+0';
    els.safetyDelta.textContent = '+0.00';
    els.lastCheck.textContent = formatTime(state.lastCheckedAt);
    return;
  }

  els.driverName.textContent = state.driver?.displayName || 'iRacing';
  els.category.textContent = category.label;
  els.className.textContent = category.className;
  els.irating.textContent = formatInt(category.irating);
  els.safetyRating.textContent = formatSafety(category.safetyRating);
  setDelta(els.iratingDelta, category.iratingDelta, 0);
  setDelta(els.safetyDelta, category.safetyDelta, 2);
  els.lastCheck.textContent = formatTime(state.lastCheckedAt || state.lastUpdatedAt);
}

function setStatus(status) {
  els.statusDot.dataset.status = status || 'loading';
}

function setDelta(element, value, places) {
  if (value === null || value === undefined) {
    element.textContent = places ? '+0.00' : '+0';
    element.dataset.trend = 'flat';
    return;
  }

  const sign = value > 0 ? '+' : '';
  element.textContent = `${sign}${places ? value.toFixed(places) : Math.round(value)}`;
  element.dataset.trend = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
}

function formatInt(value) {
  return value === null || value === undefined ? '----' : Math.round(value).toLocaleString();
}

function formatSafety(value) {
  return value === null || value === undefined ? '--.--' : Number(value).toFixed(2);
}

function formatTime(value) {
  if (!value) return 'Waiting';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
}
