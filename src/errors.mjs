export class VibeTetherError extends Error {
  constructor(message, exitCode = 3, output = null, outputStream = 'stderr', code = null) {
    super(message);
    this.name = 'VibeTetherError';
    this.exitCode = exitCode;
    this.output = output;
    this.outputStream = outputStream;
    this.code = code;
  }
}

export const usageError = (message) => new VibeTetherError(message, 2, null, 'stderr', 'USAGE');
export const conflictError = (message, code = 'CONFLICT') => new VibeTetherError(message, 3, null, 'stderr', code);

export function healthError(report, json = false) {
  const output = json
    ? `${JSON.stringify(report, null, 2)}\n`
    : `VibeTether doctor found ${report.issues.length} issue(s)${report.warnings.length ? ` and ${report.warnings.length} warning(s)` : ''}:\n${[...report.issues, ...report.warnings].map((item) => `  - [${item.code}] ${item.message}`).join('\n')}\n`;
  return new VibeTetherError('Project health check failed.', 4, output, json ? 'stdout' : 'stderr', 'HEALTH');
}
