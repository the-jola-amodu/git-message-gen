import * as vscode from 'vscode';

const IGNORED_EXTENSIONS = ['.lock', '.yaml', '.yml', '.log', '.map', '.bin', '.exe', '.ds_store', '.tmp', '.pt', '.weights', '.h5'];
const ASSET_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.mp4', '.mov', '.wav', '.mp3', '.pdf', '.ttf', '.woff', '.woff2'];
const IGNORED_FOLDERS = ['node_modules', 'dist', 'out', 'build', '.git', '.next', 'target'];

export function getActiveRepo(gitApi) {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return gitApi.repositories[0];

    const uri = activeEditor.document.uri;
    // Find the repo that contains this file's URI
    return gitApi.repositories.find(repo => 
        uri.fsPath.startsWith(repo.rootUri.fsPath)
    ) || gitApi.repositories[0];
}

export async function getStagedDiffs(repo) {
    const changes = await repo.diffIndexWith('HEAD');
    let diffs = [];
    let hasDependencyChanges = false;
    let hasMeaningfulChange = false;

    for (const change of changes) {
        const path = change.uri.fsPath.toLowerCase();
        const isRename = change.status === 3 || change.status === 4;
        
        // Check for dependency file changes specifically
        if (path.endsWith('package.json') || path.endsWith('requirements.txt') || path.endsWith('go.mod')) {
            hasDependencyChanges = true;
        }
        
        if (path.includes('/models/') || path.includes('/data/')) {
            diffs.push({ path: change.uri.fsPath, diff: "[Large Data/Model file changed: Metadata only]" });
            continue;
        }

        if (IGNORED_EXTENSIONS.some(ext => path.endsWith(ext)) || IGNORED_FOLDERS.some(f => path.includes(f))) continue;

        if (ASSET_EXTENSIONS.some(ext => path.endsWith(ext)) || path.includes('assets/')) {
            diffs.push({ path: change.uri.fsPath, diff: "[Binary/Asset file skipped]" });
            continue;
        }
        
        const diff = await repo.diff(change.uri.fsPath);
        if (isRename) {
            diff = `[FILE RENAMED/MOVED] Original path might have changed. Diff follows:\n${diff}`;
            hasMeaningfulChange = true;
        }
        const meaningfulRegex = /^[+-][^+-].*[a-zA-Z0-9]/m;
        if (meaningfulRegex.test(diff)) {
            hasMeaningfulChange = true;
        }

        if (diff.length > 20000) {
            const head = diff.substring(0, 5000);
            const tail = diff.substring(diff.length - 5000);
            diff = `${head}\n\n... [TRUNCATED ${diff.length - 10000} characters for performance] ...\n\n${tail}`;
        }

        diffs.push({ path: change.uri.fsPath, diff });
    }
    return { diffs, hasDependencyChanges, hasMeaningfulChange };
}

export async function getProjectContext() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return "Unknown Project";

    // Search for 1-2 levels deep for tech stack clues
    const files = await vscode.workspace.findFiles('{package.json,requirements.txt,go.mod,pom.xml}', '**/node_modules/**', 5);
    
    if (files.length > 0) {
        const fileName = files[0].path.split('/').pop();
        const techStacks = {
            'package.json': 'Node.js/JavaScript',
            'requirements.txt': 'Python',
            'go.mod': 'Go',
            'pom.xml': 'Java/Maven'
        };
        return techStacks[fileName] || "Standard Software Project";
    }
    return "General Project";
}

/**
 * Retrieves the current branch name from the repository state.
 * @param {import('vscode').SourceControlRepository} repo 
 */
export async function getBranchName(repo) {
    try {
        // repo.state.HEAD provides information about the current commit and branch
        const branchName = repo.state.HEAD?.name;
        return branchName || "main"; 
    } catch (err) {
        console.error("Could not retrieve branch name:", err);
        return "unknown-branch";
    }
}