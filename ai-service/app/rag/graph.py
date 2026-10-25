"""LangGraph 对话图。

节点：
    classify      调 intent.classify_intent（DeepSeek JSON）：library / customize / chitchat / clarify
    clarify       不检索，只把 mode 设成 clarify
    retrieve      BGE-M3 + pgvector；customize 时 hits 当参考
    generate      DeepSeek 流式：闲聊 / 反问 / 照库回答 / 写新特调
    render_image  仅 customize：qwen-image 生图 → MinIO

边：
    START → classify → (chitchat: generate | clarify | retrieve → generate)
    generate → render_image → END   仅定制且不是反问
    generate → END                  查库、闲聊或反问
"""

from __future__ import annotations

from typing import Any, AsyncIterator, Literal, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph

from app.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
from app.core.database import SessionLocal
from app.rag.chunker import build_recipe_chunk
from app.rag.images import generate_cocktail_image, image_object_key, image_prompt_from_recipe
from app.rag.intent import classify_intent
from app.rag.retriever import search_recipes

MAX_HISTORY_MESSAGES = 16  # 内存里最多保留的 Human/AI 条数（约 8 轮）
RETRIEVE_K = 6
LIBRARY_SCORE = 0.55  # 1 - cosine_distance，达到这个或名称命中才算「库内已有」

LIBRARY_PROMPT = """你是鸡尾酒知识库助手，只推荐知识库里已经有的酒，绝对不是特调师。
硬性规则：
- 必须根据「检索到的配方」点名用户要的杯数（见 want_count）。有足够结果时点名不同的酒，写出酒名、酒精度、一句理由；用户要做法时再写材料步骤。
- 酒名必须与检索结果中的中文名一致，便于配图。
- 禁止提问。回答里不要出现问号。
- 禁止说「定制特调」、禁止发明新酒名或改配比。
- 用户说推荐、度数高、都行、没有、随便：直接给酒，不要解释还缺信息。
- 用中文。"""

CHITCHAT_PROMPT = """你是鸡尾酒助手，这轮用户在闲聊，不是查配方也不是定制。
规则：
- 用简短自然的中文回复。可以自我介绍：会查库内鸡尾酒、也能按口味定制特调。
- 不要编造完整配方，不要假装刚检索了知识库，不要生图。
- 可以轻轻把话题引到喝酒，但不要硬推酒单或问卷。
- 用中文。"""

CUSTOM_PROMPT = """你是鸡尾酒特调师。仅当用户明确要求定制/特调时才用本提示。
规则：
- 必须创作新配方（新酒名），可以参考检索结果的技法，但不要原样复制某一条库内酒。
- 开头标明「定制特调」。写出：酒名、基酒、口味、杯型、调制方式、材料（含用量）、步骤。
- 用户说都行/随便/问太多/别问/直接生成：未填的槽位你自己定，禁止再提问，回答里不要出现问号。
- 用中文。不要声称这是知识库现成配方。"""

CLARIFY_LIBRARY_PROMPT = """只能问 1 个短问题，然后停。不要问卷。"""

CLARIFY_CUSTOM_PROMPT = """用户要定制特调。每次只问 1 个还没填的槽：基酒、口味、调制方式（摇荡/搅拌/兑和）。
已在「已知偏好」里的不要再问。禁止一次问两个问题。不要生图。"""


class ChatState(TypedDict, total=False):
    session_id: str
    query: str  # 用户本轮原话
    search_query: str  # 槽位拼上原话，给检索用
    messages: list[BaseMessage]  # 进入本轮前的历史
    hits: list[dict[str, Any]]  # 检索命中摘要（给 SSE sources）
    context: str  # 拼好的配方全文，塞进 generate 的 prompt
    intent: Literal["library", "customize", "clarify", "chitchat"]
    need_clarify: bool
    mode: Literal["clarify", "library", "customize", "chitchat"]
    confident_match: bool  # library 是否高置信命中
    want_count: int  # 用户要几杯，查库配图按这个数
    answer: str
    image_url: str
    image_error: str
    images: list[dict[str, Any]]  # 库内现成图，给 SSE images
    slots: dict[str, str]  # base_spirit / flavor / method / named_drink


# 进程内存会话：重启即丢。key 来自浏览器 localStorage。
_SESSIONS: dict[str, list[BaseMessage]] = {}
_SESSION_META: dict[str, dict[str, Any]] = {}  # 上一轮 intent，给粘性分类
_graph = None


