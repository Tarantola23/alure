class AlureError(Exception):
    """Base error for the Alure SDK."""


class HttpError(AlureError):
    def __init__(self, status_code: int, message: str | None = None):
        super().__init__(message or f"HTTP {status_code}")
        self.status_code = status_code
        self.message = message or ""


class ReceiptError(AlureError):
    pass
