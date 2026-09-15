from celery import shared_task
from django.core.files.storage import default_storage
from django.contrib.auth import get_user_model

User = get_user_model()

@shared_task(name='delete_user_image', autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
def delete_user_image(user_id, old_path):
    """
    حذف تصویر قدیمی کاربر از storage
    """

    user = User.objects.filter(pk=user_id).only('image').first()

    if not user:
        return

    current_image = user.image.name if user.image else None
    if current_image == old_path:
        return 

    try:
        default_storage.delete(old_path)
    except Exception:
        raise