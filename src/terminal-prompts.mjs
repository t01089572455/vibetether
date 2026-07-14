import { createInterface } from 'node:readline/promises';

function promptText(question) {
  const recommended = question.recommended ?? question.default;
  const suffix = recommended === null || recommended === undefined || recommended === ''
    ? ''
    : `\nRecommended: ${recommended}`;
  return `${question.prompt}${suffix}\n> `;
}

export function createTerminalPromptAdapter({ input = process.stdin, output = process.stdout } = {}) {
  const terminal = createInterface({ input, output });
  return {
    interactive: Boolean(input?.isTTY && output?.isTTY),
    async ask(question) {
      const answer = (await terminal.question(promptText(question))).trim();
      return answer || question.recommended || question.default || '';
    },
    async confirm(summary) {
      const answer = (await terminal.question(`${summary}\nApply these changes? [y/N] `)).trim().toLowerCase();
      return answer === 'y' || answer === 'yes';
    },
    close() {
      terminal.close();
    },
  };
}
