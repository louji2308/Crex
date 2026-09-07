#!/usr/bin/env python3
"""
C2PA CLI helper for Crex.

Subcommands:
  embed  — build and embed a C2PA manifest into a media file
  verify — open a media file and print active manifest info as JSON

Requires the `c2pa-python` PyPI package (Adobe CAI bindings). Exit 2 if not installed.
"""

import argparse
import json
import os
import sys

try:
    import c2pa  # type: ignore
except ImportError:
    print(
        json.dumps({"error": "c2pa-python SDK not installed. Install with: pip install c2pa-python"}),
        file=sys.stderr,
    )
    sys.exit(2)


def _read_pem(path: str, what: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    if not content.strip():
        raise ValueError(f"{what} file is empty: {path}")
    return content


def _builder_manifest(manifest_data: dict):
    """Shape our runtime manifest into the Builder manifest JSON format."""
    bm = dict(manifest_data)

    # sign_file resolves the container format from the source file,
    # so the top-level "format" hint is not passed to the Builder.
    bm.pop("format", None)

    ingredients = []
    for ing in manifest_data.get("ingredients", []):
        entry = {"title": ing.get("title", "")}
        digest = ing.get("hash")
        alg = ing.get("hash_alg") or "sha256"
        if digest:
            if ":" in str(digest):
                entry["digest"] = str(digest)
            else:
                entry["digest"] = f"{alg}:{digest}"
        ingredients.append(entry)
    if ingredients:
        bm["ingredients"] = ingredients

    return bm


def cmd_embed(args: argparse.Namespace) -> None:
    """Embed a C2PA manifest into a media file."""
    try:
        if not args.manifest:
            print(json.dumps({"error": "--manifest is required for embed"}), file=sys.stderr)
            sys.exit(1)
        if not args.output:
            print(json.dumps({"error": "--output is required for embed"}), file=sys.stderr)
            sys.exit(1)
        if not os.path.exists(args.input):
            print(json.dumps({"error": f"Input file not found: {args.input}"}), file=sys.stderr)
            sys.exit(1)

        with open(args.manifest, "r", encoding="utf-8") as f:
            manifest_data = json.load(f)

        builder = c2pa.Builder(_builder_manifest(manifest_data))

        if args.sign_cert and args.sign_key:
            signer_info = c2pa.C2paSignerInfo(
                args.sign_alg.encode("utf-8"),
                _read_pem(args.sign_cert, "signing certificate").encode("utf-8"),
                _read_pem(args.sign_key, "signing key").encode("utf-8"),
                None,
            )
            signer = c2pa.Signer.from_info(signer_info)
            builder.sign_file(args.input, args.output, signer)
        else:
            # The CAI SDK's Builder requires a signer and cannot produce an
            # unsigned claim. Represent this honestly: records without a
            # signing key remain UNSIGNED (bound to the real R2 SHA-256),
            # and we do not fabricate a throwaway signature.
            print(
                json.dumps({
                    "error": "The CAI SDK requires a signer to embed a C2PA manifest. "
                             "Pass --sign-cert/--sign-key, or keep the record UNSIGNED "
                             "(asset hash binding only)."
                }),
                file=sys.stderr,
            )
            sys.exit(1)

        print(json.dumps({"status": "ok", "output": args.output}))

    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"Invalid manifest JSON: {exc}"}), file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)


def cmd_verify(args: argparse.Namespace) -> None:
    """Verify a C2PA-embedded media file."""
    try:
        if not os.path.exists(args.input):
            print(json.dumps({"error": f"Input file not found: {args.input}"}), file=sys.stderr)
            sys.exit(1)

        reader = c2pa.Reader(args.input)
        store = json.loads(reader.json())

        result = {"manifests": []}

        if isinstance(store, dict):
            manifests = store.get("manifests") or {}
            active = store.get("active_manifest")
            keys = [active] if active and active in manifests else list(manifests.keys())

            for label in keys:
                claim = manifests.get(label) or {}
                sig = store.get("signature") or claim.get("signature")

                ingredients = []
                for ing in claim.get("ingredients") or []:
                    digest = ing.get("digest")
                    hash_alg = None
                    hash_val = digest
                    if digest and ":" in str(digest):
                        hash_alg, hash_val = str(digest).split(":", 1)
                    ingredients.append({
                        "title": ing.get("title"),
                        "hash": hash_val,
                        "hash_alg": hash_alg,
                    })

                m_info = {
                    "label": claim.get("label", label),
                    "claim_generator": claim.get("claim_generator"),
                    "title": claim.get("title"),
                    "format": claim.get("format"),
                    "signature": None,
                    "ingredients": ingredients,
                }

                if sig and isinstance(sig, dict):
                    m_info["signature"] = {
                        "issuer": sig.get("issuer"),
                        "valid_certificate": sig.get("valid_certificate"),
                        "valid_signature": sig.get("valid_signature"),
                    }

                result["manifests"].append(m_info)

        print(json.dumps(result))

    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Crex C2PA CLI helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    embed_parser = subparsers.add_parser("embed", help="Embed C2PA manifest into a file")
    embed_parser.add_argument("--input", required=True, help="Input media file")
    embed_parser.add_argument("--output", required=True, help="Output media file")
    embed_parser.add_argument("--manifest", required=True, help="Path to manifest JSON")
    embed_parser.add_argument("--sign-cert", help="PEM certificate for signing")
    embed_parser.add_argument("--sign-key", help="Private key for signing")
    embed_parser.add_argument("--sign-alg", default="ps256",
                              help="Signing algorithm (ps256 for RSA, es256 for EC)")
    embed_parser.add_argument("--passphrase", help="Accepted for CLI compat; encrypted PEM keys are not supported by the CAI SDK")

    verify_parser = subparsers.add_parser("verify", help="Verify C2PA manifest in a file")
    verify_parser.add_argument("--input", required=True, help="Input media file")

    args = parser.parse_args()

    if args.command == "embed":
        cmd_embed(args)
    elif args.command == "verify":
        cmd_verify(args)
    else:
        print(json.dumps({"error": f"Unknown command: {args.command}"}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()