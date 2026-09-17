from celery import shared_task
from django.core.exceptions import ValidationError

from .models import Product3DAsset
from .product_3d import prepare_product_asset


@shared_task(bind=True, max_retries=1, default_retry_delay=20, acks_late=True)
def prepare_product_3d(self, asset_id):
    try:
        asset = Product3DAsset.objects.select_related("product").get(id=asset_id)
        if asset.status == Product3DAsset.Status.READY:
            return {"status": asset.status}
        prepare_product_asset(asset)
        return {"status": asset.status, "task_id": asset.task_id}
    except Product3DAsset.DoesNotExist:
        return {"status": "missing"}
    except ValidationError as exc:
        asset = Product3DAsset.objects.filter(id=asset_id).first()
        if asset:
            asset.status = Product3DAsset.Status.FAILED
            asset.error_message = str(exc)[:2000]
            asset.save(update_fields=["status", "error_message", "updated_at"])
        return {"status": "failed", "error": str(exc)}
    except Exception as exc:
        asset = Product3DAsset.objects.filter(id=asset_id).first()
        if asset:
            asset.status = Product3DAsset.Status.FAILED
            asset.error_message = "پردازش مدل سه‌بعدی با خطای غیرمنتظره متوقف شد."
            asset.save(update_fields=["status", "error_message", "updated_at"])
        raise self.retry(exc=exc)
