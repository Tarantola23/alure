from __future__ import annotations

import json
import os
import platform
import urllib.parse
import urllib.request
import urllib.error
import uuid
from dataclasses import dataclass
from typing import Any

from .errors import HttpError
from .receipt import ReceiptVerifier, ReceiptValidationResult
from .storage import FileStorage, ReceiptRecord


@dataclass
class ActivateResponse:
    receipt: str
    activation_id: str
    expires_at: str | None
    grace_period_days: int
    server_time: str


class AlureClient:
    def __init__(
        self,
        base_url: str = "http://localhost:3000/api/v1",
        storage: FileStorage | None = None,
        public_key_pem: str | None = None,
        timeout: int = 10,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.storage = storage or FileStorage()
        self.verifier = ReceiptVerifier(public_key_pem=public_key_pem)

    def default_device_id(self) -> str:
        node = platform.node()
        mac = uuid.getnode()
        try:
            user = os.getlogin()
        except OSError:
            user = ""
        raw = f"{node}-{mac}-{user}"
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, raw))

    def _request(
        self,
        method: str,
        path: str,
        json_body: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{urllib.parse.urlencode(query)}"
        data = json.dumps(json_body).encode("utf-8") if json_body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Accept", "application/json")
        if json_body is not None:
            req.add_header("Content-Type", "application/json")
        for key, value in (headers or {}).items():
            req.add_header(key, value)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                payload = resp.read()
                if not payload:
                    return {}
                return json.loads(payload.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            try:
                detail = exc.read().decode("utf-8")
            except Exception:
                detail = None
            raise HttpError(exc.code, detail) from exc

    def activate(
        self,
        license_key: str,
        device_id: str | None = None,
        app_version: str | None = None,
        device_meta: dict[str, Any] | None = None,
    ) -> ActivateResponse:
        device_id = device_id or self.default_device_id()
        payload: dict[str, Any] = {
            "license_key": license_key,
            "device_id": device_id,
        }
        if app_version:
            payload["app_version"] = app_version
        meta = device_meta.copy() if device_meta else {}
        if "hostname" not in meta:
            meta["hostname"] = platform.node()
        if meta:
            payload["device_meta"] = meta
        data = self._request("POST", "/licenses/activate", payload)
        record = ReceiptRecord(
            receipt=data["receipt"],
            device_id=device_id,
            activation_id=data.get("activation_id"),
            project_id=self._extract_project_id(data["receipt"]),
        )
        self.storage.save_receipt(record)
        return ActivateResponse(
            receipt=data["receipt"],
            activation_id=data["activation_id"],
            expires_at=data.get("expires_at"),
            grace_period_days=data["grace_period_days"],
            server_time=data["server_time"],
        )

    def verify_online(self, receipt: str | None = None, device_id: str | None = None) -> dict[str, Any]:
        if receipt is None or device_id is None:
            stored = self.storage.load_receipt()
            if not stored:
                raise HttpError(400, "missing_receipt")
            receipt = receipt or stored.receipt
            device_id = device_id or stored.device_id
        data = self._request("POST", "/licenses/verify", {"receipt": receipt, "device_id": device_id})
        new_receipt = data.get("new_receipt")
        if new_receipt:
            record = ReceiptRecord(
                receipt=new_receipt,
                device_id=device_id,
                activation_id=(stored.activation_id if stored else None),
                project_id=self._extract_project_id(new_receipt),
            )
            self.storage.save_receipt(record)
        return data

    def verify_offline(
        self,
        receipt: str | None = None,
        device_id: str | None = None,
        verify_signature: bool = True,
    ) -> ReceiptValidationResult:
        if receipt is None or device_id is None:
            stored = self.storage.load_receipt()
            if not stored:
                return ReceiptValidationResult(valid=False, reason="missing_receipt")
            receipt = receipt or stored.receipt
            device_id = device_id or stored.device_id
        return self.verifier.validate_offline(receipt, device_id, verify_signature=verify_signature)

    def check_update(self, project_id: str, channel: str, current_version: str | None = None) -> dict[str, Any]:
        query = {"project_id": project_id, "channel": channel}
        if current_version:
            query["current_version"] = current_version
        return self._request("GET", "/updates/latest", query=query)

    def project_id_from_receipt(self, receipt: str | None = None) -> str | None:
        if receipt is None:
            stored = self.storage.load_receipt()
            if not stored:
                return None
            receipt = stored.receipt
        try:
            payload = self.verifier.parse(receipt)
            return payload.get("project_id")
        except Exception:
            return None

    def modules_from_receipt(self, receipt: str | None = None) -> list[dict[str, Any]]:
        if receipt is None:
            stored = self.storage.load_receipt()
            if not stored:
                return []
            receipt = stored.receipt
        try:
            payload = self.verifier.parse(receipt)
            return payload.get("modules") or []
        except Exception:
            return []

    def request_download_token(self, receipt: str, device_id: str, asset_id: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/updates/download-token",
            {"receipt": receipt, "device_id": device_id, "asset_id": asset_id},
        )

    def download_asset(
        self,
        asset_id: str,
        receipt: str | None = None,
        device_id: str | None = None,
        token: str | None = None,
        dest_path: str | None = None,
    ) -> str:
        if token is None:
            if receipt is None or device_id is None:
                stored = self.storage.load_receipt()
                if not stored:
                    raise HttpError(400, "missing_receipt")
                receipt = receipt or stored.receipt
                device_id = device_id or stored.device_id
            token_resp = self.request_download_token(receipt, device_id, asset_id)
            token = token_resp["token"]

        url = f"{self.base_url}/updates/download/{asset_id}?{urllib.parse.urlencode({'token': token})}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            content = resp.read()
            disposition = resp.headers.get("Content-Disposition", "")
            filename = self._filename_from_disposition(disposition) or f"{asset_id}.bin"
            target = dest_path or str(self.storage.downloads_dir() / filename)
            with open(target, "wb") as handle:
                handle.write(content)
            return target

    @staticmethod
    def _filename_from_disposition(disposition: str) -> str | None:
        if "filename=" not in disposition:
            return None
        _, value = disposition.split("filename=", 1)
        return value.strip().strip('"')

    def _extract_project_id(self, receipt: str) -> str | None:
        try:
            payload = self.verifier.parse(receipt)
            return payload.get("project_id")
        except Exception:
            return None
