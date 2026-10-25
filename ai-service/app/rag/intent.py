"""意图识别：DeepSeek JSON 为主，规则只抽槽位并在模型失败时兜底。

四种意图：
    library    查知识库现成酒、推荐、点名酒款
    customize  用户明确要新特调；检索结果只当参考
    chitchat   打招呼、闲聊、身份、感谢，不检索不给配方
    clarify    想喝酒/定制但信息不够，只问一个短问题（作为 mode）
"""

from __future__ import annotations

import json
import re
from typing import Any, Literal

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL

Intent = Literal["library", "customize", "clarify", "chitchat"]
Mode = Literal["library", "customize", "clarify", "chitchat"]

CUSTOM_HINTS = (
    "定制", "特调", "原创", "自创", "发明", "新配方", "新的一杯",
    "不要现成", "不是现成", "不要库", "按我的", "专属", "创作",
    "自己调", "帮我调一款新", "调一款新", "创新",
)
LIBRARY_HINTS = (
    "配方库", "现成", "已有", "标准配方", "怎么做", "用什么酒",
    "材料", "做法", "步骤", "成分", "推荐", "度数", "酒精度",
    "烈", "高度数", "低度数", "短饮", "长饮", "有什么喝",
)
BASE_HINTS = (
    "朗姆", "rum", "金酒", "琴酒", "gin", "伏特加", "vodka",
    "威士忌", "whisky", "whiskey", "龙舌兰", "tequila", "白兰地", "brandy",
    "香槟", "利口", "利口酒", "梅酒", "清酒", "sake", "啤酒",
)
FLAVOR_HINTS = (
    "清爽", "偏甜", "甜", "苦", "酸", "辛辣", "果香", "奶香",
    "咖啡", "热带", "草本", "烟熏", "干", "不甜",
)
METHOD_HINTS = (
    "摇荡", "shake", "搅拌", "stir", "兑和", "build",
    "搅打", "blend", "漂浮", "漂层", "冲洗",
)
NAMED_DRINKS = (
    "莫吉托", "mojito", "马天尼", "martini", "内格罗尼", "negroni",
    "曼哈顿", "manhattan", "玛格丽特", "margarita", "酸酒", "sour",
    "古典", "old fashioned", "长岛", "血腥玛丽", "椰林", "daiquiri",
    "代基里", "金汤力", "自由古巴", "莫斯科骡子",
)
NO_PREF = ("都行", "都可以", "随便", "没有", "无所谓", "都可", "你定", "你看着办")
IMPATIENT = (
    "问太多", "别问", "不要问", "别再问", "直接推荐", "直接给我", "直接生成",
    "你推荐", "烦", "不耐烦", "太多问题", "少问",
)
SKIP_CLARIFY = NO_PREF + IMPATIENT
CUSTOM_CLARIFY_MAX = 3
GREETINGS = ("你好", "您好", "hello", "hi", "嗨", "在吗")
CHITCHAT_HINTS = GREETINGS + (
    "谢谢", "感谢", "thanks", "thx",
    "你是谁", "你叫什么", "你做什么", "你会什么", "介绍一下",
    "天气", "讲个笑话", "在干嘛", "聊会", "闲聊", "早上好", "晚上好",
)

CLASSIFY_PROMPT = """你是鸡尾酒助手的意图分类器。只输出一个 JSON 对象，不要其它文字。
字段：
- intent: library | customize | chitchat | clarify
- need_clarify: true 或 false
- want_count: 整数 0-4。用户要几杯/几款；推荐没说数量用 2；点名一杯用 1；闲聊用 0
- base_spirit, flavor, method, named_drink: 短字符串，没有则 ""
- search_query: 给向量检索用的简短中文；闲聊输出 ""

intent：
- library：查现成配方、推荐酒、问材料/做法/度数、点名某杯怎么做
- customize：明确要新创/特调/定制/发明新配方
- chitchat：打招呼、感谢、身份、闲聊、与调酒无关。不检索、不给配方
- clarify：用户想喝酒或定制，但关键信息不足，本轮只该问一个短问题

规则：
1. 以本轮用户话为主，结合最近对话判断，不要被关键词表绑死。
2. 没出现定制/特调/原创/自创/新配方/专属 → 不要用 customize。
3. 「推荐两杯利口酒」「来两款金酒」→ library，want_count=2，search_query 要包含酒类。
4. 「你好」「你是谁」「谢谢」→ chitchat，need_clarify=false。
5. 「都行/随便/别问/直接给我」→ 禁止 clarify；上一轮是定制则 customize，否则 library。
6. 助手刚反问、用户在补槽 → 继承上一轮意图，need_clarify=false。
7. 查库最多反问 1 次；定制最多 3 次，每次只问一个缺槽。
"""


