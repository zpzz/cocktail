"""
向量知识库（BGE-M3 + pgvector）+ 对话编排。

阅读顺序：
    chunker    把 kb_recipe 拼成一段检索文本（不调 LLM）
    embedder   本地 BGE-M3 → 1024 维 L2 向量
    ingest     文本没变则跳过，有变才写入 kb_chunk
    scheduler  页面「向量化入库」的后台线程
    retriever  问题向量 vs kb_chunk 余弦近邻，带回完整配方
    intent     规则 + DeepSeek JSON：library / customize / clarify
    graph      LangGraph：分类 → 反问或检索 → 生成 →（定制才）生图
    images     qwen-image-2.1-pro 出图后上传 MinIO

对话入口：POST /api/chat/stream → graph.stream_chat
"""
