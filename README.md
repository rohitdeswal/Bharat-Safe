# Bharat Safe

Bharat Safe compares two hand-authored walking routes in Delhi using seeded sample businesses and opening hours. It is a demo activity estimate, not a safety rating. No routing, geocoding, or places APIs are used. Map tiles come from the public OpenStreetMap tile service and do not require an API key; fonts load from Google Fonts.

## Run locally

```sh
cd server && cp .env.example .env && npm install && npm run dev
```

In a second terminal:

```sh
cd client && npm install && npm run dev
```

The API listens on port 8080 and Vite on port 3000. Vite proxies `/api` to the API. Open `http://localhost:3000`; the app checks the saved session and shows the login screen when signed out. Sign in with the demo profile to reach the routes dashboard. `PORT` and `MONGODB_URI` configure the API and optional storage. Telegram and SMTP settings are optional; see “Real SOS delivery setup” below. Active SOS alerts expire after 15 minutes by default, or 3 minutes in demo timing mode; configure `SOS_ACTIVE_TIMEOUT_MS` and `SOS_DEMO_ACTIVE_TIMEOUT_MS` in `server/.env`. When MongoDB is absent, records use in-memory storage with expiry.

## Demo account

Use **demo@bharatsafe.app** and **RiyaWalks@2026**, or choose “Continue with demo profile.” The routes, account, check-in alarm, and contact inbox are demo features. Telegram and email alerts are delivered only when configured; the public SOS page remains available. The browser requests screen-wake support when available; audio and vibration depend on browser/device permissions. Alerts do not call emergency services.


## Real device location for SOS

The walking dot remains a simulation. When you tap **Start walking**, the browser asks whether Bharat Safe may read device location; the location stays in memory on that device and is never uploaded before an SOS is created. If a fix is available, the SOS shares coordinates, accuracy, and a bounded 24-hour trail with the SOS page and linked emergency contacts. Telegram receives a live pin; email receives a map link and accuracy/age note. If location is denied or unavailable, alerts still send and say so.

Geolocation requires HTTPS; `http://localhost` is allowed for development. To test from a phone, expose the client through a free HTTPS tunnel, for example `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`, then set `PUBLIC_BASE_URL` to that tunnel’s HTTPS origin and restart the API. Open the tunnel URL on the phone and allow location at **Start walking**; the same origin is used for the public `/sos/:token` link sent to contacts. A laptop’s Wi-Fi location is often approximate; outdoor phone GPS is usually much more precise.

Location updates depend on browser permission, network availability, and the page being active. A web page cannot guarantee updates while a phone is locked or a tab is in the background. Bharat Safe is a prototype, not an emergency service; call 112 in an emergency.

## Three-minute demo

1. Open the app and choose “Continue with demo profile” (or sign in with **demo@bharatsafe.app** / **RiyaWalks@2026**). The app opens on the routes dashboard.
2. Select Hauz Khas Metro to IIT Delhi. Move the departure slider between 8 pm and 11 pm and compare the scores and open-place markers.
3. Select the longer-quiet route, start walking, play the simulated movement, and share the trip link.
4. Request a walking buddy, accept the sample match, and inspect the highlighted overlap.
5. Open the profile to edit emergency contacts and alarm timing. During a demo walk, wait for a check-in; ignore it to trigger an SOS. If device location is available, the alert includes its live location; open the public location page or contact inbox to see the event.
6. Refresh the page to confirm the session remains active; use Profile → Log out to return to sign-in. Return to the journey list and select Saket Metro to Malviya Nagar to see the no-buddy state.

## Checks

```sh
cd server && npm test
cd ../client && npm test && npm run build
```

## Real SOS delivery setup

Real Telegram and email delivery are optional. Without configuration, Bharat Safe keeps working with the simulated contact inbox and logs one line per disabled channel. Copy `server/.env.example` to `server/.env`; keep credentials private and never commit `.env`.

### Telegram

1. In Telegram, open [@BotFather](https://t.me/BotFather), run `/newbot`, and follow its prompts. Copy the bot token and username into `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` in `server/.env`.
2. Start the API. In Bharat Safe, open Profile and choose **Link Telegram** for an emergency contact. Send or scan the displayed link with that contact’s Telegram account and press Start in the bot chat. The link can be used once and expires after 15 minutes.
3. The bot uses Telegram long polling; it does not need a public webhook. Telegram must be configured for live alerts to be delivered.

### Gmail email backup

1. Turn on 2-Step Verification for the Google account used to send alerts.
2. Create a Google [App Password](https://support.google.com/mail/answer/185833?hl=en) for the mail sender, then set `SMTP_USER` to that Gmail address and `SMTP_PASS` to the generated app password. The default SMTP host and port are `smtp.gmail.com` and `587`; set `ALERT_FROM_NAME` to change the sender display name.
3. Restart the API after changing environment settings. Send a **Send test alert** from Profile to verify delivery.

### Public SOS links on other phones

Set `PUBLIC_BASE_URL` to a reachable HTTPS address so Telegram/email messages can include the public SOS page link. A free temporary option is [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/): run `cloudflared tunnel --url http://localhost:3000`, set `PUBLIC_BASE_URL` to the printed `https://…trycloudflare.com` address, and restart the API. An ngrok alternative is `ngrok http 3000`; use its HTTPS forwarding address. The URL may change between runs. If `PUBLIC_BASE_URL` is empty, messages omit the page link; Telegram delivery and the live map pin still work.

### Presentation-day checklist

- Each teammate links their emergency contact to the bot beforehand.
- Send a test alert the day before and confirm it arrives.
- Enable Telegram notifications on recipient phones.
- Bring reliable internet or a phone hotspot.
- If the network or delivery service fails, use the simulated Contact inbox in the app.

### Limits

Bharat Safe is a prototype and does not replace emergency services. A web page cannot guarantee an alarm when a phone is locked or the browser tab is in the background. Telegram and SMTP delivery depend on internet access, provider availability, and recipient settings. In an emergency, call 112.
