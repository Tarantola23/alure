# Alure Rust SDK

Async Rust SDK for Alure licensing and update workflows.

## Installation

```bash
cargo add alure-sdk
```

## Quickstart

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

    let result = client
        .ensure_active(
            Some("YOUR-LICENSE-KEY".to_string()),
            None,
            true,
            false,
            None,
            None,
        )
        .await?;

    println!("Valid: {:?}", result.get("valid"));
    println!("Modules: {:?}", result.get("modules"));
    Ok(())
}
```

## Common Operations

Enabled modules from stored receipt:

```rust
let modules = client.enabled_modules(None)?;
println!("{modules:?}");
```

Check for updates:

```rust
let update = client.check_update("PROJECT_ID", "stable", None).await?;
println!("{update:?}");
```

Check and download:

```rust
let downloaded = client
    .check_update_and_download("PROJECT_ID", "stable", None, None, None)
    .await?;
println!("{downloaded:?}");
```

## Examples

```bash
cargo run --example simple
cargo run --example client_app_modules
```

## Compatibility

- Rust stable
- `tokio` runtime required
- Designed for the Alure API (`/api/v1`)
