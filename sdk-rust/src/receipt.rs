use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Duration, Utc};
use ed25519_dalek::{Signature, VerifyingKey};
use pkcs8::DecodePublicKey;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::errors::ReceiptError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptValidationResult {
    pub valid: bool,
    pub reason: Option<String>,
    pub expires_at: Option<String>,
    pub grace_period_days: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct ReceiptVerifier {
    public_key_pem: Option<String>,
}

impl ReceiptVerifier {
    pub fn new(public_key_pem: Option<String>) -> Self {
        Self { public_key_pem }
    }

    pub fn parse(&self, token: &str) -> Result<serde_json::Value, ReceiptError> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 || parts[0] != "v1" {
            return Err(ReceiptError("invalid_receipt_format".to_string()));
        }
        let payload_bytes = URL_SAFE_NO_PAD
            .decode(parts[1])
            .map_err(|_| ReceiptError("invalid_receipt_payload".to_string()))?;
        let payload = serde_json::from_slice(&payload_bytes)
            .map_err(|_| ReceiptError("invalid_receipt_payload".to_string()))?;
        Ok(payload)
    }

    pub fn verify_signature(&self, token: &str) -> Result<bool, ReceiptError> {
        let public_key_pem = self
            .public_key_pem
            .as_ref()
            .ok_or_else(|| ReceiptError("public_key_required".to_string()))?;
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 || parts[0] != "v1" {
            return Ok(false);
        }
        let payload = parts[1].as_bytes();
        let signature_bytes = URL_SAFE_NO_PAD
            .decode(parts[2])
            .map_err(|_| ReceiptError("invalid_signature".to_string()))?;
        let signature = Signature::from_slice(&signature_bytes)
            .map_err(|_| ReceiptError("invalid_signature".to_string()))?;
        let verifying_key = VerifyingKey::from_public_key_pem(public_key_pem)
            .map_err(|_| ReceiptError("invalid_public_key".to_string()))?;
        Ok(verifying_key.verify(payload, &signature).is_ok())
    }

    pub fn validate_offline(
        &self,
        token: &str,
        device_id: &str,
        now: Option<DateTime<Utc>>,
        verify_signature: bool,
    ) -> ReceiptValidationResult {
        let payload = match self.parse(token) {
            Ok(payload) => payload,
            Err(err) => {
                return ReceiptValidationResult {
                    valid: false,
                    reason: Some(err.0),
                    expires_at: None,
                    grace_period_days: None,
                }
            }
        };
        if verify_signature {
            match self.verify_signature(token) {
                Ok(true) => {}
                Ok(false) => {
                    return ReceiptValidationResult {
                        valid: false,
                        reason: Some("invalid_signature".to_string()),
                        expires_at: None,
                        grace_period_days: None,
                    }
                }
                Err(err) => {
                    return ReceiptValidationResult {
                        valid: false,
                        reason: Some(err.0),
                        expires_at: None,
                        grace_period_days: None,
                    }
                }
            }
        }

        let device_hash = Sha256::digest(device_id.as_bytes());
        let device_hash_hex = format!("{:x}", device_hash);
        if payload
            .get("device_id_hash")
            .and_then(|value| value.as_str())
            != Some(device_hash_hex.as_str())
        {
            return ReceiptValidationResult {
                valid: false,
                reason: Some("device_mismatch".to_string()),
                expires_at: None,
                grace_period_days: None,
            };
        }

        let expires_at = payload
            .get("expires_at")
            .and_then(|value| value.as_str())
            .map(str::to_string);
        let grace_days = payload
            .get("grace_period_days")
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        let now_dt = now.unwrap_or_else(Utc::now);
        if let Some(expires_at_str) = expires_at.clone() {
            if let Ok(exp_dt) = DateTime::parse_from_rfc3339(&expires_at_str) {
                let exp_dt = exp_dt.with_timezone(&Utc);
                if now_dt > exp_dt {
                    let grace_limit = exp_dt + Duration::days(grace_days);
                    if now_dt > grace_limit {
                        return ReceiptValidationResult {
                            valid: false,
                            reason: Some("expired".to_string()),
                            expires_at: Some(expires_at_str),
                            grace_period_days: Some(grace_days),
                        };
                    }
                    return ReceiptValidationResult {
                        valid: true,
                        reason: Some("grace_period".to_string()),
                        expires_at: Some(expires_at_str),
                        grace_period_days: Some(grace_days),
                    };
                }
            }
        }

        ReceiptValidationResult {
            valid: true,
            reason: None,
            expires_at,
            grace_period_days: Some(grace_days),
        }
    }
}
