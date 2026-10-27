package com.cocktail.workbench.domain;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cocktail.chat.client.AiServiceClient;
import com.cocktail.config.CocktailProperties;
import com.cocktail.ingredient.domain.IngredientService;
import com.cocktail.ingredient.domain.KbIngredient;
import com.cocktail.ingredient.mapper.KbIngredientMapper;
import com.cocktail.shared.exception.BusinessException;
import com.cocktail.shared.security.SecurityUtils;
import com.cocktail.workbench.api.WorkbenchDtos.AnalyzeResponse;
import com.cocktail.workbench.api.WorkbenchDtos.FlavorProfile;
import com.cocktail.workbench.api.WorkbenchDtos.GenerateRequest;
import com.cocktail.workbench.api.WorkbenchDtos.GlassItem;
import com.cocktail.workbench.api.WorkbenchDtos.GlassView;
import com.cocktail.workbench.api.WorkbenchDtos.IngredientLine;
import com.cocktail.workbench.api.WorkbenchDtos.IngredientPatch;
import com.cocktail.workbench.api.WorkbenchDtos.ResetRequest;
import com.cocktail.workbench.api.WorkbenchDtos.SessionPatch;
import com.cocktail.workbench.api.WorkbenchDtos.SessionView;
import com.cocktail.workbench.mapper.WorkbenchSessionItemMapper;
import com.cocktail.workbench.mapper.WorkbenchSessionMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import reactor.core.publisher.Flux;

/**
 * 调配工作台：一局草稿的选杯 / 选料 / 技法 / 分析 / 生成。
 * <p>
 * 对外用 UUID {@code sessionId}；库表主键是 Long id，材料行外键 {@code session_pk} 指向该 id。
 */
@Service
public class WorkbenchService {

    private final WorkbenchSessionMapper sessionMapper;
    private final WorkbenchSessionItemMapper itemMapper;
    private final IngredientService ingredientService;
    private final KbIngredientMapper kbIngredientMapper;
    private final AiServiceClient aiServiceClient;
    private final ObjectMapper objectMapper;
    private final int maxIngredients;

    public WorkbenchService(
            WorkbenchSessionMapper sessionMapper,
            WorkbenchSessionItemMapper itemMapper,
            IngredientService ingredientService,
            KbIngredientMapper kbIngredientMapper,
            AiServiceClient aiServiceClient,
            ObjectMapper objectMapper,
            CocktailProperties properties
    ) {
        this.sessionMapper = sessionMapper;
        this.itemMapper = itemMapper;
        this.ingredientService = ingredientService;
        this.kbIngredientMapper = kbIngredientMapper;
        this.aiServiceClient = aiServiceClient;
        this.objectMapper = objectMapper;
        this.maxIngredients = properties.workbench().maxIngredients();
    }

    /** 开一局新草稿。 */
    @Transactional
    public SessionView create() {
        WorkbenchSession session = new WorkbenchSession();
        session.setSessionId(UUID.randomUUID().toString());
        session.setUserId(SecurityUtils.currentUserId());
        session.setStatus("draft");
        sessionMapper.insert(session);
        return toView(session, List.of());
    }

    @Transactional(readOnly = true)
    public SessionView get(String sessionId) {
        WorkbenchSession session = requireOwned(sessionId);
        return toView(session, loadItems(session.getId()));
    }

    /**
     * 按步更新草稿（只传变更字段即可）。
     * 改材料时全量覆盖已选列表，并校验数量上限与杯容量。
     */
    @Transactional
    public SessionView patch(String sessionId, SessionPatch patch) {
        WorkbenchSession session = requireOwned(sessionId);

        if (patch.glassCode() != null) {
            GlassItem glass = WorkbenchCatalog.findGlass(patch.glassCode())
                    .orElseThrow(() -> new BusinessException("INVALID_GLASS", "无效杯型"));
            session.setGlassCode(glass.code());
            session.setCapacityMl(glass.capacityMl());
        }

        List<WorkbenchSessionItem> items = loadItems(session.getId());
        if (patch.ingredients() != null) {
            items = replaceIngredients(session, patch.ingredients());
        }

        if (patch.method() != null) {
            session.setMethod(blankToNull(patch.method()));
        }
        if (patch.iceType() != null) {
            session.setIceType(blankToNull(patch.iceType()));
        }
        if (patch.garnishes() != null) {
            session.setGarnishes(writeJson(patch.garnishes()));
        }
        if (patch.feeling() != null) {
            session.setFeeling(blankToNull(patch.feeling()));
        }

        validateCapacity(session, items);
        sessionMapper.updateById(session);
        return toView(session, items);
    }

