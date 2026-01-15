use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::errors::{AlureError, ReceiptError, StorageError};
use crate::receipt::{ReceiptValidationResult, ReceiptVerifier};
use crate::storage::{FileStorage, ReceiptRecord};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivateResponse {
    pub receipt: String,
    pub activation_id: String,
    pub expires_at: Option<String>,
    pub grace_period_days: i64,
    pub server_time: String,
}

#[derive(Debug, Clone)]
pub struct AlureClient {
    base_url: String,
    storage: FileStorage,
    verifier: ReceiptVerifier,
    timeout_seconds: u64,
}

impl AlureClient {
    pub fn new(
        base_url: Option<String>,
        storage_dir: Option<PathBuf>,
        public_key_pem: Option<String>,
        timeout_seconds: Option<u64>,
    ) -> Result<Self, AlureError> {
        let base_url = base_url.unwrap_or_else(|| "http://localhost:3000/api/v1".to_string());
        let storage = FileStorage::new(storage_dir).map_err(AlureError::Storage)?;
        let verifier = ReceiptVerifier::new(public_key_pem);
        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            storage,
            verifier,
            timeout_seconds: timeout_seconds.unwrap_or(10),
        })
    }

    pub fn default_device_id(&self) -> Result<String, AlureError> {
        let host = hostname::get()
            .map_err(|err| StorageError(format!("hostname_failed: {err}")))?
            .to_string_lossy()
            .to_string();
        let mac = mac_address::get_mac_address()
            .map_err(|err| StorageError(format!("mac_address_failed: {err}")))?
            .map(|addr| addr.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let user = whoami::username();
        let raw = format!("{host}-{mac}-{user}");
        Ok(uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_DNS, raw.as_bytes()).to_string())
    }

    async fn request<T: for<'de> Deserialize<'de>>(
        &self,
        method: reqwest::Method,
        path: &str,
        json_body: Option<serde_json::Value>,
        query: Option<Vec<(String, String)>>,
        headers: Option<Vec<(String, String)>>,
    ) -> Result<T, AlureError> {
        let url = format!("{}{}", self.base_url, path);
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(self.timeout_seconds))
            .build()?;
        let mut req = client.request(method, &url).header("Accept", "application/json");
        if let Some(body) = json_body {
            req = req.json(&body);
        }
        if let Some(params) = query {
            req = req.query(&params);
        }
        if let Some(items) = headers {
            for (key, value) in items {
                req = req.header(&key, &value);
            }
        }
        let resp = req.send().await?;
        let status = resp.status();
        if !status.is_success() {
            let message = resp.text().await.unwrap_or_default();
            return Err(AlureError::Http {
                status: status.as_u16(),
                message,
            });
        }
        if status == reqwest::StatusCode::NO_CONTENT {
            let empty = serde_json::json!({});
            return Ok(serde_json::from_value(empty)?);
        }
        let payload = resp.json::<T>().await?;
        Ok(payload)
    }

    pub async fn activate(
        &self,
        license_key: &str,
        device_id: Option<String>,
        app_version: Option<String>,
        device_meta: Option<serde_json::Value>,
    ) -> Result<ActivateResponse, AlureError> {
        let device_id = match device_id {
            Some(value) => value,
            None => self.default_device_id()?,
        };
        let mut payload = serde_json::json!({
            "license_key": license_key,
            "device_id": device_id,
        });
        if let Some(app_version) = app_version {
            payload["app_version"] = serde_json::Value::String(app_version);
        }
        if let Some(meta) = device_meta {
            payload["device_meta"] = meta;
        }
        let data: serde_json::Value = self
            .request(
                reqwest::Method::POST,
                "/licenses/activate",
                Some(payload),
                None,
                None,
            )
            .await?;
        let receipt = data
            .get("receipt")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        let activation_id = data
            .get("activation_id")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        let expires_at = data
            .get("expires_at")
            .and_then(|value| value.as_str())
            .map(str::to_string);
        let grace_period_days = data
            .get("grace_period_days")
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        let server_time = data
            .get("server_time")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        let record = ReceiptRecord {
            receipt: receipt.clone(),
            device_id: device_id.clone(),
            activation_id: Some(activation_id.clone()),
            project_id: self.extract_project_id(&receipt).ok().flatten(),
        };
        self.storage.save_receipt(&record)?;
        Ok(ActivateResponse {
            receipt,
            activation_id,
            expires_at,
            grace_period_days,
            server_time,
        })
    }

    pub async fn verify_online(
        &self,
        receipt: Option<String>,
        device_id: Option<String>,
    ) -> Result<serde_json::Value, AlureError> {
        let (receipt, device_id) = match (receipt, device_id) {
            (Some(receipt), Some(device_id)) => (receipt, device_id),
            _ => {
                let stored = self
                    .storage
                    .load_receipt()?
                    .ok_or_else(|| AlureError::Http {
                        status: 400,
                        message: "missing_receipt".to_string(),
                    })?;
                (stored.receipt, stored.device_id)
            }
        };
        let payload = serde_json::json!({
            "receipt": receipt,
            "device_id": device_id,
        });
        self.request(
            reqwest::Method::POST,
            "/licenses/verify",
            Some(payload),
            None,
            None,
        )
        .await
    }

    pub fn verify_offline(
        &self,
        receipt: Option<String>,
        device_id: Option<String>,
        verify_signature: bool,
    ) -> Result<ReceiptValidationResult, AlureError> {
        let (receipt, device_id) = match (receipt, device_id) {
            (Some(receipt), Some(device_id)) => (receipt, device_id),
            _ => {
                let stored = self.storage.load_receipt()?;
                if let Some(stored) = stored {
                    (stored.receipt, stored.device_id)
                } else {
                    return Ok(ReceiptValidationResult {
                        valid: false,
                        reason: Some("missing_receipt".to_string()),
                        expires_at: None,
                        grace_period_days: None,
                    });
                }
            }
        };
        Ok(self
            .verifier
            .validate_offline(&receipt, &device_id, None, verify_signature))
    }

    pub async fn check_update(
        &self,
        project_id: &str,
        channel: &str,
        current_version: Option<String>,
    ) -> Result<serde_json::Value, AlureError> {
        let mut query = vec![
            ("project_id".to_string(), project_id.to_string()),
            ("channel".to_string(), channel.to_string()),
        ];
        if let Some(current_version) = current_version {
            query.push(("current_version".to_string(), current_version));
        }
        self.request(
            reqwest::Method::GET,
            "/updates/latest",
            None,
            Some(query),
            None,
        )
        .await
    }

    pub fn project_id_from_receipt(&self, receipt: Option<String>) -> Result<Option<String>, AlureError> {
        let receipt = match receipt {
            Some(receipt) => receipt,
            None => {
                let stored = self.storage.load_receipt()?;
                if let Some(stored) = stored {
                    stored.receipt
                } else {
                    return Ok(None);
                }
            }
        };
        Ok(self.extract_project_id(&receipt).ok().flatten())
    }

    pub async fn request_download_token(
        &self,
        receipt: &str,
        device_id: &str,
        asset_id: &str,
    ) -> Result<serde_json::Value, AlureError> {
        let payload = serde_json::json!({
            "receipt": receipt,
            "device_id": device_id,
            "asset_id": asset_id,
        });
        self.request(
            reqwest::Method::POST,
            "/updates/download-token",
            Some(payload),
            None,
            None,
        )
        .await
    }

    pub async fn download_asset(
        &self,
        asset_id: &str,
        receipt: Option<String>,
        device_id: Option<String>,
        token: Option<String>,
        dest_path: Option<PathBuf>,
    ) -> Result<PathBuf, AlureError> {
        let token = match token {
            Some(token) => token,
            None => {
                let (receipt, device_id) = match (receipt, device_id) {
                    (Some(receipt), Some(device_id)) => (receipt, device_id),
                    _ => {
                        let stored = self
                            .storage
                            .load_receipt()?
                            .ok_or_else(|| AlureError::Http {
                                status: 400,
                                message: "missing_receipt".to_string(),
                            })?;
                        (stored.receipt, stored.device_id)
                    }
                };
                let token_resp = self
                    .request_download_token(&receipt, &device_id, asset_id)
                    .await?;
                token_resp
                    .get("token")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .to_string()
            }
        };

        let url = format!(
            "{}/updates/download/{}?token={}",
            self.base_url,
            asset_id,
            urlencoding::encode(&token)
        );
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(self.timeout_seconds))
            .build()?;
        let resp = client.get(url).send().await?;
        let status = resp.status();
        if !status.is_success() {
            let message = resp.text().await.unwrap_or_default();
            return Err(AlureError::Http {
                status: status.as_u16(),
                message,
            });
        }
        let content = resp.bytes().await?;
        let filename = resp
            .headers()
            .get(reqwest::header::CONTENT_DISPOSITION)
            .and_then(|value| value.to_str().ok())
            .and_then(extract_filename)
            .unwrap_or_else(|| format!("{asset_id}.bin"));
        let target = match dest_path {
            Some(path) => path,
            None => {
                let downloads = self.storage.downloads_dir()?;
                downloads.join(filename)
            }
        };
        tokio::fs::write(&target, &content).await?;
        Ok(target)
    }

    fn extract_project_id(&self, receipt: &str) -> Result<Option<String>, ReceiptError> {
        let payload = self.verifier.parse(receipt)?;
        Ok(payload
            .get("project_id")
            .and_then(|value| value.as_str())
            .map(str::to_string))
    }
}

fn extract_filename(content_disposition: &str) -> Option<String> {
    let filename_marker = "filename=";
    content_disposition.find(filename_marker).map(|idx| {
        content_disposition[idx + filename_marker.len()..]
            .trim_matches('"')
            .to_string()
    })
}