def transcript(messages: list[BaseMessage], query: str) -> str:
    lines: list[str] = []
    for message in messages[-8:]:
        role = "用户" if isinstance(message, HumanMessage) else "助手"
        content = message.content if isinstance(message.content, str) else str(message.content)
        lines.append(f"{role}：{content}")
    lines.append(f"用户：{query}")
    return "\n".join(lines)


def _has_any(text: str, hints: tuple[str, ...]) -> bool:
    blob = text.lower()
    return any(hint.lower() in blob for hint in hints)


def _user_said_custom(query: str) -> bool:
    return _has_any(query, CUSTOM_HINTS)


def _last_assistant_asked(messages: list[BaseMessage]) -> bool:
    for message in reversed(messages):
        if isinstance(message, AIMessage):
            content = message.content if isinstance(message.content, str) else str(message.content)
            return ("？" in content) or ("?" in content)
        if isinstance(message, HumanMessage):
            break
    return False


def parse_want_count(query: str, intent: str = "library") -> int:
    if intent == "chitchat":
        return 0
    for word, count in (("四", 4), ("4", 4), ("三", 3), ("3", 3), ("两", 2), ("二", 2), ("2", 2)):
        if word in query and any(unit in query for unit in ("杯", "款", "个", "种")):
            return count
    if "推荐" in query and not _has_any(query, NAMED_DRINKS):
        return 2
    return 1


def _rule_slots(query: str, messages: list[BaseMessage]) -> dict[str, str]:
    blob = f"{query} {' '.join(
        m.content for m in messages if isinstance(m, HumanMessage) and isinstance(m.content, str)
    )}"
    lower = blob.lower()
    query_lower = query.lower()
    return {
        "base_spirit": next((h for h in BASE_HINTS if h.lower() in lower), ""),
        "flavor": next((h for h in FLAVOR_HINTS if h.lower() in lower), ""),
        "method": next((h for h in METHOD_HINTS if h.lower() in lower), ""),
        "named_drink": next((h for h in NAMED_DRINKS if h.lower() in query_lower), ""),
    }


def _search_query(slots: dict[str, str], query: str) -> str:
    extra = []
    if _has_any(query, ("度数", "酒精度", "高度数", "烈")):
        extra.extend(["高度数", "烈酒", "高酒精度"])
    parts = [
        slots.get("named_drink") or "",
        slots.get("base_spirit") or "",
        slots.get("flavor") or "",
        slots.get("method") or "",
        *extra,
        query,
    ]
    return " ".join(part for part in parts if part).strip()


def _pack(
    intent: Intent,
    need_clarify: bool,
    slots: dict[str, str],
    query: str,
    want_count: int | None = None,
    search_query: str | None = None,
) -> dict[str, Any]:
    if intent == "chitchat":
        mode: Mode = "chitchat"
        need_clarify = False
        count = 0
        q = ""
    elif need_clarify:
        mode = "clarify"
        count = max(1, min(int(want_count or parse_want_count(query, intent)), 4))
        q = search_query or _search_query(slots, query)
    elif intent == "customize":
        mode = "customize"
        count = max(1, min(int(want_count or 1), 4))
        q = search_query or _search_query(slots, query)
    else:
        intent = "library"
        mode = "library"
        count = max(1, min(int(want_count or parse_want_count(query, "library")), 4))
        q = search_query or _search_query(slots, query)
    return {
        "intent": intent if intent in {"library", "customize", "chitchat"} else "library",
        "need_clarify": need_clarify and mode == "clarify",
        "mode": mode,
        "slots": slots,
        "search_query": q,
        "want_count": count,
    }


def rule_intent(
    query: str,
    messages: list[BaseMessage],
    sticky: str | None,
    clarify_count: int = 0,
) -> dict[str, Any]:
    """模型失败时的兜底，不作为主路径。"""
    asked = _last_assistant_asked(messages)
    skip = _has_any(query, SKIP_CLARIFY)
    greeting_only = _has_any(query.strip().lower(), GREETINGS) and len(query.strip()) <= 8
    chitchat = _has_any(query, CHITCHAT_HINTS) and not _has_any(
        query, LIBRARY_HINTS + CUSTOM_HINTS + NAMED_DRINKS + BASE_HINTS
    )
    custom = _user_said_custom(query) or (
        sticky == "customize"
        and not _has_any(query, LIBRARY_HINTS)
        and not greeting_only
        and not chitchat
    )
    slots = _rule_slots(query, messages)
    filled = sum(1 for key in ("base_spirit", "flavor", "method") if slots[key])
    has_signal = bool(slots["named_drink"]) or _has_any(query, LIBRARY_HINTS + BASE_HINTS + FLAVOR_HINTS)

    if chitchat and not custom and not has_signal:
        return _pack("chitchat", False, slots, query, 0)
    if custom:
        need_clarify = not skip and clarify_count < CUSTOM_CLARIFY_MAX and filled < 2
        return _pack("customize", need_clarify, slots, query)
    if has_signal or skip or asked:
        return _pack("library", False, slots, query)
    if greeting_only:
        return _pack("chitchat", False, slots, query, 0)
    return _pack("library", True, slots, query)


