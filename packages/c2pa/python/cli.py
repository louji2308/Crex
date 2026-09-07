#!/usr/bin/env python3
"""
C2PA CLI helper for Crex.

Subcommands:
  embed  — build and embed a C2PA manifest into a media file
  verify — open a media file and print active manifest info as JSON

Requires the `c2pa` Python package. Exit 2 if not installed.
"""

import argparse
import json
import sys
import os

try:
    import c2pa  # type: ignore
except ImportError:
    print(
        json.dumps({"error": "c2pa Python package not installed. Install with: pip install c2pa"}),
        file=sys.stderr,
    )
    sys.exit(2)


def cmd_embed(args: argparse.Namespace) -> None:
    """Embed a C2PA manifest into a media file."""
    try:
        manifest_path = args.manifest
        if not manifest_path:
            print(json.dumps({"error": "--manifest is required for embed"}), file=sys.stderr)
            sys.exit(1)

        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest_data = json.load(f)

        output_path = args.output
        if not output_path:
            print(json.dumps({"error": "--output is required for embed"}), file=sys.stderr)
            sys.exit(1)

        input_path = args.input

        if not os.path.exists(input_path):
            print(json.dumps({"error": f"Input file not found: {input_path}"}), file=sys.stderr)
            sys.exit(1)

        try:
            manifest_obj = c2pa.Manifest()
            manifest_obj.set_claim_generator(manifest_data.get("claim_generator", "crex/0.1.0"))
            manifest_obj.set_format(manifest_data.get("format", "video/mp4"))

            if "title" in manifest_data:
                manifest_obj.set_title(manifest_data["title"])

            for assertion in manifest_data.get("assertions", []):
                label = assertion.get("label", "")
                data = assertion.get("data", {})
                manifest_obj.add_assertion(label, data)

            for ingredient in manifest_data.get("ingredients", []):
                manifest_obj.add_ingredient(
                    ingredient.get("title", ""),
                    ingredient.get("hash", ""),
                    ingredient.get("hash_alg", "sha256"),
                )

            sign_cert = args.sign_cert
            sign_key = args.sign_key
            passphrase = args.passphrase

            if sign_cert and sign_key:
                signer = c2pa.Signer()
                signer.load_certificate(sign_cert, passphrase or "")
                signer.load_private_key(sign_key, passphrase or "")
                manifest_obj.sign(signer)

            c2pa.embed(input_path, output_path, manifest_obj)
            print(json.dumps({"status": "ok", "output": output_path}))

        except AttributeError as exc:
            print(json.dumps({"error": f"c2pa API shape mismatch: {exc}"}), file=sys.stderr)
            sys.exit(1)
        except Exception as exc:
            print(json.dumps({"error": str(exc)}), file=sys.stderr)
            sys.exit(1)

    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"Invalid manifest JSON: {exc}"}), file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)


def cmd_verify(args: argparse.Namespace) -> None:
    """Verify a C2PA-embedded media file."""
    try:
        input_path = args.input

        if not os.path.exists(input_path):
            print(json.dumps({"error": f"Input file not found: {input_path}"}), file=sys.stderr)
            sys.exit(1)

        try:
            proof = c2pa.proof_from_file(input_path)
            result = {
                "manifests": [],
            }

            if hasattr(proof, "manifests"):
                for manifest in proof.manifests:
                    m_info = {
                        "label": getattr(manifest, "label", None),
                        "claim_generator": getattr(manifest, "claim_generator", None),
                        "title": getattr(manifest, "title", None),
                        "format": getattr(manifest, "format", None),
                        "ingredients": [],
                    }

                    if hasattr(manifest, "ingredients"):
                        for ing in manifest.ingredients:
                            m_info["ingredients"].append({
                                "title": getattr(ing, "title", None),
                                "hash": getattr(ing, "hash", None),
                                "hash_alg": getattr(ing, "hash_alg", None),
                            })

                    if hasattr(manifest, "signature"):
                        sig = manifest.signature
                        m_info["signature"] = {
                            "issuer": getattr(sig, "issuer", None),
                            "valid_certificate": getattr(sig, "valid_certificate", None),
                            "valid_signature": getattr(sig, "valid_signature", None),
                        }

                    result["manifests"].append(m_info)

            print(json.dumps(result))

        except Exception as exc:
            print(json.dumps({"error": str(exc)}), file=sys.stderr)
            sys.exit(1)

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
    embed_parser.add_argument("--passphrase", help="Passphrase for private key")

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
