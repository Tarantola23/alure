from alure_sdk import AlureClient, FileStorage, HttpError


def main() -> None:
    client = AlureClient(
        base_url="http://localhost:3000/api/v1",
        storage=FileStorage("./.alure-test"),
    )

    license_key = input("License key: ").strip()
    device_id = input("Device ID (leave empty for auto): ").strip() or None

    try:
        activation = client.activate(license_key, device_id)
        print("Activation ID:", activation.activation_id)
    except HttpError as exc:
        if exc.status_code == 409:
            print("Activation limit reached. Use an existing receipt or revoke an activation.")
            return
        raise

    verify = client.verify_online()
    print("Verify online:", verify)

    project_id = client.project_id_from_receipt()
    if not project_id:
        print("Missing project_id in receipt.")
        return
    update = client.check_update(project_id=project_id, channel="stable")
    print("Latest version:", update.get("latest_version"))

    asset = update.get("asset") or {}
    asset_id = asset.get("asset_id")
    if asset_id:
        path = client.download_asset(asset_id)
        print("Downloaded to:", path)
    else:
        print("No asset available.")


if __name__ == "__main__":
    main()
