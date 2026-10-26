package com.cocktail.ingredient.domain;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cocktail.ingredient.api.IngredientDtos.CategoriesResponse;
import com.cocktail.ingredient.api.IngredientDtos.IngredientItem;
import com.cocktail.ingredient.api.IngredientDtos.SearchResponse;
import com.cocktail.ingredient.mapper.KbIngredientMapper;
import com.cocktail.shared.exception.BusinessException;

/**
 * 材料目录（只读 kb_ingredient）。
 * 供酒柜「新增库存」与工作台「选材料」共用搜索。
 */
@Service
public class IngredientService {

    private final KbIngredientMapper kbIngredientMapper;

    public IngredientService(KbIngredientMapper kbIngredientMapper) {
        this.kbIngredientMapper = kbIngredientMapper;
    }

    public CategoriesResponse categories() {
        return new CategoriesResponse(IngredientCatalog.categoryTree());
    }

    /**
     * 模糊搜 name / name_en；不传 category 即全库。
     * q 支持多个关键词（空格 / 逗号 / 顿号等分隔），任一命中即可（OR）。
     * sub_category（如金酒）目前在内存里按名称启发式过滤。
     */
    @Transactional(readOnly = true)
    public SearchResponse search(String q, String category, String subCategory, int page, int size) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);

        LambdaQueryWrapper<KbIngredient> wrapper = new LambdaQueryWrapper<>();
        if (category != null && !category.isBlank()) {
            wrapper.eq(KbIngredient::getCategory, category.trim());
        }
        List<String> keywords = splitKeywords(q);
        if (!keywords.isEmpty()) {
            wrapper.and(w -> {
                boolean first = true;
                for (String keyword : keywords) {
                    final String k = keyword;
                    if (first) {
                        w.and(x -> x.like(KbIngredient::getName, k).or().like(KbIngredient::getNameEn, k));
                        first = false;
                    } else {
                        w.or(x -> x.like(KbIngredient::getName, k).or().like(KbIngredient::getNameEn, k));
                    }
                }
            });
        }
        wrapper.orderByAsc(KbIngredient::getName);

        Page<KbIngredient> result = kbIngredientMapper.selectPage(new Page<>(safePage, safeSize), wrapper);
        var items = result.getRecords().stream()
                .map(this::toItem)
                .filter(item -> matchesSubCategory(item, subCategory))
                .toList();

        long total = blankToNull(subCategory) == null ? result.getTotal() : items.size();
        return new SearchResponse(items, total, safePage, safeSize);
    }

    /**
     * 把「金酒,朗姆 伏特加」拆成多个关键词；去重、去空，单段最长保留 40 字。
     */
    static List<String> splitKeywords(String q) {
        if (q == null || q.isBlank()) {
            return List.of();
        }
        String[] parts = q.trim().split("[,，、|;；\\s]+");
        Set<String> out = new LinkedHashSet<>();
        for (String part : parts) {
            String t = part.trim();
            if (t.length() < 1) {
                continue;
            }
            if (t.length() > 40) {
                t = t.substring(0, 40);
            }
            out.add(t);
        }
        return new ArrayList<>(out);
    }

    @Transactional(readOnly = true)
    public KbIngredient requireById(Long id) {
        KbIngredient entity = kbIngredientMapper.selectById(id);
        if (entity == null) {
            throw new BusinessException("INGREDIENT_NOT_FOUND", "材料不存在", HttpStatus.NOT_FOUND);
        }
        return entity;
    }

    public IngredientItem toItem(KbIngredient entity) {
        String sub = IngredientCatalog.inferSubCategory(entity.getCategory(), entity.getName(), entity.getNameEn());
        return new IngredientItem(
                entity.getId(),
                entity.getName(),
                entity.getNameEn(),
                entity.getCategory(),
                sub,
                entity.getPrimaryUnit(),
                entity.getImageUrl()
        );
    }

    private boolean matchesSubCategory(IngredientItem item, String subCategory) {
        String want = blankToNull(subCategory);
        if (want == null || "全部".equals(want)) {
            return true;
        }
        return want.equals(item.subCategory());
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
