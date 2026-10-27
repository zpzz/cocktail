package com.cocktail.recipe.domain;

import java.util.Collections;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.cocktail.recipe.api.RecipeDtos.RecipeSummary;
import com.cocktail.recipe.mapper.KbRecipeMapper;
import com.cocktail.shared.exception.BusinessException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 配方目录（只读 kb_recipe），供首页今日推荐等。
 */
@Service
public class RecipeService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final KbRecipeMapper kbRecipeMapper;

    public RecipeService(KbRecipeMapper kbRecipeMapper) {
        this.kbRecipeMapper = kbRecipeMapper;
    }

    @Transactional(readOnly = true)
    public RecipeSummary random(boolean preferImage) {
        KbRecipe row = null;
        if (preferImage) {
            row = kbRecipeMapper.selectRandomWithImage();
        }
        if (row == null) {
            row = kbRecipeMapper.selectRandomAny();
        }
        if (row == null) {
            throw new BusinessException("RECIPE_NOT_FOUND", "暂无推荐配方", HttpStatus.NOT_FOUND);
        }
        return toSummary(row);
    }

    private static RecipeSummary toSummary(KbRecipe row) {
        return new RecipeSummary(
                row.getId(),
                blankToNull(row.getName()),
                blankToNull(row.getNameEn()),
                blankToNull(row.getCategory()),
                blankToNull(row.getBaseSpirit()),
                blankToNull(row.getGlass()),
                blankToNull(row.getMethod()),
                parseTags(row.getFlavorTags()),
                blankToNull(row.getImageUrl())
        );
    }

    private static List<String> parseTags(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptyList();
        }
        try {
            List<String> tags = MAPPER.readValue(raw, new TypeReference<List<String>>() {
            });
            return tags == null ? Collections.emptyList() : tags;
        } catch (Exception ignored) {
            return Collections.emptyList();
        }
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String s = value.trim();
        return s.isEmpty() ? null : s;
    }
}
