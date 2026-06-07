import * as vscode from 'vscode';

const IGNORED_EXTENSIONS = ['.lock', '.yaml', '.yml', '.log', '.map', '.bin', '.exe', '.ds_store', '.tmp', '.pt', '.weights', '.h5'];
const ASSET_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.mp4', '.mov', '.wav', '.mp3', '.pdf', '.ttf', '.woff', '.woff2'];
const IGNORED_FOLDERS = ['node_modules', 'dist', 'out', 'build', '.git', '.next', 'target'];

function getStatusLabel(status) {
    const statusMap = {
        1: "INDEX_NEW",
        2: "INDEX_MODIFIED",
        3: "INDEX_DELETED",
        4: "INDEX_RENAMED",
        5: "INDEX_TYPECHANGE"
    };
    return statusMap[status] || "MODIFIED";
}

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
    let changes;
    try {
        changes = await repo.diffIndexWith('HEAD');
    } catch (err) {
        // Fallback for initial commit (no HEAD)
        changes = await repo.diffIndexWith();
    }

    let diffs = [];
    let hasDependencyChanges = false;
    let hasMeaningfulChange = false;

    for (const change of changes) {
        const path = change.uri.fsPath;
        const lowerPath = path.toLowerCase();
        const statusLabel = getStatusLabel(change.status);
        const isRename = change.status === 3 || change.status === 4;
        
        // 1. Dependency Check
        if (lowerPath.endsWith('package.json') || lowerPath.endsWith('requirements.txt') || lowerPath.endsWith('go.mod')) {
            hasDependencyChanges = true;
        }
        
        // 2. Large Data/Folders Filter
        if (lowerPath.includes('/models/') || lowerPath.includes('/data/')) {
            diffs.push({ path, diff: "[Large Data/Model file changed: Metadata only]" });
            continue;
        }

        // 3. Ignore Rules
        if (IGNORED_EXTENSIONS.some(ext => lowerPath.endsWith(ext)) || IGNORED_FOLDERS.some(f => lowerPath.includes(f))) continue;
        
        // 4. Asset Filter
        if (ASSET_EXTENSIONS.some(ext => lowerPath.endsWith(ext)) || lowerPath.includes('assets/')) {
            diffs.push({ path, diff: "[Binary/Asset file skipped]" });
            continue;
        }
        
        // 5. Deletion Handling
        if (statusLabel === "INDEX_DELETED") {
            diffs.push({ path, diff: `[GIT_STATUS: INDEX_DELETED]\n[DELETION EVENT] This file has been removed.` });
            hasMeaningfulChange = true;
            continue;
        }

        // 6. Diff Acquisition
        let diff = await repo.diff(path);

        // 7. Meaningful Change Detection (Run before truncation)
        const meaningfulRegex = /^[+-][^+-].*[a-zA-Z0-9]/m;
        if (meaningfulRegex.test(diff) || isRename) {
            hasMeaningfulChange = true;
        }

        // 8. Rename Labeling
        if (isRename) {
            diff = `[FILE RENAMED/MOVED] Original path might have changed.\n${diff}`;
        }

        // 9. Truncation Logic
        if (diff.length > 20000) {
            const head = diff.substring(0, 5000);
            const tail = diff.substring(diff.length - 5000);
            diff = `${head}\n\n... [TRUNCATED ${diff.length - 10000} characters] ...\n\n${tail}`;
        }

        diffs.push({ path, diff: `[GIT_STATUS: ${statusLabel}]\n${diff}` });
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