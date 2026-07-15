import { createInterface } from 'node:readline/promises';

function promptText(question) {
  const recommended = question.recommended ?? question.default;
  const lines = [question.prompt];
  if (question.help) lines.push(question.help);
  if (question.example) lines.push(`Example: ${question.example}`);
  if (recommended !== null && recommended !== undefined && recommended !== '') {
    lines.push(`Recommended: ${recommended}`);
  }
  lines.push('> ');
  return lines.join('\n');
}

function choiceText(question) {
  const lines = [question.prompt];
  if (question.help) lines.push(question.help);
  for (const [index, choice] of question.choices.entries()) {
    const recommended = choice.value === question.recommended ? ' (Recommended)' : '';
    lines.push(`${index + 1}) ${choice.label}${recommended}`);
    if (choice.description) lines.push(`   ${choice.description}`);
  }
  lines.push('> ');
  return lines.join('\n');
}

function selectedChoice(question, answer) {
  if (answer === '' && question.recommended !== null && question.recommended !== undefined) {
    return question.choices.find((choice) => choice.value === question.recommended) ?? null;
  }
  if (/^\d+$/.test(answer)) return question.choices[Number(answer) - 1] ?? null;
  return question.choices.find((choice) => String(choice.value ?? '') === answer) ?? null;
}

export function createTerminalPromptAdapter({ input = process.stdin, output = process.stdout } = {}) {
  const terminal = createInterface({ input, output });
  async function ask(question) {
    if (Array.isArray(question.choices) && question.choices.length > 0) {
      while (true) {
        const answer = (await terminal.question(choiceText(question))).trim();
        if (question.multiple === true) {
          const values = answer.split(',').map((value) => value.trim()).filter(Boolean);
          const selected = values.map((value) => selectedChoice(question, value));
          if (selected.length === 0 || selected.some((choice) => choice === null)) {
            output.write('Please choose one or more numbers separated by commas.\n');
            continue;
          }
          const custom = selected.filter((choice) => choice.customPrompt);
          if (custom.length > 0) {
            if (selected.length !== 1) {
              output.write('Choose the custom entry by itself, then provide its value.\n');
              continue;
            }
            return ask(custom[0].customPrompt);
          }
          return [...new Set(selected.map((choice) => choice.value ?? ''))];
        }
        const choice = selectedChoice(question, answer);
        if (!choice) {
          output.write(`Please choose 1, 2, or ${question.choices.length}.\n`);
          continue;
        }
        if (choice.customPrompt) return ask(choice.customPrompt);
        return choice.value ?? '';
      }
    }

    while (true) {
      const answer = (await terminal.question(promptText(question))).trim();
      if (answer) return answer;
      const recommended = question.recommended ?? question.default;
      if (recommended !== null && recommended !== undefined && recommended !== '') return recommended;
      if (!question.required) return '';
      output.write('A response is required; please use the example as a guide.\n');
    }
  }

  return {
    interactive: Boolean(input?.isTTY && output?.isTTY),
    ask,
    async confirm(summary) {
      while (true) {
        const answer = (await terminal.question(`${summary}\n1) Apply these changes\n2) Cancel (Default)\n> `)).trim().toLowerCase();
        if (answer === '1' || answer === 'y' || answer === 'yes') return true;
        if (answer === '' || answer === '2' || answer === 'n' || answer === 'no') return false;
        output.write('Please choose 1 to apply or 2 to cancel.\n');
      }
    },
    close() {
      terminal.close();
    },
  };
}
