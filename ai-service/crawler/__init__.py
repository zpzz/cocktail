"""
爬虫包。页面点「开始爬取」后的数据流：

    spiders/     从 MixMyth / CocktailDB 拉原始配方
        ↓
    pipeline.py  清洗成统一字段（杯型、技法、材料用量等）
        ↓
    images.py    下载配方图 + 材料图，上传 MinIO，把 image_url 换成 MinIO 地址
        ↓
    ingest.py    按 (source, source_id) 写入配方；材料进 kb_ingredient，用量进关联表
        ↓
    app/rag      拼 chunk → 向量化 → kb_chunk

scheduler.py 只负责在后台线程里串起上面几步，并给页面回报进度。
"""
