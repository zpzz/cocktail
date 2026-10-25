"""MinIO 封装。对象名：{source}/{source_id}.jpg，浏览器直接用返回的 URL 加载图片。"""

from __future__ import annotations

import json
from io import BytesIO

from minio import Minio
from minio.error import S3Error

from app.config import (
    MINIO_ACCESS_KEY,
    MINIO_BUCKET,
    MINIO_ENDPOINT,
    MINIO_PUBLIC_BASE,
    MINIO_SECRET_KEY,
    MINIO_SECURE,
)

_client: Minio | None = None


def minio_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )
    return _client


def public_url(object_key: str) -> str:
    return f"{MINIO_PUBLIC_BASE.rstrip('/')}/{MINIO_BUCKET}/{object_key}"


def is_minio_url(url: str | None) -> bool:
    if not url:
        return False
    return MINIO_BUCKET in url and MINIO_ENDPOINT.split(":")[0] in url


def find_existing_object(source: str, source_id: str) -> str | None:
    """重复爬取时若图已在桶里，直接复用，不再下载。"""
    ensure_bucket()
    prefix = f"{source}/{source_id}."
    try:
        for obj in minio_client().list_objects(MINIO_BUCKET, prefix=prefix):
            return public_url(obj.object_name)
    except S3Error:
        return None
    return None


def ensure_bucket() -> None:
    client = minio_client()
    if not client.bucket_exists(MINIO_BUCKET):
        client.make_bucket(MINIO_BUCKET)
    # 允许页面 <img> 直接访问，无需登录
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"AWS": ["*"]},
                "Action": ["s3:GetObject"],
                "Resource": [f"arn:aws:s3:::{MINIO_BUCKET}/*"],
            }
        ],
    }
    client.set_bucket_policy(MINIO_BUCKET, json.dumps(policy))


def upload_bytes(object_key: str, data: bytes, content_type: str) -> str:
    ensure_bucket()
    minio_client().put_object(
        MINIO_BUCKET,
        object_key,
        BytesIO(data),
        length=len(data),
        content_type=content_type or "application/octet-stream",
    )
    return public_url(object_key)
