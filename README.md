# CIAssist – Change Impact Assessment

Enterprise web application for Change Management teams to streamline the **Change Impact Assessment (CIA)** process: structured stakeholder interviews via **CIMMIE**, evidence capture, and CIA report drafting.

---

## Features

### Authentication & navigation
- **Login** – Minimal, government-grade sign-in (any username/password for local use). Protected routes redirect unauthenticated users to `/login`.
- **Sidebar** – Collapsible navigation (Home, Initiate CIA, Launch Interview, All CIAs) and sign out.

### Home
- **Overview** – Introduction to CIAssist and the four solution components: **Data Extraction Agent**, **Interview Agent**, **Insights Agent**, **CIA Formulator Agent**.
- **CIMMIE** – Description of the interview assistant (time-boxed, one-time links, session-scoped).
- **How it works** – Four-step flow: Upload & prepare → Validate context → Launch interviews → Review outputs.
- **Initiate CIA** – Quick link to start a new engagement.

### Initiate CIA (Upload)
- **Document upload** – Categorized uploads:
  - Brief & Scope (objectives, case for change, timeline, constraints)
  - Context Pack (org charts, role lists, process maps, programme materials)
  - Method & Templates (CIA structure, questionnaire, template workbook)
  - Stakeholder List & Interview Plan
  - Other Documents
- **Engagement name** – Optional name for the engagement.
- **Drag-and-drop** – Per-section file upload with add/remove; proceeds to Preview after extraction.

### Preview (Data Extraction output)
- **Extracted content** – Editable cards for Change Brief, Type of Change, Groups Impacted, Change Rationale (simulated Data Extraction Agent output).
- **Upload summary** – List of uploaded files by section with sizes.
- **Navigation** – Continue to Preview Interview Questions or Add Stakeholders.

### Preview Interview Questions
- **Custom questions** – Add, edit, and remove interview questions; persisted in session storage.
- **Flow** – Part of the initiate flow before launching interviews.

### Add Stakeholders
- **Stakeholder list** – Add stakeholders with name and email (validation); list persisted in session storage.
- **IDs** – Auto-generated IDs used later for CIMMIE session links.
- **Flow** – Proceed to Launch Interview with the same stakeholder list.

### Launch Interview
- **Stakeholder list** – Shows stakeholders (from Add Stakeholders or seed data) with status: Queued, Invited, In Progress, Completed.
- **Copy CIMMIE link** – One-click copy of stakeholder-specific interview link: `{origin}/cimmie/{stakeholderId}`.
- **Past changes** – Access to previous engagements (summaries, findings, CIA narrative, populated template) via **All CIAs**.

### CIMMIE (Interview session)
- **Route** – `/cimmie` or `/cimmie/:sessionId` for stakeholder-specific sessions.
- **Chat UI** – Section-based progress (e.g. Opening & Consent, Role impact, Process & technology, Data & closure) with question counts and status.
- **Text mode** – Type messages and receive bot replies; conversation history in session.
- **Voice mode** – Optional speech-to-text via browser Web Speech API (and optional Azure Speech config for enhanced STT/TTS).
- **Session-scoped** – Time-boxed, one-time link; no access to post-interview outputs, other transcripts, or internal knowledge.
- **Readback** – Real-time conversational read-back of captured evidence by topic.

### All CIAs / Engagements
- **List** – All change engagements with title and summary (mock data).
- **Links** – Click an engagement to open its detail page.

### Engagement detail
- **Impact lenses** – People, Process, Technology, Data with severity and evidence summary.
- **Impact records** – Table of impacts by lens, area, severity, and source.
- **CIA narrative** – Editable narrative draft with publish option.
- **Populated template** – View and download CIA template content.
- **Stakeholder transcripts** – Select a stakeholder to view full CIMMIE transcript and readback summary.

---

## Tech stack

| Layer        | Technology |
|-------------|------------|
| **Runtime** | Node.js (local dev and build) |
| **Framework** | React 19 |
| **Language** | TypeScript |
| **Build**   | Vite 7 |
| **Routing** | React Router 7 |
| **Styling** | CSS with CSS variables (teal/coral theme), no UI framework |
| **State**   | React state + `AuthContext`; session storage for uploads, stakeholders, questions |
| **Speech**  | Browser Web Speech API (optional Azure Speech Services via env for STT/TTS) |
| **Lint**    | ESLint 9 + TypeScript ESLint |

---

## How to run

### Prerequisites
- **Node.js** (v18+ recommended)
- **npm** (or yarn/pnpm)

### 1. Install dependencies

```bash
npm install
```

### 2. Environment (optional)

For **speech features** in CIMMIE (Azure Speech Services), copy `.env.example` to `.env` and set:

- `VITE_SPEECH_API_KEY` – Azure Speech resource API key  
- `VITE_SPEECH_REGION` – e.g. `eastus`, `swedencentral`  
- `VITE_DEFAULT_STT_LANG` – e.g. `en-US`, `en-IN`  
- `VITE_DEFAULT_TTS_VOICE` – e.g. `en-US-JennyNeural`, `en-IN-NeerjaNeural`  

If these are not set, the app still runs; voice mode may use browser Speech Recognition only.

### 3. Start development server

```bash
npm run dev
```

Then open **http://localhost:5173** in your browser.

### 4. Sign in
Use **any username and password** to sign in (local/demo auth). You will be redirected to the Home page.

### 5. Stakeholder CIMMIE link
Stakeholders can use a one-time, time-limited link, for example:

```text
http://localhost:5173/cimmie/st-1
```

They only see the live interview chat and cannot view summaries, templates, or other transcripts.

---

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (default port 5173) |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Serve production build locally |
| `npm run lint` | Run ESLint |

---

## Build for production

```bash
npm run build
npm run preview   # optional: preview the production build
```

Build output is in the `dist/` directory.
