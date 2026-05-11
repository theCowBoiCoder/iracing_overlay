# iRacing OBS Overlay

A small self-hosted overlay for showing iRating and safety rating movement in OBS.

The Node server talks to the iRacing data API, stores the first rating it sees as the baseline, then displays gained/lost values since that baseline. Use `POST /api/reset-baseline` before a stream or race session if you want the deltas to start from zero.

## Setup

```bash
cp .env.example .env
npm install
npm start
```

Open:

```text
http://localhost:3333
```

OBS Browser Source:

```text
http://your-server-ip:3333/?category=sports_car
```

Other categories:

```text
?category=formula_car
?category=oval
?category=dirt_oval
?category=dirt_road
```

## iRacing Credentials

Put your credentials in `.env`. If you already have a bearer token:

```env
IRACING_AUTH_MODE=token
IRACING_ACCESS_TOKEN=...
IRACING_REFRESH_TOKEN=...
IRACING_CLIENT_ID=...
IRACING_CLIENT_SECRET=...
```

If your iRacing API client supports the password-limited grant:

```env
IRACING_AUTH_MODE=password_limited
IRACING_CLIENT_ID=...
IRACING_CLIENT_SECRET=...
IRACING_USERNAME=...
IRACING_PASSWORD=...
```

`IRACING_AUTH_MODE=pw-limited` is accepted as an alias.

Do not expose this app publicly without a reverse proxy and access control. Your OBS overlay URL can stay private on your LAN or behind a VPN.

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

The overlay will be on port `3333`.

## Reset The Baseline

Without a token:

```bash
curl -X POST http://localhost:3333/api/reset-baseline
```

With `OBS_TOKEN` set in `.env`:

```bash
curl -X POST -H "Authorization: Bearer your-token" http://localhost:3333/api/reset-baseline
```

## Linux systemd

Example service:

```ini
[Unit]
Description=iRacing OBS Overlay
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/iracing-obs-overlay
EnvironmentFile=/opt/iracing-obs-overlay/.env
ExecStart=/usr/bin/node /opt/iracing-obs-overlay/server.js
Restart=always
RestartSec=5
User=iracing
Group=iracing

[Install]
WantedBy=multi-user.target
```

## API

`GET /api/state` returns the current overlay data.

`POST /api/refresh` polls iRacing immediately.

`POST /api/reset-baseline` makes the current ratings the new zero point.

## Predictions

OBS prediction overlay:

```text
http://your-server-ip:3333/prediction
```

Viewer voting page:

```text
http://your-server-ip:3333/vote
```

Admin page:

```text
http://your-server-ip:3333/admin
```

Open a prediction from the API:

```bash
curl -X POST "http://localhost:3333/api/prediction/open?token=your-token" \
  -H "Content-Type: application/json" \
  -d '{"question":"Will Hayden gain iRating?","options":"Yes,No","durationSeconds":180}'
```

Vote:

```bash
curl -X POST "http://localhost:3333/api/prediction/vote" \
  -H "Content-Type: application/json" \
  -d '{"platform":"twitch","voterId":"viewer123","displayName":"Viewer","choice":"yes"}'
```

Lock, resolve, and clear:

```bash
curl -X POST "http://localhost:3333/api/prediction/lock?token=your-token"
curl -X POST "http://localhost:3333/api/prediction/resolve?token=your-token" -H "Content-Type: application/json" -d '{"choice":"yes"}'
curl -X POST "http://localhost:3333/api/prediction/clear?token=your-token"
```

The OBS prediction overlay updates live using server-sent events, so votes appear without refreshing the browser source.

## Streamer.bot Actions

Create Streamer.bot actions that make HTTP requests to these URLs. Use your public/vhost URL if Streamer.bot is not running on the same machine.

Open prediction:

```text
POST http://your-server-ip:3333/api/streamerbot/open?token=your-token
```

Body:

```json
{
  "question": "Will Hayden gain iRating this race?",
  "options": "Yes,No",
  "duration": 180,
  "source": "streamerbot"
}
```

Twitch vote action for chat command `!vote`:

```text
POST http://your-server-ip:3333/api/streamerbot/vote
```

Body:

```json
{
  "platform": "twitch",
  "userId": "%userId%",
  "displayName": "%user%",
  "choice": "%rawInput%"
}
```

YouTube vote action for chat command `!vote`:

```json
{
  "platform": "youtube",
  "userId": "%userId%",
  "displayName": "%user%",
  "choice": "%rawInput%"
}
```

TikTok vote action:

```json
{
  "platform": "tiktok",
  "userId": "%userId%",
  "displayName": "%user%",
  "choice": "%rawInput%"
}
```

Lock prediction:

```text
POST http://your-server-ip:3333/api/streamerbot/lock?token=your-token
```

Resolve prediction:

```text
POST http://your-server-ip:3333/api/streamerbot/resolve?token=your-token
```

Body:

```json
{ "choice": "yes" }
```

Clear prediction:

```text
POST http://your-server-ip:3333/api/streamerbot/clear?token=your-token
```

Suggested chat commands:

```text
!vote yes
!vote no
!prediction
```

Suggested mod-only actions:

```text
!openpred Will Hayden gain SR?|Yes,No|180
!lockpred
!resolvepred yes
!clearpred
```
