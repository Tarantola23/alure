# Alure Python SDK

Official Python SDK for Alure licensing and update flows.

## Install

From PyPI:

```bash
pip install alure-sdk
```

From local source (development):

```bash
pip install -e .
```

## Quickstart

```python
from alure_sdk import AlureClient

client = AlureClient(base_url="http://localhost:3000/api/v1")
result = client.ensure_active(license_key="YOUR-LICENSE-KEY")

if not result.get("valid"):
    raise SystemExit(f"License invalid: {result.get('reason')}")

print("Enabled modules:", result.get("modules") or [])
```

## Common Operations

Activate or verify:

```python
result = client.ensure_active(license_key="ALR-XXXX-YYYY-ZZZZ")
```

Read enabled modules from stored receipt:

```python
keys = client.enabled_modules()
```

Check for updates:

```python
update = client.check_update(project_id="PROJECT_ID", channel="stable")
if update.get("update_available"):
    print(update.get("asset"))
```

Check and download in one call:

```python
download = client.check_update_and_download(
    project_id="PROJECT_ID",
    channel="stable",
)
```

## Storage

By default, the SDK stores receipt and activation metadata in local file storage. You can pass a custom storage implementation if needed.

```python
from pathlib import Path
from alure_sdk import AlureClient, FileStorage

client = AlureClient(
    base_url="http://localhost:3000/api/v1",
    storage=FileStorage(Path.home() / ".alure-client"),
)
```

## Package Publishing

```bash
python -m pip install --upgrade build twine
python -m build
python -m twine upload dist/*
```

## Compatibility

- Python 3.9+
- Designed for the Alure API (`/api/v1`)

## Examples

- `examples/simple.py`
