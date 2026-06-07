import * as vscode from 'vscode';
import { getProjectContext } from './git-bridge.js';

export async function generateReadmeContent(model, journalEntries) {
    const projectType = await getProjectContext();
    
    // 1. Grouping logic: Prepare the journal for the AI
    const historyString = journalEntries
        .map(e => `[${e.timestamp}] ${e.message}`)
        .join('\n');

    const messages = [
        vscode.LanguageModelChatMessage.Assistant(
            `You are a Technical Writer specializing in high-quality GitHub documentation.
             Your task is to write a comprehensive README.md based on the provided project history and tech stack.
             
             PROJECT TYPE: ${projectType}
             
             Follow this structure:
             1. # Project Title (Catchy and relevant)
             2. Short Description (The "Elevator Pitch")
             3. Key Features (Bulleted list based on the journal)
             4. Tech Stack (Icons/Badges if applicable)
             5. Getting Started (Generic installation based on project type)
             6. Development History (Summary of the evolution)
             
             Use clean Markdown. Be professional, concise, and helpful.`
        ),
        vscode.LanguageModelChatMessage.User(
            `Here is the project history from the developer's journal:\n\n${historyString}`
        )
    ];

    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
    let markdown = "";
    for await (const chunk of response.text) {
        markdown += chunk;
    }
    return markdown;
}