def history_for(session_id: str) -> list[BaseMessage]:
    return list(_SESSIONS.get(session_id) or [])


def _remember(session_id: str, user_text: str, assistant_text: str, intent: str, mode: str) -> None:
    rows = _SESSIONS.setdefault(session_id, [])
    rows.append(HumanMessage(content=user_text))
    rows.append(AIMessage(content=assistant_text))
    _SESSIONS[session_id] = rows[-MAX_HISTORY_MESSAGES:]
    prev = _SESSION_META.get(session_id) or {}
    count = int(prev.get("clarify_count") or 0)
    if mode == "clarify":
        count += 1
    _SESSION_META[session_id] = {"intent": intent, "clarify_count": count}


def _hit_dict(recipe, distance: float) -> dict[str, Any]:
    return {
        "id": recipe.id,
        "name": recipe.name,
        "name_en": recipe.name_en or "",
        "source": recipe.source,
        "score": round(1 - float(distance), 4),
        "image_url": recipe.image_url or "",
        "glass": recipe.glass or "",
        "method": recipe.method_label or recipe.method or "",
    }


def _name_match(query: str, recipe) -> bool:
    blob = (query or "").lower()
    names = [recipe.name or "", recipe.name_en or ""]
    return any(name and name.lower() in blob for name in names)


def library_images(hits: list[dict[str, Any]], answer: str, want_count: int) -> list[dict[str, Any]]:
    """按回答里点到的酒名配图；点不够再按检索顺序补到 want_count。"""
    n = max(1, min(int(want_count or 2), 4))
    blob = (answer or "").lower()
    picked: list[dict[str, Any]] = []
    seen: set[Any] = set()

    def take(row: dict[str, Any]) -> None:
        rid = row.get("id")
        if rid in seen or not row.get("image_url"):
            return
        seen.add(rid)
        picked.append(row)

    for row in hits:
        names = [row.get("name") or "", row.get("name_en") or ""]
        if any(name and name.lower() in blob for name in names):
            take(row)
        if len(picked) >= n:
            break
    if len(picked) < n:
        for row in hits:
            take(row)
            if len(picked) >= n:
                break
    return [
        {"url": row["image_url"], "alt": row.get("name") or "", "recipe_id": row.get("id")}
        for row in picked
    ]


def _llm(temperature: float = 0.4) -> ChatOpenAI:
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("未配置 DEEPSEEK_API_KEY")
    return ChatOpenAI(
        model=DEEPSEEK_MODEL,
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
        streaming=True,
        temperature=temperature,
    )


async def classify(state: ChatState) -> dict[str, Any]:
    """入口：规则 + DeepSeek 判定 intent/mode，清空上一轮检索结果。"""
    meta = _SESSION_META.get(state.get("session_id") or "") or {}
    sticky = meta.get("intent")
    clarify_count = int(meta.get("clarify_count") or 0)
    result = await classify_intent(
        state["query"],
        list(state.get("messages") or []),
        sticky,
        clarify_count=clarify_count,
    )
    intent = result["intent"]
    mode = result["mode"]
    search_query = result.get("search_query") or state["query"]
    want_count = int(result.get("want_count") or 1)
    return {
        "intent": intent if intent in {"library", "customize", "clarify", "chitchat"} else "library",
        "need_clarify": bool(result.get("need_clarify")) and mode == "clarify",
        "mode": mode if mode in {"library", "customize", "clarify", "chitchat"} else "library",
        "search_query": search_query,
        "want_count": want_count,
        "slots": result.get("slots") or {},
        "hits": [],
        "context": "",
        "confident_match": False,
        "image_url": "",
        "image_error": "",
        "images": [],
        "answer": "",
    }


def route_after_classify(state: ChatState) -> Literal["clarify", "retrieve", "generate"]:
    if state.get("need_clarify") or state.get("mode") == "clarify":
        return "clarify"
    if state.get("intent") == "chitchat" or state.get("mode") == "chitchat":
        return "generate"
    return "retrieve"


def clarify(state: ChatState) -> dict[str, Any]:
    intent = state.get("intent") or "library"
    return {
        "hits": [],
        "context": "",
        "mode": "clarify",
        "intent": "customize" if intent == "customize" else "library",
    }