def _apply_rails(
    query: str,
    messages: list[BaseMessage],
    sticky: str | None,
    clarify_count: int,
    llm_intent: Intent,
    need_clarify: bool,
    slots: dict[str, str],
    want_count: int,
    search_query: str,
) -> dict[str, Any]:
    asked = _last_assistant_asked(messages)
    skip = _has_any(query, SKIP_CLARIFY)
    cocktail_query = _user_said_custom(query) or _has_any(
        query, LIBRARY_HINTS + NAMED_DRINKS + BASE_HINTS
    )
    if llm_intent == "chitchat":
        if cocktail_query:
            llm_intent = "customize" if _user_said_custom(query) else "library"
        else:
            return _pack("chitchat", False, slots, query, 0, "")
    if not _user_said_custom(query) and llm_intent == "customize":
        if sticky == "customize" and not _has_any(query, LIBRARY_HINTS):
            llm_intent = "customize"
        else:
            llm_intent = "library"
    if _user_said_custom(query):
        llm_intent = "customize"
    if sticky == "customize" and not _has_any(query, LIBRARY_HINTS) and llm_intent != "chitchat":
        llm_intent = "customize"

    filled = sum(1 for key in ("base_spirit", "flavor", "method") if slots[key])
    if llm_intent == "customize":
        need_clarify = not skip and clarify_count < CUSTOM_CLARIFY_MAX and filled < 2
    elif skip or asked or clarify_count >= 1 or llm_intent == "library":
        need_clarify = False
        if llm_intent not in {"customize", "chitchat"}:
            llm_intent = "library"
    else:
        need_clarify = bool(need_clarify) and not skip and not asked
        if not need_clarify and llm_intent not in {"customize", "chitchat"}:
            llm_intent = "library"
    return _pack(llm_intent, need_clarify, slots, query, want_count, search_query)


async def classify_intent(
    query: str,
    messages: list[BaseMessage],
    sticky: str | None,
    clarify_count: int = 0,
) -> dict[str, Any]:
    """始终先调大模型分类；失败或无 key 才用规则。"""
    fallback = rule_intent(query, messages, sticky, clarify_count)
    if not DEEPSEEK_API_KEY:
        return fallback
    llm = ChatOpenAI(
        model=DEEPSEEK_MODEL,
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
        temperature=0,
        max_tokens=280,
        streaming=False,
    )
    prompt = [
        SystemMessage(content=CLASSIFY_PROMPT),
        HumanMessage(
            content=(
                f"上一轮意图：{sticky or '无'}\n"
                f"本段已反问次数：{clarify_count}\n"
                f"助手是否刚反问：{_last_assistant_asked(messages)}\n"
                f"{transcript(messages, query)}"
            )
        ),
    ]
    try:
        response = await llm.ainvoke(prompt)
        text = response.content if isinstance(response.content, str) else str(response.content)
        match = re.search(r"\{.*\}", text, re.S)
        data = json.loads(match.group(0) if match else text)
    except Exception:
        return fallback

    raw_intent = data.get("intent")
    llm_intent: Intent = raw_intent if raw_intent in {"library", "customize", "clarify", "chitchat"} else fallback["intent"]
    slots = dict(fallback["slots"])
    for key in ("base_spirit", "flavor", "method", "named_drink"):
        value = str(data.get(key) or "").strip()
        if value:
            slots[key] = value
    try:
        want_count = int(data.get("want_count"))
    except (TypeError, ValueError):
        want_count = fallback["want_count"]
    search_query = str(data.get("search_query") or "").strip() or fallback["search_query"]
    need_clarify = bool(data.get("need_clarify")) or llm_intent == "clarify"
    if llm_intent == "clarify":
        llm_intent = "customize" if sticky == "customize" or _user_said_custom(query) else "library"
    return _apply_rails(
        query,
        messages,
        sticky,
        clarify_count,
        llm_intent,
        need_clarify,
        slots,
        want_count,
        search_query,
    )
