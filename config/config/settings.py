import os
from datetime import timedelta
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(os.path.join(BASE_DIR, ".env"))

SECRET_KEY = os.environ.get('SECRET_KEY',"fallback_secret_key")
DEBUG = os.environ.get('DEBUG', 'False') == 'True'
ALLOWED_HOSTS = [
    '127.0.0.1'
]

# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Third Party
    "phonenumber_field",
    "axes",
    "modeltranslation",
    "tinymce",
    "debug_toolbar",

    # Local Apps
    "apps.home",
    "apps.users",
    "apps.shop",
]

INTERNAL_IPS = [
    '127.0.0.1',
]

MIDDLEWARE = [
    'debug_toolbar.middleware.DebugToolbarMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    "django.middleware.locale.LocaleMiddleware",
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'axes.middleware.AxesMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]


ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database
# https://docs.djangoproject.com/en/4.2/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'data/database/db.sqlite3',
        'TEST': {
            'NAME': ':memory:',
        },
    }
}
# DATABASES = {
#     'default': {
#         'ENGINE': 'django.db.backends.postgresql',
#         'NAME': os.getenv('POSTGRES_DB', 'paya_user'),
#         'USER': os.getenv('POSTGRES_USER', 'paya_user'),
#         'PASSWORD': os.getenv('POSTGRES_PASSWORD', 'supersecretpassword'),
#         'HOST': os.getenv('POSTGRES_HOST', 'postgres'),
#         'PORT': os.getenv('POSTGRES_PORT', '5432'),
#     }
# }


# Password validation
# https://docs.djangoproject.com/en/4.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# زبان پیش‌فرض
LANGUAGE_CODE = 'en'

USE_I18N = True
TIME_ZONE = 'UTC'
USE_TZ = True
LOCALE_PATHS = [
    BASE_DIR / 'locale',
]

# Static files
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "data/static/"

STATICFILES_DIRS = [
    BASE_DIR / "static",
]

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "data/media/"

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Config User
AUTH_USER_MODEL = 'users.User'


# Config Celery
CELERY_BROKER_URL = os.environ.get(
    "REDIS_URL",
    "redis://redis:6379/0",
)

CELERY_RESULT_BACKEND = os.environ.get(
    "REDIS_URL",
    "redis://redis:6379/0",
)

# Config axes
AXES_ENABLED = True
AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = timedelta(hours=1)
AXES_CACHE = 'default'

# IMPORTANT:
# AxesStandaloneBackend only monitors authentication and does not implement
# get_user(). Django stores the selected backend in the session, so using the
# standalone backend directly for login sessions causes request.user to fail.
# BabaeiAxesBackend combines AxesStandaloneBackend with ModelBackend and is
# therefore safe to store in the session.
AUTHENTICATION_BACKENDS = [
    "apps.users.backends.BabaeiAxesBackend",
    "django.contrib.auth.backends.ModelBackend",
]

# Caching
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://redis:6379/1",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        }
    }
}


# logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{asctime} | {levelname} | {name} | {message}",
            "style": "{",
        },
    },
    "filters": {},
    "handlers": {
        "console": {
            "level": "INFO",
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
        "file": {
            "level": "INFO",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": "data/logs/application.log",
            "maxBytes": 1024 * 1024 * 5,
            "backupCount": 5,
            "formatter": "verbose",
        },
    },
    "loggers": {
        "apps": {
            "handlers": ["console", "file"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
