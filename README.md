# Bharat Safe

**The way home that stays alive after dark.**

Bharat Safe helps people choose a walking route that is still active at night, and gives them
an SOS safety net that works even when they cannot reach their phone.

> Prototype. Route scores are activity estimates, not safety ratings.
> In an emergency in India, call **112**.


## The problem
The fastest route home is often the emptiest one: shuttered shops, long dark stretches, no one
around. Navigation apps optimise for speed, and most safety apps only react after something
has gone wrong.

## What it does
- **Night Activity Score:** compares routes by how many places will be open when you walk past
  them, using opening hours at your arrival time, and shows where the quiet stretches are.
- **Time slider:** drag the departure time and watch shops close and the route dim.
- **Check-in alarm with voice:** speaks in a natural English or Hindi voice (ElevenLabs).
  Ignore it and an SOS is triggered.
- **SOS to emergency contacts:** a Telegram message, a live location pin that follows the
  device, and a recorded voice message, then an all-clear when you are safe.
- **Optional walking buddy:** match with someone on the same quiet stretch. The route never
  depends on it.
- **Profile:** emergency contacts, voice language and check-in settings.

## What is real and what is simulated
| Real | Simulated for the demo |
|---|---|
| Scoring engine and opening-hours logic | Routes and places (hand-authored sample data) |
| SOS alarm, Telegram alerts and live location | The walker's movement along the route |
| ElevenLabs voice lines (pre-generated audio) | Buddy profiles |

## Tech stack
- **Frontend:** React, Vite, Leaflet
- **Backend:** Node.js, Express, JWT auth, Telegram Bot API
- **AI / voice:** ElevenLabs (English and Hindi voice alerts)
- **Database:** MongoDB (in-memory fallback)
- **GIS and data:** OpenStreetMap, Turf.js, `opening_hours`

## Getting started
Prerequisites: Node.js and npm.

    # terminal 1
    cd server && cp .env.example .env && npm install && npm run dev

    # terminal 2
    cd client && npm install && npm run dev

Open http://localhost:3000 and choose **Continue with demo profile**.
Demo login: `demo@bharatsafe.app` / `RiyaWalks@2026` (demo account only).

## Trying the SOS (optional)
1. Create a bot with @BotFather and add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` to
   `server/.env`.
2. In **Profile**, tap **Link Telegram** on a contact and press Start in the bot.
3. Start a walk and let the alarm run out. Allow location when asked.

## Limitations
- Routes and places are sample data. Scores are estimates, not safety measurements.
- A web page cannot guarantee alerts or location when the phone is locked or the tab is in
  the background. A native app is the next step.
- Bharat Safe does not contact emergency services automatically.

## Future scope
Real pedestrian routing, live place and opening-hours data, native app with background
location, SMS delivery, stronger privacy controls.

## Credits
Map data © OpenStreetMap contributors · Tiles © CARTO · Voice by ElevenLabs
