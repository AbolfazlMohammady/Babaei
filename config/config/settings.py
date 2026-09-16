import os
from datetime import timedelta
from pathlib import Path
from dotenv import load_dotenv
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(os.path.join(BASE_DIR, ".env"))
SECRET_KEY = os.environ.get('SECRET_KEY', "fallback_secret_key")
DEBUG = os.environ.get('DEBUG', 'False') == 'True'
ALLOWED_HOSTS = ['127.0.0.1']
SITE_URL = os.environ.get("SITE_URL", "http://127.0.0.1:8000").rstrip("/")
REMOVE_BG_API_KEY = os.environ.get("REMOVE_BG_API_KEY", "").strip()
CUSTOMIZER_UPLOAD_PRICE = int(os.environ.get("CUSTOMIZER_UPLOAD_PRICE", "0"))
INSTALLED_APPS = ["django.contrib.admin","django.contrib.auth","django.contrib.contenttypes","django.contrib.sessions","django.contrib.messages","django.contrib.staticfiles","django.contrib.sitemaps","phonenumber_field","axes","modeltranslation","tinymce","debug_toolbar","apps.home","apps.users","apps.shop","apps.orders","apps.customizer"]
INTERNAL_IPS = ['127.0.0.1']
MIDDLEWARE = ['debug_toolbar.middleware.DebugToolbarMiddleware','django.middleware.security.SecurityMiddleware','django.contrib.sessions.middleware.SessionMiddleware',"django.middleware.locale.LocaleMiddleware",'django.middleware.common.CommonMiddleware','django.middleware.csrf.CsrfViewMiddleware','django.contrib.auth.middleware.AuthenticationMiddleware','axes.middleware.AxesMiddleware','django.contrib.messages.middleware.MessageMiddleware','django.middleware.clickjacking.XFrameOptionsMiddleware']
ROOT_URLCONF = 'config.urls'
TEMPLATES = [{'BACKEND':'django.template.backends.django.DjangoTemplates','DIRS':[BASE_DIR / 'templates'],'APP_DIRS':True,'OPTIONS':{'context_processors':['django.template.context_processors.debug','django.template.context_processors.request','django.contrib.auth.context_processors.auth','django.contrib.messages.context_processors.messages','apps.orders.context_processors.cart_context']}}]
WSGI_APPLICATION = 'config.wsgi.application'
DATABASES = {'default': {'ENGINE':'django.db.backends.sqlite3','NAME':BASE_DIR / 'data/database/db.sqlite3','TEST':{'NAME':':memory:'}}}
AUTH_PASSWORD_VALIDATORS = [{'NAME':'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},{'NAME':'django.contrib.auth.password_validation.MinimumLengthValidator'},{'NAME':'django.contrib.auth.password_validation.CommonPasswordValidator'},{'NAME':'django.contrib.auth.password_validation.NumericPasswordValidator'}]
LANGUAGE_CODE = 'en'
USE_I18N = True
TIME_ZONE = 'UTC'
USE_TZ = True
LOCALE_PATHS = [BASE_DIR / 'locale']
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "data/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "data/media/"
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
AUTH_USER_MODEL = 'users.User'
PHONE_NUMBER_DEFAULT_REGION = "IR"
CELERY_BROKER_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("REDIS_URL", "redis://redis:6379/0")
AXES_ENABLED = True
AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = timedelta(hours=1)
AXES_CACHE = 'default'
AUTHENTICATION_BACKENDS = ["apps.users.backends.BabaeiAxesBackend","django.contrib.auth.backends.ModelBackend"]
CACHES = {"default":{"BACKEND":"django_redis.cache.RedisCache","LOCATION":"redis://redis:6379/1","OPTIONS":{"CLIENT_CLASS":"django_redis.client.DefaultClient"}}}
LOGGING = {"version":1,"disable_existing_loggers":False,"formatters":{"verbose":{"format":"{asctime} | {levelname} | {name} | {message}","style":"{"}},"filters":{},"handlers":{"console":{"level":"INFO","class":"logging.StreamHandler","formatter":"verbose"},"file":{"level":"INFO","class":"logging.handlers.RotatingFileHandler","filename":"data/logs/application.log","maxBytes":1024*1024*5,"backupCount":5,"formatter":"verbose"}},"loggers":{"apps":{"handlers":["console","file"],"level":"INFO","propagate":False}}}
