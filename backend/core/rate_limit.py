"""Общий лимитер для slowapi (состояние в app.state.limiter)."""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

AUTH_REGISTER_RATE_LIMIT = os.getenv("AUTH_REGISTER_RATE_LIMIT", "10/minute")
AUTH_LOGIN_RATE_LIMIT = os.getenv("AUTH_LOGIN_RATE_LIMIT", "20/minute")
