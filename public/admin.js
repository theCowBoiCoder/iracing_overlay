const els = {
  question: document.querySelector('#questionInput'),
  options: document.querySelector('#optionsInput'),
  duration: document.querySelector('#durationInput'),
  token: document.querySelector('#tokenInput'),
  open: document.querySelector('#openButton'),
  lock: document.querySelector('#lockButton'),
  clear: document.querySelector('#clearButton'),
  resolve: document.querySelector('#resolveRow'),
  state: document.querySelector('#adminState')
};

els.open.addEventListener('click', () => post('/api/prediction/open', {
  question: els.question.value,
  options: els.options.value,
  durationSeconds: Number(els.duration.value || 0)
}));
els.lock.addEventListener('click', () => post('/api/prediction/lock'));
els.clear.addEventListener('click', () => post('/api/prediction/clear'));

connectEvents();

async function connectEvents() {
  render(await fetchState());
  const source = new EventSource('/api/prediction/events');
  source.addEventListener('prediction', (event) => render(JSON.parse(event.data)));
}

async function fetchState() {
  const response = await fetch('/api/prediction', { cache: 'no-store' });
  return response.json();
}

async function post(path, body = {}) {
  const token = els.token.value.trim();
  const response = await fetch(token ? `${path}?token=${encodeURIComponent(token)}` : path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  render(await response.json());
}

function render(state) {
  els.state.textContent = JSON.stringify(state, null, 2);
  els.resolve.innerHTML = '';
  for (const option of state.options || []) {
    const button = document.createElement('button');
    button.textContent = `Resolve ${option.label}`;
    button.disabled = state.status === 'idle';
    button.addEventListener('click', () => post('/api/prediction/resolve', { choice: option.id }));
    els.resolve.appendChild(button);
  }
}
