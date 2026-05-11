const card = document.querySelector('.prediction-card');
const statusPill = document.querySelector('#statusPill');
const timer = document.querySelector('#timer');
const question = document.querySelector('#question');
const options = document.querySelector('#options');
const totalVotes = document.querySelector('#totalVotes');

let currentState = null;

connectEvents();
setInterval(updateTimer, 1000);

async function connectEvents() {
  const source = new EventSource('/api/prediction/events');
  source.addEventListener('prediction', (event) => render(JSON.parse(event.data)));
  source.onerror = async () => render(await fetchState());
}

async function fetchState() {
  const response = await fetch('/api/prediction', { cache: 'no-store' });
  return response.json();
}

function render(state) {
  currentState = state;
  card.dataset.status = state.status;
  statusPill.textContent = labelStatus(state.status);
  question.textContent = state.question || 'No prediction open';
  totalVotes.textContent = `${state.totalVotes || 0} ${state.totalVotes === 1 ? 'vote' : 'votes'}`;
  options.innerHTML = '';

  for (const option of state.options || []) {
    const row = document.createElement('article');
    row.className = 'option-row';
    row.dataset.winner = state.winnerId === option.id ? 'true' : 'false';
    row.innerHTML = `
      <div class="option-top">
        <strong>${escapeHtml(option.label)}</strong>
        <span>${option.percent || 0}%</span>
      </div>
      <div class="bar"><span style="width: ${option.percent || 0}%"></span></div>
      <small>${option.votes || 0} votes</small>
    `;
    options.appendChild(row);
  }

  updateTimer();
}

function updateTimer() {
  if (!currentState?.lockAt || currentState.status !== 'open') {
    timer.textContent = currentState?.status === 'resolved' ? 'Result' : '--:--';
    return;
  }

  const remaining = Math.max(0, new Date(currentState.lockAt).getTime() - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function labelStatus(status) {
  return {
    idle: 'Prediction',
    open: 'Prediction open',
    locked: 'Prediction locked',
    resolved: 'Result'
  }[status] || 'Prediction';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
