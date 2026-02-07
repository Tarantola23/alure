use alure_sdk::{AlureClient, AlureError, ReceiptValidationResult};
use serde_json::Value;
use std::env;
use std::io::{self, Write};
use std::path::PathBuf;

fn is_valid(value: &Value) -> bool {
    value.get("valid").and_then(|v| v.as_bool()).unwrap_or(false)
}

fn read_license_key() -> Result<String, Box<dyn std::error::Error>> {
    let mut input = String::new();
    print!("Enter license key: ");
    io::stdout().flush()?;
    io::stdin().read_line(&mut input)?;
    let key = input.trim().to_string();
    if key.is_empty() {
        return Err("missing_license_key".into());
    }
    Ok(key)
}

fn print_modules(value: &Value) {
    let modules = value.get("modules").cloned().unwrap_or(Value::Array(vec![]));
    let modules_full = value
        .get("modules_full")
        .cloned()
        .unwrap_or(Value::Array(vec![]));
    println!("Modules: {modules}");
    println!("Modules full: {modules_full}");
}

async fn ensure_license(client: &AlureClient) -> Result<bool, AlureError> {
    match client.verify_online(None, None).await {
        Ok(result) => {
            println!("Verify online: {result:?}");
            return Ok(is_valid(&result));
        }
        Err(AlureError::Http { status: 400, .. }) => {}
        Err(err) => {
            println!("Verify online failed: {err}");
        }
    }

    let offline: ReceiptValidationResult = client.verify_offline(None, None, false)?;
    println!("Verify offline: valid={} reason={:?}", offline.valid, offline.reason);
    Ok(offline.valid)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let storage_dir = env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".alure-client");
    let client = AlureClient::new(
        Some("http://localhost:3000/api/v1".to_string()),
        Some(storage_dir),
        None,
        None,
    )?;

    if ensure_license(&client).await? {
        let modules = client.enabled_modules(None)?;
        let modules_full = client.modules_from_receipt(None)?;
        let result = serde_json::json!({
            "valid": true,
            "source": "stored",
            "modules": modules,
            "modules_full": modules_full,
        });
        print_modules(&result);
        return Ok(());
    }

    println!("License missing or invalid. Activation required.");
    let license_key = read_license_key()?;
    let result = client
        .quickstart(Some(license_key), None, true, false, None, None)
        .await?;
    println!("Result: {result:?}");
    print_modules(&result);
    Ok(())
}
