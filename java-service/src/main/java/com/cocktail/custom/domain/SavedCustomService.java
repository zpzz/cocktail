package com.cocktail.custom.domain;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cocktail.custom.api.SavedCustomDtos.CustomDetail;
import com.cocktail.custom.api.SavedCustomDtos.CustomSummary;
import com.cocktail.custom.api.SavedCustomDtos.SaveCustomRequest;
import com.cocktail.custom.mapper.SavedCustomMapper;
import com.cocktail.shared.exception.BusinessException;
import com.cocktail.shared.security.SecurityUtils;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class SavedCustomService {

    private final SavedCustomMapper savedCustomMapper;
    private final ObjectMapper objectMapper;

    public SavedCustomService(SavedCustomMapper savedCustomMapper, ObjectMapper objectMapper) {
        this.savedCustomMapper = savedCustomMapper;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public CustomDetail save(SaveCustomRequest request) {
        if (request == null || request.name() == null || request.name().isBlank()) {
            throw new BusinessException("EMPTY_CUSTOM", "特调名称不能为空");
        }
        SavedCustom row = new SavedCustom();
        row.setUserId(SecurityUtils.currentUserId());
        row.setWorkbenchSessionId(blankToNull(request.workbenchSessionId()));
        row.setName(request.name().trim());
        row.setNameEn(nullToEmpty(request.nameEn()));
        row.setGlass(nullToEmpty(request.glass()));
        row.setMethod(nullToEmpty(request.method()));
        row.setIceType(nullToEmpty(request.iceType()));
        row.setGarnishesJson(toJson(request.garnishes() == null ? List.of() : request.garnishes()));
        row.setFeeling(nullToEmpty(request.feeling()));
        row.setFlavorSummary(nullToEmpty(request.flavorSummary()));
        row.setAbvRange(nullToEmpty(request.abvRange()));
        row.setDifficulty(nullToEmpty(request.difficulty()));
        row.setTaste(nullToEmpty(request.taste()));
        row.setFlavorProfileJson(request.flavorProfile() == null
                ? null
                : toJson(request.flavorProfile()));
        row.setIngredientsJson(toJson(request.ingredients() == null ? List.of() : request.ingredients()));
        row.setStepsJson(toJson(request.steps() == null ? List.of() : request.steps()));
        row.setInstructions(nullToEmpty(request.instructions()));
        row.setImageUrl(nullToEmpty(request.imageUrl()));
        row.setSource("workbench");
        savedCustomMapper.insert(row);
        return toDetail(row);
    }

    @Transactional(readOnly = true)
    public List<CustomSummary> listMine() {
        Long userId = SecurityUtils.currentUserId();
        return savedCustomMapper.selectList(new LambdaQueryWrapper<SavedCustom>()
                        .eq(SavedCustom::getUserId, userId)
                        .orderByDesc(SavedCustom::getCreatedAt))
                .stream()
                .map(r -> new CustomSummary(
                        r.getId(), r.getName(), r.getNameEn(), r.getGlass(), r.getMethod(),
                        r.getImageUrl(), r.getFlavorSummary(), r.getCreatedAt()))
                .toList();
    }

    @Transactional(readOnly = true)
    public CustomDetail getMine(Long id) {
        return toDetail(requireOwned(id));
    }

    @Transactional
    public void deleteMine(Long id) {
        SavedCustom row = requireOwned(id);
        savedCustomMapper.deleteById(row.getId());
    }

    private SavedCustom requireOwned(Long id) {
        Long userId = SecurityUtils.currentUserId();
        SavedCustom row = savedCustomMapper.selectById(id);
        if (row == null || !userId.equals(row.getUserId())) {
            throw new BusinessException("CUSTOM_NOT_FOUND", "特调不存在", HttpStatus.NOT_FOUND);
        }
        return row;
    }

    private CustomDetail toDetail(SavedCustom row) {
        return new CustomDetail(
                row.getId(),
                row.getName(),
                row.getNameEn(),
                row.getGlass(),
                row.getMethod(),
                row.getIceType(),
                fromStringList(row.getGarnishesJson()),
                row.getFeeling(),
                row.getFlavorSummary(),
                blankToNull(row.getAbvRange()),
                blankToNull(row.getDifficulty()),
                blankToNull(row.getTaste()),
                fromMap(row.getFlavorProfileJson()),
                fromMapList(row.getIngredientsJson()),
                fromMapList(row.getStepsJson()),
                row.getInstructions(),
                row.getImageUrl(),
                row.getWorkbenchSessionId(),
                row.getCreatedAt()
        );
    }

    private Map<String, Object> fromMap(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(raw, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception ex) {
            return null;
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new BusinessException("JSON_ERROR", "特调字段序列化失败");
        }
    }

    private List<String> fromStringList(String raw) {
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

    private List<Map<String, Object>> fromMapList(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(raw, new TypeReference<List<Map<String, Object>>>() {
            });
        } catch (Exception ex) {
            return Collections.emptyList();
        }
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
