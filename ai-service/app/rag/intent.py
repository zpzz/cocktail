"""意图识别：先规则抽槽位，再用 DeepSeek JSON 补全。

三种意图：
    library    查知识库现成酒（没说定制）——推荐、度数高、点名酒款都走这里
    customize  用户明确要新特调；检索结果只当参考
    clarify    查库最多问 1 句；定制最多 3 轮，每轮只问一个缺槽。
               用户不耐烦（问太多/别问/直接给我）或没偏好（都行/随便）→ 立刻生成/推荐

没出现定制类词时禁止 customize。
"""

from __future__ import annotations

import json
import re
from typing import Any, Literal

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL

Intent = Literal["library", "customize", "clarify"]

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
    "香槟", "利口", "梅酒", "清酒", "sake", "啤酒",
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
# 没有偏好：可以当「你定」；不耐烦：必须立刻出结果
NO_PREF = ("都行", "都可以", "随便", "没有", "无所谓", "都可", "你定", "你看着办")
IMPATIENT = (
    "问太多", "别问", "不要问", "别再问", "直接推荐", "直接给我", "直接生成",
    "你推荐", "烦", "不耐烦", "太多问题", "少问",
)
SKIP_CLARIFY = NO_PREF + IMPATIENT
CUSTOM_CLARIFY_MAX = 3  # 定制允许的反问轮数；查库仍是 1
GREETINGS = ("你好", "您好", "hello", "hi", "嗨", "在吗")

