import * as vscode from 'vscode';
import { TextEncoder, TextDecoder } from 'util';

export async function addToJournal(message) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const dotGitGenUri = vscode.Uri.joinPath(workspaceFolder.uri, '.gitgen');
    const journalUri = vscode.Uri.joinPath(dotGitGenUri, 'journal.json');

    try {
        await vscode.workspace.fs.createDirectory(dotGitGenUri);
        let journalData = [];
        try {
            const content = await vscode.workspace.fs.readFile(journalUri);
            journalData = JSON.parse(new TextDecoder().decode(content));
        } catch (e) {}

        journalData.push({ timestamp: new Date().toISOString(), message });
        const encoded = new TextEncoder().encode(JSON.stringify(journalData, null, 2));
        await vscode.workspace.fs.writeFile(journalUri, encoded);
        console.log("Journal updated!");
    } catch (err) { console.error("Journal error:", err); }
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
