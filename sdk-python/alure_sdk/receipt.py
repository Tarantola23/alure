from __future__ import annotations

import base64
import dataclasses
import hashlib
import json
from datetime import datetime, timezone, timedelta
from typing import Any

from .errors import ReceiptError


def _b64url_decode(value: str) -> bytes:
    padded = value.replace("-", "+").replace("_", "/")
    padded += "=" * (-len(padded) % 4)
    return base64.b64decode(padded)


@dataclasses.dataclass
class ReceiptValidationResult:
    valid: bool
    reason: str | None = None
    expires_at: str | None = None
    grace_period_days: int | None = None


class ReceiptVerifier:
    def __init__(self, public_key_pem: str | None = None):
        self.public_key_pem = public_key_pem

    def parse(self, token: str) -> dict[str, Any]:
        parts = token.split(".")
        if len(parts) != 3 or parts[0] != "v1":
            raise ReceiptError("invalid_receipt_format")
        try:
            payload_json = _b64url_decode(parts[1]).decode("utf-8")
            return json.loads(payload_json)
        except Exception as exc:
            raise ReceiptError("invalid_receipt_payload") from exc

    def verify_signature(self, token: str) -> bool:
        if not self.public_key_pem:
            raise ReceiptError("public_key_required")
        try:
            from cryptography.hazmat.primitives import serialization
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        except Exception as exc:
            raise ReceiptError("cryptography_missing") from exc

        parts = token.split(".")
        if len(parts) != 3 or parts[0] != "v1":
            return False
        payload_b64 = parts[1].encode("utf-8")
        signature = _b64url_decode(parts[2])
        public_key = serialization.load_pem_public_key(self.public_key_pem.encode("utf-8"))
        if not isinstance(public_key, Ed25519PublicKey):
            raise ReceiptError("invalid_public_key")
        try:
            public_key.verify(signature, payload_b64)
            return True
        except Exception:
            return False

    def validate_offline(
        self,
        token: str,
        device_id: str,
        now: datetime | None = None,
        verify_signature: bool = True,
    ) -> ReceiptValidationResult:
        payload = self.parse(token)
        if verify_signature:
            if not self.verify_signature(token):
                return ReceiptValidationResult(valid=False, reason="invalid_signature")

        device_hash = hashlib.sha256(device_id.encode("utf-8")).hexdigest()
        if payload.get("device_id_hash") != device_hash:
            return ReceiptValidationResult(valid=False, reason="device_mismatch")

        expires_at = payload.get("expires_at")
        grace_days = int(payload.get("grace_period_days") or 0)
        now_dt = now or datetime.now(timezone.utc)

        if expires_at:
            exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if now_dt > exp_dt:
                grace_limit = exp_dt + timedelta(days=grace_days)
                if now_dt > grace_limit:
                    return ReceiptValidationResult(valid=False, reason="expired", expires_at=expires_at)
                return ReceiptValidationResult(
                    valid=True,
                    reason="grace_period",
                    expires_at=expires_at,
                    grace_period_days=grace_days,
                )

        return ReceiptValidationResult(valid=True, expires_at=expires_at, grace_period_days=grace_days)
