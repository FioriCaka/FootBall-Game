# threejs-animation

A minimal three.js game: A simple Football game with a Robot Opponent, speed slider and wireframe toggle.

Files:

- `index.html` — the page (loads `main.js` as a module)
- `main.js` — three.js scene and animation code (imports three and OrbitControls from CDN)
- `styles.css` — simple UI styling

How to run locally

Python simple server (works on Windows with Git Bash, WSL, or any shell with Python):

```bash
# from the repository root (where this README lives):

If there is no IDE installed on your computer
    Put the Project folder on Desktop folder
    Press shift + Right Click on Desktop and press Open Powershell window here
Than
    cd threejs-animation
    python -m http.server 8000
    open http://localhost:8000 in your browser

Otherwise if there is a IDE on your computer
    open the folder with the IDE and on integrated terminal type
        cd threejs-animation
        python -m http.server 8000
    than open http://localhost:8000 in your browser
```

Notes

- The page uses ES module imports from unpkg CDN. No build step or npm install required.
- If the page looks blank, make sure you opened it through a local server (some browsers block module imports when opened via file://).

Enjoy! Press `H` to randomize the torus-knot color.
