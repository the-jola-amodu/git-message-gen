import * as vscode from 'vscode';
import { COMMIT_SYSTEM_PROMPT } from './prompts.js';
import { getStagedDiffs, getProjectContext, getBranchName, getActiveRepo } from './utils/git-bridge.js';
import { addToJournal, getRecentJournalEntries } from './utils/historian.js';
import { scrubSensitiveData, summarizeLargeDiff } from './utils/ai-helpers.js';

export async function activate(context) {
    console.log('Git Message Gen: Historian Mode Active');

    let disposable = vscode.commands.registerCommand('git-message-gen.generateCommit', async () => {
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
            let models = await vscode.lm.selectChatModels();
            if (models.length === 0) {
                models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            }

            const model = models[0];
            if (!model) {
                vscode.window.showErrorMessage("No AI models found.");
                return;
            }

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

            vscode.window.showInformationMessage("Commit history updated in journal.");

        } catch (err) {
            vscode.window.showErrorMessage(`Historian Error: ${err.message}`);
            console.error(err);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}