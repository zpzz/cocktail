package com.cocktail.cabinet.domain;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cocktail.cabinet.api.CabinetDtos.AddItemRequest;
import com.cocktail.cabinet.api.CabinetDtos.AddRequest;
import com.cocktail.cabinet.api.CabinetDtos.CabinetItemView;
import com.cocktail.cabinet.api.CabinetDtos.ListResponse;
import com.cocktail.cabinet.api.CabinetDtos.MenuMeta;
import com.cocktail.cabinet.api.CabinetDtos.MenuRecipe;
import com.cocktail.cabinet.api.CabinetDtos.MenuRequest;
import com.cocktail.cabinet.api.CabinetDtos.MenuResponse;
import com.cocktail.cabinet.api.CabinetDtos.RecognizeMatched;
import com.cocktail.cabinet.api.CabinetDtos.RecognizeResponse;
import com.cocktail.cabinet.api.CabinetDtos.RecognizeUnmatched;
import com.cocktail.cabinet.api.CabinetDtos.Summary;
import com.cocktail.cabinet.api.CabinetDtos.UpdateRequest;
import com.cocktail.cabinet.mapper.CabinetItemMapper;
import com.cocktail.chat.client.AiServiceClient;
import com.cocktail.ingredient.domain.IngredientCatalog;
import com.cocktail.ingredient.domain.IngredientService;
import com.cocktail.ingredient.domain.KbIngredient;
import com.cocktail.ingredient.mapper.KbIngredientMapper;
import com.cocktail.shared.exception.BusinessException;
import com.cocktail.shared.security.SecurityUtils;

/**
 * 酒柜业务：库存 CRUD、拍照识别匹配、按库存生成酒单。
 * <p>
 * 库存只允许关联 {@code kb_ingredient} 里已有材料；识图/酒单的智能部分走 {@link AiServiceClient}。
 */
@Service
public class CabinetService {

    private final CabinetItemMapper cabinetItemMapper;
    private final IngredientService ingredientService;
    private final KbIngredientMapper kbIngredientMapper;
    private final AiServiceClient aiServiceClient;

    public CabinetService(
            CabinetItemMapper cabinetItemMapper,
            IngredientService ingredientService,
            KbIngredientMapper kbIngredientMapper,
            AiServiceClient aiServiceClient
    ) {
        this.cabinetItemMapper = cabinetItemMapper;
        this.ingredientService = ingredientService;
        this.kbIngredientMapper = kbIngredientMapper;
        this.aiServiceClient = aiServiceClient;
    }

    /** 当前用户库存列表：支持分类 + 名称模糊搜。 */
    @Transactional(readOnly = true)
    public ListResponse list(String q, String category, String subCategory, int page, int size) {
        Long userId = SecurityUtils.currentUserId();
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);

        LambdaQueryWrapper<CabinetItem> wrapper = new LambdaQueryWrapper<CabinetItem>()
                .eq(CabinetItem::getUserId, userId)
                .eq(category != null && !category.isBlank(), CabinetItem::getCategory, blankToNull(category))
                .eq(subCategory != null && !subCategory.isBlank() && !"全部".equals(subCategory),
                        CabinetItem::getSubCategory, blankToNull(subCategory))
                .and(q != null && !q.isBlank(), w -> {
                    String keyword = q.trim();
                    w.like(CabinetItem::getName, keyword)
                            .or().like(CabinetItem::getNameEn, keyword)
                            .or().like(CabinetItem::getCategory, keyword);
                })
                .orderByDesc(CabinetItem::getUpdatedAt);

