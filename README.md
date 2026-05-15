**An interactive agentic system for adaptive learning paths.**

leias turns study materials into inspectable learning graphs. Learners can explore the material, see how concepts connect, and follow a structured path through what they need to learn.

Rather than giving isolated chatbot answers, the system uses the graph to guide tutoring, retrieval, checkpoints, and progress tracking. It helps identify what to learn first, where understanding breaks down, and what to study next.

Educator-authored knowledge graphs are supported as well. Learning experience designers can define domain-specific topics, concept relationships, learning boundaries, and supporting media. These curated graphs give the agent a structured teaching space while still allowing it to adapt to each learner.

## Project Structure

```text
backend/          FastAPI API, graph pipeline, ADK agents, tools, and schemas
backend/static/   sample graph data, quiz iframe, and media assets
frontend/         React UI, graph visualization, and chat interface
```

Agent behavior is defined in `backend/instructions/`, with prompts separated by interaction phase so teaching style and tool use can be adjusted independently.

## Model Runtime

leias is designed to work with Gemma. By default, it uses a hosted Gemma-compatible endpoint through LiteLLM.

```bash
GEMINI_API_KEY=...
GEMINI_MODEL=gemini/gemma-4-31b-it
```

To use a self-hosted Gemma runtime, set `GEMINI_API_BASE`:

```bash
GEMINI_MODEL=...
GEMINI_API_BASE=...
```

The configured endpoint must expose the chat interface expected by the backend model calls.

## Setup

```bash
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd frontend
npm install
npm run build
cd ..
```

## Run Locally

```bash
source .venv/bin/activate
uvicorn backend.app:app
```

Then open:

```text
http://127.0.0.1:8000
```

## Current Limits

- Supported graph inputs: `.pdf`, `.png`, `.jpg`, `.jpeg`
- Maximum upload size: 25 MB
- PDF graph extraction renders up to 10 pages
- Sessions are stored in memory; use a persistent store for multi-worker production deployments
