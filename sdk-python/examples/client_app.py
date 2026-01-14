from alure_sdk import AlureClient, FileStorage, HttpError
import urllib.error
from pathlib import Path


def ensure_license(client: AlureClient) -> bool:
    stored = client.storage.load_receipt()
    if not stored:
        return False

    try:
        online = client.verify_online()
        return bool(online.get("valid"))
    except (HttpError, urllib.error.URLError):
        offline = client.verify_offline(verify_signature=False)
        return offline.valid


def activate_flow(client: AlureClient) -> bool:
    license_key = input("Enter license key: ").strip()
    if not license_key:
        return False
    device_id = input("Device ID (leave empty for auto): ").strip() or None
    try:
        client.activate(license_key, device_id)
        verify = client.verify_online()
        return bool(verify.get("valid"))
    except (HttpError, urllib.error.URLError) as exc:
        print("Activation failed:", exc)
        return False


def is_newer_version(latest: str, current: str) -> bool:
    def parse(value: str) -> list[int]:
        parts = []
        for chunk in value.split("."):
            try:
                parts.append(int(chunk))
            except ValueError:
                parts.append(0)
        return parts

    latest_parts = parse(latest)
    current_parts = parse(current)
    length = max(len(latest_parts), len(current_parts))
    latest_parts += [0] * (length - len(latest_parts))
    current_parts += [0] * (length - len(current_parts))
    return latest_parts > current_parts


def main() -> None:
    client = AlureClient(
        base_url="http://localhost:3000/api/v1",
        storage=FileStorage("./.alure-client"),
    )

    if ensure_license(client):
        print("Hello world!")
        project_id = client.project_id_from_receipt()
        if project_id:
            version_file = Path("./.alure-client/installed_version.txt")
            installed_version = version_file.read_text(encoding="utf-8").strip() if version_file.exists() else ""

            update = client.check_update(project_id=project_id, channel="stable")
            latest = update.get("latest_version")
            print("Latest version:", latest or "n/a")
            if latest and installed_version:
                print("Installed version:", installed_version)
            if latest and installed_version and not is_newer_version(latest, installed_version):
                print("Already up to date.")
                return

            asset = update.get("asset") or {}
            asset_id = asset.get("asset_id")
            if asset_id:
                try:
                    path = client.download_asset(asset_id)
                    print("Downloaded to:", path)
                    if latest:
                        version_file.write_text(latest, encoding="utf-8")
                except HttpError as exc:
                    print("Download failed:", exc)
        return

    print("License missing or invalid. Activation required.")
    if activate_flow(client):
        print("Hello world!")
    else:
        print("Unable to activate license.")


if __name__ == "__main__":
    main()
