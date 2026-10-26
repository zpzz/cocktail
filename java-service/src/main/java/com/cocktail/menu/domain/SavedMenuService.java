package com.cocktail.menu.domain;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cocktail.cabinet.api.CabinetDtos.MenuIngredient;
import com.cocktail.cabinet.api.CabinetDtos.MenuRecipe;
import com.cocktail.menu.api.SavedMenuDtos.SaveMenuRequest;
import com.cocktail.menu.api.SavedMenuDtos.SavedMenuDetail;
import com.cocktail.menu.api.SavedMenuDtos.SavedMenuSummary;
import com.cocktail.menu.mapper.SavedMenuItemMapper;
import com.cocktail.menu.mapper.SavedMenuMapper;
import com.cocktail.shared.exception.BusinessException;
import com.cocktail.shared.security.SecurityUtils;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class SavedMenuService {

    private static final DateTimeFormatter TITLE_FMT =
            DateTimeFormatter.ofPattern("M月d日 HH:mm").withZone(ZoneId.of("Asia/Shanghai"));

    private final SavedMenuMapper savedMenuMapper;
    private final SavedMenuItemMapper savedMenuItemMapper;
    private final ObjectMapper objectMapper;

    public SavedMenuService(
            SavedMenuMapper savedMenuMapper,
            SavedMenuItemMapper savedMenuItemMapper,
            ObjectMapper objectMapper
    ) {
        this.savedMenuMapper = savedMenuMapper;
        this.savedMenuItemMapper = savedMenuItemMapper;
        this.objectMapper = objectMapper;
    }

    /** 生成酒单后自动落库。 */
    @Transactional
    public SavedMenuDetail saveFromCabinet(List<MenuRecipe> recipes) {
        return saveInternal(null, recipes, "cabinet");
    }

    @Transactional
    public SavedMenuDetail save(SaveMenuRequest request) {
        if (request == null || request.recipes() == null || request.recipes().isEmpty()) {
            throw new BusinessException("EMPTY_MENU", "酒单不能为空");
        }
        return saveInternal(request.title(), request.recipes(), "cabinet");
    }

    @Transactional(readOnly = true)
    public List<SavedMenuSummary> listMine() {
        Long userId = SecurityUtils.currentUserId();
        List<SavedMenu> rows = savedMenuMapper.selectList(new LambdaQueryWrapper<SavedMenu>()
                .eq(SavedMenu::getUserId, userId)
                .orderByDesc(SavedMenu::getCreatedAt));
        return rows.stream()
                .map(m -> new SavedMenuSummary(
                        m.getId(), m.getTitle(), m.getSource(), m.getRecipeCount(), m.getCreatedAt()))
                .toList();
    }

    @Transactional(readOnly = true)
    public SavedMenuDetail getMine(Long id) {
        SavedMenu menu = requireOwned(id);
        List<SavedMenuItem> items = savedMenuItemMapper.selectList(new LambdaQueryWrapper<SavedMenuItem>()
                .eq(SavedMenuItem::getMenuId, menu.getId())
                .orderByAsc(SavedMenuItem::getOrderIndex));
        return toDetail(menu, items);
    }

    @Transactional
    public void deleteMine(Long id) {
        SavedMenu menu = requireOwned(id);
        savedMenuItemMapper.delete(new LambdaQueryWrapper<SavedMenuItem>()
                .eq(SavedMenuItem::getMenuId, menu.getId()));
        savedMenuMapper.deleteById(menu.getId());
    }

    private SavedMenuDetail saveInternal(String title, List<MenuRecipe> recipes, String source) {
        Long userId = SecurityUtils.currentUserId();
        List<MenuRecipe> safe = recipes == null ? List.of() : recipes.stream()
                .filter(r -> r != null && r.name() != null && !r.name().isBlank())
                .toList();
        if (safe.isEmpty()) {
            throw new BusinessException("EMPTY_MENU", "没有可保存的配方");
        }

        SavedMenu menu = new SavedMenu();
        menu.setUserId(userId);
        menu.setTitle(blankToNull(title) != null ? title.trim() : defaultTitle());
        menu.setSource(source == null || source.isBlank() ? "cabinet" : source);
        menu.setRecipeCount(safe.size());
        savedMenuMapper.insert(menu);

        List<SavedMenuItem> items = new ArrayList<>();
        int order = 1;
        for (MenuRecipe recipe : safe) {
            SavedMenuItem item = new SavedMenuItem();
            item.setMenuId(menu.getId());
            item.setRecipeId(recipe.recipeId() == null ? 0L : recipe.recipeId());
            item.setName(recipe.name());
            item.setNameEn(nullToEmpty(recipe.nameEn()));
            item.setCategory(nullToEmpty(recipe.category()));
            item.setBaseSpirit(nullToEmpty(recipe.baseSpirit()));
            item.setGlass(nullToEmpty(recipe.glass()));
            item.setMethod(nullToEmpty(recipe.method()));
            item.setImageUrl(nullToEmpty(recipe.imageUrl()));
            item.setMatchType(nullToEmpty(recipe.matchType()));
            item.setMissingJson(toJson(recipe.missing()));
            item.setSubstitutesJson(toJson(recipe.substitutes()));
            item.setInstructions(nullToEmpty(recipe.instructions()));
            item.setIngredientsJson(toJsonValue(recipe.ingredients() == null ? List.of() : recipe.ingredients()));
            item.setOrderIndex(order++);
            savedMenuItemMapper.insert(item);
            items.add(item);
        }
        return toDetail(menu, items);
    }

    private SavedMenu requireOwned(Long id) {
        Long userId = SecurityUtils.currentUserId();
        SavedMenu menu = savedMenuMapper.selectById(id);
        if (menu == null || !userId.equals(menu.getUserId())) {
            throw new BusinessException("MENU_NOT_FOUND", "酒单不存在", HttpStatus.NOT_FOUND);
        }
        return menu;
    }

    private SavedMenuDetail toDetail(SavedMenu menu, List<SavedMenuItem> items) {
        List<MenuRecipe> recipes = items.stream()
                .map(item -> new MenuRecipe(
                        item.getRecipeId(),
                        item.getName(),
                        item.getNameEn(),
                        item.getCategory(),
                        item.getBaseSpirit(),
                        item.getGlass(),
                        item.getMethod(),
                        item.getImageUrl(),
                        item.getMatchType(),
                        fromJson(item.getMissingJson()),
                        fromJson(item.getSubstitutesJson()),
                        item.getInstructions(),
                        fromIngredientsJson(item.getIngredientsJson())
                ))
                .toList();
        return new SavedMenuDetail(
                menu.getId(),
                menu.getTitle(),
                menu.getSource(),
                menu.getRecipeCount(),
                menu.getCreatedAt(),
                recipes
        );
    }

    private String defaultTitle() {
        return "酒柜酒单 · " + TITLE_FMT.format(java.time.Instant.now());
    }

    private String toJson(List<String> values) {
        return toJsonValue(values == null ? List.of() : values);
    }

    private String toJsonValue(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new BusinessException("JSON_ERROR", "材料字段序列化失败");
        }
    }

    private List<String> fromJson(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(raw, new TypeReference<List<String>>() {
            });
        } catch (Exception ex) {
            return Collections.emptyList();
        }
    }

    private List<MenuIngredient> fromIngredientsJson(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(raw, new TypeReference<List<MenuIngredient>>() {
            });
        } catch (Exception ex) {
            return Collections.emptyList();
        }
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
