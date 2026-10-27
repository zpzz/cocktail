package com.cocktail.home.domain;

import java.util.List;

import com.cocktail.home.api.HomeDtos.QuickEntry;

/**
 * 首页快捷入口（MVP 静态目录）。图标走 {@code /api/cocktail/assets/images/home/*.png}。
 */
public final class HomeCatalog {

    private static final String ICON_PREFIX = "/api/cocktail/assets/images/home/";

    private static final List<QuickEntry> QUICK_ENTRIES = List.of(
            new QuickEntry("chat", "AI 问答", "鸡尾酒知识库", icon("chat"), false, "chat"),
            new QuickEntry("workbench", "调配工作台", "材料 → 配方", icon("flask"), false, "workbench"),
            new QuickEntry("cabinet", "酒柜管理", "我的酒柜", icon("wine"), false, "cabinet"),
            new QuickEntry("more", "更多", "敬请期待", icon("grid"), true, "none")
    );

    private HomeCatalog() {
    }

    private static String icon(String name) {
        return ICON_PREFIX + name + ".png";
    }

    public static List<QuickEntry> quickEntries() {
        return QUICK_ENTRIES;
    }
}
