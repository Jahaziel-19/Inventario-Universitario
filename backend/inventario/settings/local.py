from .base import *  # noqa: F401,F403


DEBUG = True
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "local-dev-secret-key")
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost")
CORS_ALLOW_ALL_ORIGINS = env_bool("DJANGO_CORS_ALLOW_ALL_ORIGINS", True)
SERVE_STATIC_MEDIA = True

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / os.getenv("DJANGO_SQLITE_NAME", "db.sqlite3"),
    }
}
