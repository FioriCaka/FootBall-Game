# threejs-animation

A minimal three.js game: A simple Football game with a Robot Opponent, speed slider and wireframe toggle.

Files:

- `index.html` — the page (loads `main.js` as a module)
- `main.js` — three.js scene and animation code (imports three and OrbitControls from CDN)
- `styles.css` — simple UI styling

How to run locally

Option A — Python simple server (works on Windows with Git Bash, WSL, or any shell with Python):

```bash
# from the repository root (where this README lives):
cd threejs-animation
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

Option B — VS Code Live Server extension: open the folder and click "Go Live".

Option C — npm (recommended if you use Node.js):

```bash
# install dev deps (only needed once)
npm install
# then start the local http server
npm start
```

Notes

- The page uses ES module imports from unpkg CDN. No build step or npm install required.
- If the page looks blank, make sure you opened it through a local server (some browsers block module imports when opened via file://).

Enjoy! Press `H` to randomize the torus-knot color.
