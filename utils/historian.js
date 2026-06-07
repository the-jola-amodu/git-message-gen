import * as vscode from 'vscode';
import { TextEncoder, TextDecoder } from 'util';

/**
 * Ensures .gitgen/ is ignored by Git to prevent internal logs 
 * from being committed unless the user manually removes it.
 */
async function ensureGitIgnore() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const gitIgnoreUri = vscode.Uri.joinPath(workspaceFolder.uri, '.gitignore');
    const ignorePattern = '\n# Git Historian Journal\n.gitgen/\n';

    try {
        let content = "";
        try {
            const bytes = await vscode.workspace.fs.readFile(gitIgnoreUri);
            content = new TextDecoder().decode(bytes);
        } catch (e) {
            // .gitignore doesn't exist, we'll create it
        }

        if (!content.includes('.gitgen/')) {
            const newContent = content.endsWith('\n') || content === "" 
                ? content + ignorePattern.trimStart() 
                : content + ignorePattern;
            
            await vscode.workspace.fs.writeFile(
                gitIgnoreUri, 
                new TextEncoder().encode(newContent)
            );
        }
    } catch (err) {
        console.error("Failed to update .gitignore:", err);
    }
}

export async function addToJournal(message) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return 0;

    const dotGitGenUri = vscode.Uri.joinPath(workspaceFolder.uri, '.gitgen');
    const journalUri = vscode.Uri.joinPath(dotGitGenUri, 'journal.json');

    try {
        await vscode.workspace.fs.createDirectory(dotGitGenUri);
        await ensureGitIgnore();
        let journalData = [];
        try {
            const content = await vscode.workspace.fs.readFile(journalUri);
            journalData = JSON.parse(new TextDecoder().decode(content));
        } catch (e) {}

        journalData.push({ 
            timestamp: new Date().toISOString(), 
            message: message.split('\n')[0] 
        });

        const encoded = new TextEncoder().encode(JSON.stringify(journalData, null, 2));
        await vscode.workspace.fs.writeFile(journalUri, encoded);
        
        return journalData.length; // Return the total count
    } catch (err) {
        console.error("Historian Error:", err);
        return 0;
    }
}

export async function getRecentJournalEntries(limit = 3) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return [];
    const journalUri = vscode.Uri.joinPath(workspaceFolder.uri, '.gitgen', 'journal.json');
    try {
        const content = await vscode.workspace.fs.readFile(journalUri);
        const data = JSON.parse(new TextDecoder().decode(content));
        return data.slice(-limit);
    } catch { return []; }
}
