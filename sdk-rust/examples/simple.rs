use alure_sdk::AlureClient;
use std::env;
use std::io::{self, Write};
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    print!("Enter license key: ");
    io::stdout().flush()?;
    io::stdin().read_line(&mut input)?;
    let license_key = input.trim().to_string();

    if license_key.is_empty() {
        return Err("missing_license_key".into());
    }

    let storage_dir = env::current_dir().unwrap_or_else(|_| PathBuf::from(".")).join(".alure-client");
    let client = AlureClient::new(
        Some("http://localhost:3000/api/v1".to_string()),
        Some(storage_dir),
        None,
        None,
    )?;

    let result = client
        .quickstart(
            Some(license_key),
            None,
            true,
            false,
            None,
            None,
        )
        .await?;

    println!("Result: {result:?}");
    Ok(())
}
