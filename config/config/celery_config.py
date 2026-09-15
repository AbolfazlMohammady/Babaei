import os

from celery import Celery
from kombu import Queue, Exchange


os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE",
    "config.settings",
)

app = Celery("config")

app.config_from_object(
    "django.conf:settings",
    namespace="CELERY",
)


tasks_exchange = Exchange(
    "tasks",
    type="direct",
)

app.conf.task_queues = [
    Queue(
        "tasks",
        exchange=tasks_exchange,
        routing_key="tasks",
    ),
]

app.conf.task_default_queue = "tasks"
app.conf.task_default_exchange = "tasks"
app.conf.task_default_routing_key = "tasks"

app.conf.task_default_priority = 5
app.conf.task_acks_late = True
app.conf.worker_prefetch_multiplier = 1
app.conf.worker_concurrency = 3
app.conf.task_reject_on_worker_lost = True
app.conf.task_acks_on_failure_or_timeout = True

app.autodiscover_tasks()