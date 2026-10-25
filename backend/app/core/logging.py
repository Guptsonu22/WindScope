import logging
import sys
from typing import Any, Dict


class TradeDeskFormatter(logging.Formatter):
    """Custom formatter with timestamps and component tags for power trading desk operations."""

    COLOR_CODES = {
        logging.DEBUG: "\033[36m",    # Cyan
        logging.INFO: "\033[32m",     # Green
        logging.WARNING: "\033[33m",  # Yellow
        logging.ERROR: "\033[31m",    # Red
        logging.CRITICAL: "\033[41m", # Red background
    }
    RESET_CODE = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLOR_CODES.get(record.levelno, self.RESET_CODE)
        log_time = self.formatTime(record, "%Y-%m-%d %H:%M:%S")
        prefix = f"{color}[{log_time}] [{record.levelname:<7}] [{record.name}]{self.RESET_CODE}"
        message = record.getMessage()
        if record.exc_info:
            if not record.exc_text:
                record.exc_text = self.formatException(record.exc_info)
        if record.exc_text:
            if message[-1:] != "\n":
                message += "\n"
            message += record.exc_text
        return f"{prefix} {message}"


def setup_logger(name: str = "windscope", level: int = logging.INFO) -> logging.Logger:
    """Configure and return an application logger."""
    logger = logging.getLogger(name)
    logger.setLevel(level)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)
        handler.setFormatter(TradeDeskFormatter())
        logger.addHandler(handler)
        logger.propagate = False

    return logger


logger = setup_logger()
