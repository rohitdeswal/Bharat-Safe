# 🇮🇳 Bharat Safe

### Smarter routes. More confident journeys.

Bharat Safe is a women's travel-safety prototype that compares walking routes using estimated nighttime activity. It also demonstrates walking-buddy matching, trip check-ins, and SOS alerts.

> ⚠️ **Note:** This is a prototype. Route scores are demo activity estimates, not safety ratings. In an emergency in India, call **112**.

## ✨ Features

- 🗺️ **Route Comparison:** Compare two walking routes using estimated nighttime activity and sample business opening hours.
- 🤝 **Walking Buddy:** Request a travel companion and view overlapping route segments.
- 🆘 **SOS Alerts:** Trigger alerts when a trip check-in is missed.
- 📍 **Location Sharing:** Share available device location details during an SOS.
- 📩 **Notifications:** Optional Telegram and email alerts.
- 👤 **User Profile:** Manage emergency contacts and check-in settings.

## 🛠️ Tech Stack

- **Frontend:** React, Vite
- **Backend:** Node.js, Express.js
- **Database:** MongoDB (optional)
- **Maps:** OpenStreetMap tiles

The prototype uses hand-authored routes and sample business data. It does not currently use routing, geocoding, or places APIs.

## 🚀 Getting Started

**Prerequisites:** Node.js and npm.

### 1. Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd <YOUR_PROJECT_FOLDER>
```

### 2. Start the backend

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

### 3. Start the frontend

Open a second terminal:

```bash
cd client
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

## 🔑 Demo Login

- **Email:** `demo@bharatsafe.app`
- **Password:** `RiyaWalks@2026`

You can also select **Continue with demo profile**.

## 🧪 Testing

**Backend:**

```bash
cd server
npm test
```

**Frontend:**

```bash
cd client
npm test
npm run build
```

## ⚠️ Limitations

- Routes and business data are simulated.
- Activity scores are estimates, not verified safety measurements.
- Buddy matching and some account features use demo data.
- Real Telegram and email alerts require configuration.
- Location tracking depends on browser permissions, connectivity, and device behaviour.
- Bharat Safe does not automatically contact emergency services.

## 🔮 Future Scope

- Integrate real pedestrian routing.
- Use up-to-date place and opening-hours data.
- Improve route scoring and buddy matching.
- Strengthen privacy and emergency notification reliability.

---

**Bharat Safe — Helping people make more informed travel decisions.**
