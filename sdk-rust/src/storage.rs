use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::errors::StorageError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptRecord {
    pub receipt: String,
    pub device_id: String,
    pub activation_id: Option<String>,
    pub project_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct FileStorage {
    base_dir: PathBuf,
    receipt_path: PathBuf,
}

impl FileStorage {
    pub fn new(base_dir: Option<PathBuf>) -> Result<Self, StorageError> {
        let dir = match base_dir {
            Some(path) => path,
            None => dirs::home_dir()
                .ok_or_else(|| StorageError("missing_home_dir".to_string()))?
                .join(".alure"),
        };
        std::fs::create_dir_all(&dir)
            .map_err(|err| StorageError(format!("create_dir_failed: {err}")))?;
        let receipt_path = dir.join("receipt.json");
        Ok(Self {
            base_dir: dir,
            receipt_path,
        })
    }

    pub fn save_receipt(&self, record: &ReceiptRecord) -> Result<(), StorageError> {
        let payload = serde_json::json!({
            "receipt": record.receipt,
            "device_id": record.device_id,
            "activation_id": record.activation_id,
            "project_id": record.project_id,
        });
        let content = serde_json::to_string_pretty(&payload)
            .map_err(|err| StorageError(format!("serialize_failed: {err}")))?;
        std::fs::write(&self.receipt_path, content)
            .map_err(|err| StorageError(format!("write_failed: {err}")))?;
        Ok(())
    }

    pub fn load_receipt(&self) -> Result<Option<ReceiptRecord>, StorageError> {
        if !self.receipt_path.exists() {
            return Ok(None);
        }
        let content = std::fs::read_to_string(&self.receipt_path)
            .map_err(|err| StorageError(format!("read_failed: {err}")))?;
        let payload: serde_json::Value = serde_json::from_str(&content)
            .map_err(|err| StorageError(format!("parse_failed: {err}")))?;
        Ok(Some(ReceiptRecord {
            receipt: payload
                .get("receipt")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string(),
            device_id: payload
                .get("device_id")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string(),
            activation_id: payload
                .get("activation_id")
                .and_then(|value| value.as_str())
                .map(str::to_string),
            project_id: payload
                .get("project_id")
                .and_then(|value| value.as_str())
                .map(str::to_string),
        }))
    }

    pub fn receipts_path(&self) -> &Path {
        &self.receipt_path
    }

    pub fn downloads_dir(&self) -> Result<PathBuf, StorageError> {
        let downloads = self.base_dir.join("downloads");
        std::fs::create_dir_all(&downloads)
            .map_err(|err| StorageError(format!("create_dir_failed: {err}")))?;
        Ok(downloads)
    }
}
