# Interrail → Calendar

Turn a trip from the Interrail / Eurail **Rail Planner** app into calendar events.

1. In Rail Planner, open a trip and tap **Share → Share as a link**.
2. Paste the shared text or link into the app.
3. Pick the trains you want (individually, per travel or per day) and download an `.ics` file
   with one event per train.

Built with [Fresh 3](https://next.usefresh.dev/), Vite and Preact.

## Local development

Requirements: **Node.js ≥ 26** (the server relies on native `Temporal`) and npm.

```sh
npm install
npm run dev
```

Then open the URL printed by Vite (by default http://localhost:5173) and paste a share link,
or go directly to `/trip?url=<share link>`.

| Command           | Description                         |
| ----------------- | ----------------------------------- |
| `npm run dev`     | Start the dev server (with HMR)     |
| `npm test`        | Run the unit tests (vitest)         |
| `npm run check`   | Type-check with TypeScript          |
| `npm run build`   | Production build into `.output/`    |
| `npm run preview` | Serve the production build locally  |

## Deployment

The included `Dockerfile` builds the app and runs the self-contained server from `.output/`
on Node 26. On [Railway](https://railway.com), create a service from this repository: it picks up the
`Dockerfile` automatically and provides `PORT`, which the server listens on. No other configuration
is needed.

To run the image locally:

```sh
docker build -t interrail-to-calendar .
docker run --rm -p 3000:3000 interrail-to-calendar
```

See [`AGENTS.md`](./AGENTS.md) for how the app works, including the format of the shared trip data.