def retrieve(state: ChatState) -> dict[str, Any]:
    """查库。customize 不带库内成品图；library 的配图在回答生成后再按酒名匹配。"""
    db = SessionLocal()
    try:
        query = state.get("search_query") or state["query"]
        pairs = search_recipes(db, query, k=RETRIEVE_K)
        hits = [_hit_dict(recipe, distance) for recipe, distance in pairs]
        blocks = []
        for index, (recipe, distance) in enumerate(pairs, start=1):
            score = round(1 - float(distance), 4)
            blocks.append(f"[{index}] 相关度 {score}\n{build_recipe_chunk(recipe)}")
        top = hits[0] if hits else None
        named = any(_name_match(state["query"], recipe) for recipe, _dist in pairs)
        confident = bool(top) and (named or (top["score"] >= LIBRARY_SCORE))
        intent = state.get("intent") or "library"
        # 即使用户描述很像莫吉托，只要意图是定制就不走「直接返回库内」
        want_count = max(1, min(int(state.get("want_count") or (1 if named else 2)), 4))
        if intent == "customize":
            mode: Literal["library", "customize", "clarify", "chitchat"] = "customize"
            confident = False
            images: list[dict[str, Any]] = []
        else:
            mode = "library"
            images = []
        return {
            "hits": hits,
            "context": "\n\n".join(blocks) if blocks else "（没有检索到配方）",
            "confident_match": confident,
            "mode": mode,
            "want_count": want_count,
            "images": images,
        }
    finally:
        db.close()


async def generate(state: ChatState) -> dict[str, Any]:
    """按 mode 换 system prompt。token 由 stream_chat 监听 on_chat_model_stream 往外推。"""
    mode = state.get("mode") or "library"
    intent = state.get("intent") or "library"
    if mode == "chitchat" or intent == "chitchat":
        system = CHITCHAT_PROMPT
        user = f"用户说：{state['query']}"
    elif mode == "clarify":
        system = CLARIFY_CUSTOM_PROMPT if intent == "customize" else CLARIFY_LIBRARY_PROMPT
        slots = state.get("slots") or {}
        missing = [name for key, name in (("base_spirit", "基酒"), ("flavor", "口味"), ("method", "调制方式")) if not slots.get(key)]
        user = (
            f"用户说：{state['query']}\n已知偏好：{slots}\n"
            f"还缺：{'、'.join(missing) or '无'}\n"
            "只问还缺项里的第一个，不要问卷。"
        )
    elif mode == "customize":
        system = CUSTOM_PROMPT
        user = (
            f"用户需求：{state['query']}\n偏好：{state.get('slots') or {}}\n"
            "若用户表示都行/随便/问太多/别问：自行补全偏好，禁止提问。\n\n"
            f"可参考的知识库配方（不要照抄）：\n{state.get('context') or '（无）'}"
        )
    else:
        system = LIBRARY_PROMPT
        want_count = max(1, min(int(state.get("want_count") or 2), 4))
        user = (
            f"用户问题：{state['query']}\n"
            f"本轮要点名 {want_count} 杯库内酒（检索结果不够就有几杯写几杯）。\n"
            f"是否有高置信匹配：{bool(state.get('confident_match'))}\n\n"
            f"检索到的配方：\n{state.get('context') or '（没有检索到配方）'}\n\n"
            "本轮禁止提问，必须从上面检索结果里点名推荐，酒名用检索里的中文名。"
        )
    prompt = [
        SystemMessage(content=system),
        *list(state.get("messages") or []),
        HumanMessage(content=user),
    ]
    response = await _llm(0.7 if mode == "customize" else 0.3).ainvoke(prompt)
    text = response.content if isinstance(response.content, str) else str(response.content)
    return {"answer": text}


async def render_image(state: ChatState) -> dict[str, Any]:
    """定制成品图。失败不打断文案，把原因放进 image_error 给前端。"""
    if state.get("mode") != "customize" or state.get("need_clarify"):
        return {"image_url": "", "image_error": ""}
    answer = state.get("answer") or ""
    prompt = image_prompt_from_recipe(answer or state["query"])
    key = image_object_key(state.get("session_id") or "default", prompt)
    try:
        url = await generate_cocktail_image(prompt, key)
    except Exception as exc:  # noqa: BLE001
        return {"image_url": "", "image_error": str(exc)}
    return {"image_url": url or "", "image_error": "" if url else "生图返回空"}


