import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

let cliPathCache: string | null = null;

function getCliPath(): string {
  if (cliPathCache !== null) {
    return cliPathCache;
  }
  const url = import.meta.url;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error(
      "C2PA python CLI path could not be resolved; the python CLI is only available in Node.js environments.",
    );
  }
  cliPathCache = resolve(dirname(fileURLToPath(url)), "..", "python", "cli.py");
  return cliPathCache;
}

export interface PythonCliArgs {
  inputFile: string;
  outputFile?: string;
  manifestJson?: string;
  signCert?: string;
  signKey?: string;
  passPhrase?: string;
  trustAnchors?: string;
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
  const parts: string[] = [getCliPath(), tool, "--input", args.inputFile];

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

  if (tool === "verify" && args.trustAnchors) {
    parts.push("--trust-anchors", args.trustAnchors);
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
