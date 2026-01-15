use thiserror::Error;

#[derive(Debug, Error)]
pub enum AlureError {
    #[error("http {status}: {message}")]
    Http { status: u16, message: String },
    #[error("request failed: {0}")]
    Reqwest(#[from] reqwest::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("storage error: {0}")]
    Storage(#[from] StorageError),
    #[error("receipt error: {0}")]
    Receipt(#[from] ReceiptError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Error)]
#[error("http {status}: {message}")]
pub struct HttpError {
    pub status: u16,
    pub message: String,
}

#[derive(Debug, Error)]
#[error("receipt error: {0}")]
pub struct ReceiptError(pub String);

#[derive(Debug, Error)]
#[error("storage error: {0}")]
pub struct StorageError(pub String);
