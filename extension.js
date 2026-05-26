import { COMMIT_SYSTEM_PROMPT } from './prompts.js';
import * as vscode from 'vscode';

const systemPrompt = process.env.COMMIT_SYSTEM_PROMPT;

// --- HELPER: Extracts the actual code changes ---
async function getStagedDiff(repo) {
    const changes = await repo.diffIndexWith('HEAD');
    let fullDiff = "";

    for (const change of changes) {
        // repo.diff gives us the actual text content of the git diff
        const diff = await repo.diff(change.uri.fsPath);
        fullDiff += `--- File: ${change.uri.fsPath} ---\n${diff}\n\n`;
    }
    return fullDiff;
}

/**
 * @param {vscode.ExtensionContext} context
 */
export async function activate(context) {
    console.log('Git Message Gen is now active!');

    let disposable = vscode.commands.registerCommand('git-message-gen.generateCommit', async () => {
        // 1. Grab the Git Extension API
        const gitExtension = vscode.extensions.getExtension('vscode.git').exports;
        const gitApi = gitExtension.getAPI(1);
        const repo = gitApi.repositories[0];

        if (!repo) {
            vscode.window.showErrorMessage("No Git repository found in the current workspace.");
            return;
        }

        // 2. Get the diff of staged changes
        const diffText = await getStagedDiff(repo);
        
        if (!diffText || diffText.trim() === "") {
            vscode.window.showWarningMessage("No staged changes found. Please stage your files first!");
            return;
        }

        // 3. Select the AI Model (GPT-4o is standard for Copilot in 2026)
        try {
            // Try selecting WITHOUT a filter first to see what's available
            let models = await vscode.lm.selectChatModels();

            // If that's empty, try specifically asking for the vendor
            if (models.length === 0) {
                models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            }

            const model = models[0]; // Take the first one available

            if (!model) {
                // This is the error you are hitting
                vscode.window.showErrorMessage("Still no models found. Check the 'Accounts' icon in the bottom left of VS Code—are you signed into GitHub?");
                return;
            }

            // 4. Construct the prompt
            const messages = [
                vscode.LanguageModelChatMessage.Assistant(COMMIT_SYSTEM_PROMPT),
                vscode.LanguageModelChatMessage.User(`Analyze this diff and write a commit message:\n\n${diffText}`)
            ];

            // 5. Send request and stream response
            const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
            
            let commitMessage = "";
            for await (const chunk of response.text) {
                commitMessage += chunk;
            }

            // 6. Inject the result into the VS Code Git input box
            repo.inputBox.value = commitMessage.trim();
            vscode.window.showInformationMessage("Commit message generated!");

        } catch (err) {
            vscode.window.showErrorMessage(`AI Error: ${err.message}`);
            console.error(err);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
