import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_OPTIONS = ['Yes', 'No'];

export class PredictionStore {
  constructor(file) {
    this.file = file;
    this.state = emptyPredictionState();
    this.clients = new Set();
  }

  async load() {
    if (!existsSync(this.file)) return;
    this.state = { ...emptyPredictionState(), ...JSON.parse(await readFile(this.file, 'utf8')) };
  }

  getPublicState() {
    const voteCounts = countVotes(this.state);
    const totalVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);
    return {
      ...this.state,
      votes: undefined,
      voteCounts,
      totalVotes,
      options: this.state.options.map((option) => ({
        ...option,
        votes: voteCounts[option.id] || 0,
        percent: totalVotes ? Math.round(((voteCounts[option.id] || 0) / totalVotes) * 100) : 0
      }))
    };
  }

  async open({ question, options, durationSeconds, source = 'admin' }) {
    const cleanQuestion = String(question || '').trim();
    if (!cleanQuestion) throw new Error('Prediction question is required');

    const cleanOptions = normalizeOptions(options);
    const now = new Date();
    const lockAt = durationSeconds ? new Date(now.getTime() + Number(durationSeconds) * 1000).toISOString() : null;

    this.state = {
      id: `${Date.now()}`,
      status: 'open',
      question: cleanQuestion,
      options: cleanOptions,
      votes: {},
      winnerId: null,
      createdAt: now.toISOString(),
      openedAt: now.toISOString(),
      lockedAt: null,
      resolvedAt: null,
      lockAt,
      source
    };

    await this.saveAndBroadcast();
    return this.getPublicState();
  }

  async vote({ voterId, displayName, platform, choice }) {
    if (this.state.status !== 'open') throw new Error('Prediction is not open');
    if (this.state.lockAt && Date.now() >= new Date(this.state.lockAt).getTime()) {
      await this.lock();
      throw new Error('Prediction is locked');
    }

    const option = findOption(this.state.options, choice);
    if (!option) throw new Error(`Unknown option: ${choice}`);

    const voterKey = `${platform || 'web'}:${voterId || displayName || cryptoRandomId()}`.toLowerCase();
    this.state.votes[voterKey] = {
      optionId: option.id,
      displayName: displayName || voterId || 'Viewer',
      platform: platform || 'web',
      votedAt: new Date().toISOString()
    };

    await this.saveAndBroadcast();
    return this.getPublicState();
  }

  async lock() {
    if (this.state.status === 'idle') return this.getPublicState();
    this.state.status = 'locked';
    this.state.lockedAt = new Date().toISOString();
    await this.saveAndBroadcast();
    return this.getPublicState();
  }

  async resolve(choice) {
    const option = findOption(this.state.options, choice);
    if (!option) throw new Error(`Unknown winning option: ${choice}`);
    this.state.status = 'resolved';
    this.state.winnerId = option.id;
    this.state.resolvedAt = new Date().toISOString();
    await this.saveAndBroadcast();
    return this.getPublicState();
  }

  async clear() {
    this.state = emptyPredictionState();
    await this.saveAndBroadcast();
    return this.getPublicState();
  }

  addClient(res) {
    this.clients.add(res);
    res.write(`event: prediction\ndata: ${JSON.stringify(this.getPublicState())}\n\n`);
    res.on('close', () => this.clients.delete(res));
  }

  async saveAndBroadcast() {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.state, null, 2));
    this.broadcast();
  }

  broadcast() {
    const payload = `event: prediction\ndata: ${JSON.stringify(this.getPublicState())}\n\n`;
    for (const client of this.clients) client.write(payload);
  }
}

export function emptyPredictionState() {
  return {
    id: null,
    status: 'idle',
    question: '',
    options: DEFAULT_OPTIONS.map((label, index) => ({ id: optionId(label, index), label })),
    votes: {},
    winnerId: null,
    createdAt: null,
    openedAt: null,
    lockedAt: null,
    resolvedAt: null,
    lockAt: null,
    source: null
  };
}

function normalizeOptions(options) {
  const input = Array.isArray(options)
    ? options
    : String(options || '').split(',');

  const labels = input
    .map((option) => String(option).trim())
    .filter(Boolean)
    .slice(0, 4);

  return (labels.length >= 2 ? labels : DEFAULT_OPTIONS)
    .map((label, index) => ({ id: optionId(label, index), label }));
}

function findOption(options, choice) {
  const text = String(choice || '').trim().toLowerCase();
  if (!text) return null;
  return options.find((option, index) =>
    option.id === text ||
    option.label.toLowerCase() === text ||
    String(index + 1) === text ||
    option.label.toLowerCase().startsWith(text)
  );
}

function optionId(label, index) {
  const slug = String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `option-${index + 1}`;
}

function countVotes(state) {
  const counts = Object.fromEntries(state.options.map((option) => [option.id, 0]));
  for (const vote of Object.values(state.votes || {})) {
    if (counts[vote.optionId] !== undefined) counts[vote.optionId] += 1;
  }
  return counts;
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2);
}
