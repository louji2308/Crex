import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLI_PATH = resolve(__dirname, "..", "python", "cli.py");

export interface PythonCliArgs {
  inputFile: string;
  outputFile?: string;
  manifestJson?: string;
  signCert?: string;
  signKey?: string;
  passPhrase?: string;
}

export interface PythonCliResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function buildArgs(
  tool: "embed" | "verify",
  args: PythonCliArgs,
): string[] {
  const parts: string[] = [CLI_PATH, tool, "--input", args.inputFile];

  if (tool === "embed") {
    if (args.outputFile) {
      parts.push("--output", args.outputFile);
    }
    if (args.manifestJson) {
      parts.push("--manifest", args.manifestJson);
    }
    if (args.signCert) {
      parts.push("--sign-cert", args.signCert);
    }
    if (args.signKey) {
      parts.push("--sign-key", args.signKey);
    }
    if (args.passPhrase) {
      parts.push("--passphrase", args.passPhrase);
    }
  }

  return parts;
}

export function invokePythonCli(
  tool: "embed" | "verify",
  args: PythonCliArgs,
): Promise<PythonCliResult> {
  return new Promise((resolve) => {
    const cliArgs = buildArgs(tool, args);

    execFile(
      "python",
      cliArgs,
      { timeout: 30_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            stdout: stdout ?? "",
            stderr: stderr ?? error.message,
          });
        } else {
          resolve({
            ok: true,
            stdout: stdout ?? "",
            stderr: stderr ?? "",
          });
        }
      },
    );
  });
}
