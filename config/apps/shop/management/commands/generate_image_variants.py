"""Generate the responsive derivatives the product cards ask for.

Until now every product upload was served at its full camera resolution into
every card, with no srcset, so a phone downloaded desktop-sized files for a
170px-wide slot.

This writes AVIF and WebP derivatives next to each original:

    media/products/tee.jpg -> media/products/tee-400.webp
                              media/products/tee-640.avif
                              ...

The shop_tags `image_variants` tag only advertises derivatives that exist, so
the card markup keeps working before this command has ever run and gets faster
the moment it has.

Idempotent by default: existing derivatives are skipped, --force rewrites them.
"""

from __future__ import annotations

import os
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
    Image = None

from apps.shop.models import ProductImage


DEFAULT_WIDTHS = (400, 640, 900)
FOREGROUND_FORMATS = (
    ("webp", "WEBP", {"quality": 78, "method": 6}),
    ("avif", "AVIF", {"quality": 60, "speed": 4}),
)


def human(num_bytes: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(num_bytes) < 1024 or unit == "GB":
            return f"{num_bytes:,.1f} {unit}"
        num_bytes /= 1024
    return f"{num_bytes:,.1f} GB"


class Command(BaseCommand):
    help = "Generate AVIF/WebP derivatives for product card images."

    def add_arguments(self, parser):
        parser.add_argument(
            "--widths",
            default=",".join(str(w) for w in getattr(settings, "CARD_IMAGE_WIDTHS", DEFAULT_WIDTHS)),
            help="Comma separated target widths (default: %(default)s).",
        )
        parser.add_argument(
            "--force", action="store_true", help="Rebuild derivatives that already exist."
        )
        parser.add_argument(
            "--dry-run", action="store_true", help="Report what would be written, change nothing."
        )
        parser.add_argument(
            "--limit", type=int, default=0, help="Stop after N images (0 = no limit)."
        )

    def handle(self, *args, **options):
        if Image is None:
            self.stderr.write(self.style.ERROR("Pillow is required: pip install Pillow"))
            return

        widths = sorted({int(w) for w in str(options["widths"]).split(",") if w.strip()})
        force = options["force"]
        dry_run = options["dry_run"]
        limit = options["limit"]

        images = (
            ProductImage.objects.exclude(image="")
            .select_related("product")
            .order_by("product_id", "sort_order", "id")
        )

        written = skipped = failed = 0
        source_bytes = result_bytes = 0

        for index, record in enumerate(images.iterator(), start=1):
            if limit and index > limit:
                break

            field = record.image
            try:
                source_path = field.storage.path(field.name)
            except (NotImplementedError, ValueError):
                self.stdout.write(
                    self.style.WARNING(f"skip (non-local storage): {field.name}")
                )
                skipped += 1
                continue

            source_path = Path(source_path)
            if not source_path.exists():
                self.stdout.write(self.style.WARNING(f"skip (missing on disk): {field.name}"))
                skipped += 1
                continue

            try:
                with Image.open(source_path) as probe:
                    probe = ImageOps.exif_transpose(probe)
                    original_width, original_height = probe.size
                    if probe.mode in ("RGBA", "LA", "P"):
                        base = probe.convert("RGBA")
                    else:
                        base = probe.convert("RGB")
            except Exception as exc:  # noqa: BLE001 - report and continue
                self.stdout.write(self.style.ERROR(f"failed to read {field.name}: {exc}"))
                failed += 1
                continue

            source_size = source_path.stat().st_size
            source_bytes += source_size
            produced_for_this = 0

            for width in widths:
                if width >= original_width:
                    # Never upscale: it only makes the file bigger.
                    continue
                height = max(1, round(original_height * width / original_width))
                frame = base.resize((width, height), Image.LANCZOS)

                for ext, fmt, save_kwargs in FOREGROUND_FORMATS:
                    target_name = f"{os.path.splitext(field.name)[0]}-{width}.{ext}"
                    try:
                        target_path = Path(field.storage.path(target_name))
                    except (NotImplementedError, ValueError):
                        continue

                    exists = target_path.exists()
                    if exists and not force:
                        result_bytes += target_path.stat().st_size
                        produced_for_this += 1
                        continue

                    if dry_run:
                        self.stdout.write(f"would write {target_name}")
                        continue

                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    try:
                        frame.save(target_path, fmt, **save_kwargs)
                    except Exception as exc:  # noqa: BLE001
                        # e.g. Pillow built without libavif
                        self.stdout.write(
                            self.style.WARNING(f"skip {target_name} ({fmt} unsupported here: {exc})")
                        )
                        target_path.unlink(missing_ok=True)
                        continue

                    result_bytes += target_path.stat().st_size
                    written += 1
                    produced_for_this += 1

            if produced_for_this == 0:
                self.stdout.write(f"no derivatives needed for {field.name}")
                skipped += 1

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"written {written}, skipped {skipped}, failed {failed}"))
        if source_bytes and result_bytes:
            self.stdout.write(
                f"source total {human(source_bytes)} -> derivatives total {human(result_bytes)}"
            )
        if dry_run:
            self.stdout.write(self.style.WARNING("dry run: nothing was written"))
