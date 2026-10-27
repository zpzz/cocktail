package com.cocktail.recipe.domain;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.cocktail.chat.client.AiServiceClient;
import com.cocktail.recipe.api.RecipeDtos.RecipeDetail;
import com.cocktail.recipe.api.RecipeDtos.RecipeEnrich;
import com.cocktail.recipe.api.RecipeDtos.RecipeIngredient;
import com.cocktail.recipe.api.RecipeDtos.RecipeStep;
import com.cocktail.recipe.api.RecipeDtos.RecipeSummary;
import com.cocktail.recipe.mapper.KbRecipeIngredientMapper;
import com.cocktail.recipe.mapper.KbRecipeMapper;
import com.cocktail.shared.exception.BusinessException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 配方目录（只读 kb_recipe），供首页今日推荐等。
 * 详情材料/步骤直接查库；风味摘要等走 AI enrich。
 */
@Service
public class RecipeService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final KbRecipeMapper kbRecipeMapper;
    private final KbRecipeIngredientMapper ingredientMapper;
    private final AiServiceClient aiServiceClient;

    public RecipeService(
            KbRecipeMapper kbRecipeMapper,
            KbRecipeIngredientMapper ingredientMapper,
            AiServiceClient aiServiceClient
    ) {
        this.kbRecipeMapper = kbRecipeMapper;
        this.ingredientMapper = ingredientMapper;
        this.aiServiceClient = aiServiceClient;
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

    @Transactional(readOnly = true)
    public RecipeDetail detail(long id) {
        KbRecipe row = kbRecipeMapper.selectDetailById(id);
        if (row == null) {
            throw new BusinessException("RECIPE_NOT_FOUND", "配方不存在", HttpStatus.NOT_FOUND);
        }
        List<KbRecipeIngredientRow> rows = ingredientMapper.selectByRecipeId(id);
        List<RecipeIngredient> ingredients = new ArrayList<>();
        for (KbRecipeIngredientRow r : rows) {
            ingredients.add(new RecipeIngredient(
                    blankToNull(r.getName()),
                    blankToNull(r.getNameEn()),
                    r.getAmount(),
                    blankToNull(r.getUnit()),
                    blankToNull(r.getImageUrl())
            ));
        }
        String instructions = blankToNull(row.getInstructions());
        return new RecipeDetail(
                row.getId(),
                blankToNull(row.getName()),
                blankToNull(row.getNameEn()),
                blankToNull(row.getCategory()),
                blankToNull(row.getBaseSpirit()),
                blankToNull(row.getGlass()),
                blankToNull(row.getMethod()),
                blankToNull(row.getMethodLabel()),
                blankToNull(row.getIceType()),
                blankToNull(row.getGarnish()),
                blankToNull(row.getAbvRange()),
                blankToNull(row.getDescription()),
                parseTags(row.getFlavorTags()),
                instructions,
                blankToNull(row.getImageUrl()),
                ingredients,
                splitSteps(instructions)
        );
    }

    /** 材料/步骤已在 detail；此处只补风味摘要、口感、难度、画像。 */
    @Transactional(readOnly = true)
    public RecipeEnrich enrich(long id) {
        RecipeDetail detail = detail(id);
        Map<String, Object> body = new HashMap<>();
        body.put("id", detail.id());
        body.put("name", detail.name());
        body.put("name_en", detail.nameEn());
        body.put("glass", detail.glass());
        body.put("method", detail.method());
        body.put("method_label", detail.methodLabel());
        body.put("ice_type", detail.iceType());
        body.put("garnish", detail.garnish());
        body.put("abv_range", detail.abvRange());
        body.put("description", detail.description());
        body.put("flavor_tags", detail.flavorTags() == null ? List.of() : detail.flavorTags());
        body.put("instructions", detail.instructions());
        List<Map<String, Object>> ingredients = new ArrayList<>();
        for (RecipeIngredient ing : detail.ingredients()) {
            Map<String, Object> row = new HashMap<>();
            row.put("name", ing.name());
            row.put("name_en", ing.nameEn());
            row.put("amount", ing.amount());
            row.put("unit", ing.unit());
            ingredients.add(row);
        }
        body.put("ingredients", ingredients);

        Map<String, Object> raw = aiServiceClient.recipeEnrich(body);
        return new RecipeEnrich(
                stringOrNull(raw.get("flavor_summary"), raw.get("flavorSummary")),
                stringOrNull(raw.get("abv_range"), raw.get("abvRange")),
                stringOrNull(raw.get("difficulty")),
                stringOrNull(raw.get("taste")),
                asMap(raw.get("flavor_profile") != null ? raw.get("flavor_profile") : raw.get("flavorProfile"))
        );
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

    private static List<RecipeStep> splitSteps(String instructions) {
        if (instructions == null || instructions.isBlank()) {
            return List.of();
        }
        List<RecipeStep> steps = new ArrayList<>();
        String[] lines = instructions.split("\\R+");
        int order = 1;
        for (String line : lines) {
            String text = line.trim();
            if (text.isEmpty()) {
                continue;
            }
            // 去掉常见「1.」「1、」前缀
            text = text.replaceFirst("^\\d+[\\.\\、\\)\\:：]\\s*", "");
            if (text.isEmpty()) {
                continue;
            }
            steps.add(new RecipeStep(order++, text));
        }
        return steps;
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

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        return null;
    }

    private static String stringOrNull(Object... values) {
        for (Object value : values) {
            if (value == null) {
                continue;
            }
            String s = String.valueOf(value).trim();
            if (!s.isEmpty() && !"null".equalsIgnoreCase(s)) {
                return s;
            }
        }
        return null;
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String s = value.trim();
        return s.isEmpty() ? null : s;
    }
}