        Page<CabinetItem> result = cabinetItemMapper.selectPage(new Page<>(safePage, safeSize), wrapper);
        List<CabinetItemView> items = result.getRecords().stream().map(this::toView).toList();
        Long totalCount = cabinetItemMapper.selectCount(new LambdaQueryWrapper<CabinetItem>()
                .eq(CabinetItem::getUserId, userId));
        return new ListResponse(new Summary(totalCount == null ? 0 : totalCount), items, result.getTotal());
    }

    /** 批量加库存；merge=true 时同材料累加数量，否则冲突 409。 */
    @Transactional
    public List<CabinetItemView> add(AddRequest request) {
        Long userId = SecurityUtils.currentUserId();
        boolean merge = request.merge() == null || request.merge();
        List<CabinetItemView> result = new ArrayList<>();
        for (AddItemRequest item : request.items()) {
            result.add(upsertOne(userId, item, merge));
        }
        return result;
    }

    @Transactional
    public CabinetItemView update(Long id, UpdateRequest request) {
        Long userId = SecurityUtils.currentUserId();
        CabinetItem item = requireOwned(id, userId);
        if (request.quantity() != null) {
            item.setQuantity(request.quantity());
        }
        if (request.unit() != null) {
            item.setUnit(request.unit());
        }
        if (request.quantityKnown() != null) {
            item.setQuantityKnown(request.quantityKnown());
        }
        cabinetItemMapper.updateById(item);
        return toView(item);
    }

    @Transactional
    public void delete(Long id) {
        Long userId = SecurityUtils.currentUserId();
        CabinetItem item = requireOwned(id, userId);
        cabinetItemMapper.deleteById(item.getId());
    }

    /** 组给 Python 的酒柜快照（对话 / 酒单共用）。 */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> snapshotForCurrentUser() {
        Long userId = SecurityUtils.currentUserId();
        List<CabinetItem> items = cabinetItemMapper.selectList(new LambdaQueryWrapper<CabinetItem>()
                .eq(CabinetItem::getUserId, userId)
                .orderByDesc(CabinetItem::getUpdatedAt));
        return items.stream().map(item -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", nullToEmpty(item.getName()));
            row.put("name_en", nullToEmpty(item.getNameEn()));
            row.put("category", nullToEmpty(item.getCategory()));
            row.put("quantity", item.getQuantity() == null ? 0 : item.getQuantity());
            row.put("unit", nullToEmpty(item.getUnit()));
            return row;
        }).toList();
    }

    /**
     * 拍照批量识别：Python 出标签 → 本方法在 kb 里模糊匹配。
     * 只返回 matched；未入库的在 unmatched，前端不可直接添加。
     */
    @Transactional(readOnly = true)
    public RecognizeResponse recognize(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("EMPTY_FILE", "请上传图片");
        }
        Long userId = SecurityUtils.currentUserId();
        List<Map<String, Object>> labels = aiServiceClient.recognizeIngredients(file);
        List<RecognizeMatched> matched = new ArrayList<>();
        List<RecognizeUnmatched> unmatched = new ArrayList<>();

        for (Map<String, Object> label : labels) {
            String name = stringVal(label.get("name"));
            String nameEn = stringVal(label.get("name_en"));
            Double confidence = label.get("confidence") instanceof Number n ? n.doubleValue() : null;
            KbIngredient hit = findBestMatch(name, nameEn);
            if (hit == null) {
                unmatched.add(new RecognizeUnmatched(name.isBlank() ? nameEn : name, "not_in_catalog"));
                continue;
            }
            boolean already = cabinetItemMapper.selectCount(new LambdaQueryWrapper<CabinetItem>()
                    .eq(CabinetItem::getUserId, userId)
                    .eq(CabinetItem::getIngredientId, hit.getId())) > 0;
            var item = ingredientService.toItem(hit);
            matched.add(new RecognizeMatched(
                    hit.getId(), item.name(), item.nameEn(), item.category(), item.subCategory(),
                    item.imageUrl(), confidence, already
            ));
        }
        return new RecognizeResponse(matched, unmatched);
    }

    /** 「用库存生成酒单」：默认 10 条、diversity=true。 */
    @Transactional(readOnly = true)
    public MenuResponse menu(MenuRequest request) {
        int limit = request.limit() == null ? 10 : Math.max(1, Math.min(request.limit(), 50));
        boolean diversity = request.diversity() == null || request.diversity();
        List<Map<String, Object>> snapshot = snapshotForCurrentUser();
        if (snapshot.isEmpty()) {
            throw new BusinessException("CABINET_EMPTY", "酒柜为空，请先添加材料");
        }
        List<MenuRecipe> recipes = aiServiceClient.cabinetMenu(snapshot, limit, diversity);
        return new MenuResponse(recipes, new MenuMeta(limit, recipes.size(), snapshot.size()));
    }

    private CabinetItemView upsertOne(Long userId, AddItemRequest req, boolean merge) {
        KbIngredient kb = ingredientService.requireById(req.ingredientId());
        CabinetItem existing = cabinetItemMapper.selectOne(new LambdaQueryWrapper<CabinetItem>()
                .eq(CabinetItem::getUserId, userId)
                .eq(CabinetItem::getIngredientId, kb.getId()));
        if (existing != null) {
            if (!merge) {
                throw new BusinessException("CABINET_CONFLICT", "材料已在酒柜中", HttpStatus.CONFLICT);
            }
            if (req.quantity() != null) {
                if (existing.getQuantity() != null && (req.quantityKnown() == null || req.quantityKnown())) {
                    existing.setQuantity(existing.getQuantity().add(req.quantity()));
                } else {
                    existing.setQuantity(req.quantity());
                }
            }
            if (req.unit() != null) {
                existing.setUnit(req.unit());
            }
            if (req.quantityKnown() != null) {
                existing.setQuantityKnown(req.quantityKnown());
            }
            cabinetItemMapper.updateById(existing);
            return toView(existing);
        }

        CabinetItem item = new CabinetItem();
        item.setUserId(userId);
        item.setIngredientId(kb.getId());
        item.setName(kb.getName());
        item.setNameEn(kb.getNameEn());
        item.setCategory(kb.getCategory());
        item.setSubCategory(IngredientCatalog.inferSubCategory(kb.getCategory(), kb.getName(), kb.getNameEn()));
        item.setQuantity(req.quantity());
        item.setUnit(req.unit() != null && !req.unit().isBlank() ? req.unit() : kb.getPrimaryUnit());
        item.setQuantityKnown(req.quantityKnown() == null || req.quantityKnown());
        cabinetItemMapper.insert(item);
        return toView(item);
    }

    private KbIngredient findBestMatch(String name, String nameEn) {
        String q = !nameEn.isBlank() ? nameEn : name;
        if (q.isBlank()) {
            return null;
        }
        Page<KbIngredient> page = kbIngredientMapper.selectPage(
                new Page<>(1, 5),
                new LambdaQueryWrapper<KbIngredient>()
                        .and(w -> w.like(KbIngredient::getName, q).or().like(KbIngredient::getNameEn, q))
                        .orderByAsc(KbIngredient::getName)
        );
        if (page.getRecords().isEmpty()) {
            return null;
        }
        String needle = q.toLowerCase();
        return page.getRecords().stream()
                .filter(i -> equalsIgnore(i.getNameEn(), needle) || equalsIgnore(i.getName(), needle)
                        || containsIgnore(i.getNameEn(), needle) || containsIgnore(i.getName(), needle))
                .findFirst()
                .orElse(page.getRecords().get(0));
    }

    private CabinetItem requireOwned(Long id, Long userId) {
        CabinetItem item = cabinetItemMapper.selectOne(new LambdaQueryWrapper<CabinetItem>()
                .eq(CabinetItem::getId, id)
                .eq(CabinetItem::getUserId, userId));
        if (item == null) {
            throw new BusinessException("CABINET_NOT_FOUND", "库存不存在", HttpStatus.NOT_FOUND);
        }
        return item;
    }

    private CabinetItemView toView(CabinetItem item) {
        KbIngredient kb = kbIngredientMapper.selectById(item.getIngredientId());
        String imageUrl = kb == null ? null : kb.getImageUrl();
        String status = item.isQuantityKnown()
                && item.getQuantity() != null
                && item.getQuantity().compareTo(BigDecimal.ZERO) <= 0
                ? "empty"
                : "in_stock";
        return new CabinetItemView(
                item.getId(), item.getIngredientId(), item.getName(), item.getNameEn(),
                item.getCategory(), item.getSubCategory(), item.getQuantity(), item.getUnit(),
                item.isQuantityKnown(), status, imageUrl, item.getCreatedAt()
        );
    }

    private static boolean equalsIgnore(String a, String b) {
        return a != null && a.equalsIgnoreCase(b);
    }

    private static boolean containsIgnore(String a, String b) {
        return a != null && a.toLowerCase().contains(b);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String stringVal(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
