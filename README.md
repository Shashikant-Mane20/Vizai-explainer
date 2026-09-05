# Visual Tutor AI

Build an AI Visual Explainer where the user enters ANY educational topic. The AI should understand the topic, generate the appropriate visual representation, and teach the topic through that visual step-by-step.

For every topic, automatically choose the best visual—diagram, animation, flowchart, graph, timeline, concept map, scientific illustration, math visualization, code flow, etc.

The visual must actively explain the concept: animate each step, highlight relevant parts, show arrows/connections, display simple explanations alongside the visual, and guide the student from Step 1 → Step 2 → Step 3 → final concept.

It should feel like an AI teacher drawing and explaining on an interactive digital textbook, not just displaying an image or paragraph.

Input: topic, subject, grade, explanation
Backend: FastAPI /visualize

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9a350692-8c6f-49e4-9730-7a7f9c2f49ef).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Gemini API setup

The lesson API uses Google Gemini from the server, so the API key is never sent to the browser.

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Copy `.env.example` to `.env`.
3. Put the key in `.env` as `GEMINI_API_KEY=...`.
4. Start the app with `bun run dev` or `npm run dev`.

`GEMINI_MODEL` is optional and defaults to `gemini-3.6-flash`. Keep `.env` private and never commit it.

## Development

Prefer working locally? You need Bun or Node.js and npm — [install Bun](https://bun.sh/) or [Node.js with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
