# Gemini Learning Graph

Grounded tutoring project built around:

- a FastAPI app in `app/`
- shared prompt/instruction and schema modules in `core/`
- notebooks for graph extraction experiments in `notebooks/`
- sample data and generated artifacts in `data/`

## Repo Layout

```text
app/                       runnable product app
core/                      shared Python runtime modules
notebooks/                 experiment and graph-building notebooks
data/
  knowledge/               knowledge graph JSON files
  sample_docs/             sample PDFs used for notebook testing
  generated/               generated graph artifacts
requirements.txt           backend Python dependencies
```

## Running The App

Backend:

```bash
cd <repo-root>
source .venv/bin/activate
uvicorn app.backend.app:app --reload --host 0.0.0.0 --port 8010
```

Frontend source:

```bash
cd app/ui
npm install
npm run build
```

The backend serves the built frontend from `app/ui/dist/`. If the frontend has not been built yet, the API still starts and the root page shows a short setup message.

## Notes

- Local secrets stay in `.env` and are ignored by git.
- Copy `.env.example` to `.env` and fill in the provider settings you want to use.
- `app/ui/node_modules/` is intentionally ignored.
- `app/ui/dist/` is a generated build artifact and is intentionally not committed.
- The notebooks are for graph-extraction experiments and sample evaluation, not the production runtime.
- Example PDFs and generated graphs live under `data/` so the repo root stays clean.
