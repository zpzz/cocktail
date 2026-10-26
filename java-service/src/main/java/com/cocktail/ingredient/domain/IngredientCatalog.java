package com.cocktail.ingredient.domain;

import java.util.List;

import com.cocktail.ingredient.api.IngredientDtos.CategoryChild;
import com.cocktail.ingredient.api.IngredientDtos.CategoryNode;

/**
 * 材料一级分类（与 Python CATEGORIES 对齐）及基酒二级 Tab。
 * kb 暂无 sub_category 列时，用 {@link #inferSubCategory} 从名称猜。
 */
public final class IngredientCatalog {

    public static final List<String> CATEGORIES = List.of(
            "基酒", "利口酒", "糖浆", "果汁/软饮", "新鲜材料", "苦精", "装饰"
    );

    private static final List<CategoryChild> BASE_SPIRIT_CHILDREN = List.of(
            new CategoryChild("威士忌", "威士忌"),
            new CategoryChild("伏特加", "伏特加"),
            new CategoryChild("金酒", "金酒"),
            new CategoryChild("朗姆", "朗姆"),
            new CategoryChild("龙舌兰", "龙舌兰")
    );

    private IngredientCatalog() {
    }

    public static List<CategoryNode> categoryTree() {
        return CATEGORIES.stream()
                .map(c -> new CategoryNode(
                        c,
                        c,
                        "基酒".equals(c) ? BASE_SPIRIT_CHILDREN : List.of()
                ))
                .toList();
    }

    /**
     * kb 暂无 sub_category 列时，用名称启发式推断二级分类（仅展示用）。
     */
    public static String inferSubCategory(String category, String name, String nameEn) {
        if (!"基酒".equals(category)) {
            return null;
        }
        String text = ((name == null ? "" : name) + " " + (nameEn == null ? "" : nameEn)).toLowerCase();
        if (containsAny(text, "金酒", "gin")) {
            return "金酒";
        }
        if (containsAny(text, "伏特加", "vodka")) {
            return "伏特加";
        }
        if (containsAny(text, "朗姆", "rum")) {
            return "朗姆";
        }
        if (containsAny(text, "龙舌兰", "tequila", "mezcal")) {
            return "龙舌兰";
        }
        if (containsAny(text, "威士忌", "whisky", "whiskey", "bourbon", "rye")) {
            return "威士忌";
        }
        return null;
    }

    private static boolean containsAny(String text, String... keys) {
        for (String key : keys) {
            if (text.contains(key.toLowerCase())) {
                return true;
            }
        }
        return false;
    }
}
