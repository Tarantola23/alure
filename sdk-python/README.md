# SDK Python

SDK ufficiale per licensing + update.

Funzionalita principali:
- Attivazione licenza online
- Validazione offline tramite receipt
- Check update e download asset
- Storage locale configurabile
- UI opzionale (Tkinter)

## Installazione (dev)
```
pip install -e .
```

## Uso rapido
```python
from alure_sdk import AlureClient

client = AlureClient(base_url="http://localhost:3000/api/v1")

# Activate license
activation = client.activate("ALR-XXXXXX-YYYYYY-ZZZZZZ", device_id="device-123")
print("Activation:", activation.activation_id)

# Verify online
result = client.verify_online()
print("Verify online:", result)

# Verify offline (use server public key for signature check)
offline = client.verify_offline(verify_signature=False)
print("Verify offline:", offline.valid, offline.reason)

# Check update
latest = client.check_update(project_id="demo", channel="stable")
print("Latest version:", latest.get("latest_version"))

# Download asset (token protected)
asset_id = latest.get("asset", {}).get("asset_id")
if asset_id:
    file_path = client.download_asset(asset_id)
    print("Downloaded:", file_path)
```

## Receipt signature (opzionale)
Per la verifica offline con firma, passa la chiave pubblica Ed25519:
```python
client = AlureClient(public_key_pem="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----")
offline = client.verify_offline()
```

## UI attivazione (Tkinter)
```python
from alure_sdk import AlureClient
from alure_sdk.ui import activate_with_ui

client = AlureClient()
activate_with_ui(client)
```
