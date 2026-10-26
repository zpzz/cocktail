package com.cocktail.ingredient.domain;

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
        if (q != null && !q.isBlank()) {
            String keyword = q.trim();
            wrapper.and(w -> w.like(KbIngredient::getName, keyword)
                    .or()
                    .like(KbIngredient::getNameEn, keyword));
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
