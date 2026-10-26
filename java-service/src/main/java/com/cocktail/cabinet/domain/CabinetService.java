package com.cocktail.cabinet.domain;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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
import com.cocktail.menu.api.SavedMenuDtos.SavedMenuDetail;
import com.cocktail.menu.domain.SavedMenuService;
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
    private final SavedMenuService savedMenuService;

    public CabinetService(
            CabinetItemMapper cabinetItemMapper,
            IngredientService ingredientService,
            KbIngredientMapper kbIngredientMapper,
            AiServiceClient aiServiceClient,
            SavedMenuService savedMenuService
    ) {
        this.cabinetItemMapper = cabinetItemMapper;
        this.ingredientService = ingredientService;
        this.kbIngredientMapper = kbIngredientMapper;
        this.aiServiceClient = aiServiceClient;
        this.savedMenuService = savedMenuService;
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
     * 拍照批量识别：Python 出多标签 → 多关键词模糊匹配候选，供用户勾选。
     * 不自动选定；每个标签可命中多项，合并去重后返回。
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
        List<String> keywords = new ArrayList<>();
        Set<Long> seenIds = new LinkedHashSet<>();

        for (Map<String, Object> label : labels) {
            String name = stringVal(label.get("name"));
            String nameEn = stringVal(label.get("name_en"));
            Double confidence = label.get("confidence") instanceof Number n ? n.doubleValue() : null;
            String display = !name.isBlank() ? name : nameEn;
            if (!display.isBlank()) {
                keywords.add(display);
            }
            List<KbIngredient> hits = findCandidates(name, nameEn);
            if (hits.isEmpty()) {
                if (!display.isBlank()) {
                    unmatched.add(new RecognizeUnmatched(display, "not_in_catalog"));
                }
                continue;
            }
            for (KbIngredient hit : hits) {
                if (!seenIds.add(hit.getId())) {
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
        }
        return new RecognizeResponse(matched, unmatched, keywords);
    }

    /** 「用库存生成酒单」：默认 5 条、diversity=true；生成成功后自动写入「我的酒单」。 */
    @Transactional
    public MenuResponse menu(MenuRequest request) {
        int limit = request.limit() == null ? 5 : Math.max(1, Math.min(request.limit(), 50));
        boolean diversity = request.diversity() == null || request.diversity();
        List<Map<String, Object>> snapshot = snapshotForCurrentUser();
        if (snapshot.isEmpty()) {
            throw new BusinessException("CABINET_EMPTY", "酒柜为空，请先添加材料");
        }
        List<MenuRecipe> recipes = aiServiceClient.cabinetMenu(snapshot, limit, diversity);
        Long savedMenuId = null;
        if (!recipes.isEmpty()) {
            SavedMenuDetail saved = savedMenuService.saveFromCabinet(recipes);
            savedMenuId = saved.id();
        }
        return new MenuResponse(recipes, new MenuMeta(limit, recipes.size(), snapshot.size()), savedMenuId);
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

    /**
     * 中英文标签分别模糊检索，合并去重；每条标签可返回多项候选供用户挑选。
     */
    private List<KbIngredient> findCandidates(String name, String nameEn) {
        LinkedHashMap<Long, KbIngredient> byId = new LinkedHashMap<>();
        for (KbIngredient hit : lookupFuzzyCandidates(nameEn)) {
            byId.putIfAbsent(hit.getId(), hit);
        }
        for (KbIngredient hit : lookupFuzzyCandidates(name)) {
            byId.putIfAbsent(hit.getId(), hit);
        }
        // 单标签最多 12 条，避免候选过多
        return byId.values().stream().limit(12).toList();
    }

    /**
     * 模糊匹配：纠 OCR → 多 token OR 查库 → 返回达到阈值的候选（按相关度排序）。
     */
    private List<KbIngredient> lookupFuzzyCandidates(String raw) {
        String label = normalizeLabel(raw);
        if (label.isBlank()) {
            return List.of();
        }
        List<String> tokens = searchTokens(label);
        if (tokens.isEmpty()) {
            return List.of();
        }

        LambdaQueryWrapper<KbIngredient> wrapper = new LambdaQueryWrapper<>();
        wrapper.and(w -> {
            boolean first = true;
            for (String token : tokens) {
                final String t = token;
                if (first) {
                    w.and(x -> x.like(KbIngredient::getName, t).or().like(KbIngredient::getNameEn, t));
                    first = false;
                } else {
                    w.or(x -> x.like(KbIngredient::getName, t).or().like(KbIngredient::getNameEn, t));
                }
            }
        });

        Page<KbIngredient> page = kbIngredientMapper.selectPage(new Page<>(1, 60), wrapper);
        if (page.getRecords().isEmpty()) {
            return List.of();
        }

        record Ranked(KbIngredient item, double score) {
        }
        List<Ranked> ranked = new ArrayList<>();
        for (KbIngredient item : page.getRecords()) {
            double score = Math.max(
                    scoreMatch(label, normalizeLabel(item.getName())),
                    scoreMatch(label, normalizeLabel(item.getNameEn()))
            );
            if (score >= 0.45) {
                ranked.add(new Ranked(item, score));
            }
        }
        ranked.sort(Comparator
                .comparingDouble(Ranked::score).reversed()
                .thenComparingInt(r -> -nullToEmpty(r.item().getName()).length()));
        return ranked.stream().map(Ranked::item).toList();
    }

    /** OCR / 异体字归一，便于和 kb 对齐。 */
    static String normalizeLabel(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        String s = raw.trim().toLowerCase();
        s = s.replace("白加得", "百加得");
        s = s.replace("辣姆", "朗姆").replace("蓝姆", "朗姆").replace("兰姆", "朗姆");
        s = s.replace("rumm", "rum");
        s = s.replace(" ", "").replace("·", "").replace(".", "").replace("-", "");
        return s;
    }

    /**
     * 从识别标签抽出可检索片段：整句 + 常见酒类关键词（长的优先）。
     */
    static List<String> searchTokens(String label) {
        LinkedHashMap<String, Boolean> out = new LinkedHashMap<>();
        if (label.length() >= 2) {
            out.put(label, Boolean.TRUE);
        }
        for (String key : SPIRIT_KEYWORDS) {
            if (label.contains(key)) {
                out.put(key, Boolean.TRUE);
            }
        }
        // 英文：按非字母切词
        for (String part : label.split("[^a-z0-9]+")) {
            if (part.length() >= 3) {
                out.put(part, Boolean.TRUE);
            }
        }
        return new ArrayList<>(out.keySet());
    }

    /**
     * 0~1 分：相等 / 互相包含按长度比 / 否则编辑距离相似度。
     */
    static double scoreMatch(String label, String candidate) {
        if (label.isBlank() || candidate.isBlank()) {
            return 0;
        }
        if (label.equals(candidate)) {
            return 1.0;
        }
        if (label.contains(candidate)) {
            return 0.55 + 0.45 * ((double) candidate.length() / label.length());
        }
        if (candidate.contains(label)) {
            return 0.55 + 0.45 * ((double) label.length() / candidate.length());
        }
        int max = Math.max(label.length(), candidate.length());
        if (max == 0) {
            return 0;
        }
        int dist = levenshtein(label, candidate);
        double sim = 1.0 - ((double) dist / max);
        return sim >= 0.72 ? sim : 0;
    }

    static int levenshtein(String a, String b) {
        int n = a.length();
        int m = b.length();
        int[] prev = new int[m + 1];
        int[] cur = new int[m + 1];
        for (int j = 0; j <= m; j++) {
            prev[j] = j;
        }
        for (int i = 1; i <= n; i++) {
            cur[0] = i;
            char ca = a.charAt(i - 1);
            for (int j = 1; j <= m; j++) {
                int cost = ca == b.charAt(j - 1) ? 0 : 1;
                cur[j] = Math.min(Math.min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            int[] tmp = prev;
            prev = cur;
            cur = tmp;
        }
        return prev[m];
    }

    /** 长词在前，便于优先命中更具体的品类。 */
    private static final String[] SPIRIT_KEYWORDS = {
            "陈年黑朗姆酒", "深色朗姆酒", "黑朗姆酒", "金朗姆酒", "白朗姆酒", "椰子朗姆酒", "朗姆酒", "朗姆",
            "darkjamaicanrum", "darkrum", "whiterum", "goldrum", "lightrum", "agedrum", "rum",
            "孟买蓝宝石", "伦敦干金酒", "金酒", "杜松子酒", "gin",
            "伏特加", "vodka",
            "波本威士忌", "苏格兰威士忌", "爱尔兰威士忌", "威士忌", "波本", "bourbon", "whisky", "whiskey",
            "龙舌兰", "白龙舌兰", "银龙舌兰", "tequila",
            "白兰地", "干邑", "cognac", "brandy",
            "三重奏", "橙皮甜酒", "咖啡利口酒", "利口酒",
            "青柠汁", "柠檬汁", "糖浆", "苏打水", "汤力水",
    };

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
