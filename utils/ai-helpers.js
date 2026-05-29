import * as vscode from 'vscode';

export function scrubSensitiveData(text) {
    return text
        .replace(/\\ No newline at end of file/g, "")
        // Scrub Emails
        .replace(/([a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9-.]+)/gi, "[EMAIL]")
        // Scrub IP Addresses
        .replace(/(\d{1,3}\.){3}\d{1,3}/g, "[IP_ADDRESS]")
        // Scrub Common API Key Patterns (Stripe, AWS, Generic)
        .replace(/(sk_test_|AIza|AKIA|ghp_)[a-zA-Z0-9]{16,}/g, "[SENSITIVE_KEY_REDACTED]")
        // Scrub long Hex/Hashes
        .replace(/(0x)?[0-9a-fA-F]{32,}/g, "[HASH/ID]");
}

export async function summarizeLargeDiff(model, fileDiffs) {
    let summaries = [];
    for (const file of fileDiffs) {
        // Skip files that are already placeholders
        if (file.diff.startsWith("[")) {
            summaries.push(`File ${file.path}: ${file.diff}`);
            continue;
        }

        const msg = [
            vscode.LanguageModelChatMessage.Assistant("Summarize the functional change in this file in 10 words or less. Be specific about business logic."),
            vscode.LanguageModelChatMessage.User(file.diff)
        ];
        
        try {
            const res = await model.sendRequest(msg, {}, new vscode.CancellationTokenSource().token);
            let text = "";
            for await (const chunk of res.text) text += chunk;
            summaries.push(`File ${file.path}: ${text.trim()}`);
        } catch (e) {
            summaries.push(`File ${file.path}: [Summary failed due to size]`);
        }
    }
    return summaries.join('\n');
}