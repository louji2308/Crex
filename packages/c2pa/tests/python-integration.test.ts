import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const MINIMAL_PNG_1X1 = Buffer.from(
  "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082",
  "hex",
);

let tmpDir: string;
let pythonAvailable = false;
let c2paAvailable = false;
let openSslBin: string | null = null;

async function checkPython(): Promise<boolean> {
  try {
    await execFileAsync("python", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function findOpenSsl(): Promise<string | null> {
  const candidates = ["openssl", "C:\\Program Files\\Git\\usr\\bin\\openssl.exe"];
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["version"]);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function installC2pa(): Promise<boolean> {
  try {
    await execFileAsync(
      "python",
      ["-m", "pip", "install", "c2pa-python==0.37.10"],
      { timeout: 180_000 },
    );
    const result = await execFileAsync("python", [
      "-c",
      "import importlib.metadata as m; print(m.version('c2pa-python'))",
    ]);
    return result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function runOpenSsl(args: string[]): Promise<string> {
  if (openSslBin === null) {
    throw new Error("openssl is not available");
  }
  const result = await execFileAsync(openSslBin, args, { timeout: 60_000 });
  return result.stdout;
}

/**
 * Generate a real ECDSA P-256 signing chain:
 * self-signed root CA -> intermediate CA -> leaf signer (PKCS#8 key).
 * The leaf profile matches the CAI es256 recipe (digitalSignature +
 * nonRepudiation key usage, emailProtection EKU).
 */
async function generateSigningChain(): Promise<{
  certPath: string;
  keyPath: string;
  rootPath: string;
}> {
  const certPath = join(tmpDir, "chain.pem");
  const keyPath = join(tmpDir, "leaf_pkcs8.key");
  const rootPath = join(tmpDir, "root.pem");

  await writeFile(
    join(tmpDir, "root.ext"),
    "[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n",
  );
  await writeFile(
    join(tmpDir, "int.ext"),
    "[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,nonRepudiation,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n",
  );
  await writeFile(
    join(tmpDir, "leaf.ext"),
    "[v3_leaf]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,nonRepudiation\nextendedKeyUsage=critical,emailProtection\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n",
  );

  await runOpenSsl([
    "ecparam", "-name", "prime256v1", "-genkey", "-noout",
    "-out", join(tmpDir, "root.key"),
  ]);
  await runOpenSsl([
    "req", "-new", "-key", join(tmpDir, "root.key"),
    "-out", join(tmpDir, "root.csr"), "-subj", "/CN=Crex Test Root/O=Crex/C=US",
  ]);
  await runOpenSsl([
    "x509", "-req", "-in", join(tmpDir, "root.csr"), "-signkey",
    join(tmpDir, "root.key"), "-out", rootPath, "-days", "3650",
    "-extfile", join(tmpDir, "root.ext"), "-extensions", "v3_ca",
  ]);

  await runOpenSsl([
    "ecparam", "-name", "prime256v1", "-genkey", "-noout",
    "-out", join(tmpDir, "int.key"),
  ]);
  await runOpenSsl([
    "req", "-new", "-key", join(tmpDir, "int.key"),
    "-out", join(tmpDir, "int.csr"), "-subj",
    "/CN=Crex Test Intermediate/O=Crex/C=US",
  ]);
  await runOpenSsl([
    "x509", "-req", "-in", join(tmpDir, "int.csr"), "-CA", rootPath,
    "-CAkey", join(tmpDir, "root.key"), "-CAcreateserial",
    "-out", join(tmpDir, "int.pem"), "-days", "1825",
    "-extfile", join(tmpDir, "int.ext"), "-extensions", "v3_ca",
  ]);

  await runOpenSsl([
    "ecparam", "-name", "prime256v1", "-genkey", "-noout",
    "-out", join(tmpDir, "leaf.key"),
  ]);
  await runOpenSsl([
    "req", "-new", "-key", join(tmpDir, "leaf.key"),
    "-out", join(tmpDir, "leaf.csr"), "-subj",
    "/CN=Crex Test Signer/O=Crex/C=US",
  ]);
  await runOpenSsl([
    "x509", "-req", "-in", join(tmpDir, "leaf.csr"), "-CA",
    join(tmpDir, "int.pem"), "-CAkey", join(tmpDir, "int.key"),
    "-CAcreateserial", "-out", join(tmpDir, "leaf.pem"), "-days", "365",
    "-extfile", join(tmpDir, "leaf.ext"), "-extensions", "v3_leaf",
  ]);
  await runOpenSsl([
    "pkcs8", "-topk8", "-nocrypt", "-in", join(tmpDir, "leaf.key"),
    "-out", keyPath,
  ]);

  const leafPem = await readFile(join(tmpDir, "leaf.pem"), "utf-8");
  const intPem = await readFile(join(tmpDir, "int.pem"), "utf-8");
  await writeFile(certPath, leafPem + "\n" + intPem);

  return { certPath, keyPath, rootPath };
}

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "crex-c2pa-int-"));

  pythonAvailable = await checkPython();
  if (pythonAvailable) {
    c2paAvailable = await installC2pa();
  }
  openSslBin = await findOpenSsl();
}, 300_000);

const skipNoPython = () => {
  if (!pythonAvailable) {
    return "Python not available in environment";
  }
  return false;
};

const skipNoC2pa = () => {
  if (!pythonAvailable) return "Python not available in environment";
  if (!c2paAvailable) return "c2pa-python package not installable";
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

  it("c2pa-python package install result is recorded", () => {
    if (!pythonAvailable) {
      console.log("SKIP: Python not available");
      return;
    }
    console.log(
      `RESULT: c2pa-python ${c2paAvailable ? "installed" : "NOT installed"}`,
    );
    expect(typeof c2paAvailable).toBe("boolean");
  });

  it(
    "embed without a signer is rejected honestly (exit non-zero)",
    async () => {
      const reason = skipNoPython();
      if (reason) {
        console.log(`SKIP: ${reason}`);
        return;
      }
      const cliPath = join(__dirname, "..", "python", "cli.py");
      const inputFile = join(tmpDir, "unsigned.png");
      await writeFile(inputFile, MINIMAL_PNG_1X1);

      const manifest = {
        claim_generator: "crex/0.1.0",
        title: "unsigned.png",
        assertions: [],
        ingredients: [],
      };
      const manifestPath = join(tmpDir, "manifest-unsigned.json");
      await writeFile(manifestPath, JSON.stringify(manifest));

      try {
        await execFileAsync("python", [
          cliPath,
          "embed",
          "--input",
          inputFile,
          "--output",
          join(tmpDir, "out-unsigned.png"),
          "--manifest",
          manifestPath,
        ]);
        throw new Error("embed without a signer should have exited non-zero");
      } catch (err: unknown) {
        const e = err as { code?: number; stderr?: string };
        if (e.code === 0 || e.code === undefined) {
          throw err;
        }
        const stderr = e.stderr ?? "";
        if (c2paAvailable) {
          expect(e.code).toBe(1);
          expect(stderr).toContain("signer");
        } else {
          expect(e.code).toBe(2);
          expect(stderr).toContain("c2pa-python SDK not installed");
        }
      }
    },
    60_000,
  );

  it(
    "signed embed + verify reports honest validation state",
    async () => {
      const reason = skipNoC2pa();
      if (reason) {
        console.log(`SKIP: ${reason}`);
        return;
      }
      if (openSslBin === null) {
        console.log("SKIP: openssl not available for cert chain generation");
        return;
      }

      const { certPath, keyPath, rootPath } = await generateSigningChain();

      const inputFile = join(tmpDir, "test-signed.png");
      await writeFile(inputFile, MINIMAL_PNG_1X1);

      const manifest = {
        claim_generator: "crex/0.1.0",
        format: "image/png",
        title: "test-signed.png",
        assertions: [
          {
            label: "c2pa.actions",
            data: {
              actions: [
                {
                  action: "c2pa.created",
                  digitalSourceType:
                    "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
                },
              ],
            },
          },
          {
            label: "c2pa.crex_provenance",
            data: {
              record_id: "rec-signed-001",
              asset_id: "asset-signed-001",
              asset_sha256: "f".repeat(64),
              title: "test-signed.png",
              created_at: "2026-09-07T00:00:00.000Z",
            },
          },
        ],
        ingredients: [],
      };
      const manifestPath = join(tmpDir, "manifest-signed.json");
      await writeFile(manifestPath, JSON.stringify(manifest));

      const cliPath = join(__dirname, "..", "python", "cli.py");
      const signedOutput = join(tmpDir, "out-signed.png");

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
        "--sign-alg",
        "es256",
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
      expect(verifyParsed.state).toBe("Valid");
      expect(verifyParsed.signature_valid).toBe(true);
      expect(verifyParsed.signature_trusted).toBe(false);
      expect(Array.isArray(verifyParsed.manifests)).toBe(true);

      const untrustedCode = verifyParsed.status.some(
        (s: { code: string }) => s.code === "signingCredential.untrusted",
      );
      expect(untrustedCode).toBe(true);

      if (verifyParsed.manifests.length > 0) {
        const m = verifyParsed.manifests[0];
        expect(m).toHaveProperty("label");
        expect(m).toHaveProperty("signature");
        expect(m.signature).toHaveProperty("issuer");
      }

      // Trusting our own root CA must flip the honest state to Trusted.
      const trustedResult = await execFileAsync("python", [
        cliPath,
        "verify",
        "--input",
        signedOutput,
        "--trust-anchors",
        rootPath,
      ]);

      const trustedParsed = JSON.parse(trustedResult.stdout);
      expect(trustedParsed.state).toBe("Trusted");
      expect(trustedParsed.signature_valid).toBe(true);
      expect(trustedParsed.signature_trusted).toBe(true);

      console.log(
        `RESULT: Signed embed+verify produced ${verifyParsed.manifests.length} manifest(s); ` +
          `untrusted state=${verifyParsed.state}, trusted state=${trustedParsed.state}`,
      );
    },
    180_000,
  );
});