    @Transactional
    public SessionView reset(String sessionId, ResetRequest request) {
        WorkbenchSession session = requireOwned(sessionId);
        boolean keepGlass = request != null && Boolean.TRUE.equals(request.keepGlass());
        if (!keepGlass) {
            session.setGlassCode(null);
            session.setCapacityMl(null);
        }
        itemMapper.delete(new LambdaQueryWrapper<WorkbenchSessionItem>()
                .eq(WorkbenchSessionItem::getSessionPk, session.getId()));
        session.setMethod(null);
        session.setIceType(null);
        session.setGarnishes(null);
        session.setFeeling(null);
        session.setStatus("draft");
        sessionMapper.updateById(session);
        return toView(session, List.of());
    }

    /** 「酒方」判断成杯可行性：组 session 快照调 Python。 */
    @Transactional(readOnly = true)
    public AnalyzeResponse analyze(String sessionId) {
        WorkbenchSession session = requireOwned(sessionId);
        List<WorkbenchSessionItem> items = loadItems(session.getId());
        Map<String, Object> raw = aiServiceClient.workbenchAnalyze(toAiPayload(session, items));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> conflicts = raw.get("conflicts") instanceof List<?> list
                ? list.stream().filter(Map.class::isInstance).map(i -> (Map<String, Object>) i).toList()
                : List.of();
        List<String> suggestions = raw.get("suggestions") instanceof List<?> list
                ? list.stream().map(String::valueOf).toList()
                : List.of();
        Boolean feasible = raw.get("feasible") instanceof Boolean b ? b : null;
        String flavor = raw.get("flavor_summary") != null
                ? String.valueOf(raw.get("flavor_summary"))
                : (raw.get("flavorSummary") == null ? null : String.valueOf(raw.get("flavorSummary")));
        FlavorProfile flavorProfile = parseFlavorProfile(raw.get("flavor_profile"));
        if (flavorProfile == null) {
            flavorProfile = parseFlavorProfile(raw.get("flavorProfile"));
        }
        return new AnalyzeResponse(feasible, flavor, flavorProfile, conflicts, suggestions);
    }

    private static FlavorProfile parseFlavorProfile(Object raw) {
        if (!(raw instanceof Map<?, ?> map)) {
            return null;
        }
        return new FlavorProfile(
                asDouble(map.get("sweetness")),
                asDouble(map.get("alcohol")),
                asDouble(map.get("sourness")),
                asDouble(map.get("aroma")),
                asDouble(map.get("energy")),
                asDouble(map.get("difficulty"))
        );
    }

