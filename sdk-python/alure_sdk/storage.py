from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass
class ReceiptRecord:
    receipt: str
    device_id: str
    activation_id: str | None = None
    project_id: str | None = None


class FileStorage:
    def __init__(self, base_dir: str | Path | None = None):
        self.base_dir = Path(base_dir or Path.home() / ".alure").resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._receipt_path = self.base_dir / "receipt.json"

    def save_receipt(self, record: ReceiptRecord) -> None:
        payload = {
            "receipt": record.receipt,
            "device_id": record.device_id,
            "activation_id": record.activation_id,
            "project_id": record.project_id,
        }
        self._receipt_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def load_receipt(self) -> ReceiptRecord | None:
        if not self._receipt_path.exists():
            return None
        payload = json.loads(self._receipt_path.read_text(encoding="utf-8"))
        return ReceiptRecord(
            receipt=payload["receipt"],
            device_id=payload["device_id"],
            activation_id=payload.get("activation_id"),
            project_id=payload.get("project_id"),
        )

    def receipts_path(self) -> Path:
        return self._receipt_path

    def downloads_dir(self) -> Path:
        downloads = self.base_dir / "downloads"
        downloads.mkdir(parents=True, exist_ok=True)
        return downloads
