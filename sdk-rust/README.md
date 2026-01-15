# SDK Rust

SDK async per licensing + update, ispirato allo SDK Python.

## Funzionalita principali
- Attivazione licenza online
- Validazione offline tramite receipt
- Check update e download asset
- Storage locale configurabile

## Installazione (dev)
```bash
cargo add alure-sdk
```

## Uso rapido
```rust
use alure_sdk::AlureClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = AlureClient::new(
        Some("http://localhost:3000/api/v1".to_string()),
        None,
        None,
        None,
    )?;

    // Activate license
    let activation = client
        .activate("ALR-XXXXXX-YYYYYY-ZZZZZZ", Some("device-123".to_string()), None, None)
        .await?;
    println!("Activation: {}", activation.activation_id);

    // Verify online
    let result = client.verify_online(None, None).await?;
    println!("Verify online: {result:?}");

    // Verify offline (use server public key for signature check)
    let offline = client.verify_offline(None, None, false)?;
    println!("Verify offline: {} {:?}", offline.valid, offline.reason);

    // Check update
    let latest = client
        .check_update("demo", "stable", None)
        .await?;
    println!("Latest version: {latest:?}");

    // Download asset (token protected)
    if let Some(asset_id) = latest
        .get("asset")
        .and_then(|asset| asset.get("asset_id"))
        .and_then(|value| value.as_str())
    {
        let file_path = client.download_asset(asset_id, None, None, None, None).await?;
        println!("Downloaded: {}", file_path.display());
    }

    Ok(())
}
```

## Receipt signature (opzionale)
Per la verifica offline con firma, passa la chiave pubblica Ed25519:
```rust
use alure_sdk::AlureClient;

let client = AlureClient::new(
    None,
    None,
    Some("-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----".to_string()),
    None,
)?;
let offline = client.verify_offline(None, None, true)?;
```
