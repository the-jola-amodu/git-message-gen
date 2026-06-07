import * as vscode from 'vscode';
import { COMMIT_SYSTEM_PROMPT } from './prompts.js';
import { getStagedDiffs, getProjectContext, getBranchName, getActiveRepo } from './utils/git-bridge.js';
import { addToJournal, getRecentJournalEntries } from './utils/historian.js';
import { scrubSensitiveData, summarizeLargeDiff, getAIModel } from './utils/ai-helpers.js';
import { generateReadmeContent } from './utils/readme-engine.js';

export async function activate(context) {
    console.log('Git Message Gen: Historian Mode Active');

    let commitDisposable = vscode.commands.registerCommand('git-message-gen.generateCommit', async () => {
        // 1. Setup Git API
        const gitExtension = vscode.extensions.getExtension('vscode.git').exports;
        const gitApi = gitExtension.getAPI(1);
        const repo = getActiveRepo(gitApi);

        if (!repo) {
            return vscode.window.showErrorMessage("No Git repository found.");
        }

        // 2. Human Intent: The QuickPick
        // We ask the user for the "Type" first to guide the AI and ensure Journal accuracy
        const commitTypes = [
            { label: 'feat', description: 'A new feature' },
            { label: 'fix', description: 'A bug fix' },
            { label: 'refactor', description: 'Code change that neither fixes a bug nor adds a feature' },
            { label: 'docs', description: 'Documentation only changes' },
            { label: 'chore', description: 'Changes to build process/auxiliary tools' },
            { label: 'style', description: 'Formatting, missing semi-colons, etc.' },
            { label: 'test', description: 'Adding or correcting tests' }
        ];

        const selectedType = await vscode.window.showQuickPick(commitTypes, {
            placeHolder: 'Select the type of change you are committing',
            title: 'Git Historian: Step 1'
        });

        if (!selectedType) return; // User cancelled

        // 3. Data Gathering (The Eyes & Memory)
        const { diffs, hasDependencyChanges, hasMeaningfulChange } = await getStagedDiffs(repo);
        
        if (!hasMeaningfulChange) {
            repo.inputBox.value = "style: minor formatting adjustments";
            // We skip the Journal and the AI call entirely.
            return vscode.window.showInformationMessage("Detected only whitespace or empty changes. Set to 'style' commit.");
        }

        try {
            const model = await getAIModel();
            if (!model) return vscode.window.showErrorMessage("No AI models found.");

            const branch = await getBranchName(repo);
            const projectType = await getProjectContext();
            const history = await getRecentJournalEntries(3);
            const historyContext = history.map(h => `- ${h.message}`).join('\n');

            // 4. Scaling Logic (The Processor)
            let aiInput = "";
            const totalSize = diffs.reduce((acc, f) => acc + f.diff.length, 0);
            
            if (totalSize > 12000) {
                vscode.window.setStatusBarMessage("$(sync~spin) Summarizing large enterprise diff...", 5000);
                aiInput = await summarizeLargeDiff(model, diffs);
            } else {
                aiInput = diffs.map(f => `File: ${f.path}\n${f.diff}`).join('\n\n');
            }

            // 5. Final Synthesis
            const messages = [
                vscode.LanguageModelChatMessage.Assistant(
                    `${COMMIT_SYSTEM_PROMPT}
                    ---
                    USER INTENT: The user has explicitly categorized this as a "${selectedType.label}".
                    PROJECT: ${projectType}
                    BRANCH: ${branch}
                    DEPENDENCIES CHANGED: ${hasDependencyChanges ? 'Yes' : 'No'}
                    HISTORY:
                    ${historyContext}`
                ),
                vscode.LanguageModelChatMessage.User(
                    `Generate the description part for a "${selectedType.label}" commit based on these changes:\n\n${scrubSensitiveData(aiInput)}`
                )
            ];

            const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
            
            let description = "";
            for await (const chunk of response.text) {
                description += chunk;
            }

            // Construct final conventional commit message
            const finalMessage = `${selectedType.label}: ${description.trim()}`;

            // 6. Injection & Journaling
            repo.inputBox.value = finalMessage;
            await addToJournal(finalMessage);

            // 1. Save to Journal and get current count
            const commitCount = await addToJournal(finalMessage);

            // 2. Automatic Trigger Check
            if (commitCount > 0 && commitCount % 10 === 0) {
                runReadmeArchitect(model);
            }

            vscode.window.showInformationMessage("Commit history updated in journal.");

        } catch (err) {
            vscode.window.showErrorMessage(`Historian Error: ${err.message}`);
            console.error(err);
        }
    });

    // --- COMMAND: Manual README Architect ---
    let readmeDisposable = vscode.commands.registerCommand('git-message-gen.generateREADME', async () => {
        const model = await getAIModel();
        if (model) await runReadmeArchitect(model);
    });

    context.subscriptions.push(commitDisposable, readmeDisposable);
}

/**
 * CORE LOGIC: The README Architect Flow
 * Handles file checks, user prompts (overwrite vs new), and AI generation
 */
async function runReadmeArchitect(model) {
    const journalEntries = await getRecentJournalEntries(100);
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const readmeUri = vscode.Uri.joinPath(workspaceFolder.uri, 'README.md');
    let existingReadme = false;

    try {
        await vscode.workspace.fs.stat(readmeUri);
        existingReadme = true;
    } catch {
        existingReadme = false;
    }

    // 1. Determine User Preference
    let choice = "Create in New Tab";
    if (existingReadme) {
        choice = await vscode.window.showInformationMessage(
            "The Historian has enough data for a README update. How would you like to proceed?",
            "Overwrite README.md", 
            "Create in New Tab"
        );
    } else {
        // If no readme exists, we'll just create it directly or ask
        choice = await vscode.window.showInformationMessage(
            "No README found. Should the Architect create one?",
            "Create README.md",
            "Preview in New Tab"
        );
    }

    if (!choice) return;

    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Architecting README...",
    }, async () => {
        const markdown = await generateReadmeContent(model, journalEntries);

        if (choice === "Overwrite README.md" || choice === "Create README.md") {
            const encoded = new Uint8Array(Buffer.from(markdown));
            await vscode.workspace.fs.writeFile(readmeUri, encoded);
            vscode.window.showInformationMessage("README.md has been architected!");
        } else {
            const doc = await vscode.workspace.openTextDocument({ content: markdown, language: 'markdown' });
            await vscode.window.showTextDocument(doc);
        }
    });
}

export function deactivate() {}