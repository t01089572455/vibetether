export class CliError extends Error {
  constructor(message, exitCode = 2, output = null, outputStream = 'stderr') {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.output = output;
    this.outputStream = outputStream;
  }
}