    private static Double asDouble(Object v) {
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        if (v instanceof String s) {
            try {
                return Double.parseDouble(s.trim());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    /** 生成特调：须已选杯且至少一种材料；返回 SSE 流。 */
    @Transactional
    public Flux<String> generate(String sessionId, GenerateRequest request) {
        WorkbenchSession session = requireOwned(sessionId);
        List<WorkbenchSessionItem> items = loadItems(session.getId());
        if (session.getGlassCode() == null) {
            throw new BusinessException("GLASS_REQUIRED", "请先选择酒杯");
        }
        if (items.isEmpty()) {
            throw new BusinessException("INGREDIENTS_REQUIRED", "请先选择材料");
        }
        if (request != null && request.feeling() != null) {
            session.setFeeling(blankToNull(request.feeling()));
        }
        session.setStatus("generated");
        sessionMapper.updateById(session);
        return aiServiceClient.streamWorkbenchGenerate(toAiPayload(session, items));
    }

    private List<WorkbenchSessionItem> replaceIngredients(WorkbenchSession session, List<IngredientPatch> patches) {
        if (patches.size() > maxIngredients) {
            throw new BusinessException("TOO_MANY_INGREDIENTS", "材料数量不能超过 " + maxIngredients);
        }
        itemMapper.delete(new LambdaQueryWrapper<WorkbenchSessionItem>()
                .eq(WorkbenchSessionItem::getSessionPk, session.getId()));
        List<WorkbenchSessionItem> items = new ArrayList<>();
        int index = 1;
        for (IngredientPatch patch : patches) {
            KbIngredient kb = ingredientService.requireById(patch.ingredientId());
            WorkbenchSessionItem item = new WorkbenchSessionItem();
            item.setSessionPk(session.getId());
            item.setIngredientId(kb.getId());
            item.setName(kb.getName());
            item.setAmount(patch.amount());
            item.setUnit(patch.unit() == null || patch.unit().isBlank()
                    ? (kb.getPrimaryUnit() == null || kb.getPrimaryUnit().isBlank() ? "ml" : kb.getPrimaryUnit())
                    : patch.unit());
            item.setOrderIndex(index++);
            itemMapper.insert(item);
            items.add(item);
        }
        return items;
    }

    private void validateCapacity(WorkbenchSession session, List<WorkbenchSessionItem> items) {
        if (session.getCapacityMl() == null) {
            return;
        }
        BigDecimal volume = volumeOf(items);
        if (volume.compareTo(BigDecimal.valueOf(session.getCapacityMl())) > 0) {
            throw new BusinessException("OVER_CAPACITY", "材料用量超过杯容量");
        }
    }

    private WorkbenchSession requireOwned(String sessionId) {
        WorkbenchSession session = sessionMapper.selectOne(new LambdaQueryWrapper<WorkbenchSession>()
                .eq(WorkbenchSession::getSessionId, sessionId)
                .eq(WorkbenchSession::getUserId, SecurityUtils.currentUserId()));
        if (session == null) {
            throw new BusinessException("SESSION_NOT_FOUND", "工作台会话不存在", HttpStatus.NOT_FOUND);
        }
        return session;
    }

    private List<WorkbenchSessionItem> loadItems(Long sessionPk) {
        return itemMapper.selectList(new LambdaQueryWrapper<WorkbenchSessionItem>()
                .eq(WorkbenchSessionItem::getSessionPk, sessionPk)
                .orderByAsc(WorkbenchSessionItem::getOrderIndex));
    }

    private SessionView toView(WorkbenchSession session, List<WorkbenchSessionItem> items) {
        GlassView glass = null;
        if (session.getGlassCode() != null) {
            glass = WorkbenchCatalog.findGlass(session.getGlassCode())
                    .map(g -> new GlassView(g.code(), g.name(), g.nameEn(), g.capacityMl(), g.imageUrl()))
                    .orElse(new GlassView(session.getGlassCode(), session.getGlassCode(), null,
                            session.getCapacityMl() == null ? 0 : session.getCapacityMl(), null));
        }
        Map<Long, String> imageById = loadImageUrls(items);
        List<IngredientLine> lines = items.stream()
                .map(i -> new IngredientLine(
                        i.getIngredientId(),
                        i.getName(),
                        i.getAmount(),
                        i.getUnit(),
                        imageById.get(i.getIngredientId())
                ))
                .toList();
        BigDecimal volume = volumeOf(items);
        Integer capacity = session.getCapacityMl();
        BigDecimal remaining = capacity == null ? null : BigDecimal.valueOf(capacity).subtract(volume);
        return new SessionView(
                session.getSessionId(),
                session.getStatus(),
                glass,
                lines,
                session.getMethod(),
                session.getIceType(),
                readJsonList(session.getGarnishes()),
                session.getFeeling(),
                volume,
                capacity,
                remaining,
                lines.size(),
                maxIngredients
        );
    }

    private Map<String, Object> toAiPayload(WorkbenchSession session, List<WorkbenchSessionItem> items) {
        Map<String, Object> body = new HashMap<>();
        body.put("session_id", session.getSessionId());
        body.put("glass_code", session.getGlassCode());
        body.put("capacity_ml", session.getCapacityMl());
        body.put("method", session.getMethod());
        body.put("ice_type", session.getIceType());
        body.put("garnishes", readJsonList(session.getGarnishes()));
        body.put("feeling", session.getFeeling());
        List<Map<String, Object>> ingredients = new ArrayList<>();
        for (WorkbenchSessionItem item : items) {
            Map<String, Object> row = new HashMap<>();
            row.put("ingredient_id", item.getIngredientId());
            row.put("name", item.getName());
            row.put("amount", item.getAmount());
            row.put("unit", item.getUnit());
            ingredients.add(row);
        }
        body.put("ingredients", ingredients);
        return body;
    }

    private static BigDecimal volumeOf(List<WorkbenchSessionItem> items) {
        return items.stream()
                .map(WorkbenchSessionItem::getAmount)
                .filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private String writeJson(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values == null ? List.of() : values);
        } catch (Exception ex) {
            throw new BusinessException("JSON_ERROR", "装饰字段序列化失败");
        }
    }

    private List<String> readJsonList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {
            });
        } catch (Exception ex) {
            return List.of();
        }
    }

    private Map<Long, String> loadImageUrls(List<WorkbenchSessionItem> items) {
        List<Long> ids = items.stream()
                .map(WorkbenchSessionItem::getIngredientId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return kbIngredientMapper.selectList(new LambdaQueryWrapper<KbIngredient>()
                        .in(KbIngredient::getId, ids))
                .stream()
                .filter(k -> k.getImageUrl() != null && !k.getImageUrl().isBlank())
                .collect(Collectors.toMap(KbIngredient::getId, KbIngredient::getImageUrl, (a, b) -> a));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