CLASSIFY_PROMPT = """你是鸡尾酒助手的意图分类器，只输出 JSON，不要其它文字。
字段：
- intent: library | customize | clarify
  library: 查知识库现成酒、要推荐、问度数/烈度/某杯酒怎么做
  customize: 用户明确要新创/特调/定制（必须出现这类词）
  clarify: 完全没有可检索线索（没有酒名、基酒、口味、度数、推荐）
- base_spirit, flavor, method, named_drink: 短字符串，没有则 ""
硬性规则：
- 没出现「定制/特调/原创/自创/新配方/专属」→ 禁止 customize，只能 library 或 clarify
- 「推荐」「度数高」「烈」→ library，用这些词检索，不要 clarify
- 「你好」→ library，不要问卷
- 「都行/随便/问太多/别问/直接给我」→ 停止追问：查库就推荐，定制就直接生成
- 定制未说厌烦、槽位未满（基酒/口味/做法 < 2）且反问未满 3 轮 → 可以再问 1 个缺项
- 查库：助手已经反问过一轮 → 禁止再 clarify
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


def _user_said_custom(query: str, messages: list[BaseMessage] | None = None) -> bool:
    """只看本句。不要扫整段历史，否则早先测过定制会把后面的「推荐」也判成特调。"""
    del messages
    return _has_any(query, CUSTOM_HINTS)


def _last_assistant_asked(messages: list[BaseMessage]) -> bool:
    """上一轮助手是否在反问。是则本轮必须作答，禁止再问。"""
    for message in reversed(messages):
        if isinstance(message, AIMessage):
            content = message.content if isinstance(message.content, str) else str(message.content)
            return ("？" in content) or ("?" in content)
        if isinstance(message, HumanMessage):
            break
    return False


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


def rule_intent(
    query: str,
    messages: list[BaseMessage],
    sticky: str | None,
    clarify_count: int = 0,
) -> dict[str, Any]:
    """优先级：跳过追问 > 定制词 > 有检索线索 → 查库 > 已反问过 → 问候/过短才 clarify。"""
    blob = f"{query} {' '.join(
        m.content for m in messages if isinstance(m, HumanMessage) and isinstance(m.content, str)
    )}"
    asked = _last_assistant_asked(messages)
    impatient = _has_any(query, IMPATIENT)
    no_pref = _has_any(query, NO_PREF)
    skip = impatient or no_pref
    greeting = _has_any(query.strip().lower(), GREETINGS) and len(query.strip()) <= 8
    # 粘性定制：补槽、都行、不耐烦都还算定制，直到用户改口去查库
    custom = _has_any(query, CUSTOM_HINTS) or (
        sticky == "customize"
        and not _has_any(query, LIBRARY_HINTS)
        and not greeting
    )
    named = _has_any(query, NAMED_DRINKS)
    has_signal = named or _has_any(query, LIBRARY_HINTS) or _has_any(query, BASE_HINTS + FLAVOR_HINTS)
    slots = {
        "base_spirit": next((h for h in BASE_HINTS if h.lower() in blob.lower()), ""),
        "flavor": next((h for h in FLAVOR_HINTS if h.lower() in blob.lower()), ""),
        "method": next((h for h in METHOD_HINTS if h.lower() in blob.lower()), ""),
        "named_drink": next((h for h in NAMED_DRINKS if h.lower() in query.lower()), ""),
    }
    filled = sum(1 for key in ("base_spirit", "flavor", "method") if slots[key])

    if custom:
        intent: Intent = "customize"
        # 不耐烦/没偏好/已问满 3 轮/槽位够 → 直接生成
        need_clarify = (
            not skip
            and clarify_count < CUSTOM_CLARIFY_MAX
            and filled < 2
        )
    elif has_signal or skip or asked:
        intent = "library"
        need_clarify = False
    elif greeting:
        intent = "library"
        need_clarify = False
    elif skip or asked or clarify_count >= 1:
        intent = sticky if sticky in {"library", "customize"} else "library"
        if intent == "customize" and not _user_said_custom(query, messages):
            intent = "library"
        need_clarify = False
    else:
        # 完全没有线索才问一句
        intent = "clarify"
        need_clarify = True

    if sticky == "customize" and not custom:
        if intent == "customize":
            intent = "library"

    mode = "clarify" if need_clarify else ("customize" if intent == "customize" else "library")
    if mode == "clarify" and intent not in {"customize", "library"}:
        intent = "library"

    return {
        "intent": "customize" if intent == "customize" else "library",
        "need_clarify": mode == "clarify",
        "mode": mode,
        "slots": slots,
        "search_query": _search_query(slots, query),
    }


async def classify_intent(
    query: str,
    messages: list[BaseMessage],
    sticky: str | None,
    clarify_count: int = 0,
) -> dict[str, Any]:
    """先跑规则，再让模型填 JSON。没有定制词时禁止 customize；已反问过禁止再 clarify。"""
    fallback = rule_intent(query, messages, sticky, clarify_count)
    # 推荐/度数/都行/已问过：规则已经够用，别让模型再改成问卷或定制
    if (
        not fallback["need_clarify"]
        and fallback["intent"] == "library"
        and (
            _has_any(query, LIBRARY_HINTS + SKIP_CLARIFY + GREETINGS + NAMED_DRINKS)
            or _last_assistant_asked(messages)
            or clarify_count >= 1
        )
    ):
        return fallback
    if not DEEPSEEK_API_KEY:
        return fallback
    llm = ChatOpenAI(
        model=DEEPSEEK_MODEL,
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
        temperature=0,
        max_tokens=220,
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

    llm_intent = data.get("intent") if data.get("intent") in {"library", "customize", "clarify"} else fallback["intent"]
    if not _user_said_custom(query):
        llm_intent = "library" if llm_intent == "customize" else llm_intent
    if _has_any(query, CUSTOM_HINTS):
        llm_intent = "customize"

    slots = dict(fallback["slots"])
    for key in ("base_spirit", "flavor", "method", "named_drink"):
        value = str(data.get(key) or "").strip()
        if value:
            slots[key] = value

    asked = _last_assistant_asked(messages)
    skip = _has_any(query, SKIP_CLARIFY)
    filled = sum(1 for key in ("base_spirit", "flavor", "method") if slots[key])
    if sticky == "customize" and not _has_any(query, LIBRARY_HINTS):
        llm_intent = "customize"
    if llm_intent == "customize":
        need_clarify = (
            not skip
            and clarify_count < CUSTOM_CLARIFY_MAX
            and filled < 2
        )
    elif skip or asked or clarify_count >= 1 or llm_intent == "library" or _has_any(query, LIBRARY_HINTS + NAMED_DRINKS):
        need_clarify = False
        if llm_intent != "customize":
            llm_intent = "library"
    else:
        need_clarify = llm_intent == "clarify" and not skip and not asked
        if not need_clarify:
            llm_intent = "library"

    mode = "clarify" if need_clarify else ("customize" if llm_intent == "customize" else "library")
    return {
        "intent": "customize" if llm_intent == "customize" else "library",
        "need_clarify": need_clarify,
        "mode": mode,
        "slots": slots,
        "search_query": _search_query(slots, query),
    }
