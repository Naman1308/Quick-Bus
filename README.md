# Buses

A home-screen app for live MTA bus arrivals at your saved stops. It's a static page plus one Netlify function that keeps your API key hidden.

## Setup (one time)

1. **Get a key.** Request a free MTA Bus Time API key at https://bt.mta.info/developers. It arrives by email, usually within half an hour.
2. **Put this folder on GitHub** as a new repo (private is fine).
3. **Connect it to Netlify.** Choose Add new site → Import from Git → pick the repo. You don't need to change any build settings.
4. **Add the key.** Go to Site settings → Environment variables and add `MTA_BUSTIME_KEY` = your key. Then redeploy.
5. **Put it on your iPhone.** Open the site in Safari, then Share → Add to Home Screen.

## Saved stops

Edit `public/stops.json`:

```json
[
  { "label": "Home → school", "stop": "401732", "routes": ["M15"], "note": "Northbound" }
]
```

- `stop` is the 6-digit code on the green Bus Time sign at the stop (the same code you text to 511123).
- `routes` is optional. Leave it as `[]` to show every route at that stop. `"M15"` matches both M15 and M15-SBS.
- `show` is optional and sets how many buses to list (default 4).

Push the change and Netlify redeploys within about a minute.

## Notes

- The box at the bottom checks any stop code once without saving it.
- The app refreshes every 30 seconds while it's open. MTA may revoke keys that poll much faster than that.
- If MTA moves the API host, set `BUSTIME_HOST` in Netlify (for example `https://bustime-classic.mta.info`).
