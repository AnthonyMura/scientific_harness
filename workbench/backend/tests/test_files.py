"""Raw-image serving for the Image pane (workbench_backend.files.raw_image, issue 55).

Pins that TIFFs are served with a renderable media type (the browser cannot
render them natively, so the web client decodes them), and that the safety
caps behave: non-images get 415, over-cap files get 413.
"""

import pytest

from workbench_backend.errors import ApiError
from workbench_backend.files import RAW_IMAGE_MAX_BYTES, raw_image


def test_raw_image_serves_tiff_as_image_tiff(tmp_path):
    p = tmp_path / "scan.tiff"
    p.write_bytes(b"II*\x00fixture")
    data, media = raw_image(tmp_path, "scan.tiff")
    assert data == b"II*\x00fixture"
    assert media == "image/tiff"


def test_raw_image_serves_tif_extension_too(tmp_path):
    p = tmp_path / "old.tif"
    p.write_bytes(b"II*\x00fixture")
    _, media = raw_image(tmp_path, "old.tif")
    assert media == "image/tiff"


def test_raw_image_rejects_non_images_with_415(tmp_path):
    (tmp_path / "main.tex").write_text("\\documentclass{article}\n")
    with pytest.raises(ApiError) as exc:
        raw_image(tmp_path, "main.tex")
    assert exc.value.status == 415


def test_raw_image_missing_file_is_404(tmp_path):
    with pytest.raises(ApiError) as exc:
        raw_image(tmp_path, "nope.png")
    assert exc.value.status == 404


def test_raw_image_rejects_files_over_cap_with_413(tmp_path):
    p = tmp_path / "huge.png"
    p.write_bytes(b"\x00" * (RAW_IMAGE_MAX_BYTES + 1))
    with pytest.raises(ApiError) as exc:
        raw_image(tmp_path, "huge.png")
    assert exc.value.status == 413