def route_after_generate(state: ChatState) -> Literal["render_image", "__end__"]:
    if state.get("mode") == "customize" and not state.get("need_clarify"):
        return "render_image"
    return "__end__"


def build_graph():
    """编译一次即可；get_graph() 缓存编译结果。"""
    workflow = StateGraph(ChatState)
    workflow.add_node("classify", classify)
    workflow.add_node("retrieve", retrieve)
    workflow.add_node("clarify", clarify)
    workflow.add_node("generate", generate)
    workflow.add_node("render_image", render_image)
    workflow.add_edge(START, "classify")
    workflow.add_conditional_edges(
        "classify",
        route_after_classify,
        {"clarify": "clarify", "retrieve": "retrieve", "generate": "generate"},
    )
    workflow.add_edge("clarify", "generate")
    workflow.add_edge("retrieve", "generate")
    workflow.add_conditional_edges(
        "generate",
        route_after_generate,
        {"render_image": "render_image", "__end__": END},
    )
    workflow.add_edge("render_image", END)
    return workflow.compile()


def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


def _token_text(chunk: Any) -> str:
    content = getattr(chunk, "content", None)
    if not content:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(item.get("text") or "")
        return "".join(parts)
    return ""


async def stream_chat(session_id: str, query: str) -> AsyncIterator[dict[str, Any]]:
    """把 LangGraph 事件翻成页面用的 SSE：intent / sources / images / token / image_loading / image。"""
    query = (query or "").strip()
    if not query:
        yield {"type": "error", "message": "请输入问题"}
        return
    payload: ChatState = {
        "session_id": session_id,
        "query": query,
        "messages": history_for(session_id),
        "hits": [],
        "context": "",
        "intent": "library",
        "need_clarify": False,
        "mode": "library",
        "confident_match": False,
        "want_count": 1,
        "answer": "",
        "image_url": "",
        "image_error": "",
        "images": [],
        "slots": {},
    }
    tokens: list[str] = []
    intent = "library"
    mode = "library"
    hits: list[dict[str, Any]] = []
    want_count = 1
    try:
        async for event in get_graph().astream_events(payload, version="v2"):
            kind = event.get("event")
            node = (event.get("metadata") or {}).get("langgraph_node")
            data = event.get("data") or {}
            output = data.get("output")
            if kind == "on_chain_end" and node == "classify" and isinstance(output, dict):
                intent = output.get("intent") or intent
                mode = output.get("mode") or mode
                want_count = int(output.get("want_count") or want_count)
                yield {"type": "intent", "value": intent, "mode": mode}
                if output.get("need_clarify"):
                    yield {"type": "mode", "value": "clarify"}
            elif kind == "on_chain_end" and node == "retrieve" and isinstance(output, dict):
                mode = output.get("mode") or mode
                hits = output.get("hits") or []
                want_count = int(output.get("want_count") or want_count)
                role = "reference" if mode == "customize" else "library"
                yield {"type": "sources", "role": role, "items": hits}
            elif kind == "on_chain_end" and node == "generate" and isinstance(output, dict):
                if mode == "library":
                    images = library_images(
                        hits,
                        "".join(tokens) or str(output.get("answer") or ""),
                        want_count,
                    )
                    if images:
                        yield {"type": "images", "items": images}
                elif mode == "customize":
                    yield {"type": "image_loading", "text": "正在生成特调配图…"}
            elif kind == "on_chain_start" and node == "render_image":
                yield {"type": "image_loading", "text": "正在生成特调配图…"}
            elif kind == "on_chain_end" and node == "render_image" and isinstance(output, dict):
                url = output.get("image_url") or ""
                if url:
                    yield {"type": "image", "url": url, "alt": "定制特调", "kind": "custom"}
                elif output.get("image_error"):
                    yield {"type": "image_error", "message": output["image_error"]}
            elif kind == "on_chat_model_stream" and node == "generate":
                text = _token_text(data.get("chunk"))
                if text:
                    tokens.append(text)
                    yield {"type": "token", "text": text}
        answer = "".join(tokens).strip()
        if answer:
            _remember(session_id, query, answer, intent, mode)
        yield {"type": "done"}
    except Exception as exc:  # noqa: BLE001
        yield {"type": "error", "message": str(exc)}
