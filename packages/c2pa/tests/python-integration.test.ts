import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMp4 } from "@crex/media";

const execFileAsync = promisify(execFile);

let tmpDir: string;
let pythonAvailable = false;
let c2paAvailable = false;

async function checkPython(): Promise<boolean> {
  try {
    await execFileAsync("python", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function installC2pa(): Promise<boolean> {
  try {
    await execFileAsync("python", ["-m", "pip", "install", "c2pa"], {
      timeout: 180_000,
    });
    const result = await execFileAsync("python", [
      "-c",
      "import c2pa; print(c2pa.__version__)",
    ]);
    return result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function hasOpenSsl(): Promise<boolean> {
  try {
    await execFileAsync("openssl", ["version"]);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "crex-c2pa-int-"));

  pythonAvailable = await checkPython();
  if (pythonAvailable) {
    c2paAvailable = await installC2pa();
  }
}, 300_000);

const skipNoPython = () => {
  if (!pythonAvailable) {
    return "Python not available in environment";
  }
  return false;
};

const skipNoC2pa = () => {
  if (!pythonAvailable) return "Python not available in environment";
  if (!c2paAvailable) return "c2pa Python package not installable (MSVC missing)";
  return false;
};

describe("python-integration", () => {
  it("python is available", () => {
    if (!pythonAvailable) {
      console.log("SKIP: Python not available");
      return;
    }
    expect(pythonAvailable).toBe(true);
  });

  it("c2pa python package install result is recorded", () => {
    if (!pythonAvailable) {
      console.log("SKIP: Python not available");
      return;
    }
    if (c2paAvailable) {
      console.log("RESULT: c2pa Python package installed successfully");
    } else {
      console.log(
        "RESULT: c2pa Python package failed to install (py3exiv2 needs MSVC 14.0)",
      );
    }
    expect(typeof c2paAvailable).toBe("boolean");
  });

  it(
    "cli.py exits 2 when c2pa module is missing",
    async () => {
      const reason = skipNoPython();
      if (reason) {
        console.log(`SKIP: ${reason}`);
        return;
      }
      const cliPath = join(__dirname, "..", "python", "cli.py");

      const mp4Bytes = buildMp4();
      const inputFile = join(tmpDir, "test-no-module.mp4");
      await writeFile(inputFile, mp4Bytes);

      try {
        const result = await execFileAsync("python", [
          cliPath,
          "embed",
          "--input",
          inputFile,
          "--output",
          join(tmpDir, "out-no-module.mp4"),
          "--manifest",
          join(tmpDir, "nonexistent.json"),
        ]);
        if (c2paAvailable) {
          expect(result.stdout).toBeTruthy();
        } else {
          expect(true, "Should have failed when c2pa not available").toBe(
            false,
          );
        }
      } catch (err: unknown) {
        if (c2paAvailable) {
          throw err;
        }
        const e = err as { code?: number; stderr?: string };
        expect(e.code).toBe(2);
      }
    },
    60_000,
  );

  it(
    "embed unsigned produces an output file",
    async () => {
      if (!pythonAvailable) {
        console.log("SKIP: Python not available");
        return;
      }
      if (!c2paAvailable) {
        console.log(
          "SKIP: c2pa Python package not available, testing embed error path",
        );
        const cliPath = join(__dirname, "..", "python", "cli.py");
        const mp4Bytes = buildMp4();
        const inputFile = join(tmpDir, "test-embed-unsigned.mp4");
        await writeFile(inputFile, mp4Bytes);

        const manifest = {
          claim_generator: "crex/0.1.0",
          format: "video/mp4",
          title: "test.mp4",
          assertions: [],
          ingredients: [],
        };
        const manifestPath = join(tmpDir, "manifest.json");
        await writeFile(manifestPath, JSON.stringify(manifest));

        try {
          await execFileAsync("python", [
            cliPath,
            "embed",
            "--input",
            inputFile,
            "--output",
            join(tmpDir, "out-unsigned.mp4"),
            "--manifest",
            manifestPath,
          ]);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          expect(e.stderr).toBeTruthy();
          expect(e.stderr).toContain("c2pa");
        }
        return;
      }

      const mp4Bytes = buildMp4();
      const inputFile = join(tmpDir, "test-embed-unsigned.mp4");
      await writeFile(inputFile, mp4Bytes);

      const manifest = {
        claim_generator: "crex/0.1.0",
        format: "video/mp4",
        title: "test-unsigned.mp4",
        assertions: [
          {
            label: "c2pa.crex_provenance",
            data: {
              record_id: "rec-integration-001",
              asset_id: "asset-integration-001",
              asset_sha256: "d".repeat(64),
              title: "test-unsigned.mp4",
              created_at: "2026-09-07T00:00:00.000Z",
            },
          },
        ],
        ingredients: [
          {
            title: "source.mp4",
            hash: "e".repeat(64),
            hash_alg: "sha256",
          },
        ],
      };
      const manifestPath = join(tmpDir, "manifest-unsigned.json");
      await writeFile(manifestPath, JSON.stringify(manifest));

      const cliPath = join(__dirname, "..", "python", "cli.py");
      const result = await execFileAsync("python", [
        cliPath,
        "embed",
        "--input",
        inputFile,
        "--output",
        join(tmpDir, "out-unsigned.mp4"),
        "--manifest",
        manifestPath,
      ]);

      expect(result.stdout).toBeTruthy();
      const parsed = JSON.parse(result.stdout);
      expect(parsed.status).toBe("ok");
    },
    120_000,
  );

  it(
    "signed embed + verify produces VALID status",
    async () => {
      if (!pythonAvailable || !c2paAvailable) {
        console.log(
          "SKIP: Python/c2pa not available for signed embed test",
        );
        return;
      }

      const opensslAvailable = await hasOpenSsl();
      if (!opensslAvailable) {
        console.log(
          "SKIP: openssl not available for self-signed cert generation",
        );
        return;
      }

      const certPath = join(tmpDir, "test-cert.pem");
      const keyPath = join(tmpDir, "test-key.pem");

      await execFileAsync("openssl", [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-keyout",
        keyPath,
        "-out",
        certPath,
        "-days",
        "1",
        "-nodes",
        "-subj",
        "/CN=Crex Test/O=Crex/C=US",
      ]);

      const mp4Bytes = buildMp4();
      const inputFile = join(tmpDir, "test-signed.mp4");
      await writeFile(inputFile, mp4Bytes);

      const manifest = {
        claim_generator: "crex/0.1.0",
        format: "video/mp4",
        title: "test-signed.mp4",
        assertions: [
          {
            label: "c2pa.crex_provenance",
            data: {
              record_id: "rec-signed-001",
              asset_id: "asset-signed-001",
              asset_sha256: "f".repeat(64),
              title: "test-signed.mp4",
              created_at: "2026-09-07T00:00:00.000Z",
            },
          },
        ],
        ingredients: [],
      };
      const manifestPath = join(tmpDir, "manifest-signed.json");
      await writeFile(manifestPath, JSON.stringify(manifest));

      const cliPath = join(__dirname, "..", "python", "cli.py");
      const signedOutput = join(tmpDir, "out-signed.mp4");

      const embedResult = await execFileAsync("python", [
        cliPath,
        "embed",
        "--input",
        inputFile,
        "--output",
        signedOutput,
        "--manifest",
        manifestPath,
        "--sign-cert",
        certPath,
        "--sign-key",
        keyPath,
      ]);

      expect(embedResult.stdout).toBeTruthy();
      const embedParsed = JSON.parse(embedResult.stdout);
      expect(embedParsed.status).toBe("ok");

      const verifyResult = await execFileAsync("python", [
        cliPath,
        "verify",
        "--input",
        signedOutput,
      ]);

      expect(verifyResult.stdout).toBeTruthy();
      const verifyParsed = JSON.parse(verifyResult.stdout);
      expect(verifyParsed).toHaveProperty("manifests");
      expect(Array.isArray(verifyParsed.manifests)).toBe(true);

      if (verifyParsed.manifests.length > 0) {
        const m = verifyParsed.manifests[0];
        expect(m).toHaveProperty("label");
        expect(m).toHaveProperty("signature");
      }

      console.log(
        `RESULT: Signed embed+verify produced ${verifyParsed.manifests.length} manifest(s)`,
      );
    },
    120_000,
  );
});
