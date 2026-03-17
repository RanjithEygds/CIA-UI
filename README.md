# CIAssist – Change Impact Assessment

Enterprise web application for the Change Management Team to streamline the Change Impact Assessment (CIA) process: structured stakeholder interviews via **CIMMIE**, evidence capture, and CIA report drafting.

## Features

- **Login** – Minimal, government-grade sign-in
- **Home** – Overview of solution components (Data Extraction, Interview, Insights, CIA Template agents) and CIMMIE
- **Initiate Interview** – Upload Brief & scope, Context pack, Method & templates, Stakeholder list & interview plan
- **Preview** – Extracted content from uploads (Data Extraction Agent output)
- **Launch Interview** – List stakeholders, initiate interviews, view **Past changes** (summary, structured findings, CIA narrative, populated template)
- **CIMMIE** – Chatbot page at `/cimmie/:sessionId`: time-boxed, one-time link, session-scoped; no access to post-interview outputs

## Run locally

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**. Sign in with any username and password to access the app.

## CIMMIE stakeholder link

Stakeholders use a one-time, time-limited link, e.g.:

`http://localhost:5173/cimmie/session-1`

They only see the live interview chat; they cannot view summaries, templates, or other transcripts.

## Build

```bash
npm run build
npm run preview   # preview production build
```

## Stack

- React 19, TypeScript, Vite 7
- React Router 7
- CSS with CSS variables (teal/coral theme)
