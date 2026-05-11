const params = new URLSearchParams(window.location.search);
const voterId = params.get('user') || localStorage.getItem('prediction-voter-id') || crypto.randomUUID();
localStorage.setItem('prediction-voter-id', voterId);

const question = document.querySelector('#voteQuestion');
const options = document.querySelector('#voteOptions');
const message = document.querySelector('#voteMessage');

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

function render(state) {
  question.textContent = state.question || 'No prediction open';
  options.innerHTML = '';
  message.textContent = state.status === 'open' ? 'Choose one option. You can change your vote until it locks.' : 'Voting is not open right now.';

  for (const option of state.options || []) {
    const button = document.createElement('button');
    button.textContent = `${option.label} (${option.percent || 0}%)`;
    button.disabled = state.status !== 'open';
    button.addEventListener('click', () => vote(option.id));
    options.appendChild(button);
  }
}

async function vote(choice) {
  const response = await fetch('/api/prediction/vote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      voterId,
      displayName: params.get('name') || 'Viewer',
      platform: params.get('platform') || 'web',
      choice
    })
  });
  const result = await response.json();
  message.textContent = response.ok ? 'Vote counted.' : result.error;
}
