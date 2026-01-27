from alure_sdk import AlureClient, FileStorage, HttpError
import urllib.error
from pathlib import Path
import platform


def ensure_license(client: AlureClient) -> bool:
    stored = client.storage.load_receipt()
    if not stored:
        print("No receipt found at:", client.storage.receipts_path())
        return False
    try:
        payload = client.verifier.parse(stored.receipt)
        print("Receipt payload:", payload)
    except Exception as exc:
        print("Receipt parse failed:", exc)
    try:
        online = client.verify_online()
        print("Verify online:", online)
        return bool(online.get("valid"))
    except (HttpError, urllib.error.URLError):
        offline = client.verify_offline(verify_signature=False)
        print("Verify offline:", offline.valid, offline.reason)
        return offline.valid


def activate_flow(client: AlureClient) -> bool:
    license_key = input("Enter license key: ").strip()
    if not license_key:
        return False
    device_id = input("Device ID (leave empty for auto): ").strip() or None
    try:
        client.activate(license_key, device_id, device_meta={"hostname": platform.node()})
        verify = client.verify_online()
        return bool(verify.get("valid"))
    except (HttpError, urllib.error.URLError) as exc:
        if isinstance(exc, HttpError) and exc.status_code == 409 and "activation_already_exists" in str(exc):
            stored = client.storage.load_receipt()
            if stored:
                try:
                    verify = client.verify_online(stored.receipt, stored.device_id)
                    return bool(verify.get("valid"))
                except (HttpError, urllib.error.URLError) as verify_exc:
                    print("Verify failed:", verify_exc)
                    return False
        print("Activation failed:", exc)
        return False


def handle_modules(client: AlureClient) -> None:
    modules = client.modules_from_receipt()
    if not modules:
        print("Modules: none")
        return
    keys = {item.get("key") for item in modules if item.get("key")}
    print("Modules enabled:", ", ".join(sorted(keys)))
    if "test2" in keys:
        print("Extra output enabled: test2 module is active.")


def main() -> None:
    base_dir = Path(__file__).resolve().parent / ".alure-client"
    client = AlureClient(
        base_url="http://localhost:3000/api/v1",
        storage=FileStorage(base_dir),
    )
    print("Using receipt path:", client.storage.receipts_path())

    if ensure_license(client):
        handle_modules(client)
        return

    print("License missing or invalid. Activation required.")
    if activate_flow(client):
        handle_modules(client)
    else:
        print("Unable to activate license.")


if __name__ == "__main__":
    main()
