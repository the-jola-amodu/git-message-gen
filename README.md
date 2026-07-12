# Git Historian & README Architect

An advanced, context-aware VS Code extension that bridges the gap between incremental code changes and high-level project documentation. By utilizing a local "Journal" memory layer and integrated Large Language Models, the extension automates semantic conventional commit generation and seamlessly synthesizes project evolution into a comprehensive, GitHub-ready `README.md`.

## Features

### 1. Semantic Git Scraping & Analysis
Unlike basic diff scrapers, Git Historian deeply understands the architectural intent behind file adjustments:
- **Rename & Move Detection:** Tracks file-system migrations natively so the AI understands structural reorganization rather than treating moves as a wall of deletions and additions.
- **Meaningful Change Filter:** Employs precise regular expression filtering (`/^[+-][^+-].*[a-zA-Z0-9]/m`) to isolate true logical variations from accidental whitespace modifications, preventing generic "Dummy Commits" or AI hallucinations.
- **Git Status Mapping:** Injects explicit semantic event labels (`INDEX_NEW`, `INDEX_DELETED`, `INDEX_TYPECHANGE`) directly into the LLM context pool.

### 2. Enterprise-Ready Contextual Scaffolding
- **Multi-Repo Workspace Support:** Dynamically targets the repository matching your active text editor tab instead of blindly selecting the first indexed root folder.
- **Smart Truncation Shield:** Protects context window limits on massive changes (e.g., thousands of lines of schema updates or translation configurations) using an automated "Head & Tail" compression technique.
- **Stack & Dependency Awareness:** Scans for root stack manifests (`package.json`, `requirements.txt`, `go.mod`, etc.) to align commit terminology directly with your language's ecosystem conventions.

### 3. The Historian Journal ("The Development Diary")
Maintains a clean, lightweight chronological log at `.gitgen/journal.json` tracking the progression of code choices over time.
- Saves token overhead by isolating metadata down to raw, high-signal intent.
- Retains incremental engineering thought shifts even if you perform a `git commit --amend`, hard resets, or squash commits on your branch later.
- Automatically handles its own configuration by maintaining entry updates silently inside `.gitignore`.

### 4. Automated README Architecting
- **The 10-Commit Trigger:** Automatically prompts you to refresh your documentation every 10 commits by digesting up to 100 entries of chronological log evolution.
- **Safety-First Buffers:** Never overwrites manual work blindly; provides immediate choices between direct filesystems updates or streaming to a side-by-side, unsaved preview tab.

---

## Extension Architecture

The module utilizes a decoupled UI/Engine pattern:
- `extension.js`: The central orchestrator managing commands, UI inputs (`QuickPick` menus), streaming progress bars, and reactive counts.
- `utils/git-bridge.js`: Interfaces cleanly with the core VS Code Git API extension ecosystem.
- `utils/ai-helpers.js`: Sanitizes diffs, redacts sensitive PII data/API tokens, and manages heavy map-reduce summarizing logic.
- `utils/historian.js`: Controls local file reading/writing systems and manages `.gitignore` protection rules.
- `utils/readme-engine.js`: Dedicated content generation module providing prompt containment logic for standard-compliant markdown creation.

---

## Getting Started

### Local Installation
1. Install the extension packager utility:
   ```bash
   npm install -g @vscode/vsce
   ```
2. Build the distribution installer from the root directory:
   ```bash
   vsce package
   ```
3. Open VS Code, navigate to the Extensions View (`Cmd+Shift+X`), select **Install from VSIX...** from the window menu, and open the generated archive.

### Basic Usage
1. Stage your current files inside any valid Git repository via your standard workbench interface.
2. Trigger the message generator through the Command Palette (`Cmd+Shift+P` -> `Historian: Generate Message`) or simply select the **Magic Wand Icon** directly inside your Source Control side menu.
3. Select your intended commit variant through the Guided `QuickPick` interface—the model handles the scope extraction and technical description automatically.

---

## Technical Specifications
- **Runtime System:** VS Code Extension Host (Node.js)
- **AI Processing Backend:** Copilot/GPT Chat Language Models Pipeline API
- **Local Sandbox Storage:** Root level `.gitgen/journal.json`

---

### Footnote
*Towards the end of building this project, I realized that some of its main features were redundant and did things that github itself already did (but making it a bit easier, which still isn't really worth a whole other extension). That being said, I still believe this project has potential and plan to pivot it to a different direction soon. The goal still remains creating an extension that makes it easier to maintain enterprise-level code while actively combating tech debt across all levels, right from the project's inception.*
