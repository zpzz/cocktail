package com.cocktail.custom.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

public final class SavedCustomDtos {

    private SavedCustomDtos() {
    }

    @Schema(description = "特调列表项")
    public record CustomSummary(
            Long id,
            String name,
            String nameEn,
            String glass,
            String method,
            String imageUrl,
            String flavorSummary,
            Instant createdAt
    ) {
    }

    @Schema(description = "特调详情")
    public record CustomDetail(
            Long id,
            String name,
            String nameEn,
            String glass,
            String method,
            String iceType,
            List<String> garnishes,
            String feeling,
            String flavorSummary,
            String abvRange,
            String difficulty,
            String taste,
            Map<String, Object> flavorProfile,
            List<Map<String, Object>> ingredients,
            List<Map<String, Object>> steps,
            String instructions,
            String imageUrl,
            String workbenchSessionId,
            Instant createdAt
    ) {
    }

    @Schema(description = "保存特调请求")
    public record SaveCustomRequest(
            @Schema(description = "工作台 sessionId") String workbenchSessionId,
            @NotBlank @Schema(description = "酒名", requiredMode = Schema.RequiredMode.REQUIRED) String name,
            String nameEn,
            String glass,
            String method,
            String iceType,
            List<String> garnishes,
            String feeling,
            String flavorSummary,
            String abvRange,
            String difficulty,
            String taste,
            Map<String, Object> flavorProfile,
            List<Map<String, Object>> ingredients,
            List<Map<String, Object>> steps,
            String instructions,
            String imageUrl
    ) {
    }
}
