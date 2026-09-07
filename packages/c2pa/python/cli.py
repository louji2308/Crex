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


def _unwrap(value):
    """Guard against doubly-encoded JSON strings."""
    for _ in range(2):
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except (json.JSONDecodeError, TypeError):
                break
        else:
            break
    return value


def _jget(obj, key, default=None):
    obj = _unwrap(obj)
    if not isinstance(obj, dict):
        return default
    value = obj.get(key, default)
    return _unwrap(value)


def _code_list(section):
    section = _unwrap(section)
    if not isinstance(section, list):
        return []
    codes = []
    for item in section:
        item = _unwrap(item)
        if isinstance(item, dict):
            code = item.get("code")
            if code:
                codes.append(code)
    return codes


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

        # Optional trust anchors make the verification verdict honest: a
        # signature is "Trusted" only when its chain resolves to an anchor
        # the operator explicitly trusts.
        context = None
        if args.trust_anchors:
            anchors_pem = _read_pem(args.trust_anchors, "trust anchors")
            settings = c2pa.Settings.from_dict(
                {"trust": {"user_anchors": anchors_pem}}
            )
            context = c2pa.Context.builder().with_settings(settings).build()

        reader = c2pa.Reader.try_create(args.input, context=context)
        store = _unwrap(json.loads(reader.json()))

        result = {
            "state": "missing",
            "signature_valid": False,
            "signature_trusted": False,
            "status": [],
            "manifests": [],
        }

        if not isinstance(store, dict):
            print(json.dumps(result))
            return

        # Top-level validation output from the CAI reader.
        validation_state = _jget(store, "validation_state")
        validation_status = store.get("validation_status") or []
        statuses = []
        for item in _unwrap(validation_status):
            item = _unwrap(item)
            if isinstance(item, dict):
                statuses.append({
                    "code": item.get("code"),
                    "explanation": item.get("explanation"),
                    "url": item.get("url"),
                })

        # Trusted/anchor status may be reported inside the validation
        # results' success codes instead of the top-level status list.
        success_codes = []
        validation_results = _jget(store, "validation_results") or _jget(store, "results") or {}
        for section in validation_results.values():
            section = _unwrap(section)
            if isinstance(section, dict):
                success_codes += _code_list(section.get("success"))
            elif isinstance(section, list):
                success_codes += _code_list(section)
        if any(code == "claimSignature.validated" for code in success_codes):
            result["signature_valid"] = True
        if any(code == "signingCredential.trusted" for code in success_codes):
            result["signature_trusted"] = True
        result["status"] = statuses

        manifests = _jget(store, "manifests") or {}
        active = _jget(store, "active_manifest")
        keys = [active] if active and active in manifests else list(manifests.keys())

        for label in keys:
            claim = _jget(manifests, label)
            if not isinstance(claim, dict):
                claim = {}

            ingredients = []
            for ing in (_jget(claim, "ingredients") or []):
                ing = _unwrap(ing)
                if not isinstance(ing, dict):
                    continue
                digest = _jget(ing, "digest")
                hash_alg = None
                hash_val = digest
                if digest and ":" in str(digest):
                    hash_alg, hash_val = str(digest).split(":", 1)
                entry = {
                    "title": _jget(ing, "title"),
                    "hash": hash_val,
                    "hash_alg": hash_alg,
                }
                relationship = _jget(ing, "relationship")
                if relationship:
                    entry["relationship"] = relationship
                ingredients.append(entry)

            generator = None
            gen_info = _jget(claim, "claim_generator_info")
            if isinstance(gen_info, list) and gen_info:
                first = gen_info[0]
                if isinstance(first, dict):
                    name = first.get("name")
                    version = first.get("version")
                    generator = f"{name}/{version}" if name and version else name
            if generator is None and isinstance(gen_info, dict):
                generator = gen_info.get("name")

            signature = None
            signature_info = _jget(claim, "signature_info")
            if isinstance(signature_info, dict):
                signature = {
                    "issuer": signature_info.get("issuer"),
                    "common_name": signature_info.get("common_name"),
                    "cert_serial_number": signature_info.get("cert_serial_number"),
                    "signature_valid": result["signature_valid"],
                    "signature_trusted": result["signature_trusted"],
                }

            result["manifests"].append({
                "label": _jget(claim, "label") or label,
                "claim_generator": generator,
                "title": _jget(claim, "title"),
                "format": _jget(claim, "format"),
                "signature": signature,
                "ingredients": ingredients,
            })

        if validation_state in ("Valid", "Trusted", "Invalid"):
            result["state"] = validation_state

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
    verify_parser.add_argument("--trust-anchors",
                               help="PEM file of root CAs the operator trusts; "
                                    "without it a valid signature is reported as untrusted")

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