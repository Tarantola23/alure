from alure_sdk import AlureClient


def main() -> None:
    client = AlureClient(base_url="http://localhost:3000/api/v1")
    result = client.quickstart(license_key="ALR-48DDC1-E5F246-738359")
    if not result.get("valid"):
        raise SystemExit(f"License invalid: {result.get('reason')}")
    print("Modules:", result.get("modules") or "none")


if __name__ == "__main__":
    main()
